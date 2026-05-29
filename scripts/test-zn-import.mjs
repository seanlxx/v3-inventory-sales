import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from '../output/xlsx-inspect/node_modules/xlsx/xlsx.mjs';

import { listSales } from '../functions/api/_shared/inventory-service.js';
import { importZnSettlement } from '../functions/api/integrations/zn/import-settlement.js';
import { importZnRefunds } from '../functions/api/integrations/zn/import-refunds.js';
import { normalizeZnRefundRow } from '../frontend/app/composables/useZnExcel.ts';
import { preImportZnProducts, runZnImport } from '../functions/api/_shared/zn/importer.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);

function firstExistingPath(paths) {
  return paths.find(path => existsSync(path));
}

function loadBaseSchema(targetEnv) {
  targetEnv.DB.exec(readFileSync(join(projectRoot, 'migrations', '0001_initial_d1_schema.sql'), 'utf8'));
  targetEnv.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));
  targetEnv.DB.exec(readFileSync(join(projectRoot, 'migrations', '0007_shengma_integration.sql'), 'utf8'));
  targetEnv.DB.exec(readFileSync(join(projectRoot, 'migrations', '0008_zn_order_fees.sql'), 'utf8'));
  targetEnv.DB.exec(readFileSync(join(projectRoot, 'migrations', '0009_sales_received_amount.sql'), 'utf8'));
  targetEnv.DB.exec(readFileSync(join(projectRoot, 'migrations', '0011_money_columns_align.sql'), 'utf8'));
}

class D1Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }
  prepare(sql) { return new D1Statement(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec('COMMIT;');
      return results;
    } catch (e) { this.db.exec('ROLLBACK;'); throw e; }
  }
  exec(sql) { this.db.exec(sql); }
  query(sql, ...params) { return this.db.prepare(sql).all(...params); }
  queryOne(sql, ...params) { return this.db.prepare(sql).get(...params); }
}

class D1Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new D1Statement(this.db, this.sql, p.map(v => v === undefined ? null : v)); }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params) }; }
  async first() { return this.db.prepare(this.sql).get(...this.params) || null; }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { ...r, last_row_id: r.lastInsertRowid ? Number(r.lastInsertRowid) : undefined } };
  }
}

const env = { DB: new D1Database() };
loadBaseSchema(env);

// --- 解析真实 Excel（与前端 ZnImportCard 同样的字段提取逻辑） ---
function pickField(row, names) {
  for (const key of Object.keys(row)) {
    const trimmed = key.trim();
    if (names.some(name => trimmed.startsWith(name))) {
      const value = row[key];
      if (value === null || value === undefined) return '';
      return String(value).trim();
    }
  }
  return '';
}
function toNumber(value) {
  if (!value) return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function normalizeRow(raw) {
  const vendorOrderNo = pickField(raw, ['订单号']);
  const title = pickField(raw, ['标题']);
  const status = pickField(raw, ['状态']);
  const deviceCode = pickField(raw, ['设备编号']);
  const vendorProductName = pickField(raw, ['商品名称']);
  const vendorBarcode = '';
  const unitPrice = toNumber(pickField(raw, ['商品单价']));
  const quantity = Math.max(0, Number(pickField(raw, ['商品数量'])) || 0);
  const lineAmount = toNumber(pickField(raw, ['销售额', '价格']));
  const receivedAmount = toNumber(pickField(raw, ['预估到帐金额', '预估到账金额', '到账金额']));
  const refundAmount = toNumber(pickField(raw, ['退款金额']));
  const platformFee = toNumber(pickField(raw, ['手续费']));
  const serviceFee = toNumber(pickField(raw, ['算法服务费']));
  const discount = toNumber(pickField(raw, ['优惠金额']));
  const date = pickField(raw, ['创建时间', '扣款时间']);
  if (!vendorOrderNo && !deviceCode && !vendorProductName) return null;
  return { vendorOrderNo, title, status, deviceCode, vendorProductName, vendorBarcode, unitPrice, quantity, lineAmount, receivedAmount, refundAmount, platformFee, serviceFee, discount, date };
}

// 0 数量行必须被跳过，且不能提前创建脏商品。这个合成用例不依赖真实 Excel。
const envZeroQty = { DB: new D1Database() };
loadBaseSchema(envZeroQty);
const zeroQtyResult = await runZnImport(envZeroQty, {
  orders: [{
    vendorOrderNo: 'zero-qty-order',
    title: '',
    status: '已完成',
    deviceCode: 'TBN5CFA0261G547T5D3',
    vendorProductName: '零数量测试商品',
    vendorBarcode: '6900000000000',
    unitPrice: 3,
    quantity: 0,
    lineAmount: 0,
    receivedAmount: 0,
    refundAmount: 0,
    platformFee: 0,
    serviceFee: 0,
    discount: 0,
    date: '2026-05-20 12:00:00'
  }]
});
assert.equal(zeroQtyResult.summary.ordersImported, 0, '0 数量订单不应导入');
assert.equal(zeroQtyResult.summary.ordersSkipped, 1, '0 数量订单应计入跳过');
assert.equal(zeroQtyResult.summary.linesImported, 0, '0 数量行不应写入明细');
assert.equal(zeroQtyResult.summary.productsCreated, 0, '0 数量行不应先创建商品');
assert.equal(envZeroQty.DB.queryOne('SELECT COUNT(*) AS n FROM products').n, 0, '0 数量行不应污染商品表');
assert(zeroQtyResult.warnings.some(warning => warning.includes('数量无效')), '0 数量行应返回数量无效警告');

const envMultiItem = { DB: new D1Database() };
loadBaseSchema(envMultiItem);
const multiItemResult = await runZnImport(envMultiItem, {
  orders: [
    {
      vendorOrderNo: 'multi-item-order',
      title: '东方树叶乌龙茶原味茶饮料500ml',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '康师傅冰红茶柠檬口味1L',
      unitPrice: 4.5,
      quantity: 1,
      lineAmount: 84,
      receivedAmount: 84,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-27 10:45:57'
    },
    {
      vendorOrderNo: '',
      title: '',
      status: '',
      deviceCode: '',
      vendorProductName: '东方树叶乌龙茶原味茶饮料500ml',
      unitPrice: 5,
      quantity: 6,
      lineAmount: 0,
      receivedAmount: 0,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: ''
    },
    {
      vendorOrderNo: '',
      title: '',
      status: '',
      deviceCode: '',
      vendorProductName: '康师傅茉莉蜜茶1L',
      unitPrice: 4.5,
      quantity: 11,
      lineAmount: 0,
      receivedAmount: 0,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: ''
    }
  ]
});
assert.equal(multiItemResult.summary.ordersImported, 1, '多商品订单应导入 1 单');
assert.equal(multiItemResult.summary.linesImported, 3, '订单号为空的第 3 行商品也应继承上一订单');
assert.equal(multiItemResult.summary.ordersSkipped, 0, '多商品续行不应被跳过');
assert.equal(envMultiItem.DB.queryOne('SELECT COUNT(*) AS n FROM sales_items WHERE sales_order_id = ?', 'zn:multi-item-order').n, 3, '应写入 3 条销售明细');
assert.equal(envMultiItem.DB.queryOne('SELECT total_amount_cents AS amount FROM sales_orders WHERE id = ?', 'zn:multi-item-order').amount, 8400, '多商品订单金额应等于三行商品金额合计');

const envPreProducts = { DB: new D1Database() };
loadBaseSchema(envPreProducts);
const preProductsResult = await preImportZnProducts(envPreProducts, {
  orders: [
    {
      vendorOrderNo: 'pre-products-1',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '冰露矿泉水(550ml)',
      unitPrice: 1,
      quantity: 1,
      lineAmount: 1,
      receivedAmount: 1,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-2',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '冰露矿泉水550ml',
      unitPrice: 1,
      quantity: 2,
      lineAmount: 2,
      receivedAmount: 2,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-3',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '零数量测试商品',
      unitPrice: 3,
      quantity: 0,
      lineAmount: 0,
      receivedAmount: 0,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-4',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '康师傅冰红茶900ml',
      unitPrice: 4.5,
      quantity: 1,
      lineAmount: 4.5,
      receivedAmount: 4.5,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-5',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '农夫山泉水溶C100柠檬味445ml',
      unitPrice: 5,
      quantity: 1,
      lineAmount: 5,
      receivedAmount: 5,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-6',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '农夫山泉水溶西柚汁饮料445ML',
      unitPrice: 5,
      quantity: 1,
      lineAmount: 5,
      receivedAmount: 5,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-7',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '康师傅蜂蜜绿茶1L',
      unitPrice: 4,
      quantity: 1,
      lineAmount: 4,
      receivedAmount: 4,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-8',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '东鹏补水1L',
      unitPrice: 5.5,
      quantity: 1,
      lineAmount: 5.5,
      receivedAmount: 5.5,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-9',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '统一香辣牛肉味',
      unitPrice: 4,
      quantity: 1,
      lineAmount: 4,
      receivedAmount: 4,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-10',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '农夫山泉水溶C100血橙味445ml',
      unitPrice: 5,
      quantity: 1,
      lineAmount: 5,
      receivedAmount: 5,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-11',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '康师傅绿茶',
      unitPrice: 4,
      quantity: 1,
      lineAmount: 4,
      receivedAmount: 4,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-12',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '东鹏补水电解质饮料柠檬味555ml',
      unitPrice: 3.5,
      quantity: 1,
      lineAmount: 3.5,
      receivedAmount: 3.5,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-13',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '娃哈哈饮用纯净水596ml',
      unitPrice: 2,
      quantity: 1,
      lineAmount: 2,
      receivedAmount: 2,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-14',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '娃哈哈纯净水596ml',
      unitPrice: 2,
      quantity: 1,
      lineAmount: 2,
      receivedAmount: 2,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-15',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '康师傅绿茶茉莉味茶饮品1L',
      unitPrice: 4,
      quantity: 1,
      lineAmount: 4,
      receivedAmount: 4,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-16',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '康师傅茉莉清茶瓶装1L',
      unitPrice: 4,
      quantity: 1,
      lineAmount: 4,
      receivedAmount: 4,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    },
    {
      vendorOrderNo: 'pre-products-17',
      title: '',
      status: '已完成',
      deviceCode: 'TBN5CFA0261G547T5D3',
      vendorProductName: '康师傅茉莉蜜茶1L',
      unitPrice: 4,
      quantity: 1,
      lineAmount: 4,
      receivedAmount: 4,
      refundAmount: 0,
      platformFee: 0,
      serviceFee: 0,
      discount: 0,
      date: '2026-05-20 12:00:00'
    }
  ]
});
assert.equal(preProductsResult.summary.productsParsed, 9, '商品预导入应按标准名称去重并合并旧别名');
assert.equal(preProductsResult.summary.productsCreated, 9, '商品预导入应先创建缺失商品');
assert.equal(preProductsResult.summary.rowsSkipped, 1, '0 数量商品行应跳过');
const preProduct = envPreProducts.DB.queryOne('SELECT machine_id, name, normalized_name, external_id FROM products WHERE normalized_name = ?', '冰露饮用纯净水500ml');
assert.equal(preProduct.machine_id, '1/2号机', 'zn 商品预导入应写入折叠商品机台');
assert.equal(preProduct.name, '冰露饮用纯净水500ml', '商品展示名应重命名为标准商品名称');
assert.equal(preProduct.normalized_name, '冰露饮用纯净水500ml', '商品 normalized_name 应写入标准化名称');
assert.equal(preProduct.external_id, '冰露饮用纯净水500ml', '新建 zn 商品 external_id 应使用标准化名称');
const preProductNames = envPreProducts.DB.query('SELECT name, normalized_name FROM products ORDER BY normalized_name');
assert.deepEqual(
  preProductNames.map(item => [item.name, item.normalized_name]),
  [
    ['东鹏补水啦555ml', '东鹏补水啦555ml'],
    ['东鹏补水啦电解质水柠檬味1l', '东鹏补水啦电解质水柠檬味1l'],
    ['农夫山泉水溶c100复合果汁饮料445ml', '农夫山泉水溶c100复合果汁饮料445ml'],
    ['冰露饮用纯净水500ml', '冰露饮用纯净水500ml'],
    ['小支娃哈哈纯净水', '小支娃哈哈纯净水'],
    ['康师傅冰红茶柠檬口味1l', '康师傅冰红茶柠檬口味1l'],
    ['康师傅绿茶饮品1l', '康师傅绿茶饮品1l'],
    ['康师傅茉莉饮品1l', '康师傅茉莉饮品1l'],
    ['康师傅香辣牛肉面111g', '康师傅香辣牛肉面111g']
  ],
  '商品预导入应把已合并商品的 Excel 旧名称映射到新 normalized_name'
);
const preProductsAgain = await preImportZnProducts(envPreProducts, {
  orders: [{
    vendorOrderNo: 'pre-products-12',
    title: '',
    status: '已完成',
    deviceCode: 'TBN5CFA0261G547T5D3',
    vendorProductName: '冰露矿泉水(550ml)',
    unitPrice: 1,
    quantity: 1,
    lineAmount: 1,
    receivedAmount: 1,
    refundAmount: 0,
    platformFee: 0,
    serviceFee: 0,
    discount: 0,
    date: '2026-05-20 12:00:00'
  }]
});
assert.equal(preProductsAgain.summary.productsCreated, 0, '商品预导入重复执行不应重复建商品');
assert.equal(preProductsAgain.summary.productsExisting, 1, '商品预导入重复执行应识别已有商品');
assert.equal(envPreProducts.DB.queryOne('SELECT COUNT(*) AS n FROM products').n, 9, '商品预导入应保持幂等');

const envMergedFallback = { DB: new D1Database() };
loadBaseSchema(envMergedFallback);
const mergedFallbackTimestamp = '2026-05-20T00:00:00.000Z';
await envMergedFallback.DB.prepare(`
  INSERT INTO products (
    id, machine_id, name, category, sell_price_cents, status,
    created_at, updated_at, normalized_name, external_id
  ) VALUES (
    'merged-target-product', '1/2号机', '标准商品500ml', '饮料', 300, 'active',
    ?, ?, '标准商品500ml', '标准商品500ml'
  )
`).bind(mergedFallbackTimestamp, mergedFallbackTimestamp).run();
await envMergedFallback.DB.prepare(`
  INSERT INTO products (
    id, machine_id, name, category, sell_price_cents, status,
    created_at, updated_at, normalized_name, external_id
  ) VALUES (
    'merged-archived-product', '1/2号机', '旧名称商品500ml', '饮料', 300, 'archived',
    ?, ?, 'merged:标准商品500ml', NULL
  )
`).bind(mergedFallbackTimestamp, mergedFallbackTimestamp).run();
await envMergedFallback.DB.prepare(`
  INSERT INTO inventory_balances (
    product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
    total_purchase_qty, total_purchase_cost_cents, updated_at
  ) VALUES ('merged-target-product', '1号机', 5, 120, 600, 5, 600, ?)
`).bind(mergedFallbackTimestamp).run();

const mergedFallbackOrders = [{
  vendorOrderNo: 'merged-fallback-order-1',
  title: '',
  status: '已完成',
  deviceCode: 'TBN5CFA0261G547T5D3',
  vendorProductName: '旧名称商品(500ML)',
  unitPrice: 3,
  quantity: 1,
  lineAmount: 3,
  receivedAmount: 3,
  refundAmount: 0,
  platformFee: 0,
  serviceFee: 0,
  discount: 0,
  date: '2026-05-20 12:00:00'
}];
const mergedFallbackPreImport = await preImportZnProducts(envMergedFallback, { orders: mergedFallbackOrders });
assert.equal(mergedFallbackPreImport.summary.productsCreated, 0, '预导入应通过归档旧名称找到合并后的标准商品');
assert.equal(mergedFallbackPreImport.summary.productsExisting, 1, '预导入应把归档旧名称计为已有商品');
assert.equal(envMergedFallback.DB.queryOne('SELECT COUNT(*) AS n FROM products').n, 2, '归档旧名称不应导致重复新建商品');

const mergedFallbackImport = await runZnImport(envMergedFallback, { orders: mergedFallbackOrders });
assert.equal(mergedFallbackImport.summary.productsCreated, 0, '销售导入应通过归档旧名称找到合并后的标准商品');
assert.equal(mergedFallbackImport.summary.ordersImported, 1, '销售导入应正常导入归档旧名称订单');
assert.equal(
  envMergedFallback.DB.queryOne('SELECT product_id FROM sales_items WHERE sales_order_id = ?', 'zn:merged-fallback-order-1').product_id,
  'merged-target-product',
  '销售明细应落到合并后的标准商品'
);
assert.equal(
  envMergedFallback.DB.queryOne('SELECT quantity_on_hand FROM inventory_balances WHERE product_id = ? AND machine_id = ?', 'merged-target-product', '1号机').quantity_on_hand,
  4,
  '归档旧名称销售应扣减标准商品库存'
);

const parsedRefundRow = normalizeZnRefundRow({
  '退款订单号': 'refund-test-1',
  '设备名称': '工厂测试47T5D3',
  '订单号': 'visionpay-order-1',
  '订单实付金额': 6,
  '退款金额(元)': 6,
  '购买时间': '2026年05月20日12时00分',
  '支付时间': '2026年05月20日12时01分',
  '交易号': 'trade-1',
  '商品名称': '冰露矿泉水550ml',
  '商品条码': '6928804013740-1',
  '商品数量': 1,
  '商品单价': 6,
  '支付方式': '其他',
  '订单状态': '已完成',
  '退款状态': '退款成功',
  '退款时间': '2026年05月20日12时02分',
  '退款人': '管理员',
  '退款备注': '处理客户退款'
});
assert.equal(parsedRefundRow?.refundOrderNo, 'refund-test-1', '退款明细应解析退款订单号');
assert.equal(parsedRefundRow?.deviceName, '工厂测试47T5D3', '退款明细应解析设备名称');
assert.equal(parsedRefundRow?.originalOrderNo, 'visionpay-order-1', '退款明细应解析原订单号');
assert.equal(parsedRefundRow?.refundAmount, 6, '退款明细应解析退款金额');
assert.equal(parsedRefundRow?.vendorProductName, '冰露矿泉水550ml', '退款明细应解析商品名');
assert.equal(parsedRefundRow?.quantity, 1, '退款明细应解析商品数量');

const envRefunds = { DB: new D1Database() };
loadBaseSchema(envRefunds);
const refundTimestamp = '2026-05-20T00:00:00.000Z';
await envRefunds.DB.prepare(`
  INSERT INTO products (
    id, machine_id, name, category, sell_price_cents, status,
    created_at, updated_at, normalized_name, external_id
  ) VALUES (
    'refund-water', '1/2号机', '冰露饮用纯净水500ml', '饮料', 100, 'active',
    ?, ?, '冰露饮用纯净水500ml', '6928804013740'
  )
`).bind(refundTimestamp, refundTimestamp).run();
await envRefunds.DB.prepare(`
  INSERT INTO inventory_balances (
    product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
    total_purchase_qty, total_purchase_cost_cents, updated_at
  ) VALUES ('refund-water', '1号机', 9, 60, 540, 10, 600, ?)
`).bind(refundTimestamp).run();
await envRefunds.DB.prepare(`
  INSERT INTO sales_orders (
    id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
    platform_fee_cents, service_fee_cents, discount_cents, refund_amount_cents, received_amount_cents,
    note, image_asset_id, voided_at, created_at, updated_at, external_id, source
  ) VALUES (
    'zn:visionpay-refund-original', 'sale', '1号机', '2026-05-20', '2026-05',
    500, 60, 0, 0, 0, 0, 500, '原销售', NULL, NULL, ?, ?,
    'visionpay-refund-original', 'zn'
  )
`).bind(refundTimestamp, refundTimestamp).run();
await envRefunds.DB.prepare(`
  INSERT INTO sales_items (
    id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
    line_amount_cents, line_cogs_cents, created_at
  ) VALUES (
    'zn:visionpay-refund-original:0', 'zn:visionpay-refund-original',
    'refund-water', 1, 500, 60, 500, 60, ?
  )
`).bind(refundTimestamp).run();

const refundRows = [
  {
    refundOrderNo: 'refund-full-1',
    deviceName: '工厂测试47T5D3',
    originalOrderNo: 'visionpay-refund-original',
    paidAmount: 5,
    refundAmount: 5,
    purchaseTime: '2026年05月20日12时00分',
    paidAt: '2026年05月20日12时01分',
    transactionNo: 'trade-full',
    vendorProductName: '冰露矿泉水550ml',
    vendorBarcode: '6928804013740-1',
    quantity: 1,
    unitPrice: 5,
    payMethod: '其他',
    orderStatus: '已完成',
    refundStatus: '退款成功',
    refundTime: '2026年05月20日12时02分',
    operator: '管理员',
    note: '处理客户退款'
  },
  {
    refundOrderNo: 'refund-partial-1',
    deviceName: '工厂测试47T5D3',
    originalOrderNo: 'visionpay-refund-original',
    paidAmount: 5,
    refundAmount: 1.5,
    purchaseTime: '2026年05月20日12时00分',
    paidAt: '2026年05月20日12时01分',
    transactionNo: 'trade-partial',
    vendorProductName: '冰露矿泉水550ml',
    vendorBarcode: '6928804013740-1',
    quantity: 1,
    unitPrice: 5,
    payMethod: '其他',
    orderStatus: '已完成',
    refundStatus: '退款成功',
    refundTime: '2026年05月20日13时02分',
    operator: '管理员',
    note: '补商品差价'
  },
  {
    refundOrderNo: 'refund-missing-1',
    deviceName: '工厂测试47T5D3',
    originalOrderNo: 'visionpay-missing',
    paidAmount: 5,
    refundAmount: 5,
    purchaseTime: '2026年05月20日12时00分',
    paidAt: '2026年05月20日12时01分',
    transactionNo: 'trade-missing',
    vendorProductName: '冰露矿泉水550ml',
    vendorBarcode: '6928804013740-1',
    quantity: 1,
    unitPrice: 5,
    payMethod: '其他',
    orderStatus: '已完成',
    refundStatus: '退款成功',
    refundTime: '2026年05月20日14时02分',
    operator: '管理员',
    note: '处理客户退款'
  }
];

const refundResult = await importZnRefunds(envRefunds, { refunds: refundRows });
assert.equal(refundResult.summary.refundsParsed, 3, '退款导入应解析退款单');
assert.equal(refundResult.summary.refundsImported, 2, '退款导入应写入匹配到原订单的退款');
assert.equal(refundResult.summary.refundsMissing, 1, '退款导入应报告找不到原订单的退款');
assert.equal(refundResult.summary.linesImported, 2, '退款导入应写入退款明细行');
assert.equal(refundResult.summary.stockRestored, 1, '全额退款应回补库存');
assert.equal(refundResult.summary.amountOnly, 1, '部分退款应只记金额不回补库存');
const refundOrders = envRefunds.DB.query(`
  SELECT external_id, total_amount_cents, total_cogs_cents, refund_amount_cents
  FROM sales_orders
  WHERE type = 'refund'
  ORDER BY external_id
`);
assert.deepEqual(
  refundOrders.map(order => [order.external_id, order.total_amount_cents, order.total_cogs_cents, order.refund_amount_cents]),
  [
    ['refund:refund-full-1', 500, 60, 500],
    ['refund:refund-partial-1', 150, 0, 150]
  ],
  '退款单应分别记录全额退款和仅金额退款'
);
assert.equal(
  envRefunds.DB.queryOne('SELECT quantity_on_hand FROM inventory_balances WHERE product_id = ? AND machine_id = ?', 'refund-water', '1号机').quantity_on_hand,
  10,
  '只有全额退款应回补库存数量'
);
assert.equal(
  envRefunds.DB.queryOne('SELECT COUNT(*) AS n FROM stock_movements WHERE movement_type = ?', 'refund').n,
  1,
  '部分退款不应写库存退款流水'
);
const refundAgain = await importZnRefunds(envRefunds, { refunds: refundRows.slice(0, 2) });
assert.equal(refundAgain.summary.refundsImported, 0, '重复退款导入不应再次写入');
assert.equal(refundAgain.summary.refundsDuplicate, 2, '重复退款导入应识别重复');

const xlsxPath = firstExistingPath([
  process.env.ZN_IMPORT_XLSX,
  join(projectRoot, '订单明细_2026-05-01_2026-05-25.xlsx')
].filter(Boolean));
if (!xlsxPath) {
  console.warn('缺少真实 Excel 回归文件，已跳过大样本 zn 导入回归；可设置 ZN_IMPORT_XLSX 指向本地文件后重跑。');
  console.log('\n✅ 合成回归通过：0 数量行不会导入，也不会创建商品');
  process.exit(0);
}
const wb = XLSX.read(readFileSync(xlsxPath));
const sheet = wb.Sheets[wb.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
const orders = json.map(normalizeRow).filter(Boolean);

console.log('解析行数:', orders.length);

await seedCostProducts(env);

// === 第一次导入 ===
const r1 = await runZnImport(env, { orders });
console.log('第一次:', r1.summary);

// 关键断言：销售确实落库
const salesCount = env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders WHERE source = ?', 'zn').n;
const itemsCount = env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_items').n;
const movementsCount = env.DB.queryOne('SELECT COUNT(*) AS n FROM stock_movements WHERE movement_type = ? ', 'sale').n;
const productsCount = env.DB.queryOne('SELECT COUNT(*) AS n FROM products').n;
const balancesCount = env.DB.queryOne('SELECT COUNT(*) AS n FROM inventory_balances').n;

console.log('first import: sales_orders=%d items=%d sale_movements=%d products=%d balances=%d',
  salesCount, itemsCount, movementsCount, productsCount, balancesCount);

assert.equal(r1.summary.ordersImported, salesCount, '导入计数与表中行数应一致');
assert.equal(r1.summary.linesImported, itemsCount, '明细行数应一致');
assert.equal(r1.summary.ordersImported, 768, '完整 Excel 应导入 768 个有效订单');
assert.equal(r1.summary.linesImported, 927, '完整 Excel 应按订单声明商品数导入有效商品明细');
assert(r1.summary.linesImported > r1.summary.ordersImported, '一单多商品订单应拆成多条销售明细');
assert(r1.summary.costsMatched > 0, '导入时应能从现有进货价匹配到部分成本');
assert(r1.summary.ordersImported > 0, '应至少有一些订单导入成功');
assert.equal((await listSales(env, { yearMonth: '2026-05', status: 'active', limit: 500, offset: 0 })).length, 500);
assert.equal((await listSales(env, { yearMonth: '2026-05', status: 'active', limit: 500, offset: 500 })).length, 268);

const multiItemOrder = env.DB.query(`
  SELECT p.name, si.quantity, si.unit_price_cents, si.line_amount_cents
  FROM sales_items si
  JOIN products p ON p.id = si.product_id
  WHERE si.sales_order_id = ?
  ORDER BY si.unit_price_cents
`, 'zn:visionpaySFTS20260525083347733X');
console.log('多商品订单明细:', multiItemOrder);
assert.equal(multiItemOrder.length, 2, '同一订单中的冰露和东鹏应拆成两条明细');
assert.deepEqual(
  multiItemOrder.map(item => [item.name, item.quantity, item.unit_price_cents, item.line_amount_cents]),
  [
    ['冰露矿泉水550ml', 1, 100, 100],
    ['东鹏补水啦电解质水柠檬味1L', 1, 550, 550]
  ],
  '多商品订单不应把整单 6.5 元挂到冰露一条明细上'
);

const multiItemOrderTotal = env.DB.queryOne(`
  SELECT total_amount_cents, received_amount_cents, platform_fee_cents
  FROM sales_orders
  WHERE id = ?
`, 'zn:visionpaySFTS20260525083347733X');
assert.equal(multiItemOrderTotal.total_amount_cents, 650, '多商品订单汇总销售额应保留整单金额');
assert.equal(multiItemOrderTotal.received_amount_cents, 646, '多商品订单到账额应保留整单到账金额');
assert.equal(multiItemOrderTotal.platform_fee_cents, 4, '多商品订单手续费应保留整单手续费');

// 手续费/服务费应有非零订单
const feeOrders = env.DB.queryOne(`
  SELECT COUNT(*) AS n FROM sales_orders
  WHERE source = 'zn' AND (platform_fee_cents > 0 OR service_fee_cents > 0)
`).n;
console.log('含手续费/服务费订单数:', feeOrders);
assert(feeOrders > 0, '应至少有一些订单包含手续费或算法服务费');

const receivedTotals = env.DB.queryOne(`
  SELECT
    SUM(total_amount_cents) AS total_amount_cents,
    SUM(received_amount_cents) AS received_amount_cents,
    SUM(platform_fee_cents + service_fee_cents) AS fee_cents,
    SUM(total_cogs_cents) AS total_cogs_cents
  FROM sales_orders
  WHERE source = 'zn'
`);
console.log('金额汇总:', receivedTotals);
assert(receivedTotals.received_amount_cents > 0, '应写入到账金额');
assert(receivedTotals.received_amount_cents < receivedTotals.total_amount_cents, '到账金额应小于含手续费前销售额');
assert(receivedTotals.total_cogs_cents > 0, '应按现有进货价写入销售成本');

const settlementOrderBefore = env.DB.queryOne(`
  SELECT id, external_id, total_amount_cents, platform_fee_cents, service_fee_cents, received_amount_cents
  FROM sales_orders
  WHERE source = 'zn' AND external_id = ?
`, 'visionpaySFTS20260525083347733X');
const settlementResult = await importZnSettlement(env, {
  settlements: [
    {
      vendorOrderNo: settlementOrderBefore.external_id,
      grossAmount: 6.5,
      platformFee: 0.12,
      serviceFee: 0.23,
      refundAmount: 0,
      expense: 0.35,
      incomeType: '收入',
      settledAt: '2026-05-25 08:33:47'
    },
    {
      vendorOrderNo: 'not-exists-order',
      grossAmount: 9.9,
      platformFee: 0.1,
      serviceFee: 0,
      incomeType: '收入'
    },
    {
      vendorOrderNo: settlementOrderBefore.external_id,
      grossAmount: 6.5,
      platformFee: 0.99,
      serviceFee: 0,
      incomeType: '支出'
    }
  ]
});
assert.equal(settlementResult.summary.settlementsProcessed, 2, '结算导入只处理收入行');
assert.equal(settlementResult.summary.settlementsUpdated, 1, '结算导入应更新已存在订单');
assert.equal(settlementResult.summary.settlementsMissing, 1, '找不到的结算订单应计入 missing');
assert.equal(settlementResult.summary.settlementsSkipped, 1, '支出行应跳过');
const settlementOrderAfter = env.DB.queryOne(`
  SELECT platform_fee_cents, service_fee_cents, received_amount_cents
  FROM sales_orders
  WHERE id = ?
`, settlementOrderBefore.id);
assert.equal(settlementOrderAfter.platform_fee_cents, 12, '交易账单手续费应覆盖订单明细预估值');
assert.equal(settlementOrderAfter.service_fee_cents, 23, '交易账单算法服务费应覆盖订单明细预估值');
assert.equal(settlementOrderAfter.received_amount_cents, 615, '交易账单实收应按 gross-refund-fee-service 计算');
assert.equal(
  env.DB.queryOne('SELECT COUNT(*) AS n FROM external_settlement_imports').n,
  1,
  '结算导入应写入幂等表'
);

const dongpengImportedSales = env.DB.queryOne(`
  SELECT COALESCE(SUM(si.quantity), 0) AS quantity
  FROM sales_items si
  WHERE si.product_id = 'cost-dp-1'
`).quantity;
const splitDongpengProducts = env.DB.queryOne(`
  SELECT COUNT(*) AS n
  FROM products
  WHERE name = '东鹏特饮维生素功能饮料500ml'
`).n;
const dongpengProduct = env.DB.queryOne(`
  SELECT external_id, normalized_name
  FROM products
  WHERE id = 'cost-dp-1'
`);
assert(dongpengImportedSales > 0, 'zn 导入应把销售匹配到已有进货商品');
assert.equal(splitDongpengProducts, 0, 'zn 导入不应把已有进货商品拆成新销售商品');
assert.equal(dongpengProduct.external_id, null, 'zn 导入不应回填商品条码');
assert(dongpengProduct.normalized_name, '匹配到已有进货商品后应回填归一化名称');

// 检查 1号机/2号机 都有数据
const m1 = env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders WHERE machine_id = ?', '1号机').n;
const m2 = env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders WHERE machine_id = ?', '2号机').n;
console.log('1号机订单=%d  2号机订单=%d', m1, m2);
assert(m1 > 0 && m2 > 0, '两台机器都应有订单');
assert.equal(m1, 597, '1号机有效订单应完整导入');
assert.equal(m2, 171, '2号机有效订单应完整导入');

// 取消订单不应进库
const canceled = env.DB.queryOne(`
  SELECT COUNT(*) AS n FROM sales_orders so
  JOIN external_sales_imports e ON e.local_sales_order_id = so.id
  WHERE e.raw_json LIKE '%"status":"取消"%'
`).n;
assert.equal(canceled, 0, '取消订单不应被导入');

// === 第二次导入（同一份数据）===
const snapshot = {
  sales_orders: env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders').n,
  sales_items: env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_items').n,
  stock_movements: env.DB.queryOne('SELECT COUNT(*) AS n FROM stock_movements').n,
  products: env.DB.queryOne('SELECT COUNT(*) AS n FROM products').n,
  external_sales_imports: env.DB.queryOne('SELECT COUNT(*) AS n FROM external_sales_imports').n
};

const r2 = await runZnImport(env, { orders });
console.log('第二次:', r2.summary);

const after = {
  sales_orders: env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders').n,
  sales_items: env.DB.queryOne('SELECT COUNT(*) AS n FROM sales_items').n,
  stock_movements: env.DB.queryOne('SELECT COUNT(*) AS n FROM stock_movements').n,
  products: env.DB.queryOne('SELECT COUNT(*) AS n FROM products').n,
  external_sales_imports: env.DB.queryOne('SELECT COUNT(*) AS n FROM external_sales_imports').n
};
console.log('快照对比:', { before: snapshot, after });

// 关键断言：第二次重复导入不应造成任何写入
assert.equal(r2.summary.ordersImported, 0, '重复导入不应再导入新订单');
assert.equal(r2.summary.linesImported, 0, '重复导入不应再写入明细');
assert.equal(r2.summary.productsCreated, 0, '重复导入不应新建商品');
assert.equal(r2.summary.ordersDuplicate, r1.summary.ordersImported, '重复数应等于首次导入数');

assert.deepEqual(after, snapshot, '所有表行数应保持不变（覆盖性测试 ✓ 不会重复落库 / 不会污染历史数据）');

// === 测试一笔订单的金额 / 库存变化 ===
const sample = env.DB.queryOne(`
  SELECT so.id, so.machine_id, so.total_amount_cents, so.received_amount_cents, so.record_date,
         si.quantity, si.unit_price_cents, sm.created_at AS movement_created_at
  FROM sales_orders so
  JOIN sales_items si ON si.sales_order_id = so.id
  JOIN stock_movements sm ON sm.ref_item_id = si.id
  WHERE so.source = 'zn'
  LIMIT 1
`);
console.log('样例订单:', sample);
assert(sample.total_amount_cents > 0, '订单金额应大于 0');
assert(sample.received_amount_cents > 0, '订单到账金额应大于 0');
assert(sample.quantity >= 1, '数量应 ≥ 1');
assert.equal(sample.movement_created_at, `${sample.record_date}T00:00:00.000Z`, 'zn 销售流水时间应使用订单日期 0 点');

// 验证库存余额是负数（因为没有进货记录就直接卖了，余额会变负）
const negativeBalances = env.DB.query('SELECT product_id, machine_id, quantity_on_hand FROM inventory_balances WHERE quantity_on_hand < 0 LIMIT 3');
console.log('负库存示例（正常：销售先于进货，需要先录入进货才能修正）:', negativeBalances);

console.log('\n✅ 全部断言通过');
console.log('  · 第一次导入：%d 单 / %d 行 / %d 件商品', r1.summary.ordersImported, r1.summary.linesImported, r1.summary.productsCreated);
console.log('  · 第二次重复导入：0 写入，全部识别为重复 → 数据不会被覆盖或污染');

// === 第三次：故意制造缺失，验证回填 ===
console.log('\n--- 回填测试 ---');
// 找一个已有销售明细商品，清空 external_id 和 normalized_name
const sampleProduct = env.DB.queryOne(`
  SELECT p.id, p.external_id, p.normalized_name
  FROM products p
  JOIN sales_items si ON si.product_id = p.id
  WHERE p.normalized_name IS NOT NULL
  LIMIT 1
`);
console.log('选中商品（清空前）:', sampleProduct);
env.DB.prepare('UPDATE products SET external_id = NULL, normalized_name = NULL WHERE id = ?')
  .run(sampleProduct.id);

// 找一个订单，清空 fee + 改 total
const sampleOrder = env.DB.queryOne(`
  SELECT id, total_amount_cents, platform_fee_cents, service_fee_cents
  FROM sales_orders WHERE source = 'zn' AND platform_fee_cents > 0 LIMIT 1
`);
console.log('选中订单（清空前）:', sampleOrder);
env.DB.prepare(`
  UPDATE sales_orders SET platform_fee_cents = 0, service_fee_cents = 0, discount_cents = 0,
                          total_amount_cents = 1 WHERE id = ?
`).run(sampleOrder.id);

const r3 = await runZnImport(env, { orders });
console.log('第三次:', r3.summary);

const productAfter = env.DB.queryOne('SELECT external_id, normalized_name FROM products WHERE id = ?', sampleProduct.id);
console.log('商品（回填后）:', productAfter);
assert.equal(productAfter.external_id, null, '商品 barcode 不应被回填');
assert.equal(productAfter.normalized_name, sampleProduct.normalized_name, '商品 normalized_name 应被回填');

const orderAfter = env.DB.queryOne(`
  SELECT total_amount_cents, platform_fee_cents, service_fee_cents
  FROM sales_orders WHERE id = ?
`, sampleOrder.id);
console.log('订单（回填后）:', orderAfter);
assert.equal(orderAfter.platform_fee_cents, sampleOrder.platform_fee_cents, '订单手续费应被回填');
assert.equal(orderAfter.service_fee_cents, sampleOrder.service_fee_cents, '订单服务费应被回填');
assert.equal(orderAfter.total_amount_cents, sampleOrder.total_amount_cents, '订单销售额应被回填');

console.log('\n✅ 回填测试通过：重复导入时商品名称 / 订单手续费 / 销售额会被自动修正，商品条码不会录入');

// === 第四次：模拟前端分批提交，结果应与一次性导入一致 ===
console.log('\n--- 分批导入测试 ---');
const envChunked = { DB: new D1Database() };
loadBaseSchema(envChunked);
await seedCostProducts(envChunked);

function chunkByOrder(sourceRows, batchSize) {
  const batches = [];
  let current = [];
  const currentOrders = new Set();
  let lastOrderNo = '';
  for (const row of sourceRows) {
    const orderNo = row.vendorOrderNo || lastOrderNo || `row-${current.length}`;
    if (current.length > 0 && !currentOrders.has(orderNo) && currentOrders.size >= batchSize) {
      batches.push(current);
      current = [];
      currentOrders.clear();
    }
    current.push(row);
    currentOrders.add(orderNo);
    if (row.vendorOrderNo) lastOrderNo = row.vendorOrderNo;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const chunkedSummary = {
  ordersImported: 0,
  ordersDuplicate: 0,
  ordersSkipped: 0,
  linesImported: 0,
  productsCreated: 0,
  warnings: 0
};
const batches = chunkByOrder(orders, 80);
for (const batch of batches) {
  const partial = await runZnImport(envChunked, { orders: batch });
  for (const key of Object.keys(chunkedSummary)) {
    chunkedSummary[key] += Number(partial.summary[key]) || 0;
  }
}
const chunkedSalesCount = envChunked.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders WHERE source = ?', 'zn').n;
const chunkedM1 = envChunked.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders WHERE machine_id = ?', '1号机').n;
const chunkedM2 = envChunked.DB.queryOne('SELECT COUNT(*) AS n FROM sales_orders WHERE machine_id = ?', '2号机').n;
assert.equal(chunkedSalesCount, 768, '分批导入也应导入全部有效订单');
assert.equal(chunkedM1, 597, '分批导入不应漏掉 1号机订单');
assert.equal(chunkedM2, 171, '分批导入不应漏掉 2号机订单');
assert.equal(chunkedSummary.ordersImported, r1.summary.ordersImported, '分批导入数量应与一次性导入一致');
assert.equal(chunkedSummary.linesImported, r1.summary.linesImported, '分批导入明细应与一次性导入一致');

console.log('\n✅ 分批导入测试通过：大 Excel 可分批提交且不漏单');

// === 第五次：模拟线上已导入过的错单，重复导入应能把一条明细校正为两条 ===
console.log('\n--- 多商品错单校正测试 ---');
const envReconcile = { DB: new D1Database() };
loadBaseSchema(envReconcile);
const brokenOrderStart = orders.findIndex(row => row.vendorOrderNo === 'visionpaySFTS20260525083347733X');
const brokenOrderRows = brokenOrderStart >= 0
  ? orders.slice(brokenOrderStart, brokenOrderStart + 2)
  : [];
assert.equal(brokenOrderRows.length, 2, '测试数据应包含错单主行和续行');
const timestamp = '2026-05-25T00:00:00.000Z';
await envReconcile.DB.prepare(`
  INSERT INTO products (
    id, machine_id, name, category, sell_price_cents, status,
    created_at, updated_at, normalized_name, external_id
  ) VALUES
    ('broken-water', '1/2号机', '冰露矿泉水550ml', '饮料', 100, 'active', ?, ?, '冰露矿泉水550ml', '6928804013740'),
    ('broken-dp', '1/2号机', '东鹏补水啦电解质水柠檬味1L', '饮料', 550, 'active', ?, ?, '东鹏补水啦电解质水柠檬味1l', '6934502302277')
`).bind(timestamp, timestamp, timestamp, timestamp).run();
await envReconcile.DB.prepare(`
  INSERT INTO inventory_balances (
    product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
    total_purchase_qty, total_purchase_cost_cents, updated_at
  ) VALUES
    ('broken-water', '1号机', 9, 60, 540, 10, 600, ?),
    ('broken-dp', '1号机', 10, 400, 4000, 10, 4000, ?)
`).bind(timestamp, timestamp).run();
await envReconcile.DB.prepare(`
  INSERT INTO sales_orders (
    id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
    platform_fee_cents, service_fee_cents, discount_cents, refund_amount_cents, received_amount_cents,
    note, image_asset_id, voided_at, created_at, updated_at, external_id, source
  ) VALUES (
    'zn:visionpaySFTS20260525083347733X', 'sale', '1号机', '2026-05-25', '2026-05',
    650, 60, 4, 0, 0, 0, 646, '历史错误导入', NULL, NULL, ?, ?,
    'visionpaySFTS20260525083347733X', 'zn'
  )
`).bind(timestamp, timestamp).run();
await envReconcile.DB.prepare(`
  INSERT INTO sales_items (
    id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
    line_amount_cents, line_cogs_cents, created_at
  ) VALUES (
    'zn:visionpaySFTS20260525083347733X:0', 'zn:visionpaySFTS20260525083347733X',
    'broken-water', 1, 100, 60, 650, 60, ?
  )
`).bind(timestamp).run();
await envReconcile.DB.prepare(`
  INSERT INTO stock_movements (
    id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
    ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
  ) VALUES (
    'sales_order:zn:visionpaySFTS20260525083347733X:broken-water:0',
    'broken-water', '1号机', 'sale', -1, 60, 'sales_order',
    'zn:visionpaySFTS20260525083347733X', 'zn:visionpaySFTS20260525083347733X:0',
    NULL, 'zn:sale:visionpaySFTS20260525083347733X:0', '历史错误导入', ?
  )
`).bind(timestamp).run();
await envReconcile.DB.prepare(`
  INSERT INTO external_sales_imports (
    integration, vendor_order_no, local_sales_order_id, imported_at, raw_json
  ) VALUES ('zn', 'visionpaySFTS20260525083347733X', 'zn:visionpaySFTS20260525083347733X', 0, '{}')
`).run();

const r5 = await runZnImport(envReconcile, { orders: brokenOrderRows });
console.log('第五次:', r5.summary);
assert.equal(r5.summary.ordersImported, 0, '历史错单重复导入不应创建新订单');
assert.equal(r5.summary.ordersDuplicate, 1, '历史错单应识别为重复订单');
assert.equal(r5.summary.ordersReconciled, 1, '历史错单应被校正');

const fixedItems = envReconcile.DB.query(`
  SELECT p.name, si.quantity, si.unit_price_cents, si.line_amount_cents, si.line_cogs_cents
  FROM sales_items si
  JOIN products p ON p.id = si.product_id
  WHERE si.sales_order_id = ?
  ORDER BY si.unit_price_cents
`, 'zn:visionpaySFTS20260525083347733X');
console.log('校正后明细:', fixedItems);
assert.equal(fixedItems.length, 2, '历史错单应重建为两条销售明细');
assert.deepEqual(
  fixedItems.map(item => [item.name, item.quantity, item.unit_price_cents, item.line_amount_cents]),
  [
    ['冰露矿泉水550ml', 1, 100, 100],
    ['东鹏补水啦电解质水柠檬味1L', 1, 550, 550]
  ],
  '历史错单校正后应按商品单价分别记录小计'
);
const fixedBalances = envReconcile.DB.query(`
  SELECT product_id, quantity_on_hand
  FROM inventory_balances
  WHERE product_id IN ('broken-dp', 'broken-water')
    AND machine_id = '1号机'
  ORDER BY product_id
`);
assert.deepEqual(
  fixedBalances.map(item => [item.product_id, item.quantity_on_hand]),
  [
    ['broken-dp', 9],
    ['broken-water', 9]
  ],
  '历史错单校正应按真实销售机台恢复旧库存影响并扣减两种商品'
);

console.log('\n✅ 多商品错单校正测试通过：重复导入能修正已存在的一单多商品错误明细');

async function seedCostProducts(targetEnv) {
  const timestamp = '2026-05-01T00:00:00.000Z';
  await targetEnv.DB.prepare(`
    INSERT INTO products (
      id, machine_id, name, category, sell_price_cents, status,
      created_at, updated_at, normalized_name, external_id
    ) VALUES
      ('cost-dp-1', '1/2号机', '东鹏特饮维生素功能饮料', '饮料', 600, 'active', ?, ?, '东鹏特饮维生素功能饮料', NULL),
      ('cost-water-2', '1/2号机', '怡宝饮用纯净水1.55L', '饮料', 350, 'active', ?, ?, '怡宝饮用纯净水155l', '6901285991271')
  `).bind(timestamp, timestamp, timestamp, timestamp).run();
  await targetEnv.DB.prepare(`
    INSERT INTO purchase_orders (
      id, machine_id, record_date, source, note, image_asset_id, voided_at, created_at, updated_at
    ) VALUES
      ('seed-cost-po-1', '1号机', '2026-05-01', '测试', NULL, NULL, NULL, ?, ?),
      ('seed-cost-po-2', '2号机', '2026-05-01', '测试', NULL, NULL, NULL, ?, ?)
  `).bind(timestamp, timestamp, timestamp, timestamp).run();
  await targetEnv.DB.prepare(`
    INSERT INTO purchase_items (
      id, purchase_id, product_id, quantity, unit_cost_cents, total_cost_cents, created_at
    ) VALUES
      ('seed-cost-po-1:0', 'seed-cost-po-1', 'cost-dp-1', 100, 300, 30000, ?),
      ('seed-cost-po-2:0', 'seed-cost-po-2', 'cost-water-2', 100, 200, 20000, ?)
  `).bind(timestamp, timestamp).run();
}
