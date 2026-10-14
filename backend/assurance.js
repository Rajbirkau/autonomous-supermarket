import db from './db.js';

const one = (sql, ...args) => db.prepare(sql).get(...args);

export function commercialAssurance(runId) {
  const run = one('SELECT run_id AS runId, label, status, seed, simulation_days AS days, opening_cash_cents AS openingCash FROM runs WHERE run_id = ?', runId);
  const checks = [];
  const add = (group, name, pass, detail, values) => checks.push({ group, name, status: pass ? 'PASS' : 'FAIL', detail, values });

  const counts = {
    days: one('SELECT COUNT(*) AS n FROM run_daily WHERE run_id = ?', runId).n,
    customers: one('SELECT COUNT(*) AS n FROM customers WHERE run_id = ?', runId).n,
    transactions: one('SELECT COUNT(*) AS n FROM transactions WHERE run_id = ?', runId).n,
    transactionItems: one('SELECT COUNT(*) AS n FROM transaction_items WHERE run_id = ?', runId).n,
    inventoryMovements: one('SELECT COUNT(*) AS n FROM inventory_movements WHERE run_id = ?', runId).n,
    lots: one('SELECT COUNT(*) AS n FROM lots WHERE run_id = ?', runId).n,
    replenishmentOrders: one('SELECT COUNT(*) AS n FROM replenishment_orders WHERE run_id = ?', runId).n,
    cashEntries: one('SELECT COUNT(*) AS n FROM cash_ledger WHERE run_id = ?', runId).n,
    brainEvents: one('SELECT COUNT(*) AS n FROM brain_events WHERE run_id = ?', runId).n,
    lostSales: one('SELECT COUNT(*) AS n FROM lost_sales WHERE run_id = ?', runId).n
  };

  const distinctDays = one('SELECT COUNT(DISTINCT day) AS n FROM run_daily WHERE run_id = ? AND day BETWEEN 1 AND ?', runId, run.days).n;
  add('History', 'Days retained', counts.days === run.days && distinctDays === run.days, counts.days + ' of ' + run.days + ' daily records retained', { retained: counts.days, expected: run.days });
  add('History', 'Run completed', run.status === 'COMPLETED', 'run status is ' + run.status, { status: run.status });
  const emptyTables = ['transactions', 'inventoryMovements', 'replenishmentOrders', 'brainEvents'].filter((k) => counts[k] === 0);
  add('History', 'Audit records present', emptyTables.length === 0, emptyTables.length === 0 ? 'transaction, inventory, replenishment and Store Brain records all retained' : 'no records for: ' + emptyTables.join(', '), counts);

  const mv = Object.fromEntries(
    db.prepare('SELECT movement_type AS t, SUM(quantity_change) AS n FROM inventory_movements WHERE run_id = ? GROUP BY movement_type').all(runId).map((r) => [r.t, r.n])
  );
  const opening = mv.OPENING ?? 0;
  const received = mv.RECEIPT ?? 0;
  const sold = -(mv.SALE ?? 0);
  const expired = -(mv.EXPIRY ?? 0);
  const closingLedger = opening + received - sold - expired;
  const closingStock = one('SELECT SUM(quantity_change) AS n FROM inventory_movements WHERE run_id = ?', runId).n;
  const closingReported = one('SELECT closing_stock_units AS n FROM run_daily WHERE run_id = ? AND day = ?', runId, run.days)?.n ?? null;
  const soldItems = one('SELECT COALESCE(SUM(quantity), 0) AS n FROM transaction_items WHERE run_id = ?', runId).n;
  const receivedLots = one("SELECT COALESCE(SUM(qty_received), 0) AS n FROM lots WHERE run_id = ? AND source = 'REPLENISHMENT'", runId).n;

  add('Inventory', 'Stock equation', closingLedger === closingReported && closingLedger === closingStock,
    'opening ' + opening + ' + received ' + received + ' - sold ' + sold + ' - expired ' + expired + ' = ' + closingLedger + '; reported closing stock ' + closingReported,
    { opening, received, sold, expired, closing: closingLedger, reportedClosing: closingReported });
  add('Inventory', 'Units sold match transactions', sold === soldItems, sold + ' units in the ledger, ' + soldItems + ' units on transaction lines', { ledger: sold, transactionLines: soldItems });
  add('Inventory', 'Receipts match orders and lots', received === receivedLots && received === one('SELECT COALESCE(SUM(qty_ordered), 0) AS n FROM replenishment_orders WHERE run_id = ? AND placed_day < ?', runId, run.days).n,
    received + ' units received, ' + receivedLots + ' units in replenishment lots', { received, lots: receivedLots });

  const negProducts = one('SELECT COUNT(*) AS n FROM (SELECT product_id FROM inventory_movements WHERE run_id = ? GROUP BY product_id HAVING SUM(quantity_change) < 0)', runId).n;
  const negLots = one('SELECT COUNT(*) AS n FROM (SELECT lot_id FROM inventory_movements WHERE run_id = ? GROUP BY lot_id HAVING SUM(quantity_change) < 0)', runId).n;
  add('Inventory', 'Negative stock', negProducts === 0 && negLots === 0, negProducts + ' products and ' + negLots + ' lots ever below zero at close', { products: negProducts, lots: negLots });

  const runningNegative = one(`
    SELECT COUNT(*) AS n FROM (
      SELECT SUM(quantity_change) OVER (PARTITION BY lot_id ORDER BY movement_id) AS running
      FROM inventory_movements WHERE run_id = ?
    ) WHERE running < 0
  `, runId).n;
  add('Inventory', 'Overselling', runningNegative === 0, runningNegative + ' movements took a lot below zero (a sale of stock that was not there)', { violations: runningNegative });

  const expiredSales = one("SELECT COUNT(*) AS n FROM inventory_movements m JOIN lots l ON l.lot_id = m.lot_id WHERE m.run_id = ? AND m.movement_type = 'SALE' AND l.expiry_day IS NOT NULL AND l.expiry_day <= m.day", runId).n;
  add('Inventory', 'Expired-product sales', expiredSales === 0, expiredSales + ' sales drew from a lot at or past its expiry day', { violations: expiredSales });

  const badDays = one('SELECT COUNT(*) AS n FROM run_daily d WHERE d.run_id = ? AND d.revenue_cents <> COALESCE((SELECT SUM(total_cents) FROM transactions x WHERE x.run_id = d.run_id AND x.day = d.day), 0)', runId).n;
  const dailySum = one('SELECT COALESCE(SUM(revenue_cents), 0) AS n FROM run_daily WHERE run_id = ?', runId).n;
  const txSum = one('SELECT COALESCE(SUM(total_cents), 0) AS n FROM transactions WHERE run_id = ?', runId).n;
  const itemSum = one('SELECT COALESCE(SUM(line_total_cents), 0) AS n FROM transaction_items WHERE run_id = ?', runId).n;
  const salesCash = one("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM cash_ledger WHERE run_id = ? AND entry_type = 'SALES'", runId).n;
  add('Revenue', 'Daily revenue equals its transactions', badDays === 0, badDays + ' of ' + counts.days + ' days differ from the sum of their transaction totals', { mismatchedDays: badDays });
  add('Revenue', '60-day revenue equals the sum of daily revenue', dailySum === txSum && dailySum === itemSum && dailySum === salesCash,
    'daily ' + dailySum + ' | transactions ' + txSum + ' | lines ' + itemSum + ' | cash ledger ' + salesCash + ' (cents)', { daily: dailySum, transactions: txSum, lines: itemSum, cashLedger: salesCash });

  const orderSpend = one('SELECT COALESCE(SUM(cost_cents), 0) AS n FROM replenishment_orders WHERE run_id = ?', runId).n;
  const ledgerSpend = -one("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM cash_ledger WHERE run_id = ? AND entry_type = 'REPLENISHMENT'", runId).n;
  const dailySpend = one('SELECT COALESCE(SUM(replenishment_spend_cents), 0) AS n FROM run_daily WHERE run_id = ?', runId).n;
  const expectedClosing = run.openingCash + dailySum - orderSpend;
  const ledgerClosing = one('SELECT balance_after_cents AS n FROM cash_ledger WHERE run_id = ? ORDER BY entry_id DESC LIMIT 1', runId).n;
  const dailyClosing = one('SELECT closing_cash_cents AS n FROM run_daily WHERE run_id = ? AND day = ?', runId, run.days)?.n ?? null;
  add('Cash', 'Cash equation', expectedClosing === ledgerClosing && expectedClosing === dailyClosing,
    'opening ' + run.openingCash + ' + revenue ' + dailySum + ' - spend ' + orderSpend + ' = ' + expectedClosing + '; ledger ' + ledgerClosing + '; reported ' + dailyClosing + ' (cents)',
    { opening: run.openingCash, revenue: dailySum, spend: orderSpend, expected: expectedClosing, ledger: ledgerClosing, reported: dailyClosing });
  add('Cash', 'Spend recorded consistently', orderSpend === ledgerSpend && orderSpend === dailySpend, 'orders ' + orderSpend + ' | cash ledger ' + ledgerSpend + ' | daily ' + dailySpend + ' (cents)', { orders: orderSpend, ledger: ledgerSpend, daily: dailySpend });

  const overspent = one('SELECT COUNT(*) AS n FROM replenishment_orders WHERE run_id = ? AND cost_cents > cash_before_cents', runId).n;
  add('Cash', 'No order exceeds available cash', overspent === 0, overspent + ' orders cost more than the cash available when placed', { violations: overspent });

  const balanceGaps = one(`
    SELECT COUNT(*) AS n FROM (
      SELECT balance_after_cents - amount_cents AS before,
             LAG(balance_after_cents) OVER (ORDER BY entry_id) AS prev
      FROM cash_ledger WHERE run_id = ?
    ) WHERE prev IS NOT NULL AND before <> prev
  `, runId).n;
  add('Cash', 'Cash ledger is continuous', balanceGaps === 0, balanceGaps + ' ledger entries do not follow on from the previous balance (unexplained cash movements)', { gaps: balanceGaps });

  const lateOrders = one('SELECT COUNT(*) AS n FROM replenishment_orders WHERE run_id = ? AND (placed_day >= ? OR arrival_day <> placed_day + 1)', runId, run.days).n;
  add('Operations', 'Lead time and Day 60 rule', lateOrders === 0, lateOrders + ' orders placed on the final day or not arriving the next day', { violations: lateOrders });

  const failed = checks.filter((c) => c.status === 'FAIL');
  return {
    run,
    counts,
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length, overall: failed.length === 0 ? 'PASS' : 'FAIL' },
    exceptions: failed.map((c) => c.group + ': ' + c.name + ' - ' + c.detail)
  };
}
