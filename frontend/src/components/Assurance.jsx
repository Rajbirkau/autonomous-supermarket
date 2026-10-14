import { money, int } from '../format.js';
import Tile from './Tile.jsx';

const GROUPS = [
  ['History', 'History checks'],
  ['Inventory', 'Inventory reconciliation'],
  ['Revenue', 'Revenue reconciliation'],
  ['Cash', 'Operating-cash reconciliation'],
  ['Operations', 'Operating rules']
];

const COUNT_LABELS = [
  ['days', 'Daily records'],
  ['customers', 'Customers'],
  ['transactions', 'Transactions'],
  ['transactionItems', 'Transaction lines'],
  ['inventoryMovements', 'Inventory movements'],
  ['lots', 'Stock lots'],
  ['replenishmentOrders', 'Replenishment orders'],
  ['cashEntries', 'Cash ledger entries'],
  ['brainEvents', 'Store Brain events'],
  ['lostSales', 'Lost-sale records']
];

function evidence(c) {
  const v = c.values;
  if (c.name === 'Stock equation') {
    return 'Opening ' + int(v.opening) + ' + received ' + int(v.received) + ' - sold ' + int(v.sold) + ' - expired ' + int(v.expired) + ' = ' + int(v.closing) + ' units. Reported closing stock: ' + int(v.reportedClosing) + ' units.';
  }
  if (c.name === 'Units sold match transactions') {
    return int(v.ledger) + ' units sold in the inventory ledger, ' + int(v.transactionLines) + ' units on transaction lines.';
  }
  if (c.name === 'Receipts match orders and lots') {
    return int(v.received) + ' units received, ' + int(v.lots) + ' units in replenishment lots.';
  }
  if (c.name === '60-day revenue equals the sum of daily revenue') {
    return 'Daily revenue ' + money(v.daily) + ', transactions ' + money(v.transactions) + ', transaction lines ' + money(v.lines) + ', cash ledger ' + money(v.cashLedger) + '.';
  }
  if (c.name === 'Cash equation') {
    return 'Opening ' + money(v.opening) + ' + sales revenue ' + money(v.revenue) + ' - replenishment spend ' + money(v.spend) + ' = ' + money(v.expected) + '. Cash ledger: ' + money(v.ledger) + '. Reported closing cash: ' + money(v.reported) + '.';
  }
  if (c.name === 'Spend recorded consistently') {
    return 'Orders ' + money(v.orders) + ', cash ledger ' + money(v.ledger) + ', daily records ' + money(v.daily) + '.';
  }
  return c.detail;
}

export default function Assurance({ result }) {
  const { run, counts, checks, summary, exceptions } = result;
  const ok = summary.overall === 'PASS';

  return (
    <>
      <h2 className="part">Part 4 - Can the client trust the report?</h2>

      <section className={ok ? 'banner banner-pass' : 'banner banner-fail'}>
        <strong>{ok ? 'All checks passed' : 'Integrity failures found'}</strong>
        <span>{summary.passed} of {summary.total} checks passed for Run {run.runId} ({run.label}).</span>
      </section>

      <section className="card">
        <h2>History completeness</h2>
        <div className="grid">
          <Tile label="Run ID" value={run.runId} note={run.label} />
          <Tile label="Days retained" value={counts.days + ' / ' + run.days} note={'status: ' + run.status} />
          <Tile label="Random seed" value={run.seed} note="stored with the run configuration" />
        </div>
        <h3>Records retained for audit</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Record type</th><th className="num">Rows stored</th></tr></thead>
            <tbody>
              {COUNT_LABELS.map(([key, label]) => (
                <tr key={key}><td>{label}</td><td className="num">{int(counts[key])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          History tables are append-only and a completed run cannot be changed: the database rejects updates and deletes, and a run's configuration is frozen once it begins.
        </p>
      </section>

      {GROUPS.map(([group, title]) => (
        <section className="card" key={group}>
          <h2>{title}</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead>
              <tbody>
                {checks.filter((c) => c.group === group).map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className={c.status === 'PASS' ? 'pass' : 'fail'}>{c.status}</td>
                    <td>{evidence(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="card">
        <h2>Exceptions</h2>
        {exceptions.length === 0 ? (
          <p>No integrity failures and no unexplained exceptions were found in this run.</p>
        ) : (
          <ul>
            {exceptions.map((e, i) => (
              <li key={i} className="fail">{e}</li>
            ))}
          </ul>
        )}
        <p className="muted">
          Stockouts, expiry and write-off, slow-moving stock and low cash are business outcomes, not integrity failures. They are reported in Part 2. An integrity failure is a contradiction in the recorded history, such as negative stock, a sale of expired stock, an unexplained cash movement or a total that cannot be reconciled.
        </p>
        <p className="muted">
          To audit a figure, open a Daily Report from the 60-Day Report chart or from a Store Brain alert, where each day carries its own revenue check.
        </p>
      </section>
    </>
  );
}
