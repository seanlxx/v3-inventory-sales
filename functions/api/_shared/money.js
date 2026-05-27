export function cents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

export function nonNegativeCents(value) {
  return Math.max(0, cents(value));
}

export function yuanToCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

export function computeReceivedAmountCents({
  grossAmountCents = 0,
  refundAmountCents = 0,
  platformFeeCents = 0,
  serviceFeeCents = 0
} = {}) {
  return Math.max(
    0,
    cents(grossAmountCents)
      - nonNegativeCents(refundAmountCents)
      - nonNegativeCents(platformFeeCents)
      - nonNegativeCents(serviceFeeCents)
  );
}

export function computeProfit({ receivedCents = 0, cogsCents = 0 } = {}) {
  const received = cents(receivedCents);
  const cogs = cents(cogsCents);
  const profitCents = received - cogs;
  return {
    profitCents,
    profitRate: received > 0 ? profitCents / received : null
  };
}

export function computeOrderTotals(rows = []) {
  const totals = rows.reduce((acc, row) => {
    const quantity = Math.max(1, cents(row.quantity || 1));
    const unitCostCents = nonNegativeCents(row.unitCostCents);
    const lineAmountCents = nonNegativeCents(
      row.lineAmountCents ?? (nonNegativeCents(row.unitPriceCents) * quantity)
    );
    const lineCogsCents = nonNegativeCents(row.lineCogsCents ?? unitCostCents * quantity);
    acc.grossAmountCents += lineAmountCents;
    acc.cogsCents += lineCogsCents;
    return acc;
  }, {
    grossAmountCents: 0,
    cogsCents: 0
  });

  totals.refundAmountCents = nonNegativeCents(rows[0]?.refundAmountCents);
  totals.platformFeeCents = nonNegativeCents(rows[0]?.platformFeeCents);
  totals.serviceFeeCents = nonNegativeCents(rows[0]?.serviceFeeCents);
  totals.discountCents = nonNegativeCents(rows[0]?.discountCents);
  totals.receivedAmountCents = computeReceivedAmountCents(totals);
  totals.netSalesCents = Math.max(0, totals.grossAmountCents - totals.refundAmountCents);
  totals.profit = computeProfit({
    receivedCents: totals.receivedAmountCents,
    cogsCents: totals.cogsCents
  });
  return totals;
}

export function computeReceivedFromBill(bill = {}) {
  return computeReceivedAmountCents({
    grossAmountCents: bill.grossAmountCents ?? bill.gross_amount_cents,
    refundAmountCents: bill.refundAmountCents ?? bill.refund_amount_cents,
    platformFeeCents: bill.platformFeeCents ?? bill.platform_fee_cents,
    serviceFeeCents: bill.serviceFeeCents ?? bill.service_fee_cents
  });
}

export function signedSalesSumSql(column) {
  return `COALESCE(SUM(CASE WHEN type = 'sale' THEN ${column} WHEN type = 'refund' THEN -${column} ELSE 0 END), 0)`;
}

export function profitCents(receivedCents, cogsCents) {
  return computeProfit({ receivedCents, cogsCents }).profitCents;
}

export function profitRatePercent(receivedCents, cogsCents) {
  const result = computeProfit({ receivedCents, cogsCents });
  return result.profitRate === null ? 0 : result.profitRate * 100;
}
