# 移动端 HTML 改造备忘

## 目标

把微信小程序的移动使用体验迁移到 v3 Nuxt 前端。后端继续复用现有 Cloudflare Pages Functions、D1、R2，不新增独立后端。

移动端目标不是压缩桌面后台，而是在手机浏览器里提供小程序式的信息架构、卡片列表和全屏操作流程。

## 当前基线

- 小程序项目：`C:\Users\Admin\WeChatProjects\minicode-1`
- v3 移动底座已落地：`AppShell` 移动顶部栏 / 底部 Tab、安全区处理、`components/mobile/` 基础卡片组件。
- 桌面端页面继续保留表格和管理效率，移动断点下切换卡片视图。

## 页面映射

| 小程序页面 | Nuxt 承接位置 | 移动端要求 |
| --- | --- | --- |
| 登录 | 登录门禁 / 登录页 | 单列账号密码、主按钮、错误提示 |
| 首页 | 移动工作台或默认入口 | 模块入口、经营摘要、退出登录 |
| 仪表盘 | `frontend/app/pages/dashboard.vue` | KPI 卡片、摘要图表、加载/错误卡片 |
| 商品 | `frontend/app/pages/products.vue` | 搜索框、商品卡片列表 |
| 库存 | `frontend/app/pages/inventory.vue` | 搜索框、库存卡片、低库存状态 |
| 进货 | `frontend/app/pages/purchases.vue` | AI 入口、搜索、进货单卡片、详情 |
| 销售 | `frontend/app/pages/sales.vue` | AI 入口、搜索、销售单卡片、详情 |
| 设置 | `frontend/app/pages/settings.vue` | 登录状态、修改密码、退出登录 |

## 视觉规则

| 项 | 建议值 |
| --- | --- |
| 背景 | `#f6f8fb` |
| 正文 | `#172033` |
| 次级文字 | `#6b7280` |
| 主色 | `#2563eb` |
| 边框 | `#d9e0ea` |
| 卡片圆角 | `8px` |
| 按钮高度 | `44px` |
| 页面横向 padding | `14px` |

移动端必须满足：

- 375 / 390 / 430px 无横向溢出。
- 顶部栏和底部 Tab 不遮挡内容，底部包含 `env(safe-area-inset-bottom)`。
- 列表优先用卡片；表格只作为横向滚动的兜底。
- 搜索、表单、按钮在移动端单列或自然换行。
- 触控目标不小于 44px。

## 实施原则

1. 复用现有 composables，不重写 API URL，不改 D1 schema。
2. 桌面端和移动端共用页面数据流，仅切换呈现形态。
3. 通用移动组件放在 `frontend/app/components/mobile/`。
4. 进货 / 销售 AI 识别优先复用共享 AI 识别组件，不复制上传和识别流程。
5. 只在移动断点下隐藏桌面表格，避免影响桌面管理体验。

## 验收

- `powershell -ExecutionPolicy Bypass -File ./scripts/build.ps1` 构建通过。
- 需要真实数据时，用 `scripts/dev.ps1 -SyncRemote -DatabaseName v3-vending-inventory-sales-db` 启动本地服务。
- DevTools 检查 375px、390px、430px：核心页面无横向溢出、无遮挡、按钮可点击。
- 所有数据来自现有 v3 后端，不新增 mock。
