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
| **项目专属（v3 specific）** | 包含 v3 仓库的具体文件路径、命令、表名、断点 | `desktop-ui-fix/` · `mobile-ui-fix/` · `pages-deploy-troubleshoot/` · `inventory-restructure/` · `inventory-drift-diagnose/` · `zn-excel-import/` |
| **通用前端设计知识（generic design）** | 来自社区开源 skill，提供 UI 视觉方向、配色、字体、布局与文案自检 | `frontend-design/` |

> **协作模式：** `frontend-design` 提供"应该怎么做"的设计原则，项目专属 skill 提供"在 v3 里要改哪个文件"的具体落点。两者结合 = 既懂设计、又懂代码位置。

---

## 2. 项目专属 skills（v3 specific）

### 2.1 `desktop-ui-fix`

| 项 | 内容 |
| --- | --- |
| 用途 | 修复 v3 桌面端（PC 端）UI 问题 |
| 触发关键词 | "电脑上显示有问题"、"排版乱"、"侧栏不对"、"表格列宽"、"弹窗位置"、"1280px"、"1440px"、"1920px"、"桌面端样式"、"PC 端布局" |
| 覆盖范围 | 6 个核心页面（仪表盘 / 商品 / 库存 / 进货 / 销售 / 设置）在桌面宽度下的可用性检查与修复流程 |
| 配套通用 skill | `frontend-design` |

### 2.2 `mobile-ui-fix`

| 项 | 内容 |
| --- | --- |
| 用途 | 修复 v3 移动端（手机端）UI 问题 |
| 触发关键词 | "手机上显示有问题"、"横向溢出"、"按钮被遮挡"、"iPhone 安全区"、"375px"、"390px"、"430px"、"移动端样式"、"手机端布局乱" |
| 覆盖范围 | 6 个核心页面在 3 个标准移动宽度（375 / 390 / 430 px）下的可用性检查与修复流程 |
| 配套通用 skill | `frontend-design` |

### 2.3 `pages-deploy-troubleshoot`

| 项 | 内容 |
| --- | --- |
| 用途 | 排查 push 到 GitHub 后 Cloudflare Pages 自动部署失败的问题 |
| 触发关键词 | "部署失败"、"构建报错"、"Pages 构建日志"、"push 后没上线"、"生产环境没更新"、"Cloudflare 报错"、"wrangler pages deploy" |
| 覆盖范围 | 构建失败、绑定缺失、迁移未应用、环境变量缺失等常见场景的诊断与修复流程 |

### 2.4 `inventory-restructure`

| 项 | 内容 |
| --- | --- |
| 用途 | 推进 1 号机/2 号机销售-商品-库存重构（`docs/重构计划-1-2号机.md` 的可执行索引） |
| 触发关键词 | "重构计划"、"Phase 0/0.5/1/2/2.5/3/4/5"、"按机库存"、"1·2 号机折叠"、"删 stock-scope"、"重建余额"、"机间调拨"、"盘点 UI"、"总库存与进货不匹配" |
| 覆盖范围 | 阶段总览、6 个决策点（D1-D6）、每个 Phase 的文件清单、Phase 2.5 五项零漂门槛、漂移根因索引（R1-R8） |
| 配套 skill | `inventory-drift-diagnose`、`zn-excel-import` |

### 2.5 `inventory-drift-diagnose`

| 项 | 内容 |
| --- | --- |
| 用途 | 诊断库存漂移（总库存与进货不匹配、'1/2号机' 折叠泄漏、负库存、作废未反冲、同名重复商品） |
| 触发关键词 | "库存漂移"、"库存对不上"、"进货 vs 库存对账"、"负库存核查"、"重建余额验证"、"Phase 0.5/2.5 诊断"、"对账证明" |
| 覆盖范围 | 5 个诊断脚本的实现规范（balance-vs-movements / purchase-vs-balance / stock-scope-leakage / void-unwind / duplicate-product）+ Phase 0.5/2.5 强制门槛 |
| 配套 skill | `inventory-restructure`、`zn-excel-import` |

### 2.6 `zn-excel-import`

| 项 | 内容 |
| --- | --- |
| 用途 | 修改 zn 平台 Excel 导入链路（订单明细 + 交易账单两份 Excel 的字段对齐、幂等键、批次约束） |
| 触发关键词 | "zn Excel"、"订单明细"、"交易账单"、"导入失败"、"字段映射"、"订单号关联"、"手续费"、"算法服务费"、"预估到账"、"设备编号"、"sheetjs/xlsx 解析" |
| 覆盖范围 | 字段映射表、设备-机型映射、`pickField` 前缀匹配规则、幂等键设计、reconcile/rebuild 分支、IMPORT_BATCH_SIZE = 80 约束 |
| 配套 skill | `inventory-restructure`、`inventory-drift-diagnose` |

---

## 3. 通用设计 skill（generic design）

### 3.1 `frontend-design`

| 项 | 内容 |
| --- | --- |
| 来源 | https://github.com/anthropics/skills/tree/main/skills/frontend-design |
| 用途 | 写 / 改 UI 视觉前先查它，用于建立有辨识度的视觉方向、配色、字体、布局、动效与文案自检 |
| 自动触发条件 | 用户要求构建 / 设计 / 美化 / 重塑任何 web 界面、页面、仪表盘、表单、导航、弹窗、表格 |
| 关键文件 | `SKILL.md`（前端视觉设计原则 + 工作流） |
| **本项目首选落地方式** | 保留管理系统的信息密度与可用性，用 `frontend-design` 做视觉方向校准，再用 `desktop-ui-fix` / `mobile-ui-fix` 落到 v3 文件与验证流程 |

> **使用提示：** 用户说"把这个页面做得好看点"时，先用 `frontend-design` 明确视觉方向和自检标准，再用项目专属 skill 落到具体 v3 文件。

---

## 4. 触发示例

> 用户原话 → 加载哪个 skill 的对应表见 `AGENTS.md §0.5`，本文件不再重复。

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
| `frontend-design/` | https://github.com/anthropics/skills/tree/main/skills/frontend-design | 见 `frontend-design/LICENSE.txt` |
| `desktop-ui-fix/` · `mobile-ui-fix/` · `pages-deploy-troubleshoot/` · `inventory-restructure/` · `inventory-drift-diagnose/` · `zn-excel-import/` | 本项目原创 | 跟随仓库 |

> 上游仓库后续如果有更新，按需手工 pull，不做自动同步（避免 v3 已经针对项目调整过的 skill 被覆盖）。
