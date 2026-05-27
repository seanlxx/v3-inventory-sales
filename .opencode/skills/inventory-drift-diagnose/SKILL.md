---
name: inventory-drift-diagnose
description: 诊断 v3 售货机管理系统的库存漂移问题（总库存与进货不匹配、负库存、'1/2号机' 折叠泄漏、作废未反冲、同名重复商品）。当用户提到"库存漂移/库存对不上/总库存不匹配/进货 vs 库存对账/负库存核查/重建余额验证/Phase 0.5 诊断/Phase 2.5 验收/对账证明"等时使用。覆盖 5 个诊断脚本的实现规范、根因映射、Phase 0.5 / 2.5 的强制门槛。
---

# 库存漂移诊断（v3）

> 本 skill 服务于 `docs/重构计划-1-2号机.md` 的 Phase 0.5（重建前定量化漂移）和 Phase 2.5（重建后零漂证明）。两个 Phase 用同一套脚本，只是判读阈值不同：
> - Phase 0.5：允许任何漂移值，目标是**记录**
> - Phase 2.5：所有漂移值必须为 0，目标是**证明对齐**

## 触发场景

- 用户描述：「总库存与进货不匹配」「为什么进货 100 件库存只剩 30 件 + 销售 50 件」「balance 表数字不对」「负库存怎么来的」「跑一次诊断」「Phase 0.5 / 2.5 检查」
- 用户给出诊断脚本输出的截图，要求判读
- Phase 2 重建后，要写「对账证明」

## 第一原则

| ✅ 做 | ❌ 不做 |
| --- | --- |
| 5 个脚本全部跑完再判读 | 只跑 1 个脚本就下结论 |
| 用 `--remote` 拉真实生产数据 | 用本地 `.wrangler/` 缓存数据（可能滞后） |
| 输出 JSON 到 `output/diagnose/` | 写到 `frontend/` / 仓库根 |
| 漂移项按金额排序，先看 Top 20 | 试图一次列出几百行 SKU 让人眼瞄 |
| 给每个漂移 SKU 标记根因（R1-R8） | 只给数字不给可疑原因 |

## 5 个诊断脚本（全部新建在 `scripts/diagnose/`）

### 1. `balance-vs-movements.mjs`（R3 检查）

**问题**：`inventory_balances` 是缓存，长期可能与 `stock_movements` 累计净额脱节。

**SQL 核心**：

```sql
SELECT
  m.product_id, m.machine_id,
  SUM(m.qty_delta) AS movements_net_qty,
  COALESCE(b.quantity_on_hand, 0) AS balance_qty
FROM stock_movements m
LEFT JOIN inventory_balances b
  ON b.product_id = m.product_id AND b.machine_id = m.machine_id
GROUP BY m.product_id, m.machine_id
HAVING movements_net_qty != balance_qty
```

**输出**：JSON 数组 `{ product_id, machine_id, movements_net_qty, balance_qty, drift }`，按 `|drift|` 倒序，附 product name。

### 2. `purchase-vs-balance.mjs`（R6 检查 — 用户最关心的「进货 vs 库存」）

> 项目里已有的 `scripts/verify-purchase-vs-inventory.mjs` 是该脚本的雏形，**重写时直接以它为基础**，新脚本要做的额外事：
> 1. 按机分组（不再混 1 号机/2 号机）
> 2. 输出 `output/diagnose/purchase-vs-balance.json` 而非 `output/merge-products/...`
> 3. 加金额维度的漂移（不只是数量）

**恒等式**：`Σ purchase_items.quantity = balance.quantity_on_hand + Σ |sale qty| + Σ |loss qty| − Σ refund qty − Σ adjustment qty`

**SQL 核心**（数量维）：

```sql
WITH purch AS (
  SELECT pi.product_id, po.machine_id, SUM(pi.quantity) AS qty
  FROM purchase_items pi JOIN purchase_orders po ON po.id = pi.purchase_id
  WHERE po.voided_at IS NULL
  GROUP BY pi.product_id, po.machine_id
),
mov AS (
  SELECT product_id, machine_id, movement_type,
         SUM(qty_delta) AS qty_sum
  FROM stock_movements
  GROUP BY product_id, machine_id, movement_type
)
-- 拼装：purch.qty - balance.qty - |sale| - |loss| + refund + adjustment
```

**输出**：`{ product_id, machine_id, purchase_qty, balance_qty, sale_qty, loss_qty, refund_qty, adjustment_qty, drift_qty, suspected_root_cause }`。

`suspected_root_cause` 推断规则：
- `drift_qty > 0` 且 `Σ adjustment_qty != 0` → R6
- `drift_qty != 0` 且同 product 在多个 machine_id 下都有 balance → R2
- `drift_qty != 0` 且存在 `voided_at IS NOT NULL` 的对应 sales_order → R5
- 其它 → 标记 `unknown`，由人工判读

### 3. `stock-scope-leakage.mjs`（R2 检查）

**问题**：折叠值 `'1/2号机'` / `'1/2号机总库存'` 是否还存在于真实数据中。

**SQL**：

```sql
SELECT 'inventory_balances' AS table_name, machine_id, COUNT(*) AS row_count
FROM inventory_balances
WHERE machine_id IN ('1/2号机', '1/2号机总库存')
GROUP BY machine_id

UNION ALL

SELECT 'stock_movements', machine_id, COUNT(*)
FROM stock_movements
WHERE machine_id IN ('1/2号机', '1/2号机总库存')
GROUP BY machine_id

UNION ALL

SELECT 'sales_orders', machine_id, COUNT(*)
FROM sales_orders
WHERE machine_id IN ('1/2号机', '1/2号机总库存')
GROUP BY machine_id

UNION ALL

SELECT 'purchase_orders', machine_id, COUNT(*)
FROM purchase_orders
WHERE machine_id IN ('1/2号机', '1/2号机总库存')
GROUP BY machine_id
```

**输出**：每张表每个折叠值的行数。Phase 2.5 期望全部为 0。

### 4. `void-unwind.mjs`（R5 检查）

**问题**：作废订单是否每条都有反向冲销 movement。

**SQL**：

```sql
-- 找作废 sales_orders / purchase_orders
WITH voided AS (
  SELECT id, type, voided_at FROM sales_orders WHERE voided_at IS NOT NULL
  UNION ALL
  SELECT id, 'purchase' AS type, voided_at FROM purchase_orders WHERE voided_at IS NOT NULL
)
SELECT v.id, v.type, v.voided_at,
       (SELECT COUNT(*) FROM stock_movements WHERE ref_id = v.id AND movement_type != 'void') AS forward_count,
       (SELECT COUNT(*) FROM stock_movements WHERE ref_id = v.id AND movement_type = 'void') AS reverse_count
FROM voided v
WHERE forward_count != reverse_count
```

**输出**：`{ order_id, type, voided_at, forward_count, reverse_count, missing }`，`missing = forward_count - reverse_count`。Phase 2.5 期望全部 missing=0。

### 5. `duplicate-product.mjs`（R7 检查）

**问题**：同 machine_id 下 normalized_name 重复的 active 商品。

**SQL**：

```sql
SELECT machine_id, normalized_name, COUNT(*) AS dup_count,
       GROUP_CONCAT(id, ', ') AS product_ids,
       GROUP_CONCAT(name, ' || ') AS names
FROM products
WHERE status = 'active' AND normalized_name IS NOT NULL AND normalized_name != ''
GROUP BY machine_id, normalized_name
HAVING dup_count > 1
ORDER BY dup_count DESC
```

**输出**：候选合并对，**仅输出，不自动合并**。合并由 `scripts/merge-duplicate-products.mjs` 在人工 review 后手动执行。

### 6. `run-all.mjs`（编排器）

**功能**：

```
1) 顺序跑 5 个诊断脚本
2) 收集每个脚本的 JSON 输出
3) 输出汇总 markdown：output/diagnose/summary-YYYYMMDD.md
   - 每节一个脚本结果，按金额/数量 Top 20
   - 顶部红绿灯：5 项是否全 0
4) 输出退出码：5 项全 0 → exit 0；任一非 0 → exit 1
   （便于在 deploy-pages.ps1 前作为 gate）
```

## 实现共性（5 个脚本都遵循）

### Wrangler 调用样板（与 `scripts/verify-purchase-vs-inventory.mjs` 一致，避免 PS BOM 坑）

```js
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(scriptDir));
const outputDir = join(projectRoot, 'output', 'diagnose');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

function parseWranglerJson(output) {
  const text = String(output || '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error(`bad wrangler output: ${text.slice(0, 400)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function runD1Query(sql) {
  const file = join(outputDir, `_q-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(file, String(sql).replace(/\s+/g, ' ').trim());
  const escaped = file.replace(/'/g, "''");
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || `${process.env.APPDATA}/xdg.config`
  };
  const raw = execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `$sql = Get-Content -LiteralPath '${escaped}' -Raw; & npx wrangler d1 execute v3-vending-inventory-sales-db --remote --json --command $sql`
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 40, env });
  return parseWranglerJson(raw).flatMap(item => item.results || []);
}
```

### 输出统一目录

- 临时 SQL：`output/diagnose/_q-*.sql`（被 .gitignore）
- JSON 结果：`output/diagnose/<script-name>.json`
- 汇总：`output/diagnose/summary-YYYYMMDD.md`
- Phase 0.5 / 2.5 正式产出（**入库**）：`docs/库存漂移现状-YYYYMMDD.md` / `docs/库存对账证明-YYYYMMDD.md`

> 注意 `output/` 已在 `.gitignore` 里，所以脚本中间产物不会被误提交，正式产出必须复制到 `docs/`。

### 必须避免的坑

| 坑 | 应对 |
| --- | --- |
| PS 5.1 BOM（写 SQL 临时文件被 wrangler 解析失败） | 用 `writeFileSync` 默认 utf-8 无 BOM，不要用 `Set-Content` |
| `npx.ps1` 执行策略 | 必须经 `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command` 包一层 |
| Wrangler 找不到 OAuth | 设 `XDG_CONFIG_HOME = $APPDATA/xdg.config`（见 `verify-purchase-vs-inventory.mjs`） |
| `--local` vs `--remote` 混用 | 诊断**始终用 `--remote`**；本地数据可能滞后 |
| `GROUP_CONCAT` 在 D1 单值过长会被截 | duplicate-product 脚本里若 `dup_count` 大，分页拉 |

## 根因映射表（R1-R8）

每个漂移 SKU 在汇总报告里必须标注根因，便于事后定位 Phase 2 的修复点。

| 编号 | 根因 | 由哪条诊断暴露 |
| --- | --- | --- |
| R1 | 三处余额副本算法不一致 | balance-vs-movements（不一致 + 涉及 zn / shengma 渠道 product） |
| R2 | `stockMachineIdFor` 折叠 | stock-scope-leakage |
| R3 | balance 是缓存 | balance-vs-movements |
| R4 | 负库存恢复分支按当前进价折算 | balance-vs-movements + 历史 inventory_value 突变 |
| R5 | 作废未完整反冲 | void-unwind |
| R6 | adjustment 无凭据 | purchase-vs-balance（adjustment 列非 0） |
| R7 | 同名重复商品 | duplicate-product |
| R8 | 结算字段不全 | （金额维，不在本 skill 检测范围；由 Phase 1 的 dashboard diff 暴露） |

## Phase 0.5 验收（重置前）

- [ ] 5 个脚本全部跑过
- [ ] `output/diagnose/summary-YYYYMMDD.md` 已生成
- [ ] 复制为 `docs/库存漂移现状-YYYYMMDD.md` 并入库
- [ ] Top 20 漂移 SKU 都标注了根因（R1-R8）
- [ ] 已 commit + push

## Phase 2.5 验收（重建后，强制门槛）

- [ ] 5 项**全部为 0**
- [ ] `run-all.mjs` 退出码 0
- [ ] `output/diagnose/summary-YYYYMMDD.md` 顶部 5 个红绿灯全绿
- [ ] 复制为 `docs/库存对账证明-YYYYMMDD.md` 并入库
- [ ] 才允许 `git push origin master` + `scripts/deploy-pages.ps1`

> 任一项非 0 → 立即停止部署，回 Phase 2 修。常见非 0 原因：
> - balance-vs-movements 非 0 → `_shared/inventory-balance.js` 有边角 case 没覆盖
> - stock-scope-leakage 非 0 → 还有引用 `stock-scope.js` 的代码没清理
> - void-unwind 非 0 → `voidDocument` 漏写反向 movement
> - duplicate-product 非 0 → 历史合并没合干净，需要 `scripts/merge-duplicate-products.mjs` 再跑

## 反模式（看到立即停）

| ❌ | ✅ |
| --- | --- |
| 用 `--local` 跑诊断 | `--remote` 是唯一真相 |
| 一个脚本输出几百行就直接贴对话 | 写 JSON + Top 20，让用户先看摘要 |
| Phase 2.5 任一项非 0 仍然部署 | 五项全 0 才能 push |
| 在脚本里直接写 `DELETE` / `UPDATE` 修数据 | 诊断只读；修复走 Phase 2 的 rebuild-balances.mjs |
| 把生产 D1 OAuth token 写进脚本 | wrangler 的 OAuth 由 `XDG_CONFIG_HOME` 解析，不要硬编码 |
| 用 `--include-not-active` 让 status='archived' 的商品也参与 duplicate 检查 | 只查 `status='active'`，已归档的本来就允许同名 |

## 完成后

按 AGENTS.md §3.5：

```powershell
git add scripts/diagnose docs/库存漂移现状-*.md docs/库存对账证明-*.md
git commit -m "<诊断/对账：场景描述>"
git push origin master
```

> 注意：`output/diagnose/` 是 .gitignore 排除的，**不入库**。要入库的是 `docs/` 下的两份正式产出。

回复时按 §3.7 列：
1. 跑了哪几个脚本
2. 5 项分别多少（数字）
3. 推断根因（R1-R8）Top 5
4. 下一步（Phase 0.5 完成 / Phase 2.5 通过 / Phase 2 还要修）

## 协作的其他 skill

| Skill | 何时同时加载 |
| --- | --- |
| `inventory-restructure` | 诊断结果驱动 Phase 决策时 |
| `zn-excel-import` | 漂移可疑来源是 Excel 导入时 |
