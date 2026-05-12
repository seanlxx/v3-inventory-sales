# V3 重构计划

> 目标：以当前 v2 项目为业务基础，启动一个全新的 v3 项目。
> v3 将使用新的 GitHub 仓库、新的 Cloudflare Pages 项目、新的 D1 数据库和新的 R2 存储桶。

## 1. 总体方向

v3 不再继续扩大 v2 的通用 JSON 记录模型，而是重构为“结构化业务表 + 库存流水账本 + 当前库存缓存”的架构。

短期先保持 Cloudflare Pages Functions 形态，完成后端库存重构；中长期再迁移到 Nuxt 4。这样可以先解决库存一致性，再换前端框架。

```
GitHub v3 仓库
  |
Cloudflare Pages v3 项目
  |
静态前端 / 未来 Nuxt 4
  |
Cloudflare Pages Functions / 未来 Nuxt server/api
  |
D1 v3 数据库 + R2 v3 图片桶
```

## 2. 核心原则

1. 不再由浏览器直接连续修改商品库存、进货记录、销售记录。
2. 所有库存变化都必须进入 Cloudflare Function 服务端 API。
3. 库存以 `stock_movements` 为唯一账本。
4. `inventory_balances` 只作为当前库存缓存，可随时从流水重算。
5. 撤销不硬删流水，采用反向流水 + 单据作废。
6. 商品删除改为停用/归档，不影响历史报表。
7. R2 只存图片文件，D1 只存 R2 key 和元数据。
8. 新 D1、新 R2、新 Pages、新 GitHub 仓库全部独立于 v2。

## 3. 新资源规划

建议命名：

| 资源 | 建议名称 |
| --- | --- |
| GitHub 仓库 | `v3-inventory-sales` |
| Cloudflare Pages 项目 | `v3-inventory-sales` |
| D1 数据库 | `v3-vending-inventory-sales-db` |
| R2 存储桶 | `v3-vending-inventory-sales-images` |
| D1 绑定 | `DB` |
| R2 绑定 | `IMAGES` |

### 3.1 GitHub 复制仓库方案

v3 可以先从现有 GitHub 仓库复制一份新仓库，而不是在本地从零初始化。

推荐流程：

1. 在 GitHub 上创建新仓库 `v3-inventory-sales`。
2. 将当前 v2 仓库内容复制到 v3 仓库，保留现有目录结构、脚本、Pages Functions 和前端代码。
3. 本地 clone 新的 v3 仓库。
4. 在 v3 仓库里修改 `wrangler.jsonc`，绑定新的 v3 D1 和 v3 R2。
5. 后续数据库操作、migration、构建、提交、推送方式保持和 v2 一样，只是目标资源换成 v3。

关键边界：

- GitHub 仓库可以复制。
- 代码结构可以先保持一样。
- 数据库操作流程可以保持一样。
- D1 数据库不能复用 v2 生产库。
- R2 图片桶不能复用 v2 生产桶。
- Cloudflare Pages 项目不能直接覆盖 v2 项目。

也就是说，v3 是“同一套工程操作方式 + 新的一套 Cloudflare 资源”。

## 4. 目标数据模型

### 4.1 商品表

`products`

| 字段 | 说明 |
| --- | --- |
| `id` | 商品 ID |
| `name` | 商品名 |
| `machine_id` | 售货机 |
| `category` | 分类 |
| `sell_price` | 当前零售价 |
| `status` | `active` / `archived` |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

商品表不再直接作为库存账本，只保存商品主数据。

### 4.2 进货单

`purchase_orders`

| 字段 | 说明 |
| --- | --- |
| `id` | 进货单 ID |
| `machine_id` | 售货机（冗余保存，避免通过商品间接查询） |
| `record_date` | 进货日期 |
| `source` | 来源 |
| `note` | 备注 |
| `image_asset_id` | 图片引用 |
| `voided_at` | 作废时间 |
| `created_at` | 创建时间 |

`purchase_items`

| 字段 | 说明 |
| --- | --- |
| `id` | 明细 ID |
| `purchase_id` | 进货单 ID |
| `product_id` | 商品 ID |
| `quantity` | 数量 |
| `unit_cost` | 单件成本 |
| `total_cost` | 总成本 |

### 4.3 销售/退款/损耗单

`sales_orders`

| 字段 | 说明 |
| --- | --- |
| `id` | 单据 ID |
| `type` | `sale` / `refund` / `loss` |
| `machine_id` | 售货机 |
| `record_date` | 日期 |
| `year_month` | 月份 |
| `total_amount` | 销售额或退款额 |
| `total_cogs` | 成本 |
| `note` | 备注 |
| `image_asset_id` | 图片引用 |
| `voided_at` | 作废时间 |
| `created_at` | 创建时间 |

`sales_items`

| 字段 | 说明 |
| --- | --- |
| `id` | 明细 ID |
| `sales_order_id` | 单据 ID |
| `product_id` | 商品 ID |
| `quantity` | 数量，正数表示业务数量 |
| `unit_price` | 销售价 |
| `unit_cost` | 当时成本 |
| `line_amount` | 行金额 |
| `line_cogs` | 行成本 |

### 4.4 库存流水

`stock_movements`

| 字段 | 说明 |
| --- | --- |
| `id` | 流水 ID |
| `product_id` | 商品 ID |
| `machine_id` | 售货机 |
| `movement_type` | `purchase` / `sale` / `refund` / `loss` / `adjustment` / `void` |
| `qty_delta` | 库存变化，进货/退款为正，销售/损耗为负 |
| `unit_cost` | 成本 |
| `ref_type` | 来源单据类型 |
| `ref_id` | 来源单据 ID |
| `voids_movement_id` | 作废时反向关联原流水 |
| `created_at` | 创建时间 |

这是库存的唯一可信账本。

### 4.5 当前库存缓存

`inventory_balances`

| 字段 | 说明 |
| --- | --- |
| `product_id` | 商品 ID |
| `machine_id` | 售货机 |
| `quantity_on_hand` | 当前库存 |
| `avg_cost` | 当前平均成本 |
| `total_purchase_qty` | 累计有效进货数量 |
| `total_purchase_cost` | 累计有效进货成本 |
| `updated_at` | 更新时间 |

### 4.6 图片元数据

`image_assets`

| 字段 | 说明 |
| --- | --- |
| `id` | 图片 ID |
| `r2_key` | R2 key |
| `mime_type` | MIME 类型 |
| `size_bytes` | 文件大小 |
| `created_at` | 创建时间 |

## 5. 服务端 API 规划

短期继续用 Cloudflare Pages Functions：

```
functions/api/
├── inventory/
│   ├── purchases.js
│   ├── sales.js
│   ├── refunds.js
│   ├── losses.js
│   ├── adjustments.js
│   └── void.js
├── reports/
│   ├── monthly.js
│   └── inventory.js
└── _shared/
    ├── auth.js
    ├── d1.js
    ├── inventory-service.js
    ├── image-service.js
    └── validators.js
```

未来 Nuxt 4 迁移后对应到：

```
server/
├── api/
├── services/
├── database/
└── storage/
```

## 6. 写入事务模式

每个库存写入 API 都必须一次完成：

```
校验登录
  |
校验请求数据
  |
读取商品和库存
  |
构造单据、明细、库存流水、库存缓存更新
  |
DB.batch([...])
  |
返回最新单据和库存
```

示例：创建销售单

1. `INSERT sales_orders`
2. `INSERT sales_items`
3. `INSERT stock_movements`，`qty_delta = -quantity`
4. `UPDATE inventory_balances`
5. 返回销售单和最新库存

## 7. D1 Sessions 使用策略

如果 v3 开启 D1 read replication，前端需要保存服务端返回的 bookmark。

```
请求头：x-d1-bookmark: <last bookmark>
响应头：x-d1-bookmark: <new bookmark>
```

用途：

- 用户刚录入销售后刷新页面，能读到自己的最新写入。
- Sessions 解决读写可见性。
- `DB.batch()` 解决写入事务。

## 8. 索引规划

```sql
CREATE INDEX idx_products_machine_status
ON products(machine_id, status);

CREATE INDEX idx_purchase_orders_date
ON purchase_orders(record_date DESC);

CREATE INDEX idx_purchase_items_product
ON purchase_items(product_id, purchase_id);

CREATE INDEX idx_sales_orders_month_machine
ON sales_orders(year_month, machine_id, record_date DESC);

CREATE INDEX idx_sales_items_product
ON sales_items(product_id, sales_order_id);

CREATE INDEX idx_stock_movements_product_time
ON stock_movements(product_id, created_at DESC);

CREATE INDEX idx_stock_movements_ref
ON stock_movements(ref_type, ref_id);

CREATE INDEX idx_inventory_balances_machine_stock
ON inventory_balances(machine_id, quantity_on_hand);
```

## 9. 迁移步骤

| 阶段 | 目标 | 说明 |
| --- | --- | --- |
| 1 | 复制 v3 仓库 | 从现有 GitHub 仓库复制一份到新的 `v3-inventory-sales` 仓库 |
| 2 | 创建 Cloudflare v3 资源 | 新 Pages、新 D1、新 R2 |
| 3 | 更新配置 | 修改 `wrangler.jsonc` 绑定到 v3 D1/R2 |
| 4 | 新建 migration | 添加结构化业务表 |
| 5 | 写库存服务层 | 实现进货、销售、退款、损耗、调整、撤销 |
| 6 | 写迁移脚本 | 从 v2 JSON records 回放生成 v3 流水 |
| 7 | 对账 | 对比旧 `currentStock` 和新流水库存 |
| 8 | 兼容旧 UI | 旧页面调用新 API |
| 9 | 并行上线验证 | v2 和 v3 同时保留，v3 用新资源 |
| 10 | Nuxt 4 迁移 | 稳定后逐页重写前端 |

## 10. 对账规则

迁移完成后必须输出：

| 检查项 | 说明 |
| --- | --- |
| 商品数量 | v2 商品数 vs v3 商品数 |
| 进货金额 | v2 有效进货金额 vs v3 进货单金额 |
| 销售金额 | v2 销售金额 vs v3 销售单金额 |
| 成本 | v2 COGS vs v3 COGS |
| 当前库存 | v2 `products.currentStock` vs v3 `inventory_balances.quantity_on_hand` |
| 图片数量 | v2 图片记录 vs v3 `image_assets` |

库存差异不应静默修正，必须生成差异报告，再决定是否用盘点调整单修正。

## 11. 测试计划

必须覆盖：

1. 新商品进货自动创建库存流水。
2. 已有商品进货增加库存。
3. 销售扣库存。
4. 库存不足时拒绝销售。
5. 退款回库存。
6. 损耗扣库存。
7. 修改销售单正确回退旧流水并应用新流水。
8. 撤销进货生成反向流水。
9. 撤销销售生成反向流水。
10. 商品归档后历史报表不变。
11. R2 图片删除不影响共享引用。
12. 从流水重算库存等于 `inventory_balances`。

## 12. Nuxt 4 迁移原则

Nuxt 4 迁移放在后端稳定之后。

迁移时不要重新设计库存逻辑，只迁移 UI 和路由：

```
pages/dashboard.vue
pages/products.vue
pages/purchases.vue
pages/sales.vue
pages/ai.vue
pages/settings.vue
```

数据访问统一走 composables：

```
composables/useProducts.ts
composables/usePurchases.ts
composables/useSales.ts
composables/useInventory.ts
```

服务端逻辑继续保持在：

```
server/services/
server/database/
server/storage/
```

## 13. 不做的事

1. 不引入自建服务器。
2. 不把 API key 写入源码。
3. 不让浏览器直接维护库存。
4. 不硬删历史单据。
5. 不直接修改构建产物。
6. 不把 v2 的 D1/R2 资源复用到 v3。

## 14. 数据库重构前置决策

真正开始写 migration 前，先固定以下决策，避免迁移脚本、API 和前端口径反复摇摆。

### 14.1 ID 策略

| 表 | ID 类型 | 说明 |
| --- | --- | --- |
| `products` | `TEXT PRIMARY KEY` | 优先沿用 v2 `record_id`，便于迁移和对账 |
| `purchase_orders` | `TEXT PRIMARY KEY` | 优先沿用 v2 进货 `record_id` |
| `purchase_items` | `TEXT PRIMARY KEY` | 迁移时生成稳定 ID：`purchase_id:index` |
| `sales_orders` | `TEXT PRIMARY KEY` | 优先沿用 v2 销售 `record_id` |
| `sales_items` | `TEXT PRIMARY KEY` | 迁移时生成稳定 ID：`sales_order_id:index` |
| `stock_movements` | `TEXT PRIMARY KEY` | 迁移时生成稳定 ID：`ref_type:ref_id:product_id:index` |
| `inventory_balances` | 复合主键 | `PRIMARY KEY(product_id, machine_id)` |
| `image_assets` | `TEXT PRIMARY KEY` | 新图生成 UUID；旧图迁移时用 `store:record_id` |

后续 API 新建记录时也使用服务端生成 ID，不接受浏览器传入的最终主键。

### 14.2 金额类型

D1 中金额统一用整数分保存，字段命名用 `_cents`：

| 业务含义 | 字段 |
| --- | --- |
| 售价 | `sell_price_cents`, `unit_price_cents` |
| 成本 | `unit_cost_cents`, `total_cost_cents`, `line_cogs_cents` |
| 销售额 | `total_amount_cents`, `line_amount_cents` |
| 当前库存成本 | `avg_cost_cents`, `inventory_value_cents` |

前端显示人民币时再除以 100。迁移脚本从 v2 JSON 读取小数金额后执行 `Math.round(value * 100)`。

### 14.3 数量类型

库存数量先按整数件处理：

- `quantity`、`qty_delta`、`quantity_on_hand` 使用 `INTEGER`。
- 退货、进货、调整入库为正数。
- 销售、损耗、调整出库为负数。
- 如果未来需要半件或称重商品，再单独引入 `quantity_scale`，不要现在预埋复杂度。

### 14.4 时间字段

所有写入时间统一使用 UTC ISO 字符串：

```sql
strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
```

业务日期继续保留用户输入的 `YYYY-MM-DD`：

| 字段 | 含义 |
| --- | --- |
| `record_date` | 用户选择的进货/销售/损耗日期 |
| `year_month` | 报表月份，格式 `YYYY-MM` |
| `created_at` | 系统创建时间 |
| `updated_at` | 系统更新时间 |
| `voided_at` | 作废时间 |

## 15. v3 migration 草案

第一版结构化 migration 建议新建：

```text
migrations/0006_v3_structured_inventory_schema.sql
```

草案如下，实际写入前再根据 API 实现做一次逐字段确认。

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  sell_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (sell_price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS image_assets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER,
  source_store TEXT,
  source_record_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  machine_id TEXT,
  record_date TEXT NOT NULL,
  source TEXT,
  note TEXT,
  image_asset_id TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (image_asset_id) REFERENCES image_assets(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  total_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (purchase_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('sale', 'refund', 'loss')),
  machine_id TEXT NOT NULL,
  record_date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_cogs_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  image_asset_id TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (image_asset_id) REFERENCES image_assets(id)
);

CREATE TABLE IF NOT EXISTS sales_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  line_amount_cents INTEGER NOT NULL DEFAULT 0,
  line_cogs_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('purchase', 'sale', 'refund', 'loss', 'adjustment', 'void')
  ),
  qty_delta INTEGER NOT NULL CHECK (qty_delta != 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  ref_item_id TEXT,
  voids_movement_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (voids_movement_id) REFERENCES stock_movements(id)
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  product_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  avg_cost_cents INTEGER NOT NULL DEFAULT 0,
  inventory_value_cents INTEGER NOT NULL DEFAULT 0,
  total_purchase_qty INTEGER NOT NULL DEFAULT 0,
  total_purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (product_id, machine_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

配套索引：

```sql
CREATE INDEX IF NOT EXISTS idx_products_machine_status
  ON products(machine_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_date
  ON purchase_orders(record_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_items_product
  ON purchase_items(product_id, purchase_id);

CREATE INDEX IF NOT EXISTS idx_sales_orders_month_machine
  ON sales_orders(year_month, machine_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_items_product
  ON sales_items(product_id, sales_order_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_time
  ON stock_movements(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ref
  ON stock_movements(ref_type, ref_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_voids
  ON stock_movements(voids_movement_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_machine_stock
  ON inventory_balances(machine_id, quantity_on_hand);

CREATE INDEX IF NOT EXISTS idx_image_assets_source
  ON image_assets(source_store, source_record_id);
```

## 16. v2 到 v3 数据映射

当前 v2 核心表为：

- `vending_records(store, record_id, data, machine_id, product_id, record_date, year_month, name, category, has_image, created_at, updated_at)`
- `vending_record_images(store, record_id, image_base64, mime_type, r2_key, created_at, updated_at)`
- `vending_record_image_chunks(store, record_id, chunk_index, chunk_base64)`

### 16.1 商品映射

| v2 来源 | v3 目标 | 规则 |
| --- | --- | --- |
| `vending_records.store = 'products'` | `products` | 每条商品记录生成一行 |
| `record_id` | `products.id` | 原样保留 |
| `machine_id` | `products.machine_id` | 优先用索引列，缺失时从 JSON 补 |
| `name` / `data.name` | `products.name` | 索引列优先 |
| `category` / `data.category` | `products.category` | 索引列优先 |
| `data.price` / `data.sellPrice` | `products.sell_price_cents` | 统一转整数分 |
| 删除状态 | `products.status` | v2 无硬删除记录时默认 `active` |

`products.currentStock` 只作为迁移后对账基准，不直接写入账本。

### 16.2 进货映射

> **⚠️ v2 进货成本字段是 `unitPrice` / `totalPrice`，不是 `unitCost` / `totalCost`。**

| v2 来源 | v3 目标 | 规则 |
| --- | --- | --- |
| `vending_records.store = 'purchases'` | `purchase_orders` | 每条进货记录生成一张进货单 |
| `record_id` | `purchase_orders.id` | 原样保留 |
| `record_date` | `purchase_orders.record_date` | 索引列优先 |
| `data.machineId` / `machine_id` | `purchase_orders.machine_id` | 索引列优先，缺失时从关联商品补 |
| `data.source` | `purchase_orders.source` | 缺失为空 |
| `data.note` | `purchase_orders.note` | 缺失为空 |
| `product_id` / `data.productId` | `purchase_items.product_id` | 单商品旧记录生成一条明细 |
| `data.quantity` | `purchase_items.quantity` | 必须大于 0 |
| `data.unitPrice` | `purchase_items.unit_cost_cents` | 转整数分 |
| `data.totalPrice` | `purchase_items.total_cost_cents` | 缺失时 `quantity * unit_cost_cents` |

每条有效进货明细生成一条 `stock_movements`：

| 字段 | 值 |
| --- | --- |
| `movement_type` | `purchase` |
| `qty_delta` | `+quantity` |
| `ref_type` | `purchase_order` |
| `ref_id` | `purchase_orders.id` |
| `ref_item_id` | `purchase_items.id` |

### 16.3 销售映射

v2 销售 type 映射规则：

| v2 `data.type` | v3 `sales_orders.type` | 说明 |
| --- | --- | --- |
| `'daily'` 或缺失（`undefined` / `null`） | `sale` | v2 早期记录可能没有 type 字段 |
| `'refund'` | `refund` | 退款 |
| `'loss'` | `loss` | 损耗 |

| v2 来源 | v3 目标 | 规则 |
| --- | --- | --- |
| `vending_records.store = 'sales'` | `sales_orders` | 每条销售记录生成一张销售单 |
| `record_id` | `sales_orders.id` | 原样保留 |
| `data.type` | `sales_orders.type` | 按上表映射，缺失默认 `sale` |
| `machine_id` | `sales_orders.machine_id` | 索引列优先 |
| `record_date` | `sales_orders.record_date` | 索引列优先 |
| `year_month` | `sales_orders.year_month` | 索引列优先，缺失时从日期截取 |
| `data.totalAmount` | `sales_orders.total_amount_cents` | 转整数分 |
| `data.totalCogs` | `sales_orders.total_cogs_cents` | 缺失时从明细合计 |
| `data.items[]` | `sales_items` | 每个商品一条明细 |

销售明细数量规则：

- v3 `sales_items.quantity` 统一使用**正数**表示业务数量。
- v2 退款记录中 `item.quantity` 可能是负数，迁移时必须使用 `Math.abs(item.quantity)`。
- 方向通过 `sales_orders.type` 和 `stock_movements.qty_delta` 区分。

每条有效销售明细生成一条 `stock_movements`：

| 字段 | 值 |
| --- | --- |
| `movement_type` | 与 `sales_orders.type` 一致（`sale` / `refund` / `loss`） |
| `qty_delta` | `sale`/`loss` 为 `-quantity`；`refund` 为 `+quantity` |
| `ref_type` | `sales_order` |
| `ref_id` | `sales_orders.id` |
| `ref_item_id` | `sales_items.id` |

### 16.4 图片映射

| v2 来源 | v3 目标 | 规则 |
| --- | --- | --- |
| `vending_record_images.r2_key` | `image_assets.r2_key` | 有 R2 key 时直接引用 |
| `image_base64` / `vending_record_image_chunks` | R2 对象 + `image_assets` | 无 R2 key 时先上传到 v3 R2 |
| `store + record_id` | `image_assets.source_store/source_record_id` | 用于追踪来源 |

迁移图片时不把 base64 写入新 D1。新 D1 只保留 `r2_key`、`mime_type`、`size_bytes` 和来源元数据。

## 17. 迁移脚本设计

建议新建只读导出、转换、导入三段脚本，避免一个脚本同时做太多事。

```text
scripts/
├── export-v2-d1.mjs
├── transform-v2-to-v3.mjs
├── import-v3-d1.mjs
└── verify-v3-migration.mjs
```

### 17.1 `export-v2-d1.mjs`

职责：

1. 从 v2 D1 导出 `vending_records` 的四类 store。
2. 导出图片元数据，不导出或打印 base64 内容。
3. 输出本地 JSON 文件到被 `.gitignore` 排除的目录。

输出建议：

```text
.migration/
├── v2-products.json
├── v2-purchases.json
├── v2-sales.json
├── v2-settings.json
└── v2-images-manifest.json
```

### 17.2 `transform-v2-to-v3.mjs`

职责：

1. 解析 v2 JSON。
2. 生成 v3 结构化行。
3. 将所有进货和销售按 `record_date` + `created_at` 排序，进货优先于同日销售。
4. 按排序后顺序逐条生成库存流水，同步维护加权平均成本。
5. 按流水重算 `inventory_balances`。
6. 生成对账输入文件。

输出建议：

```text
.migration/
├── v3-products.json
├── v3-purchase-orders.json
├── v3-purchase-items.json
├── v3-sales-orders.json
├── v3-sales-items.json
├── v3-stock-movements.json
├── v3-inventory-balances.json
├── v3-image-assets.json
└── v3-reconciliation-input.json
```

### 17.3 `import-v3-d1.mjs`

职责：

1. 检查目标 D1 是 v3 数据库，拒绝导入 v2 数据库名。
2. 按外键顺序导入结构化表。
3. 每批导入后输出数量，不输出敏感数据。
4. 支持 `--dry-run`，默认只检查不写入。

导入顺序：

```text
products
image_assets
purchase_orders
purchase_items
sales_orders
sales_items
stock_movements
inventory_balances
```

### 17.4 `verify-v3-migration.mjs`

职责：

1. 比较 v2 与 v3 商品数。
2. 比较进货数量、进货金额。
3. 比较销售数量、销售金额。
4. 比较流水重算库存与 `inventory_balances`。
5. 比较 v2 `currentStock` 与 v3 当前库存。
6. 输出差异报告，不自动修正。

输出建议：

```text
.migration/
└── v3-reconciliation-report.md
```

## 18. 库存服务写入规则

所有会改变库存的 API 都走同一个服务层函数，不在各路由里手写库存更新。

### 18.1 创建进货单

写入顺序：

1. 插入 `purchase_orders`。
2. 插入 `purchase_items`。
3. 为每条明细插入 `stock_movements(qty_delta > 0)`。
4. 更新或插入 `inventory_balances`。
5. 返回进货单、明细和最新库存。

平均成本更新规则：

```text
new_qty = old_qty + purchase_qty
new_value = old_inventory_value_cents + purchase_total_cost_cents
avg_cost_cents = new_qty > 0 ? round(new_value / new_qty) : 0
inventory_value_cents = new_value   // 独立维护，不从 avg_cost_cents 反算
```

注意事项：

- `inventory_value_cents` 始终独立累加维护，不等于 `avg_cost_cents * quantity_on_hand`（因为 round 精度损失）。
- `avg_cost_cents` 仅用于展示和销售成本快照。
- 库存清零后再次进货时，`avg_cost_cents` 直接等于新进货的 `unit_cost_cents`，`inventory_value_cents` 从新进货金额重新开始。

### 18.2 创建销售单

写入顺序：

1. 读取每个商品的 `inventory_balances`。
2. 校验库存是否足够。
3. 用当前 `avg_cost_cents` 固化销售成本。
4. 插入 `sales_orders(type = 'sale')`。
5. 插入 `sales_items`。
6. 插入 `stock_movements(qty_delta < 0)`。
7. 扣减 `inventory_balances.quantity_on_hand` 和 `inventory_value_cents`。
8. 返回销售单、明细和最新库存。

销售成本不回头改。后续进货成本变化不影响历史销售利润。

### 18.3 创建退款单

退款必须引用原销售单或手工选择商品：

- 有原销售单时，优先使用原销售明细的 `unit_price_cents` 和 `unit_cost_cents`。
- 无原销售单时，使用当前商品售价和当前平均成本。
- `stock_movements.qty_delta` 为正数。

### 18.4 创建损耗单

损耗只影响库存和成本，不产生销售额：

- `sales_orders.type = 'loss'`
- `total_amount_cents = 0`
- `total_cogs_cents` 按当前平均成本计算
- `stock_movements.qty_delta` 为负数

### 18.5 作废单据

作废不删除原单据和原流水：

1. 设置原单据 `voided_at`。
2. 查询原单据关联的 `stock_movements`。
3. 为每条原流水插入一条 `movement_type = 'void'` 的反向流水。
4. 更新 `inventory_balances`。
5. 新反向流水的 `voids_movement_id` 指向原流水。

同一单据只能作废一次。

### 18.6 修改单据

v3 不支持直接修改已生效的单据字段（如明细数量、金额）。修改流程为「作废 + 重建」：

1. 作废原单据（按 §18.5 流程生成反向流水）。
2. 创建新单据（按 §18.1/§18.2 等对应流程生成正向流水）。
3. 新单据可选记录 `replaces_order_id` 关联原单据，便于审计追踪。

仅允许直接修改的字段：`note`、`record_date`（不影响库存的元数据）。

## 19. 对账 SQL 草案

这些 SQL 用于迁移后快速检查 v3 数据自洽性。

### 19.1 流水重算库存

```sql
SELECT
  product_id,
  machine_id,
  SUM(qty_delta) AS recalculated_qty
FROM stock_movements
GROUP BY product_id, machine_id;
```

### 19.2 库存缓存差异

```sql
WITH movement_totals AS (
  SELECT
    product_id,
    machine_id,
    SUM(qty_delta) AS recalculated_qty
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

### 19.3 进货金额对账

```sql
SELECT
  SUM(total_cost_cents) AS purchase_items_total_cents
FROM purchase_items;
```

### 19.4 销售金额与成本对账

```sql
SELECT
  type,
  SUM(total_amount_cents) AS total_amount_cents,
  SUM(total_cogs_cents) AS total_cogs_cents
FROM sales_orders
WHERE voided_at IS NULL
GROUP BY type;
```

### 19.5 孤儿明细检查

```sql
SELECT i.id
FROM purchase_items i
LEFT JOIN purchase_orders o ON o.id = i.purchase_id
WHERE o.id IS NULL;

SELECT i.id
FROM sales_items i
LEFT JOIN sales_orders o ON o.id = i.sales_order_id
WHERE o.id IS NULL;
```

### 19.6 孤儿流水检查

```sql
SELECT m.id, m.product_id
FROM stock_movements m
LEFT JOIN products p ON p.id = m.product_id
WHERE p.id IS NULL;
```

### 19.7 库存价值一致性

`inventory_value_cents` 通过进货累加、销售扣减独立维护，不等于 `avg_cost_cents * quantity_on_hand`（存在 round 精度差）。对账时检查偏差是否在合理范围内：

```sql
SELECT
  product_id,
  machine_id,
  inventory_value_cents,
  avg_cost_cents * quantity_on_hand AS computed_value,
  inventory_value_cents - (avg_cost_cents * quantity_on_hand) AS rounding_diff
FROM inventory_balances
WHERE ABS(inventory_value_cents - (avg_cost_cents * quantity_on_hand)) > quantity_on_hand;
```

偏差超过 `quantity_on_hand` 分（即每件超过 1 分钱）时需要人工检查。

## 20. 实施顺序

数据库重构建议按以下顺序推进，每一步都能单独验证。

| 阶段 | 产物 | 验证 |
| --- | --- | --- |
| 1 | GitHub 复制出 v3 仓库 | 新仓库地址、默认分支确认无误 |
| 2 | clone v3 仓库到本地 | `git remote -v` 指向 v3 仓库 |
| 3 | 固定 v3 D1/R2/Pages 命名 | `wrangler.jsonc` 指向新资源 |
| 4 | 新增结构化 migration | `wrangler d1 migrations apply ... --local` 通过 |
| 5 | 实现迁移转换脚本 | 能从 v2 导出生成 v3 JSON，不写库 |
| 6 | 实现导入脚本 | `--dry-run` 输出表数量和外键检查 |
| 7 | 本地导入 v3 D1 | 表数量符合预期 |
| 8 | 对账报告 | 生成 `v3-reconciliation-report.md` |
| 9 | 实现库存服务层 | 单元脚本覆盖进货、销售、退款、损耗、作废 |
| 10 | 前端 API 适配 | 旧 UI 通过新 API 完成核心流程 |
| 11 | 远程 v3 试导入 | 不影响 v2 生产数据 |
| 12 | 上线 v3 Pages | 保留 v2，验证一段时间后再切换使用 |

## 21. 回滚边界

v3 使用新 GitHub、新 Pages、新 D1、新 R2，因此回滚以资源隔离为主：

1. v2 数据库和图片桶不被 v3 migration 修改。
2. v3 导入失败时直接清空或重建 v3 D1。
3. v3 R2 导入失败时删除带 v3 前缀的对象。
4. v3 Pages 出问题时停用 v3 项目，不影响 v2。
5. 不做从 v3 回写 v2 的自动同步。

上线前必须保留最近一次 v2 数据导出和 v3 对账报告，但这些文件只能放在本地被忽略目录，不能提交到 Git。

## 22. 开工前检查清单

开始写数据库重构代码前，逐项确认：

- [ ] 已从现有 GitHub 仓库复制出 v3 GitHub 仓库。
- [ ] 本地工作目录的 `git remote -v` 指向 v3 GitHub 仓库，不是 v2 仓库。
- [ ] 已创建 v3 Cloudflare Pages 项目。
- [ ] 已创建 v3 D1 数据库。
- [ ] 已创建 v3 R2 存储桶。
- [ ] `wrangler.jsonc` 已切到 v3 资源。
- [ ] `.gitignore` 已包含 `.migration/`。
- [ ] migration 文件名从当前最新编号继续递增（当前最新为 0005）。
- [ ] 认证表 migration 策略已确定（保留 0001–0004 作为兼容表，或在 v3 migration 中重新创建）。
- [ ] 已确认 v2 进货成本字段是 `unitPrice` / `totalPrice`（不是 `unitCost` / `totalCost`）。
- [ ] v2 销售记录中 `type = null/undefined` 的 fallback 规则已确定（默认映射为 `sale`）。
- [ ] 金额字段统一使用整数分。
- [ ] 库存字段统一使用整数件。
- [ ] 服务端 API 是唯一库存写入口。
- [ ] 迁移脚本默认 `--dry-run`。
- [ ] 对账报告只输出统计和差异，不输出图片 base64、token、API key。
- [ ] v2 生产数据不会被任何 v3 脚本写入。

## 23. 验收标准

v3 可以替代 v2 的最低标准：

1. 所有 6 个页面可正常加载和操作。
2. 录入进货后库存增加，报表金额正确。
3. 录入销售后库存减少，利润计算正确。
4. 库存不足时拒绝销售。
5. 退款回库存，损耗扣库存。
6. 作废单据生成反向流水，库存正确回退。
7. AI 识别功能通过新 API 正常工作。
8. 迁移对账差异为 0 或已用调整单处理。
9. 移动端 375/390/430px 无溢出。
10. 从 `stock_movements` 重算库存等于 `inventory_balances.quantity_on_hand`。
