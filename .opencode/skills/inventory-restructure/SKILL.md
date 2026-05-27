---
name: inventory-restructure
description: 推进 v3 售货机系统 1 号机/2 号机的销售-商品-库存大重构。当用户提到"重构计划/Phase 0/Phase 1/Phase 2/按机库存/分机库存/1/2 号机折叠/总库存与进货不匹配/库存漂移/重建余额/inventory-balance/stock-scope 删除/机间调拨/盘点 UI"等时使用。本 skill 是 docs/重构计划-1-2号机.md 的可执行索引：阶段触发→对应文件→决策点→验收门槛。
---

# 1/2 号机销售-商品-库存重构（v3）

> 本 skill 把 `docs/重构计划-1-2号机.md` 压成可执行索引。**任何阶段开工前先读那份计划书的对应小节，再回到这里看 v3 文件落点。**

## 触发场景

- 用户描述：「按 §X.Y 启动 Phase N」「开始库存重构」「先做漂移诊断」「合并三处余额逻辑」「删 stock-scope」「跑 5 项对账」「机间调拨怎么做」
- 用户说：「总库存与进货不匹配」「1/2 号机库存分不开」「重建库存余额」
- 用户说：「按重构计划走」「按 docs/重构计划-1-2号机.md 走」

## 第一原则

| ✅ 做 | ❌ 不做 |
| --- | --- |
| 开工前先读 `docs/重构计划-1-2号机.md` 对应阶段 | 不要凭印象动手；这份计划是唯一真相 |
| 一次只推一个 Phase，不跨阶段 | 不要 Phase 1 没结束就改 Phase 2 的文件 |
| 6 个决策点（D1-D6）必须先确认 | 不要默认按推荐项执行未告知用户的非默认变化 |
| Phase 2 之前必须有 Phase 0.5 的诊断报告 | 不要在没有「重建前对照基线」的情况下开始重置 |
| Phase 2.5 五项全 0 才能合并 PR | 不要任何一项非 0 就部署 |

## 阶段速查

| Phase | 工期 | 入口 | 输出 |
| --- | --- | --- | --- |
| 0.5 | 0.5d | `scripts/diagnose/*.mjs`（5 个） | `docs/库存漂移现状-YYYYMMDD.md` |
| 0   | 0.5d | `wrangler d1 export --remote` | 备份 SQL + Excel 存档 |
| 1   | 2d   | `_shared/money.js` + 结算导入 | 金额公式统一 + 双 Excel 协同 |
| 2   | 3-4d | 删 `stock-scope.js` + 三迁移 + `_shared/inventory-balance.js` | 按机分库存 + `rebuild-balances.mjs` |
| 2.5 | 0.5d | 5 项零漂检查（重跑 0.5 脚本） | `docs/库存对账证明-YYYYMMDD.md` |
| 3   | 2d   | `stock_transfers` 表 + 盘点 UI | 调拨与盘点功能 |
| 4   | 1.5d | per-machine 列 + 看板按机切分 | 商品/库存/仪表盘适配 |
| 5   | 1d   | `scripts/deploy-pages.ps1` + cron | 上线 + 持续监控 |

## 6 个决策点（开工前必读）

| # | 决策 | 默认推荐 |
| --- | --- | --- |
| D1 | 商品模型：共享商品+按机库存 / 每台机一份商品 | **A 共享商品** |
| D2 | 历史进货怎么分到具体机 | **a 用 purchase_orders.machine_id 直接还原** |
| D3 | 是否实现机间调拨 | **A 加 stock_transfers 表** |
| D4 | 退款单据 | **A sales_orders.type='refund' 沿用** |
| D5 | 仪表盘默认视图 | **A 全机汇总（默认）+ B 可切单机** |
| D6 | Phase 2 期间策略 | **A 维护窗（夜间 2h 停写）** |

> 用户若想改任意一项的默认值，**必须先回到 `docs/重构计划-1-2号机.md §2` 加批注**，再开工。

## 文件落点（按 Phase 拆开）

### Phase 0.5（诊断）

| 新建 | 用途 |
| --- | --- |
| `scripts/diagnose/balance-vs-movements.mjs` | R3：余额缓存 vs 流水净额 |
| `scripts/diagnose/purchase-vs-balance.mjs` | R6：进货 vs 当前库存+出库 |
| `scripts/diagnose/stock-scope-leakage.mjs` | R2：'1/2号机' 折叠值是否还在 |
| `scripts/diagnose/void-unwind.mjs` | R5：作废订单是否完全反冲 |
| `scripts/diagnose/duplicate-product.mjs` | R7：同名重复 active 商品 |
| `scripts/diagnose/run-all.mjs` | 一键编排 + 汇总 markdown |

> 实现规范见 skill `inventory-drift-diagnose`。

### Phase 1（金额 + 结算）

| 新建 / 修改 | 内容 |
| --- | --- |
| ➕ `migrations/0011_money_columns_align.sql` | 补齐 platform_fee/service_fee/discount/refund 列 + 索引 |
| ➕ `functions/api/_shared/money.js` | 统一金额公式（gross/refund/fee/cogs/profit） |
| ➕ `functions/api/integrations/zn/import-settlement.js` | 交易账单 Excel 导入 |
| ➕ `frontend/app/composables/useZnExcel.ts` | 抽出 Excel 解析逻辑 |
| 🔧 `frontend/app/components/settings/ZnImportCard.vue` | 加「结算」tab |
| 🔧 `functions/api/reports/dashboard.js` | 改用 money.js 公式 |

> Excel 字段映射见 skill `zn-excel-import`。

### Phase 2（按机库存）

| 新建 / 修改 / 删除 | 内容 |
| --- | --- |
| 🗑️ `functions/api/_shared/stock-scope.js` | 折叠源头，整文件删除（R2） |
| ➕ `functions/api/_shared/inventory-balance.js` | 唯一余额更新实现（R1：合并三处副本） |
| ➕ `migrations/0012_split_combined_machine.sql` | `'1/2号机'` 行清理 + 待重建标记 |
| ➕ `migrations/0013_stock_transfers.sql` | 调拨表（D3=A） |
| ➕ `migrations/0014_stock_movement_transfer_types.sql` | movement_type CHECK 扩展 |
| ➕ `scripts/rebuild-balances.mjs` | 从流水重建余额，幂等可重跑 |
| 🔧 `functions/api/_shared/inventory-service.js` | 去 stock-scope，改用 inventory-balance |
| 🔧 `functions/api/_shared/zn/importer.js` | 同上 + 写真实 machine_id |
| 🔧 `functions/api/_shared/shengma/importer.js` | 同上 |

> Phase 2 必须在维护窗内执行（D6=A）。

### Phase 3（调拨 + 盘点）

| 新建 | 内容 |
| --- | --- |
| ➕ `frontend/app/components/inventory/TransferDialog.vue` | 机间调拨弹窗 |
| ➕ `frontend/app/components/inventory/CycleCountDialog.vue` | 现场盘点弹窗 |
| ➕ `functions/api/inventory/transfer.js` | 调拨 API |
| ➕ `functions/api/inventory/cycle-count.js` | 盘点 API |

### Phase 4（前端适配）

| 修改 | 内容 |
| --- | --- |
| 🔧 `frontend/app/pages/products.vue` | 表格加 1/2/3 号机库存列 |
| 🔧 `frontend/app/pages/inventory.vue` | 机台筛选 + 调拨入口 |
| 🔧 `frontend/app/pages/dashboard.vue` | 全机汇总 / 按机切分切换 |
| 🔧 `frontend/app/types/product.ts` | `inventoryByMachine` 字段 |
| 🔧 `frontend/app/types/inventory.ts` | per-machine balance |

## 验收门槛（Phase 2.5）

部署 / 合并 PR 之前，5 项必须全 0。命令：

```powershell
node scripts/diagnose/run-all.mjs
```

| 检查 | 期望 |
| --- | --- |
| balance-vs-movements 漂移 SKU | 0 |
| purchase-vs-balance 漂移 SKU | 0 |
| stock-scope-leakage `'1/2号机'` 行数 | 0 |
| void-unwind 漏冲条数 | 0 |
| duplicate-product 重复对数 | 0 |

任一非 0 → 禁止 push / 禁止 `deploy-pages.ps1`。

## 漂移根因索引（R1-R8）

完整说明见 `docs/重构计划-1-2号机.md §1`。改任意 importer 时先看这张表，确认你的改动覆盖了哪条。

| 编号 | 根因 | 由哪个 Phase 解决 |
| --- | --- | --- |
| R1 | 三处余额副本算法不一致 | Phase 2（合并到 `_shared/inventory-balance.js`） |
| R2 | `stockMachineIdFor` 折叠 | Phase 2（删 stock-scope.js） |
| R3 | balance 是缓存 | Phase 2 + L3 cron 监控 |
| R4 | 负库存恢复分支 | Phase 2（统一一种策略） |
| R5 | 作废未反冲 | Phase 0.5 发现 + Phase 2 重建 |
| R6 | adjustment 无凭据 | Phase 0.5 发现 + Phase 3 盘点流程 |
| R7 | 同名重复商品 | Phase 0.5 发现 + L6 partial unique index |
| R8 | 结算字段不全 | Phase 1（交易账单导入） |

## 反模式（看到立即停）

| ❌ | ✅ |
| --- | --- |
| 没看 docs/重构计划-1-2号机.md 就开始改 inventory-service.js | 先读对应 Phase 小节 |
| 在 Phase 0.5 没出报告前删 stock-scope.js | 先有诊断基线，才能事后比较 |
| 三处余额逻辑只改一处「先这样应付一下」 | Phase 2 必须三处一起改成调用 inventory-balance.js |
| 重建后没跑 5 项对账就 push | Phase 2.5 是硬门槛 |
| 维护窗外动 sales_orders / stock_movements 表结构 | 维护窗外只做诊断和文档 |
| Phase 1 改了金额公式但没跑回归（dashboard 月度毛利） | 必须 `scripts/test.ps1` + 仪表盘人眼看一遍 |
| 把 stock_transfers 当成 adjustment 来记 | adjustment 是审计兜底，转移要走专门表（D3=A） |

## 完成后

按 AGENTS.md §3.5：

```powershell
git add -A
git commit -m "<重构计划 Phase N：简明描述>"
git push origin master
powershell -ExecutionPolicy Bypass -File ./scripts/deploy-pages.ps1
```

回复时按 §3.7 列：

1. 推进到第几个 Phase、动了哪些文件
2. 5 项对账结果（如果跨过 Phase 2.5）
3. commit hash
4. 下一步要做的 Phase

## 协作的其他 skill

| Skill | 何时同时加载 |
| --- | --- |
| `inventory-drift-diagnose` | 跑 / 写 / 读诊断脚本时 |
| `zn-excel-import` | 修改 Excel 导入逻辑或字段映射时 |
| `pages-deploy-troubleshoot` | 部署失败时 |
