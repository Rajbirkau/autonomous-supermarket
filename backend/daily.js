import db from './db.js';

const one = (sql, ...args) => db.prepare(sql).get(...args);
const many = (sql, ...args) => db.prepare(sql).all(...args);

export function dailyReport(runId, day) {
  const summary = one(`
    SELECT day, weekday, weather, event_name AS eventName, customers, transactions, units_sold AS units,
           revenue_cents AS revenueCents, cogs_cents AS cogsCents, expired_units AS expiredUnits,
           expired_value_cents AS expiredValueCents, replenishment_spend_cents AS spendCents,
           opening_cash_cents AS openingCashCents, closing_cash_cents AS closingCashCents,
           closing_stock_units AS closingStockUnits, closing_inventory_value_cents AS closingInventoryCents
    FROM run_daily WHERE run_id = ? AND day = ?
  `, runId, day);
  if (!summary) return null;

  const customersByHour = many('SELECT hour, COUNT(*) AS customers FROM customers WHERE run_id = ? AND day = ? GROUP BY hour ORDER BY hour', runId, day);
  const salesByHour = many('SELECT hour, COUNT(*) AS transactions, SUM(total_cents) AS revenueCents FROM transactions WHERE run_id = ? AND day = ? GROUP BY hour ORDER BY hour', runId, day);
  const byType = many('SELECT customer_type AS type, COUNT(*) AS customers FROM customers WHERE run_id = ? AND day = ? GROUP BY customer_type ORDER BY customers DESC', runId, day);
  const byMission = many('SELECT mission, COUNT(*) AS customers FROM customers WHERE run_id = ? AND day = ? GROUP BY mission ORDER BY customers DESC', runId, day);

  const topProducts = many(`
    SELECT ti.product_id AS productId, p.name AS name, SUM(ti.quantity) AS units, SUM(ti.line_total_cents) AS revenueCents
    FROM transaction_items ti
    JOIN transactions t ON t.transaction_id = ti.transaction_id
    JOIN run_products p ON p.run_id = ti.run_id AND p.product_id = ti.product_id
    WHERE t.run_id = ? AND t.day = ?
    GROUP BY ti.product_id ORDER BY units DESC, ti.product_id LIMIT 10
  `, runId, day);

  const lostSales = many(`
    SELECT l.product_id AS productId, p.name AS name, SUM(l.quantity_short) AS units, SUM(l.quantity_short * l.unit_price_cents) AS revenueCents
    FROM lost_sales l JOIN run_products p ON p.run_id = l.run_id AND p.product_id = l.product_id
    WHERE l.run_id = ? AND l.day = ?
    GROUP BY l.product_id ORDER BY units DESC
  `, runId, day);

  const events = many(`
    SELECT event_id AS eventId, event_type AS type, product_id AS productId, quantity, order_id AS orderId, detail
    FROM brain_events WHERE run_id = ? AND day = ? ORDER BY event_id
  `, runId, day);

  const orders = many(`
    SELECT o.order_id AS orderId, o.product_id AS productId, p.name AS name, o.qty_wanted AS qtyWanted, o.qty_ordered AS qtyOrdered,
           o.cost_cents AS costCents, o.cash_before_cents AS cashBeforeCents, o.arrival_day AS arrivalDay
    FROM replenishment_orders o JOIN run_products p ON p.run_id = o.run_id AND p.product_id = o.product_id
    WHERE o.run_id = ? AND o.placed_day = ? ORDER BY o.order_id
  `, runId, day);

  const receipts = many(`
    SELECT m.product_id AS productId, p.name AS name, m.quantity_change AS quantity, m.order_id AS orderId
    FROM inventory_movements m JOIN run_products p ON p.run_id = m.run_id AND p.product_id = m.product_id
    WHERE m.run_id = ? AND m.day = ? AND m.movement_type = 'RECEIPT' ORDER BY m.movement_id
  `, runId, day);

  const fromTransactions = one('SELECT COALESCE(SUM(total_cents), 0) AS n FROM transactions WHERE run_id = ? AND day = ?', runId, day).n;
  const fromItems = one(`
    SELECT COALESCE(SUM(ti.line_total_cents), 0) AS n FROM transaction_items ti
    JOIN transactions t ON t.transaction_id = ti.transaction_id WHERE t.run_id = ? AND t.day = ?
  `, runId, day).n;

  return {
    summary,
    customersByHour,
    salesByHour,
    byType,
    byMission,
    topProducts,
    lostSales,
    events,
    orders,
    receipts,
    reconciliation: {
      revenueReportedCents: summary.revenueCents,
      revenueFromTransactionsCents: fromTransactions,
      revenueFromLinesCents: fromItems,
      status: summary.revenueCents === fromTransactions && fromTransactions === fromItems ? 'PASS' : 'FAIL'
    }
  };
}

export function productTrace(runId, productId) {
  const product = one(`
    SELECT product_id AS productId, name, category, unit_cost_cents AS unitCostCents, unit_price_cents AS unitPriceCents,
           initial_qty AS initialQty, perishable, shelf_life_days AS shelfLifeDays
    FROM run_products WHERE run_id = ? AND product_id = ?
  `, runId, productId);
  if (!product) return null;

  const rows = many(`
    SELECT day,
           SUM(CASE WHEN movement_type IN ('OPENING', 'RECEIPT') THEN quantity_change ELSE 0 END) AS received,
           -SUM(CASE WHEN movement_type = 'SALE' THEN quantity_change ELSE 0 END) AS sold,
           -SUM(CASE WHEN movement_type = 'EXPIRY' THEN quantity_change ELSE 0 END) AS expired
    FROM inventory_movements WHERE run_id = ? AND product_id = ? GROUP BY day ORDER BY day
  `, runId, productId);
  let stock = 0;
  const days = rows.map((r) => {
    stock += r.received - r.sold - r.expired;
    return { ...r, closingStock: stock };
  });

  const events = many(`
    SELECT event_id AS eventId, day, event_type AS type, quantity, order_id AS orderId, detail
    FROM brain_events WHERE run_id = ? AND product_id = ? ORDER BY event_id
  `, runId, productId);

  return { product, days, closingStock: stock, events };
}

export function dayTransactions(runId, day, limit, offset) {
  const total = one('SELECT COUNT(*) AS n FROM transactions WHERE run_id = ? AND day = ?', runId, day).n;
  const rows = many(`
    SELECT t.transaction_id AS transactionId, t.hour, t.total_cents AS totalCents, c.customer_type AS customerType, c.mission,
           (SELECT SUM(i.quantity) FROM transaction_items i WHERE i.transaction_id = t.transaction_id) AS units
    FROM transactions t JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.run_id = ? AND t.day = ? ORDER BY t.transaction_id LIMIT ? OFFSET ?
  `, runId, day, limit, offset);
  return { total, limit, offset, rows };
}

export function transactionDetail(runId, transactionId) {
  const tx = one(`
    SELECT t.transaction_id AS transactionId, t.day, t.hour, t.total_cents AS totalCents, t.customer_id AS customerId,
           c.customer_type AS customerType, c.mission
    FROM transactions t JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.run_id = ? AND t.transaction_id = ?
  `, runId, transactionId);
  if (!tx) return null;

  const items = many(`
    SELECT i.product_id AS productId, p.name AS name, i.quantity, i.unit_price_cents AS unitPriceCents,
           i.unit_cost_cents AS unitCostCents, i.line_total_cents AS lineTotalCents
    FROM transaction_items i JOIN run_products p ON p.run_id = i.run_id AND p.product_id = i.product_id
    WHERE i.run_id = ? AND i.transaction_id = ? ORDER BY i.item_id
  `, runId, transactionId);

  const movements = many(`
    SELECT m.movement_id AS movementId, m.product_id AS productId, m.lot_id AS lotId, m.quantity_change AS quantityChange,
           l.received_day AS receivedDay, l.expiry_day AS expiryDay, l.source AS source
    FROM inventory_movements m JOIN lots l ON l.lot_id = m.lot_id
    WHERE m.run_id = ? AND m.transaction_id = ? ORDER BY m.movement_id
  `, runId, transactionId);

  const lostSales = many(
    'SELECT product_id AS productId, quantity_short AS quantityShort FROM lost_sales WHERE run_id = ? AND customer_id = ?',
    runId, tx.customerId
  );

  const itemsTotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0);
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const moved = -movements.reduce((s, m) => s + m.quantityChange, 0);

  return {
    ...tx,
    items,
    movements,
    lostSales,
    check: {
      itemsTotalCents,
      unitsOnLines: units,
      unitsInLedger: moved,
      status: itemsTotalCents === tx.totalCents && units === moved ? 'PASS' : 'FAIL'
    }
  };
}
