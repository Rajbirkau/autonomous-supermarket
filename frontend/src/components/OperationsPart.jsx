import { money, int, pct } from '../format.js';
import Tile from './Tile.jsx';
import ProductLink from './ProductLink.jsx';

const EVENT_INFO = {
  LOW_STOCK: ['Low stock', 'Usable stock fell below the trigger. Logged when a product enters the state.', 'Reorder up to the target cover'],
  SOLD_OUT: ['Sold out', 'No units left at close. Logged when a product enters the state, so one event is one stockout episode.', 'Reorder up to the target cover the same night'],
  EXPIRY_WARNING: ['Expiry warning', 'A lot will be removed when the next day opens.', 'Units excluded from usable stock so the reorder covers the gap'],
  EXPIRY_REMOVAL: ['Expiry removal', 'A lot reached its expiry day.', 'Removed from sale before opening and written off at cost'],
  SLOW_MOVER: ['Slow mover', 'Usable stock is high relative to recent sales.', 'Not reordered while flagged; the next reorder uses the reduced target'],
  REPLENISHMENT: ['Replenishment', 'An order was placed at close.', 'Cost deducted from cash; stock arrives before opening the next day'],
  CASH_CONSTRAINED: ['Cash constrained', 'Cash could not fund the full order.', 'Order reduced to the cash available and the shortfall logged']
};

function DayLink({ day, onOpenDay }) {
  return <button className="link" onClick={() => onOpenDay(day)}>Day {day}</button>;
}

export default function OperationsPart({ operations, onOpenDay, onOpenProduct }) {
  const o = operations;
  const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);
  const woCategory = Object.fromEntries(o.writeOffByCategory.map((r) => [r.category, r]));
  const woSource = Object.fromEntries(o.writeOffBySource.map((r) => [r.source, r]));
  const woTotal = sum(o.writeOffByCategory, 'valueCents');
  const woUnits = sum(o.writeOffByCategory, 'units');
  const opening = sum(o.inventoryByCategory, 'openingCents');
  const closing = sum(o.inventoryByCategory, 'closingCents');
  const spendByCategory = Object.fromEntries(o.replenishmentByCategory.map((r) => [r.category, r]));
  const c = o.chain;

  return (
    <>
      <h2 className="part" id="part2">Part 2 - What operational problems occurred, and what did the Store Brain do?</h2>

      <section className="card">
        <h2>Store Brain activity</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Condition</th><th className="num">Events</th><th>What it means</th><th>What the Store Brain did</th></tr>
            </thead>
            <tbody>
              {o.eventCounts.map((e) => (
                <tr key={e.type}>
                  <td>{EVENT_INFO[e.type][0]}</td>
                  <td className="num">{int(e.count)}</td>
                  <td>{EVENT_INFO[e.type][1]}</td>
                  <td>{EVENT_INFO[e.type][2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Low-stock events are routine reorder triggers and not {int(o.eventCounts.find((e) => e.type === 'LOW_STOCK').count)} separate problems. Types with no events are shown as zero.
        </p>
      </section>

      <section className="card">
        <h2>Stockouts</h2>
        {o.stockouts.length === 0 ? (
          <p>No product sold out during the run.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Product</th><th className="num">Stockout episodes</th><th className="num">Days with lost sales</th><th className="num">Lost units</th><th className="num">Lost revenue</th></tr>
              </thead>
              <tbody>
                {o.stockouts.map((s) => (
                  <tr key={s.productId}>
                    <td><ProductLink id={s.productId} name={s.name} onOpen={onOpenProduct} /></td>
                    <td className="num">{int(s.events)}</td>
                    <td className="num">{int(s.daysWithLostSales)}</td>
                    <td className="num">{int(s.lostUnits)}</td>
                    <td className="num">{money(s.lostRevenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">An episode begins when a product sells out and can last several days, so days with lost sales can exceed episodes.</p>
        <h3>Products reordered most often after low stock (top 10)</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th className="num">Low-stock events</th></tr></thead>
            <tbody>
              {o.lowStock.map((p) => (
                <tr key={p.productId}><td><ProductLink id={p.productId} name={p.name} onOpen={onOpenProduct} /></td><td className="num">{int(p.events)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Expiry and write-off</h2>
        <div className="grid">
          <Tile label="Write-off value" value={money(woTotal)} note={int(woUnits) + ' units, valued at cost'} />
          <Tile label="From opening stock" value={money((woSource.OPENING || { valueCents: 0 }).valueCents)} note={int((woSource.OPENING || { units: 0 }).units) + ' units'} />
          <Tile label="From replenishment stock" value={money((woSource.REPLENISHMENT || { valueCents: 0 }).valueCents)} note={int((woSource.REPLENISHMENT || { units: 0 }).units) + ' units'} />
        </div>
        <h3>Write-off by category</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Category</th><th className="num">Units expired</th><th className="num">Value</th><th className="num">Share</th></tr></thead>
            <tbody>
              {o.inventoryByCategory.map((r) => {
                const w = woCategory[r.category] || { units: 0, valueCents: 0 };
                return (
                  <tr key={r.category}>
                    <td>{r.category}</td>
                    <td className="num">{int(w.units)}</td>
                    <td className="num">{money(w.valueCents)}</td>
                    <td className="num">{woTotal > 0 ? pct(w.valueCents / woTotal) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3>Write-off by product (top 10)</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th>Category</th><th className="num">Units expired</th><th className="num">Value</th></tr></thead>
            <tbody>
              {o.writeOffByProduct.map((p) => (
                <tr key={p.productId}>
                  <td><ProductLink id={p.productId} name={p.name} onOpen={onOpenProduct} /></td><td>{p.category}</td>
                  <td className="num">{int(p.units)}</td><td className="num">{money(p.valueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Slow-moving stock</h2>
        {o.slowMovers.length === 0 ? (
          <p>No product was flagged as a slow mover.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Day</th><th>Product</th><th>Store Brain evidence</th></tr></thead>
              <tbody>
                {o.slowMovers.map((s) => (
                  <tr key={s.day + s.productId}>
                    <td><DayLink day={s.day} onOpenDay={onOpenDay} /></td>
                    <td><ProductLink id={s.productId} name={s.name} onOpen={onOpenProduct} /></td>
                    <td>{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Slow movers are measured by days of cover, so a best seller with a large opening stock can be flagged. This is a different list from the weakest sellers in Part 1.
        </p>
      </section>

      <section className="card">
        <h2>Replenishment and cash</h2>
        <div className="grid">
          <Tile label="Orders placed" value={int(o.replenishment.orders)} />
          <Tile label="Units ordered" value={int(o.replenishment.units)} />
          <Tile label="Replenishment spend" value={money(o.replenishment.spendCents)} />
          <Tile label="Orders limited by cash" value={int(o.cash.constrainedOrders)} note={int(o.cash.constrainedEvents) + ' cash-constrained events'} />
          <Tile label="Lowest closing cash" value={money(o.cash.lowestClosingCents)} />
        </div>
        <p>
          {o.cash.constrainedEvents === 0 && o.cash.constrainedOrders === 0
            ? 'No replenishment was constrained by insufficient operating cash in this run. The cash rule is enforced in code but was not exercised by the recorded history.'
            : 'Some replenishment was constrained by cash. See the cash-constrained events below.'}
        </p>
        {o.cash.samples.length > 0 && (
          <ul>
            {o.cash.samples.map((s, i) => (
              <li key={i}><DayLink day={s.day} onOpenDay={onOpenDay} /> {s.productId}: {s.detail}</li>
            ))}
          </ul>
        )}
        <h3>Replenishment by category</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Category</th><th className="num">Orders</th><th className="num">Units</th><th className="num">Spend</th></tr></thead>
            <tbody>
              {o.inventoryByCategory.map((r) => {
                const s = spendByCategory[r.category] || { orders: 0, units: 0, spendCents: 0 };
                return (
                  <tr key={r.category}>
                    <td>{r.category}</td><td className="num">{int(s.orders)}</td><td className="num">{int(s.units)}</td><td className="num">{money(s.spendCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Closing inventory position</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Category</th><th className="num">Opening (at cost)</th><th className="num">Closing (at cost)</th><th className="num">Closing units</th></tr></thead>
            <tbody>
              {o.inventoryByCategory.map((r) => (
                <tr key={r.category}>
                  <td>{r.category}</td><td className="num">{money(r.openingCents)}</td><td className="num">{money(r.closingCents)}</td><td className="num">{int(r.closingUnits)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td><td className="num">{money(opening)}</td><td className="num">{money(closing)}</td><td className="num">{int(sum(o.inventoryByCategory, 'closingUnits'))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">No replenishment is ordered after the close of Day 60, so the closing position reflects the last night's sales without a refill.</p>
      </section>

      <section className="card">
        <h2>From condition to action to outcome</h2>
        {c === null ? (
          <p>No product sold out, so there is no stockout to trace.</p>
        ) : (
          <>
            <p>
              The first stockout of the most-affected product, {c.productId} {c.name}. This is one example of {int(o.stockouts[0].events)} stockout episodes for this product.
            </p>
            <div className="flow">
              <div className="step">
                <div className="step-title">1. Condition detected</div>
                <div><DayLink day={c.condition.day} onOpenDay={onOpenDay} />, event {c.condition.eventId}</div>
                <div>{c.condition.detail}</div>
              </div>
              <div className="step">
                <div className="step-title">2. Action taken</div>
                {c.action ? (
                  <>
                    <div>Order {c.action.orderId}, placed day {c.action.placedDay}</div>
                    <div>{int(c.action.qty)} units for {money(c.action.costCents)}</div>
                  </>
                ) : (
                  <div>No order was recorded for that night.</div>
                )}
              </div>
              <div className="step">
                <div className="step-title">3. Recorded outcome</div>
                {c.action && c.outcome && c.outcome.received > 0 ? (
                  <>
                    <div>{int(c.outcome.received)} units received on <DayLink day={c.action.arrivalDay} onOpenDay={onOpenDay} /></div>
                    <div>Matches the {int(c.action.qty)} units ordered</div>
                  </>
                ) : (
                  <div>No receipt recorded.</div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
