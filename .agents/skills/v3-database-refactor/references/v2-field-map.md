# V2 Field Map

Use this when transforming `vending_records.data` into v3 tables.

## Current V2 Stores

`vending_records.store` values:

| Store | Meaning |
| --- | --- |
| `products` | product master data plus cached stock/cost |
| `purchases` | purchase records |
| `sales` | sales, refunds, and losses |
| `settings` | app settings |

## Products

Common JSON fields:

| v2 field | Meaning | v3 target |
| --- | --- | --- |
| `id` | product id | `products.id` |
| `name` | product name | `products.name` |
| `machineId` | machine | `products.machine_id` |
| `category` | category | `products.category` |
| `sellPrice` | decimal RMB sell price | `products.sell_price_cents` |
| `avgCost` | decimal RMB cached average cost | reconciliation/cost seed only |
| `totalPurchaseQty` | cached purchase quantity | reconciliation only |
| `totalPurchaseCost` | decimal RMB cached purchase cost | reconciliation only |
| `currentStock` | cached current stock | reconciliation only |

Do not use `currentStock` as the v3 ledger source.

## Purchases

Actual v2 purchase cost fields are:

| v2 field | Meaning | v3 target |
| --- | --- | --- |
| `id` | purchase id | `purchase_orders.id` |
| `productId` | product id | `purchase_items.product_id` |
| `productName` | denormalized name | reference only |
| `machineId` | machine | order/item movement machine |
| `quantity` | purchased units | `purchase_items.quantity` |
| `unitPrice` | decimal RMB unit cost | `purchase_items.unit_cost_cents` |
| `totalPrice` | decimal RMB total cost | `purchase_items.total_cost_cents` |
| `source` | supplier/source | `purchase_orders.source` |
| `date` | business date | `purchase_orders.record_date` |
| `note` | note | `purchase_orders.note` |

Do not look for `unitCost` or `totalCost` in v2 purchase records unless legacy evidence is found in real data.

## Sales, Refunds, Losses

V2 records live in `store = 'sales'`.

| v2 `type` | v3 order type | Quantity rule | Movement |
| --- | --- | --- | --- |
| `daily` or missing | `sale` | use positive item quantity | `qty_delta = -quantity` |
| `refund` | `refund` | use `Math.abs(item.quantity)` | `qty_delta = +quantity` |
| `loss` | `loss` | use positive item quantity | `qty_delta = -quantity` |

Common sale item fields:

| v2 field | Meaning | v3 target |
| --- | --- | --- |
| `productId` | product id | `sales_items.product_id` |
| `quantity` | signed quantity in v2 | positive `sales_items.quantity` in v3 |
| `sellPrice` | product price snapshot | `sales_items.unit_price_cents` |
| `avgCost` | cost snapshot | `sales_items.unit_cost_cents` |
| `itemRevenue` | signed line revenue | `sales_items.line_amount_cents` |
| `itemCogs` | signed line cost | `sales_items.line_cogs_cents` |
| `actualDeducted` | old rollback helper | reference only |

For v3, keep item quantities positive and encode direction through `sales_orders.type` and `stock_movements.qty_delta`.
