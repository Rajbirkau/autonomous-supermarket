import { model } from './model.js';
import { pickWeighted, normalish, poisson } from './random.js';

const weatherProbabilities = Object.fromEntries(
  Object.entries(model.weather).map(([name, w]) => [name, w.probability])
);

export function weekdayOf(day) {
  return day % 7;
}

export function drawWeather(rng) {
  return pickWeighted(rng, weatherProbabilities);
}

export function planDay(rng, day) {
  const weekday = weekdayOf(day);
  const dayType = weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
  const weather = drawWeather(rng);

  const todaysEvents = model.events.filter((e) => e.day === day);
  const visitorMultiplier = todaysEvents.reduce((m, e) => m * e.visitorMultiplier, 1);

  const shock = Math.max(0.5, 1 + model.noisePct * Math.SQRT2 * normalish(rng));
  const expectedToday =
    model.baseCustomersPerDay * model.weekdayFactor[weekday] * model.weather[weather].footfallFactor * shock;

  const counts = {};
  let total = 0;
  for (const [type, share] of Object.entries(model.customerTypes[dayType])) {
    const mean = expectedToday * share * (type === 'visitor' ? visitorMultiplier : 1);
    counts[type] = poisson(rng, mean);
    total += counts[type];
  }

  return {
    day,
    weekday,
    dayType,
    weather,
    eventName: todaysEvents.length > 0 ? todaysEvents.map((e) => e.name).join(', ') : null,
    counts,
    total
  };
}
