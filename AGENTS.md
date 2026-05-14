# AGENTS.md

> 本文件是本仓库唯一的项目说明与 AI 操作规范。
> §1–§2 面向人类读者，§3–§9 面向 AI agent。
> **开始任何任务前先读完本文件。**
>
> 章节速查：
> - §0 接到需求后的标准工作流（最重要，禁止"挨个方法试一遍"）
> - §1 项目概况 / §2 常用命令
> - §3 AI 操作规则 / §4 移动端 UI 规则
> - §5 代码定位速查表 / §6 常见任务决策树
> - §7 前后端联调规则 / §8 AI 对话行为规范 / §9 反复出现的坑

---

## 0. 接到需求后的标准工作流

> **核心原则：先理解 → 再定位 → 再动手。禁止"挨个方法试一遍"。**
> 用户每次提需求，按下面 5 步走，不要跳步、不要发明新流程。

### 0.1 五步工作法

```
① 理解   → 复述用户需求，识别任务类型（UI / 后端 / 文档 / 排查）
② 定位   → 用 §5 速查表锁定最多 1–3 个目标文件，不做全仓库搜索
③ 计划   → 列出"准备改哪些文件、为什么改"，等用户确认或直接执行
④ 执行   → 一次性改完一批相关文件，不试探性地反复改
⑤ 验证+提交 → 按 §3.4 选最小验证方式 → §3.5 自动 commit + push
```

### 0.2 禁止的"盲试"模式

| ❌ 盲试行为 | ✅ 正确做法 |
| --- | --- |
| 不读 §5 速查表，先 `Glob` 全仓库，再 `Grep` 全仓库，再逐个 `Read` | 先查 §5.1 / §5.2 找到具体文件，再 `Read` 那一个 |
| 一种方案没生效就改成另一种，再不行再换第三种 | 第一次失败后**停下来**看报错，理解根因再改 |
| 同一个错误反复 build 3 次以上，每次只改一点 | 第 2 次还没好 → 重新读源代码 / 报错堆栈，不要继续盲改 |
| 不确认用户意图，假设"用户大概是想……" | 意图不明时**一句话问清**，比返工 10 分钟更省时间 |
| 改之前先把目录列一遍、把 README 读一遍、把同名文件全打开 | 直接打开目标文件，不需要的不读 |
| 用 PowerShell `Get-Content` 读含中文的 UTF-8 文件 | 用 `Read` 工具读，PowerShell 默认编码会乱码 |

### 0.3 何时该停下来问用户

遇到以下情况**必须**问用户，不要猜：

1. 用户描述里有歧义词："优化一下"、"改好看点"、"处理掉" → 问具体期望
2. 改动会影响数据库 schema、删除字段、重命名表 → 先确认
3. 改动涉及钱（价格、利润计算、库存余额公式） → 先确认
4. 用户说"那个 bug" 但没说哪个 → 先确认是哪个
5. 同一个问题已经返工过 2 次 → 停下来对齐理解

### 0.4 何时不需要问、直接做

- 任务描述明确 + §5 能定位到文件 + 改动不涉及上面 §0.3 的情况 → 直接做
- 用户给了清晰的修改点（"把 X 改成 Y"） → 直接做
- 纯文档 / 纯样式微调 → 直接做

### 0.5 项目级 Skills（按场景自动加载）

本项目在 `.opencode/skills/` 下注册了 3 个专项 skill，遇到对应场景**优先加载 skill**，不要凭记忆照本节流程做：

| 用户描述场景 | 对应 skill | 何时触发 |
| --- | --- | --- |
| 手机端 / 375 / 390 / 430px / 横向溢出 / iPhone 安全区 | `mobile-ui-fix` | 移动端 UI 修复 |
| 电脑端 / 1280 / 1440 / 1920px / 侧栏比例 / 桌面排版 | `desktop-ui-fix` | 桌面端 UI 修复 |
| push 后没上线 / Pages 构建失败 / D1 表不存在 / 绑定缺失 | `pages-deploy-troubleshoot` | Cloudflare Pages 部署排查 |

> Skill 内容是 §4 / §3 的可执行版本，覆盖具体症状 → 文件 → 修复手法的对应关系。

---

## 1. 项目概况

无人售货机库存、进货、销售、利润与 AI 辅助管理系统。

**技术栈：** Nuxt 4 + Vue 3 + TypeScript 前端 + Cloudflare Pages Functions（边缘 API） + D1（SQLite） + R2（图片存储）。

### 1.1 架构总览

```
┌──────────────────────────────────────────────────────────┐
│  浏览器（Nuxt 生成的 dist/ 静态资源）                      │
│  页面：仪表盘 / 商品管理 / 库存管理 / 进货管理 / 销售管理 / 设置 │
└────────────────────────┬─────────────────────────────────┘
                         │ fetch /api/*
┌────────────────────────▼─────────────────────────────────┐
│  Cloudflare Pages Functions（functions/api/）             │
│  ├─ auth/        → 登录、获取用户、改密码                   │
│  ├─ products.js  → 商品 CRUD                             │
│  ├─ inventory/   → 库存操作（余额、流水、进货、销售等）       │
│  ├─ reports/     → 报表聚合                               │
│  ├─ settings.js  → 系统设置                               │
│  ├─ images.js    → R2 图片读取                            │
│  └─ ai-proxy.js  → AI 模型代理（多 provider 路由）         │
│                                                          │
│  绑定：DB (D1)  ·  IMAGES (R2)  ·  环境变量 (API Key)     │
└──────────────────────────────────────────────────────────┘
```

### 1.2 目录结构

```
.
├── frontend/               # Nuxt 4 前端源码
│   ├── app/                # 页面、组件、composables、stores、样式
│   ├── nuxt.config.ts
│   └── package.json
├── functions/api/
│   ├── _middleware.js      # 全局中间件
│   ├── _shared/            # 认证、D1、HTTP、图片、库存台账、校验
│   ├── auth/               # 登录 / 获取用户 / 改密码
│   ├── inventory/          # 库存操作（余额、流水、进货、销售、调整等）
│   ├── reports/            # 仪表盘 / 库存 / 月度 报表聚合
│   ├── products.js         # 商品 CRUD
│   ├── settings.js         # 系统设置 CRUD
│   ├── images.js           # R2 图片读取
│   └── ai-proxy.js         # AI 多模型代理路由
├── migrations/
│   ├── 0001_initial_d1_schema.sql
│   ├── 0002_chunk_record_images.sql
│   ├── 0003_cap_password_pbkdf2_iterations.sql
│   ├── 0004_r2_image_keys.sql
│   ├── 0005_query_path_indexes.sql
│   └── 0006_v3_structured_inventory_schema.sql
├── scripts/
│   ├── build.ps1           # 构建 dist/（Nuxt generate + 复制 _headers）
│   ├── dev.ps1             # 本地开发（构建 → 迁移 → wrangler pages dev）
│   ├── sync-d1-remote-to-local.ps1
│   ├── test.ps1            # 统一回归测试入口
│   ├── test-ai-proxy-routing.mjs
│   ├── test-ai-purchase-recognition.mjs
│   └── test-inventory-service.mjs
├── public_headers          # Pages 安全响应头 → 构建时复制为 dist/_headers
├── wrangler.jsonc           # Cloudflare 部署配置
├── dev.bat                  # Windows 双击入口：调用 scripts/dev.ps1 -SyncRemote
├── AGENTS.md               # ← 你正在读的文件
├── CLAUDE.md               # Claude 专用指令（OpenACP 本地工作区说明）
└── .gitignore
```

**不手工编辑 / 不提交的目录（已在 `.gitignore`）：**

| 路径 | 说明 |
| --- | --- |
| `dist/` | 构建产物，由 `scripts/build.ps1` 生成 |
| `output/` | 本地调试日志、截图、临时产物 |
| `.migration/` | 旧版数据迁移导出的 JSON / SQL，含敏感数据 |
| `.wrangler/` | wrangler 本地缓存 |
| `.sisyphus/` | 本地编排状态 |
| `.openacp/` | OpenACP 本地工作区（含 secrets） |

### 1.3 Cloudflare 绑定

| 类型 | 绑定名 | 资源名 |
| --- | --- | --- |
| D1 数据库 | `DB` | `v3-vending-inventory-sales-db` |
| R2 存储桶 | `IMAGES` | `v3-vending-inventory-sales-images` |

- Pages 输出目录：`./dist`
- 数据库迁移目录：`migrations/`
- 兼容性日期：`2026-05-05`

### 1.4 数据模型

 v3 使用结构化关系表，schema 定义在 `migrations/0006_v3_structured_inventory_schema.sql`：

| 表 | 用途 | 关键列 |
| --- | --- | --- |
| `products` | 商品主数据 | `id`, `machine_id`, `status` |
| `purchase_orders` | 进货单头 | `id`, `machine_id`, `date`, `status` |
| `purchase_items` | 进货单明细 | `order_id`, `product_id`, `quantity`, `unit_price_cents` |
| `sales_orders` | 销售/退款/损耗单头 | `id`, `type`, `machine_id`, `date`, `status` |
| `sales_items` | 销售单明细 | `order_id`, `product_id`, `quantity` |
| `stock_movements` | **库存流水账本**（唯一可信来源） | `product_id`, `movement_type`, `qty_delta` |
| `inventory_balances` | 库存余额缓存（可由流水重建） | `product_id` |
| `image_assets` | R2 图片元数据 | `id`, `r2_key`, `source_store` |
| `settings` | 系统设置 | `key` |

- 图片二进制存储在 R2（`IMAGES` 绑定），由 `image_assets` 表 + R2 key 关联。
- 认证相关：`app_auth`（单行密码）、`app_sessions`（会话 token）、`app_login_attempts`（限流）。

### 1.5 AI 代理环境变量

支持多 AI provider，服务端环境变量或登录后在"设置"页面保存到数据库：

| Provider | API Key 变量 | Base URL 变量 |
| --- | --- | --- |
| OpenCode | `OPENCODE_API_KEY` | `OPENCODE_BASE_URL` |
| 通义千问 | `QWEN_API_KEY` | `QWEN_BASE_URL` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` |
| Claude | `CLAUDE_API_KEY` | `CLAUDE_BASE_URL` |
| 云雾 | `YUNWU_API_KEY` | `YUNWU_BASE_URL` |

> **⚠️ 不要把 API Key 写入源码、`wrangler.jsonc` 或任何 Markdown。**
> 生产环境使用 Cloudflare 环境变量 / Secret。

### 1.6 默认账号

数据库初始化默认账号 `admin / admin`，首次部署后**立即改密码**。

### 1.7 部署流程

```
本地修改 → git add → git commit → git push origin master
                                        │
                          GitHub 仓库收到 push
                          https://github.com/seanlxx/v3-inventory-sales.git
                                        │
                          Cloudflare Pages 自动拉取 → 构建 → 部署上线
```

- **代码仓库：** `https://github.com/seanlxx/v3-inventory-sales.git`
- **部署分支：** `master`
- **自动部署：** Cloudflare Pages 已绑定 GitHub 仓库，push 到 `master` 后自动触发构建与部署。
- **AI agent 的职责：** 每次修改文件后，必须完成 `git add → commit → push`，推送到 GitHub 即完成部署。

---

## 2. 常用命令

### 本地开发与测试（同步线上数据）

> **⚠️ 需要看到真实页面效果时，必须先同步线上数据。**
> `dev.bat` 会调用 `scripts/dev.ps1 -SyncRemote -DatabaseName v3-vending-inventory-sales-db`，先同步远程 D1 到本地，再启动开发服务。

```powershell
# ── 推荐：同步线上数据后启动本地开发服务（agent 测试必须使用）──
powershell -ExecutionPolicy Bypass -File ./scripts/dev.ps1 -SyncRemote -DatabaseName v3-vending-inventory-sales-db
# 内部流程：构建 dist/ → 应用本地迁移 → 导出远程 D1 → 清空并导入本地 D1 → 启动 wrangler pages dev :8788

# ── Windows 双击/快速入口（会同步线上数据）──
# 路径：C:\Users\Admin\Desktop\v3\dev.bat
# 内部流程：构建 dist/ → 应用本地迁移 → 导出远程 D1 → 清空并导入本地 D1 → 启动 wrangler pages dev :8788

# ── 仅构建 dist/（不启动服务）──
powershell -ExecutionPolicy Bypass -File ./scripts/build.ps1

# ── 仅应用 D1 迁移（本地）──
npx wrangler d1 migrations apply v3-vending-inventory-sales-db --local

# ── 仅应用 D1 迁移（远程生产）──
npx wrangler d1 migrations apply v3-vending-inventory-sales-db --remote

# ── 跑回归测试（改了 inventory-service.js / ai-proxy.js 后必须跑）──
powershell -ExecutionPolicy Bypass -File ./scripts/test.ps1
# 内部依次执行：test-inventory-service.mjs / test-ai-purchase-recognition.mjs / test-ai-proxy-routing.mjs
```

**本地启动流程摘要：**

```
dev.ps1 -SyncRemote -DatabaseName v3-vending-inventory-sales-db（真实数据测试）
  │
  ├─ 1. scripts/build.ps1       → 构建 dist/
  ├─ 2. 应用本地迁移             → 数据库 schema 最新
  ├─ 3. 同步远程 D1 数据到本地    → 有真实业务数据可测试
  └─ 4. wrangler pages dev :8788 → 本地服务启动
                                    浏览器访问 http://localhost:8788

dev.bat（同步线上数据后启动）
  │
  ├─ 1. scripts/build.ps1       → 构建 dist/
  ├─ 2. 应用本地迁移             → 数据库 schema 最新
  ├─ 3. 同步远程 D1 数据到本地    → 有真实业务数据可测试
  └─ 4. wrangler pages dev :8788 → 本地服务启动
                                    浏览器访问 http://localhost:8788
```

### 部署到生产（每次修改后必做）

```powershell
# ── 提交并推送到 GitHub，触发 Cloudflare Pages 自动部署 ──
git add -A
git commit -m "<简明描述本次改动>"
git push origin master
```

> 推送成功后，Cloudflare Pages 会自动拉取最新代码并部署。无需手动触发。

---

## 3. AI 操作规则

> 本节规定 AI agent 在本仓库的行为边界。
> 目标：减少无效探索、避免无关改动、防止误删用户文件。

### 3.1 操作前检查

1. 运行或查看 `git status --short`，确认当前未提交改动。不要把用户已有的未提交工作卷入本次改动。
2. 只读取与当前任务**直接相关**的文件。定位到目标文件后，不再做全仓库大范围搜索。
3. 动手改之前，先**明确列出**这次准备触碰的文件范围。
4. 当一个命令（如 `rg`）在当前环境不可用时，直接换可用工具，不要反复重试同一条。

### 3.2 禁止浪费时间

- ❌ 不把 `.wrangler/`、`dist/` 当作源码阅读。
- ❌ 不手工编辑 `dist/`。需要更新时改源文件 → 跑 `scripts/build.ps1`。
- ❌ 不读取或提交以下本地敏感文件（除非用户明确要求）：
  - `github-recovery-codes.txt`
  - `售货机数据备份_*.json`
  - `d1-seed.sql` / `d1-image-rows.json`
  - `.env*`（`.env.example` 除外）
  - `.openacp/`
- ❌ 不做与当前目标无关的样式重构、目录重组、兼容性改造。
- ❌ 不给未出现过的场景加"防御性"代码、fallback、兼容旧格式的分支。

### 3.3 文件修改边界

| 任务类型 | 通常只碰 | 必要时附带 |
| --- | --- | --- |
| UI / 前端逻辑 | `frontend/` | 跑构建让 `dist/` 重生成 |
| Cloudflare API | `functions/api/` | 同步检查相关前端调用 |
| 数据库结构 | `migrations/`（新建迁移文件） | 直接相关的数据访问代码 |
| 脚本 | `scripts/` 中目标脚本 | 本文件相关章节 |
| 文档 / 配置说明 | 本文件 | **不要跑构建或启动服务** |

### 3.4 验证策略

> 需要在本地看到真实页面效果时，先用 `dev.ps1 -SyncRemote`（或 `dev.bat`）同步线上数据并启动本地服务。

| 改了什么 | 怎么验证 |
| --- | --- |
| 前端源文件（Nuxt / Vue / CSS） | ① 跑 `scripts/build.ps1` 确认构建通过；② 需要真实数据时用 `dev.ps1 -SyncRemote` 或 `dev.bat` 启动本地服务，浏览器打开 `localhost:8788` 检查页面 |
| D1 schema | 跑 `npx wrangler d1 migrations apply ... --local` |
| Pages Functions | 需要真实数据时用 `dev.ps1 -SyncRemote` 或 `dev.bat` 启动本地服务，验证 API 路由与绑定 |
| 仅文档 / 配置说明 | **不跑构建，不启动服务** |

- LSP 诊断里已有的遗留告警（`!important`、重复属性、选择器顺序等），和本次改动无关就**不要顺手清理**。

### 3.5 提交、推送与部署

> **核心规则：每次修改了文件，任务结束前必须 commit + push 到 GitHub。**
> Cloudflare Pages 会自动从 GitHub 拉取并部署，无需手动干预。

#### 自动提交流程

每次任务涉及文件修改时，在所有验证通过后，**必须**执行以下步骤：

1. `git add -A` — 暂存所有修改（`.gitignore` 已排除敏感文件）
2. `git commit -m "<简明中文描述>"` — 提交，commit message 用中文简述本次改动
3. `git push origin master` — 推送到 GitHub，触发 Cloudflare Pages 自动部署

> 如果用户有未提交的改动与本次任务无关，先用 `git stash` 暂存，完成本次提交推送后再 `git stash pop` 恢复。

#### 安全红线

- `.gitignore` 已排除敏感文件，但仍需确认 `git status` 输出中**没有**以下内容被意外暂存：
  - `.wrangler/`、`dist/`、`.sisyphus/`、`.openacp/`
  - `github-recovery-codes.txt`
  - `售货机数据备份_*.json`、`d1-seed.sql`、`d1-image-rows.json`
  - `.env*`（`.env.example` 除外）
- 不把 API key、token、数据库导出、恢复码写入任何 Markdown 或源文件。
- 不使用 `git reset --hard`、force-push、`git commit --amend`，除非用户明确要求。

### 3.6 反模式清单（遇到就跳过）

> 以下操作已证明无意义，遇到时直接跳过。

| # | 反模式 |
| --- | --- |
| 1 | 在已知目标文件的情况下，跑全仓库范围的 `rg` / `Select-String` |
| 2 | 在文档任务里跑前端构建或启动 `wrangler pages dev` |
| 3 | 把 `dist/` 下的文件当源码来读或改 |
| 4 | 改了 CSS 却不检查是否已有同名选择器，导致重复覆盖 |
| 5 | 把 `.env` / 恢复码 / D1 导出 SQL 的内容粘到对话或文档里 |
| 6 | 修完一个点顺手重构邻近无关代码 |
| 7 | 修改了 `dev.bat` 的启动流程后，忘记同步更新本文件中的启动说明 |
| 8 | 项目已有 `AppDialog`、`DataTable` 等通用组件，却自己手写 `<dialog>` 或 `<table>` |
| 9 | 改了 API 返回字段但没同步更新前端 `types/` 定义，导致 TypeScript 报错 |
| 10 | 前端改动后反复重启 dev 服务，实际上 Nuxt HMR 会自动热更新 |
| 11 | 每改一行就跑一次 `build.ps1`，应该改完一批再跑一次 |
| 12 | 不确定用户意图时猜着做了一堆，结果方向错了全部返工 |

### 3.7 结束前记录

每次任务完成后，在回复中列出：

1. **实际触碰了哪些文件。**
2. **是否运行了验证命令，结果如何。**
3. **是否已提交并推送到 GitHub。** 附上 commit hash 或 push 输出摘要。
4. **是否出现多余操作。** 如有，说明原因和下次如何规避（新模式追加到 §3.6 表格）。

---

## 4. 移动端 UI 修复规则

> 本项目是管理系统，移动端优先保证**可用性**，不做花哨重设计。

### 4.1 必须满足的约束

| # | 约束 |
| --- | --- |
| 1 | 宽度 **375px、390px、430px** 下不能横向溢出 |
| 2 | 顶栏、侧边栏、弹窗、表格、底部按钮**不能互相遮挡** |
| 3 | 表格在手机上要能**横向滚动**，不能把整页撑破 |
| 4 | 表单输入框、按钮、筛选栏在手机上要**自动换行或堆叠** |
| 5 | 按钮点击区域不能太小（最小 44×44px） |
| 6 | 页面底部内容不能被 **iPhone 安全区**遮住（`env(safe-area-inset-bottom)`） |
| 7 | 不手工修改 `dist/`，只改 `frontend/`，然后运行构建 |

### 4.2 修复时优先检查的文件

```
frontend/app/assets/css/       ← 设计 token、基础样式和组件样式
frontend/app/components/       ← AppShell、表格、弹窗、业务组件
frontend/app/pages/            ← 6 个核心页面入口
frontend/app/composables/      ← API 封装和页面数据流
```

### 4.3 验证方式

1. 用 `dev.ps1 -SyncRemote` 或 `dev.bat` 启动本地服务（必须同步线上数据，否则看到的不是线上真实业务数据）。
2. 用浏览器 DevTools 模拟以下宽度逐一截图检查：**375px · 390px · 430px**。
3. **必须检查全部 6 个页面：**

| 页面 | 对应入口 |
| --- | --- |
| 仪表盘 | `frontend/app/pages/dashboard.vue` |
| 商品管理 | `frontend/app/pages/products.vue` |
| 库存管理 | `frontend/app/pages/inventory.vue` |
| 进货管理 | `frontend/app/pages/purchases.vue` |
| 销售管理 | `frontend/app/pages/sales.vue` |
| 设置 | `frontend/app/pages/settings.vue` |

4. 确认每个页面在 3 个宽度下均无横向溢出、无遮挡、表格可横滑、按钮可点击。

---

## 5. 代码定位速查表

> **目标：拿到任务后 30 秒内定位到要改的文件，不要做全仓库搜索。**

### 5.1 前端文件定位

#### 页面 → 组件 → composable → 类型 的对应关系

| 页面 | 入口文件 | 业务组件目录 | Composable | 类型定义 |
| --- | --- | --- | --- | --- |
| 仪表盘 | `pages/dashboard.vue` | `components/dashboard/` | `useReports.ts` | `types/report.ts` |
| 商品管理 | `pages/products.vue` | `components/products/` | `useProducts.ts` | `types/product.ts` |
| 库存管理 | `pages/inventory.vue` | `components/inventory/` | `useInventory.ts` | `types/inventory.ts` |
| 进货管理 | `pages/purchases.vue` | `components/purchases/` | `usePurchases.ts` | `types/purchase.ts` |
| 销售管理 | `pages/sales.vue` | `components/sales/` | `useSales.ts` | `types/sale.ts` |
| 设置 | `pages/settings.vue` | `components/settings/` | `useSettings.ts` | `types/settings.ts` |

> 以上路径都在 `frontend/app/` 下。例：完整路径是 `frontend/app/pages/dashboard.vue`。

#### 通用组件（不要重复造轮子）

| 组件 | 文件 | 用途 |
| --- | --- | --- |
| `AppShell` | `components/app/AppShell.vue` | 全局导航框架（顶栏 + 侧栏 + 主区域） |
| `PagePlaceholder` | `components/app/PagePlaceholder.vue` | 页面骨架屏 / 加载占位 |
| `AppButton` | `components/common/AppButton.vue` | 统一按钮样式 |
| `AppDialog` | `components/common/AppDialog.vue` | 弹窗 / 模态框 |
| `AppDrawer` | `components/common/AppDrawer.vue` | 侧滑抽屉 |
| `AppInput` | `components/common/AppInput.vue` | 输入框 |
| `DataTable` | `components/common/DataTable.vue` | 数据表格（已支持横向滚动） |
| `StatusBadge` | `components/common/StatusBadge.vue` | 状态标签 |

> 新增 UI 元素时，**先查看上表有没有现成组件**。不要自己写 `<dialog>` 或手搓表格。

#### 认证与请求基础设施

| 文件 | 职责 |
| --- | --- |
| `composables/useApi.ts` | `$fetch` 封装：自动加 `X-VM-Session` token、统一错误处理、loading 状态 |
| `composables/useAuth.ts` | 登录、登出、改密码等认证操作 |
| `composables/useClipboardImagePaste.ts` | 剪贴板图片粘贴（进货/销售单图片录入） |
| `stores/auth.ts` | 登录态、token、过期处理 |
| `stores/toast.ts` | 全局提示消息 |
| `plugins/auth.client.ts` | 启动时恢复登录态、路由守卫 |
| `types/api.ts` | `ApiError` / `ApiRequestOptions` 等通用 API 类型 |
| `types/auth.ts` | 登录响应、用户信息类型 |
| `utils/format.ts` | 金额（分→元）、日期、数量等格式化函数（业务代码反复用到，**不要重写**） |

> 改登录态、token 刷新、401 处理 → 看 `useApi.ts` + `stores/auth.ts`，不要去翻别的地方。

#### 样式文件分层

| 文件 | 职责 | 什么时候改 |
| --- | --- | --- |
| `assets/css/tokens.css` | CSS 变量（颜色、字号、间距、圆角） | 需要新增设计 token 时 |
| `assets/css/base.css` | 全局重置、body / html 基础样式 | 极少改动 |
| `assets/css/layout.css` | 页面布局骨架 | 调整侧栏 / 主区域布局时 |
| `assets/css/components.css` | 组件样式导入 | 极少改动 |

> 组件样式写在 `<style scoped>` 里。全局覆盖样式放 CSS 文件。不要混用。

### 5.2 后端文件定位

#### API 路由 → 文件 对应关系

| API 路径模式 | 处理文件 | 说明 |
| --- | --- | --- |
| `/api/auth/*` | `functions/api/auth/login.js` / `profile.js` / `update.js` | 登录、获取用户、改密码 |
| `/api/products` | `functions/api/products.js` | 商品 CRUD |
| `/api/settings` | `functions/api/settings.js` | 系统设置 CRUD |
| `/api/images/*` | `functions/api/images.js` | R2 图片读取 |
| `/api/inventory/*` | `functions/api/inventory/*.js` | 库存操作（余额、流水、进货、销售、调整、报损、退货、作废） |
| `/api/reports/*` | `functions/api/reports/dashboard.js` / `inventory.js` / `monthly.js` | 报表聚合 |
| `/api/ai-proxy` | `functions/api/ai-proxy.js` | AI 多模型代理 |

#### 后端共享模块

| 文件 | 职责 |
| --- | --- |
| `functions/api/_shared/auth.js` | 认证中间件（session 校验、密码哈希） |
| `functions/api/_shared/d1.js` | D1 查询辅助函数 |
| `functions/api/_shared/http.js` | HTTP 响应构建（JSON / 错误） |
| `functions/api/_shared/image-service.js` | R2 图片上传、关联、删除 |
| `functions/api/_shared/inventory-service.js` | **核心：库存台账逻辑**（余额计算、流水记录、对账） |
| `functions/api/_shared/validators.js` | 请求参数校验 |
| `functions/api/_middleware.js` | Pages Functions 全局中间件 |

> 改库存相关逻辑，**必须先读 `inventory-service.js`**，它是所有库存操作的唯一入口。

### 5.3 状态管理

| Store 文件 | 职责 |
| --- | --- |
| `stores/auth.ts` | 登录态、token、用户信息 |
| `stores/toast.ts` | 全局提示消息 |

> 状态管理只有 2 个 store，逻辑简单。大部分业务状态在 composable 里管理，不在 store。

---

## 6. 常见任务决策树

> **拿到任务后，按这棵树走，不要自己发明流程。**

### 6.1 判断任务类型

```
用户说了什么？
│
├─ "某个页面显示有问题 / 样式不对"
│   → §6.2 UI 修复流程
│
├─ "增加一个新功能 / 新页面"
│   → §6.3 新功能开发流程
│
├─ "接口报错 / 数据不对"
│   → §6.4 后端排查流程
│
├─ "修改文档 / 更新说明"
│   → 直接改文档，不跑构建，不启动服务
│
└─ "不确定"
    → 先问用户澄清，不要猜着做
```

### 6.2 UI 修复流程

```
1. 用户描述的问题在哪个页面？→ 查 §5.1 定位页面入口
2. 问题是组件级还是布局级？
   ├─ 组件级 → 找对应 components/ 子目录
   └─ 布局级 → 看 AppShell.vue 或 layout.css
3. 只改最小范围的文件
4. 跑 build.ps1 确认构建通过
5. 如果用户要求看效果 → 启动 dev 服务
6. commit + push
```

### 6.3 新功能开发流程

```
1. 明确功能需求，列出要新增/修改的文件
2. 按这个顺序写：
   ① types/ → 定义接口类型
   ② functions/api/ → 后端 API（如果需要）
   ③ composables/ → 前端数据层
   ④ components/ → UI 组件
   ⑤ pages/ → 页面集成
3. 每一步写完可以跑 build 确认不报错
4. 最后整体测试 → commit + push
```

### 6.4 后端排查流程

```
1. 确认报错的 API 路径 → 查 §5.2 定位处理文件
2. 检查相关的 _shared/ 模块
3. 如果涉及数据库 schema → 检查 migrations/ 目录
4. 修复后用 dev 服务验证 API 返回
5. commit + push
```

---

## 7. 前后端联调规则

> 改了前端调后端、或改了后端被前端调，必须检查两端一致性。

### 7.1 数据流向

```
类型定义 (types/*.ts)
    ↓ 前端使用
Composable (composables/use*.ts)  ←──→  API 端点 (functions/api/*.js)
    ↓ 前端使用                              ↓ 后端使用
组件 (components/*/*.vue)            共享模块 (_shared/*.js)
    ↓ 前端使用                              ↓ 后端使用
页面 (pages/*.vue)                   D1 数据库 / R2 存储
```

### 7.2 改动一致性检查清单

| 改了什么 | 必须同步检查 |
| --- | --- |
| API 返回字段名或结构 | 前端 `types/` 类型定义 + `composables/` 中的解析逻辑 |
| 前端请求参数 | 后端 `validators.js` 校验规则 + API 处理函数 |
| 数据库表结构（新迁移） | `inventory-service.js` 中的 SQL + 前端类型 |
| 新增 API 路由 | 对应 `composables/use*.ts` 中要新增请求方法（前端通过 `useApi().request('/path')` 调用，路径前缀由 `useApi.ts` 内部统一拼接，**不需要改 base URL**） |
| 删除 / 重命名 API | 全局搜索前端中对该路径的 `fetch` / `$fetch` 调用 |

### 7.3 API 请求约定

- 前端统一通过 `composables/useApi.ts` 封装的 `$fetch` 发请求。
- 认证 token 由 `stores/auth.ts` 管理，`useApi.ts` 自动附加。
- 后端认证由 `_shared/auth.js` 中间件统一处理。
- 不要在组件里直接写 `fetch('/api/...')`，必须走 composable。

---

## 8. AI 对话行为规范

> 减少对话轮次、减少用户等待时间。

### 8.1 不要过度解释

- ❌ 不要在每次改动前列出 "我现在要做的是……首先……然后……最后……"
- ✅ 直接说 "改 X 文件的 Y 函数" → 改 → 报告结果

### 8.2 不要反复确认显而易见的事

- ❌ "您是要我修改 products.vue 吗？" （用户已经说了改商品页面）
- ✅ 直接定位、修改、验证

### 8.3 错误处理

- 构建失败 → 先看报错信息，90% 是 TypeScript 类型错误或 import 路径错误
- 不要第一反应就重新搜索全仓库，先看报错指向的具体文件和行号
- 同一个错修了 2 次还没好 → 停下来重新理解错误，不要盲目试

### 8.4 不要做"好心"的额外工作

- 用户让你改一个按钮颜色 → 只改按钮颜色。不要顺手改排版、加动画、重构组件。
- 用户让你修一个 bug → 只修这个 bug。不要顺手升级依赖、重命名变量、调整代码风格。
- 用户没说要优化性能 → 不要主动做性能优化。

### 8.5 读文件的纪律

| 场景 | 正确做法 | 错误做法 |
| --- | --- | --- |
| 知道要改 `products.vue` | 直接打开 `products.vue` | 先 list 整个 `pages/` 目录，再 list `components/`，再逐个打开 |
| 找某个函数定义 | 用 grep 搜函数名，只在相关目录内搜 | 从根目录递归搜全仓库 |
| 检查 API 返回格式 | 打开对应的 `functions/api/` 文件 | 先打开 `_middleware.js`，再打开 `_shared/` 的每个文件 |
| 改 CSS 变量 | 直接打开 `tokens.css` | 先打开 `base.css`、`layout.css`、`components.css` 逐个看 |

### 8.6 命令执行纪律

- `build.ps1` 成功一次就够了，不要每改一行就跑一次构建。
- `dev.ps1 -SyncRemote` 启动后不要反复停止重启，除非改了后端文件。
- 前端改动在 dev 服务运行中会自动热更新（Nuxt HMR），**不需要重启**。
- 改了 `functions/api/` 的文件才需要重启 dev 服务。
- 不要在同一次任务中启动多个 dev 服务实例。
