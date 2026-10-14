import { useState } from 'react';
import Tile from './Tile.jsx';
import { money, int, pct, dayNames } from '../format.js';

const RULES = [
  ['demandWindowDays', 'Days of sales history used for the demand estimate'],
  ['countLostSalesAsDemand', 'Lost sales counted as demand'],
  ['lowStockCoverDays', 'Low-stock trigger (days of demand, usable stock below)'],
  ['lowStockCoverDaysOneDayShelfLife', 'Low-stock trigger for 1-day shelf-life products (days)'],
  ['targetCoverDays', 'Order-up-to target for shelf-stable products (days of demand)'],
  ['perishableTargetCoverDays', 'Order-up-to target for perishables (days, capped at shelf life)'],
  ['slowMoverCoverDays', 'Slow-mover trigger (days of demand, usable stock above)'],
  ['slowMoverTargetCoverDays', 'Reduced order-up-to target after a slow-mover flag (days)'],
  ['slowMoverFromDay', 'Slow-mover check starts on day'],
  ['expiryWarningDaysAhead', 'Expiry warning window (days ahead)'],
  ['logOnEntryOnly', 'Low-stock, sold-out and slow-mover logged only on entry to the state'],
  ['cashShortagePriority', 'When cash is short, orders are filled']
];

const show = (v) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));


export default function Declaration({ config, products }) {
  const [category, setCategory] = useState('All');
  const c = config.config;
  const m = c.model;
  const list = products.products;
  const categories = ['All', ...new Set(list.map((p) => p.category))];
  const shown = category === 'All' ? list : list.filter((p) => p.category === category);
  const perishable = list.filter((p) => p.perishable).length;
  const headroom = products.inventoryBudgetCents - products.openingCostCents;

  return (
    <>
      <section className="card">
        <h2>Store setup</h2>
        <div className="grid">
          <Tile label="Opening inventory budget" value={money(products.inventoryBudgetCents)} note="client maximum" />
          <Tile label="Opening inventory cost" value={money(products.openingCostCents)} note={money(headroom) + ' unused, not added to cash'} />
          <Tile label="Opening operating cash" value={money(products.openingCashCents)} note="available from Day 1" />
          <Tile label="Products" value={list.length} note={perishable + ' perishable, ' + (list.length - perishable) + ' shelf-stable'} />
          <Tile label="Simulated days" value={60} note="Day 1 is a Monday" />
          <Tile label="Replenishment lead time" value={c.rules.leadTimeDays + ' day'} note="ordered at close, on shelf next morning" />
        </div>
      </section>

      <section className="card">
        <h2>Customers and demand</h2>
        <p>
          Expected customers per day = {int(m.baseCustomersPerDay)} x weekday factor x weather factor x a random daily shock of about {pct(m.noisePct, 0)}, split into
          customer types and drawn from a Poisson distribution. The store is open {m.openHour}:00 to {m.closeHour}:00.
        </p>
        <div className="two">
          <div>
            <h3>Weekday factor</h3>
            <table>
              <thead><tr><th>Day</th><th className="num">Factor</th></tr></thead>
              <tbody>
                {m.weekdayFactor.map((f, i) => (
                  <tr key={i}><td>{dayNames[i]}</td><td className="num">{f}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Weather</h3>
            <table>
              <thead><tr><th>Weather</th><th className="num">Probability</th><th className="num">Footfall factor</th></tr></thead>
              <tbody>
                {Object.entries(m.weather).map(([name, w]) => (
                  <tr key={name}><td>{name}</td><td className="num">{pct(w.probability, 0)}</td><td className="num">{w.footfallFactor}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="two">
          <div>
            <h3>Customer type mix</h3>
            <table>
              <thead><tr><th>Type</th><th className="num">Weekday</th><th className="num">Weekend</th></tr></thead>
              <tbody>
                {Object.keys(m.customerTypes.weekday).map((type) => (
                  <tr key={type}><td>{type}</td><td className="num">{pct(m.customerTypes.weekday[type], 0)}</td><td className="num">{pct(m.customerTypes.weekend[type], 0)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Shopping missions</h3>
            <table>
              <thead><tr><th>Mission</th><th className="num">Product lines</th></tr></thead>
              <tbody>
                {Object.entries(m.missions).map(([name, mission]) => (
                  <tr key={name}><td>{name.replace('_', ' ')}</td><td className="num">{mission.minLines} to {mission.maxLines}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <h3>Declared anomaly</h3>
        <ul>
          {m.events.map((e) => (
            <li key={e.day}>Day {e.day}: {e.name}, visitor arrivals x {e.visitorMultiplier}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Store Brain rules</h2>
        <table>
          <thead><tr><th>Rule</th><th className="num">Value</th></tr></thead>
          <tbody>
            {RULES.map(([key, label]) => (
              <tr key={key}><td>{label}</td><td className="num">{show(c.brainRules[key])}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Declared assumptions</h2>
        <ol>
          {c.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ol>
        <p className="muted">This is a pre-operational prototype. Real operating data would be needed to validate and calibrate every assumption above.</p>
      </section>

      <section className="card">
        <h2>Product catalogue and opening inventory</h2>
        <div className="toolbar">
          <label htmlFor="cat">Category</label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <span className="muted">{shown.length} of {list.length} products</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Product</th><th>Category</th>
                <th className="num">Unit cost</th><th className="num">Price</th><th className="num">Opening qty</th>
                <th className="num">Opening cost</th><th>Perishable</th><th className="num">Shelf life (days)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.productId}>
                  <td>{p.productId}</td><td>{p.name}</td><td>{p.category}</td>
                  <td className="num">{money(p.unitCostCents)}</td><td className="num">{money(p.unitPriceCents)}</td>
                  <td className="num">{int(p.initialQty)}</td><td className="num">{money(p.openingCostCents)}</td>
                  <td>{p.perishable ? 'Yes' : 'No'}</td><td className="num">{p.shelfLifeDays ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
