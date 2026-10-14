import { money, int, dayNames } from '../format.js';
import Tile from './Tile.jsx';
import ProductLink from './ProductLink.jsx';
import HourChart from './HourChart.jsx';

const EVENT_TYPES = [
  ['LOW_STOCK', 'Low stock'],
  ['SOLD_OUT', 'Sold out'],
  ['EXPIRY_WARNING', 'Expiry warning'],
  ['EXPIRY_REMOVAL', 'Expiry removal'],
  ['SLOW_MOVER', 'Slow mover'],
  ['REPLENISHMENT', 'Replenishment'],
  ['CASH_CONSTRAINED', 'Cash constrained']
];
const LABEL = Object.fromEntries(EVENT_TYPES);

export default function DailyReport({ report, onOpenProduct }) {
  const s = report.summary;
  const r = report.reconciliation;
  const counts = Object.fromEntries(EVENT_TYPES.map(([type]) => [type, 0]));
  for (const e of report.events) counts[e.type] += 1;

  return (
    <>
      <h2 className="part">Day {s.day}: {dayNames[s.weekday]}, {s.weather} weather{s.eventName ? ', ' + s.eventName : ''}</h2>

      <section className="card">
        <h2>Day figures</h2>
        <div className="grid">
          <Tile label="Customers" value={int(s.customers)} />
          <Tile label="Transactions" value={int(s.transactions)} note={int(s.customers - s.transactions) + ' customers bought nothing'} />
          <Tile label="Units sold" value={int(s.units)} />
          <Tile label="Revenue" value={money(s.revenueCents)} />
          <Tile label="Cost of goods sold" value={money(s.cogsCents)} />
          <Tile label="Expired and written off" value={money(s.expiredValueCents)} note={int(s.expiredUnits) + ' units, at cost'} />
          <Tile label="Replenishment spend" value={money(s.spendCents)} note={s.day === 60 ? 'no orders after the close of Day 60' : 'ordered at close, arrives next morning'} />
          <Tile label="Opening cash" value={money(s.openingCashCents)} />
          <Tile label="Closing cash" value={money(s.closingCashCents)} />
          <Tile label="Closing stock" value={int(s.closingStockUnits) + ' units'} note={money(s.closingInventoryCents) + ' at cost'} />
        </div>
      </section>

      <section className="card">
        <h2>Revenue check for this day</h2>
        <p>
          <span className={r.status === 'PASS' ? 'pass' : 'fail'}>{r.status}</span>
          {' '}Reported revenue {money(r.revenueReportedCents)}, sum of this day's transaction totals {money(r.revenueFromTransactionsCents)}, sum of transaction lines {money(r.revenueFromLinesCents)}.
        </p>
      </section>

      <section className="card">
        <h2>Customers by arrival hour</h2>
        <HourChart customersByHour={report.customersByHour} salesByHour={report.salesByHour} />
        <p className="muted">Horizontal axis is the hour of arrival (6 is 6:00 to 6:59). Hover a bar for transactions and revenue.</p>
        <div className="two">
          <div>
            <h3>By customer type</h3>
            <table>
              <thead><tr><th>Type</th><th className="num">Customers</th></tr></thead>
              <tbody>
                {report.byType.map((t) => (
                  <tr key={t.type}><td>{t.type}</td><td className="num">{int(t.customers)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>By shopping mission</h3>
            <table>
              <thead><tr><th>Mission</th><th className="num">Customers</th></tr></thead>
              <tbody>
                {report.byMission.map((m) => (
                  <tr key={m.mission}><td>{m.mission.replace('_', ' ')}</td><td className="num">{int(m.customers)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Products</h2>
        <h3>Top sellers</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th className="num">Units</th><th className="num">Revenue</th></tr></thead>
            <tbody>
              {report.topProducts.map((p) => (
                <tr key={p.productId}><td><ProductLink id={p.productId} name={p.name} onOpen={onOpenProduct} /></td><td className="num">{int(p.units)}</td><td className="num">{money(p.revenueCents)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Lost sales (wanted but not available)</h3>
        {report.lostSales.length === 0 ? (
          <p>No lost sales on this day.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Product</th><th className="num">Units</th><th className="num">Revenue</th></tr></thead>
              <tbody>
                {report.lostSales.map((p) => (
                  <tr key={p.productId}><td><ProductLink id={p.productId} name={p.name} onOpen={onOpenProduct} /></td><td className="num">{int(p.units)}</td><td className="num">{money(p.revenueCents)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Store Brain events</h2>
        <div className="pills">
          {EVENT_TYPES.map(([type, label]) => (
            <span key={type} className={counts[type] === 0 ? 'pill pill-zero' : 'pill'}>{label}: {counts[type]}</span>
          ))}
        </div>
        {report.events.length === 0 ? (
          <p>The Store Brain recorded no events on this day.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Event</th><th>Product</th><th className="num">Qty</th><th>Order</th><th>Evidence</th></tr></thead>
              <tbody>
                {report.events.map((e) => (
                  <tr key={e.eventId}>
                    <td>{LABEL[e.type]}</td>
                    <td><ProductLink id={e.productId} onOpen={onOpenProduct} /></td>
                    <td className="num">{e.quantity === null ? '-' : int(e.quantity)}</td>
                    <td>{e.orderId === null ? '-' : e.orderId}</td>
                    <td>{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Replenishment</h2>
        <h3>Orders placed at close of Day {s.day}</h3>
        {s.day === 60 ? (
          <p>No order is placed after the close of Day 60, because there is no Day 61 in the simulation.</p>
        ) : report.orders.length === 0 ? (
          <p>No orders were placed.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Order</th><th>Product</th><th className="num">Wanted</th><th className="num">Ordered</th><th className="num">Cost</th><th className="num">Cash before</th><th className="num">Arrives</th></tr>
              </thead>
              <tbody>
                {report.orders.map((o) => (
                  <tr key={o.orderId}>
                    <td>{o.orderId}</td><td><ProductLink id={o.productId} name={o.name} onOpen={onOpenProduct} /></td>
                    <td className="num">{int(o.qtyWanted)}</td><td className="num">{int(o.qtyOrdered)}</td>
                    <td className="num">{money(o.costCents)}</td><td className="num">{money(o.cashBeforeCents)}</td>
                    <td className="num">Day {o.arrivalDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3>Deliveries received before opening on Day {s.day}</h3>
        {report.receipts.length === 0 ? (
          <p>{s.day === 1 ? 'No deliveries: Day 1 starts from the opening stock.' : 'No deliveries arrived.'}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Product</th><th className="num">Units</th><th>From order</th></tr></thead>
              <tbody>
                {report.receipts.map((x, i) => (
                  <tr key={i}><td><ProductLink id={x.productId} name={x.name} onOpen={onOpenProduct} /></td><td className="num">{int(x.quantity)}</td><td>{x.orderId}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
