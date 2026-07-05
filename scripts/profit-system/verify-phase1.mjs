import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureOutputDir,
  formatMoney,
  outputDir,
  previousMonth,
  runD1Query,
  toNumber
} from './_d1.mjs';

function parseOptions(argv = process.argv.slice(2)) {
  const monthIndex = argv.indexOf('--month');
  return {
    local: argv.includes('--local'),
    writeDoc: argv.includes('--write-doc'),
    month: monthIndex >= 0 ? argv[monthIndex + 1] : previousMonth()
  };
}

function first(rows) {
  return rows[0] || {};
}

function moneyRow(label, row) {
  return `| ${label} | ${formatMoney(row.sales_amount_cents)} | ${formatMoney(row.refund_amount_cents)} | ${formatMoney(row.fee_amount_cents)} | ${formatMoney(row.discount_cents)} | ${formatMoney(row.net_revenue_cents)} | ${formatMoney(row.cogs_cents)} | ${formatMoney(row.gross_profit_cents)} | ${row.order_count || 0} |`;
}

function renderTable(rows, emptyText, columns, renderRow) {
  if (!rows.length) return `${emptyText}\n`;
  return `${columns.join('\n')}\n${rows.map(renderRow).join('\n')}\n`;
}

function renderMarkdown({ month, oldTotals, newTotals, missingCosts, migrationChecks, mergeRows }) {
  const salesDiff = toNumber(newTotals.sales_amount_cents) - toNumber(oldTotals.sales_amount_cents);
  const cogsDiff = toNumber(newTotals.cogs_cents) - toNumber(oldTotals.cogs_cents);
  const profitDiff = toNumber(newTotals.gross_profit_cents) - toNumber(oldTotals.gross_profit_cents);
  const failedChecks = migrationChecks.filter(row => toNumber(row.diff) !== 0);

  return `# 利润系统 Phase 1 校验-${month}

> 数据来源：旧库存/销售表与新利润表并行对比。生成时间：${new Date().toISOString()}。

## 月度利润对比

| 口径 | 销售金额 | 退款 | 手续费/服务费 | 优惠 | 净收入 | 成本 | 毛利 | 单据数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${moneyRow('旧系统表', oldTotals)}
${moneyRow('新利润表', newTotals)}

差异：销售金额 ${formatMoney(salesDiff)}，成本 ${formatMoney(cogsDiff)}，毛利 ${formatMoney(profitDiff)}。

## 迁移完整性

| 检查 | 旧表数量 | 新表数量 | 差异 |
| --- | ---: | ---: | ---: |
${migrationChecks.map(row => `| ${row.check_name} | ${row.old_count} | ${row.new_count} | ${row.diff} |`).join('\n')}

是否存在迁移失败：${failedChecks.length ? '是' : '否'}。

## 成本缺失商品

${renderTable(
  missingCosts,
  '无成本缺失商品。',
  [
    '| 商品 | 全局商品 ID | 销售数量 | 销售金额 | 当前销售成本 | 成本快照数 |',
    '| --- | --- | ---: | ---: | ---: | ---: |'
  ],
  row => `| ${row.canonical_name} | ${row.product_global_id} | ${row.quantity} | ${formatMoney(row.line_amount_cents)} | ${formatMoney(row.line_cogs_cents)} | ${row.cost_snapshot_count} |`
)}

## 商品合并结果

${renderTable(
  mergeRows,
  '无多旧商品合并到同一全局商品的记录。',
  [
    '| 全局商品 | normalized_name | 旧商品数 | 旧商品 ID | 别名 |',
    '| --- | --- | ---: | --- | --- |'
  ],
  row => `| ${row.canonical_name} | ${row.normalized_name} | ${row.legacy_product_count} | ${row.source_product_ids_json} | ${row.aliases || '-'} |`
)}
`;
}

function oldTotalsSql(month) {
  return `
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(CASE WHEN type = 'sale' THEN total_amount_cents ELSE 0 END), 0) AS sales_amount_cents,
      COALESCE(SUM(CASE
        WHEN type = 'sale' THEN refund_amount_cents
        WHEN type = 'refund' THEN COALESCE(NULLIF(refund_amount_cents, 0), total_amount_cents, 0)
        ELSE 0
      END), 0) AS refund_amount_cents,
      COALESCE(SUM(CASE WHEN type = 'sale' THEN platform_fee_cents + service_fee_cents ELSE 0 END), 0) AS fee_amount_cents,
      COALESCE(SUM(CASE WHEN type = 'sale' THEN discount_cents ELSE 0 END), 0) AS discount_cents,
      COALESCE(SUM(CASE
        WHEN type = 'sale' THEN total_amount_cents - refund_amount_cents - platform_fee_cents - service_fee_cents - discount_cents
        WHEN type = 'refund' THEN -COALESCE(NULLIF(refund_amount_cents, 0), total_amount_cents, 0)
        ELSE 0
      END), 0) AS net_revenue_cents,
      COALESCE(SUM(CASE
        WHEN type = 'sale' THEN total_cogs_cents
        WHEN type = 'refund' THEN -total_cogs_cents
        ELSE 0
      END), 0) AS cogs_cents,
      COALESCE(SUM(CASE
        WHEN type = 'sale' THEN total_amount_cents - refund_amount_cents - platform_fee_cents - service_fee_cents - discount_cents - total_cogs_cents
        WHEN type = 'refund' THEN -COALESCE(NULLIF(refund_amount_cents, 0), total_amount_cents, 0) + total_cogs_cents
        ELSE 0
      END), 0) AS gross_profit_cents
    FROM sales_orders
    WHERE year_month = '${month}'
      AND voided_at IS NULL
      AND type IN ('sale', 'refund')
  `;
}

function newTotalsSql(month) {
  return `
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(gross_amount_cents), 0) AS sales_amount_cents,
      COALESCE(SUM(refund_amount_cents), 0) AS refund_amount_cents,
      COALESCE(SUM(platform_fee_cents + service_fee_cents), 0) AS fee_amount_cents,
      COALESCE(SUM(discount_cents), 0) AS discount_cents,
      COALESCE(SUM(net_revenue_cents), 0) AS net_revenue_cents,
      COALESCE(SUM(CASE
        WHEN type = 'sale' THEN total_cogs_cents
        WHEN type = 'refund' THEN -total_cogs_cents
        ELSE 0
      END), 0) AS cogs_cents,
      COALESCE(SUM(gross_profit_cents), 0) AS gross_profit_cents
    FROM sales_records
    WHERE year_month = '${month}'
      AND status = 'active'
      AND type IN ('sale', 'refund')
  `;
}

function migrationChecksSql() {
  return `
    SELECT 'products -> aliases' AS check_name,
      (SELECT COUNT(*) FROM products) AS old_count,
      (SELECT COUNT(*) FROM product_aliases WHERE source = 'legacy-products') AS new_count,
      (SELECT COUNT(*) FROM products) - (SELECT COUNT(*) FROM product_aliases WHERE source = 'legacy-products') AS diff
    UNION ALL
    SELECT 'purchase_orders -> purchase_records',
      (SELECT COUNT(*) FROM purchase_orders),
      (SELECT COUNT(*) FROM purchase_records WHERE legacy_purchase_id IS NOT NULL),
      (SELECT COUNT(*) FROM purchase_orders) - (SELECT COUNT(*) FROM purchase_records WHERE legacy_purchase_id IS NOT NULL)
    UNION ALL
    SELECT 'purchase_items -> purchase_record_items',
      (SELECT COUNT(*) FROM purchase_items),
      (SELECT COUNT(*) FROM purchase_record_items WHERE legacy_purchase_item_id IS NOT NULL),
      (SELECT COUNT(*) FROM purchase_items) - (SELECT COUNT(*) FROM purchase_record_items WHERE legacy_purchase_item_id IS NOT NULL)
    UNION ALL
    SELECT 'sales_orders -> sales_records',
      (SELECT COUNT(*) FROM sales_orders),
      (SELECT COUNT(*) FROM sales_records WHERE legacy_sales_id IS NOT NULL),
      (SELECT COUNT(*) FROM sales_orders) - (SELECT COUNT(*) FROM sales_records WHERE legacy_sales_id IS NOT NULL)
    UNION ALL
    SELECT 'sales_items -> sales_record_items',
      (SELECT COUNT(*) FROM sales_items),
      (SELECT COUNT(*) FROM sales_record_items WHERE legacy_sales_item_id IS NOT NULL),
      (SELECT COUNT(*) FROM sales_items) - (SELECT COUNT(*) FROM sales_record_items WHERE legacy_sales_item_id IS NOT NULL)
  `;
}

function missingCostsSql(month) {
  return `
    SELECT
      pg.id AS product_global_id,
      pg.canonical_name,
      SUM(sri.quantity) AS quantity,
      SUM(sri.line_amount_cents) AS line_amount_cents,
      SUM(sri.line_cogs_cents) AS line_cogs_cents,
      (
        SELECT COUNT(*)
        FROM cost_snapshots cs
        WHERE cs.product_global_id = pg.id
          AND (
            cs.unit_cost_cents > 0
            OR cs.source_type = 'manual_cost'
          )
      ) AS cost_snapshot_count
    FROM sales_record_items sri
    JOIN sales_records sr ON sr.id = sri.sales_record_id
    JOIN products_global pg ON pg.id = sri.product_global_id
    WHERE sr.year_month = '${month}'
      AND sr.status = 'active'
      AND sr.type = 'sale'
      AND sri.unit_cost_cents = 0
    GROUP BY pg.id, pg.canonical_name
    HAVING cost_snapshot_count = 0
    ORDER BY line_amount_cents DESC
    LIMIT 50
  `;
}

function mergeRowsSql() {
  return `
    SELECT
      pg.id,
      pg.canonical_name,
      pg.normalized_name,
      pg.legacy_product_count,
      pg.source_product_ids_json,
      (
        SELECT group_concat(pa.alias_name, ' / ')
        FROM product_aliases pa
        WHERE pa.product_global_id = pg.id
      ) AS aliases
    FROM products_global pg
    WHERE pg.legacy_product_count > 1
    ORDER BY pg.legacy_product_count DESC, pg.canonical_name
    LIMIT 50
  `;
}

export function buildReport(options) {
  const oldTotals = first(runD1Query(oldTotalsSql(options.month), options));
  const newTotals = first(runD1Query(newTotalsSql(options.month), options));
  const migrationChecks = runD1Query(migrationChecksSql(), options);
  const missingCosts = runD1Query(missingCostsSql(options.month), options);
  const mergeRows = runD1Query(mergeRowsSql(), options);
  return { oldTotals, newTotals, migrationChecks, missingCosts, mergeRows };
}

export function main() {
  const options = parseOptions();
  ensureOutputDir();
  const report = buildReport(options);
  const markdown = renderMarkdown({ month: options.month, ...report });
  const reportPath = join(outputDir, `phase1-verify-${options.month}.md`);
  writeFileSync(reportPath, markdown);
  console.log(markdown);
  console.log(`Wrote: ${reportPath}`);

  if (options.writeDoc) {
    const docPath = join(outputDir, '..', '..', 'docs', `利润系统Phase1校验-${options.month}.md`);
    writeFileSync(docPath, markdown);
    console.log(`Wrote: ${docPath}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
