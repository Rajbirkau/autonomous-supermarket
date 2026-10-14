const isPositiveInt = (n) => Number.isInteger(n) && n > 0;
const isNonEmptyString = (s) => typeof s === 'string' && s.trim() !== '';

export function validateProducts(products, budgetCents) {
  if (!Array.isArray(products) || products.length === 0) {
    return ['product list is empty or not an array'];
  }

  const errors = [];
  const seen = new Set();
  let totalCents = 0;

  for (const p of products) {
    if (!p || !isNonEmptyString(p.id)) {
      errors.push('a product is missing a valid id');
      continue;
    }

    if (seen.has(p.id)) errors.push(`${p.id}: duplicate product id`);
    seen.add(p.id);

    if (!isNonEmptyString(p.name)) errors.push(`${p.id}: name must be a non-empty string`);
    if (!isNonEmptyString(p.category)) errors.push(`${p.id}: category must be a non-empty string`);
    if (!isPositiveInt(p.costCents)) errors.push(`${p.id}: costCents must be a positive whole number of cents`);
    if (!isPositiveInt(p.priceCents)) errors.push(`${p.id}: priceCents must be a positive whole number of cents`);
    if (isPositiveInt(p.costCents) && isPositiveInt(p.priceCents) && p.priceCents <= p.costCents) {
      errors.push(`${p.id}: selling price must be higher than purchase cost`);
    }
    if (!Number.isInteger(p.initialQty) || p.initialQty < 0) errors.push(`${p.id}: initialQty must be a whole number of 0 or more`);

    if (typeof p.perishable !== 'boolean') {
      errors.push(`${p.id}: perishable must be true or false`);
    } else if (p.perishable && !isPositiveInt(p.shelfLifeDays)) {
      errors.push(`${p.id}: perishable products need shelfLifeDays of at least 1`);
    } else if (!p.perishable && p.shelfLifeDays !== null) {
      errors.push(`${p.id}: non-perishable products must have shelfLifeDays null`);
    }

    if (isPositiveInt(p.costCents) && Number.isInteger(p.initialQty) && p.initialQty >= 0) {
      totalCents += p.costCents * p.initialQty;
    }
  }

  if (totalCents > budgetCents) {
    errors.push(`opening inventory cost ${totalCents} cents exceeds budget of ${budgetCents} cents`);
  }

  return errors;
}
