# 方案 D：并行重建利润系统

> 目标：新利润系统并行建立，旧库存系统停止扩展。等数据迁移、利润校验和页面/API 切换都确认后，再归档旧库存代码和旧表。

## 当前状态（2026-07-05）

本轮已完成可自动收尾的检查和记录：

- 新利润系统表、迁移脚本、校验脚本已存在并通过回归测试。
- 商品、进货、销售、仪表盘页面已切到 `/api/profit/*`。
- 旧库存主页面已改为归档入口，旧库存 API 由归档拦截统一返回 410。
- 活跃前端页面和利润 API 未发现继续读取 `inventory_balances` / `stock_movements` / `inventory-service`。
- 生产 D1 的 `2026-06` 新旧利润校验已生成：[利润系统Phase1校验-2026-06.md](./利润系统Phase1校验-2026-06.md)。

生产校验结论：

| 检查 | 结果 |
| --- | --- |
| `2026-06` 销售金额差异 | `0.00` |
| `2026-06` 成本差异 | `0.00` |
| `2026-06` 毛利差异 | `0.00` |
| 迁移数量差异 | `0` |
| `2026-07` 当前月成本缺口 | `0` |
| `2026-06` 历史成本缺口 | `8` 个商品 |

仍需人工确认的阻断项：

| 商品 | 全局商品 ID | 6 月销售数量 | 6 月销售金额 |
| --- | --- | ---: | ---: |
| 泰奇食品八宝粥430g | `pg:2faf613c-76d1-4ca7-9584-695f43a05023` | 12 | 84.00 |
| 意旺福海苔肉松吐司面包100g | `pg:daf73f27-0765-4421-9275-2754e9b901da` | 5 | 15.00 |
| 我认刀之郎法式雪饼80g | `pg:1e4665e9-ebe8-4ac6-9392-d5d16480e466` | 5 | 14.00 |
| 劲仔深海小鱼酱汁味非标品如上架造成损失自行承担 | `pg:4ab5fd14-f74d-4853-8463-4dfb1bf9068b` | 11 | 11.50 |
| 康盛老婆饼95g | `pg:31dead4c-a611-4b10-9b4a-19bcad8b10fa` | 5 | 11.00 |
| 康盛香芋味饼95g | `pg:6bbabee2-9a12-425b-b059-ee7cc8f9c9a5` | 5 | 10.00 |
| 立群老婆饼85g | `pg:361eba89-1ce3-4afc-8a87-359fe194beb7` | 4 | 8.00 |
| 新一代红江榨菜80g | `pg:7668a1f6-9dc1-45da-863d-912856b31d3b` | 2 | 2.00 |

这些商品缺少真实成本凭证，不能由系统猜成本。需要在进货页补录对应成本后，再重新运行生产校验；在缺口清零前，旧库存表继续只归档保留，不物理删除。

## 最终结构

新系统只保留利润核算需要的数据域：

| 表 | 职责 |
| --- | --- |
| `products_global` | 全局商品档案。商品不再按机台拆分。 |
| `product_aliases` | 商品别名、平台名称、旧商品 ID 到全局商品的映射。 |
| `purchase_records` | 进货成本凭证。进货只提供成本来源。 |
| `purchase_record_items` | 进货明细。 |
| `sales_records` | 销售记录。机台只在这里出现，表示销售来源设备。 |
| `sales_record_items` | 销售明细。 |
| `cost_snapshots` | 成本快照和成本来源，用于锁定毛利依据。 |

## 业务口径

- 商品不再分机台，也不再分库存池。
- 机台只出现在销售记录里。
- 进货 = 成本来源。
- 销售 = 收入来源。
- 成本快照 = 毛利依据。
- 利润 = 销售金额 - 商品成本 - 手续费 - 服务费 - 优惠 - 退款。
- 旧库存表保留为历史来源，不继续扩展；新利润 API 和报表不得读取 `inventory_balances` / `stock_movements`。

## 五步执行

1. 新建利润系统数据表，不动旧库存表。
2. 从旧数据迁移出全局商品、销售、进货、成本快照。
3. 写新的利润 API 和报表口径，完全不读库存。
4. 前端页面切到新利润系统：商品、进货、销售、仪表盘。
5. 校验无误后，删除旧库存页面/API/代码，旧库存表只归档不再使用。

## Phase 1：并行利润系统基线

本阶段只做三件事：

| 输出 | 文件 |
| --- | --- |
| 新利润表结构 | `migrations/0019_parallel_profit_system.sql` |
| 旧数据迁移到新利润表 | `scripts/profit-system/migrate-phase1.mjs` |
| 新旧利润口径校验报表 | `scripts/profit-system/verify-phase1.mjs` |

### Phase 1 验收项

校验报表必须覆盖：

- 旧系统指定月份销售额 / 成本 / 毛利。
- 新系统指定月份销售额 / 成本 / 毛利。
- 成本缺失商品。
- 迁移失败商品或单据明细。
- 商品合并结果。

默认校验月份为上一个自然月；在 2026 年 7 月执行时默认对比 `2026-06`。

### Phase 1 命令

```powershell
npx.cmd wrangler d1 migrations apply v3-vending-inventory-sales-db --local
node scripts/profit-system/migrate-phase1.mjs --local
node scripts/profit-system/verify-phase1.mjs --local --month 2026-06
```

生产执行时去掉 `--local`。远程 D1 数据迁移脚本不包事务，保持幂等，可重复运行。

## Phase 2：新利润 API

本阶段先提供只读 API，供前端逐页切换。所有接口只读新利润表，不读库存余额或库存流水。

| API | 用途 |
| --- | --- |
| `GET /api/profit/summary?month=YYYY-MM&days=30&machineId=...` | 新利润仪表盘口径：销售额、退款、费用、净收入、成本、毛利、趋势、机台排行、商品排行。 |
| `GET /api/profit/cost-gaps?month=YYYY-MM&machineId=...` | 成本缺失商品清单。只暴露缺口，不猜成本金额。 |
| `GET /api/profit/products?search=...&includeArchived=false` | 全局商品档案、别名数量、进货成本、销售毛利和最近成本。 |

Phase 2 验收：

- 新 API 不引用 `inventory_balances` / `stock_movements` / `inventory-service`。
- `summary` 的销售额、成本、毛利与 Phase 1 校验口径一致。
- 成本缺失商品继续作为阻断项展示，不自动填成本。

## Phase 3：前端逐页切换

先切两个页面：

| 页面 | 切换结果 |
| --- | --- |
| 仪表盘 | 改读 `/api/profit/summary`；低库存区域替换为成本缺口，异常区域替换为商品合并结果。 |
| 商品 | 改读 `/api/profit/products`；展示全局商品利润档案，不再展示库存、机台库存、库存流水、上下架操作。 |

剩余页面：

- 进货页切到 `purchase_records` / `purchase_record_items`。
- 销售页切到 `sales_records` / `sales_record_items`。
- 库存页最后下线或改成归档入口，不再作为主业务页面。

## 商品合并规则

全局商品按旧 `products.normalized_name` 归并：

- `normalized_name` 为空时退回 `name`。
- `normalized_name` 形如 `merged:<目标标准名>` 时归并到 `<目标标准名>`。
- 多个旧商品归并到同一全局商品时，保留全部旧商品为 `product_aliases`，供后续 Excel / 平台名称继续匹配。
- 全局商品 ID 使用该组最小旧商品 ID 生成，保证重复迁移稳定。

## 切换红线

- Phase 1 不改旧页面和旧 API。
- Phase 1 不删除 `products`、`purchase_orders`、`sales_orders`、`stock_movements`、`inventory_balances`。
- Phase 3 之前，新利润报表不得从库存余额或库存流水取成本。
- 成本缺失和迁移失败未清零前，不切换前端页面。
