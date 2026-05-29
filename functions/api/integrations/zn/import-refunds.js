import { all, first } from '../../_shared/d1.js';
import { json, methodNotAllowed, parseJsonBody } from '../../_shared/http.js';
import { nonNegativeCents } from '../../_shared/money.js';
import { applyBalanceDelta, getBalance, normalizeMachineId, upsertBalanceStatement } from '../../_shared/inventory-balance.js';
import { normalizeProductName } from '../../_shared/shengma/mapper.js';
import { nowIso, yearMonthFromDate } from '../../_shared/validators.js';
import { ZN_INTEGRATION, mapZnDeviceLabelToMachine } from '../../_shared/zn/constants.js';

function text(value) {
  return String(value || '').trim();
}

function moneyCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return nonNegativeCents(Math.round(number * 100));
}

function quantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(Math.abs(number)));
}

function toDateOnly(value) {
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const zh = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (zh) return `${zh[1]}-${zh[2].padStart(2, '0')}-${zh[3].padStart(2, '0')}`;
  return '';
}

function createdAtFromDate(date) {
  return `${date || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function normalizeRefund(row) {
  const refundOrderNo = text(row?.refundOrderNo);
  const originalOrderNo = text(row?.originalOrderNo || row?.vendorOrderNo);
  const vendorProductName = text(row?.vendorProductName);
  return {
    refundOrderNo,
    originalOrderNo,
    deviceName: text(row?.deviceName || row?.deviceCode),
    paidAmountCents: moneyCents(row?.paidAmount),
    refundAmountCents: moneyCents(row?.refundAmount),
    purchaseTime: text(row?.purchaseTime),
    paidAt: text(row?.paidAt),
    transactionNo: text(row?.transactionNo),
    vendorProductName,
    vendorBarcode: text(row?.vendorBarcode),
    quantity: quantity(row?.quantity),
    unitPriceCents: moneyCents(row?.unitPrice),
    payMethod: text(row?.payMethod),
    orderStatus: text(row?.orderStatus),
    refundStatus: text(row?.refundStatus),
    refundTime: text(row?.refundTime),
    operator: text(row?.operator),
    note: text(row?.note)
  };
}

function validatePayload(body) {
  const rows = Array.isArray(body?.refunds)
    ? body.refunds
    : Array.isArray(body?.rows)
      ? body.rows
      : [];
  if (rows.length === 0) throw new Error('退款明细为空');

  const groups = [];
  let current = null;
  for (const raw of rows) {
    const row = normalizeRefund(raw);
    if (row.refundOrderNo) {
      current = {
        refundOrderNo: row.refundOrderNo,
        originalOrderNo: row.originalOrderNo,
        deviceName: row.deviceName,
        paidAmountCents: row.paidAmountCents,
        refundAmountCents: row.refundAmountCents,
        purchaseTime: row.purchaseTime,
        paidAt: row.paidAt,
        transactionNo: row.transactionNo,
        payMethod: row.payMethod,
        orderStatus: row.orderStatus,
        refundStatus: row.refundStatus,
        refundTime: row.refundTime,
        operator: row.operator,
        note: row.note,
        items: []
      };
      groups.push(current);
    }
    if (!current) continue;
    if (row.vendorProductName) {
      current.items.push({
        vendorProductName: row.vendorProductName,
        vendorBarcode: row.vendorBarcode,
        quantity: row.quantity,
        unitPriceCents: row.unitPriceCents
      });
    }
  }
  return groups;
}

function isSuccessfulRefund(refund) {
  return (!refund.refundStatus || refund.refundStatus === '退款成功')
    && (!refund.orderStatus || refund.orderStatus === '已完成');
}

async function getOriginalOrder(env, refund) {
  if (!refund.originalOrderNo) return null;
  return await first(env.DB, `
    SELECT *
    FROM sales_orders
    WHERE source = ? AND external_id = ? AND type = 'sale'
    LIMIT 1
  `, [ZN_INTEGRATION, refund.originalOrderNo]);
}

async function getOriginalItems(env, orderId) {
  return await all(env.DB, `
    SELECT
      i.*,
      p.name AS product_name,
      p.normalized_name,
      p.external_id
    FROM sales_items i
    JOIN products p ON p.id = i.product_id
    WHERE i.sales_order_id = ?
    ORDER BY i.id
  `, [orderId]);
}

function normalizeText(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/毫升/gi, 'ml')
    .replace(/克/gi, 'g')
    .replace(/升/gi, 'l')
    .replace(/[（）()【】[\]{}<>《》"'“”‘’、，,。.!！?？:：;；\s_\-—/\\|+*=~`·￥$#@%^&]/g, '')
    .replace(/[^0-9a-z\u4e00-\u9fa5]/g, '');
  return normalizeProductName(normalized) || normalized;
}

function matchOriginalItem(refundItem, candidates, usedIds) {
  const barcode = text(refundItem.vendorBarcode).replace(/-\d+$/, '');
  const name = normalizeText(refundItem.vendorProductName);
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (usedIds.has(candidate.id)) continue;
    let score = 0;
    const external = text(candidate.external_id).replace(/-\d+$/, '');
    const candidateName = normalizeText(candidate.product_name || candidate.normalized_name);
    if (barcode && external && (barcode === external || external.includes(barcode) || barcode.includes(external))) score = 1;
    else if (name && candidateName && (name === candidateName || name.includes(candidateName) || candidateName.includes(name))) score = 0.9;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore >= 0.8 ? best : null;
}

function lineAmountFor(refund, item, sumLineAmount) {
  const itemAmount = Math.max(0, item.quantity * item.unitPriceCents);
  if (refund.refundAmountCents <= 0) return itemAmount;
  if (sumLineAmount > 0 && refund.refundAmountCents < sumLineAmount) {
    return Math.round(itemAmount * refund.refundAmountCents / sumLineAmount);
  }
  return itemAmount;
}

async function importOneRefund(env, refund, summary, warnings, timestamp) {
  if (!isSuccessfulRefund(refund)) {
    summary.refundsSkipped += 1;
    return;
  }
  if (!refund.refundOrderNo || !refund.originalOrderNo) {
    summary.refundsSkipped += 1;
    warnings.push(`退款单 ${refund.refundOrderNo || '-'} 缺退款单号或原订单号，已跳过`);
    return;
  }

  const externalId = `refund:${refund.refundOrderNo}`;
  const existing = await first(env.DB, `
    SELECT id
    FROM sales_orders
    WHERE source = ? AND external_id = ?
    LIMIT 1
  `, [ZN_INTEGRATION, externalId]);
  if (existing) {
    summary.refundsDuplicate += 1;
    return;
  }

  const originalOrder = await getOriginalOrder(env, refund);
  if (!originalOrder) {
    summary.refundsMissing += 1;
    warnings.push(`退款单 ${refund.refundOrderNo} 原订单 ${refund.originalOrderNo} 未找到，已跳过`);
    return;
  }

  const machineId = mapZnDeviceLabelToMachine(refund.deviceName) || normalizeMachineId(originalOrder.machine_id);
  const orderDate = toDateOnly(refund.refundTime) || toDateOnly(refund.paidAt) || toDateOnly(refund.purchaseTime) || originalOrder.record_date;
  const originalItems = await getOriginalItems(env, originalOrder.id);
  const usedIds = new Set();
  const matched = [];

  for (const item of refund.items) {
    if (!item.vendorProductName || item.quantity <= 0) continue;
    const originalItem = matchOriginalItem(item, originalItems, usedIds);
    if (!originalItem) {
      warnings.push(`退款单 ${refund.refundOrderNo} 商品 ${item.vendorProductName} 未匹配原订单明细，已跳过该商品`);
      continue;
    }
    usedIds.add(originalItem.id);
    const quantityToRefund = Math.min(item.quantity, Number(originalItem.quantity) || item.quantity);
    if (quantityToRefund <= 0) continue;
    matched.push({
      source: item,
      original: originalItem,
      quantity: quantityToRefund
    });
  }

  if (!matched.length) {
    summary.refundsSkipped += 1;
    return;
  }

  const sumLineAmount = matched.reduce((sum, item) => sum + item.quantity * item.source.unitPriceCents, 0);
  const isStockReturn = refund.refundAmountCents > 0
    && sumLineAmount > 0
    && Math.abs(refund.refundAmountCents - sumLineAmount) <= 1;
  const orderId = `zn:refund:${refund.refundOrderNo}`.slice(0, 120);
  const statements = [];
  let totalAmountCents = 0;
  let totalCogsCents = 0;
  let restoredQty = 0;

  statements.push(env.DB.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      platform_fee_cents, service_fee_cents, discount_cents, refund_amount_cents, received_amount_cents,
      note, image_asset_id, voided_at, created_at, updated_at, external_id, source
    ) VALUES (?, 'refund', ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, NULL, NULL, ?, ?, ?, ?)
  `).bind(
    orderId,
    machineId,
    orderDate,
    yearMonthFromDate(orderDate),
    `zn 退款明细导入；原订单：${refund.originalOrderNo}${refund.note ? `；${refund.note}` : ''}${isStockReturn ? '' : '；部分退款未回补库存'}`,
    timestamp,
    timestamp,
    externalId,
    ZN_INTEGRATION
  ));

  statements.push(env.DB.prepare(`
    UPDATE sales_orders
    SET refund_amount_cents = 0,
        updated_at = ?
    WHERE id = ?
      AND refund_amount_cents > 0
  `).bind(timestamp, originalOrder.id));

  const balanceCache = new Map();
  for (let index = 0; index < matched.length; index += 1) {
    const item = matched[index];
    const lineAmountCents = lineAmountFor(refund, item.source, sumLineAmount);
    const unitCostCents = Math.max(0, Number(item.original.unit_cost_cents) || 0);
    const lineCogsCents = unitCostCents * item.quantity;
    const itemId = `${orderId}:${index}`;

    totalAmountCents += lineAmountCents;
    if (isStockReturn) totalCogsCents += lineCogsCents;

    statements.push(env.DB.prepare(`
      INSERT INTO sales_items (
        id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
        line_amount_cents, line_cogs_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      itemId,
      orderId,
      item.original.product_id,
      item.quantity,
      item.source.unitPriceCents || Number(item.original.unit_price_cents) || 0,
      unitCostCents,
      lineAmountCents,
      isStockReturn ? lineCogsCents : 0,
      timestamp
    ));

    if (isStockReturn) {
      const movementCreatedAt = createdAtFromDate(orderDate);
      const balance = await getBalance(env, item.original.product_id, machineId, balanceCache);
      const nextBalance = applyBalanceDelta(balance, {
        qtyDelta: item.quantity,
        valueDeltaCents: lineCogsCents,
        timestamp: movementCreatedAt
      });
      balanceCache.set(`${item.original.product_id}\u0000${machineId}`, nextBalance);
      statements.push(env.DB.prepare(`
        INSERT INTO stock_movements (
          id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
          ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
        ) VALUES (?, ?, ?, 'refund', ?, ?, 'sales_order', ?, ?, NULL, ?, ?, ?)
      `).bind(
        `sales_order:${orderId}:${item.original.product_id}:${index}`,
        item.original.product_id,
        machineId,
        item.quantity,
        unitCostCents,
        orderId,
        itemId,
        `${ZN_INTEGRATION}:refund:${refund.refundOrderNo}:${index}`,
        `zn 退款明细导入；原订单：${refund.originalOrderNo}`,
        movementCreatedAt
      ));
      statements.push(upsertBalanceStatement(env.DB, nextBalance));
      restoredQty += item.quantity;
    }
    summary.linesImported += 1;
  }

  const finalRefundAmountCents = refund.refundAmountCents || totalAmountCents;
  statements.push(env.DB.prepare(`
    UPDATE sales_orders
    SET total_amount_cents = ?,
        total_cogs_cents = ?,
        refund_amount_cents = ?,
        received_amount_cents = 0,
        updated_at = ?
    WHERE id = ?
  `).bind(finalRefundAmountCents, totalCogsCents, finalRefundAmountCents, timestamp, orderId));

  statements.push(env.DB.prepare(`
    INSERT INTO external_sales_imports (
      integration, vendor_order_no, local_sales_order_id, imported_at, raw_json
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(ZN_INTEGRATION, externalId, orderId, Date.now(), JSON.stringify(refund)));

  try {
    await env.DB.batch(statements);
    summary.refundsImported += 1;
    if (isStockReturn) summary.stockRestored += restoredQty;
    else summary.amountOnly += 1;
  } catch (error) {
    summary.refundsSkipped += 1;
    warnings.push(`退款单 ${refund.refundOrderNo} 导入失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function importZnRefunds(env, body) {
  const refunds = validatePayload(body);
  const summary = {
    refundsParsed: refunds.length,
    refundsImported: 0,
    refundsDuplicate: 0,
    refundsSkipped: 0,
    refundsMissing: 0,
    linesImported: 0,
    stockRestored: 0,
    amountOnly: 0,
    warnings: 0
  };
  const warnings = [];
  const timestamp = nowIso();

  for (const refund of refunds) {
    await importOneRefund(env, refund, summary, warnings, timestamp);
  }

  summary.warnings = warnings.length;
  return { summary, warnings };
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, await importZnRefunds(context.env, body || {}));
  } catch (error) {
    return json(400, { message: error instanceof Error ? error.message : 'zn 退款导入失败' });
  }
}

export function onRequest() {
  return methodNotAllowed();
}
