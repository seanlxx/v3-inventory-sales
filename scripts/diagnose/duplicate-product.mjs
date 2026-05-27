import { createResult, runD1Query, toNumber, writeJson } from './_common.mjs';

const rows = runD1Query(`
  SELECT
    machine_id,
    normalized_name,
    COUNT(*) AS dup_count,
    GROUP_CONCAT(id, ', ') AS product_ids,
    GROUP_CONCAT(name, ' || ') AS names
  FROM products
  WHERE status = 'active'
    AND normalized_name IS NOT NULL
    AND normalized_name != ''
  GROUP BY machine_id, normalized_name
  HAVING dup_count > 1
  ORDER BY dup_count DESC, machine_id, normalized_name
`);

const normalized = rows.map(row => ({
  ...row,
  dup_count: toNumber(row.dup_count),
  product_ids: String(row.product_ids || '').split(', ').filter(Boolean),
  names: String(row.names || '').split(' || ').filter(Boolean),
  suspected_root_cause: 'R7'
}));

const result = createResult({
  check: 'duplicate-product',
  rootCause: 'R7',
  rows: normalized,
  summary: {
    duplicate_group_count: normalized.length,
    duplicate_extra_product_count: normalized.reduce((sum, row) => sum + Math.max(0, row.dup_count - 1), 0)
  }
});

const file = writeJson('duplicate-product', result);
console.log(JSON.stringify(result.summary, null, 2));
console.log(`Wrote: ${file}`);
