# v3 项目级 Skills 说明

> 本目录下的 skill 会被 opencode 自动识别（通过每个子目录里的 `SKILL.md` 前置元数据）。
> 当用户描述匹配 skill 的 `description` 时，对应 skill 会被自动加载，注入领域知识与工作流。
>
> 本文件是**人类与 AI 共同读**的导航地图：解释每个 skill 干什么、什么时候被触发、它们之间怎么协作。
> 改 skill 后请同步更新本文件和 `AGENTS.md §0.5`。

---

## 1. 总览：两类 skill

| 类别 | 特点 | 路径 |
| --- | --- | --- |
| **项目专属（v3 specific）** | 包含 v3 仓库的具体文件路径、命令、表名、断点 | `desktop-ui-fix/` · `mobile-ui-fix/` · `pages-deploy-troubleshoot/` |
| **通用设计知识（generic design）** | 来自社区开源 skill，提供 UI / 设计的通用原则与组件知识 | `ui-design-brain/` · `color-system/` · `typography-scale/` · `spacing-system/` · `visual-hierarchy/` · `layout-grid/` · `responsive-design/` · `data-visualization/` · `dark-mode-design/` |

> **协作模式：** 通用设计 skill 提供"应该怎么做"的设计原则，项目专属 skill 提供"在 v3 里要改哪个文件"的具体落点。两者结合 = 既懂设计、又懂代码位置。

---

## 2. 项目专属 skills（v3 specific）

### 2.1 `desktop-ui-fix`

| 项 | 内容 |
| --- | --- |
| 用途 | 修复 v3 桌面端（PC 端）UI 问题 |
| 触发关键词 | "电脑上显示有问题"、"排版乱"、"侧栏不对"、"表格列宽"、"弹窗位置"、"1280px"、"1440px"、"1920px"、"桌面端样式"、"PC 端布局" |
| 覆盖范围 | 6 个核心页面（仪表盘 / 商品 / 库存 / 进货 / 销售 / 设置）在桌面宽度下的可用性检查与修复流程 |
| 配套通用 skill | `responsive-design`、`layout-grid`、`spacing-system`、`visual-hierarchy` |

### 2.2 `mobile-ui-fix`

| 项 | 内容 |
| --- | --- |
| 用途 | 修复 v3 移动端（手机端）UI 问题 |
| 触发关键词 | "手机上显示有问题"、"横向溢出"、"按钮被遮挡"、"iPhone 安全区"、"375px"、"390px"、"430px"、"移动端样式"、"手机端布局乱" |
| 覆盖范围 | 6 个核心页面在 3 个标准移动宽度（375 / 390 / 430 px）下的可用性检查与修复流程 |
| 配套通用 skill | `responsive-design`、`spacing-system`、`ui-design-brain` |

### 2.3 `pages-deploy-troubleshoot`

| 项 | 内容 |
| --- | --- |
| 用途 | 排查 push 到 GitHub 后 Cloudflare Pages 自动部署失败的问题 |
| 触发关键词 | "部署失败"、"构建报错"、"Pages 构建日志"、"push 后没上线"、"生产环境没更新"、"Cloudflare 报错"、"wrangler pages deploy" |
| 覆盖范围 | 构建失败、绑定缺失、迁移未应用、环境变量缺失等常见场景的诊断与修复流程 |

---

## 3. 通用设计 skills（generic design）

### 3.1 `ui-design-brain`（核心，60+ 组件最佳实践）

| 项 | 内容 |
| --- | --- |
| 来源 | https://github.com/carmahhawwari/ui-design-brain |
| 用途 | 写任何 UI 之前先查它，给 AI 注入 60+ UI 组件的最佳实践、布局模式、设计系统约定 |
| 自动触发条件 | 用户要求构建 / 设计 / 美化任何 web 界面、页面、仪表盘、表单、导航、弹窗、表格 |
| 关键文件 | `SKILL.md`（设计哲学 + 工作流 + 15 个高频组件速查）<br>`components.md`（60+ 组件完整参考） |
| 5 种风格预设 | Modern SaaS（默认） / Apple-level Minimal / Enterprise / Creative / Data Dashboard |
| **本项目首选风格** | **Enterprise / Corporate**（信息密集、键盘可导航）+ 部分页面用 **Data Dashboard**（仪表盘、库存表） |

> **使用提示：** 用户说"把这个页面做得好看点"时，先用 ui-design-brain 找出涉及的组件，按各自的 best practice 改，再用项目专属 skill 落到具体 v3 文件。

### 3.2 设计基础原则（来自 designer-skills/ui-design）

| Skill | 用途 | 什么时候用 |
| --- | --- | --- |
| `color-system` | 系统化构建配色：原色板 → 语义映射 → 可访问性合规 | 改 `tokens.css` 的颜色变量、调整状态色、做暗色模式时 |
| `typography-scale` | 字体层级体系：尺寸、字重、行高、字距 | 改字号 / 标题层级 / 字体堆栈时 |
| `spacing-system` | 间距体系（8 px 网格） | 调整 padding / margin / gap 时 |
| `visual-hierarchy` | 视觉层级：让关键信息先被看到 | 仪表盘、统计卡片、列表的信息优先级排布 |
| `layout-grid` | 栅格布局：列、间隙、断点 | 桌面端多栏布局、卡片网格、响应式布局 |
| `responsive-design` | 响应式策略：fluid / adaptive / mobile-first | 写新组件、需要同时考虑移动 + 桌面 |
| `data-visualization` | 数据可视化：图表选型、图例、轴标 | 仪表盘的销售曲线、利润对比、库存饼图 |
| `dark-mode-design` | 暗色模式设计 | 未来如果要做夜间主题 |

---

## 4. 触发示例（用户说什么 → 加载哪个 skill）

| 用户原话 | 自动加载的 skill |
| --- | --- |
| "手机上库存页横向溢出了" | `mobile-ui-fix` + `responsive-design` |
| "1440px 下侧栏比例不对" | `desktop-ui-fix` + `layout-grid` |
| "把仪表盘做得更好看一点" | `ui-design-brain` + `visual-hierarchy` + `data-visualization` + `desktop-ui-fix` |
| "调一下整站配色，主色太重" | `color-system` + `ui-design-brain` |
| "字号层级有点乱，重新排一下" | `typography-scale` + `visual-hierarchy` |
| "按钮间距不一致" | `spacing-system` + `ui-design-brain` |
| "Cloudflare Pages 部署失败" | `pages-deploy-troubleshoot` |
| "新增一个商品筛选弹窗" | `ui-design-brain`（查 Modal / Drawer 组件最佳实践） |
| "想做暗色模式" | `dark-mode-design` + `color-system` |

---

## 5. 维护规则

### 5.1 添加新 skill

1. 在 `.opencode/skills/` 下新建子目录，写 `SKILL.md` 并填好 YAML frontmatter（`name` + `description`）。
2. `description` 必须包含具体触发关键词，opencode 是按这个匹配的。
3. 在本文件 §2 或 §3 的对应表里加一行。
4. 在 `AGENTS.md §0.5` 项目级 Skills 表里同步登记（人类读者也要看到）。

### 5.2 修改已有 skill

- 只改一个 skill 的 `SKILL.md`，不要把多个 skill 的内容混在一起。
- 改完后跑一次：用对应触发关键词试一句话，确认 opencode 能自动加载这个 skill。

### 5.3 不要做的事

| ❌ 反模式 | ✅ 正确做法 |
| --- | --- |
| 在 skill 里写 v3 的 API key / 数据库导出 | 不写敏感数据，遵循 `AGENTS.md §3.5` 红线 |
| 把通用设计 skill 改成 v3 专用 | 通用知识保持原样，v3 落地写在 `desktop-ui-fix` / `mobile-ui-fix` |
| 一个 skill 描述里塞 5 种不相关场景 | 一个 skill 一个职责，场景多就拆 |
| 修改第三方 skill 后忘记记录来源 | 在 SKILL.md 顶部备注上游仓库 URL |

---

## 6. 上游来源

| 子目录 | 上游仓库 | 许可证 |
| --- | --- | --- |
| `ui-design-brain/` | https://github.com/carmahhawwari/ui-design-brain | MIT |
| `color-system/` 等 8 个 | https://github.com/Owl-Listener/designer-skills | MIT |
| `desktop-ui-fix/` · `mobile-ui-fix/` · `pages-deploy-troubleshoot/` | 本项目原创 | 跟随仓库 |

> 上游仓库后续如果有更新，按需手工 pull，不做自动同步（避免 v3 已经针对项目调整过的 skill 被覆盖）。
