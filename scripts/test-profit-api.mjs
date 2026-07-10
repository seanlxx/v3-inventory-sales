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
import { onRequestPost as postSalesImport } from '../functions/api/profit/sales-import.js';

import { onRequestGet as getSummary } from '../functions/api/profit/summary.js';
import {
  saveProfitPurchase,
  saveProfitSale,
  voidProfitPurchase,
  voidProfitSale
} from '../functions/api/_shared/profit-service.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const MAX_D1_BINDINGS = 100;

class D1Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.nextBatchFailureIndex = null;
  }

  prepare(sql) {
    return new D1Statement(this.db, sql);
  }

  async batch(statements) {
    const failureIndex = this.nextBatchFailureIndex;
    this.nextBatchFailureIndex = null;
    this.db.exec('BEGIN');
    try {
      const results = [];
      for (let index = 0; index < statements.length; index += 1) {
        if (index === failureIndex) throw new Error('Injected D1 batch failure');
        results.push(await statements[index].run());
      }
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  failNextBatchAt(index) {
    this.nextBatchFailureIndex = index;
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
    this.assertBindingLimit();
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }

  async first() {
    this.assertBindingLimit();
    return this.db.prepare(this.sql).get(...this.params) || null;
  }

  async run() {
    this.assertBindingLimit();
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: result };
  }

  assertBindingLimit() {
    if (this.params.length > MAX_D1_BINDINGS) {
      throw new Error(`D1 binding limit exceeded: ${this.params.length}`);
    }
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
assert.equal(summary.productRanking[0].salesAmount, 8);
assert.equal(summary.productRanking[0].netRevenue, 7);
assert.equal(summary.productRanking[0].cogs, 3.2);
assert.equal(summary.productRanking[0].netProfit, 3.8);
assert.equal(summary.productRanking[0].grossProfit, 3.8);
assert.equal(summary.costGaps.length, 1);
assert.equal(summary.costGaps[0].productName, 'Water');
assert.equal(summary.productMerges.length, 1);
assert.equal(summary.productMerges[0].legacyProductCount, 2);

seedProductNetProfitRankingRows();
const netProfitRankingResponse = await getSummary({
  request: new Request('https://example.test/api/profit/summary?month=2026-04'),
  env
});
const netProfitRanking = await netProfitRankingResponse.json();
assert.equal(netProfitRanking.productRanking[0].productName, 'High Profit Tea');
assert.equal(netProfitRanking.productRanking[0].netProfit, 4);
assert.equal(netProfitRanking.productRanking[1].productName, 'Low Margin Snack');
assert.equal(netProfitRanking.productRanking[1].salesAmount, 20);
assert.equal(netProfitRanking.productRanking[1].netProfit, 1);

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

env.DB.exec(`
  INSERT INTO cost_snapshots (
    id, product_global_id, source_type, source_record_id, source_item_id,
    legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
  ) VALUES (
    'cs-zero-water', 'pg-water', 'manual_cost', 'accepted-zero-cost-test',
    'zero-cost:pg-water:2026-06', NULL, 0, NULL, 0, '2026-06-01',
    '2026-06-01T00:00:00.000Z'
  );
`);
const acceptedZeroCostSummaryResponse = await getSummary({
  request: new Request('https://example.test/api/profit/summary?month=2026-06&machineId=2号机'),
  env
});
const acceptedZeroCostSummary = await acceptedZeroCostSummaryResponse.json();
assert.equal(acceptedZeroCostSummary.kpis.missingCostProductCount, 0);
const acceptedZeroCostGapsResponse = await getCostGaps({
  request: new Request('https://example.test/api/profit/cost-gaps?month=2026-06&machineId=2号机&limit=5'),
  env
});
const acceptedZeroCostGaps = await acceptedZeroCostGapsResponse.json();
assert.equal(acceptedZeroCostGaps.rows.length, 0);

const productsResponse = await getProducts({
  request: new Request('https://example.test/api/profit/products?search=cola'),
  env
});
const products = await productsResponse.json();
assert.equal(products.rows.length, 1);
assert.equal(products.rows[0].productGlobalId, 'pg-cola');
assert.equal(products.rows[0].lastCost, 2);
assert.equal(products.rows[0].saleQuantity, 2);
assert.equal(products.rows[0].aliasCount, 2);
assert.equal(products.rows[0].aliases.length, 2);
assert.deepEqual(
  products.rows[0].aliases.map(alias => alias.aliasName),
  ['Cola A', 'Cola B']
);
assert.equal(products.rows[0].aliases[0].sourceMachineId, '1号机');

const aliasSearchResponse = await getProducts({
  request: new Request('https://example.test/api/profit/products?search=Cola%20A'),
  env
});
const aliasSearch = await aliasSearchResponse.json();
assert.equal(aliasSearch.rows.length, 1);
assert.equal(aliasSearch.rows[0].productGlobalId, 'pg-cola');

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

const productPurchasesResponse = await getPurchases({
  request: new Request('https://example.test/api/profit/purchases?month=all&status=all&productGlobalId=pg-cola'),
  env
});
const productPurchases = await productPurchasesResponse.json();
assert.equal(productPurchases.rows.length, 1);
assert.equal(productPurchases.rows[0].id, 'pr-1');

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

const productSalesResponse = await getSales({
  request: new Request('https://example.test/api/profit/sales?month=all&status=all&productGlobalId=pg-cola'),
  env
});
const productSales = await productSalesResponse.json();
assert.equal(productSales.rows.length, 2);
assert.equal(productSales.rows[0].id, 'sr-refund');
assert.equal(productSales.rows[1].id, 'sr-sale');

seedLargeSalesBatch();
const largeSalesResponse = await getSales({
  request: new Request('https://example.test/api/profit/sales?month=2026-05&status=active&limit=200'),
  env
});
const largeSales = await largeSalesResponse.json();
assert.equal(largeSales.rows.length, 120);
assert.equal(largeSales.rows.every(row => row.items.length === 1), true);

seedCurrentTrendRows();
const currentTrendResponse = await getSummary({
  request: new Request(`https://example.test/api/profit/summary?month=${new Date().toISOString().slice(0, 7)}&days=3`),
  env
});
const currentTrend = await currentTrendResponse.json();
assert.equal(currentTrend.dailyTrendByMachine.length, 2);
const machineOneTrend = currentTrend.dailyTrendByMachine.find(series => series.machineId === '1号机');
const machineTwoTrend = currentTrend.dailyTrendByMachine.find(series => series.machineId === '2号机');
assert.equal(machineOneTrend.points.at(-1).grossSales, 7);
assert.equal(machineTwoTrend.points.at(-1).grossSales, 3);

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
assert.equal(manualProductBody.product.aliases.length, 1);
assert.equal(manualProductBody.product.aliases[0].aliasName, 'Manual Tea');
assert.equal(manualProductBody.product.aliases[0].source, 'manual');
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
    items: [
      {
        productGlobalId: manualProductId,
        quantity: 2,
        unitCost: 1.5
      },
      {
        productGlobalId: 'pg-cola',
        quantity: 1,
        unitCost: 2.25
      }
    ]
  }),
  env
});
assert.equal(manualPurchaseResponse.status, 200);
const manualPurchase = (await manualPurchaseResponse.json()).record;
assert.equal(manualPurchase.itemCount, 2);
assert.equal(manualPurchase.quantity, 3);
assert.equal(manualPurchase.totalCost, 5.25);
assert.equal(manualPurchase.items.length, 2);
assert.equal(manualPurchase.items.find(item => item.productGlobalId === manualProductId).unitCost, 1.5);
assert.equal(manualPurchase.items.find(item => item.productGlobalId === 'pg-cola').unitCost, 2.25);

env.DB.failNextBatchAt(3);
await assert.rejects(
  saveProfitPurchase(env, {
    id: manualPurchase.id,
    recordDate: '2026-06-12',
    source: 'manual',
    note: 'must roll back',
    items: [{ productGlobalId: manualProductId, quantity: 9, unitCost: 9.99 }]
  }),
  /Injected D1 batch failure/
);
const purchaseAfterRollback = await env.DB.prepare(`
  SELECT record_date, note
  FROM purchase_records
  WHERE id = ?
`).bind(manualPurchase.id).first();
const purchaseItemsAfterRollback = await env.DB.prepare(`
  SELECT COUNT(*) AS count, SUM(quantity) AS quantity, SUM(total_cost_cents) AS total_cost_cents
  FROM purchase_record_items
  WHERE purchase_record_id = ?
`).bind(manualPurchase.id).first();
const purchaseSnapshotsAfterRollback = await env.DB.prepare(`
  SELECT COUNT(*) AS count
  FROM cost_snapshots
  WHERE source_type = 'purchase_item' AND source_record_id = ?
`).bind(manualPurchase.id).first();
assert.equal(purchaseAfterRollback.record_date, '2026-06-10');
assert.equal(purchaseAfterRollback.note, 'manual purchase');
assert.equal(purchaseItemsAfterRollback.count, 2);
assert.equal(purchaseItemsAfterRollback.quantity, 3);
assert.equal(purchaseItemsAfterRollback.total_cost_cents, 525);
assert.equal(purchaseSnapshotsAfterRollback.count, 2);

env.DB.failNextBatchAt(1);
await assert.rejects(voidProfitPurchase(env, manualPurchase.id), /Injected D1 batch failure/);
assert.equal((await env.DB.prepare('SELECT status FROM purchase_records WHERE id = ?').bind(manualPurchase.id).first()).status, 'active');
assert.equal((await env.DB.prepare(`
  SELECT COUNT(*) AS count
  FROM cost_snapshots
  WHERE source_type = 'purchase_item' AND source_record_id = ?
`).bind(manualPurchase.id).first()).count, 2);

const manualSaleResponse = await postSale({
  request: jsonRequest('https://example.test/api/profit/sales', {
    type: 'sale',
    machineId: '1号机',
    recordDate: '2026-06-11',
    source: 'manual',
    platformFee: 0.2,
    serviceFee: 0.1,
    discount: 0.3,
    items: [
      {
        productGlobalId: manualProductId,
        quantity: 2,
        unitPrice: 4.5
      },
      {
        productGlobalId: 'pg-cola',
        quantity: 1,
        unitPrice: 5.5
      }
    ]
  }),
  env
});
assert.equal(manualSaleResponse.status, 200);
const manualSale = (await manualSaleResponse.json()).record;
assert.equal(manualSale.itemCount, 2);
assert.equal(manualSale.quantity, 3);
assert.equal(manualSale.grossAmount, 14.5);
assert.equal(manualSale.netRevenue, 13.9);
assert.equal(manualSale.totalCogs, 5.25);
assert.equal(manualSale.grossProfit, 8.65);
assert.equal(manualSale.items.length, 2);
assert.equal(manualSale.items.find(item => item.productGlobalId === manualProductId).unitCost, 1.5);
assert.equal(manualSale.items.find(item => item.productGlobalId === 'pg-cola').unitCost, 2.25);
assert.equal(manualSale.items.find(item => item.productGlobalId === manualProductId).costSnapshotSourceType, 'sale_item');
assert.equal(manualSale.items.find(item => item.productGlobalId === manualProductId).costSnapshotEffectiveAt, '2026-06-11');

env.DB.failNextBatchAt(3);
await assert.rejects(
  saveProfitSale(env, {
    id: manualSale.id,
    type: 'sale',
    machineId: '2号机',
    recordDate: '2026-06-12',
    source: 'manual',
    note: 'must roll back',
    items: [{ productGlobalId: manualProductId, quantity: 7, unitPrice: 8.88 }]
  }),
  /Injected D1 batch failure/
);
const saleAfterRollback = await env.DB.prepare(`
  SELECT machine_id, record_date, gross_amount_cents, total_cogs_cents
  FROM sales_records
  WHERE id = ?
`).bind(manualSale.id).first();
const saleItemsAfterRollback = await env.DB.prepare(`
  SELECT COUNT(*) AS count, SUM(quantity) AS quantity, SUM(line_amount_cents) AS line_amount_cents
  FROM sales_record_items
  WHERE sales_record_id = ?
`).bind(manualSale.id).first();
const saleSnapshotsAfterRollback = await env.DB.prepare(`
  SELECT COUNT(*) AS count
  FROM cost_snapshots
  WHERE source_type = 'sale_item' AND source_record_id = ?
`).bind(manualSale.id).first();
assert.equal(saleAfterRollback.machine_id, '1号机');
assert.equal(saleAfterRollback.record_date, '2026-06-11');
assert.equal(saleAfterRollback.gross_amount_cents, 1450);
assert.equal(saleAfterRollback.total_cogs_cents, 525);
assert.equal(saleItemsAfterRollback.count, 2);
assert.equal(saleItemsAfterRollback.quantity, 3);
assert.equal(saleItemsAfterRollback.line_amount_cents, 1450);
assert.equal(saleSnapshotsAfterRollback.count, 2);

env.DB.failNextBatchAt(1);
await assert.rejects(voidProfitSale(env, manualSale.id), /Injected D1 batch failure/);
assert.equal((await env.DB.prepare('SELECT status FROM sales_records WHERE id = ?').bind(manualSale.id).first()).status, 'active');
assert.equal((await env.DB.prepare(`
  SELECT COUNT(*) AS count
  FROM cost_snapshots
  WHERE source_type = 'sale_item' AND source_record_id = ?
`).bind(manualSale.id).first()).count, 2);

const afterManualSummaryResponse = await getSummary({
  request: new Request('https://example.test/api/profit/summary?month=2026-06&machineId=1号机'),
  env
});
const afterManualSummary = await afterManualSummaryResponse.json();
assert.equal(afterManualSummary.kpis.netRevenue, 20.9);
assert.equal(afterManualSummary.kpis.cogs, 8.45);

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

env.DB.exec(`
  INSERT INTO sales_records (
    id, type, machine_id, record_date, year_month, source, external_id,
    gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
    discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
    note, status, created_at, updated_at
  )
  VALUES (
    'sr:zn:visionpay-import-existing', 'sale', '1号机', '2026-07-03', '2026-07',
    'zn', 'visionpay-import-existing', 500, 0, 0, 0, 0, 500, 200, 300,
    'existing test order', 'active', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z'
  );
`);

const importPayload = {
  orders: [
    {
      orderNo: 'visionpay-import-existing',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      deviceName: '工厂测试47T5D3',
      recordDate: '2026-07-03',
      salesAmount: 5,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      refundAmount: 0,
      items: [{ barcode: '6900000000000', productName: 'Cola', unitPrice: 5, quantity: 1 }]
    },
    {
      orderNo: 'visionpay-import-new',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      deviceName: '工厂测试47T5D3',
      recordDate: '2026-07-05',
      salesAmount: 14.2,
      platformFee: 0.2,
      serviceFee: 0.1,
      discount: 0.3,
      refundAmount: 0,
      items: [
        { barcode: '6900000000001', productName: 'Cola', unitPrice: 5, quantity: 2 },
        { barcode: '6900000000002', productName: 'Import Snack', unitPrice: 4.5, quantity: 1 }
      ]
    },
    {
      orderNo: 'visionpay-import-cancelled',
      status: '取消',
      deviceCode: 'TBN5CFA0261GJ6BG6EA',
      deviceName: '工厂测试6BG6EA',
      recordDate: '2026-07-05',
      salesAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      refundAmount: 0,
      items: []
    }
  ]
};

const importPreviewResponse = await postSalesImport({
  request: jsonRequest('https://example.test/api/profit/sales-import', {
    ...importPayload,
    dryRun: true
  }),
  env
});
assert.equal(importPreviewResponse.status, 200);
const importPreview = await importPreviewResponse.json();
assert.equal(importPreview.summary.ordersReceived, 3);
assert.equal(importPreview.summary.ordersReady, 1);
assert.equal(importPreview.summary.ordersDuplicate, 1);
assert.equal(importPreview.summary.ordersSkipped, 1);
assert.equal(importPreview.summary.itemsReady, 2);
assert.equal(importPreview.summary.productsCreated, 1);
assert.equal(importPreview.summary.productsMatched, 1);
assert.equal(importPreview.summary.ordersImported, 0);
assert.equal((await env.DB.prepare(`
  SELECT COUNT(*) AS count FROM sales_records WHERE source = 'zn' AND external_id = 'visionpay-import-new'
`).first()).count, 0);
assert.equal((await env.DB.prepare(`
  SELECT COUNT(*) AS count FROM products_global WHERE normalized_name = 'import snack'
`).first()).count, 0);

const importResponse = await postSalesImport({
  request: jsonRequest('https://example.test/api/profit/sales-import', {
    ...importPayload,
    dryRun: false
  }),
  env
});
assert.equal(importResponse.status, 200);
const imported = await importResponse.json();
assert.equal(imported.summary.ordersImported, 1);
assert.equal(imported.summary.itemsImported, 2);
assert.equal(imported.summary.ordersDuplicate, 1);
assert.equal(imported.summary.ordersSkipped, 1);
assert.equal(imported.summary.productsCreated, 1);

const importedRecord = await env.DB.prepare(`
  SELECT machine_id, gross_amount_cents, platform_fee_cents, service_fee_cents,
         discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents
  FROM sales_records
  WHERE source = 'zn' AND external_id = 'visionpay-import-new'
`).first();
assert.equal(importedRecord.machine_id, '1号机');
assert.equal(importedRecord.gross_amount_cents, 1450);
assert.equal(importedRecord.platform_fee_cents, 20);
assert.equal(importedRecord.service_fee_cents, 10);
assert.equal(importedRecord.discount_cents, 30);
assert.equal(importedRecord.net_revenue_cents, 1390);
assert.equal(importedRecord.total_cogs_cents, 400);
assert.equal(importedRecord.gross_profit_cents, 990);
assert.equal((await env.DB.prepare(`
  SELECT COUNT(*) AS count FROM sales_record_items WHERE sales_record_id = 'sr:zn:visionpay-import-new'
`).first()).count, 2);
assert.equal((await env.DB.prepare(`
  SELECT COUNT(*) AS count FROM cost_snapshots
  WHERE source_type = 'sale_item' AND source_record_id = 'sr:zn:visionpay-import-new'
`).first()).count, 2);
assert.equal((await env.DB.prepare(`
  SELECT COUNT(*) AS count
  FROM product_aliases
  WHERE source = 'zn' AND source_product_id IN ('6900000000001', '6900000000002')
`).first()).count, 2);

const duplicateImportResponse = await postSalesImport({
  request: jsonRequest('https://example.test/api/profit/sales-import', {
    ...importPayload,
    dryRun: false
  }),
  env
});
const duplicateImport = await duplicateImportResponse.json();
assert.equal(duplicateImport.summary.ordersReady, 0);
assert.equal(duplicateImport.summary.ordersImported, 0);
assert.equal(duplicateImport.summary.ordersDuplicate, 2);
assert.equal(duplicateImport.summary.ordersSkipped, 1);
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

function seedCurrentTrendRows() {
  const date = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  env.DB.exec(`
    INSERT INTO sales_records (
      id, legacy_sales_id, type, machine_id, record_date, year_month, source,
      gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
      discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
      status, created_at, updated_at
    ) VALUES
      ('sr-trend-1', 'so-trend-1', 'sale', '1号机', '${date}', '${month}', 'manual', 700, 0, 0, 0, 0, 700, 200, 500, 'active', '${date}T00:00:00.000Z', '${date}T00:00:00.000Z'),
      ('sr-trend-2', 'so-trend-2', 'sale', '2号机', '${date}', '${month}', 'manual', 300, 0, 0, 0, 0, 300, 100, 200, 'active', '${date}T00:00:00.000Z', '${date}T00:00:00.000Z');

    INSERT INTO sales_record_items (
      id, sales_record_id, product_global_id, legacy_sales_item_id, legacy_product_id,
      quantity, unit_price_cents, line_amount_cents, unit_cost_cents, line_cogs_cents, created_at
    ) VALUES
      ('sri-trend-1', 'sr-trend-1', 'pg-cola', 'si-trend-1', 'p-cola-1', 1, 700, 700, 200, 200, '${date}T00:00:00.000Z'),
      ('sri-trend-2', 'sr-trend-2', 'pg-water', 'si-trend-2', 'p-water', 1, 300, 300, 100, 100, '${date}T00:00:00.000Z');
  `);
}

function seedProductNetProfitRankingRows() {
  env.DB.exec(`
    INSERT INTO products_global (
      id, canonical_name, normalized_name, category, default_sell_price_cents,
      status, legacy_product_count, source_product_ids_json, created_at, updated_at
    ) VALUES
      ('pg-high-profit-tea', 'High Profit Tea', 'highprofittea', 'drink', 500, 'active', 0, '[]', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
      ('pg-low-margin', 'Low Margin Snack', 'lowmarginsnack', 'snack', 2000, 'active', 0, '[]', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

    INSERT INTO sales_records (
      id, legacy_sales_id, type, machine_id, record_date, year_month, source,
      gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
      discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
      status, created_at, updated_at
    ) VALUES
      ('sr-ranking-high-profit', 'so-ranking-high-profit', 'sale', '1号机', '2026-04-02', '2026-04', 'manual', 500, 0, 0, 0, 0, 500, 100, 400, 'active', '2026-04-02T00:00:00.000Z', '2026-04-02T00:00:00.000Z'),
      ('sr-ranking-low-margin', 'so-ranking-low-margin', 'sale', '1号机', '2026-04-02', '2026-04', 'manual', 2000, 0, 0, 0, 0, 2000, 1900, 100, 'active', '2026-04-02T00:00:00.000Z', '2026-04-02T00:00:00.000Z');

    INSERT INTO sales_record_items (
      id, sales_record_id, product_global_id, legacy_sales_item_id, legacy_product_id,
      quantity, unit_price_cents, line_amount_cents, unit_cost_cents, line_cogs_cents, created_at
    ) VALUES
      ('sri-ranking-high-profit', 'sr-ranking-high-profit', 'pg-high-profit-tea', 'si-ranking-high-profit', 'p-high-profit-tea', 1, 500, 500, 100, 100, '2026-04-02T00:00:00.000Z'),
      ('sri-ranking-low-margin', 'sr-ranking-low-margin', 'pg-low-margin', 'si-ranking-low-margin', 'p-low-margin', 1, 2000, 2000, 1900, 1900, '2026-04-02T00:00:00.000Z');
  `);
}

function seedLargeSalesBatch() {
  const salesRecords = [];
  const salesItems = [];
  for (let index = 1; index <= 120; index += 1) {
    const suffix = String(index).padStart(3, '0');
    salesRecords.push(
      `('sr-bulk-${suffix}', 'so-bulk-${suffix}', 'sale', '1号机', '2026-05-15', '2026-05', 'manual', 500, 0, 0, 0, 0, 500, 200, 300, 'active', '2026-05-15T00:00:00.000Z', '2026-05-15T00:00:00.000Z')`
    );
    salesItems.push(
      `('sri-bulk-${suffix}', 'sr-bulk-${suffix}', 'pg-cola', 'si-bulk-${suffix}', 'p-cola-1', 1, 500, 500, 200, 200, '2026-05-15T00:00:00.000Z')`
    );
  }

  env.DB.exec(`
    INSERT INTO sales_records (
      id, legacy_sales_id, type, machine_id, record_date, year_month, source,
      gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
      discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
      status, created_at, updated_at
    ) VALUES
      ${salesRecords.join(',\n      ')};

    INSERT INTO sales_record_items (
      id, sales_record_id, product_global_id, legacy_sales_item_id, legacy_product_id,
      quantity, unit_price_cents, line_amount_cents, unit_cost_cents, line_cogs_cents, created_at
    ) VALUES
      ${salesItems.join(',\n      ')};
  `);
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
