import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const xlsxPath = process.argv[2] || join(projectRoot, '订单明细_2026-05-01_2026-05-25.xlsx');
const outputSql = process.argv[3] || join(projectRoot, 'output', 'zn-profit-backfill.sql');

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
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function normalizeBarcode(raw) {
  const match = String(raw || '').trim().match(/^(\d{8,14})/);
  return match ? match[1] : '';
}

function normalizeProductName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/毫升/gi, 'ml')
    .replace(/克/gi, 'g')
    .replace(/升/gi, 'l')
    .replace(/[（）()【】[\]{}<>《》"'“”‘’、，,。.!！?？:：;；\s_\-—/\\|+*=~`·￥$#@%^&]/g, '')
    .replace(/[^0-9a-z\u4e00-\u9fa5]/g, '');
}

function normalizeCostText(raw) {
  return normalizeProductName(raw)
    .replace(/饮料/g, '')
    .replace(/饮品/g, '')
    .replace(/复合茶/g, '茶')
    .replace(/天然矿泉水/g, '矿泉水')
    .replace(/纯净水/g, '水')
    .replace(/瓶装/g, '')
    .replace(/非标品如上架造成损失自行承担/g, '');
}

function uniqueChars(value) {
  return Array.from(new Set(String(value || '').split(''))).filter(Boolean);
}

function coverage(needle, haystack) {
  const chars = uniqueChars(needle);
  if (!chars.length || !haystack) return 0;
  return chars.filter(char => haystack.includes(char)).length / chars.length;
}

function bigrams(value) {
  const text = String(value || '');
  if (!text) return new Set();
  if (text.length === 1) return new Set([text]);
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function jaccard(left, right) {
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }
  return intersection / (leftGrams.size + rightGrams.size - intersection);
}

function nameScore(leftName, rightName) {
  const left = normalizeCostText(leftName);
  const right = normalizeCostText(rightName);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  return Math.max(
    jaccard(left, right),
    coverage(left, right) * 0.72,
    coverage(right, left) * 0.72
  );
}

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function parseExcelRows(filePath) {
  const workbook = XLSX.read(readFileSync(filePath));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const orders = new Map();
  for (const row of rows) {
    const status = pickField(row, ['状态']);
    const refundAmount = toNumber(pickField(row, ['退款金额']));
    const orderNo = pickField(row, ['订单号']);
    const productName = pickField(row, ['商品名称']);
    if (status !== '已完成' || refundAmount > 0 || !orderNo || !productName) continue;
    orders.set(orderNo, {
      orderNo,
      productName,
      barcode: normalizeBarcode(pickField(row, ['商品条码'])),
      quantity: Math.max(1, Number(pickField(row, ['商品数量'])) || 1),
      receivedAmountCents: Math.round(toNumber(pickField(row, ['预估到帐金额', '预估到账金额', '到账金额'])) * 100),
      lineAmountCents: Math.round(toNumber(pickField(row, ['销售额', '价格'])) * 100),
      platformFeeCents: Math.round(toNumber(pickField(row, ['手续费'])) * 100),
      serviceFeeCents: Math.round(toNumber(pickField(row, ['算法服务费'])) * 100),
      discountCents: Math.round(toNumber(pickField(row, ['优惠金额'])) * 100)
    });
  }
  return orders;
}

function parseWranglerJson(output) {
  const text = String(output || '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error(`Unable to parse wrangler JSON output: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

function runD1Query(sql) {
  const queryFile = join(projectRoot, 'output', `zn-profit-query-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(queryFile, String(sql).replace(/\s+/g, ' ').trim());
  const escapedPath = queryFile.replace(/'/g, "''");
  const raw = execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `$sql = Get-Content -LiteralPath '${escapedPath}' -Raw; & npx wrangler d1 execute v3-vending-inventory-sales-db --remote --json --command $sql`
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
  return parseWranglerJson(raw).flatMap(item => item.results || []);
}

async function main() {
  const excelOrders = parseExcelRows(xlsxPath);
  const purchaseRows = runD1Query(`
    SELECT
      p.id,
      p.machine_id,
      p.name,
      p.normalized_name,
      p.external_id,
      SUM(i.quantity) AS quantity,
      SUM(i.total_cost_cents) AS total_cost_cents,
      ROUND(1.0 * SUM(i.total_cost_cents) / NULLIF(SUM(i.quantity), 0), 0) AS avg_cost_cents
    FROM purchase_items i
    JOIN purchase_orders o ON o.id = i.purchase_id
    JOIN products p ON p.id = i.product_id
    WHERE o.voided_at IS NULL
    GROUP BY p.id, p.machine_id, p.name, p.normalized_name, p.external_id
    HAVING SUM(i.quantity) > 0 AND SUM(i.total_cost_cents) > 0
  `);
  const salesRows = runD1Query(`
    SELECT
      o.id AS order_id,
      o.external_id AS vendor_order_no,
      o.machine_id,
      i.id AS item_id,
      p.id AS product_id,
      p.name,
      p.normalized_name,
      p.external_id AS product_external_id,
      i.quantity,
      o.total_amount_cents,
      o.received_amount_cents,
      o.platform_fee_cents,
      o.service_fee_cents,
      o.discount_cents,
      i.line_amount_cents,
      i.line_cogs_cents
    FROM sales_orders o
    JOIN sales_items i ON i.sales_order_id = o.id
    JOIN products p ON p.id = i.product_id
    WHERE o.voided_at IS NULL
      AND o.source = 'zn'
      AND o.year_month = '2026-05'
    ORDER BY o.id, i.id
  `);

  const purchasesByMachine = new Map();
  for (const row of purchaseRows) {
    if (!purchasesByMachine.has(row.machine_id)) purchasesByMachine.set(row.machine_id, []);
    purchasesByMachine.get(row.machine_id).push(row);
  }

  const itemUpdates = [];
  const movementUpdates = [];
  const orderCogs = new Map();
  const orderFieldUpdates = [];
  const missing = [];
  let matched = 0;
  let cogsTotal = 0;

  for (const sale of salesRows) {
    const excel = excelOrders.get(sale.vendor_order_no);
    const barcode = excel?.barcode || normalizeBarcode(sale.product_external_id);
    const productName = excel?.productName || sale.name;
    const candidates = purchasesByMachine.get(sale.machine_id) || [];
    let best = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      let score = 0;
      if (barcode && candidate.external_id === barcode) score = 1;
      else if (sale.normalized_name && candidate.normalized_name === sale.normalized_name) score = 1;
      else if (candidate.id === sale.product_id) score = 0.95;
      else score = nameScore(productName, candidate.name);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    let lineCogsCents = Number(sale.line_cogs_cents) || 0;
    if (best && bestScore >= 0.72 && Number(best.avg_cost_cents) > 0) {
      const unitCostCents = Number(best.avg_cost_cents);
      lineCogsCents = unitCostCents * Number(sale.quantity);
      itemUpdates.push(`UPDATE sales_items SET unit_cost_cents = ${unitCostCents}, line_cogs_cents = ${lineCogsCents} WHERE id = ${sqlString(sale.item_id)};`);
      movementUpdates.push(`UPDATE stock_movements SET unit_cost_cents = ${unitCostCents} WHERE ref_type = 'sales_order' AND ref_item_id = ${sqlString(sale.item_id)};`);
      matched += 1;
      cogsTotal += lineCogsCents;
    } else {
      missing.push({
        order: sale.vendor_order_no,
        product: productName,
        machine: sale.machine_id,
        best: best?.name || '',
        score: Number(bestScore.toFixed(3))
      });
    }
    orderCogs.set(sale.order_id, (orderCogs.get(sale.order_id) || 0) + lineCogsCents);

    if (excel) {
      const assignments = [];
      if (excel.receivedAmountCents && excel.receivedAmountCents !== Number(sale.received_amount_cents)) {
        assignments.push(`received_amount_cents = ${excel.receivedAmountCents}`);
      }
      if (excel.platformFeeCents !== Number(sale.platform_fee_cents)) {
        assignments.push(`platform_fee_cents = ${excel.platformFeeCents}`);
      }
      if (excel.serviceFeeCents !== Number(sale.service_fee_cents)) {
        assignments.push(`service_fee_cents = ${excel.serviceFeeCents}`);
      }
      if (excel.discountCents !== Number(sale.discount_cents)) {
        assignments.push(`discount_cents = ${excel.discountCents}`);
      }
      if (assignments.length > 0) {
        orderFieldUpdates.push(`UPDATE sales_orders SET ${assignments.join(', ')} WHERE id = ${sqlString(sale.order_id)};`);
      }
    }
  }

  const sql = [
    'PRAGMA foreign_keys = ON;',
    ...orderFieldUpdates,
    ...itemUpdates,
    ...movementUpdates,
    ...Array.from(orderCogs.entries()).map(([orderId, cogs]) =>
      `UPDATE sales_orders SET total_cogs_cents = ${cogs}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${sqlString(orderId)};`
    )
  ].join('\n');
  writeFileSync(outputSql, sql);

  const receivedTotal = Array.from(excelOrders.values()).reduce((sum, row) => sum + row.receivedAmountCents, 0);
  const revenueTotal = Array.from(excelOrders.values()).reduce((sum, row) => sum + row.lineAmountCents, 0);
  console.log(JSON.stringify({
    xlsxPath,
    outputSql,
    orders: excelOrders.size,
    salesRows: salesRows.length,
    matched,
    missing: missing.length,
    revenue: revenueTotal / 100,
    received: receivedTotal / 100,
    cogs: cogsTotal / 100,
    grossProfit: (receivedTotal - cogsTotal) / 100,
    missingSample: missing.slice(0, 20)
  }, null, 2));

}

await main();
