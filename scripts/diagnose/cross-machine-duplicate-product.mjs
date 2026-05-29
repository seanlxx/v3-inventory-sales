import { createResult, runD1Query, toNumber, writeJson } from './_common.mjs';

/**
 * 跨 machine_id 找同 normalized_name 的 active 商品（专查 zn 销售导入与 AI 进货识别建出
 * 的"双 product"，根因 R-D：zn importer.js 用 '1/2号机' 折叠值建商品，AI 进货识别用真实
 * '1号机' / '2号机' 建商品，造成同一个真实商品在 products 表里出现两条记录）。
 *
 * 输出：每组同名商品对，含每条产品的：
 *   - 当前余额（按机汇总）
 *   - 累计进货数量 / 金额
 *   - 累计销售数量
 *   - movement 行数（为合并提供工作量估计）
 *
 * 用作 scripts/merge-duplicate-products.mjs 的输入候选。
 */

// 1) 找出 normalized_name 在多个 machine_id 下都存在的商品组
const groupRows = runD1Query(`
  SELECT
    normalized_name,
    COUNT(DISTINCT machine_id) AS machine_count,
    COUNT(*) AS product_count,
    GROUP_CONCAT(machine_id, '||') AS machine_ids,
    GROUP_CONCAT(id, '||') AS product_ids,
    GROUP_CONCAT(name, '||') AS names
  FROM products
  WHERE status = 'active'
    AND normalized_name IS NOT NULL
    AND normalized_name != ''
  GROUP BY normalized_name
  HAVING machine_count > 1
  ORDER BY product_count DESC, normalized_name
`);

const groups = groupRows.map(row => ({
  normalized_name: row.normalized_name,
  machine_count: toNumber(row.machine_count),
  product_count: toNumber(row.product_count),
  machine_ids: String(row.machine_ids || '').split('||').filter(Boolean),
  product_ids: String(row.product_ids || '').split('||').filter(Boolean),
  names: String(row.names || '').split('||').filter(Boolean)
}));

// 2) 对每组里的每个 product_id，拉它的余额 / 进货 / 销售指标
//    一次性把所有 product_id 拼成 IN (?,?,?) 防止循环上百次 wrangler 调用
const allProductIds = groups.flatMap(g => g.product_ids);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const metricsByProduct = new Map();
if (allProductIds.length > 0) {
  // wrangler 的 SQL 长度有限，分批查
  for (const batch of chunk(allProductIds, 100)) {
    const inList = batch.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
    const rows = runD1Query(`
      SELECT
        p.id AS product_id,
        p.machine_id AS product_machine_id,
        p.name AS product_name,
        p.normalized_name,
        COALESCE(b.qty, 0) AS balance_qty,
        COALESCE(pi.purchase_qty, 0) AS purchase_qty,
        COALESCE(pi.purchase_cost_cents, 0) AS purchase_cost_cents,
        COALESCE(si.sale_qty, 0) AS sale_qty,
        COALESCE(mv.movement_count, 0) AS movement_count
      FROM products p
      LEFT JOIN (
        SELECT product_id, SUM(quantity_on_hand) AS qty
        FROM inventory_balances
        WHERE product_id IN (${inList})
        GROUP BY product_id
      ) b ON b.product_id = p.id
      LEFT JOIN (
        SELECT i.product_id,
               SUM(i.quantity) AS purchase_qty,
               SUM(i.total_cost_cents) AS purchase_cost_cents
        FROM purchase_items i
        JOIN purchase_orders o ON o.id = i.purchase_id
        WHERE i.product_id IN (${inList}) AND o.voided_at IS NULL
        GROUP BY i.product_id
      ) pi ON pi.product_id = p.id
      LEFT JOIN (
        SELECT i.product_id,
               SUM(i.quantity) AS sale_qty
        FROM sales_items i
        JOIN sales_orders o ON o.id = i.sales_id
        WHERE i.product_id IN (${inList}) AND o.voided_at IS NULL
        GROUP BY i.product_id
      ) si ON si.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS movement_count
        FROM stock_movements
        WHERE product_id IN (${inList})
        GROUP BY product_id
      ) mv ON mv.product_id = p.id
      WHERE p.id IN (${inList})
    `);
    for (const row of rows) {
      metricsByProduct.set(row.product_id, {
        product_id: row.product_id,
        product_machine_id: row.product_machine_id,
        product_name: row.product_name,
        normalized_name: row.normalized_name,
        balance_qty: toNumber(row.balance_qty),
        purchase_qty: toNumber(row.purchase_qty),
        purchase_cost_cents: toNumber(row.purchase_cost_cents),
        sale_qty: toNumber(row.sale_qty),
        movement_count: toNumber(row.movement_count)
      });
    }
  }
}

// 3) 拼装每组的 products 详情，并打疑似根因标签
const FOLDED = new Set(['1/2号机', '1/2号机总库存']);

const enriched = groups.map(group => {
  const products = group.product_ids.map(id => metricsByProduct.get(id) || {
    product_id: id,
    product_machine_id: '?',
    product_name: '?',
    balance_qty: 0,
    purchase_qty: 0,
    purchase_cost_cents: 0,
    sale_qty: 0,
    movement_count: 0
  });

  const hasFolded = products.some(p => FOLDED.has(p.product_machine_id));
  const hasReal = products.some(p => !FOLDED.has(p.product_machine_id));

  // R-D：折叠 + 真实机器同名并存（zn 销售 vs AI 进货串货的核心证据）
  // R-7：纯重名（在同根因 duplicate-product.mjs 里也会出，但那个只查同机器内）
  let suspectedRootCause;
  if (hasFolded && hasReal) suspectedRootCause = 'R-D';
  else suspectedRootCause = 'R-7';

  // 合并建议：保留有真实 machine_id 的那条；把折叠值那条的流水迁移过来
  const keepCandidate = products
    .filter(p => !FOLDED.has(p.product_machine_id))
    .sort((a, b) => b.movement_count - a.movement_count)[0]
    || products[0];

  return {
    normalized_name: group.normalized_name,
    machine_count: group.machine_count,
    product_count: group.product_count,
    suspected_root_cause: suspectedRootCause,
    keep_product_id: keepCandidate?.product_id || null,
    keep_machine_id: keepCandidate?.product_machine_id || null,
    products
  };
});

// 4) 排序：R-D 优先（最严重），按总销售 / 总进货数大的在前
function groupSeverity(g) {
  return g.products.reduce((sum, p) => sum + p.purchase_qty + p.sale_qty, 0);
}
enriched.sort((a, b) => {
  if (a.suspected_root_cause !== b.suspected_root_cause) {
    return a.suspected_root_cause === 'R-D' ? -1 : 1;
  }
  return groupSeverity(b) - groupSeverity(a);
});

const summary = {
  total_groups: enriched.length,
  rd_groups: enriched.filter(g => g.suspected_root_cause === 'R-D').length,
  r7_groups: enriched.filter(g => g.suspected_root_cause === 'R-7').length,
  total_extra_products: enriched.reduce((sum, g) => sum + Math.max(0, g.product_count - 1), 0),
  total_folded_balance_qty: enriched.reduce((sum, g) =>
    sum + g.products.filter(p => FOLDED.has(p.product_machine_id)).reduce((s, p) => s + p.balance_qty, 0)
  , 0),
  total_folded_sale_qty: enriched.reduce((sum, g) =>
    sum + g.products.filter(p => FOLDED.has(p.product_machine_id)).reduce((s, p) => s + p.sale_qty, 0)
  , 0)
};

const result = createResult({
  check: 'cross-machine-duplicate-product',
  rootCause: 'R-D',
  rows: enriched,
  summary
});

const file = writeJson('cross-machine-duplicate-product', result);
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote: ${file}`);
console.log('');
console.log(`Top 10 R-D 组（折叠机 + 真实机同名）:`);
const top = enriched.filter(g => g.suspected_root_cause === 'R-D').slice(0, 10);
for (const g of top) {
  console.log(`  ${g.normalized_name}  -> ${g.products.length} products`);
  for (const p of g.products) {
    console.log(`     [${p.product_machine_id}] ${p.product_name} | bal=${p.balance_qty} purch=${p.purchase_qty} sale=${p.sale_qty} mov=${p.movement_count}`);
  }
}
