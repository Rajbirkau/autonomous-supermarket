import db from './db.js';
import { validateProducts } from './validation.js';

export const SIMULATION_DAYS = 60;
export const INVENTORY_BUDGET_CENTS = 4000000;
export const OPENING_CASH_CENTS = 1500000;

export function createRun({ label, seed, products, config }) {
  if (typeof label !== 'string' || label.trim() === '') {
    throw new Error('run label must be a non-empty string');
  }
  if (!Number.isInteger(seed)) {
    throw new Error('seed must be a whole number');
  }
  if (config === null || typeof config !== 'object') {
    throw new Error('config must be an object');
  }

  const errors = validateProducts(products, INVENTORY_BUDGET_CENTS);
  if (errors.length > 0) {
    throw new Error('invalid catalogue: ' + errors.join('; '));
  }

  db.exec('SAVEPOINT create_run');
  try {
    const runId = db.prepare(`
      INSERT INTO runs (label, seed, simulation_days, inventory_budget_cents, opening_cash_cents, config_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(label.trim(), seed, SIMULATION_DAYS, INVENTORY_BUDGET_CENTS, OPENING_CASH_CENTS, JSON.stringify(config)).lastInsertRowid;

    const insertProduct = db.prepare(`
      INSERT INTO run_products (run_id, product_id, name, category, unit_cost_cents, unit_price_cents, initial_qty, perishable, shelf_life_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLot = db.prepare(`
      INSERT INTO lots (run_id, product_id, source, received_day, expiry_day, qty_received)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements (run_id, day, product_id, lot_id, movement_type, quantity_change)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const p of products) {
      insertProduct.run(runId, p.id, p.name, p.category, p.costCents, p.priceCents, p.initialQty, p.perishable ? 1 : 0, p.shelfLifeDays);
      if (p.initialQty > 0) {
        const expiryDay = p.perishable ? 1 + p.shelfLifeDays : null;
        const lotId = insertLot.run(runId, p.id, 'OPENING', 1, expiryDay, p.initialQty).lastInsertRowid;
        insertMovement.run(runId, 1, p.id, lotId, 'OPENING', p.initialQty);
      }
    }

    db.prepare(`
      INSERT INTO cash_ledger (run_id, day, entry_type, amount_cents, balance_after_cents)
      VALUES (?, 1, 'OPENING', ?, ?)
    `).run(runId, OPENING_CASH_CENTS, OPENING_CASH_CENTS);

    db.exec('RELEASE create_run');
    return Number(runId);
  } catch (err) {
    db.exec('ROLLBACK TO create_run');
    db.exec('RELEASE create_run');
    throw err;
  }
}
