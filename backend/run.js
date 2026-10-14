import db from './db.js';
import { products } from './products.js';
import { model } from './model.js';
import { brainRules } from './brain_rules.js';
import { createRun, SIMULATION_DAYS } from './simulation.js';
import { createRng } from './random.js';
import { createEngine } from './engine.js';

const assumptions = [
  'Customer arrivals: each day the expected customer count is 500 x a weekday factor (Sunday 0.65, Saturday 0.85, Monday to Friday 1.0) x a weather factor (rain 0.85) x a random daily demand shock of about 10 percent. That expectation is split into office, resident and visitor customers (the split differs on weekdays and weekends) and each count is drawn from a Poisson distribution. Day 1 is a Monday.',
  'Weather is drawn independently each day (mild 50 percent, rainy 25, hot 15, cold 10), so there are no realistic multi-day spells of weather.',
  'One declared anomaly: a Town Hall street event on Day 20 multiplies visitor arrivals by 1.6.',
  'Shopping behaviour: each customer gets an arrival hour from a type-specific hourly profile and a shopping mission (quick meal, drink and snack, top-up, main shop) from a type-specific mix. The mission sets the number of product lines, units per line and category weights. Within a category, products are chosen by hand-assigned popularity scores from 1 to 10, which are modelling judgements and not calibrated to real data.',
  'Weather adjusts demand: hot days raise drink weights, cold days lower them, and rain raises the umbrella weight eight-fold.',
  'Perishable stock: a unit received on day r with shelf life s is sellable on days r to r+s-1 and is removed as a write-off when day r+s opens. Each receipt is its own lot, and customers are sold the soonest-expiring lot first.',
  'Availability: a customer buys what is available and any shortfall is recorded as a lost sale. There is no substitution, no return visit and no lasting loss of goodwill.',
  'Demand estimate used by the Store Brain: the average over the last 7 days of units sold plus units customers wanted but could not buy. This assumes the store system can log failed purchase attempts.',
  'Low stock: usable stock (units still sellable tomorrow morning) below 2 days of estimated demand, or below 1 day for products with a 1-day shelf life. Sold out: no units on hand at close.',
  'Replenishment: only low or sold-out products are ordered, up to 7 days of demand for non-perishables and the smaller of 3 days and the shelf life for perishables. Orders arrive before opening the next day, and none are placed after Day 60. Suppliers are assumed to have unlimited stock, no minimum order quantities and no delivery failures.',
  'Cash constraint: orders are filled lowest cover first, each limited to the cash remaining, and any shortfall is logged as CASH_CONSTRAINED. In every development run cash was never short, so this rule is enforced in code but has not been exercised by recorded history.',
  'Slow movers: from Day 7, usable stock above 14 days of estimated demand is flagged SLOW_MOVER. A flagged product is never reordered while it is slow, and its next reorder is trimmed to 4 days of cover.',
  'Expiry: any lot that will be removed when the next day opens is flagged with an EXPIRY_WARNING the night before and excluded from usable stock.',
  'Event logging: LOW_STOCK, SOLD_OUT and SLOW_MOVER are logged when a product enters that state, not on every day it stays there, so one SOLD_OUT event is a stockout episode that can span several days.',
  'Prices and margins: prices and costs are fixed for the whole run, with no discounts. The blended gross margin is about 45 percent, well above the roughly 28 percent gross margin reported by the large Australian supermarket chains. This is a deliberate small-format CBD convenience premium with no calibration source, and real operating data would be needed to validate it.',
  'Gross profit and closing cash exclude rent, wages, utilities, insurance, hardware and overheads, which are outside the model boundary, so they are not net profit.'
];

export function runSimulation({ label, seed }) {
  const config = {
    model,
    brainRules,
    rules: {
      leadTimeDays: 1,
      shelfLife: 'a unit received on day r with shelf life s is sellable on days r to r+s-1 and removed when day r+s opens',
      sellingOrder: 'soonest-expiring lot first',
      dailyCycle: 'receive orders, remove expired stock, customers shop, book sales to cash, Store Brain review, place orders (none after day 60)',
      randomness: 'seeded mulberry32 generator, one stream per run'
    },
    assumptions
  };

  db.exec('BEGIN');
  try {
    const runId = createRun({ label, seed, products, config });
    const runDay = createEngine(runId, products, createRng(seed));
    for (let day = 1; day <= SIMULATION_DAYS; day++) runDay(day);
    db.prepare("UPDATE runs SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE run_id = ?").run(runId);
    db.exec('COMMIT');
    return runId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
