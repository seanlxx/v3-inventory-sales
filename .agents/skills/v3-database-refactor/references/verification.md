# Verification

## Build/Test Rules

For documentation-only skill or plan updates, do not run build or dev server.

For migrations:

```powershell
npx wrangler d1 migrations apply vending-inventory-sales-db --local
```

Use the v3 D1 database name once `wrangler.jsonc` is switched.

For frontend/API changes, follow the project `AGENTS.md` matrix.

## Migration Script Requirements

Export/transform/import should be separate scripts.

Import must:

- default to `--dry-run`
- reject v2 database/resource names
- import in foreign-key order
- print row counts only
- avoid printing raw business records, image base64, tokens, or keys

## Reconciliation Checks

Check movement totals against balances:

```sql
WITH movement_totals AS (
  SELECT product_id, machine_id, SUM(qty_delta) AS recalculated_qty
  FROM stock_movements
  GROUP BY product_id, machine_id
)
SELECT
  b.product_id,
  b.machine_id,
  b.quantity_on_hand,
  COALESCE(m.recalculated_qty, 0) AS recalculated_qty,
  b.quantity_on_hand - COALESCE(m.recalculated_qty, 0) AS diff
FROM inventory_balances b
LEFT JOIN movement_totals m
  ON m.product_id = b.product_id
 AND m.machine_id = b.machine_id
WHERE b.quantity_on_hand != COALESCE(m.recalculated_qty, 0);
```

Also compare:

- v2 product count vs v3 product count
- v2 purchase quantity/cost vs v3 purchase item totals
- v2 sales/refunds/losses vs v3 order totals by type
- v2 `products.currentStock` vs v3 `inventory_balances.quantity_on_hand`
- v2 image records vs v3 `image_assets`

Do not auto-correct differences. Generate a report first, then apply explicit adjustment documents only after review.
