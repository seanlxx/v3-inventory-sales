import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatMoney,
  outputDir,
  productLabel,
  readJson,
  scriptDir,
  todayStamp,
  toNumber
} from './_common.mjs';

const checks = [
  {
    file: 'balance-vs-movements.mjs',
    json: 'balance-vs-movements',
    title: 'balance-vs-movements',
    metric: result => toNumber(result.summary.drift_sku_count),
    metricLabel: '漂移 SKU'
  },
  {
    file: 'purchase-vs-balance.mjs',
    json: 'purchase-vs-balance',
    title: 'purchase-vs-balance',
    metric: result => toNumber(result.summary.drift_sku_count),
    metricLabel: '漂移 SKU'
  },
  {
    file: 'stock-scope-leakage.mjs',
    json: 'stock-scope-leakage',
    title: 'stock-scope-leakage',
    metric: result => toNumber(result.summary.leakage_row_count),
    metricLabel: '折叠值行数'
  },
  {
    file: 'void-unwind.mjs',
    json: 'void-unwind',
    title: 'void-unwind',
    metric: result => toNumber(result.summary.mismatched_order_count),
    metricLabel: '漏冲订单'
  },
  {
    file: 'duplicate-product.mjs',
    json: 'duplicate-product',
    title: 'duplicate-product',
    metric: result => toNumber(result.summary.duplicate_group_count),
    metricLabel: '重复组'
  }
];

function runScript(file) {
  execFileSync(process.execPath, [join(scriptDir, file)], {
    stdio: 'inherit',
    maxBuffer: 1024 * 1024 * 80
  });
}

function topRows(result) {
  return (result.rows || []).slice(0, 20);
}

function renderTopTable(result) {
  const rows = topRows(result);
  if (rows.length === 0) return '无异常。\n';

  if (result.check === 'balance-vs-movements') {
    return [
      '| 商品 | 机台 | 流水净额 | 余额 | 漂移 | 估算金额 | 根因 |',
      '| --- | --- | ---: | ---: | ---: | ---: | --- |',
      ...rows.map(row => `| ${productLabel(row)} | ${row.machine_id || '-'} | ${row.movements_net_qty} | ${row.balance_qty} | ${row.drift_qty} | ${formatMoney(row.drift_value_cents)} | ${row.suspected_root_cause} |`)
    ].join('\n') + '\n';
  }

  if (result.check === 'purchase-vs-balance') {
    return [
      '| 商品 | 机台 | 进货 | 库存 | 销售 | 报损 | 退货 | 调整 | 漂移 | 估算金额 | 根因 |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
      ...rows.map(row => `| ${productLabel(row)} | ${row.machine_id || '-'} | ${row.purchase_qty} | ${row.balance_qty} | ${row.sale_qty} | ${row.loss_qty} | ${row.refund_qty} | ${row.adjustment_qty} | ${row.drift_qty} | ${formatMoney(row.drift_value_cents)} | ${row.suspected_root_cause} |`)
    ].join('\n') + '\n';
  }

  if (result.check === 'stock-scope-leakage') {
    return [
      '| 表 | 折叠值 | 行数 | 根因 |',
      '| --- | --- | ---: | --- |',
      ...rows.map(row => `| ${row.table_name} | ${row.machine_id} | ${row.row_count} | ${row.suspected_root_cause} |`)
    ].join('\n') + '\n';
  }

  if (result.check === 'void-unwind') {
    return [
      '| 单据 | 类型 | 作废时间 | 正向流水 | 反向流水 | 缺口 | 根因 |',
      '| --- | --- | --- | ---: | ---: | ---: | --- |',
      ...rows.map(row => `| ${row.order_id} | ${row.ref_type}/${row.order_type} | ${row.voided_at || '-'} | ${row.forward_count} | ${row.reverse_count} | ${row.missing} | ${row.suspected_root_cause} |`)
    ].join('\n') + '\n';
  }

  return [
    '| 机台 | normalized_name | 重复数 | 商品 ID | 商品名 | 根因 |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...rows.map(row => `| ${row.machine_id} | ${row.normalized_name} | ${row.dup_count} | ${row.product_ids.join('<br>')} | ${row.names.join('<br>')} | ${row.suspected_root_cause} |`)
  ].join('\n') + '\n';
}

function renderMarkdown(results, stamp) {
  const generatedAt = new Date().toISOString();
  const summaryRows = results.map(result => {
    const check = checks.find(item => item.json === result.check);
    const metric = check.metric(result);
    return { result, check, metric, ok: metric === 0 };
  });
  const allZero = summaryRows.every(row => row.ok);
  const rootCauseCounts = {};
  for (const result of results) {
    for (const row of result.rows || []) {
      const cause = row.suspected_root_cause || result.root_cause || 'unknown';
      rootCauseCounts[cause] = (rootCauseCounts[cause] || 0) + 1;
    }
  }
  const rootCauseText = Object.entries(rootCauseCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cause, count]) => `${cause}: ${count}`)
    .join('；') || '无';

  return `# 库存漂移现状-${stamp}

> Phase 0.5 诊断基线。数据来源：Cloudflare D1 远程库 \`v3-vending-inventory-sales-db\`。生成时间：${generatedAt}。

## 总览

| 检查 | 指标 | 数值 | Phase 2.5 门槛 |
| --- | --- | ---: | --- |
${summaryRows.map(row => `| ${row.check.title} | ${row.check.metricLabel} | ${row.metric} | 0 |`).join('\n')}

五项是否全 0：${allZero ? '是' : '否'}。

根因分布：${rootCauseText}。

## 判读

- Phase 0.5 的目标是记录重建前基线，非 0 不阻断当前诊断阶段。
- Phase 2.5 重建后必须重新运行同一套脚本，以上五项全部为 0 才能部署。
- Top 20 明细按数量或行数优先排序；金额为基于当前平均成本的估算，仅用于排查优先级。

${results.map(result => `## ${result.check}

根因索引：${result.root_cause || 'unknown'}。

摘要：

\`\`\`json
${JSON.stringify(result.summary, null, 2)}
\`\`\`

Top 20：

${renderTopTable(result)}`).join('\n')}
`;
}

for (const check of checks) {
  console.log(`\n=== ${check.title} ===`);
  runScript(check.file);
}

const results = checks.map(check => readJson(check.json));
const stamp = todayStamp();
const markdown = renderMarkdown(results, stamp);
const summaryPath = join(outputDir, `summary-${stamp}.md`);
writeFileSync(summaryPath, markdown);
console.log(`\nWrote: ${summaryPath}`);

const shouldWriteDoc = process.argv.includes('--write-doc');
if (shouldWriteDoc) {
  const docPath = join(scriptDir, '..', '..', 'docs', `库存漂移现状-${stamp}.md`);
  writeFileSync(docPath, markdown);
  console.log(`Wrote: ${docPath}`);
}

const failed = results.some(result => {
  const check = checks.find(item => item.json === result.check);
  return check.metric(result) !== 0;
});

if (failed && process.argv.includes('--gate')) {
  console.error('Diagnostics found non-zero drift. This is expected in Phase 0.5 but fails as a Phase 2.5 gate.');
  process.exit(1);
}

if (failed) {
  console.error('Diagnostics found non-zero drift. Phase 0.5 records this baseline; use --gate for Phase 2.5 enforcement.');
}
