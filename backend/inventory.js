import db from './db.js';

export function loadLots(runId) {
  const rows = db.prepare(`
    SELECT l.lot_id, l.product_id, l.received_day, l.expiry_day, SUM(m.quantity_change) AS qty
    FROM lots l
    JOIN inventory_movements m ON m.lot_id = l.lot_id
    WHERE l.run_id = ?
    GROUP BY l.lot_id
    HAVING SUM(m.quantity_change) > 0
  `).all(runId);

  const state = new Map();
  for (const r of rows) {
    if (!state.has(r.product_id)) state.set(r.product_id, []);
    state.get(r.product_id).push({
      lotId: Number(r.lot_id),
      productId: r.product_id,
      receivedDay: r.received_day,
      expiryDay: r.expiry_day,
      qty: r.qty
    });
  }
  for (const lots of state.values()) {
    lots.sort((a, b) => (a.expiryDay ?? Infinity) - (b.expiryDay ?? Infinity) || a.receivedDay - b.receivedDay);
  }
  return state;
}

export function totalUnits(state) {
  let total = 0;
  for (const lots of state.values()) for (const lot of lots) total += lot.qty;
  return total;
}

export function removeExpired(runId, day, state, unitCost) {
  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements (run_id, day, product_id, lot_id, movement_type, quantity_change)
    VALUES (?, ?, ?, ?, 'EXPIRY', ?)
  `);
  const removed = [];
  for (const [productId, lots] of state) {
    const keep = [];
    for (const lot of lots) {
      if (lot.expiryDay !== null && lot.expiryDay <= day) {
        insertMovement.run(runId, day, productId, lot.lotId, -lot.qty);
        removed.push({ productId, lotId: lot.lotId, qty: lot.qty, valueCents: lot.qty * unitCost[productId] });
      } else {
        keep.push(lot);
      }
    }
    state.set(productId, keep);
  }
  return removed;
}

const byExpiry = (a, b) =>
  (a.expiryDay ?? Infinity) - (b.expiryDay ?? Infinity) || a.receivedDay - b.receivedDay;

export function receiveOrders(runId, day, state, products) {
  const shelfLife = Object.fromEntries(products.map((p) => [p.id, p.perishable ? p.shelfLifeDays : null]));

  const orders = db.prepare(`
    SELECT o.order_id, o.product_id, o.qty_ordered
    FROM replenishment_orders o
    WHERE o.run_id = ? AND o.arrival_day = ? AND o.qty_ordered > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory_movements m
        WHERE m.order_id = o.order_id AND m.movement_type = 'RECEIPT'
      )
    ORDER BY o.order_id
  `).all(runId, day);

  const insertLot = db.prepare(`
    INSERT INTO lots (run_id, product_id, source, received_day, expiry_day, qty_received)
    VALUES (?, ?, 'REPLENISHMENT', ?, ?, ?)
  `);
  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements (run_id, day, product_id, lot_id, movement_type, quantity_change, order_id)
    VALUES (?, ?, ?, ?, 'RECEIPT', ?, ?)
  `);

  const received = [];
  for (const o of orders) {
    const expiryDay = shelfLife[o.product_id] === null ? null : day + shelfLife[o.product_id];
    const lotId = Number(insertLot.run(runId, o.product_id, day, expiryDay, o.qty_ordered).lastInsertRowid);
    insertMovement.run(runId, day, o.product_id, lotId, o.qty_ordered, Number(o.order_id));

    if (!state.has(o.product_id)) state.set(o.product_id, []);
    const lots = state.get(o.product_id);
    lots.push({ lotId, productId: o.product_id, receivedDay: day, expiryDay, qty: o.qty_ordered });
    lots.sort(byExpiry);

    received.push({ orderId: Number(o.order_id), productId: o.product_id, qty: o.qty_ordered, lotId });
  }
  return received;
}
