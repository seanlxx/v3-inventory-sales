---
name: mobile-ui-fix
description: 修复 v3 售货机管理系统的移动端 UI 问题。当用户提到"手机上显示有问题/横向溢出/按钮被遮挡/iPhone 安全区/375px/390px/430px/移动端样式/手机端布局乱"等时使用。覆盖 6 个核心页面（仪表盘/商品/库存/进货/销售/设置）在 3 个标准宽度下的可用性检查与修复流程。
---

# 移动端 UI 修复（v3）

> 本 skill 把 AGENTS.md §4 的规则压成可执行流程。看到移动端 UI 问题，按本文走。

## 触发场景

- 用户描述：「手机上 X 页面显示乱了」「按钮点不到」「内容被底部 home bar 挡住」「表格撑破页面」「侧栏盖住主内容」
- 用户给出具体宽度：375 / 390 / 430 px
- 用户截图里看到横向滚动条 / 元素重叠

## 第一原则

| ✅ 做 | ❌ 不做 |
| --- | --- |
| 先用 §定位 表锁定 1–2 个文件 | 不读全仓库，不挨个组件打开 |
| 只改造成问题的元素 | 不顺手改其他页面、不重构布局 |
| 用现成的 `AppDialog` / `DataTable` / `AppButton` | 不自己写 `<dialog>` / `<table>` |
| 改完 3 个宽度都验证一遍 | 不只看 375 就交差 |

## 七条硬约束（每次都要满足）

1. 宽度 **375 / 390 / 430** 下不能横向溢出
2. 顶栏、侧栏、弹窗、表格、底部按钮**不能互相遮挡**
3. 表格在手机上要能**横向滚动**（用 `DataTable` 自带的滚动容器）
4. 表单输入框、按钮、筛选栏在手机上**自动换行或堆叠**
5. 按钮点击区域 ≥ **44 × 44 px**
6. 页面底部不能被 **iPhone 安全区**遮住 → 用 `env(safe-area-inset-bottom)`
7. 不手工修改 `dist/`，只改 `frontend/` 然后跑 `scripts/build.ps1`

## 文件定位

### 6 个页面入口
| 页面 | 文件 |
| --- | --- |
| 仪表盘 | `frontend/app/pages/dashboard.vue` |
| 商品管理 | `frontend/app/pages/products.vue` |
| 库存管理 | `frontend/app/pages/inventory.vue` |
| 进货管理 | `frontend/app/pages/purchases.vue` |
| 销售管理 | `frontend/app/pages/sales.vue` |
| 设置 | `frontend/app/pages/settings.vue` |

### 布局级问题先看
- `frontend/app/components/app/AppShell.vue`（顶栏 + 侧栏 + 主区域）
- `frontend/app/assets/css/layout.css`
- `frontend/app/assets/css/tokens.css`（断点、间距 token）

### 通用组件（移动端样式优先在这里改）
- `components/common/DataTable.vue` — 表格横滑容器
- `components/common/AppDialog.vue` — 弹窗
- `components/common/AppDrawer.vue` — 抽屉
- `components/common/AppButton.vue` — 按钮尺寸

## 修复流程（5 步）

```
① 用户报哪个页面 / 哪个元素出问题？
  → 用上面的表锁定 1–2 个文件
  → 不要先 list 整个 pages/

② 判断是组件级还是布局级？
  ├─ 组件级 → 改对应 components/<模块>/*.vue
  └─ 布局级 → 改 AppShell.vue 或 layout.css

③ 写 / 改样式
  - <style scoped> 里加 @media (max-width: 480px)
  - 优先用 tokens.css 已有变量，不要硬编码颜色和间距
  - 横滑：overflow-x: auto + min-width: 720px（DataTable 已封装）
  - 安全区：padding-bottom: calc(16px + env(safe-area-inset-bottom))

④ 跑 scripts/build.ps1 确认构建通过
  - 不要每改一行就跑一次，改完一批再跑

⑤ 需要看真实效果时
  - 启动 dev.bat 或 dev.ps1 -SyncRemote（必须同步线上数据）
  - DevTools 切到 375 / 390 / 430，三个宽度都检查
  - 改了前端不需要重启 dev，HMR 自动热更
```

## 常见症状 → 直接对症

| 症状 | 90% 是这里 |
| --- | --- |
| 整页横向滚动条 | 某个固定 `width: xxxpx` 或大表格没套滚动容器 |
| 表格撑破页面 | 没用 `DataTable` 组件，自己写了 `<table>` |
| 底部按钮被 home bar 挡住 | 缺 `env(safe-area-inset-bottom)` |
| 侧栏盖住主内容 | `AppShell.vue` 里 z-index / 主区域 padding-left 没适配窄屏 |
| 弹窗超出屏幕 | 没用 `AppDialog`，或 dialog 写死 `width: 600px` |
| 按钮挤一行点不到 | 筛选栏 / 操作栏缺 `flex-wrap: wrap` 和 `min-height: 44px` |
| 输入框文字被截断 | 缺 `min-width: 0` 让 flex 子项可缩小 |

## 验证清单（提交前过一遍）

- [ ] 受影响页面在 375 / 390 / 430 下截图都正常
- [ ] 没有横向滚动条（除了表格的 DataTable 内部）
- [ ] 顶栏 / 侧栏 / 底部按钮无遮挡
- [ ] 按钮可点击（≥ 44px 高）
- [ ] `scripts/build.ps1` 通过
- [ ] `git status` 没有把 `dist/` / `output/` / `.wrangler/` 误暂存

## 反模式（看到立即停）

- 改了 CSS 没确认是否已有同名选择器，导致重复覆盖
- 在 `<style scoped>` 里加 `!important` 而不去找根因
- 顺手"优化"动画 / 配色 / 排版（用户没让你做）
- 反复重启 dev 服务（前端改动 HMR 自动热更）
- 改了 6 个页面但用户只问了 1 个

## 完成后

按 AGENTS.md §3.5 提交：
```
git add -A
git commit -m "修复 X 页面在 Y 宽度下的 Z 问题"
git push origin master
```

回复时说明：
1. 触碰了哪些文件
2. 在哪些宽度验证过
3. commit hash
