export const model = {
  baseCustomersPerDay: 500,
  noisePct: 0.1,
  weekdayFactor: [0.65, 1, 1, 1, 1, 1, 0.85],
  openHour: 6,
  closeHour: 22,
  weather: {
    mild: { probability: 0.5, footfallFactor: 1, categoryWeight: {}, productWeight: {} },
    rainy: { probability: 0.25, footfallFactor: 0.85, categoryWeight: {}, productWeight: { 'PER-005': 8 } },
    hot: { probability: 0.15, footfallFactor: 1, categoryWeight: { 'Drinks': 1.5 }, productWeight: {} },
    cold: { probability: 0.1, footfallFactor: 1, categoryWeight: { 'Drinks': 0.8 }, productWeight: {} }
  },
  customerTypes: {
    weekday: { office: 0.55, resident: 0.3, visitor: 0.15 },
    weekend: { office: 0.1, resident: 0.45, visitor: 0.45 }
  },
  hourWeights: {
    office: [2, 8, 12, 8, 4, 5, 10, 10, 5, 4, 5, 9, 8, 4, 2, 1],
    resident: [1, 4, 8, 8, 6, 5, 5, 4, 4, 5, 6, 9, 10, 9, 6, 3],
    visitor: [0, 1, 2, 4, 7, 9, 10, 10, 9, 8, 7, 6, 5, 4, 2, 1]
  },
  missionMix: {
    office: { quick_meal: 0.45, drink_snack: 0.35, top_up: 0.15, main_shop: 0.05 },
    resident: { quick_meal: 0.1, drink_snack: 0.2, top_up: 0.4, main_shop: 0.3 },
    visitor: { quick_meal: 0.4, drink_snack: 0.45, top_up: 0.13, main_shop: 0.02 }
  },
  missions: {
    quick_meal: {
      minLines: 1,
      maxLines: 3,
      unitsPerLine: { 1: 0.85, 2: 0.15 },
      categoryWeights: { 'Ready-to-Eat': 0.5, 'Drinks': 0.3, 'Snacks & Confectionery': 0.1, 'Fresh & Bakery': 0.05, 'Dairy & Chilled': 0.05 }
    },
    drink_snack: {
      minLines: 1,
      maxLines: 2,
      unitsPerLine: { 1: 0.8, 2: 0.2 },
      categoryWeights: { 'Drinks': 0.55, 'Snacks & Confectionery': 0.35, 'Dairy & Chilled': 0.05, 'Personal & Convenience': 0.05 }
    },
    top_up: {
      minLines: 2,
      maxLines: 5,
      unitsPerLine: { 1: 0.7, 2: 0.25, 3: 0.05 },
      categoryWeights: { 'Dairy & Chilled': 0.25, 'Fresh & Bakery': 0.25, 'Grocery & Pantry': 0.2, 'Drinks': 0.1, 'Snacks & Confectionery': 0.05, 'Household Essentials': 0.05, 'Personal & Convenience': 0.05, 'Ready-to-Eat': 0.05 }
    },
    main_shop: {
      minLines: 6,
      maxLines: 12,
      unitsPerLine: { 1: 0.6, 2: 0.3, 3: 0.1 },
      categoryWeights: { 'Grocery & Pantry': 0.28, 'Dairy & Chilled': 0.2, 'Fresh & Bakery': 0.18, 'Household Essentials': 0.12, 'Drinks': 0.08, 'Snacks & Confectionery': 0.06, 'Personal & Convenience': 0.04, 'Ready-to-Eat': 0.04 }
    }
  },
  events: [
    { day: 20, name: 'Town Hall street event', visitorMultiplier: 1.6 }
  ],
  popularity: {
    'GRO-001': 8, 'GRO-002': 7, 'GRO-003': 8, 'GRO-004': 5, 'GRO-005': 9, 'GRO-006': 4, 'GRO-007': 6, 'GRO-008': 5, 'GRO-009': 3, 'GRO-010': 2,
    'DRK-001': 10, 'DRK-002': 8, 'DRK-003': 6, 'DRK-004': 3, 'DRK-005': 8, 'DRK-006': 5, 'DRK-007': 3, 'DRK-008': 5, 'DRK-009': 3,
    'SNK-001': 8, 'SNK-002': 5, 'SNK-003': 6, 'SNK-004': 9, 'SNK-005': 5, 'SNK-006': 5, 'SNK-007': 3, 'SNK-008': 4,
    'HSE-001': 5, 'HSE-002': 5, 'HSE-003': 8, 'HSE-004': 4, 'HSE-005': 4,
    'PER-001': 8, 'PER-002': 6, 'PER-003': 5, 'PER-004': 7, 'PER-005': 1,
    'DAI-001': 10, 'DAI-002': 5, 'DAI-003': 5, 'DAI-004': 4, 'DAI-005': 7, 'DAI-006': 8, 'DAI-007': 3, 'DAI-008': 9,
    'FRB-001': 8, 'FRB-002': 5, 'FRB-003': 8, 'FRB-004': 9, 'FRB-005': 6, 'FRB-006': 3, 'FRB-007': 4,
    'RTE-001': 9, 'RTE-002': 8, 'RTE-003': 7, 'RTE-004': 7, 'RTE-005': 6, 'RTE-006': 4, 'RTE-007': 4
  }
};
