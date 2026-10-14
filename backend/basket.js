import { model } from './model.js';
import { pickWeighted, pickWeightedIndex, randInt } from './random.js';

export function drawCustomer(rng, type) {
  return {
    type,
    hour: model.openHour + pickWeightedIndex(rng, model.hourWeights[type]),
    mission: pickWeighted(rng, model.missionMix[type])
  };
}

export function createBasketDrawer(products) {
  const byCategory = {};
  for (const p of products) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p.id);
  }

  return function drawBasket(rng, mission, weather) {
    const m = model.missions[mission];
    const w = model.weather[weather];

    const categoryWeights = {};
    for (const [category, weight] of Object.entries(m.categoryWeights)) {
      categoryWeights[category] = weight * (w.categoryWeight[category] ?? 1);
    }

    const lineCount = randInt(rng, m.minLines, m.maxLines);
    const basket = new Map();

    for (let i = 0; i < lineCount; i++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const category = pickWeighted(rng, categoryWeights);
        const ids = byCategory[category];
        const weights = ids.map((id) => model.popularity[id] * (w.productWeight[id] ?? 1));
        const productId = ids[pickWeightedIndex(rng, weights)];
        if (basket.has(productId)) continue;
        basket.set(productId, Number(pickWeighted(rng, m.unitsPerLine)));
        break;
      }
    }

    return [...basket].map(([productId, quantity]) => ({ productId, quantity }));
  };
}
