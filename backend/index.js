import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import { runSimulation } from './run.js';
import { businessPerformance } from './report.js';
import { inventoryOperations } from './operations.js';
import { commercialAssurance } from './assurance.js';
import { dailyReport, productTrace, dayTransactions, transactionDetail } from './daily.js';
import { commercialFindings } from './findings.js';

const app = express();
const PORT = process.env.PORT || 3001;
const READ_ONLY = process.env.READ_ONLY === '1';
const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'dist');

app.use(cors());
app.use(express.json());
app.use(express.static(webRoot));

const parseId = (value) => (/^[1-9][0-9]*$/.test(String(value)) ? Number(value) : null);

const submittedId = () => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'submitted_run_id'").get();
  return row ? Number(row.value) : null;
};

app.get('/api/config', (req, res) => {
  res.json({ readOnly: READ_ONLY });
});

app.get('/api/runs', (req, res) => {
  const submitted = submittedId();
  const runs = db.prepare(
    'SELECT run_id, label, status, seed, created_at, completed_at FROM runs ORDER BY run_id DESC'
  ).all();
  res.json(runs.map((r) => ({ ...r, submitted: Number(r.run_id) === submitted })));
});

app.post('/api/runs', (req, res) => {
  if (READ_ONLY) return res.status(403).json({ error: 'this public demo is read-only, so new runs cannot be started' });
  const { label, seed } = req.body ?? {};
  if (typeof label !== 'string' || label.trim() === '' || label.trim().length > 100) {
    return res.status(400).json({ error: 'label must be a non-empty string of at most 100 characters' });
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    return res.status(400).json({ error: 'seed must be a whole number from 0 to 4294967295' });
  }
  const runId = runSimulation({ label: label.trim(), seed });
  res.status(201).json({ runId });
});

app.get('/api/runs/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'run id must be a positive whole number' });
  const run = db.prepare(
    'SELECT run_id, label, status, seed, simulation_days, inventory_budget_cents, opening_cash_cents, created_at, completed_at FROM runs WHERE run_id = ?'
  ).get(id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  const days = db.prepare('SELECT COUNT(*) AS n FROM run_daily WHERE run_id = ?').get(id).n;
  res.json({ ...run, daysRetained: days, submitted: id === submittedId() });
});

app.get('/api/submitted', (req, res) => {
  res.json({ runId: submittedId() });
});

app.put('/api/submitted', (req, res) => {
  if (READ_ONLY) return res.status(403).json({ error: 'this public demo is read-only' });
  const id = parseId(req.body?.runId);
  if (id === null) return res.status(400).json({ error: 'runId must be a positive whole number' });
  const run = db.prepare('SELECT status FROM runs WHERE run_id = ?').get(id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  if (run.status !== 'COMPLETED') return res.status(400).json({ error: 'only a completed run can be the Submitted Run' });
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('submitted_run_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(id));
  res.json({ runId: id });
});

const findRun = (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'run id must be a positive whole number' });
    return null;
  }
  const run = db.prepare(
    'SELECT run_id, label, status, seed, simulation_days, inventory_budget_cents, opening_cash_cents, created_at, completed_at FROM runs WHERE run_id = ?'
  ).get(id);
  if (!run) {
    res.status(404).json({ error: 'run not found' });
    return null;
  }
  return run;
};

app.get('/api/runs/:id/report', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  res.json({ run, business: businessPerformance(run.run_id), operations: inventoryOperations(run.run_id) });
});

app.get('/api/runs/:id/assurance', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  res.json(commercialAssurance(run.run_id));
});

app.get('/api/runs/:id/days/:day', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  const day = parseId(req.params.day);
  if (day === null) return res.status(400).json({ error: 'day must be a positive whole number' });
  const report = dailyReport(run.run_id, day);
  if (!report) return res.status(404).json({ error: 'day not found in this run' });
  res.json(report);
});

app.get('/api/runs/:id/products', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  const products = db.prepare(`
    SELECT product_id AS productId, name, category, unit_cost_cents AS unitCostCents, unit_price_cents AS unitPriceCents,
           initial_qty AS initialQty, perishable, shelf_life_days AS shelfLifeDays,
           initial_qty * unit_cost_cents AS openingCostCents
    FROM run_products WHERE run_id = ? ORDER BY product_id
  `).all(run.run_id).map((p) => ({ ...p, perishable: p.perishable === 1 }));
  const openingCostCents = products.reduce((s, p) => s + p.openingCostCents, 0);
  res.json({
    inventoryBudgetCents: run.inventory_budget_cents,
    openingCashCents: run.opening_cash_cents,
    openingCostCents,
    products
  });
});

app.get('/api/runs/:id/products/:productId', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  const trace = productTrace(run.run_id, req.params.productId);
  if (!trace) return res.status(404).json({ error: 'product not found in this run' });
  res.json(trace);
});

app.get('/api/runs/:id/config', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  const row = db.prepare('SELECT config_json FROM runs WHERE run_id = ?').get(run.run_id);
  res.json({ runId: run.run_id, config: JSON.parse(row.config_json) });
});

app.get('/api/runs/:id/findings', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  if (run.status !== 'COMPLETED') return res.status(400).json({ error: 'findings need a completed run' });
  const submitted = run.run_id === submittedId();
  const note = submitted ? null : 'The wording of these findings was written for the Submitted Run. The figures are recomputed for this run, but the interpretation may not hold for it.';
  try {
    res.json({ runId: run.run_id, submitted, note, findings: commercialFindings(run.run_id) });
  } catch (err) {
    console.error(err);
    res.json({ runId: run.run_id, submitted, note: err.message, findings: null });
  }
});

app.get('/api/runs/:id/days/:day/transactions', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  const day = parseId(req.params.day);
  if (day === null) return res.status(400).json({ error: 'day must be a positive whole number' });
  const limit = req.query.limit === undefined ? 50 : parseId(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : (/^[0-9]+$/.test(String(req.query.offset)) ? Number(req.query.offset) : null);
  if (limit === null || limit > 200) return res.status(400).json({ error: 'limit must be a whole number from 1 to 200' });
  if (offset === null) return res.status(400).json({ error: 'offset must be a whole number of 0 or more' });
  if (!db.prepare('SELECT 1 FROM run_daily WHERE run_id = ? AND day = ?').get(run.run_id, day)) {
    return res.status(404).json({ error: 'day not found in this run' });
  }
  res.json(dayTransactions(run.run_id, day, limit, offset));
});

app.get('/api/runs/:id/transactions/:tid', (req, res) => {
  const run = findRun(req, res);
  if (!run) return;
  const tid = parseId(req.params.tid);
  if (tid === null) return res.status(400).json({ error: 'transaction id must be a positive whole number' });
  const detail = transactionDetail(run.run_id, tid);
  if (!detail) return res.status(404).json({ error: 'transaction not found in this run' });
  res.json(detail);
});

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'request body is not valid JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, (err) => {
  if (err) {
    console.error('Could not start the API on port ' + PORT + ': ' + err.message);
    process.exit(1);
  }
  console.log('API listening on http://localhost:' + PORT);
});
