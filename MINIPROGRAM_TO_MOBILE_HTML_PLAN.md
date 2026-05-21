# 小程序改造成移动 HTML 计划书

## 1. 目标

将 `C:\Users\Admin\WeChatProjects\minicode-1` 中的微信小程序体验迁移为 v3 Nuxt 前端的移动端 HTML 体验，后端继续复用现有 Cloudflare Pages Functions、D1、R2，不新增独立后端。

目标不是把桌面端压缩到手机屏幕，而是在移动浏览器中复刻小程序的信息架构、视觉语言和操作路径，达到约 90% 相似度。

## 2. 90% 相似度定义

相似度按 100 分验收，达到 90 分视为通过：

| 维度 | 分值 | 验收口径 |
| --- | ---: | --- |
| 页面结构 | 20 | 登录、首页、仪表盘、商品、库存、进货、进货 AI、进货详情、销售、销售 AI、销售详情、设置均能对应到 HTML 页面或移动全屏视图 |
| 视觉系统 | 25 | 背景、卡片、圆角、边框、阴影、主色、字号、间距与小程序保持同一视觉节奏 |
| 组件形态 | 20 | 顶部导航、底部 Tab、卡片列表、状态标签、搜索框、主按钮、次按钮、图片预览、详情信息行保持一致 |
| 交互路径 | 15 | Tab 切换、返回、搜索、进入详情、AI 识别、提交、退出登录等路径与小程序一致 |
| 数据内容 | 10 | 字段展示、状态文案、金额/日期/数量格式与小程序一致 |
| 移动可用性 | 10 | 375/390/430px 无横向溢出，底部安全区不遮挡，触控目标不小于 44px |

不强求完全一致的部分：微信胶囊按钮、原生 TabBar 动效、小程序页面栈动画、微信专有授权弹窗。HTML 端用浏览器可实现的等价交互替代。

## 3. 现状依据

小程序已形成一套清晰移动端结构：

- 全局视觉：`#f6f8fb` 页面背景、白色卡片、`#2563eb` 主色、`#172033` 正文、`#6b7280` 次级文字、16rpx 卡片圆角、88rpx 按钮高度。
- 全局组件：`navigation-bar`、`app-card`、`status-badge`、`data-row`、`app-empty`、`app-loading`。
- 页面清单：`login`、`index`、`dashboard`、`products`、`inventory`、`purchases`、`purchase-ai`、`purchase-detail`、`sales`、`sale-ai`、`sale-detail`、`settings`。
- 主导航：底部 5 个 Tab，分别为仪表盘、商品、库存、进货、销售；设置通过页面入口或顶部操作进入。
- 数据接口：继续使用 v3 现有 `/api/auth/*`、`/api/products`、`/api/inventory/*`、`/api/reports/*`、`/api/settings`、`/api/images/*`。

当前 Nuxt 前端已经有可复用基础：

- `frontend/app/components/app/AppShell.vue` 已有移动端底部导航和安全区处理。
- `frontend/app/composables/` 已有业务 API 封装。
- `frontend/app/components/common/` 已有按钮、输入框、弹窗、抽屉、状态标签、表格。
- 6 个核心业务页面已存在，可在移动断点下增加小程序式卡片视图。

## 4. 技术路线

推荐采用“同一套 Nuxt 页面，移动断点切换小程序式视图”的路线。

理由：

- 避免维护两套业务数据流。
- 保留桌面端现有表格和管理效率。
- 移动端只在 `max-width: 760px` 下替换呈现形态，风险可控。
- 符合现有 `AppShell` 移动底部导航设计。

实施策略：

1. 统一设计 token，把小程序 `rpx` 视觉换算为 HTML CSS 变量。
2. 强化 `AppShell` 移动模式，顶部栏、底部 Tab、设置入口对齐小程序。
3. 各业务页保留桌面端组件，移动端新增卡片列表和全屏详情/AI 识别视图。
4. 复用现有 composables，不重写 API URL，不改 D1 schema。
5. 仅在必须时新增移动专用小组件，例如 `MobileCard`、`MobileDataRow`、`MobilePageHeader`。

## 5. 页面映射

| 小程序页面 | HTML/Nuxt 承接方式 | 主要改动点 |
| --- | --- | --- |
| `pages/login/login` | 现有登录门禁或新增 `/login` 移动页 | 做成小程序同款顶部栏、账号密码单列卡片、主按钮 |
| `pages/index/index` | 可新增 `/mobile` 或保留为移动工作台入口 | 6 宫格模块入口、经营摘要卡片、退出登录 |
| `pages/dashboard/dashboard` | `frontend/app/pages/dashboard.vue` | KPI 横向卡片、摘要图表卡、错误/加载卡片 |
| `pages/products/products` | `frontend/app/pages/products.vue` | 搜索框 + 商品卡片列表，移动端隐藏桌面表格 |
| `pages/inventory/inventory` | `frontend/app/pages/inventory.vue` | 搜索框 + 库存卡片，低库存状态标签，流水入口 |
| `pages/purchases/purchases` | `frontend/app/pages/purchases.vue` | AI 识别入口、搜索框、进货单卡片列表 |
| `pages/purchase-ai/purchase-ai` | 移动全屏视图或 `/purchases/ai` | 图片选择、预览、识别、候选商品编辑、提交 |
| `pages/purchase-detail/purchase-detail` | 移动全屏抽屉或 `/purchases/:id` | 单头信息、汇总行、明细卡片 |
| `pages/sales/sales` | `frontend/app/pages/sales.vue` | AI 识别入口、搜索框、销售单卡片列表 |
| `pages/sale-ai/sale-ai` | 移动全屏视图或 `/sales/ai` | 图片选择、识别、销售候选项编辑、提交 |
| `pages/sale-detail/sale-detail` | 移动全屏抽屉或 `/sales/:id` | 单头信息、金额/数量/状态、明细卡片 |
| `pages/settings/settings` | `frontend/app/pages/settings.vue` | 登录状态卡片、退出登录、修改密码入口 |

## 6. 视觉复刻规范

移动 HTML 端采用以下 token，对齐小程序视觉：

| 小程序值 | HTML 建议 |
| --- | --- |
| 页面背景 `#f6f8fb` | `--mobile-bg: #f6f8fb` |
| 正文 `#172033` | `--mobile-text: #172033` |
| 次级文字 `#6b7280` | `--mobile-muted: #6b7280` |
| 主色 `#2563eb` | `--mobile-primary: #2563eb` |
| 边框 `#d9e0ea` | `--mobile-border: #d9e0ea` |
| 卡片圆角 `16rpx` | `8px` |
| 按钮圆角 `12rpx` | `6px` |
| 按钮高度 `88rpx` | `44px` |
| 页面横向 padding `28rpx` | `14px` |
| 区块间距 `28rpx` | `14px` |

页面布局要求：

- 主内容最大宽度不限制为桌面容器，手机宽度下使用全宽。
- 顶部栏高度约 56px，白底，标题居中或左对齐需与小程序截图统一。
- 底部 Tab 固定在底部，5 等分，包含安全区 `env(safe-area-inset-bottom)`。
- 卡片使用白底、1px 边框、轻阴影；不要使用桌面端大表格作为移动主视图。
- 搜索框、表单、按钮全部单列，触控高度不低于 44px。

## 7. 实施阶段

### 阶段一：基线对齐

目标：先让 HTML 移动端的外壳像小程序。

涉及文件：

- `frontend/app/assets/css/tokens.css`
- `frontend/app/components/app/AppShell.vue`
- 必要时新增 `frontend/app/components/mobile/`

任务：

1. 增加移动 token，映射小程序颜色、圆角、间距、按钮高度。
2. 调整移动顶部栏和底部 Tab，使 375/390/430px 下与小程序接近。
3. 确定设置入口位置：顶部“设置”按钮或首页卡片入口。
4. 建立移动组件基底：卡片、信息行、空状态、加载态、状态标签。

验收：

- 登录前、登录后外壳无横向溢出。
- 底部 Tab 不遮挡内容。
- 5 个 Tab 文案与小程序一致。

### 阶段二：列表与看板页面

目标：完成主 Tab 页面 90% 视觉复刻。

涉及文件：

- `frontend/app/pages/dashboard.vue`
- `frontend/app/pages/products.vue`
- `frontend/app/pages/inventory.vue`
- `frontend/app/pages/purchases.vue`
- `frontend/app/pages/sales.vue`
- 对应 `components/*` 中的移动卡片组件

任务：

1. 仪表盘改为 KPI 横向卡片 + 图表卡片 + 摘要列表。
2. 商品页移动端改为搜索框 + 商品卡片列表。
3. 库存页移动端改为搜索框 + 库存卡片列表 + 低库存标签。
4. 进货/销售页移动端加 AI 识别入口、搜索框、订单卡片列表。
5. 保留桌面端表格，仅在移动断点隐藏。

验收：

- 5 个 Tab 页面在 375/390/430px 下能完成主要浏览任务。
- 小程序已有字段在 HTML 端不缺失。
- 加载、错误、空状态均以卡片方式出现。

### 阶段三：详情与 AI 识别流程

目标：补齐小程序核心闭环。

涉及文件：

- `frontend/app/pages/purchases.vue`
- `frontend/app/pages/sales.vue`
- `frontend/app/components/purchases/*`
- `frontend/app/components/sales/*`
- `frontend/app/composables/useClipboardImagePaste.ts` 或新增移动图片选择逻辑

任务：

1. 进货详情和销售详情在移动端使用全屏抽屉或独立路由。
2. AI 识别入口改为移动全屏流程：选择图片、预览、识别、编辑候选、提交。
3. 浏览器端图片选择使用 `<input type="file" accept="image/*" multiple>`，可选 `capture="environment"` 辅助拍照。
4. 候选项编辑保持小程序同款字段顺序和状态标签。

验收：

- 从进货/销售列表可以进入 AI 识别和详情。
- 图片预览、移除、识别中、识别结果、提交成功/失败状态完整。
- 移动端不出现桌面弹窗过宽、按钮挤压或底部遮挡。

### 阶段四：回归与相似度验收

目标：确认 90% 相似度和真实业务可用性。

验证方式：

1. 运行 `scripts/build.ps1`，确认 Nuxt 构建通过。
2. 需要真实数据时运行 `scripts/dev.ps1 -SyncRemote -DatabaseName v3-vending-inventory-sales-db`。
3. 用 DevTools 检查 375px、390px、430px 三个宽度。
4. 逐页对照小程序：登录、首页、仪表盘、商品、库存、进货、进货 AI、进货详情、销售、销售 AI、销售详情、设置。
5. 记录每页相似度分数，低于 90 的页面只修该页，不做无关重构。

## 8. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 小程序 `rpx` 与 HTML `px` 换算后视觉不完全一致 | 以 375px 视口为基准，`2rpx ≈ 1px`，再在 390/430px 微调 |
| 微信原生导航/TabBar 无法完全复刻 | 用 CSS 固定顶部栏和底部 Tab，保留文案、尺寸、颜色和安全区 |
| AI 图片选择在浏览器和微信能力不同 | 浏览器端用文件选择/拍照 input，保持预览和识别流程一致 |
| 现有桌面弹窗在手机上不适合 | 移动断点切换为全屏抽屉或独立移动视图 |
| 表格字段多导致移动端溢出 | 移动端用卡片展示关键字段，详情页展示完整字段 |
| 登录态在浏览器和小程序存储方式不同 | 继续使用现有 `useAuth`/`useApi`，以 session token 为唯一凭据 |

## 9. 建议排期

| 阶段 | 工作量 | 输出 |
| --- | ---: | --- |
| 阶段一：外壳和 token | 0.5-1 天 | 移动顶部栏、底部 Tab、基础移动组件 |
| 阶段二：5 个主页面 | 1.5-2 天 | 仪表盘、商品、库存、进货、销售移动卡片视图 |
| 阶段三：AI 与详情 | 1.5-2 天 | 进货/销售 AI 识别、详情移动视图 |
| 阶段四：验收和修正 | 0.5-1 天 | 三宽度检查、相似度评分、构建通过 |

总计约 4-6 个工作日。若只做可演示版本，可先完成阶段一 + 阶段二，约 2-3 天。

## 10. 完成标准

最终交付应满足：

- 移动浏览器首屏看起来像小程序，而不是桌面管理后台缩小版。
- 375/390/430px 全页面无横向溢出。
- 底部 Tab、顶部栏、卡片列表、搜索、状态标签、按钮视觉接近小程序。
- 进货和销售 AI 识别流程可在手机浏览器完成。
- 所有数据仍来自现有 v3 后端，不新增临时 mock。
- 构建通过，并按项目规则提交、推送和部署。
