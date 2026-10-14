import db from './db.js';

const one = (sql, ...args) => db.prepare(sql).get(...args);
const many = (sql, ...args) => db.prepare(sql).all(...args);

const EVENT_TYPES = ['LOW_STOCK', 'SOLD_OUT', 'EXPIRY_WARNING', 'EXPIRY_REMOVAL', 'SLOW_MOVER', 'REPLENISHMENT', 'CASH_CONSTRAINED'];

export function inventoryOperations(runId) {
  const counts = Object.fromEntries(
    many('SELECT event_type AS type, COUNT(*) AS n FROM brain_events WHERE run_id = ? GROUP BY event_type', runId).map((r) => [r.type, r.n])
  );
  const eventCounts = EVENT_TYPES.map((type) => ({ type, count: counts[type] ?? 0 }));

  const stockouts = many(`
    SELECT e.product_id AS productId, p.name AS name, COUNT(*) AS events,
           (SELECT COALESCE(SUM(l.quantity_short), 0) FROM lost_sales l WHERE l.run_id = e.run_id AND l.product_id = e.product_id) AS lostUnits,
           (SELECT COALESCE(SUM(l.quantity_short * l.unit_price_cents), 0) FROM lost_sales l WHERE l.run_id = e.run_id AND l.product_id = e.product_id) AS lostRevenueCents,
           (SELECT COUNT(DISTINCT l.day) FROM lost_sales l WHERE l.run_id = e.run_id AND l.product_id = e.product_id) AS daysWithLostSales
    FROM brain_events e JOIN run_products p ON p.run_id = e.run_id AND p.product_id = e.product_id
    WHERE e.run_id = ? AND e.event_type = 'SOLD_OUT'
    GROUP BY e.product_id ORDER BY events DESC, e.product_id
  `, runId);

  const lowStock = many(`
    SELECT e.product_id AS productId, p.name AS name, COUNT(*) AS events
    FROM brain_events e JOIN run_products p ON p.run_id = e.run_id AND p.product_id = e.product_id
    WHERE e.run_id = ? AND e.event_type = 'LOW_STOCK'
    GROUP BY e.product_id ORDER BY events DESC, e.product_id LIMIT 10
  `, runId);

  const writeOffByProduct = many(`
    SELECT m.product_id AS productId, p.name AS name, p.category AS category,
           -SUM(m.quantity_change) AS units, -SUM(m.quantity_change * p.unit_cost_cents) AS valueCents
    FROM inventory_movements m JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? AND m.movement_type = 'EXPIRY'
    GROUP BY m.product_id ORDER BY valueCents DESC, m.product_id
  `, runId);

  const writeOffByCategory = many(`
    SELECT p.category AS category, -SUM(m.quantity_change) AS units, -SUM(m.quantity_change * p.unit_cost_cents) AS valueCents
    FROM inventory_movements m JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? AND m.movement_type = 'EXPIRY'
    GROUP BY p.category ORDER BY valueCents DESC
  `, runId);

  const writeOffBySource = many(`
    SELECT l.source AS source, -SUM(m.quantity_change) AS units, -SUM(m.quantity_change * p.unit_cost_cents) AS valueCents
    FROM inventory_movements m
    JOIN lots l ON l.lot_id = m.lot_id
    JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? AND m.movement_type = 'EXPIRY'
    GROUP BY l.source
  `, runId);

  const slowMovers = many(`
    SELECT e.day AS day, e.product_id AS productId, p.name AS name, e.quantity AS usableUnits, e.detail AS detail
    FROM brain_events e JOIN run_products p ON p.run_id = e.run_id AND p.product_id = e.product_id
    WHERE e.run_id = ? AND e.event_type = 'SLOW_MOVER' ORDER BY e.day, e.product_id
  `, runId);

  const replenishmentByCategory = many(`
    SELECT p.category AS category, COUNT(*) AS orders, SUM(o.qty_ordered) AS units, SUM(o.cost_cents) AS spendCents
    FROM replenishment_orders o JOIN run_products p ON p.run_id = o.run_id AND p.product_id = o.product_id
    WHERE o.run_id = ? AND o.qty_ordered > 0
    GROUP BY p.category ORDER BY spendCents DESC
  `, runId);

  const replenishment = one(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(qty_ordered), 0) AS units, COALESCE(SUM(cost_cents), 0) AS spendCents,
           COALESCE(SUM(CASE WHEN qty_ordered < qty_wanted THEN 1 ELSE 0 END), 0) AS constrainedOrders
    FROM replenishment_orders WHERE run_id = ?
  `, runId);

  const inventoryByCategory = many(`
    SELECT p.category AS category,
           SUM(CASE WHEN m.movement_type = 'OPENING' THEN m.quantity_change * p.unit_cost_cents ELSE 0 END) AS openingCents,
           SUM(m.quantity_change * p.unit_cost_cents) AS closingCents,
           SUM(m.quantity_change) AS closingUnits
    FROM inventory_movements m JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? GROUP BY p.category ORDER BY openingCents DESC
  `, runId);

  const cashConstrained = many(`
    SELECT day, product_id AS productId, quantity AS shortUnits, detail
    FROM brain_events WHERE run_id = ? AND event_type = 'CASH_CONSTRAINED' ORDER BY day, event_id LIMIT 20
  `, runId);

  const cash = one('SELECT MIN(closing_cash_cents) AS lowest FROM run_daily WHERE run_id = ?', runId);

  const chain = stockouts.length === 0 ? null : (() => {
    const top = stockouts[0];
    const first = one("SELECT event_id AS eventId, day, detail FROM brain_events WHERE run_id = ? AND product_id = ? AND event_type = 'SOLD_OUT' ORDER BY day LIMIT 1", runId, top.productId);
    const action = one(`
      SELECT o.order_id AS orderId, o.placed_day AS placedDay, o.arrival_day AS arrivalDay, o.qty_ordered AS qty, o.cost_cents AS costCents
      FROM replenishment_orders o WHERE o.run_id = ? AND o.product_id = ? AND o.placed_day = ?
    `, runId, top.productId, first.day);
    const outcome = action ? one(`
      SELECT day, COALESCE(SUM(quantity_change), 0) AS received
      FROM inventory_movements WHERE run_id = ? AND product_id = ? AND movement_type = 'RECEIPT' AND order_id = ?
    `, runId, top.productId, action.orderId) : null;
    return { productId: top.productId, name: top.name, condition: first, action, outcome };
  })();

  return {
    eventCounts,
    stockouts,
    lowStock,
    writeOffByProduct: writeOffByProduct.slice(0, 10),
    writeOffByCategory,
    writeOffBySource,
    slowMovers,
    replenishment,
    replenishmentByCategory,
    inventoryByCategory,
    cash: { lowestClosingCents: cash.lowest, constrainedEvents: counts.CASH_CONSTRAINED ?? 0, constrainedOrders: replenishment.constrainedOrders, samples: cashConstrained },
    chain
  };
}
