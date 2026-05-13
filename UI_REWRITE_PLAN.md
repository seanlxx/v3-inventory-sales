# V3 UI 精细化重写计划

> 目标：在 v3 结构化数据库、D1/R2、库存服务和新 API 已切换完成的基础上，重新设计并实现一套更稳定、更清晰、更美观的前端管理系统。
>
> 本计划不是单纯“换 Nuxt”，而是同时完成三件事：前端工程架构升级、业务操作流重排、视觉皮肤与移动端体验重做。

---

## 0. 当前基线

根据当前项目状态，以下事项视为已完成，不再作为 UI 重写的前置风险反复验证：

1. v3 仓库、D1、R2 已完成切换，并已推送到 `master`。
2. 结构化数据库 schema 已存在：商品、进货、销售、库存流水、库存余额、图片资产等表已建好。
3. 远程 v3 D1 已应用完迁移，没有待应用迁移。
4. 后端库存逻辑已切到 `inventory-service`。
5. 库存真实来源为 `stock_movements`，`inventory_balances` 是缓存。
6. 前端数据层 `js/db.js` 已改用新 API：`/products`、`/inventory/purchases`、`/inventory/sales` 等。
7. 本地开发脚本默认使用 `v3-vending-inventory-sales-db`。
8. 已验证：库存服务单测通过、前端构建通过、远程 v3 表结构存在。

因此 UI 改造的重点应转到：

- 重新组织信息架构。
- 重新设计页面布局和操作路径。
- 建立视觉系统和组件系统。
- 用 Nuxt 4 + Vue 3 + TypeScript 替换当前静态前端。
- 保持 API 合同稳定，不把库存账本逻辑重新搬回浏览器。

---

## 1. 产品定位

这是一个无人售货机经营管理系统，不是营销官网，也不是展示型后台。

核心用户每天高频做这些事：

1. 看今天卖得怎么样。
2. 看哪些商品快断货。
3. 录入进货。
4. 录入销售、退款、损耗。
5. 盘点和修正库存。
6. 查看某个商品为什么库存变了。
7. 使用 AI 截图识别减少录入成本。

新的 UI 必须围绕“少出错、录入快、账本透明、移动端可用”设计，而不是围绕页面数量设计。

### 1.1 设计原则

| 原则 | 说明 |
| --- | --- |
| 账本优先 | 每一次库存变化都能追溯到单据和流水。 |
| 操作分层 | 高频操作一屏内完成，低频配置收进设置。 |
| 服务端可信 | 库存、成本、利润、报表读服务端结果。 |
| 审核后入账 | AI 识别结果必须人工确认后才提交。 |
| 手机能用 | 进货、销售、退款、损耗、盘点都必须能在手机完成。 |
| 管理系统气质 | 信息密度高但不拥挤，克制、清晰、适合反复操作。 |

### 1.2 明确不做

1. 不做公开营销首页。
2. 不做多主题切换系统。
3. 不先引入复杂大屏风格。
4. 不做花哨但低效率的动画。
5. 不在浏览器重新实现库存账本、成本或利润计算。
6. 不把 Nuxt 迁移、视觉重做和后端 API 大改混在一起。

---

## 2. 总体改造路线

推荐分为 4 个阶段，避免一次性推翻导致业务不可用。

| 阶段 | 目标 | 产出 | 是否影响线上 |
| --- | --- | --- | --- |
| P0 设计锁定 | 锁定 IA、视觉方向、组件清单、API 合同 | 文档、线框、设计 token | 否 |
| P1 旧 UI 精修兜底 | 当前静态 UI 保持可用，修明显业务断点 | 旧 UI 小修、真实数据验证 | 是 |
| P2 Nuxt 骨架并行开发 | 新 UI 在独立目录开发，不影响旧页面 | Nuxt 4 项目、组件库、页面骨架 | 否 |
| P3 页面逐个替换 | 按业务风险逐页切换到新 UI | 商品、库存、进货、销售、仪表盘、设置 | 是 |
| P4 收尾和固化 | 移除旧前端，完善 QA 与部署文档 | 清理旧代码、验收记录 | 是 |

### 2.1 阶段 P0：设计锁定

目标：先把新 UI 的方向定清楚，再写代码。

必须完成：

1. 写清每个页面的主任务、次任务和禁区。
2. 锁定整体导航结构。
3. 锁定视觉皮肤：颜色、字体、间距、圆角、阴影、状态色。
4. 锁定数据表格、弹窗、抽屉、表单、上传、AI 审核的交互规则。
5. 写 `API_CONTRACT.md` 或在现有 API 文档中补齐前端消费合同。
6. 输出移动端 375px、390px、430px 的布局规则。

验收：

- 不需要跑构建。
- 需要人工检查文档是否覆盖 6 个核心页面和库存链路。

### 2.2 阶段 P1：旧 UI 精修兜底

目标：在 Nuxt 完成前，旧 UI 仍能可靠使用。

只做必要修复：

1. 修正旧 UI 和新 API 之间的明显字段不匹配。
2. 移除或禁用旧页面里的直接库存编辑入口。
3. 把删除操作改为“作废 / 归档 / 撤销”文案。
4. 确保旧 UI 的进货、销售、退款、损耗能走新 API。
5. 修复手机端明显遮挡和横向溢出问题。

不做：

- 不重构整套 `js/*.js`。
- 不把旧 UI 做成最终视觉稿。
- 不在旧 UI 上叠加大量新组件。

### 2.3 阶段 P2：Nuxt 骨架并行开发

目标：新前端以独立骨架开发，先跑通基础壳、路由、认证、API 封装和组件系统。

推荐目录：

```text
frontend/
├── app/
│   ├── app.vue
│   ├── layouts/
│   │   ├── default.vue
│   │   └── auth.vue
│   ├── pages/
│   │   ├── index.vue
│   │   ├── dashboard.vue
│   │   ├── products.vue
│   │   ├── inventory.vue
│   │   ├── purchases.vue
│   │   ├── sales.vue
│   │   └── settings.vue
│   ├── components/
│   ├── composables/
│   ├── stores/
│   ├── types/
│   ├── assets/
│   └── utils/
├── nuxt.config.ts
├── package.json
└── tsconfig.json
```

如果最终决定不使用 `frontend/` 子目录，也可以把 Nuxt 项目放在根目录，但要在实施前先更新构建脚本和 Cloudflare Pages 输出目录。

### 2.4 阶段 P3：页面逐个替换

推荐替换顺序：

| 顺序 | 页面 | 原因 |
| --- | --- | --- |
| 1 | 登录 / AppShell | 所有页面依赖它，先定框架。 |
| 2 | 商品 | 主数据风险低，适合验证表格、表单、图片。 |
| 3 | 库存 | v3 新核心，先让库存余额和流水可见。 |
| 4 | 进货 | 入库链路影响库存，需要基于库存页验证结果。 |
| 5 | 销售 | 出库、退款、损耗更复杂，放在进货后。 |
| 6 | 仪表盘 | 依赖前面报表和聚合接口稳定。 |
| 7 | 设置 | 低频页面最后做，避免阻塞主链路。 |

每替换一个页面都要完成：

1. 页面可独立访问。
2. 真实数据可加载。
3. 主操作可提交。
4. loading、empty、error 状态完整。
5. 手机 375px、390px、430px 无横向页面溢出。
6. 不改动库存服务逻辑。

### 2.5 阶段 P4：收尾

完成：

1. 删除旧静态 UI 中不再使用的页面逻辑。
2. 清理重复样式和无效构建脚本。
3. 更新 `AGENTS.md`、开发命令和部署说明。
4. 补一轮端到端验收记录。
5. 确认 Cloudflare Pages 自动部署路径正确。

---

## 3. 新信息架构

保留 6 个核心页面，但页面职责需要重排。

| 页面 | 主要问题 | 新职责 | 高频操作 |
| --- | --- | --- | --- |
| 仪表盘 | 看经营态势 | 销售、利润、库存风险、异常提醒 | 切月份、看低库存、看趋势 |
| 商品 | 管主数据 | 商品资料、售价、分类、图片、归档 | 新增、编辑、查看商品流水 |
| 库存 | 看库存真相 | 当前库存、库存流水、低库存、盘点调整 | 筛选、盘点、查看来源 |
| 进货 | 入库 | 进货单、明细、截图、撤销 | 新建进货单、AI 识别、确认入账 |
| 销售 | 出库和异常 | 销售、退款、损耗、撤销 | 录销售、识别截图、登记退款/损耗 |
| 设置 | 低频配置 | 账号、机器、分类、AI provider、业务参数 | 改密码、改 AI key、调整阈值 |

### 3.1 导航结构

桌面端：

```text
左侧固定导航
├── 仪表盘
├── 商品
├── 库存
├── 进货
├── 销售
└── 设置

顶部工具栏
├── 当前月份 / 日期范围
├── 全局搜索
├── 快捷新增
├── 同步状态 / API 状态
└── 账号菜单
```

移动端：

```text
顶部栏
├── 页面标题
├── 月份切换
└── 更多菜单

底部导航
├── 仪表盘
├── 商品
├── 库存
├── 进货
└── 销售

设置放入右上角更多菜单
```

说明：

- 移动端底部导航只放高频页面。
- 设置不是高频入口，不占底部导航位置。
- “新增销售 / 新增进货”可以使用页面内固定主按钮，不做全局悬浮按钮遮挡表格。

---

## 4. 视觉皮肤方向

推荐视觉方向：**清爽的经营控制台**。

关键词：

- 干净、准确、可信。
- 类似财务账本和仓储系统，但比传统后台更轻。
- 强调数字、状态和可追溯性。
- 避免营销感、玻璃拟态、大面积渐变和过度卡片化。

### 4.1 色彩系统

不使用整站蓝紫渐变。采用中性色底 + 明确业务色。

| Token | 用途 | 建议色值 |
| --- | --- | --- |
| `--color-bg` | 页面底色 | `#F6F8FB` |
| `--color-surface` | 面板 / 表格底 | `#FFFFFF` |
| `--color-surface-muted` | 弱面板 | `#F1F4F8` |
| `--color-border` | 分割线 | `#D9E0EA` |
| `--color-text` | 主文本 | `#172033` |
| `--color-text-muted` | 次文本 | `#6B7280` |
| `--color-primary` | 主操作 | `#2563EB` |
| `--color-primary-strong` | 主操作 hover | `#1D4ED8` |
| `--color-inbound` | 入库 / 增加 | `#168A4A` |
| `--color-outbound` | 出库 / 减少 | `#B42318` |
| `--color-warning` | 低库存 / 待处理 | `#C77700` |
| `--color-info` | 系统提示 | `#0F766E` |
| `--color-danger` | 作废 / 删除类 | `#C2410C` |

深浅层级：

1. 页面背景只作为承托，不抢内容。
2. 表格和表单使用白色或极浅灰。
3. 主按钮使用蓝色。
4. 入库、出库、退款、损耗使用业务状态色，不用同一种蓝色表达所有状态。
5. 图表颜色最多 5 组，避免彩虹盘。

### 4.2 字体系统

中文管理系统优先保证可读性和数字对齐。

建议：

```text
中文正文：HarmonyOS Sans SC / Noto Sans SC / Microsoft YaHei UI
数字：DIN-like numeric stack 或 font-variant-numeric: tabular-nums
代码 / ID：ui-monospace, SFMono-Regular, Consolas
```

规则：

1. 不使用过细字重。
2. 统计数字使用等宽数字，便于纵向比较。
3. 表格字号桌面端 13px-14px，移动端 14px。
4. 页面标题不要做成营销大标题。
5. 不按 viewport 动态缩放字体。

### 4.3 间距和圆角

| 类型 | 建议 |
| --- | --- |
| 页面内边距 | 桌面 24px，平板 20px，手机 12px-16px |
| 面板间距 | 16px-20px |
| 表格行高 | 桌面 44px-48px，移动端 48px |
| 按钮高度 | 最小 40px，移动端最小点击区 44px |
| 圆角 | 普通控件 6px，面板 8px，弹窗 8px |
| 阴影 | 只用于弹窗、抽屉、顶部栏，不给每个面板加重阴影 |

禁止：

- 卡片套卡片。
- 页面 section 全部做成漂浮卡片。
- 大面积装饰性渐变球、光斑和纯装饰背景。

### 4.4 图标和状态

使用图标时的规则：

1. 按钮中的常用操作使用图标：新增、编辑、上传、搜索、筛选、作废、下载、刷新。
2. 图标只辅助识别，关键危险操作必须有文字。
3. 未知图标必须有 tooltip。
4. 状态 badge 要短：`正常`、`低库存`、`已作废`、`待确认`、`异常`。
5. 库存变化使用 `+12`、`-3` 这种符号，不只靠颜色。

### 4.5 动效

管理系统只保留功能性动效：

1. 抽屉、弹窗进入退出 120ms-180ms。
2. 表格行 hover、按钮 hover 轻微变化。
3. loading 使用骨架屏或 inline spinner。
4. AI 识别过程可以使用步骤进度，但不做夸张动画。
5. 所有动效支持 `prefers-reduced-motion`。

---

## 5. 布局系统

### 5.1 AppShell

桌面端布局：

```text
┌─────────────────────────────────────────────────────────────┐
│ Topbar: 当前页面 / 月份 / 搜索 / 快捷操作 / 账号             │
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │ Page content                                 │
│ 220px        │ max width none, dense workspace              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

规则：

- Sidebar 宽度固定 220px。
- 内容区不做居中窄版，管理系统应充分使用横向空间。
- 页面头部包含标题、说明、主筛选和主操作。
- 页面主体以表格、分栏、抽屉为主，不使用营销式 hero。

移动端布局：

```text
┌──────────────────────┐
│ Mobile topbar         │
├──────────────────────┤
│ Page filters          │
├──────────────────────┤
│ Main content          │
├──────────────────────┤
│ Bottom nav            │
└──────────────────────┘
```

规则：

- 顶部栏固定或 sticky，但高度控制在 56px。
- 底部导航高度 56px-64px，额外加 `env(safe-area-inset-bottom)`。
- 页面内容底部 padding 必须避开底部导航。
- 手机端表格使用横向滚动容器，不把整页撑破。

### 5.2 页面头部

每个页面统一结构：

```text
PageHeader
├── title
├── description / key status
├── primary action
└── compact filters
```

示例：

| 页面 | 主按钮 | 次操作 |
| --- | --- | --- |
| 商品 | 新增商品 | 导入、筛选、归档筛选 |
| 库存 | 盘点调整 | 低库存、重建缓存、导出 |
| 进货 | 新建进货单 | AI 识别、上传截图、作废筛选 |
| 销售 | 新建销售单 | 识别销售、退款、损耗 |
| 设置 | 保存设置 | 测试 AI provider |

### 5.3 表格布局

桌面端：

- 表头 sticky。
- 行高稳定。
- 操作列固定在右侧。
- 数字列右对齐。
- 名称列左对齐。
- 状态列居中或左对齐，保持一致。

移动端：

- 表格外层 `.table-scroll` 横向滚动。
- 表格最小宽度按内容设置，不强行挤压。
- 常用操作可放在行内更多菜单。
- 列数太多时提供“详情抽屉”，不要把所有字段塞进手机表格。

### 5.4 表单布局

桌面端：

- 弹窗宽度 520px-720px。
- 多明细单据使用抽屉或全屏 dialog，宽度 960px-1120px。
- 金额、数量、单价字段横向排列。

移动端：

- 弹窗改为 bottom sheet 或全屏 dialog。
- 输入项单列堆叠。
- 底部固定提交栏，避开安全区。
- 数字输入使用合适的 `inputmode`。

---

## 6. 页面详细设计

### 6.1 仪表盘

目标：让用户 30 秒内知道经营状态和异常。

桌面布局：

```text
PageHeader（月度筛选）
├── KPI strip：销售额 / 毛利 / 利润率 / 进货成本 / 退款
├── 左：7/30 天销售趋势
├── 右：库存风险榜
├── 左：售货机销售分布
└── 右：最近异常单据 / 低库存提醒
```

移动布局：

```text
KPI 横向滚动
趋势图
库存风险
最近异常
```

需要展示：

1. 今日销售额。
2. 本月销售额。
3. 本月毛利。
4. 利润率。
5. 本月进货成本。
6. 退款金额。
7. 低库存商品数。
8. 近 7 天销售趋势。
9. 售货机销售排行。

接口建议：

```text
GET /api/reports/dashboard?month=YYYY-MM
GET /api/reports/sales-trend?days=7
GET /api/reports/low-stock
```

UI 规则：

- 仪表盘只读服务端聚合结果。
- KPI 数字需要 skeleton loading。
- 趋势图缺数据时显示空状态，不显示断裂图。
- 库存风险点击进入库存页并带筛选条件。

### 6.2 商品页

目标：管理商品主数据，不直接改库存。

桌面布局：

```text
PageHeader：新增商品
Toolbar：搜索 / 分类 / 售货机 / 状态
ProductTable
ProductFormDialog
ProductHistoryDrawer
```

表格列：

| 列 | 说明 |
| --- | --- |
| 图片 | 商品图或占位 |
| 名称 | 商品名称、规格 |
| 分类 | 分类 badge |
| 售货机 | 所属机器 |
| 售价 | 当前售价 |
| 库存 | 只读余额，低库存标记 |
| 状态 | 正常 / 已归档 |
| 操作 | 编辑、流水、归档 |

允许：

1. 新增商品。
2. 编辑名称、分类、规格、售价、售货机、图片。
3. 归档商品。
4. 查看商品库存流水。
5. 从商品发起盘点调整。

不允许：

1. 直接编辑 `currentStock`。
2. 直接编辑 `avgCost`。
3. 直接编辑累计进货数量和成本。

移动端：

- 商品列表可使用紧凑 list，但必须保留库存、售价、状态。
- 复杂列进入详情抽屉。
- 新增/编辑表单全屏。

### 6.3 库存页

目标：成为 v3 的库存真相页。

桌面布局：

```text
PageHeader：盘点调整
Filters：售货机 / 分类 / 低库存 / 搜索
左：InventoryBalanceTable
右：选中商品 StockMovementTimeline
```

如果屏幕宽度不足：

```text
库存表
点击行 -> 库存流水抽屉
```

模块：

1. 当前库存表。
2. 低库存筛选。
3. 售货机筛选。
4. 分类筛选。
5. 库存流水时间线。
6. 盘点调整。
7. 库存差异提示。
8. 库存缓存重建入口，仅管理员显示。

接口建议：

```text
GET  /api/inventory/balances
GET  /api/inventory/movements?productId=xxx
POST /api/inventory/adjustments
POST /api/inventory/rebuild-balances
```

库存流水显示字段：

| 字段 | 说明 |
| --- | --- |
| 时间 | 业务发生时间 |
| 类型 | 进货 / 销售 / 退款 / 损耗 / 盘点 / 撤销 |
| 数量变化 | `+n` 或 `-n` |
| 关联单据 | 可点击查看 |
| 操作人 | 如后端支持则展示 |
| 备注 | 盘点原因或异常说明 |

关键规则：

- 库存页可以发起盘点调整，但不能静默改余额。
- 所有调整都生成库存流水。
- 低库存提示要说明阈值来源。

### 6.4 进货页

目标：以“进货单”为中心完成入库。

桌面布局：

```text
PageHeader：新建进货单 / AI 识别
Toolbar：月份 / 供应商或备注搜索 / 状态
PurchaseOrderTable
PurchaseOrderDrawer
PurchaseAiReviewDialog
```

进货单流程：

```text
创建进货单
  |
添加多个商品明细
  |
上传截图或手动输入
  |
校验数量、单价、总价
  |
确认提交
  |
后端创建进货单、明细、库存流水、库存余额缓存
```

进货单字段：

| 字段 | 说明 |
| --- | --- |
| 进货日期 | 默认今天，可修改 |
| 图片 | R2 图片资产 |
| 商品明细 | 商品、数量、单价、小计 |
| 总金额 | 前端仅用于展示校验，提交后以服务端结果为准 |
| 备注 | 供应商、平台、特殊情况 |
| 状态 | 正常 / 已作废 |

接口建议：

```text
POST /api/inventory/purchases
PUT  /api/inventory/purchases/:id
POST /api/inventory/purchases/:id/void
GET  /api/inventory/purchases?month=YYYY-MM
```

UI 规则：

- “删除”统一改为“作废”。
- 作废时展示影响：哪些商品库存会减少多少。
- 已作废单据保留可查看，不默认隐藏。
- AI 识别后必须进入确认表格，不直接入账。

### 6.5 销售页

目标：清晰区分销售、退款、损耗，不再用负数混在一起。

桌面布局：

```text
PageHeader：新建销售单
SegmentedControl：销售 / 退款 / 损耗
Toolbar：月份 / 售货机 / 商品 / 状态
SalesOrderTable
SalesOrderDrawer
SalesAiReviewDialog
RefundDialog
LossDialog
```

核心操作：

1. 创建销售单。
2. AI 识别销售截图。
3. 创建退款单。
4. AI 识别退款截图。
5. 登记损耗。
6. 作废单据。

接口建议：

```text
POST /api/inventory/sales
POST /api/inventory/refunds
POST /api/inventory/losses
POST /api/inventory/sales/:id/void
GET  /api/inventory/sales?month=YYYY-MM&type=sale|refund|loss
```

销售单校验：

| 场景 | UI 行为 |
| --- | --- |
| 库存不足 | 提交前阻止，显示当前可售库存 |
| 商品已归档 | 不允许新建，历史单据可查看 |
| 金额异常 | 提醒但不自行改价 |
| 重复截图 | 如后端支持 hash 检测，则展示警告 |

移动端：

- 销售、退款、损耗使用顶部 segmented control。
- 明细编辑器使用全屏表单。
- 提交按钮固定底部。
- 多商品销售使用“添加一行”模式，避免小屏复杂表格。

### 6.6 设置页

目标：集中低频配置，避免干扰主操作。

模块：

1. 账号与密码。
2. 售货机列表。
3. 商品分类。
4. AI provider。
5. 业务参数：
   - 平台费率。
   - 低库存阈值。
   - 补货目标天数。
6. 安全设置：
   - 登录态管理。
   - 会话过期。
   - 登录失败限制展示。

AI provider 设置：

- API Key 输入框必须是 password 类型。
- 不在前端日志输出 key。
- 测试连接只展示成功/失败，不展示完整敏感响应。

---

## 7. AI 识别体验

AI 识别是辅助录入，不是自动记账。

统一流程：

```text
上传截图
  |
前端创建 image asset 或临时上传
  |
调用 AI 识别
  |
展示候选明细
  |
用户匹配商品、修正数量、单价、金额
  |
前端展示库存和金额警告
  |
用户确认
  |
调用正式业务 API 入账
```

AI 审核表格字段：

| 字段 | 说明 |
| --- | --- |
| 原始识别名称 | AI 从截图识别出的名称 |
| 匹配商品 | 用户选择系统商品 |
| 置信度 | 高 / 中 / 低 |
| 数量 | 可编辑 |
| 单价 | 可编辑 |
| 总价 | 自动展示 |
| 异常 | 未匹配、库存不足、金额异常 |
| 图片定位 | 如后端支持，显示来源区域 |

异常处理：

1. 未匹配商品不能提交。
2. 库存不足的销售不能提交。
3. 低置信度项需要醒目标记。
4. AI 返回空结果时显示可手动录入入口。
5. AI 请求失败时保留已上传图片和用户输入。

---

## 8. 前端技术架构

### 8.1 技术选型

| 类型 | 建议 |
| --- | --- |
| 框架 | Nuxt 4 + Vue 3 |
| 语言 | TypeScript |
| 状态管理 | Pinia，仅放登录态和跨页面筛选 |
| 数据请求 | `useFetch` / `useAsyncData` + 自定义 `useApi` |
| 表单 | 先用轻量自研表单组件，避免过早引入重型表单库 |
| 图表 | 先用轻量 SVG/Canvas 或小型图表库，不先上大图表平台 |
| 样式 | CSS variables + scoped CSS / CSS modules |
| 图标 | 优先使用稳定图标库，按钮图标统一尺寸 |
| 测试 | Vitest 单测 + Playwright 关键路径 |

### 8.2 目录规划

```text
frontend/app/
├── components/
│   ├── app/
│   ├── common/
│   ├── dashboard/
│   ├── products/
│   ├── inventory/
│   ├── purchases/
│   ├── sales/
│   └── settings/
├── composables/
│   ├── useApi.ts
│   ├── useAuth.ts
│   ├── useProducts.ts
│   ├── useInventory.ts
│   ├── usePurchases.ts
│   ├── useSales.ts
│   ├── useReports.ts
│   ├── useToast.ts
│   └── useConfirm.ts
├── stores/
│   ├── auth.ts
│   ├── app.ts
│   └── filters.ts
├── types/
│   ├── api.ts
│   ├── product.ts
│   ├── inventory.ts
│   ├── purchase.ts
│   ├── sale.ts
│   ├── settings.ts
│   └── report.ts
├── utils/
│   ├── format.ts
│   ├── money.ts
│   ├── date.ts
│   └── validation.ts
└── assets/
    └── css/
        ├── tokens.css
        ├── base.css
        ├── layout.css
        └── components.css
```

### 8.3 页面和组件边界

页面只负责：

1. 读取路由 query。
2. 调用 composable 获取数据。
3. 组合页面组件。
4. 处理页面级 loading、empty、error。

组件负责：

1. 呈现表格、表单、弹窗和抽屉。
2. 发出事件，不直接写复杂业务流程。
3. 不重复实现 API 请求。

Composable 负责：

1. 封装 API 调用。
2. 统一错误处理。
3. 映射前端类型。
4. 暴露刷新方法。

### 8.4 状态管理边界

| 数据 | 放哪里 | 原因 |
| --- | --- | --- |
| 登录用户 | `stores/auth.ts` | 全局需要 |
| 当前月份 | URL query + `stores/filters.ts` | 可分享、可刷新恢复 |
| 表格数据 | 页面 `useAsyncData` | 避免全局缓存混乱 |
| 弹窗表单 | 组件本地 state | 生命周期短 |
| AI 识别临时结果 | 审核弹窗本地 state | 未入账，不应全局持久 |
| toast / confirm | `useToast` / `useConfirm` | 全局 UI 服务 |

不允许：

- 把所有商品、进货、销售长期放进一个全局 store。
- 在 Pinia 里写库存计算逻辑。
- 通过前端缓存推断最终库存。

---

## 9. API 前端封装

所有请求必须通过 `useApi.ts`。

职责：

1. 自动带登录 token。
2. 自动处理 401 并跳登录。
3. 统一处理 D1 bookmark。
4. 统一错误结构。
5. 统一 loading 和 toast 入口。
6. 支持请求取消，页面切换不污染状态。

建议响应结构：

```ts
type ApiResult<T> = {
  data: T
  meta?: {
    bookmark?: string
    cursor?: string
    total?: number
  }
}
```

建议错误结构：

```ts
type ApiError = {
  code: string
  message: string
  details?: unknown
}
```

前端 API composable：

```text
useProducts()
├── listProducts(filters)
├── createProduct(payload)
├── updateProduct(id, payload)
├── archiveProduct(id)
└── getProductMovements(id)

useInventory()
├── listBalances(filters)
├── listMovements(filters)
├── createAdjustment(payload)
└── rebuildBalances()

usePurchases()
├── listPurchases(filters)
├── createPurchase(payload)
├── updatePurchase(id, payload)
└── voidPurchase(id, reason)

useSales()
├── listSales(filters)
├── createSale(payload)
├── createRefund(payload)
├── createLoss(payload)
└── voidSale(id, reason)
```

---

## 10. 组件系统

### 10.1 通用组件

```text
components/common/
├── AppButton.vue
├── AppIconButton.vue
├── AppInput.vue
├── AppSelect.vue
├── AppTextarea.vue
├── AppDatePicker.vue
├── AppSegmentedControl.vue
├── AppBadge.vue
├── AppTooltip.vue
├── AppDialog.vue
├── AppDrawer.vue
├── AppBottomSheet.vue
├── AppToastHost.vue
├── AppConfirmDialog.vue
├── DataTable.vue
├── DataTableToolbar.vue
├── TableScroll.vue
├── EmptyState.vue
├── ErrorState.vue
├── LoadingSkeleton.vue
├── MonthPicker.vue
├── MachineFilter.vue
├── ProductPicker.vue
├── ImageUploader.vue
├── MoneyText.vue
├── QuantityDelta.vue
└── StatusBadge.vue
```

### 10.2 业务组件

```text
components/products/
├── ProductTable.vue
├── ProductFormDialog.vue
├── ProductImageCell.vue
├── ProductHistoryDrawer.vue
└── ProductArchiveDialog.vue

components/inventory/
├── InventoryBalanceTable.vue
├── InventoryFilters.vue
├── StockMovementTimeline.vue
├── StockAdjustmentDialog.vue
├── LowStockPanel.vue
└── RebuildBalancesDialog.vue

components/purchases/
├── PurchaseOrderTable.vue
├── PurchaseOrderDrawer.vue
├── PurchaseItemsEditor.vue
├── PurchaseAiReviewDialog.vue
└── PurchaseVoidDialog.vue

components/sales/
├── SalesOrderTable.vue
├── SalesOrderDrawer.vue
├── SalesItemsEditor.vue
├── RefundDialog.vue
├── LossDialog.vue
├── SalesAiReviewDialog.vue
└── SalesVoidDialog.vue
```

### 10.3 DataTable 规范

DataTable 必须支持：

1. loading 状态。
2. empty 状态。
3. error 状态。
4. server pagination。
5. sticky header。
6. 数字列右对齐。
7. 操作列固定。
8. 移动端横向滚动。
9. 行点击打开详情。
10. 批量操作预留，但不在第一版强做。

---

## 11. 表单和校验规则

### 11.1 通用表单

规则：

1. 必填项显示明确标记。
2. 错误提示紧贴字段。
3. 金额统一两位小数展示。
4. 数量必须是整数，除非业务明确支持小数。
5. 提交中禁用重复提交。
6. 提交失败保留用户输入。
7. 作废类操作必须输入原因或确认影响范围。

### 11.2 单据明细编辑器

进货、销售、退款、损耗都使用同一套明细编辑思路：

```text
单据基础信息
明细表
合计栏
校验警告
提交栏
```

明细行字段：

| 场景 | 字段 |
| --- | --- |
| 进货 | 商品、数量、进货单价、小计 |
| 销售 | 商品、数量、销售单价、小计 |
| 退款 | 原销售或商品、数量、退款金额 |
| 损耗 | 商品、数量、损耗原因 |

---

## 12. 移动端专项要求

必须覆盖宽度：

```text
375px
390px
430px
```

必须检查页面：

1. 仪表盘。
2. 商品。
3. 库存。
4. 进货。
5. 销售。
6. 设置。

硬性要求：

| # | 要求 |
| --- | --- |
| 1 | 页面本身不能横向溢出。 |
| 2 | 表格必须在内部横向滚动。 |
| 3 | 顶栏、底部导航、弹窗、提交栏不能互相遮挡。 |
| 4 | 所有点击区域不小于 44px。 |
| 5 | 底部留出 `env(safe-area-inset-bottom)`。 |
| 6 | 进货、销售、退款、损耗、盘点都能在手机完整提交。 |
| 7 | 图片上传和 AI 审核在手机可用。 |
| 8 | 错误提示不能被键盘或底部栏遮住。 |

移动端布局策略：

- 简单表单使用 bottom sheet。
- 复杂单据使用全屏 dialog。
- 表格详情用 drawer 或新页面。
- 筛选项默认折叠为筛选按钮。
- 批量操作不作为移动端第一优先级。

---

## 13. 可访问性与可用性

基础要求：

1. 所有可点击元素可键盘聚焦。
2. 弹窗打开后焦点进入弹窗，关闭后回到触发按钮。
3. 表单错误可被屏幕阅读器读到。
4. 颜色不是唯一状态表达，必须有文字或符号。
5. 图标按钮必须有 `aria-label`。
6. 图表必须有文本摘要或关键数字。
7. 支持 `prefers-reduced-motion`。

中文文案：

- 用业务语言，不用技术语言。
- 错误文案要说明用户下一步能做什么。
- 危险操作说明影响范围，例如“作废后将回滚 3 个商品的库存变化”。

---

## 14. 性能要求

目标：

1. 首屏不加载全量业务数据。
2. 表格使用服务端分页。
3. 图片缩略图使用 R2 缩略资源或固定尺寸。
4. AI 识别弹窗按需加载。
5. 图表组件按页面拆包。
6. 表格滚动不触发大量重排。

建议指标：

| 指标 | 目标 |
| --- | --- |
| 首屏 JS | 第一版控制在合理范围，避免一次引入大型 UI 全家桶 |
| 表格请求 | 默认分页 20-50 条 |
| 图片 | 列表只加载缩略图 |
| 操作反馈 | 主操作 100ms 内进入 loading |
| 页面切换 | 有 skeleton 或保留上一页状态 |

---

## 15. 验收标准

### 15.1 功能验收

1. 可以新增商品。
2. 可以编辑商品主数据。
3. 商品不能直接改库存。
4. 可以创建进货单，库存增加。
5. 可以作废进货单，库存回滚。
6. 可以创建销售单，库存减少。
7. 库存不足时不能提交销售。
8. 可以创建退款单，库存回增。
9. 可以登记损耗，库存减少。
10. 可以作废销售、退款、损耗。
11. 可以盘点调整库存。
12. 库存页能看到每一次库存变化来源。
13. 商品归档后历史报表不变。
14. 仪表盘数字与服务端报表一致。
15. AI 识别结果必须人工确认后入账。

### 15.2 UI 验收

1. 375px、390px、430px 无页面横向溢出。
2. 所有弹窗手机可用。
3. 所有主操作有 loading 状态。
4. 所有失败请求有明确错误提示。
5. 空数据页面不出现空白。
6. 表格在手机可横向滚动。
7. 危险操作有二次确认。
8. 状态色和状态文案一致。
9. 页面中不存在卡片套卡片。
10. 表格、按钮、输入框尺寸稳定，不因内容变化跳动。

### 15.3 数据验收

1. 前端不出现直接修改库存字段的代码。
2. 前端不重新计算库存余额。
3. 前端不重新计算全局平均成本。
4. 所有库存变化都能在库存流水中找到。
5. 刷新页面后数据和提交结果一致。
6. 作废单据后相关库存流水可追踪。

### 15.4 回归验收

每次替换页面后执行：

```text
构建
真实数据本地服务
桌面浏览器检查
移动端 375 / 390 / 430 检查
关键业务提交
刷新后复查数据
```

文档修改不需要执行以上构建和浏览器验证。

---

## 16. 具体执行清单

### 16.1 设计与文档

| 顺序 | 工作 | 产物 |
| --- | --- | --- |
| 1 | 锁定 API 合同 | `API_CONTRACT.md` |
| 2 | 锁定视觉 token | `tokens.css` 草案 |
| 3 | 画页面线框 | 6 个页面 wireframe |
| 4 | 定组件清单 | 组件边界文档 |
| 5 | 定移动端规则 | 移动端验收清单 |

### 16.2 Nuxt 基础

| 顺序 | 工作 |
| --- | --- |
| 1 | 创建 Nuxt 4 项目骨架 |
| 2 | 配置 TypeScript、lint、build |
| 3 | 接入 Cloudflare Pages 构建路径 |
| 4 | 实现 AppShell、路由、登录态 |
| 5 | 实现 `useApi`、错误处理、toast、confirm |
| 6 | 建立 CSS tokens 和基础组件 |

### 16.3 页面迁移

| 顺序 | 页面 | 验收重点 |
| --- | --- | --- |
| 1 | 商品 | 主数据、图片、归档、不能改库存 |
| 2 | 库存 | 余额、流水、低库存、盘点 |
| 3 | 进货 | 多明细、AI 审核、作废回滚 |
| 4 | 销售 | 销售、退款、损耗、库存不足 |
| 5 | 仪表盘 | 服务端报表、趋势、风险 |
| 6 | 设置 | 账号、分类、机器、AI provider |

### 16.4 收尾

| 顺序 | 工作 |
| --- | --- |
| 1 | 删除旧 UI 未使用代码 |
| 2 | 更新构建脚本和部署说明 |
| 3 | 补 Playwright 关键路径 |
| 4 | 跑完整真实数据验收 |
| 5 | 提交并推送 `master` |

---

## 17. 风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| Nuxt 构建与 Pages Functions 路由冲突 | `/api/*` 或静态资源路径异常 | 先在本地 wrangler pages dev 验证路由 |
| 新旧 UI 共存时间过长 | 两套入口维护成本高 | 每页替换后删除对应旧逻辑 |
| 表格组件过度抽象 | 页面特殊需求难实现 | DataTable 只抽通用能力，业务列留给页面 |
| 移动端单据编辑复杂 | 弹窗遮挡、表格难用 | 复杂单据手机用全屏 dialog，不用压缩表格 |
| AI 识别误入账 | 识别错误直接影响库存 | AI 结果永远进入确认表，不直接提交 |
| 前端重新计算库存 | 与服务端账本不一致 | 代码 review 明确禁止库存计算逻辑 |
| 视觉过度装饰 | 管理效率下降 | 使用克制控制台风格，装饰让位于数据 |

---

## 18. 第一版推荐范围

第一版新 UI 不追求一次做完所有增强，优先交付稳定主链路。

必须做：

1. AppShell。
2. 登录态。
3. 商品页。
4. 库存页。
5. 进货页。
6. 销售页。
7. 基础仪表盘。
8. 设置页基础配置。
9. AI 识别确认流程。
10. 移动端主链路可用。

可以后置：

1. 高级图表。
2. 批量导入导出。
3. 多角色权限。
4. 审计日志高级筛选。
5. 复杂自定义报表。
6. 多主题。
7. 离线模式。

---

## 19. 最终完成标准

当以下条件全部满足，才认为 UI 重写完成：

1. 生产入口已切到 Nuxt 新 UI。
2. 旧静态 UI 不再作为主入口。
3. 商品、库存、进货、销售、仪表盘、设置 6 个页面全部可用。
4. 进货、销售、退款、损耗、盘点全部走服务端库存 API。
5. 前端没有直接修改库存字段的逻辑。
6. 移动端 375px、390px、430px 全页面通过检查。
7. 真实 v3 数据下关键路径验证通过。
8. 构建通过。
9. 已提交并推送到 `master`。

