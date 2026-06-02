---
name: zn-excel-import
description: 修改 v3 售货机管理系统的 zn 平台 Excel 导入链路（订单明细 + 交易账单）。当用户提到"zn Excel/订单明细/交易账单/导入失败/字段映射/订单号关联/手续费/算法服务费/预估到账/设备编号/sheetjs/xlsx 解析/设备映射"等时使用。覆盖两份 Excel 的字段对齐、幂等键、批次切分、与 _shared/money.js 公式的对应。
---

# zn 平台 Excel 导入（v3）

> 1 号机 / 2 号机 / 3 号机的销售来源全靠 zn 平台后台导出的 Excel。本 skill 把两份 Excel 的字段映射 + 幂等键 + 批次约束写成可执行规则，避免每次都重新摸索。
>
> 配套文档：`docs/设备映射与数据来源.md`、`docs/重构计划-1-2号机.md`（Phase 1）。

## 触发场景

- 用户描述：「订单明细导入失败」「交易账单怎么导」「手续费/算法服务费字段对不上」「订单号关联不上」「设备编号映射」「重复导入会报错吗」「批次切多大合适」
- 改 `frontend/app/components/settings/ZnImportCard.vue` / `functions/api/_shared/zn/importer.js` / `functions/api/integrations/zn/import.js` / 新建 `import-settlement.js` 时
- 在 Phase 1 把交易账单接进来时

## 第一原则

| ✅ 做 | ❌ 不做 |
| --- | --- |
| 用现有 `pickField()` 的 `startsWith` 前缀匹配 | 用全等匹配（zn 表头会带"(元)"等单位后缀，会失配） |
| 设备编号→机型走 `ZN_DEVICE_TO_MACHINE` | 在前端硬编码设备编号 |
| 订单号是天然幂等键，全部走 `external_sales_imports.vendor_order_no` | 用 `vendorOrderNo + 行号` 当 key（合并行后会变） |
| 交易账单按订单号回写到现有 `sales_orders` | 把交易账单当成新销售单插入 |
| 报表手续费只汇总 `platform_fee_cents + service_fee_cents` | 用设置页 `feeRate` 或固定比例估算手续费 |
| Phase 2 后写真实 `machine_id`（'1号机' / '2号机' / '3号机'） | 仍写折叠值 `'1/2号机'` |
| 浏览器端解析 → 后端只接 ParsedRow JSON | 把 Excel 二进制传给后端再解析（Cloudflare Pages Functions 没 SheetJS） |

## 两份 Excel 一览

| Excel | 来源 | 行级粒度 | 用途 |
| --- | --- | --- | --- |
| **订单明细** `订单明细_*.xlsx` | zn 后台 → 账户信息 → 订单明细 | 一行一商品行（同订单多商品时多行，订单号在主行） | 销售来源（创建 sales_orders + sales_items + stock_movements.sale） |
| **交易账单** `交易账单_*.xlsx` | zn 后台 → 账户信息 → 交易账单 | 一行一笔结算 | 结算来源（回写 platform_fee / service_fee / received_amount） |

> 两个文件**都需要**导入，缺一不可。订单明细给数量、交易账单给真实到账金额。

## 订单明细字段映射（Excel → ParsedRow）

代码位置：`frontend/app/components/settings/ZnImportCard.vue` 的 `normalizeRow()`。
匹配函数：`pickField(raw, names)`，对每个 Excel 表头 trim 后 `startsWith` 命中任意 name 即返回。

| ParsedRow 字段 | Excel 表头前缀（pickField 的 names 数组） | 类型 / 备注 |
| --- | --- | --- |
| `vendorOrderNo` | `订单号` | string，幂等键 |
| `title` | `标题` | string，仅信息 |
| `status` | `状态` | string，只有 `已完成` 才计入 |
| `deviceCode` | `设备编号` | string → 走 `ZN_DEVICE_TO_MACHINE` |
| `vendorProductName` | `商品名称` | string |
| `vendorBarcode` | `商品条码` | string，可能空 |
| `unitPrice` | `商品单价` | number（元 → toNumber） |
| `quantity` | `商品数量` | number，最小 1 |
| `lineAmount` | `销售额`、`价格` | number（元，订单金额含优惠后） |
| `receivedAmount` | `预估到帐金额`、`预估到账金额`、`到账金额` | number（元，**预估值**，最终以交易账单为准） |
| `refundAmount` | `退款金额` | number（元，> 0 时该行不计入） |
| `platformFee` | `手续费` | number（元） |
| `serviceFee` | `算法服务费` | number（元） |
| `discount` | `优惠金额` | number（元） |
| `date` | `创建时间`、`扣款时间` | string，取前 10 位作为 `YYYY-MM-DD` |

**导入过滤规则**（`isImportableRow`）：

```ts
function isImportableRow(row) {
  return row.status === '已完成'
    && !!row.vendorProductName
    && row.quantity > 0
}
```

**多行合单**：`订单号` 字段在同一订单的多行中只有第一行有值，后续行为空。`chunkRowsByOrder()` 处理这种情况：把订单号为空的行合并到上一行的订单。

**含退款原销售单**：订单明细里状态为 `已完成`、但 `退款金额 > 0` 的原销售单仍要导入；退款本身由退款明细导入链路单独入库。退款明细导入成功后会把原销售单上的内嵌 `refund_amount_cents` 清零，避免退款 KPI 重复统计。

## 交易账单字段映射（Excel → SettlementRow，Phase 1 新建）

代码位置：`functions/api/integrations/zn/import-settlement.js`（新建）。

| SettlementRow 字段 | Excel 表头前缀 | 类型 |
| --- | --- | --- |
| `vendorOrderNo` | `订单号` | string，关联键 |
| `deviceCode` | `设备号:`、`设备编号` | string |
| `grossAmount` | `销售额` | number（元） |
| `platformFee` | `手续费` | number（元，**以本表为准**，覆盖订单明细里的预估值） |
| `serviceFee` | `算法费`、`算法服务费` | number（元，同上） |
| `expense` | `费用` | number（元，= platformFee + serviceFee 的合计，仅校验用） |
| `payMethod` | `支付方式` | string |
| `incomeType` | `收支类型` | string，`收入` / `支出`（退款），过滤 |
| `settledAt` | `订单扣款时间`、`时间:` | string |

**回写规则**（不创建新订单，仅更新已存在订单）：

```sql
UPDATE sales_orders SET
  platform_fee_cents   = ?,
  service_fee_cents    = ?,
  received_amount_cents = ?  -- 公式见下方
WHERE source = 'zn' AND external_id = ?  -- ? = vendorOrderNo
```

`received_amount_cents` 的公式（见 `_shared/money.js`）：

```
received = grossAmount - refundAmount - platformFee - serviceFee
```

**幂等**：新表 `external_settlement_imports`：

```sql
CREATE TABLE external_settlement_imports (
  integration TEXT NOT NULL,        -- 'zn'
  vendor_order_no TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  PRIMARY KEY (integration, vendor_order_no)
);
```

幂等策略：
- 找不到匹配的 sales_orders → warning，不创建
- 找到 → UPSERT（同一订单允许多次回写，以最后一次为准）

## 设备映射（一处真相）

```js
// functions/api/_shared/zn/constants.js
export const ZN_DEVICE_TO_MACHINE = {
  TBN5CFA0261G547T5D3: '1号机',
  TBN5CFA0261GJ6BG6EA: '2号机',
  TBN5CFA0261GI1MJ345: '2号机',
  TBN5CFA0261KGGWA303: '3号机'
};
```

> 任何新增 zn 设备必须在这里登记，并同步更新 `docs/设备映射与数据来源.md`。

**Phase 2 关键变更**：导入时写入 sales_orders.machine_id 必须用 `mapZnDeviceToMachine(deviceCode)` 的真实返回值（'1号机' / '2号机' / '3号机'），**不要再走 `stockMachineIdFor`**（该文件 Phase 2 删除）。

## 批次切分

代码位置：`ZnImportCard.vue` 的 `chunkRowsByOrder()` + `IMPORT_BATCH_SIZE = 80`。

| 维度 | 约束 |
| --- | --- |
| 单批订单数 | ≤ 80 |
| 不允许同一订单跨批 | 同订单多行必须在一批内（`chunkRowsByOrder` 已实现） |
| 单次 D1 batch 语句数 | < 1000（D1 限制） |

> 经验值：80 单 / 批 在所有线路测试稳定。低于这个值上传次数太多；超过 200 单 / 批容易触发 D1 batch 超时。

## 幂等键设计

| 实体 | 幂等键 | 表 |
| --- | --- | --- |
| 销售订单 | `(integration='zn', external_id=vendorOrderNo)` 或 `id='zn:'+vendorOrderNo` | `sales_orders.source` + `sales_orders.external_id` |
| 销售明细 | `(sales_order_id, line_index)` | `sales_items.id = orderId+':'+index` |
| 销售流水 | `(integration='zn', external_id=订单号)` | `stock_movements.external_id = 'zn:sale:'+vendorOrderNo` |
| 已导入订单原始 JSON | `(integration='zn', vendor_order_no)` | `external_sales_imports` |
| 结算回写 | `(integration='zn', vendor_order_no)` | `external_settlement_imports`（Phase 1 新建） |

## 重新导入策略（reconcile vs rebuild）

`functions/api/_shared/zn/importer.js` 已有两条分支：

| 分支 | 触发 | 行为 |
| --- | --- | --- |
| `reconileExistingOrder` | 同订单号已存在，且金额相差不大 | 仅更新 `received_amount` / `note`，不动 movement |
| `rebuildExistingOrder` | 同订单号已存在，但 quantity / amount 显著差异 | 反冲旧 movement、重建新 movement |

**Phase 2 后约束**：rebuild 只允许在维护窗内执行；正常运营期遇到差异 → warning，由人工裁决。

## 反模式（看到立即停）

| ❌ | ✅ |
| --- | --- |
| 在前端写 `if (deviceCode === 'TBN...')` 硬编码映射 | 走 `ZN_DEVICE_TO_MACHINE` |
| 把交易账单当订单明细 import 一遍（会重复创建订单） | 必须走 `import-settlement.js`，按订单号 UPDATE |
| 不带 startsWith，写死 `'手续费(元)'` 这种带单位的 key | `pickField(raw, ['手续费'])` |
| 把 ZnImportCard 上传按钮 disable 条件设成"任何一个 Excel 缺失" | 两个 Excel 互不依赖，单独上传也能进 |
| 把 5 个 zn Excel 文件提交到 git | 它们是用户私有数据，已在 .gitignore；存档放 `output/excel-archive/` |
| 在后端用 `xlsx` 库解析（Cloudflare Functions 启动时间会爆） | 始终在浏览器端解析，后端只接 ParsedRow JSON |
| 改 `pickField` 时不跑 `scripts/test-zn-import.mjs` | Excel 表头变化是高频事故源，回归是必跑项 |

## 验证

```powershell
# 单测
node scripts/test-zn-import.mjs

# 整体回归
powershell -ExecutionPolicy Bypass -File ./scripts/test.ps1

# 改了字段映射后，用 5 份真实 Excel 跑一遍
# （在本地 dev.bat 启动的环境下，前端上传 → 看导入结果摘要）
```

**回归集**（必须覆盖）：

- 5 份现实 Excel：`订单明细_2026-03-01_*.xlsx` / `订单明细_2026-03-31_*.xlsx` / `订单明细_2026-05-01_*.xlsx` / `订单明细_2026-05-26_*.xlsx` / `交易账单_260501_260526.xlsx`
- 已完成但含退款的原销售单必须导入；退款金额由退款明细导入链路去重处理
- 多行合单（订单号空行）必须正确归到上一订单
- 重复导入同一份 Excel 必须 `ordersDuplicate` 计数增加，不重复扣库存
- Phase 1 后：交易账单导入只更新已有订单的费用列，找不到的订单进 warnings

## 关联文件速查

| 路径 | 职责 |
| --- | --- |
| `frontend/app/components/settings/ZnImportCard.vue` | UI + 浏览器端 xlsx 解析 + 批次上传 |
| `frontend/app/composables/useZnExcel.ts` | （Phase 1 新建）抽出 normalizeRow / pickField |
| `functions/api/integrations/zn/import.js` | 订单明细导入入口 |
| `functions/api/integrations/zn/import-settlement.js` | （Phase 1 新建）交易账单导入入口 |
| `functions/api/_shared/zn/importer.js` | 订单明细业务逻辑（含 reconcile/rebuild） |
| `functions/api/_shared/zn/constants.js` | 设备映射 |
| `functions/api/_shared/money.js` | （Phase 1 新建）金额公式 |
| `docs/设备映射与数据来源.md` | 设备-机型映射的人类文档 |

## 完成后

按 AGENTS.md §3.5 提交：

```powershell
git add -A
git commit -m "<zn 导入：场景描述>"
git push origin master
powershell -ExecutionPolicy Bypass -File ./scripts/deploy-pages.ps1
```

回复时按 §3.7 列：
1. 触碰文件
2. 跑了哪些回归（5 份 Excel 中哪几份）
3. commit hash
4. 设备映射 / 字段映射有无变化（有则同步更新文档）

## 协作的其他 skill

| Skill | 何时同时加载 |
| --- | --- |
| `inventory-restructure` | 改导入与按机库存逻辑同时发生时（Phase 2 写真实 machine_id） |
| `inventory-drift-diagnose` | 怀疑 Excel 导入是漂移源时 |
| `pages-deploy-troubleshoot` | 部署后导入接口报错时 |
