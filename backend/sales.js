import db from './db.js';

export function createSeller(runId, products, state) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const insertCustomer = db.prepare(`
    INSERT INTO customers (run_id, day, hour, customer_type, mission)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (run_id, day, hour, customer_id, total_cents)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO transaction_items (run_id, transaction_id, product_id, quantity, unit_price_cents, unit_cost_cents, line_total_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements (run_id, day, product_id, lot_id, movement_type, quantity_change, transaction_id)
    VALUES (?, ?, ?, ?, 'SALE', ?, ?)
  `);
  const insertLost = db.prepare(`
    INSERT INTO lost_sales (run_id, day, customer_id, product_id, quantity_short, unit_price_cents)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return function sell(day, customer, basket) {
    const seen = new Set();
    for (const line of basket) {
      if (!byId[line.productId]) throw new Error('unknown product ' + line.productId);
      if (seen.has(line.productId)) throw new Error('duplicate line for ' + line.productId);
      seen.add(line.productId);
      if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('invalid quantity for ' + line.productId);
    }

    const customerId = Number(insertCustomer.run(runId, day, customer.hour, customer.type, customer.mission).lastInsertRowid);

    const lines = [];
    const shortages = [];
    let totalCents = 0;

    for (const want of basket) {
      const product = byId[want.productId];
      const sellable = (state.get(want.productId) || []).filter(
        (lot) => lot.qty > 0 && (lot.expiryDay === null || lot.expiryDay > day)
      );
      let remaining = want.quantity;
      const takes = [];
      for (const lot of sellable) {
        if (remaining === 0) break;
        const take = Math.min(lot.qty, remaining);
        takes.push({ lot, take });
        remaining -= take;
      }
      const sold = want.quantity - remaining;
      if (remaining > 0) shortages.push({ productId: want.productId, short: remaining });
      if (sold > 0) {
        lines.push({ product, sold, takes });
        totalCents += sold * product.priceCents;
      }
    }

    for (const s of shortages) {
      insertLost.run(runId, day, customerId, s.productId, s.short, byId[s.productId].priceCents);
    }

    if (lines.length === 0) {
      return { customerId, transactionId: null, totalCents: 0, units: 0, cogsCents: 0, shortages };
    }

    const transactionId = Number(insertTransaction.run(runId, day, customer.hour, customerId, totalCents).lastInsertRowid);
    let units = 0;
    let cogsCents = 0;

    for (const { product, sold, takes } of lines) {
      insertItem.run(runId, transactionId, product.id, sold, product.priceCents, product.costCents, sold * product.priceCents);
      for (const { lot, take } of takes) {
        insertMovement.run(runId, day, product.id, lot.lotId, -take, transactionId);
        lot.qty -= take;
      }
      state.set(product.id, state.get(product.id).filter((lot) => lot.qty > 0));
      units += sold;
      cogsCents += sold * product.costCents;
    }

    return { customerId, transactionId, totalCents, units, cogsCents, shortages };
  };
}
