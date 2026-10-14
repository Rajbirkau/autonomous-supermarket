import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = process.env.SUPERMARKET_DB || path.join(path.dirname(fileURLToPath(import.meta.url)), 'supermarket.db');

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED')),
    seed INTEGER NOT NULL,
    simulation_days INTEGER NOT NULL,
    inventory_budget_cents INTEGER NOT NULL,
    opening_cash_cents INTEGER NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS run_products (
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    initial_qty INTEGER NOT NULL CHECK (initial_qty >= 0),
    perishable INTEGER NOT NULL CHECK (perishable IN (0, 1)),
    shelf_life_days INTEGER,
    PRIMARY KEY (run_id, product_id),
    CHECK ((perishable = 0 AND shelf_life_days IS NULL) OR (perishable = 1 AND shelf_life_days > 0))
  );

  CREATE TABLE IF NOT EXISTS lots (
    lot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    product_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('OPENING', 'REPLENISHMENT')),
    received_day INTEGER NOT NULL CHECK (received_day >= 1),
    expiry_day INTEGER,
    qty_received INTEGER NOT NULL CHECK (qty_received > 0),
    FOREIGN KEY (run_id, product_id) REFERENCES run_products (run_id, product_id),
    CHECK (expiry_day IS NULL OR expiry_day > received_day)
  );

  CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    day INTEGER NOT NULL CHECK (day >= 1),
    hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
    customer_type TEXT NOT NULL,
    mission TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    day INTEGER NOT NULL CHECK (day >= 1),
    hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
    customer_id INTEGER NOT NULL REFERENCES customers (customer_id),
    total_cents INTEGER NOT NULL CHECK (total_cents > 0)
  );

  CREATE TABLE IF NOT EXISTS transaction_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    transaction_id INTEGER NOT NULL REFERENCES transactions (transaction_id),
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    line_total_cents INTEGER NOT NULL,
    FOREIGN KEY (run_id, product_id) REFERENCES run_products (run_id, product_id),
    CHECK (line_total_cents = quantity * unit_price_cents)
  );

  CREATE TABLE IF NOT EXISTS lost_sales (
    lost_sale_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    day INTEGER NOT NULL CHECK (day >= 1),
    customer_id INTEGER NOT NULL REFERENCES customers (customer_id),
    product_id TEXT NOT NULL,
    quantity_short INTEGER NOT NULL CHECK (quantity_short > 0),
    unit_price_cents INTEGER NOT NULL,
    FOREIGN KEY (run_id, product_id) REFERENCES run_products (run_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS replenishment_orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    product_id TEXT NOT NULL,
    placed_day INTEGER NOT NULL CHECK (placed_day >= 1),
    arrival_day INTEGER NOT NULL,
    qty_wanted INTEGER NOT NULL CHECK (qty_wanted > 0),
    qty_ordered INTEGER NOT NULL CHECK (qty_ordered >= 0),
    unit_cost_cents INTEGER NOT NULL,
    cost_cents INTEGER NOT NULL,
    cash_before_cents INTEGER NOT NULL,
    FOREIGN KEY (run_id, product_id) REFERENCES run_products (run_id, product_id),
    CHECK (arrival_day = placed_day + 1),
    CHECK (qty_ordered <= qty_wanted),
    CHECK (cost_cents = qty_ordered * unit_cost_cents),
    CHECK (cost_cents <= cash_before_cents)
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    movement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    day INTEGER NOT NULL CHECK (day >= 1),
    product_id TEXT NOT NULL,
    lot_id INTEGER NOT NULL REFERENCES lots (lot_id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('OPENING', 'RECEIPT', 'SALE', 'EXPIRY')),
    quantity_change INTEGER NOT NULL,
    transaction_id INTEGER REFERENCES transactions (transaction_id),
    order_id INTEGER REFERENCES replenishment_orders (order_id),
    FOREIGN KEY (run_id, product_id) REFERENCES run_products (run_id, product_id),
    CHECK (
      (movement_type IN ('OPENING', 'RECEIPT') AND quantity_change > 0) OR
      (movement_type IN ('SALE', 'EXPIRY') AND quantity_change < 0)
    )
  );

  CREATE TABLE IF NOT EXISTS cash_ledger (
    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    day INTEGER NOT NULL CHECK (day >= 1),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('OPENING', 'SALES', 'REPLENISHMENT')),
    amount_cents INTEGER NOT NULL,
    balance_after_cents INTEGER NOT NULL CHECK (balance_after_cents >= 0),
    order_id INTEGER REFERENCES replenishment_orders (order_id),
    CHECK (
      (entry_type IN ('OPENING', 'SALES') AND amount_cents >= 0) OR
      (entry_type = 'REPLENISHMENT' AND amount_cents <= 0)
    )
  );

  CREATE TABLE IF NOT EXISTS brain_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    day INTEGER NOT NULL CHECK (day >= 1),
    product_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('LOW_STOCK', 'SOLD_OUT', 'EXPIRY_WARNING', 'EXPIRY_REMOVAL', 'SLOW_MOVER', 'REPLENISHMENT', 'CASH_CONSTRAINED')),
    quantity INTEGER,
    order_id INTEGER REFERENCES replenishment_orders (order_id),
    detail TEXT NOT NULL,
    FOREIGN KEY (run_id, product_id) REFERENCES run_products (run_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS run_daily (
    run_id INTEGER NOT NULL REFERENCES runs (run_id),
    day INTEGER NOT NULL CHECK (day >= 1),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    weather TEXT NOT NULL,
    event_name TEXT,
    customers INTEGER NOT NULL,
    transactions INTEGER NOT NULL,
    units_sold INTEGER NOT NULL,
    revenue_cents INTEGER NOT NULL,
    cogs_cents INTEGER NOT NULL,
    expired_units INTEGER NOT NULL,
    expired_value_cents INTEGER NOT NULL,
    replenishment_spend_cents INTEGER NOT NULL,
    opening_cash_cents INTEGER NOT NULL,
    closing_cash_cents INTEGER NOT NULL,
    closing_stock_units INTEGER NOT NULL,
    closing_inventory_value_cents INTEGER NOT NULL,
    PRIMARY KEY (run_id, day)
  );

  CREATE INDEX IF NOT EXISTS idx_lots_run_product ON lots (run_id, product_id);
  CREATE INDEX IF NOT EXISTS idx_customers_run_day ON customers (run_id, day);
  CREATE INDEX IF NOT EXISTS idx_transactions_run_day ON transactions (run_id, day);
  CREATE INDEX IF NOT EXISTS idx_items_transaction ON transaction_items (transaction_id);
  CREATE INDEX IF NOT EXISTS idx_movements_run_day ON inventory_movements (run_id, day);
  CREATE INDEX IF NOT EXISTS idx_movements_run_product ON inventory_movements (run_id, product_id);
  CREATE INDEX IF NOT EXISTS idx_orders_run_day ON replenishment_orders (run_id, placed_day);
  CREATE INDEX IF NOT EXISTS idx_events_run_day ON brain_events (run_id, day);

  CREATE TRIGGER IF NOT EXISTS runs_frozen_update BEFORE UPDATE ON runs
  WHEN OLD.status = 'COMPLETED'
  BEGIN SELECT RAISE(ABORT, 'completed runs are frozen'); END;

  CREATE TRIGGER IF NOT EXISTS runs_no_delete BEFORE DELETE ON runs
  BEGIN SELECT RAISE(ABORT, 'runs cannot be deleted'); END;
`);

const historyTables = [
  'run_products', 'lots', 'inventory_movements', 'customers', 'lost_sales',
  'transactions', 'transaction_items', 'replenishment_orders', 'cash_ledger',
  'brain_events', 'run_daily'
];

for (const table of historyTables) {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
    BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;

    CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
    BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;

    CREATE TRIGGER IF NOT EXISTS ${table}_run_open BEFORE INSERT ON ${table}
    WHEN (SELECT status FROM runs WHERE run_id = NEW.run_id) <> 'RUNNING'
    BEGIN SELECT RAISE(ABORT, 'run is not open for writing'); END;
  `);
}

db.exec(`
  CREATE TRIGGER IF NOT EXISTS runs_config_frozen BEFORE UPDATE ON runs
  WHEN NEW.run_id <> OLD.run_id
    OR NEW.label <> OLD.label
    OR NEW.seed <> OLD.seed
    OR NEW.simulation_days <> OLD.simulation_days
    OR NEW.inventory_budget_cents <> OLD.inventory_budget_cents
    OR NEW.opening_cash_cents <> OLD.opening_cash_cents
    OR NEW.config_json <> OLD.config_json
    OR NEW.created_at <> OLD.created_at
  BEGIN SELECT RAISE(ABORT, 'run configuration is frozen'); END;
`);

export default db;
