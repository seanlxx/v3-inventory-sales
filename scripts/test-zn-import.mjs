import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from '../output/xlsx-inspect/node_modules/xlsx/xlsx.mjs';

import { runZnImport } from '../functions/api/_shared/zn/importer.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);

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
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0001_initial_d1_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0007_shengma_integration.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0008_zn_order_fees.sql'), 'utf8'));

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
  const status = pickField(raw, ['状态']);
  const deviceCode = pickField(raw, ['设备编号']);
  const vendorProductName = pickField(raw, ['商品名称']);
  const vendorBarcode = pickField(raw, ['商品条码']);
  const unitPrice = toNumber(pickField(raw, ['商品单价']));
  const quantity = Math.max(1, Number(pickField(raw, ['商品数量'])) || 1);
  const lineAmount = toNumber(pickField(raw, ['销售额', '价格']));
  const refundAmount = toNumber(pickField(raw, ['退款金额']));
  const platformFee = toNumber(pickField(raw, ['手续费']));
  const serviceFee = toNumber(pickField(raw, ['算法服务费']));
  const discount = toNumber(pickField(raw, ['优惠金额']));
  const date = pickField(raw, ['创建时间', '扣款时间']);
  if (!vendorOrderNo && !deviceCode) return null;
  return { vendorOrderNo, status, deviceCode, vendorProductName, vendorBarcode, unitPrice, quantity, lineAmount, refundAmount, platformFee, serviceFee, discount, date };
}

const xlsxPath = join(projectRoot, '订单明细_2026-05-01_2026-05-25.xlsx');
const wb = XLSX.read(readFileSync(xlsxPath));
const sheet = wb.Sheets[wb.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
const orders = json.map(normalizeRow).filter(Boolean);

console.log('解析行数:', orders.length);

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
assert.equal(r1.summary.linesImported, 768, '完整 Excel 每个有效订单应有一条明细');
assert(r1.summary.ordersImported > 0, '应至少有一些订单导入成功');

// 手续费/服务费应有非零订单
const feeOrders = env.DB.queryOne(`
  SELECT COUNT(*) AS n FROM sales_orders
  WHERE source = 'zn' AND (platform_fee_cents > 0 OR service_fee_cents > 0)
`).n;
console.log('含手续费/服务费订单数:', feeOrders);
assert(feeOrders > 0, '应至少有一些订单包含手续费或算法服务费');

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
  SELECT so.id, so.machine_id, so.total_amount_cents, so.record_date,
         si.quantity, si.unit_price_cents
  FROM sales_orders so
  JOIN sales_items si ON si.sales_order_id = so.id
  WHERE so.source = 'zn'
  LIMIT 1
`);
console.log('样例订单:', sample);
assert(sample.total_amount_cents > 0, '订单金额应大于 0');
assert(sample.quantity >= 1, '数量应 ≥ 1');

// 验证库存余额是负数（因为没有进货记录就直接卖了，余额会变负）
const negativeBalances = env.DB.query('SELECT product_id, machine_id, quantity_on_hand FROM inventory_balances WHERE quantity_on_hand < 0 LIMIT 3');
console.log('负库存示例（正常：销售先于进货，需要先录入进货才能修正）:', negativeBalances);

console.log('\n✅ 全部断言通过');
console.log('  · 第一次导入：%d 单 / %d 行 / %d 件商品', r1.summary.ordersImported, r1.summary.linesImported, r1.summary.productsCreated);
console.log('  · 第二次重复导入：0 写入，全部识别为重复 → 数据不会被覆盖或污染');

// === 第三次：故意制造缺失，验证回填 ===
console.log('\n--- 回填测试 ---');
// 找一个有条码的商品，清空 external_id 和 normalized_name
const sampleProduct = env.DB.queryOne(`
  SELECT id, external_id, normalized_name FROM products
  WHERE external_id IS NOT NULL AND length(external_id) >= 8 LIMIT 1
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
assert.equal(productAfter.external_id, sampleProduct.external_id, '商品 barcode 应被回填');
assert.equal(productAfter.normalized_name, sampleProduct.normalized_name, '商品 normalized_name 应被回填');

const orderAfter = env.DB.queryOne(`
  SELECT total_amount_cents, platform_fee_cents, service_fee_cents
  FROM sales_orders WHERE id = ?
`, sampleOrder.id);
console.log('订单（回填后）:', orderAfter);
assert.equal(orderAfter.platform_fee_cents, sampleOrder.platform_fee_cents, '订单手续费应被回填');
assert.equal(orderAfter.service_fee_cents, sampleOrder.service_fee_cents, '订单服务费应被回填');
assert.equal(orderAfter.total_amount_cents, sampleOrder.total_amount_cents, '订单销售额应被回填');

console.log('\n✅ 回填测试通过：重复导入时商品条码 / 名称 / 订单手续费 / 销售额会被自动修正');

// === 第四次：模拟前端分批提交，结果应与一次性导入一致 ===
console.log('\n--- 分批导入测试 ---');
const envChunked = { DB: new D1Database() };
envChunked.DB.exec(readFileSync(join(projectRoot, 'migrations', '0001_initial_d1_schema.sql'), 'utf8'));
envChunked.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));
envChunked.DB.exec(readFileSync(join(projectRoot, 'migrations', '0007_shengma_integration.sql'), 'utf8'));
envChunked.DB.exec(readFileSync(join(projectRoot, 'migrations', '0008_zn_order_fees.sql'), 'utf8'));

function chunkByOrder(sourceRows, batchSize) {
  const batches = [];
  let current = [];
  const currentOrders = new Set();
  for (const row of sourceRows) {
    const orderNo = row.vendorOrderNo || `row-${current.length}`;
    if (current.length > 0 && !currentOrders.has(orderNo) && currentOrders.size >= batchSize) {
      batches.push(current);
      current = [];
      currentOrders.clear();
    }
    current.push(row);
    currentOrders.add(orderNo);
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
