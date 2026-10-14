import db from './db.js';

export function estimateDemand(runId, day, rules) {
  const firstDay = Math.max(1, day - rules.demandWindowDays + 1);
  const daysInWindow = day - firstDay + 1;
  const totals = new Map();
  const add = (rows) => {
    for (const r of rows) totals.set(r.product_id, (totals.get(r.product_id) ?? 0) + r.units);
  };

  add(db.prepare(`
    SELECT ti.product_id, SUM(ti.quantity) AS units
    FROM transaction_items ti
    JOIN transactions t ON t.transaction_id = ti.transaction_id
    WHERE t.run_id = ? AND t.day BETWEEN ? AND ?
    GROUP BY ti.product_id
  `).all(runId, firstDay, day));

  if (rules.countLostSalesAsDemand) {
    add(db.prepare(`
      SELECT product_id, SUM(quantity_short) AS units
      FROM lost_sales
      WHERE run_id = ? AND day BETWEEN ? AND ?
      GROUP BY product_id
    `).all(runId, firstDay, day));
  }

  const perDay = new Map();
  for (const [productId, units] of totals) perDay.set(productId, units / daysInWindow);
  return perDay;
}

export function usableUnits(state, productId, tomorrow) {
  let total = 0;
  for (const lot of state.get(productId) || []) {
    if (lot.expiryDay === null || lot.expiryDay > tomorrow) total += lot.qty;
  }
  return total;
}

export function expiringLots(state, day, rules) {
  const cutoff = day + rules.expiryWarningDaysAhead;
  const found = [];
  for (const lots of state.values()) {
    for (const lot of lots) {
      if (lot.expiryDay !== null && lot.expiryDay <= cutoff) {
        found.push({ productId: lot.productId, lotId: lot.lotId, qty: lot.qty, expiryDay: lot.expiryDay });
      }
    }
  }
  return found;
}

export function assess(state, products, demand, day, rules) {
  const tomorrow = day + 1;
  return products.map((p) => {
    const perDay = demand.get(p.id) ?? 0;
    let onHand = 0;
    for (const lot of state.get(p.id) || []) onHand += lot.qty;
    const usable = usableUnits(state, p.id, tomorrow);
    const lowDays = p.perishable && p.shelfLifeDays === 1
      ? rules.lowStockCoverDaysOneDayShelfLife
      : rules.lowStockCoverDays;
    const soldOut = onHand === 0;
    const low = !soldOut && usable < lowDays * perDay;
    const slow = day >= rules.slowMoverFromDay && usable > 0 && usable > rules.slowMoverCoverDays * perDay;
    return {
      productId: p.id,
      perDay,
      onHand,
      usable,
      lowDays,
      coverDays: perDay > 0 ? usable / perDay : null,
      soldOut,
      low,
      slow
    };
  });
}

export function detectEvents(rows, expiring, previous, day, rules) {
  const events = [];
  const next = new Map();

  for (const r of rows) {
    const before = previous.get(r.productId) ?? { status: 'OK', slow: false };
    const status = r.soldOut ? 'SOLD_OUT' : r.low ? 'LOW' : 'OK';
    const cover = r.coverDays === null ? 'no recent demand' : r.coverDays.toFixed(1) + ' days of cover';

    if (status !== 'OK' && (status !== before.status || !rules.logOnEntryOnly)) {
      if (status === 'SOLD_OUT') {
        events.push({
          day, productId: r.productId, type: 'SOLD_OUT', quantity: null,
          detail: 'no units left at close; demand ' + r.perDay.toFixed(1) + ' per day'
        });
      } else {
        events.push({
          day, productId: r.productId, type: 'LOW_STOCK', quantity: r.usable,
          detail: r.usable + ' units usable tomorrow = ' + cover + '; trigger is below ' + r.lowDays + ' days at ' + r.perDay.toFixed(1) + ' per day'
        });
      }
    }

    if (r.slow && (!before.slow || !rules.logOnEntryOnly)) {
      events.push({
        day, productId: r.productId, type: 'SLOW_MOVER', quantity: r.usable,
        detail: r.usable + ' units usable tomorrow = ' + cover + '; trigger is above ' + rules.slowMoverCoverDays + ' days; reordering suppressed'
      });
    }

    next.set(r.productId, { status, slow: r.slow });
  }

  for (const lot of expiring) {
    events.push({
      day, productId: lot.productId, type: 'EXPIRY_WARNING', quantity: lot.qty,
      detail: lot.qty + ' units in lot ' + lot.lotId + ' are removed when day ' + lot.expiryDay + ' opens; excluded from usable stock'
    });
  }

  return { events, next };
}

export function planOrders(rows, products, cashCents, rules, trimmed = new Set()) {
  if (!Number.isInteger(cashCents) || cashCents < 0) {
    throw new Error('cash must be a non-negative whole number of cents');
  }
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const wanted = [];
  for (const r of rows) {
    if (r.slow) continue;
    if (!r.soldOut && !r.low) continue;
    const p = byId[r.productId];
    const baseDays = p.perishable
      ? Math.min(rules.perishableTargetCoverDays, p.shelfLifeDays)
      : rules.targetCoverDays;
    const targetDays = trimmed.has(r.productId) ? Math.min(baseDays, rules.slowMoverTargetCoverDays) : baseDays;
    const targetUnits = Math.ceil(targetDays * r.perDay - 1e-9);
    const qtyWanted = targetUnits - r.usable;
    if (qtyWanted <= 0) continue;
    wanted.push({ row: r, product: p, targetDays, targetUnits, qtyWanted });
  }

  wanted.sort((a, b) => (a.row.coverDays ?? 0) - (b.row.coverDays ?? 0) || a.product.id.localeCompare(b.product.id));

  let cash = cashCents;
  const orders = [];
  for (const w of wanted) {
    const unitCostCents = w.product.costCents;
    const qtyOrdered = Math.min(w.qtyWanted, Math.floor(cash / unitCostCents));
    const costCents = qtyOrdered * unitCostCents;
    orders.push({
      productId: w.product.id,
      reason: w.row.soldOut ? 'SOLD_OUT' : 'LOW_STOCK',
      perDay: w.row.perDay,
      usable: w.row.usable,
      coverDays: w.row.coverDays,
      targetDays: w.targetDays,
      targetUnits: w.targetUnits,
      qtyWanted: w.qtyWanted,
      qtyOrdered,
      unitCostCents,
      costCents,
      cashBeforeCents: cash,
      constrained: qtyOrdered < w.qtyWanted
    });
    cash -= costCents;
  }

  return { orders, cashAfterCents: cash };
}
