import { first } from '../../_shared/d1.js';
import { json, methodNotAllowed, parseJsonBody } from '../../_shared/http.js';
import { computeReceivedFromBill, nonNegativeCents, yuanToCents } from '../../_shared/money.js';
import { ZN_INTEGRATION } from '../../_shared/zn/constants.js';

function text(value) {
  return String(value || '').trim();
}

function centsFromParsed(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return nonNegativeCents(number);
}

function moneyFieldCents(row, centsKey, yuanKey) {
  if (row?.[centsKey] !== undefined && row?.[centsKey] !== null && row?.[centsKey] !== '') {
    return centsFromParsed(row[centsKey]);
  }
  return yuanToCents(row?.[yuanKey]);
}

function normalizeSettlement(row) {
  const vendorOrderNo = text(row?.vendorOrderNo);
  if (!vendorOrderNo) return null;
  const incomeType = text(row?.incomeType);
  return {
    vendorOrderNo,
    deviceCode: text(row?.deviceCode),
    grossAmountCents: moneyFieldCents(row, 'grossAmountCents', 'grossAmount'),
    refundAmountCents: moneyFieldCents(row, 'refundAmountCents', 'refundAmount'),
    platformFeeCents: moneyFieldCents(row, 'platformFeeCents', 'platformFee'),
    serviceFeeCents: moneyFieldCents(row, 'serviceFeeCents', 'serviceFee'),
    expenseCents: moneyFieldCents(row, 'expenseCents', 'expense'),
    payMethod: text(row?.payMethod),
    incomeType,
    settledAt: text(row?.settledAt)
  };
}

function validatePayload(body) {
  const rows = Array.isArray(body?.settlements)
    ? body.settlements
    : Array.isArray(body?.rows)
      ? body.rows
      : [];
  if (rows.length === 0) throw new Error('结算数据为空');
  return rows.map(normalizeSettlement).filter(Boolean);
}

export async function importZnSettlement(env, body) {
  const settlements = validatePayload(body);
  const summary = {
    settlementsProcessed: 0,
    settlementsUpdated: 0,
    settlementsSkipped: 0,
    settlementsMissing: 0,
    warnings: 0
  };
  const warnings = [];
  const timestamp = Date.now();

  for (const settlement of settlements) {
    if (settlement.incomeType && settlement.incomeType !== '收入') {
      summary.settlementsSkipped += 1;
      continue;
    }

    summary.settlementsProcessed += 1;
    const existing = await first(env.DB, `
      SELECT id, total_amount_cents
      FROM sales_orders
      WHERE source = ? AND external_id = ?
      LIMIT 1
    `, [ZN_INTEGRATION, settlement.vendorOrderNo]);

    if (!existing) {
      summary.settlementsMissing += 1;
      warnings.push(`结算订单 ${settlement.vendorOrderNo} 未找到对应销售单，已跳过`);
      continue;
    }

    const grossAmountCents = settlement.grossAmountCents > 0
      ? settlement.grossAmountCents
      : nonNegativeCents(existing.total_amount_cents);
    const receivedAmountCents = computeReceivedFromBill({
      ...settlement,
      grossAmountCents
    });

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE sales_orders
        SET platform_fee_cents = ?,
            service_fee_cents = ?,
            refund_amount_cents = ?,
            received_amount_cents = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).bind(
        settlement.platformFeeCents,
        settlement.serviceFeeCents,
        settlement.refundAmountCents,
        receivedAmountCents,
        existing.id
      ),
      env.DB.prepare(`
        INSERT INTO external_settlement_imports (
          integration, vendor_order_no, local_sales_order_id, imported_at, raw_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(integration, vendor_order_no) DO UPDATE SET
          local_sales_order_id = excluded.local_sales_order_id,
          imported_at = excluded.imported_at,
          raw_json = excluded.raw_json
      `).bind(
        ZN_INTEGRATION,
        settlement.vendorOrderNo,
        existing.id,
        timestamp,
        JSON.stringify(settlement)
      )
    ]);

    if (
      settlement.expenseCents > 0
      && settlement.expenseCents !== settlement.platformFeeCents + settlement.serviceFeeCents
    ) {
      warnings.push(`结算订单 ${settlement.vendorOrderNo} 费用合计与手续费+算法费不一致`);
    }

    summary.settlementsUpdated += 1;
  }

  summary.warnings = warnings.length;
  return { summary, warnings };
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, await importZnSettlement(context.env, body || {}));
  } catch (error) {
    return json(400, { message: error instanceof Error ? error.message : 'zn 结算导入失败' });
  }
}

export function onRequest() {
  return methodNotAllowed();
}
