import { createResult, runD1Query, toNumber, writeJson } from './_common.mjs';

const rows = runD1Query(`
  WITH voided AS (
    SELECT id, 'sales_order' AS ref_type, type AS order_type, voided_at
    FROM sales_orders
    WHERE voided_at IS NOT NULL

    UNION ALL

    SELECT id, 'purchase_order' AS ref_type, 'purchase' AS order_type, voided_at
    FROM purchase_orders
    WHERE voided_at IS NOT NULL
  ),
  counts AS (
    SELECT
      v.id,
      v.ref_type,
      v.order_type,
      v.voided_at,
      SUM(CASE WHEN m.movement_type != 'void' THEN 1 ELSE 0 END) AS forward_count,
      SUM(CASE WHEN m.movement_type = 'void' THEN 1 ELSE 0 END) AS reverse_count
    FROM voided v
    LEFT JOIN stock_movements m ON m.ref_id = v.id AND m.ref_type = v.ref_type
    GROUP BY v.id, v.ref_type, v.order_type, v.voided_at
  )
  SELECT
    id AS order_id,
    ref_type,
    order_type,
    voided_at,
    COALESCE(forward_count, 0) AS forward_count,
    COALESCE(reverse_count, 0) AS reverse_count,
    COALESCE(forward_count, 0) - COALESCE(reverse_count, 0) AS missing
  FROM counts
  WHERE COALESCE(forward_count, 0) != COALESCE(reverse_count, 0)
  ORDER BY ABS(COALESCE(forward_count, 0) - COALESCE(reverse_count, 0)) DESC, voided_at DESC
`);

const normalized = rows.map(row => ({
  ...row,
  forward_count: toNumber(row.forward_count),
  reverse_count: toNumber(row.reverse_count),
  missing: toNumber(row.missing),
  suspected_root_cause: 'R5'
}));

const result = createResult({
  check: 'void-unwind',
  rootCause: 'R5',
  rows: normalized,
  summary: {
    mismatched_order_count: normalized.length,
    missing_movement_count: normalized.reduce((sum, row) => sum + Math.max(0, row.missing), 0)
  }
});

const file = writeJson('void-unwind', result);
console.log(JSON.stringify(result.summary, null, 2));
console.log(`Wrote: ${file}`);
