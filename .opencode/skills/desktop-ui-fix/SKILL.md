---
name: desktop-ui-fix
description: 修复 v3 售货机管理系统的桌面端 UI 问题。当用户提到"电脑上显示有问题/排版乱/侧栏不对/表格列宽/弹窗位置/1280px/1440px/1920px/桌面端样式/PC 端布局"等时使用。覆盖 6 个核心页面（仪表盘/商品/库存/进货/销售/设置）在桌面宽度下的可用性检查与修复流程。
---

# 桌面端 UI 修复（v3）

> 桌面端是管理系统的主要使用场景。看到桌面端 UI 问题，按本文走，不要把移动端的修法套过来。

## 触发场景

- 用户描述：「电脑上 X 页面排版不对」「侧栏太窄/太宽」「表格列宽不合理」「弹窗位置不对」「主区域留白太多/太挤」
- 用户给出具体宽度：1280 / 1440 / 1680 / 1920 px
- 用户截图是桌面浏览器（窗口比例宽 > 高）

## 第一原则

| ✅ 做 | ❌ 不做 |
| --- | --- |
| 先用 §定位 表锁定 1–2 个文件 | 不读全仓库，不挨个组件打开 |
| 只改造成问题的元素 | 不顺手改其他页面、不重构布局 |
| 用 tokens.css 里的间距/字号变量 | 不硬编码 `padding: 24px` 这种值 |
| 桌面端要充分利用宽度 | 不要把内容硬卡在 800px 中间留两边大空白 |

## 桌面端三档参考宽度

| 宽度 | 场景 | 检查重点 |
| --- | --- | --- |
| 1280 px | 中端笔记本（最常见） | 侧栏 + 主区域是否都够用 |
| 1440 px | MacBook Pro / 主流办公屏 | 默认设计基准 |
| 1920 px | 外接显示器 / 老板的大屏 | 不能左右大片留白，不能被拉得变形 |

> 移动端 375/390/430 是 §mobile-ui-fix 的事，桌面端不用看。

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
- `frontend/app/components/app/AppShell.vue`（顶栏 + 侧栏 + 主区域三栏布局）
- `frontend/app/assets/css/layout.css`（页面骨架 grid / flex）
- `frontend/app/assets/css/tokens.css`（间距、字号、最大宽度 token）

### 表格相关
- `frontend/app/components/common/DataTable.vue`（列宽、对齐、表头吸顶）
- 各模块的 `*Table.vue`（如 `ProductTable.vue` / `SalesOrderTable.vue`）

### 弹窗 / 抽屉
- `components/common/AppDialog.vue`（弹窗居中、宽度上限）
- `components/common/AppDrawer.vue`（侧滑抽屉宽度）

## 修复流程（5 步）

```
① 用户报哪个页面 / 哪个元素出问题？
  → 用上面的表锁定 1–2 个文件
  → 不要先 list 整个 components/

② 判断是组件级还是布局级？
  ├─ 组件级（按钮/表格/弹窗内部） → 改对应 components/<模块>/*.vue
  ├─ 页面级（页面整体排版）       → 改 pages/<模块>.vue
  └─ 全局级（顶栏/侧栏/主区域）   → 改 AppShell.vue 或 layout.css

③ 写 / 改样式
  - 优先用 tokens.css 已有变量
  - 主区域宽度建议 max-width: 1440px 或 1600px，不要无限拉伸
  - 表格列宽：固定列用 px / 弹性列用 fr 或 auto
  - 弹窗：min(90vw, 720px) 这种写法兼顾大屏和窄屏

④ 跑 scripts/build.ps1 确认构建通过
  - 不要每改一行就跑一次，改完一批再跑

⑤ 需要看真实效果时
  - 启动 dev.bat 或 dev.ps1 -SyncRemote（必须同步线上数据）
  - DevTools / 浏览器窗口切 1280 / 1440 / 1920，三个宽度都看
  - 改了前端不需要重启 dev，HMR 自动热更
```

## 常见症状 → 直接对症

| 症状 | 90% 是这里 |
| --- | --- |
| 主内容区在大屏上左右大片空白 | `AppShell.vue` 主区域写死了 `max-width: 800px` 之类 |
| 主内容区在 1280 太挤 | 侧栏宽度过大（>240px），或主区域 padding 太厚 |
| 表格列被压扁 / 列宽不合理 | `DataTable` 列定义里 width 配错，或表格容器 overflow 没设 |
| 弹窗在大屏上被拉得太宽 | `AppDialog` 没设 max-width，或局部覆盖了 dialog 宽度 |
| 表头滚动时不吸顶 | 表格容器缺 `position: sticky; top: 0` 在 `<thead>` |
| 侧栏在 1920 上比例怪 | 侧栏写的是 `width: 20vw` 而不是固定 px |
| 卡片高度不齐 | 父容器 grid 缺 `align-items: stretch` |
| Hover 状态在触屏笔记本上闪烁 | 用 `@media (hover: hover)` 包裹 :hover |

## 桌面端 vs 移动端的取舍

| 场景 | 桌面端做法 | 移动端做法 |
| --- | --- | --- |
| 筛选栏 | 横向一排 | 折叠或换行 |
| 表格 | 全列展示 | 横滑 + 主键列固定 |
| 操作按钮 | 行内 | 点击展开抽屉 |
| 弹窗 | 居中 + max-width | 全屏 / 底部抽屉 |
| 字号 | 14–16 px 主体 | 14 px 主体（点击区 ≥ 44px） |

## 验证清单（提交前过一遍）

- [ ] 受影响页面在 1280 / 1440 / 1920 下都正常
- [ ] 表格列宽合理，长内容不破坏布局
- [ ] 弹窗居中、宽度合理、关闭按钮可点
- [ ] 侧栏 / 主区域比例 1280 不挤、1920 不空
- [ ] 鼠标 hover 状态正常
- [ ] `scripts/build.ps1` 通过
- [ ] `git status` 没有把 `dist/` / `output/` / `.wrangler/` 误暂存

## 反模式（看到立即停）

- 把移动端的样式（小字号、堆叠布局）套到桌面端
- 给桌面端加 `!important` 而不去找根因
- 顺手改其他无关页面的间距 / 配色
- 桌面端 + 移动端同一个媒体查询里硬塞两套规则（应分别写 `@media (min-width: 1024px)` 和 `@media (max-width: 480px)`）
- 改了 6 个页面但用户只问了 1 个

## 完成后

按 AGENTS.md §3.5 提交：
```
git add -A
git commit -m "修复 X 页面在桌面端 Y 问题"
git push origin master
```

回复时说明：
1. 触碰了哪些文件
2. 在哪些宽度验证过
3. commit hash
