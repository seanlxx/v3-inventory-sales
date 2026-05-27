import { createResult, runD1Query, toNumber, writeJson } from './_common.mjs';

const rows = runD1Query(`
  SELECT 'inventory_balances' AS table_name, machine_id, COUNT(*) AS row_count
  FROM inventory_balances
  GROUP BY machine_id

  UNION ALL

  SELECT 'stock_movements' AS table_name, machine_id, COUNT(*) AS row_count
  FROM stock_movements
  GROUP BY machine_id

  UNION ALL

  SELECT 'sales_orders' AS table_name, machine_id, COUNT(*) AS row_count
  FROM sales_orders
  GROUP BY machine_id

  UNION ALL

  SELECT 'purchase_orders' AS table_name, machine_id, COUNT(*) AS row_count
  FROM purchase_orders
  GROUP BY machine_id

  ORDER BY table_name, machine_id
`);

const foldedMachineIds = new Set(['1/2号机', '1/2号机总库存', '__pending_split__']);
const normalized = rows
  .filter(row => foldedMachineIds.has(row.machine_id))
  .map(row => ({
    ...row,
    row_count: toNumber(row.row_count),
    suspected_root_cause: 'R2'
  }));

const result = createResult({
  check: 'stock-scope-leakage',
  rootCause: 'R2',
  rows: normalized,
  summary: {
    leakage_group_count: normalized.length,
    leakage_row_count: normalized.reduce((sum, row) => sum + row.row_count, 0)
  }
});

const file = writeJson('stock-scope-leakage', result);
console.log(JSON.stringify(result.summary, null, 2));
console.log(`Wrote: ${file}`);
