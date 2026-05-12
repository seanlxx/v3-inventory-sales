# V3 Schema And Ledger

## Required Tables

Core tables:

- `products`
- `purchase_orders`
- `purchase_items`
- `sales_orders`
- `sales_items`
- `stock_movements`
- `inventory_balances`
- `image_assets`

Authentication tables may remain separate and can be copied from v2 if the app keeps the same login flow.

## Money And Quantity

- Store money as integer cents using `_cents` suffix.
- Store current integer-unit quantities as `INTEGER`.
- Convert v2 decimal RMB with `Math.round(Number(value || 0) * 100)`.

## Inventory Ledger

`stock_movements` is the source of truth.

| Business action | `movement_type` | `qty_delta` |
| --- | --- | --- |
| purchase | `purchase` | positive |
| sale | `sale` | negative |
| refund | `refund` | positive |
| loss | `loss` | negative |
| manual adjustment | `adjustment` | signed |
| void | `void` | reverse of original movement |

`inventory_balances` is a cache. It must be rebuildable with:

```sql
SELECT product_id, machine_id, SUM(qty_delta) AS quantity_on_hand
FROM stock_movements
GROUP BY product_id, machine_id;
```

## Service-Layer Rules

All inventory-changing routes must call one shared inventory service. Do not update stock separately in page modules or route handlers.

Create purchase:

1. Insert purchase order.
2. Insert purchase items.
3. Insert positive stock movements.
4. Upsert inventory balances.

Create sale:

1. Read inventory balances.
2. Reject insufficient stock.
3. Snapshot current average cost.
4. Insert sale order and items.
5. Insert negative stock movements.
6. Update balances.

Create refund:

1. Prefer original sale item price/cost if linked.
2. Insert refund order and positive movements.
3. Increase balances.

Create loss:

1. Insert `sales_orders.type = 'loss'`.
2. Use zero revenue and current average cost.
3. Insert negative movements.
4. Decrease balances.

Void document:

1. Set `voided_at`.
2. Insert reverse `movement_type = 'void'` rows.
3. Link `voids_movement_id` to original movements.
4. Update balances.

Do not hard-delete business documents that affect reports.
