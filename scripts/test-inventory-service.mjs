import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  archiveProduct,
  createAdjustment,
  createCycleCount,
  createPurchases,
  createTransfer,
  listProducts,
  listSales,
  createSalesOrder,
  saveProduct,
  updateProductStatus,
  voidDocument
} from '../functions/api/_shared/inventory-service.js';
import { onRequestGet as listInventoryBalances } from '../functions/api/inventory/balances.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);

class D1Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.maxBindParams = Infinity;
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql) {
    return new D1Statement(this, sql);
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
  constructor(database, sql, params = []) {
    this.database = database;
    this.db = database.db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1Statement(this.database, this.sql, params.map(param => param === undefined ? null : param));
  }

  assertBindLimit() {
    if (this.params.length > this.database.maxBindParams) {
      throw new Error(`too many SQL bound parameters: ${this.params.length}`);
    }
  }

  async all() {
    this.assertBindLimit();
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }

  async first() {
    this.assertBindLimit();
    return this.db.prepare(this.sql).get(...this.params) || null;
  }

  async run() {
    this.assertBindLimit();
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: result };
  }
}

const env = { DB: new D1Database() };
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0007_shengma_integration.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0008_zn_order_fees.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0009_sales_received_amount.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0011_money_columns_align.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0013_stock_transfers.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0014_stock_movement_transfer_types.sql'), 'utf8'));

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
assert.equal((await listProducts(env, { id: 'p1' }))[0].purchaseAvgCost, 3.33);

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

await saveProduct(env, {
  id: 'p-cross-machine',
  name: 'Cross Machine Snack',
  machineId: 'machine-b',
  category: 'snack',
  sellPrice: 3
});
await createPurchases(env, {
  id: 'po-cross-machine',
  machineId: 'machine-a',
  date: '2026-05-02',
  items: [{ productId: 'p-cross-machine', quantity: 4, totalPrice: 12 }]
});
const balancesResponse = await listInventoryBalances({
  request: new Request('http://local.test/api/inventory/balances'),
  env
});
const inventoryBalances = await balancesResponse.json();
const crossMachineBalance = inventoryBalances.find(
  row => row.productId === 'p-cross-machine' && row.machineId === 'machine-a'
);
assert.equal(crossMachineBalance?.quantityOnHand, 4, 'inventory balances API should list actual balance machine');

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

await saveProduct(env, {
  id: 'p-shared',
  name: 'Shared Pool Drink',
  machineId: '1/2号机',
  category: 'drink',
  sellPrice: 4
});
await createPurchases(env, {
  id: 'po-shared',
  productId: 'p-shared',
  machineId: '2号机',
  quantity: 10,
  totalPrice: 20,
  date: '2026-05-04'
});
assert.deepEqual(await balance('p-shared', '2号机'), {
  quantity_on_hand: 10,
  avg_cost_cents: 200,
  inventory_value_cents: 2000,
  total_purchase_qty: 10,
  total_purchase_cost_cents: 2000
});
const sharedSale = await createSalesOrder(env, {
  id: 'so-shared',
  machineId: '2号机',
  date: '2026-05-04',
  items: [{ productId: 'p-shared', quantity: 3 }]
}, 'sale');
assert.equal(sharedSale.machineId, '2号机', 'sales order should keep the actual vending machine');
assert.deepEqual(await balance('p-shared', '2号机'), {
  quantity_on_hand: 7,
  avg_cost_cents: 200,
  inventory_value_cents: 1400,
  total_purchase_qty: 10,
  total_purchase_cost_cents: 2000
});
const sharedBalancesResponse = await listInventoryBalances({
  request: new Request('http://local.test/api/inventory/balances'),
  env
});
const sharedInventoryBalances = await sharedBalancesResponse.json();
const sharedInventoryBalance = sharedInventoryBalances.find(row => row.productId === 'p-shared' && row.machineId === '2号机');
assert.equal(sharedInventoryBalance?.machineId, '2号机', 'shared product purchase should write real machine inventory');
assert.equal(
  sharedInventoryBalances.some(row => row.productId === 'p-shared' && row.machineId === '1/2号机'),
  false,
  'inventory balances API should not expose folded shared machine rows'
);
await createAdjustment(env, {
  productId: 'p-shared',
  machineId: '2号机',
  quantityOnHand: 9
});
assert.deepEqual(await balance('p-shared', '2号机'), {
  quantity_on_hand: 9,
  avg_cost_cents: 200,
  inventory_value_cents: 1800,
  total_purchase_qty: 10,
  total_purchase_cost_cents: 2000
});

const transfer = await createTransfer(env, {
  id: 'tr-shared',
  productId: 'p-shared',
  fromMachineId: '2号机',
  toMachineId: '1号机',
  quantity: 4,
  reason: '现场补货'
});
assert.equal(transfer.quantity, 4);
assert.deepEqual(await balance('p-shared', '2号机'), {
  quantity_on_hand: 5,
  avg_cost_cents: 200,
  inventory_value_cents: 1000,
  total_purchase_qty: 10,
  total_purchase_cost_cents: 2000
});
assert.deepEqual(await balance('p-shared', '1号机'), {
  quantity_on_hand: 4,
  avg_cost_cents: 200,
  inventory_value_cents: 800,
  total_purchase_qty: 0,
  total_purchase_cost_cents: 0
});
assert.equal(await rowCount('stock_transfers'), 1, 'transfer should write stock_transfers');
assert.equal(await movementTypeCount('transfer_out'), 1, 'transfer should write outbound movement');
assert.equal(await movementTypeCount('transfer_in'), 1, 'transfer should write inbound movement');
await assert.rejects(
  () => createTransfer(env, {
    productId: 'p-shared',
    fromMachineId: '2号机',
    toMachineId: '1号机',
    quantity: 99,
    reason: 'oversized transfer'
  }),
  /库存不足/
);

const count = await createCycleCount(env, {
  id: 'cc-shared',
  machineId: '1号机',
  reason: '收工盘点',
  items: [{ productId: 'p-shared', observedQty: 6 }]
});
assert.equal(count.changedCount, 1);
assert.deepEqual(await balance('p-shared', '1号机'), {
  quantity_on_hand: 6,
  avg_cost_cents: 200,
  inventory_value_cents: 1200,
  total_purchase_qty: 0,
  total_purchase_cost_cents: 0
});
assert.equal(await refTypeCount('cycle_count'), 1, 'cycle count should write adjustment movements');
await assert.rejects(
  () => createCycleCount(env, {
    machineId: '1号机',
    reason: 'wrong machine count',
    items: [{ productId: 'p1', observedQty: 2 }]
  }),
  /不能盘点到 1号机/
);
await assert.rejects(
  () => createCycleCount(env, {
    machineId: '1号机',
    reason: 'duplicate product count',
    items: [
      { productId: 'p-shared', observedQty: 6 },
      { productId: 'p-shared', observedQty: 7 }
    ]
  }),
  /重复商品/
);

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
assert.equal((await listProducts(env, { id: 'p2' }))[0].purchaseAvgCost, 0, 'voided purchases should not leave a displayed purchase cost');

await archiveProduct(env, 'p2');
assert.equal((await listProducts(env, { id: 'p2', includeArchived: true }))[0].status, 'archived');
assert.equal((await listProducts(env, { id: 'p2' })).length, 0, 'off-shelf products should be hidden from active product lists');
await updateProductStatus(env, 'p2', 'active');
assert.equal((await listProducts(env, { id: 'p2' }))[0].status, 'active');
await assert.rejects(
  () => updateProductStatus(env, 'p2', 'unknown'),
  /Invalid product status/
);

await saveProduct(env, {
  id: 'p-negative',
  name: 'Negative Balance Juice',
  machineId: 'machine-negative',
  category: 'drink',
  sellPrice: 5
});
await createAdjustment(env, {
  productId: 'p-negative',
  machineId: 'machine-negative',
  quantityOnHand: -2,
  unitCost: 3
});
assert.deepEqual(await balance('p-negative', 'machine-negative'), {
  quantity_on_hand: -2,
  avg_cost_cents: 0,
  inventory_value_cents: 0,
  total_purchase_qty: 0,
  total_purchase_cost_cents: 0
});
await createPurchases(env, {
  id: 'po-negative-recover',
  productId: 'p-negative',
  quantity: 5,
  totalPrice: 15,
  date: '2026-05-05'
});
assert.deepEqual(await balance('p-negative', 'machine-negative'), {
  quantity_on_hand: 3,
  avg_cost_cents: 300,
  inventory_value_cents: 900,
  total_purchase_qty: 5,
  total_purchase_cost_cents: 1500
});

await saveProduct(env, {
  id: 'p-bulk-sales',
  name: 'Bulk Sales Soda',
  machineId: 'machine-bulk',
  category: 'drink',
  sellPrice: 2
});
await createPurchases(env, {
  id: 'po-bulk-sales',
  productId: 'p-bulk-sales',
  quantity: 120,
  totalPrice: 120,
  date: '2026-05-01'
});
for (let index = 0; index < 120; index += 1) {
  await createSalesOrder(env, {
    id: `so-bulk-${String(index).padStart(3, '0')}`,
    machineId: 'machine-bulk',
    date: '2026-05-10',
    items: [{ productId: 'p-bulk-sales', quantity: 1 }]
  }, 'sale');
}
env.DB.maxBindParams = 100;
const bulkSales = await listSales(env, {
  yearMonth: '2026-05',
  status: 'active',
  machineId: 'machine-bulk',
  limit: 200
});
env.DB.maxBindParams = Infinity;
assert.equal(bulkSales.length, 120, 'sales list should handle more than 100 orders');
assert.equal(bulkSales.every(order => order.items.length === 1), true, 'batched sales list should include every order item');

assert.equal(await movementBalanceDiffCount(), 0, 'movement totals should match inventory_balances');
console.log('inventory service ledger tests passed');

async function balance(productId, machineId) {
  const row = await env.DB.prepare(`
    SELECT quantity_on_hand, avg_cost_cents, inventory_value_cents, total_purchase_qty, total_purchase_cost_cents
    FROM inventory_balances
    WHERE product_id = ? AND machine_id = ?
  `).bind(productId, machineId).first();
  if (!row) {
    return {
      quantity_on_hand: 0,
      avg_cost_cents: 0,
      inventory_value_cents: 0,
      total_purchase_qty: 0,
      total_purchase_cost_cents: 0
    };
  }
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

async function movementTypeCount(type) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM stock_movements WHERE movement_type = ?')
    .bind(type)
    .first();
  return Number(row.count) || 0;
}

async function refTypeCount(type) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM stock_movements WHERE ref_type = ?')
    .bind(type)
    .first();
  return Number(row.count) || 0;
}

async function movementBalanceDiffCount() {
  const row = await env.DB.prepare(`
    WITH movement_totals AS (
      SELECT product_id, machine_id, SUM(qty_delta) AS recalculated_qty
      FROM stock_movements
      GROUP BY product_id, machine_id
    ),
    balance_keys AS (
      SELECT product_id, machine_id FROM inventory_balances
      UNION
      SELECT product_id, machine_id FROM movement_totals
    )
    SELECT COUNT(*) AS count
    FROM balance_keys k
    LEFT JOIN inventory_balances b
      ON b.product_id = k.product_id
     AND b.machine_id = k.machine_id
    LEFT JOIN movement_totals m
      ON m.product_id = k.product_id
     AND m.machine_id = k.machine_id
    WHERE COALESCE(b.quantity_on_hand, 0) != COALESCE(m.recalculated_qty, 0)
  `).first();
  return Number(row.count) || 0;
}
