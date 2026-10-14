import { money, int, dayNames } from '../format.js';
import { Loading, ErrorBox } from './Status.jsx';
import Tile from './Tile.jsx';
import ProductLink from './ProductLink.jsx';

const eventName = (type) => type.replaceAll('_', ' ').toLowerCase();

function DayButton({ day, onOpenDay }) {
  return <button className="link" onClick={() => onOpenDay(day)}>Day {day}</button>;
}

function ProductTrace({ trace, onOpenDay }) {
  const p = trace.product;
  return (
    <>
      <p>{p.name} ({p.category})</p>
      <div className="grid">
        <Tile label="Unit cost" value={money(p.unitCostCents)} />
        <Tile label="Selling price" value={money(p.unitPriceCents)} />
        <Tile label="Opening quantity" value={int(p.initialQty)} />
        <Tile label="Shelf life" value={p.perishable ? p.shelfLifeDays + ' days' : 'none'} />
        <Tile label="Closing stock" value={int(trace.closingStock) + ' units'} />
      </div>
      <h3>Stock movements by day</h3>
      <div className="table-scroll scroll-box">
        <table>
          <thead>
            <tr><th>Day</th><th className="num">Received</th><th className="num">Sold</th><th className="num">Expired</th><th className="num">Closing stock</th></tr>
          </thead>
          <tbody>
            {trace.days.map((d) => (
              <tr key={d.day}>
                <td><DayButton day={d.day} onOpenDay={onOpenDay} /></td>
                <td className="num">{int(d.received)}</td>
                <td className="num">{int(d.sold)}</td>
                <td className="num">{int(d.expired)}</td>
                <td className="num">{int(d.closingStock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Day 1 received is the opening stock. Days with no movement are not listed and stock carries over unchanged.</p>
      <h3>Store Brain events for this product</h3>
      {trace.events.length === 0 ? (
        <p>The Store Brain recorded no events for this product.</p>
      ) : (
        <div className="table-scroll scroll-box">
          <table>
            <thead><tr><th>Day</th><th>Event</th><th className="num">Qty</th><th>Order</th><th>Evidence</th></tr></thead>
            <tbody>
              {trace.events.map((e) => (
                <tr key={e.eventId}>
                  <td><DayButton day={e.day} onOpenDay={onOpenDay} /></td>
                  <td>{eventName(e.type)}</td>
                  <td className="num">{e.quantity === null ? '-' : int(e.quantity)}</td>
                  <td>{e.orderId === null ? '-' : e.orderId}</td>
                  <td>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TransactionTrace({ tx, onOpenDay, onOpenProduct }) {
  const c = tx.check;
  return (
    <>
      <p>
        <DayButton day={tx.day} onOpenDay={onOpenDay} /> ({dayNames[tx.day % 7]}), {tx.hour}:00. Customer {tx.customerId}, {tx.customerType}, mission {tx.mission.replace('_', ' ')}. Total {money(tx.totalCents)}.
      </p>
      <p>
        <span className={c.status === 'PASS' ? 'pass' : 'fail'}>{c.status}</span>
        {' '}Lines add up to {money(c.itemsTotalCents)} against a stored total of {money(tx.totalCents)}, and {int(c.unitsOnLines)} units on the lines match {int(c.unitsInLedger)} units taken from stock.
      </p>
      <h3>Lines</h3>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Product</th><th className="num">Quantity</th><th className="num">Unit price</th><th className="num">Unit cost</th><th className="num">Line total</th></tr></thead>
          <tbody>
            {tx.items.map((i) => (
              <tr key={i.productId}>
                <td><ProductLink id={i.productId} name={i.name} onOpen={onOpenProduct} /></td>
                <td className="num">{int(i.quantity)}</td>
                <td className="num">{money(i.unitPriceCents)}</td>
                <td className="num">{money(i.unitCostCents)}</td>
                <td className="num">{money(i.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Stock lots the sale drew from</h3>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Movement</th><th>Product</th><th className="num">Lot</th><th className="num">Units taken</th><th className="num">Lot received</th><th className="num">Lot expires</th><th>Lot source</th></tr></thead>
          <tbody>
            {tx.movements.map((m) => (
              <tr key={m.movementId}>
                <td>{m.movementId}</td>
                <td>{m.productId}</td>
                <td className="num">{m.lotId}</td>
                <td className="num">{int(-m.quantityChange)}</td>
                <td className="num">Day {m.receivedDay}</td>
                <td className="num">{m.expiryDay === null ? 'none' : 'Day ' + m.expiryDay}</td>
                <td>{m.source === 'OPENING' ? 'opening stock' : 'replenishment'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Items this customer wanted but could not buy</h3>
      {tx.lostSales.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul>
          {tx.lostSales.map((l) => (
            <li key={l.productId}>{l.productId}: {int(l.quantityShort)} unit(s) short</li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TracePanel({ drill, state, onClose, onOpenDay, onOpenProduct, onRetry }) {
  const title = drill.kind === 'product' ? 'Stock history for ' + drill.id : 'Transaction #' + drill.id;
  return (
    <section className="card card-trace">
      <div className="trace-head">
        <h2>{title}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      {state.status === 'loading' && <Loading what="the stored records" />}
      {state.status === 'error' && <ErrorBox message={state.error} onRetry={onRetry} />}
      {state.status === 'ready' && drill.kind === 'product' && <ProductTrace trace={state.payload} onOpenDay={onOpenDay} />}
      {state.status === 'ready' && drill.kind === 'transaction' && <TransactionTrace tx={state.payload} onOpenDay={onOpenDay} onOpenProduct={onOpenProduct} />}
    </section>
  );
}
