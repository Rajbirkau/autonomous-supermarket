import db from './db.js';

const one = (sql, ...args) => db.prepare(sql).get(...args);
const many = (sql, ...args) => db.prepare(sql).all(...args);
const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);
const money = (cents) => 'A$' + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x, digits = 1) => (100 * x).toFixed(digits) + '%';
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function commercialFindings(runId) {
  const run = one('SELECT opening_cash_cents AS openingCash, simulation_days AS days, config_json AS config FROM runs WHERE run_id = ?', runId);
  const rules = JSON.parse(run.config).brainRules;
  const totals = one('SELECT SUM(revenue_cents) AS revenue, SUM(cogs_cents) AS cogs, SUM(units_sold) AS units, SUM(expired_value_cents) AS writeOff FROM run_daily WHERE run_id = ?', runId);
  const lostUnits = one('SELECT COALESCE(SUM(quantity_short), 0) AS n FROM lost_sales WHERE run_id = ?', runId).n;
  const fillRate = totals.units / (totals.units + lostUnits);
  const grossProfit = totals.revenue - totals.cogs;

  const top = one(`
    SELECT l.product_id AS productId, p.name AS name, p.category AS category, p.shelf_life_days AS shelf,
           SUM(l.quantity_short) AS units, SUM(l.quantity_short * l.unit_price_cents) AS revenue,
           SUM(l.quantity_short * (l.unit_price_cents - p.unit_cost_cents)) AS profit, COUNT(DISTINCT l.day) AS lostDays
    FROM lost_sales l JOIN run_products p ON p.run_id = l.run_id AND p.product_id = l.product_id
    WHERE l.run_id = ? GROUP BY l.product_id ORDER BY units DESC LIMIT 1
  `, runId);
  if (!top) throw new Error('this run has no lost sales, so the written findings would need to be revised');

  const evening = one(`
    SELECT COALESCE(SUM(l.quantity_short), 0) AS n FROM lost_sales l JOIN customers c ON c.customer_id = l.customer_id
    WHERE l.run_id = ? AND l.product_id = ? AND c.hour >= 17
  `, runId, top.productId).n;
  const wo = one(`
    SELECT COALESCE(-SUM(m.quantity_change), 0) AS units, COALESCE(-SUM(m.quantity_change * p.unit_cost_cents), 0) AS value, COUNT(DISTINCT m.day) AS days
    FROM inventory_movements m JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? AND m.product_id = ? AND m.movement_type = 'EXPIRY'
  `, runId, top.productId);
  const both = one(`
    SELECT COUNT(*) AS n FROM (
      SELECT day FROM lost_sales WHERE run_id = ? AND product_id = ?
      INTERSECT
      SELECT day FROM inventory_movements WHERE run_id = ? AND product_id = ? AND movement_type = 'EXPIRY'
    )
  `, runId, top.productId, runId, top.productId).n;
  const categoryWriteOff = one(`
    SELECT COALESCE(-SUM(m.quantity_change * p.unit_cost_cents), 0) AS value
    FROM inventory_movements m JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? AND m.movement_type = 'EXPIRY' AND p.category = ?
  `, runId, top.category).value;
  const targetDays = Math.min(rules.perishableTargetCoverDays, top.shelf);

  const weekdayRows = many(`
    SELECT d.weekday AS weekday,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM lost_sales l WHERE l.run_id = d.run_id AND l.day = d.day AND l.product_id = ?) THEN 1 ELSE 0 END) AS lostDays,
           COALESCE(SUM((SELECT -SUM(m.quantity_change) FROM inventory_movements m WHERE m.run_id = d.run_id AND m.day = d.day AND m.product_id = ? AND m.movement_type = 'EXPIRY')), 0) AS expiredUnits
    FROM run_daily d WHERE d.run_id = ? GROUP BY d.weekday ORDER BY d.weekday
  `, top.productId, top.productId, runId);
  const expiredTotal = sum(weekdayRows, 'expiredUnits');
  const topExpiry = [...weekdayRows].sort((a, b) => b.expiredUnits - a.expiredUnits).slice(0, 2).sort((a, b) => a.weekday - b.weekday);
  const lostMonToFri = sum(weekdayRows.filter((r) => r.weekday >= 1 && r.weekday <= 5), 'lostDays');
  const expiryByDay = weekdayRows.map((r) => dayNames[r.weekday] + ' ' + r.expiredUnits).join(', ');
  const lostByDay = weekdayRows.map((r) => dayNames[r.weekday] + ' ' + r.lostDays).join(', ');

  const finding1 = {
    title: 'Short-life products cannot be matched to daily demand',
    observation: top.name + ' (' + top.productId + ') had lost sales on ' + top.lostDays + ' of 60 days and expired unsold stock on ' + wo.days + ' days, with both on ' + both +
      ' days. Expired units were concentrated on ' + topExpiry.map((r) => dayNames[r.weekday]).join(' and ') + ' (' + pct(sum(topExpiry, 'expiredUnits') / expiredTotal) + ' of the ' + expiredTotal +
      ' units expired), and ' + lostMonToFri + ' of the ' + top.lostDays + ' days with lost sales fell on Monday to Friday. The ' + top.category + ' category accounts for ' +
      money(categoryWriteOff) + ' of the ' + money(totals.writeOff) + ' total write-off (' + pct(categoryWriteOff / totals.writeOff) + ').',
    evidence: [
      'Lost sales: ' + top.units + ' units, ' + money(top.revenue) + ' of revenue and ' + money(top.profit) + ' of gross profit; ' + pct(evening / top.units) + ' of the lost units were requested at 17:00 or later.',
      'Write-off: ' + wo.units + ' units, ' + money(wo.value) + ' at cost.',
      'Units expired by weekday: ' + expiryByDay + '.',
      'Days with lost sales by weekday: ' + lostByDay + '.',
      'Overall fill rate across all products was ' + pct(fillRate, 2) + ', so this is a concentrated problem, not a general one.'
    ],
    diagnosis: 'The Store Brain orders a product up to ' + targetDays + ' day(s) of a flat 7-day average demand, which ignores the weekday pattern declared in the model. A product with a shelf life of ' + top.shelf +
      ' day(s) cannot carry stock over, so on quiet days the order is too large and leftovers expire at opening, and before busy weekdays it is too small and the product sells out by evening. On ' + both +
      ' days both happened together: the previous day\'s delivery was too large and the current day\'s too small.',
    implication: 'The waste (' + money(wo.value) + ' at cost) and the missed gross profit (' + money(top.profit) + ') are small next to ' + money(totals.revenue) +
      ' of revenue, but they show that a single nightly order sized to a flat average cannot fit a short-life product to daily demand, and the pattern would matter more for higher-value fresh lines.',
    recommendation: 'Give short-life products a weekday-specific demand estimate so that orders shrink before quiet days and grow before busy ones, then trial end-of-day markdowns on units that would otherwise expire. Both need real sales data to tune.',
    limitation: 'The weekday pattern is built into the model by design, each weekday has only 8 or 9 days in a single run so the split is indicative and not statistically tested, customers who find an item sold out are assumed to leave without substituting or returning, markdowns are not modelled, and there is one delivery per day.'
  };

  const inv = many(`
    SELECT p.category AS category,
           SUM(CASE WHEN m.movement_type = 'OPENING' THEN m.quantity_change * p.unit_cost_cents ELSE 0 END) AS opening,
           SUM(m.quantity_change * p.unit_cost_cents) AS closing,
           SUM(CASE WHEN m.movement_type = 'OPENING' THEN m.quantity_change ELSE 0 END) AS openingUnits,
           -SUM(CASE WHEN m.movement_type = 'SALE' THEN m.quantity_change ELSE 0 END) AS soldUnits
    FROM inventory_movements m JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? GROUP BY p.category
  `, runId).map((r) => ({ ...r, fall: r.opening - r.closing })).sort((a, b) => b.fall - a.fall);
  const opening = sum(inv, 'opening');
  const closing = sum(inv, 'closing');
  const fallers = inv.slice(0, 2);
  const fallersOpening = sum(fallers, 'opening');
  const fallersClosing = sum(fallers, 'closing');
  const names = fallers.map((r) => r.category).join(' and ');
  const covers = fallers.map((r) => (r.openingUnits / (r.soldUnits / run.days)).toFixed(1));
  const steady = one('SELECT AVG(closing_inventory_value_cents) AS avg, MIN(closing_inventory_value_cents) AS low, MAX(closing_inventory_value_cents) AS high FROM run_daily WHERE run_id = ? AND day BETWEEN 10 AND ?', runId, run.days - 1);
  const at = (day) => one('SELECT closing_inventory_value_cents AS n FROM run_daily WHERE run_id = ? AND day = ?', runId, day).n;
  const inside = closing >= steady.low && closing <= steady.high;

  const finding2 = {
    title: 'The Store Brain ran the store on far less stock than the opening range',
    observation: 'Inventory at cost averaged ' + money(steady.avg) + ' over Days 10 to ' + (run.days - 1) + ' (low ' + money(steady.low) + ', high ' + money(steady.high) + '), ' + pct(1 - steady.avg / opening) +
      ' below the opening ' + money(opening) + ', while the fill rate stayed at ' + pct(fillRate, 2) + '.',
    evidence: [
      'Inventory fell to ' + money(at(10)) + ' by the close of Day 10 and ' + money(at(20)) + ' by Day 20. The Day ' + run.days + ' close of ' + money(closing) + ' is ' + (inside ? 'inside' : 'outside') +
        ' the Days 10 to ' + (run.days - 1) + ' range' + (inside ? ', so the drop is not an end-of-run artefact.' : ', so the final day is not typical.'),
      names + ' fell from ' + money(fallersOpening) + ' to ' + money(fallersClosing) + ' by the close of Day ' + run.days + ', which is ' + pct(sum(fallers, 'fall') / (opening - closing)) + ' of the total fall.',
      names + ' made up ' + pct(fallersOpening / opening) + ' of the opening inventory cost. At the run\'s average sales rate their opening stock covered about ' + covers.join(' and ') + ' days of sales, against a ' + rules.targetCoverDays + '-day ordering target.',
      'The Brain reorders only when usable stock is under ' + rules.lowStockCoverDays + ' days of demand and orders up to ' + rules.targetCoverDays + ' days for shelf-stable products.'
    ],
    diagnosis: 'The opening quantities for those lines were sized well above the ' + rules.targetCoverDays + '-day ordering target, so once the Brain took over they sold down and were refilled only when usable stock fell under the low-stock trigger.',
    implication: 'Stock this size was not needed to keep shelves full. Because unused inventory budget does not become cash in this scenario, it is not a cash saving in the model, but it means the real up-front purchase and storage exposure was larger than the trading needed.',
    recommendation: 'Plan the opening range closer to the level the Brain sustained (store-wide average inventory of ' + money(steady.avg) + ', which is ' + pct(steady.avg / opening) + ' of the opening cost, at a fill rate of ' + pct(fillRate, 2) +
      '), starting with ' + names + ', subject to real supplier minimum order quantities and delivery lead times.',
    limitation: 'The model assumes a one-day lead time, unlimited supplier stock and no minimum order quantities, so real suppliers may justify a larger opening buffer, and the demand behind the cover figures is uncalibrated.'
  };

  const cats = many(`
    SELECT p.category AS category, SUM(ti.line_total_cents - ti.quantity * ti.unit_cost_cents) AS gp, SUM(ti.line_total_cents) AS revenue
    FROM transaction_items ti JOIN run_products p ON p.run_id = ti.run_id AND p.product_id = ti.product_id
    WHERE ti.run_id = ? GROUP BY p.category ORDER BY gp DESC
  `, runId).map((r) => ({ ...r, margin: r.gp / r.revenue }));
  const topTwo = cats.slice(0, 2);
  const bestMargin = [...cats].sort((a, b) => b.margin - a.margin)[0];
  const worstMargin = [...cats].sort((a, b) => a.margin - b.margin)[0];
  const cash = one('SELECT MIN(closing_cash_cents) AS lowest, MAX(replenishment_spend_cents) AS biggest FROM run_daily WHERE run_id = ?', runId);
  const closingCash = one('SELECT closing_cash_cents AS n FROM run_daily WHERE run_id = ? ORDER BY day DESC LIMIT 1', runId).n;
  const constrained = one("SELECT COUNT(*) AS n FROM brain_events WHERE run_id = ? AND event_type = 'CASH_CONSTRAINED'", runId).n;

  const finding3 = {
    title: 'Gross profit leans towards the highest-margin categories, the margin is unvalidated, and the cash limit was never tested',
    observation: 'Gross profit was ' + money(grossProfit) + ' (' + pct(grossProfit / totals.revenue) + ' of revenue). ' + topTwo.map((c) => c.category).join(' and ') + ' earned ' +
      pct(sum(topTwo, 'gp') / grossProfit) + ' of it from ' + pct(sum(topTwo, 'revenue') / totals.revenue) + ' of revenue, and cash never limited replenishment (' + constrained + ' cash-constrained events).',
    evidence: [
      'Category margins ranged from ' + pct(worstMargin.margin) + ' (' + worstMargin.category + ') to ' + pct(bestMargin.margin) + ' (' + bestMargin.category + '). ' +
        worstMargin.category + ' made ' + pct(worstMargin.revenue / totals.revenue) + ' of revenue but ' + pct(worstMargin.gp / grossProfit) + ' of gross profit.',
      'Closing cash was ' + money(closingCash) + ' against ' + money(run.openingCash) + ' at the start; the lowest closing balance was ' + money(cash.lowest) + ' and the largest one-day order spend was ' + money(cash.biggest) + '.'
    ],
    diagnosis: 'Prices and costs come from the scenario catalogue, which was drafted with AI assistance and applies a small-format convenience premium: the blended margin was ' + pct(grossProfit / totals.revenue) +
      ', against the roughly 28 percent gross margin reported for the large Australian supermarket chains (a benchmark for large supermarkets, not small convenience stores). Cash was never short because daily sales revenue was far larger than daily replenishment spend.',
    implication: 'The profit and closing cash are gross figures before rent, wages, utilities and other overheads, so they are not net profit, and the cash-constraint rule was never exercised by the recorded history, so its behaviour under real pressure is untested.',
    recommendation: 'Validate prices and supplier costs with a short real trading pilot, then re-run the simulation with calibrated margins, an overhead line and a lower opening cash figure to test the cash rule.',
    limitation: 'No small-format convenience benchmark was used for the margin comparison, popularity scores are hand-assigned, and overheads are outside the model boundary.'
  };

  return [finding1, finding2, finding3];
}
