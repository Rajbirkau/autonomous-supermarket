import db from './db.js';
import { SIMULATION_DAYS } from './simulation.js';
import { planDay } from './world.js';
import { drawCustomer, createBasketDrawer } from './basket.js';
import { loadLots, totalUnits, receiveOrders, removeExpired } from './inventory.js';
import { createSeller } from './sales.js';
import { estimateDemand, assess, detectEvents, expiringLots, planOrders } from './brain.js';
import { currentCash, recordEvents, recordOrders } from './ledger.js';
import { brainRules } from './brain_rules.js';

export function createEngine(runId, products, rng) {
  const unitCost = Object.fromEntries(products.map((p) => [p.id, p.costCents]));
  const state = loadLots(runId);
  const sell = createSeller(runId, products, state);
  const drawBasket = createBasketDrawer(products);
  let previous = new Map();
  const trimmed = new Set();

  const insertSales = db.prepare(`
    INSERT INTO cash_ledger (run_id, day, entry_type, amount_cents, balance_after_cents)
    VALUES (?, ?, 'SALES', ?, ?)
  `);
  const insertDaily = db.prepare(`
    INSERT INTO run_daily (run_id, day, weekday, weather, event_name, customers, transactions, units_sold, revenue_cents, cogs_cents, expired_units, expired_value_cents, replenishment_spend_cents, opening_cash_cents, closing_cash_cents, closing_stock_units, closing_inventory_value_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return function runDay(day) {
    const openingCash = currentCash(runId);

    receiveOrders(runId, day, state, products);

    const removed = removeExpired(runId, day, state, unitCost);
    recordEvents(runId, removed.map((r) => ({
      day, productId: r.productId, type: 'EXPIRY_REMOVAL', quantity: r.qty,
      detail: r.qty + ' units in lot ' + r.lotId + ' reached expiry and were removed before opening; write-off A$' + (r.valueCents / 100).toFixed(2)
    })));

    const plan = planDay(rng, day);
    const arrivals = [];
    for (const [type, count] of Object.entries(plan.counts)) {
      for (let i = 0; i < count; i++) arrivals.push(drawCustomer(rng, type));
    }
    arrivals.sort((a, b) => a.hour - b.hour);

    let transactions = 0;
    let units = 0;
    let revenue = 0;
    let cogs = 0;
    for (const customer of arrivals) {
      const result = sell(day, customer, drawBasket(rng, customer.mission, plan.weather));
      if (result.transactionId !== null) transactions++;
      units += result.units;
      revenue += result.totalCents;
      cogs += result.cogsCents;
    }

    const cashAfterSales = openingCash + revenue;
    insertSales.run(runId, day, revenue, cashAfterSales);

    const demand = estimateDemand(runId, day, brainRules);
    const rows = assess(state, products, demand, day, brainRules);
    const review = detectEvents(rows, expiringLots(state, day, brainRules), previous, day, brainRules);
    recordEvents(runId, review.events);
    previous = review.next;
    for (const r of rows) if (r.slow) trimmed.add(r.productId);

    let spend = 0;
    if (day < SIMULATION_DAYS) {
      const orderPlan = planOrders(rows, products, cashAfterSales, brainRules, trimmed);
      const placed = recordOrders(runId, day, orderPlan);
      spend = placed.reduce((s, o) => s + o.costCents, 0);
      for (const o of placed) if (o.qtyOrdered > 0) trimmed.delete(o.productId);
    }

    let inventoryValue = 0;
    for (const [productId, lots] of state) {
      for (const lot of lots) inventoryValue += lot.qty * unitCost[productId];
    }
    const expiredUnits = removed.reduce((s, r) => s + r.qty, 0);
    const expiredValue = removed.reduce((s, r) => s + r.valueCents, 0);
    const closingCash = currentCash(runId);

    insertDaily.run(
      runId, day, plan.weekday, plan.weather, plan.eventName, arrivals.length, transactions, units, revenue, cogs,
      expiredUnits, expiredValue, spend, openingCash, closingCash, totalUnits(state), inventoryValue
    );

    return { day, weather: plan.weather, customers: arrivals.length, transactions, units, revenue, expiredUnits, spend, closingCash };
  };
}
