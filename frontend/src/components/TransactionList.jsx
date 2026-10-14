import { money, int } from '../format.js';
import { Loading, ErrorBox } from './Status.jsx';

export default function TransactionList({ day, state, offset, pageSize, onPage, onOpenTransaction, onRetry }) {
  if (state.status === 'loading') return <Loading what={'the transactions for Day ' + day} />;
  if (state.status === 'error') return <ErrorBox message={state.error} onRetry={onRetry} />;
  const { total, rows } = state.payload;
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + rows.length;

  return (
    <section className="card">
      <h2>Transactions on Day {day}</h2>
      <p className="muted">Open a transaction to see its lines and the exact stock lots each sale drew from.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Transaction</th><th className="num">Hour</th><th>Customer type</th><th>Mission</th><th className="num">Units</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.transactionId}>
                <td><button className="link" onClick={() => onOpenTransaction(t.transactionId)}>#{t.transactionId}</button></td>
                <td className="num">{t.hour}:00</td>
                <td>{t.customerType}</td>
                <td>{t.mission.replace('_', ' ')}</td>
                <td className="num">{int(t.units)}</td>
                <td className="num">{money(t.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button onClick={() => onPage(Math.max(0, offset - pageSize))} disabled={offset === 0}>Previous page</button>
        <span>{from} to {to} of {int(total)}</span>
        <button onClick={() => onPage(offset + pageSize)} disabled={offset + pageSize >= total}>Next page</button>
      </div>
    </section>
  );
}
