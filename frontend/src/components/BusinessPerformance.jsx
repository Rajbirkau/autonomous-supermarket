import { money, int, dec, pct, dayNames } from '../format.js';
import Tile from './Tile.jsx';
import ProductLink from './ProductLink.jsx';
import DailyChart from './DailyChart.jsx';

function ProductTable({ rows, onOpenProduct }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Product</th><th>Category</th>
            <th className="num">Units sold</th><th className="num">Revenue</th><th className="num">Gross profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.productId}>
              <td><ProductLink id={p.productId} onOpen={onOpenProduct} /></td><td>{p.name}</td><td>{p.category}</td>
              <td className="num">{int(p.units)}</td><td className="num">{money(p.revenueCents)}</td><td className="num">{money(p.grossProfitCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BusinessPerformance({ business, onOpenDay, onOpenProduct }) {
  const s = business.store;
  const sh = business.shoppers;
  const eventDays = business.daily.filter((d) => d.eventName);
  const weekendDay = (d) => d.weekday === 0 || d.weekday === 6;

  return (
    <>
      <h2 className="part" id="part1">Part 1 - What happened to the business?</h2>

      <section className="card">
        <h2>Store performance over {s.days} days</h2>
        <div className="grid">
          <Tile label="Total customers" value={int(s.customers)} />
          <Tile label="Total transactions" value={int(s.transactions)} note={pct(s.transactions / s.customers, 2) + ' of customers bought something'} />
          <Tile label="Units sold" value={int(s.unitsSold)} />
          <Tile label="Sales revenue" value={money(s.revenueCents)} />
          <Tile label="Cost of goods sold" value={money(s.cogsCents)} />
          <Tile label="Gross profit" value={money(s.grossProfitCents)} note={pct(s.grossProfitCents / s.revenueCents) + ' of revenue, before overheads'} />
          <Tile label="Expiry / write-off value" value={money(s.writeOffCents)} note={int(s.expiredUnits) + ' units expired, valued at cost'} />
          <Tile label="Closing operating cash" value={money(s.closingCashCents)} note="gross cash, overheads excluded" />
          <Tile label="Closing inventory value" value={money(s.closingInventoryCents)} note="at purchase cost" />
        </div>
        <p className="muted">
          Customers wanted {int(s.lostUnits)} more units than were available ({money(s.lostRevenueCents)} of revenue). These lost sales are not included in the figures above.
        </p>
      </section>

      <section className="card">
        <h2>Shoppers and baskets</h2>
        <div className="grid">
          <Tile label="Average customers per day" value={dec(sh.avgCustomersPerDay, 1)} />
          <Tile label="Average basket size" value={dec(sh.avgBasketUnits, 2) + ' units'} />
          <Tile label="Average transaction value" value={money(sh.avgTransactionCents)} />
          <Tile label="Customers who bought" value={pct(sh.conversion, 2)} />
        </div>
        <h3>Weekday and weekend comparison</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Day type</th><th className="num">Days</th><th className="num">Avg customers</th><th className="num">Avg transactions</th>
                <th className="num">Avg revenue</th><th className="num">Avg basket (units)</th><th className="num">Avg transaction</th>
              </tr>
            </thead>
            <tbody>
              {sh.dayTypes.map((d) => (
                <tr key={d.dayType}>
                  <td>{d.dayType === 'weekday' ? 'Weekday (Mon to Fri)' : 'Weekend (Sat and Sun)'}</td>
                  <td className="num">{d.days}</td>
                  <td className="num">{dec(d.avgCustomers, 1)}</td>
                  <td className="num">{dec(d.avgTransactions, 1)}</td>
                  <td className="num">{money(d.avgRevenueCents)}</td>
                  <td className="num">{dec(d.avgBasketUnits, 2)}</td>
                  <td className="num">{money(d.avgTransactionCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eventDays.length > 0 && (
          <p className="muted">
            These averages include the declared event day: {eventDays.map((d) => 'Day ' + d.day + ' (' + d.eventName + ', ' + dayNames[d.weekday] + ', counted in the ' + (weekendDay(d) ? 'weekend' : 'weekday') + ' row)').join('; ')}.
          </p>
        )}
        <h3>Customer activity across the {s.days} days</h3>
        <DailyChart daily={business.daily} onOpenDay={onOpenDay} />
        <div className="legend">
          <span><span className="swatch bar-weekday" />Weekday</span>
          <span><span className="swatch bar-weekend" />Weekend</span>
          <span><span className="swatch bar-event" />Declared event day</span>
          <span>Horizontal axis is the day number. Click a bar to open that day's Daily Report.</span>
        </div>
      </section>

      <section className="card">
        <h2>Category performance</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th><th className="num">Units sold</th><th className="num">Revenue</th><th className="num">Share of revenue</th>
                <th className="num">Gross profit</th><th className="num">Gross margin</th>
              </tr>
            </thead>
            <tbody>
              {business.categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="num">{int(c.units)}</td>
                  <td className="num">{money(c.revenueCents)}</td>
                  <td className="num">{pct(c.revenueCents / s.revenueCents)}</td>
                  <td className="num">{money(c.grossProfitCents)}</td>
                  <td className="num">{pct(c.grossProfitCents / c.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Top-selling products</h2>
        <ProductTable rows={business.topProducts} onOpenProduct={onOpenProduct} />
        <h3>Weakest sellers by units sold</h3>
        <ProductTable rows={business.weakProducts} onOpenProduct={onOpenProduct} />
        <p className="muted">
          Weak sellers are ranked by units sold. This is a different list from the Store Brain's slow-mover alerts, which flag stock that is high relative to recent sales and are shown in Part 2.
        </p>
      </section>
    </>
  );
}
