import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as getCostGaps } from '../functions/api/profit/cost-gaps.js';
import {
  onRequestGet as getPurchases,
  onRequestPatch as patchPurchase,
  onRequestPost as postPurchase
} from '../functions/api/profit/purchases.js';
import {
  onRequestGet as getProducts,
  onRequestPatch as patchProduct,
  onRequestPost as postProduct
} from '../functions/api/profit/products.js';
import {
  onRequestGet as getSales,
  onRequestPatch as patchSale,
  onRequestPost as postSale
} from '../functions/api/profit/sales.js';
import { onRequestGet as getSummary } from '../functions/api/profit/summary.js';

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
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0001_initial_d1_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0007_shengma_integration.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0008_zn_order_fees.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0009_sales_received_amount.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0011_money_columns_align.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0019_parallel_profit_system.sql'), 'utf8'));

seedProfitRows();

const summaryResponse = await getSummary({
  request: new Request('https://example.test/api/profit/summary?month=2026-06&days=3'),
  env
});
const summary = await summaryResponse.json();

assert.equal(summary.month, '2026-06');
assert.equal(summary.kpis.grossSales, 13);
assert.equal(summary.kpis.refunds, 2);
assert.equal(summary.kpis.fees, 0.7);
assert.equal(summary.kpis.discounts, 0.3);
assert.equal(summary.kpis.netRevenue, 10);
assert.equal(summary.kpis.cogs, 3.2);
assert.equal(summary.kpis.grossProfit, 6.8);
assert.equal(summary.kpis.orderCount, 3);
assert.equal(summary.kpis.quantity, 3);
assert.equal(summary.kpis.purchaseCost, 6);
assert.equal(summary.kpis.missingCostProductCount, 1);
assert.equal(summary.kpis.mergedProductCount, 1);
assert.equal(summary.machineRanking.length, 2);
assert.equal(summary.machineRanking[0].machineId, '1号机');
assert.equal(summary.machineRanking[0].netRevenue, 7);
assert.equal(summary.machineRanking[0].quantity, 2);
assert.equal(summary.productRanking[0].productName, 'Cola');
assert.equal(summary.costGaps.length, 1);
assert.equal(summary.costGaps[0].productName, 'Water');
assert.equal(summary.productMerges.length, 1);
assert.equal(summary.productMerges[0].legacyProductCount, 2);

const filteredResponse = await getSummary({
  request: new Request('https://example.test/api/profit/summary?month=2026-06&machineId=2号机'),
  env
});
const filtered = await filteredResponse.json();
assert.equal(filtered.kpis.netRevenue, 3);
assert.equal(filtered.kpis.cogs, 0);
assert.equal(filtered.kpis.missingCostProductCount, 1);

const costGapsResponse = await getCostGaps({
  request: new Request('https://example.test/api/profit/cost-gaps?month=2026-06&limit=5'),
  env
});
const costGaps = await costGapsResponse.json();
assert.equal(costGaps.rows.length, 1);
assert.equal(costGaps.rows[0].productGlobalId, 'pg-water');

const productsResponse = await getProducts({
  request: new Request('https://example.test/api/profit/products?search=cola'),
  env
});
const products = await productsResponse.json();
assert.equal(products.rows.length, 1);
assert.equal(products.rows[0].productGlobalId, 'pg-cola');
assert.equal(products.rows[0].lastCost, 2);
assert.equal(products.rows[0].saleQuantity, 2);

const purchasesResponse = await getPurchases({
  request: new Request('https://example.test/api/profit/purchases?month=2026-06&search=cola'),
  env
});
const purchases = await purchasesResponse.json();
assert.equal(purchases.rows.length, 1);
assert.equal(purchases.rows[0].id, 'pr-1');
assert.equal(purchases.rows[0].totalCost, 6);
assert.equal(purchases.rows[0].quantity, 3);
assert.equal(purchases.rows[0].items[0].productName, 'Cola');

const salesResponse = await getSales({
  request: new Request('https://example.test/api/profit/sales?month=2026-06&machineId=1号机'),
  env
});
const sales = await salesResponse.json();
assert.equal(sales.rows.length, 2);
assert.equal(sales.rows[0].id, 'sr-refund');
assert.equal(sales.rows[0].refundAmount, 2);
assert.equal(sales.rows[0].signedCogs, -0.8);
assert.equal(sales.rows[1].id, 'sr-sale');
assert.equal(sales.rows[1].grossAmount, 10);
assert.equal(sales.rows[1].fees, 0.7);
assert.equal(sales.rows[1].items[0].productName, 'Cola');

const filteredSalesResponse = await getSales({
  request: new Request('https://example.test/api/profit/sales?month=2026-06&type=sale&machineId=2号机&search=water'),
  env
});
const filteredSales = await filteredSalesResponse.json();
assert.equal(filteredSales.rows.length, 1);
assert.equal(filteredSales.rows[0].id, 'sr-water');
assert.equal(filteredSales.rows[0].netRevenue, 3);

const manualProductResponse = await postProduct({
  request: jsonRequest('https://example.test/api/profit/products', {
    productName: 'Manual Tea',
    category: 'drink',
    defaultSellPrice: 4.5,
    status: 'active'
  }),
  env
});
assert.equal(manualProductResponse.status, 200);
const manualProductBody = await manualProductResponse.json();
assert.equal(manualProductBody.product.productName, 'Manual Tea');
assert.equal(manualProductBody.product.defaultSellPrice, 4.5);
const manualProductId = manualProductBody.product.productGlobalId;

const archivedProductResponse = await patchProduct({
  request: jsonRequest('https://example.test/api/profit/products', {
    productGlobalId: manualProductId,
    status: 'archived'
  }),
  env
});
assert.equal(archivedProductResponse.status, 200);
assert.equal((await archivedProductResponse.json()).product.status, 'archived');

const restoredProductResponse = await patchProduct({
  request: jsonRequest('https://example.test/api/profit/products', {
    productGlobalId: manualProductId,
    status: 'active'
  }),
  env
});
assert.equal((await restoredProductResponse.json()).product.status, 'active');

const manualPurchaseResponse = await postPurchase({
  request: jsonRequest('https://example.test/api/profit/purchases', {
    recordDate: '2026-06-10',
    source: 'manual',
    note: 'manual purchase',
    items: [{
      productGlobalId: manualProductId,
      quantity: 2,
      unitCost: 1.5
    }]
  }),
  env
});
assert.equal(manualPurchaseResponse.status, 200);
const manualPurchase = (await manualPurchaseResponse.json()).record;
assert.equal(manualPurchase.totalCost, 3);
assert.equal(manualPurchase.items[0].unitCost, 1.5);

const manualSaleResponse = await postSale({
  request: jsonRequest('https://example.test/api/profit/sales', {
    type: 'sale',
    machineId: '1号机',
    recordDate: '2026-06-11',
    source: 'manual',
    platformFee: 0.2,
    serviceFee: 0.1,
    discount: 0.3,
    items: [{
      productGlobalId: manualProductId,
      quantity: 2,
      unitPrice: 4.5
    }]
  }),
  env
});
assert.equal(manualSaleResponse.status, 200);
const manualSale = (await manualSaleResponse.json()).record;
assert.equal(manualSale.grossAmount, 9);
assert.equal(manualSale.netRevenue, 8.4);
assert.equal(manualSale.totalCogs, 3);
assert.equal(manualSale.grossProfit, 5.4);
assert.equal(manualSale.items[0].unitCost, 1.5);

const afterManualSummaryResponse = await getSummary({
  request: new Request('https://example.test/api/profit/summary?month=2026-06&machineId=1号机'),
  env
});
const afterManualSummary = await afterManualSummaryResponse.json();
assert.equal(afterManualSummary.kpis.netRevenue, 15.4);
assert.equal(afterManualSummary.kpis.cogs, 6.2);

const voidSaleResponse = await patchSale({
  request: jsonRequest('https://example.test/api/profit/sales', { id: manualSale.id }),
  env
});
assert.equal(voidSaleResponse.status, 200);
assert.equal((await voidSaleResponse.json()).record.status, 'voided');

const voidPurchaseResponse = await patchPurchase({
  request: jsonRequest('https://example.test/api/profit/purchases', { id: manualPurchase.id }),
  env
});
assert.equal(voidPurchaseResponse.status, 200);
assert.equal((await voidPurchaseResponse.json()).record.status, 'voided');

const serviceSource = readFileSync(
  join(projectRoot, 'functions', 'api', '_shared', 'profit-service.js'),
  'utf8'
);
for (const forbidden of ['inventory_balances', 'stock_movements', 'inventory-service']) {
  assert.equal(serviceSource.includes(forbidden), false, `profit API should not read ${forbidden}`);
}

console.log('profit API tests passed');

function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function seedProfitRows() {
  env.DB.exec(`
    INSERT INTO products_global (
      id, canonical_name, normalized_name, category, default_sell_price_cents,
      status, legacy_product_count, source_product_ids_json, created_at, updated_at
    ) VALUES
      ('pg-cola', 'Cola', 'cola', 'drink', 500, 'active', 2, '["p-cola-1","p-cola-2"]', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('pg-water', 'Water', 'water', 'drink', 300, 'active', 1, '["p-water"]', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

    INSERT INTO product_aliases (
      id, product_global_id, alias_name, normalized_alias, source, source_product_id,
      source_machine_id, status, created_at, updated_at
    ) VALUES
      ('pa-cola-1', 'pg-cola', 'Cola A', 'cola a', 'legacy-products', 'p-cola-1', '1号机', 'active', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('pa-cola-2', 'pg-cola', 'Cola B', 'cola b', 'legacy-products', 'p-cola-2', '2号机', 'active', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('pa-water', 'pg-water', 'Water', 'water', 'legacy-products', 'p-water', '2号机', 'active', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

    INSERT INTO purchase_records (
      id, legacy_purchase_id, record_date, source, status, created_at, updated_at
    ) VALUES (
      'pr-1', 'po-1', '2026-06-01', 'manual', 'active',
      '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'
    );

    INSERT INTO purchase_record_items (
      id, purchase_record_id, product_global_id, legacy_purchase_item_id,
      legacy_product_id, quantity, unit_cost_cents, total_cost_cents, created_at
    ) VALUES (
      'pri-1', 'pr-1', 'pg-cola', 'pi-1', 'p-cola-1', 3, 200, 600,
      '2026-06-01T00:00:00.000Z'
    );

    INSERT INTO sales_records (
      id, legacy_sales_id, type, machine_id, record_date, year_month, source,
      gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
      discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
      status, created_at, updated_at
    ) VALUES
      ('sr-sale', 'so-sale', 'sale', '1号机', '2026-06-02', '2026-06', 'manual', 1000, 0, 50, 20, 30, 900, 400, 500, 'active', '2026-06-02T00:00:00.000Z', '2026-06-02T00:00:00.000Z'),
      ('sr-refund', 'so-refund', 'refund', '1号机', '2026-06-03', '2026-06', 'manual', 0, 200, 0, 0, 0, -200, 80, -120, 'active', '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z'),
      ('sr-water', 'so-water', 'sale', '2号机', '2026-06-03', '2026-06', 'manual', 300, 0, 0, 0, 0, 300, 0, 300, 'active', '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z');

    INSERT INTO sales_record_items (
      id, sales_record_id, product_global_id, legacy_sales_item_id, legacy_product_id,
      quantity, unit_price_cents, line_amount_cents, unit_cost_cents, line_cogs_cents, created_at
    ) VALUES
      ('sri-sale', 'sr-sale', 'pg-cola', 'si-sale', 'p-cola-1', 2, 500, 1000, 200, 400, '2026-06-02T00:00:00.000Z'),
      ('sri-refund', 'sr-refund', 'pg-cola', 'si-refund', 'p-cola-1', 1, 200, 200, 80, 80, '2026-06-03T00:00:00.000Z'),
      ('sri-water', 'sr-water', 'pg-water', 'si-water', 'p-water', 1, 300, 300, 0, 0, '2026-06-03T00:00:00.000Z');

    INSERT INTO cost_snapshots (
      id, product_global_id, source_type, source_record_id, source_item_id,
      legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
    ) VALUES (
      'cs-cola', 'pg-cola', 'purchase_item', 'pr-1', 'pri-1', 'p-cola-1',
      200, 3, 600, '2026-06-01', '2026-06-01T00:00:00.000Z'
    );
  `);
}
