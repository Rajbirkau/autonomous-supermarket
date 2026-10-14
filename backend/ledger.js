import db from './db.js';

export function currentCash(runId) {
  const row = db.prepare(
    'SELECT balance_after_cents AS cash FROM cash_ledger WHERE run_id = ? ORDER BY entry_id DESC LIMIT 1'
  ).get(runId);
  if (!row) throw new Error('no cash ledger for run ' + runId);
  return row.cash;
}

export function recordEvents(runId, events) {
  const insert = db.prepare(`
    INSERT INTO brain_events (run_id, day, product_id, event_type, quantity, order_id, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of events) {
    insert.run(runId, e.day, e.productId, e.type, e.quantity, e.orderId ?? null, e.detail);
  }
}

export function recordOrders(runId, day, plan) {
  if (plan.orders.length === 0) return [];

  const cash = currentCash(runId);
  if (plan.orders[0].cashBeforeCents !== cash) {
    throw new Error('plan was made for cash of ' + plan.orders[0].cashBeforeCents + ' but the ledger balance is ' + cash);
  }

  const insertOrder = db.prepare(`
    INSERT INTO replenishment_orders (run_id, product_id, placed_day, arrival_day, qty_wanted, qty_ordered, unit_cost_cents, cost_cents, cash_before_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCash = db.prepare(`
    INSERT INTO cash_ledger (run_id, day, entry_type, amount_cents, balance_after_cents, order_id)
    VALUES (?, ?, 'REPLENISHMENT', ?, ?, ?)
  `);

  const placed = [];
  const events = [];
  let balance = cash;

  for (const o of plan.orders) {
    const orderId = Number(insertOrder.run(
      runId, o.productId, day, day + 1, o.qtyWanted, o.qtyOrdered, o.unitCostCents, o.costCents, o.cashBeforeCents
    ).lastInsertRowid);

    if (o.qtyOrdered > 0) {
      balance -= o.costCents;
      insertCash.run(runId, day, -o.costCents, balance, orderId);
      events.push({
        day, productId: o.productId, type: 'REPLENISHMENT', quantity: o.qtyOrdered, orderId,
        detail: (o.reason === 'SOLD_OUT' ? 'sold out' : 'low stock') + ': ' + o.usable + ' usable units against demand of ' + o.perDay.toFixed(1) +
          ' per day; target ' + o.targetDays + ' days = ' + o.targetUnits + ' units; ordered ' + o.qtyOrdered + ' of ' + o.qtyWanted +
          ' wanted for A$' + (o.costCents / 100).toFixed(2) + ', arrives day ' + (day + 1)
      });
    }

    if (o.constrained) {
      events.push({
        day, productId: o.productId, type: 'CASH_CONSTRAINED', quantity: o.qtyWanted - o.qtyOrdered, orderId,
        detail: 'cash of A$' + (o.cashBeforeCents / 100).toFixed(2) + ' could not fund ' + o.qtyWanted + ' units at A$' +
          (o.unitCostCents / 100).toFixed(2) + '; ordered ' + o.qtyOrdered + ', short ' + (o.qtyWanted - o.qtyOrdered)
      });
    }

    placed.push({ ...o, orderId });
  }

  recordEvents(runId, events);
  return placed;
}
