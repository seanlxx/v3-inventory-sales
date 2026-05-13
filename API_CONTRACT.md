# API_CONTRACT.md

> 本文件定义 Nuxt 新 UI 消费的 API 合同。当前阶段只整理合同，不修改业务代码。

## 1. 通用约定

### 1.1 Base URL

所有接口以 `/api` 为前缀：

```text
/api/<resource>
```

### 1.2 认证

除 `POST /api/auth/login` 外，所有业务接口都必须带会话头：

```http
X-VM-Session: <session token>
Content-Type: application/json
```

### 1.3 JSON 命名

- 对外 API 使用 `camelCase`。
- D1 表字段使用 `snake_case`，不直接暴露给前端作为写入合同。
- 金额字段对前端使用元为单位的 number，例如 `12.5`；后端落库使用 `*_cents` 整数。
- 数量字段为整数。
- 时间字段使用 ISO 字符串，日期字段使用 `YYYY-MM-DD`，月份字段使用 `YYYY-MM`。

### 1.4 标准错误

当前 Pages Functions 多数错误返回：

```json
{
  "message": "Unauthorized"
}
```

Nuxt `useApi` 需要统一归一化为：

```ts
type ApiError = {
  code: string
  message: string
  details?: unknown
}
```

通用状态码：

| 状态码 | 含义 |
| --- | --- |
| `400` | 参数、payload 或业务校验失败 |
| `401` | 未登录或会话过期 |
| `404` | 资源不存在 |
| `405` | method 不允许 |
| `409` | 业务冲突，例如库存不足、重复作废 |
| `429` | 登录限流 |
| `500` | DB / R2 绑定或服务端异常 |
| `502` | AI 上游异常 |
| `503` | 外部 provider 未配置 |

### 1.5 分页

列表接口统一支持：

```ts
type PageQuery = {
  limit?: number // 默认 50，最大 1000
  offset?: number // 默认 0
}
```

响应建议统一为：

```ts
type ApiListResult<T> = {
  data: T[]
  meta: {
    limit: number
    offset: number
    total?: number
    hasMore?: boolean
  }
}
```

当前已实现接口有些直接返回数组；Nuxt `useApi` 需要兼容裸数组并包装为 `data`。

## 2. 库存红线

`stock_movements` 是库存唯一可信账本，`inventory_balances` 只是可重建缓存。

前端不能直接修改库存余额、均价、库存金额、累计进货数量或累计进货成本。

禁止 Nuxt 新 UI 向商品接口提交这些字段作为库存修改：

```ts
currentStock
avgCost
totalPurchaseQty
totalPurchaseCost
quantityOnHand
inventoryValue
```

所有库存变化必须通过以下业务动作产生 `stock_movements`：

| 业务动作 | 接口 | movement_type | qty_delta |
| --- | --- | --- | --- |
| 进货入库 | `POST /api/inventory/purchases` | `purchase` | 正数 |
| 销售出库 | `POST /api/inventory/sales` | `sale` | 负数 |
| 退款回库 | `POST /api/inventory/refunds` | `refund` | 正数 |
| 损耗出库 | `POST /api/inventory/losses` | `loss` | 负数 |
| 盘点调整 | `POST /api/inventory/adjustments` | `adjustment` | 有符号差值 |
| 作废单据 | `POST /api/inventory/void` | `void` | 原流水反向值 |

`GET /api/inventory/balances` 只能读余额缓存；如余额异常，应由服务端重建或通过盘点调整入账，不允许浏览器静默改余额。

## 3. 类型

### 3.1 Product

```ts
type Product = {
  id: string
  name: string
  machineId: string
  category: string
  sellPrice: number
  status: 'active' | 'archived'
  imageAssetId?: string | null
  currentStock?: number // read-only, from inventory_balances
  avgCost?: number // read-only, from inventory_balances
  totalPurchaseQty?: number // read-only
  totalPurchaseCost?: number // read-only
  createdAt: string
  updatedAt?: string
}
```

### 3.2 InventoryBalance

```ts
type InventoryBalance = {
  productId: string
  productName: string
  machineId: string
  category?: string
  quantityOnHand: number
  avgCost: number
  inventoryValue: number
  lowStockThreshold?: number
  isLowStock?: boolean
  updatedAt?: string
}
```

### 3.3 StockMovement

```ts
type StockMovement = {
  id: string
  productId: string
  productName?: string
  machineId: string
  movementType: 'purchase' | 'sale' | 'refund' | 'loss' | 'adjustment' | 'void'
  qtyDelta: number
  unitCost: number
  refType: 'purchase_order' | 'sales_order' | 'adjustment'
  refId: string
  refItemId?: string | null
  voidsMovementId?: string | null
  note?: string | null
  createdAt: string
}
```

### 3.4 PurchaseOrder

```ts
type PurchaseOrder = {
  id: string
  machineId: string
  date: string
  source?: string
  note?: string
  imageAssetId?: string | null
  hasImage?: boolean
  status: 'active' | 'voided'
  voidedAt?: string | null
  items: PurchaseItem[]
  totalCost: number
  createdAt: string
  updatedAt?: string
}

type PurchaseItem = {
  id?: string
  productId: string
  productName?: string
  quantity: number
  unitPrice: number
  totalPrice: number
}
```

### 3.5 SalesOrder

```ts
type SalesOrder = {
  id: string
  type: 'sale' | 'refund' | 'loss'
  machineId: string
  date: string
  yearMonth: string
  note?: string
  imageAssetId?: string | null
  hasImage?: boolean
  status: 'active' | 'voided'
  voidedAt?: string | null
  items: SalesItem[]
  totalAmount: number
  totalCogs: number
  createdAt: string
  updatedAt?: string
}

type SalesItem = {
  id?: string
  productId: string
  productName?: string
  quantity: number
  sellPrice?: number
  itemRevenue?: number
  avgCost?: number
  itemCogs?: number
}
```

### 3.6 ImageAsset

```ts
type ImageAsset = {
  id: string
  r2Key?: string
  mimeType: string
  sizeBytes?: number
  sourceStore: 'purchases' | 'sales' | 'products'
  sourceRecordId: string
  createdAt: string
}
```

前端展示图片时只使用 API 返回的 `imageUrl` 或 `imageBase64`，不直接拼 R2 key。

## 4. Auth

### POST /api/auth/login

登录并创建会话。此接口不需要 `X-VM-Session`。

Query：无。

Payload：

```ts
{
  username: string
  password: string
}
```

兼容旧字段：`p_username`、`p_password`。

Response `200`：

```ts
{
  token: string
  username: string
  expires_at: string
  uses_default_password: boolean
} | null
```

说明：当前实现登录失败返回 `200 null`；Nuxt 需要把 `null` 视为账号或密码错误。

Error：

| 状态码 | message | 说明 |
| --- | --- | --- |
| `400` | `Invalid credentials` | payload 非对象 |
| `429` | `Too many login attempts. Try again later.` | 登录尝试过多 |
| `500` | `D1 binding DB is not configured` | DB 未绑定 |

### GET /api/auth/profile

读取当前账号状态。

Query：无。

Payload：无。

Response `200`：

```ts
{
  username: string
  uses_default_password: boolean
}
```

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

### POST /api/auth/update

修改用户名或密码，并刷新所有会话。

Query：无。

Payload：

```ts
{
  currentPassword: string
  username: string
  newPassword?: string
}
```

兼容旧字段：`p_current_password`、`p_username`、`p_new_password`。

Response `200`：

```ts
{
  token: string
  username: string
  expires_at: string
  uses_default_password: boolean
}
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid auth payload` |
| `400` | `Current password is incorrect` |
| `400` | `Username length must be 3 to 64 characters` |
| `400` | `New password must be at least 4 characters` |
| `401` | `Unauthorized` |

## 5. Products

商品接口只维护主数据。库存相关字段只读，来自 `inventory_balances`。

### GET /api/products

查询商品列表或单个商品。

Query：

```ts
{
  id?: string
  machineId?: string
  category?: string
  search?: string
  includeArchived?: '1' | '0'
  limit?: number
  offset?: number
}
```

Payload：无。

Response `200`：

```ts
Product[] // 未传 id
Product | null // 传 id
```

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

### POST /api/products

新增商品。

Query：无。

Payload：

```ts
{
  name: string
  machineId: string
  category?: string
  sellPrice: number
  imageAssetId?: string
}
```

禁止提交库存字段。初始库存应通过 `POST /api/inventory/adjustments` 生成盘点流水。

Response `200`：

```ts
Product
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid product` |
| `400` | `Missing product name` |
| `401` | `Unauthorized` |

### PUT /api/products

更新商品主数据。

Query：

```ts
{
  id?: string // 当前实现也支持从 body.id 读取
}
```

Payload：

```ts
{
  id: string
  name?: string
  machineId?: string
  category?: string
  sellPrice?: number
  imageAssetId?: string | null
}
```

Response `200`：

```ts
Product
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing record id` |
| `400` | `Missing product name` |
| `401` | `Unauthorized` |

### DELETE /api/products

归档商品。此接口语义是 archive，不是硬删除。

Query：

```ts
{
  id: string
}
```

Payload：无。

Response `204`：无 body。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing product id` |
| `401` | `Unauthorized` |
| `404` | `Product not found` |

Nuxt 禁止调用不带 `id` 的 `DELETE /api/products`，因为当前实现会清空业务表，仅能作为开发重置能力。

## 6. Inventory Balances

### GET /api/inventory/balances

读取库存余额缓存。目标合同路径为 `/api/inventory/balances`；当前实现中等价只读数据来自 `GET /api/reports/inventory`，后续应补 canonical route 或在 Nuxt adapter 中兼容。

Query：

```ts
{
  productId?: string
  machineId?: string
  category?: string
  search?: string
  lowStock?: '1' | '0'
  limit?: number
  offset?: number
}
```

Payload：无。

Response `200`：

```ts
InventoryBalance[]
```

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

### POST /api/inventory/adjustments

盘点调整。前端允许发起盘点，但不能直接写 `inventory_balances`；服务端必须计算差值并插入 `stock_movements.movement_type = 'adjustment'`。

Query：无。

Payload：

```ts
{
  productId: string
  machineId?: string
  quantityOnHand?: number // 目标库存
  qtyDelta?: number // 与 quantityOnHand 二选一
  unitCost?: number
  note?: string
}
```

Response `200`：

```ts
Product
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Product not found` |
| `400` | `Invalid adjustment quantity` |
| `401` | `Unauthorized` |

## 7. Inventory Movements

### GET /api/inventory/movements

读取库存流水。此接口是 Nuxt 库存页、商品流水抽屉和单据追溯的核心只读接口。

Query：

```ts
{
  productId?: string
  machineId?: string
  movementType?: 'purchase' | 'sale' | 'refund' | 'loss' | 'adjustment' | 'void'
  refType?: 'purchase_order' | 'sales_order' | 'adjustment'
  refId?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}
```

Payload：无。

Response `200`：

```ts
StockMovement[]
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid movement filter` |
| `401` | `Unauthorized` |

Mutation 规则：Nuxt 不能向 `/api/inventory/movements` 写入数据。流水只能由进货、销售、退款、损耗、盘点、作废这些业务接口产生。

## 8. Inventory Purchases

### GET /api/inventory/purchases

查询进货单。

Query：

```ts
{
  id?: string
  productId?: string
  month?: string // YYYY-MM，Nuxt 推荐
  datePrefix?: string // 当前实现兼容
  status?: 'active' | 'voided' | 'all'
  includeImages?: '1' | '0'
  limit?: number
  offset?: number
}
```

Payload：无。

Response `200`：

```ts
PurchaseOrder[] // 未传 id
PurchaseOrder | null // 传 id
```

兼容说明：当前实现返回单商品扁平记录，字段为 `productId/productName/quantity/unitPrice/totalPrice`；Nuxt adapter 需要转换为 `items: PurchaseItem[]`。

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

### POST /api/inventory/purchases

创建进货单并入库。

Query：无。

Payload：

```ts
{
  id?: string
  machineId?: string
  date: string
  source?: string
  note?: string
  imageAssetId?: string
  imageBase64?: string // 当前兼容路径；Nuxt 新上传优先使用 imageAssetId
  mimeType?: string
  items?: PurchaseItem[]
  purchases?: Array<{
    id?: string
    productId?: string
    productName?: string
    machineId?: string
    category?: string
    sellPrice?: number
    quantity: number
    unitPrice: number
    totalPrice: number
    source?: string
    date?: string
    note?: string
  }> // 当前实现兼容
}
```

Response `200`：

```ts
PurchaseOrder
```

当前批量兼容响应：

```ts
{
  purchases: PurchaseOrder[]
}
```

Side effects：

- 插入 `purchase_orders`。
- 插入 `purchase_items`。
- 插入正数 `stock_movements`。
- 更新 `inventory_balances` 缓存。
- 如带图片，写入 R2 和 `image_assets`。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing purchases` |
| `400` | `Product not found` |
| `400` | `Invalid purchase quantity` |
| `400` | `Invalid purchase total price` |
| `401` | `Unauthorized` |

### PUT /api/inventory/purchases

更新进货单。若修改数量、商品、单价或总价，服务端必须作废原单并创建新单，不能直接改历史流水。

Query：

```ts
{
  id: string
}
```

Payload：

```ts
Partial<{
  date: string
  source: string
  note: string
  items: PurchaseItem[]
}>
```

Response `200`：

```ts
PurchaseOrder
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing purchase id` |
| `404` | `Purchase not found` |
| `401` | `Unauthorized` |

### DELETE /api/inventory/purchases

作废进货单。此接口语义是 void，不是硬删除；Nuxt UI 文案必须使用“作废”。

Query：

```ts
{
  id: string
}
```

Payload：无。

Response `204`：无 body。

Side effects：

- 设置 `purchase_orders.voided_at`。
- 插入反向 `stock_movements.movement_type = 'void'`。
- 更新 `inventory_balances` 缓存。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid void target` |
| `404` | `Document not found` |
| `401` | `Unauthorized` |

Nuxt 禁止调用不带 `id` 的 `DELETE /api/inventory/purchases`，因为当前实现会清空进货相关数据，仅能作为开发重置能力。

## 9. Inventory Sales

### GET /api/inventory/sales

查询销售、退款和损耗单据。

Query：

```ts
{
  id?: string
  month?: string // YYYY-MM，Nuxt 推荐
  yearMonth?: string // 当前实现兼容
  datePrefix?: string
  sinceDate?: string
  machineId?: string
  productId?: string
  type?: 'sale' | 'refund' | 'loss' | 'all'
  status?: 'active' | 'voided' | 'all'
  includeImages?: '1' | '0'
  limit?: number
  offset?: number
}
```

Payload：无。

Response `200`：

```ts
SalesOrder[] // 未传 id
SalesOrder | null // 传 id
```

兼容说明：当前实现中销售单 `type` 对旧 UI 可能返回 `daily`；Nuxt adapter 需要归一化为 `sale`。

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

### POST /api/inventory/sales

创建销售单并扣减库存。

Query：无。

Payload：

```ts
{
  id?: string
  machineId: string
  date: string
  note?: string
  imageAssetId?: string
  imageBase64?: string
  mimeType?: string
  items: Array<{
    productId: string
    quantity: number
    sellPrice?: number
    itemRevenue?: number
  }>
}
```

Response `200`：

```ts
SalesOrder & { type: 'sale' }
```

Side effects：

- 校验库存，库存不足必须拒绝。
- 插入 `sales_orders.type = 'sale'`。
- 插入 `sales_items`。
- 插入负数 `stock_movements.movement_type = 'sale'`。
- 更新 `inventory_balances` 缓存。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing sales items` |
| `400` | `No valid sales items` |
| `409` | `Insufficient stock for <product>: <requested> requested, <available> available` |
| `401` | `Unauthorized` |

### PUT /api/inventory/sales

更新销售单。若修改明细数量或商品，服务端必须作废原单并创建新单，不能直接改历史流水。

Query：

```ts
{
  id: string
}
```

Payload：

```ts
Partial<{
  date: string
  note: string
  items: SalesItem[]
}>
```

Response `200`：

```ts
SalesOrder
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing sales order id` |
| `404` | `Sales order not found` |
| `409` | `Insufficient stock for <product>: <requested> requested, <available> available` |
| `401` | `Unauthorized` |

### DELETE /api/inventory/sales

作废销售、退款或损耗单据。此接口语义是 void，不是硬删除；Nuxt UI 文案必须使用“作废”。

Query：

```ts
{
  id: string
}
```

Payload：无。

Response `204`：无 body。

Side effects：

- 设置 `sales_orders.voided_at`。
- 插入反向 `stock_movements.movement_type = 'void'`。
- 更新 `inventory_balances` 缓存。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid void target` |
| `404` | `Document not found` |
| `401` | `Unauthorized` |

Nuxt 禁止调用不带 `id` 的 `DELETE /api/inventory/sales`，因为当前实现会清空销售相关数据，仅能作为开发重置能力。

## 10. Refunds

退款是销售域的一种独立业务动作，不能用负销售数量表示。

### POST /api/inventory/refunds

创建退款单并回增库存。

Query：无。

Payload：

```ts
{
  id?: string
  machineId: string
  date: string
  note?: string
  imageAssetId?: string
  imageBase64?: string
  mimeType?: string
  originalSalesOrderId?: string
  items: Array<{
    productId: string
    quantity: number
    sellPrice?: number
    itemRevenue?: number
  }>
}
```

Response `200`：

```ts
SalesOrder & { type: 'refund' }
```

Side effects：

- 插入 `sales_orders.type = 'refund'`。
- 插入 `sales_items.quantity` 正数。
- 插入正数 `stock_movements.movement_type = 'refund'`。
- 更新 `inventory_balances` 缓存。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing sales items` |
| `400` | `No valid sales items` |
| `401` | `Unauthorized` |

退款查询使用：

```text
GET /api/inventory/sales?type=refund
```

退款作废使用：

```text
DELETE /api/inventory/sales?id=<refund order id>
```

## 11. Losses

损耗是销售域的一种独立业务动作，不能混入普通销售，也不能用负退款表示。

### POST /api/inventory/losses

登记损耗并扣减库存。

Query：无。

Payload：

```ts
{
  id?: string
  machineId: string
  date: string
  note?: string
  reason?: string
  imageAssetId?: string
  imageBase64?: string
  mimeType?: string
  items: Array<{
    productId: string
    quantity: number
  }>
}
```

Response `200`：

```ts
SalesOrder & { type: 'loss' }
```

Side effects：

- 校验库存，库存不足必须拒绝。
- 插入 `sales_orders.type = 'loss'`。
- 插入 `sales_items`，收入金额为 0。
- 插入负数 `stock_movements.movement_type = 'loss'`。
- 更新 `inventory_balances` 缓存。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing sales items` |
| `400` | `No valid sales items` |
| `409` | `Insufficient stock for <product>: <requested> requested, <available> available` |
| `401` | `Unauthorized` |

损耗查询使用：

```text
GET /api/inventory/sales?type=loss
```

损耗作废使用：

```text
DELETE /api/inventory/sales?id=<loss order id>
```

## 12. Inventory Void

### POST /api/inventory/void

统一作废入口。Nuxt 新 UI 推荐优先使用此入口，便于在确认弹窗中展示统一影响范围。

Query：无。

Payload：

```ts
{
  refType: 'purchase_order' | 'sales_order' | 'purchase' | 'sales'
  id: string
  reason?: string
}
```

Response `200`：

```ts
{
  id: string
  refType: 'purchase_order' | 'sales_order'
  voided: true
}
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid void target` |
| `404` | `Document not found` |
| `401` | `Unauthorized` |

## 13. Reports Dashboard

### GET /api/reports/dashboard

读取仪表盘聚合数据。仪表盘只读服务端聚合结果，前端不能重新计算全局利润、库存或成本。

Query：

```ts
{
  month: string // YYYY-MM
  days?: number // 趋势天数，默认 7
  machineId?: string
}
```

Payload：无。

Response `200`：

```ts
{
  month: string
  kpis: {
    todayRevenue: number
    monthRevenue: number
    monthCogs: number
    monthGrossProfit: number
    profitRate: number
    purchaseCost: number
    refunds: number
    lowStockCount: number
  }
  salesTrend: Array<{
    date: string
    revenue: number
    quantity: number
  }>
  machineRanking: Array<{
    machineId: string
    revenue: number
    profit: number
    quantity: number
  }>
  lowStock: InventoryBalance[]
  recentExceptions: Array<{
    id: string
    type: 'refund' | 'loss' | 'void' | 'low_stock'
    title: string
    occurredAt: string
    refType?: string
    refId?: string
  }>
}
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid dashboard query` |
| `401` | `Unauthorized` |

当前实现兼容来源：

| 目标数据 | 当前可用接口 |
| --- | --- |
| 月度销售、成本、利润、进货 | `POST /api/reports/monthly` |
| 库存余额 | `GET /api/reports/inventory` |

Nuxt 可以先在 adapter 层组合兼容接口，但页面组件应只依赖 `DashboardReport` 类型。

### POST /api/reports/monthly

当前兼容接口。后续 Nuxt 页面不应直接散落调用，应由 `useReports()` 封装。

Query：无。

Payload：

```ts
{
  feeRate?: number
  currentMonth?: string
  previousMonth?: string
  includeMonthly?: boolean
}
```

Response `200`：

```ts
{
  monthly: Array<{
    month: string
    revenue: number
    cogs: number
    fee: number
    profit: number
    profitRate: number
    purchaseCost: number
    refunds: number
    salesCount: number
    quantity: number
    count: number
  }>
  current: object | null
  previous: object | null
}
```

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

## 14. Settings

设置用于低频配置。敏感值不能在日志、错误、导出文件或 Markdown 中明文展示。

### GET /api/settings

读取设置列表或单项。

Query：

```ts
{
  id?: string
}
```

Payload：无。

Response `200`：

```ts
Array<{ key: string; value: unknown }> // 未传 id
{ key: string; value: unknown } | null // 传 id
```

敏感设置响应规则：

- `aiClientConfigs` 等包含 API key 的设置，Nuxt 页面只展示 provider 是否已配置和脱敏尾号。
- 后端如果暂时返回完整 value，Nuxt 也不能写入 console、toast 或导出文件。

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

### POST /api/settings

新增或覆盖设置。

Query：无。

Payload：

```ts
{
  key: string
  value: unknown
}
```

常用 key：

| key | value |
| --- | --- |
| `businessSettings` | 平台费率、低库存阈值、补货目标天数 |
| `machines` | 售货机列表 |
| `categories` | 商品分类列表 |
| `aiClientConfigs` | AI provider 客户端配置，包含敏感字段 |

Response `200`：

```ts
{
  key: string
  value: unknown
}
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing setting key` |
| `401` | `Unauthorized` |

### PUT /api/settings

同 `POST /api/settings`。

### DELETE /api/settings

删除设置。

Query：

```ts
{
  id: string
}
```

Payload：无。

Response `204`：无 body。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing setting key` |
| `401` | `Unauthorized` |

Nuxt 禁止调用不带 `id` 的 `DELETE /api/settings`，因为当前实现会清空全部设置，仅能作为开发重置能力。

## 15. Image Upload / R2 Assets

图片存储在 R2，D1 只保存 `image_assets` 元数据。前端不能直接写 R2，也不能把 base64 长期保存在业务状态或导出文件中。

### POST /api/images

目标上传接口。用于 Nuxt 新 UI 先创建图片资产，再把 `imageAssetId` 传给进货、销售、退款或损耗接口。

Query：无。

Payload：

```ts
{
  sourceStore: 'purchases' | 'sales' | 'products'
  sourceRecordId?: string
  fileName?: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  imageBase64: string
}
```

Response `200`：

```ts
ImageAsset & {
  imageUrl?: string
}
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing image payload` |
| `400` | `Unsupported image type` |
| `400` | `Image too large` |
| `401` | `Unauthorized` |
| `500` | `R2 binding IMAGES is not configured` |

当前兼容路径：

- `POST /api/inventory/purchases` 支持 `imageBase64` 和 `mimeType`，服务端写入 R2 与 `image_assets`。
- `POST /api/inventory/sales`、`POST /api/inventory/refunds`、`POST /api/inventory/losses` 支持 `imageBase64` 和 `mimeType`。

Nuxt 新 UI 可以先使用兼容路径，但组件接口应抽象为 `ImageAsset`，避免页面依赖 base64。

### GET /api/images

读取业务单据图片。

Query：

```ts
{
  store: 'purchases' | 'sales'
  id: string
}
```

Payload：无。

Response `200`：

```ts
{
  store: 'purchases' | 'sales'
  record_id: string
  imageBase64: string
  mimeType: string
} | null
```

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Missing image target` |
| `400` | `Unsupported image store` |
| `401` | `Unauthorized` |

## 16. AI Proxy

AI 识别属于辅助录入，不是入账接口。AI 返回结果必须进入人工确认表，再调用正式业务 API。

### GET /api/ai-proxy

读取服务端 provider 配置状态。

Query：无。

Payload：无。

Response `200`：

```ts
{
  configured: {
    opencode: boolean
    qwen: boolean
    deepseek: boolean
    claude: boolean
    yunwu: boolean
  }
}
```

Error：

| 状态码 | message |
| --- | --- |
| `401` | `Unauthorized` |

### POST /api/ai-proxy

调用 AI 识别或文本任务。

Query：

```ts
{
  stream?: '1'
}
```

Payload：

```ts
{
  modelId: string
  systemPrompt?: string
  userPrompt?: string
  imageBase64?: string
  mimeType?: string
  maxTokens?: number
  jsonSchema?: unknown
  stream?: boolean
  clientConfig?: {
    apiKey: string
    baseUrl?: string
  }
}
```

Response `200`：

```ts
{
  text: string
}
```

Stream response：`text/event-stream`，事件为 `open`、`delta`、`done`、`error`。

Error：

| 状态码 | message |
| --- | --- |
| `400` | `Invalid JSON body` |
| `400` | `Missing modelId` |
| `401` | `Unauthorized` |
| `502` | `<provider> upstream error` |
| `503` | `<provider> API key is not configured on the server` |

## 17. Nuxt Composable 边界

Nuxt 页面只能通过 composable 消费 API：

```text
useAuth()
useProducts()
useInventory()
usePurchases()
useSales()
useReports()
useSettings()
useImages()
useAiProxy()
```

禁止：

- 页面组件直接 `fetch('/api/...')`。
- Pinia store 持久保存全量商品、进货、销售。
- 前端重新计算库存余额、全局平均成本或仪表盘利润。
- AI 识别结果跳过人工确认直接入账。
- 使用“删除”文案处理会影响库存的历史单据；统一使用“作废”。

