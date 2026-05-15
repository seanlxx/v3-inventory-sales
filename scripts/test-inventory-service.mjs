import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAdjustment,
  createPurchases,
  createSalesOrder,
  saveProduct,
  voidDocument
} from '../functions/api/_shared/inventory-service.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);

class D1Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql) {
    return new D1Statement(this.db, sql);
  }

  async batch(statements) {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.db.exec('COMMIT;');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  exec(sql) {
    this.db.exec(sql);
  }
}

class D1Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1Statement(this.db, this.sql, params.map(param => param === undefined ? null : param));
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.params) || null;
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: result };
  }
}

const env = { DB: new D1Database() };
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));

await saveProduct(env, {
  id: 'p1',
  name: 'Test Tea',
  machineId: 'machine-a',
  category: 'drink',
  sellPrice: 5
});

const purchase = await createPurchases(env, {
  id: 'po1',
  productId: 'p1',
  quantity: 3,
  totalPrice: 10,
  date: '2026-05-01'
});
assert.equal(purchase.purchases[0].quantity, 3);
assert.deepEqual(await balance('p1', 'machine-a'), {
  quantity_on_hand: 3,
  avg_cost_cents: 333,
  inventory_value_cents: 1000,
  total_purchase_qty: 3,
  total_purchase_cost_cents: 1000
});

const sale = await createSalesOrder(env, {
  id: 'so1',
  machineId: 'machine-a',
  date: '2026-05-02',
  items: [{ productId: 'p1', quantity: 2 }]
}, 'sale');
assert.equal(sale.totalAmount, 10);
assert.equal(sale.totalCogs, 6.66);
assert.deepEqual(await balance('p1', 'machine-a'), {
  quantity_on_hand: 1,
  avg_cost_cents: 334,
  inventory_value_cents: 334,
  total_purchase_qty: 3,
  total_purchase_cost_cents: 1000
});

await assert.rejects(
  () => createSalesOrder(env, {
    id: 'so-insufficient',
    machineId: 'machine-a',
    date: '2026-05-02',
    items: [{ productId: 'p1', quantity: 2 }]
  }, 'sale'),
  /库存不足/
);
assert.equal(await rowCount('sales_orders'), 1, 'failed sale should not write a partial order');

await saveProduct(env, {
  id: 'p-inferred-machine',
  name: 'Inferred Machine Juice',
  machineId: 'machine-b',
  category: 'drink',
  sellPrice: 6
});
await createPurchases(env, {
  id: 'po-inferred-machine',
  productId: 'p-inferred-machine',
  quantity: 2,
  totalPrice: 8,
  date: '2026-05-02'
});
const inferredMachineSale = await createSalesOrder(env, {
  id: 'so-inferred-machine',
  date: '2026-05-02',
  items: [{ productId: 'p-inferred-machine', quantity: 1 }]
}, 'sale');
assert.equal(inferredMachineSale.machineId, 'machine-b');
assert.deepEqual(await balance('p-inferred-machine', 'machine-b'), {
  quantity_on_hand: 1,
  avg_cost_cents: 400,
  inventory_value_cents: 400,
  total_purchase_qty: 2,
  total_purchase_cost_cents: 800
});
await assert.rejects(
  () => createSalesOrder(env, {
    id: 'so-wrong-machine',
    machineId: 'machine-a',
    date: '2026-05-02',
    items: [{ productId: 'p-inferred-machine', quantity: 1 }]
  }, 'sale'),
  /不能记入 machine-a/
);
assert.equal(await rowCount('sales_orders'), 2, 'machine mismatch should not write a partial order');

const refund = await createSalesOrder(env, {
  id: 'rf1',
  machineId: 'machine-a',
  date: '2026-05-03',
  items: [{ productId: 'p1', quantity: -1 }]
}, 'refund');
assert.equal(refund.type, 'refund');
assert.deepEqual(await balance('p1', 'machine-a'), {
  quantity_on_hand: 2,
  avg_cost_cents: 334,
  inventory_value_cents: 668,
  total_purchase_qty: 3,
  total_purchase_cost_cents: 1000
});

const loss = await createSalesOrder(env, {
  id: 'lo1',
  machineId: 'machine-a',
  date: '2026-05-04',
  items: [{ productId: 'p1', quantity: 1 }]
}, 'loss');
assert.equal(loss.totalAmount, 0);
assert.equal(loss.totalCogs, 3.34);
assert.deepEqual(await balance('p1', 'machine-a'), {
  quantity_on_hand: 1,
  avg_cost_cents: 334,
  inventory_value_cents: 334,
  total_purchase_qty: 3,
  total_purchase_cost_cents: 1000
});

await voidDocument(env, { refType: 'sales_order', id: 'lo1' });
assert.deepEqual(await balance('p1', 'machine-a'), {
  quantity_on_hand: 2,
  avg_cost_cents: 334,
  inventory_value_cents: 668,
  total_purchase_qty: 3,
  total_purchase_cost_cents: 1000
});

await createAdjustment(env, {
  productId: 'p1',
  machineId: 'machine-a',
  quantityOnHand: 5
});
assert.deepEqual(await balance('p1', 'machine-a'), {
  quantity_on_hand: 5,
  avg_cost_cents: 334,
  inventory_value_cents: 1670,
  total_purchase_qty: 3,
  total_purchase_cost_cents: 1000
});

await saveProduct(env, {
  id: 'p2',
  name: 'Rounding Water',
  machineId: 'machine-a',
  category: 'drink',
  sellPrice: 4
});
await createPurchases(env, {
  id: 'po-rounding',
  productId: 'p2',
  quantity: 3,
  totalPrice: 10,
  date: '2026-05-05'
});
await voidDocument(env, { refType: 'purchase_order', id: 'po-rounding' });
assert.deepEqual(await balance('p2', 'machine-a'), {
  quantity_on_hand: 0,
  avg_cost_cents: 0,
  inventory_value_cents: 0,
  total_purchase_qty: 0,
  total_purchase_cost_cents: 0
});

assert.equal(await movementBalanceDiffCount(), 0, 'movement totals should match inventory_balances');
console.log('inventory service ledger tests passed');

async function balance(productId, machineId) {
  const row = await env.DB.prepare(`
    SELECT quantity_on_hand, avg_cost_cents, inventory_value_cents, total_purchase_qty, total_purchase_cost_cents
    FROM inventory_balances
    WHERE product_id = ? AND machine_id = ?
  `).bind(productId, machineId).first();
  return {
    quantity_on_hand: row.quantity_on_hand,
    avg_cost_cents: row.avg_cost_cents,
    inventory_value_cents: row.inventory_value_cents,
    total_purchase_qty: row.total_purchase_qty,
    total_purchase_cost_cents: row.total_purchase_cost_cents
  };
}

async function rowCount(table) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row.count) || 0;
}

async function movementBalanceDiffCount() {
  const row = await env.DB.prepare(`
    WITH movement_totals AS (
      SELECT product_id, machine_id, SUM(qty_delta) AS recalculated_qty
      FROM stock_movements
      GROUP BY product_id, machine_id
    )
    SELECT COUNT(*) AS count
    FROM inventory_balances b
    LEFT JOIN movement_totals m
      ON m.product_id = b.product_id
     AND m.machine_id = b.machine_id
    WHERE b.quantity_on_hand != COALESCE(m.recalculated_qty, 0)
  `).first();
  return Number(row.count) || 0;
}
