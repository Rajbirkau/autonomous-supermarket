import db from './db.js';

const one = (sql, ...args) => db.prepare(sql).get(...args);
const many = (sql, ...args) => db.prepare(sql).all(...args);

export function businessPerformance(runId) {
  const t = one(`
    SELECT COUNT(*) AS days, SUM(customers) AS customers, SUM(transactions) AS transactions, SUM(units_sold) AS units,
           SUM(revenue_cents) AS revenue, SUM(cogs_cents) AS cogs,
           SUM(expired_units) AS expiredUnits, SUM(expired_value_cents) AS expiredValue
    FROM run_daily WHERE run_id = ?
  `, runId);
  const last = one(
    'SELECT closing_cash_cents AS cash, closing_inventory_value_cents AS inventory FROM run_daily WHERE run_id = ? ORDER BY day DESC LIMIT 1',
    runId
  );
  const lost = one(
    'SELECT COALESCE(SUM(quantity_short), 0) AS units, COALESCE(SUM(quantity_short * unit_price_cents), 0) AS value FROM lost_sales WHERE run_id = ?',
    runId
  );

  const store = {
    days: t.days,
    customers: t.customers,
    transactions: t.transactions,
    unitsSold: t.units,
    revenueCents: t.revenue,
    cogsCents: t.cogs,
    grossProfitCents: t.revenue - t.cogs,
    expiredUnits: t.expiredUnits,
    writeOffCents: t.expiredValue,
    closingCashCents: last.cash,
    closingInventoryCents: last.inventory,
    lostUnits: lost.units,
    lostRevenueCents: lost.value
  };

  const dayTypes = many(`
    SELECT CASE WHEN weekday IN (0, 6) THEN 'weekend' ELSE 'weekday' END AS dayType,
           COUNT(*) AS days, SUM(customers) AS customers, SUM(transactions) AS transactions,
           SUM(units_sold) AS units, SUM(revenue_cents) AS revenue
    FROM run_daily WHERE run_id = ? GROUP BY dayType
  `, runId).map((r) => ({
    dayType: r.dayType,
    days: r.days,
    avgCustomers: r.customers / r.days,
    avgTransactions: r.transactions / r.days,
    avgRevenueCents: r.revenue / r.days,
    avgBasketUnits: r.transactions > 0 ? r.units / r.transactions : 0,
    avgTransactionCents: r.transactions > 0 ? r.revenue / r.transactions : 0
  }));

  const shoppers = {
    avgCustomersPerDay: t.customers / t.days,
    avgBasketUnits: t.transactions > 0 ? t.units / t.transactions : 0,
    avgTransactionCents: t.transactions > 0 ? t.revenue / t.transactions : 0,
    conversion: t.customers > 0 ? t.transactions / t.customers : 0,
    dayTypes
  };

  const daily = many(`
    SELECT day, weekday, weather, event_name AS eventName, customers, transactions, units_sold AS units, revenue_cents AS revenueCents
    FROM run_daily WHERE run_id = ? ORDER BY day
  `, runId);

  const categories = many(`
    SELECT p.category AS category, SUM(ti.quantity) AS units, SUM(ti.line_total_cents) AS revenueCents,
           SUM(ti.line_total_cents - ti.quantity * ti.unit_cost_cents) AS grossProfitCents
    FROM transaction_items ti
    JOIN run_products p ON p.run_id = ti.run_id AND p.product_id = ti.product_id
    WHERE ti.run_id = ?
    GROUP BY p.category ORDER BY revenueCents DESC
  `, runId);

  const products = many(`
    SELECT p.product_id AS productId, p.name AS name, p.category AS category,
           COALESCE(SUM(ti.quantity), 0) AS units,
           COALESCE(SUM(ti.line_total_cents), 0) AS revenueCents,
           COALESCE(SUM(ti.line_total_cents - ti.quantity * ti.unit_cost_cents), 0) AS grossProfitCents
    FROM run_products p
    LEFT JOIN transaction_items ti ON ti.run_id = p.run_id AND ti.product_id = p.product_id
    WHERE p.run_id = ?
    GROUP BY p.product_id ORDER BY units DESC, p.product_id
  `, runId);

  return {
    store,
    shoppers,
    daily,
    categories,
    topProducts: products.slice(0, 10),
    weakProducts: products.slice(-10).reverse()
  };
}
