# AGENTS.md

> 本文件是本仓库唯一的项目说明与 AI 操作规范。
> 前半部分（§1–§2）面向人类读者，后半部分（§3）面向 AI agent。
> **开始任何任务前先读完本文件。**

---

## 1. 项目概况

无人售货机库存、进货、销售、利润与 AI 辅助管理系统。

**技术栈：** 纯静态前端（HTML + CSS + 原生 JS） + Cloudflare Pages Functions（边缘 API） + D1（SQLite） + R2（图片存储）。

### 1.1 架构总览

```
┌──────────────────────────────────────────────────────────┐
│  浏览器（index.html + js/*.js + css/*.css）               │
│  页面：仪表盘 / 商品管理 / 进货管理 / 销售管理 / AI补货 / 设置  │
└────────────────────────┬─────────────────────────────────┘
                         │ fetch /api/*
┌────────────────────────▼─────────────────────────────────┐
│  Cloudflare Pages Functions（functions/api/）             │
│  ├─ records.js   → CRUD：商品、进货、销售、设置、图片        │
│  └─ ai-proxy.js  → AI 模型代理（多 provider 路由）         │
│                                                          │
│  绑定：DB (D1)  ·  IMAGES (R2)  ·  环境变量 (API Key)     │
└──────────────────────────────────────────────────────────┘
```

### 1.2 目录结构

```
.
├── index.html              # 前端入口（单页应用）
├── css/
│   ├── style.css           # 主样式（~206 KB）
│   └── style.fixes.css     # 补丁样式
├── js/
│   ├── utils.js            # 通用工具函数
│   ├── db.js               # D1 API 封装（fetch /api/records）
│   ├── app.js              # 应用入口：路由、登录、侧边栏
│   ├── dashboard.js        # 仪表盘页面
│   ├── products.js         # 商品管理页面
│   ├── purchases.js        # 进货管理页面
│   ├── sales.js            # 销售管理页面
│   └── ai.js               # AI 补货建议页面
├── functions/api/
│   ├── records.js          # 核心 CRUD API（含认证、分页、图片上传）
│   └── ai-proxy.js         # AI 多模型代理路由
├── migrations/
│   ├── 0001_initial_d1_schema.sql
│   ├── 0002_chunk_record_images.sql
│   ├── 0003_cap_password_pbkdf2_iterations.sql
│   └── 0004_r2_image_keys.sql
├── scripts/
│   ├── build.ps1           # 构建 dist/（CSS 压缩 + 复制）
│   ├── dev.ps1             # 本地开发（构建 → 迁移 → wrangler pages dev）
│   ├── sync-d1-remote-to-local.ps1
│   ├── build.mjs           # Node 构建辅助
│   ├── test-ai-proxy-routing.mjs
│   ├── test-ai-purchase-recognition.mjs
│   └── test-products-filtering.mjs
├── public_headers          # Pages 安全响应头 → 构建时复制为 dist/_headers
├── wrangler.jsonc           # Cloudflare 部署配置
├── AGENTS.md               # ← 你正在读的文件
├── CLAUDE.md               # Claude 专用指令（OpenACP 本地工作区说明）
└── .gitignore
```

**不手工编辑 / 不提交的目录：**

| 路径 | 说明 |
| --- | --- |
| `dist/` | 构建产物，由 `scripts/build.ps1` 生成 |
| `.wrangler/` | wrangler 本地缓存 |
| `.sisyphus/` | 本地编排状态 |
| `.openacp/` | OpenACP 本地工作区（含 secrets） |

### 1.3 Cloudflare 绑定

| 类型 | 绑定名 | 资源名 |
| --- | --- | --- |
| D1 数据库 | `DB` | `vending-inventory-sales-db` |
| R2 存储桶 | `IMAGES` | `vending-inventory-sales-images` |

- Pages 输出目录：`./dist`
- 数据库迁移目录：`migrations/`
- 兼容性日期：`2026-05-05`

### 1.4 数据模型

所有业务数据存储在 `vending_records` 表中，通过 `store` 字段区分类型：

| store 值 | 用途 | 关键索引列 |
| --- | --- | --- |
| `products` | 商品信息 | `machine_id` |
| `purchases` | 进货记录 | `product_id`, `record_date` |
| `sales` | 销售记录 | `machine_id`, `year_month`, `record_date` |
| `settings` | 系统设置 | — |

- 每条记录的业务数据以 JSON 存储在 `data` 列。
- 图片存储在 R2（`IMAGES` 绑定），由 `vending_record_images` 表 + R2 key 关联。
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
                          https://github.com/seanlxx/v2-inventory-sales.git
                                        │
                          Cloudflare Pages 自动拉取 → 构建 → 部署上线
```

- **代码仓库：** `https://github.com/seanlxx/v2-inventory-sales.git`
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
git -C "C:\Users\Admin\Desktop\v2-inventory-sales" add -A
git -C "C:\Users\Admin\Desktop\v2-inventory-sales" commit -m "<简明描述本次改动>"
git -C "C:\Users\Admin\Desktop\v2-inventory-sales" push origin master
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
| UI / 前端逻辑 | `index.html`, `css/`, `js/` | 跑构建让 `dist/` 重生成 |
| Cloudflare API | `functions/api/` | 同步检查相关前端调用 |
| 数据库结构 | `migrations/`（新建迁移文件） | 直接相关的数据访问代码 |
| 脚本 | `scripts/` 中目标脚本 | 本文件相关章节 |
| 文档 / 配置说明 | 本文件 | **不要跑构建或启动服务** |

### 3.4 验证策略

> 需要在本地看到真实页面效果时，先用 `dev.ps1 -SyncRemote`（或 `dev.bat`）同步线上数据并启动本地服务。

| 改了什么 | 怎么验证 |
| --- | --- |
| 前端源文件（CSS / JS / HTML） | ① 跑 `scripts/build.ps1` 确认构建通过；② 需要真实数据时用 `dev.ps1 -SyncRemote` 或 `dev.bat` 启动本地服务，浏览器打开 `localhost:8788` 检查页面 |
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
| 4 | 把已存在的同名规则再加一遍到 `style.fixes.css`，而不是直接修改 |
| 5 | 把 `.env` / 恢复码 / D1 导出 SQL 的内容粘到对话或文档里 |
| 6 | 修完一个点顺手重构邻近无关代码 |
| 7 | 修改了 `dev.bat` 的启动流程后，忘记同步更新本文件中的启动说明 |

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
| 7 | 不手工修改 `dist/`，只改 `index.html`、`css/`、`js/`，然后运行构建 |

### 4.2 修复时优先检查的文件

```
css/style.css           ← 主样式，媒体查询在这里
css/style.fixes.css     ← 补丁样式，新修复优先加在这里
index.html              ← 结构与布局容器
js/<对应页面>.js         ← 动态渲染的 DOM 结构
```

### 4.3 验证方式

1. 用 `dev.ps1 -SyncRemote` 或 `dev.bat` 启动本地服务（必须同步线上数据，否则看到的不是线上真实业务数据）。
2. 用浏览器 DevTools 模拟以下宽度逐一截图检查：**375px · 390px · 430px**。
3. **必须检查全部 6 个页面：**

| 页面 | 对应 JS |
| --- | --- |
| 仪表盘 | `js/dashboard.js` |
| 商品管理 | `js/products.js` |
| 进货管理 | `js/purchases.js` |
| 销售管理 | `js/sales.js` |
| AI 补货 | `js/ai.js` |
| 设置 | `js/app.js`（设置页面逻辑在 app.js 中） |

4. 确认每个页面在 3 个宽度下均无横向溢出、无遮挡、表格可横滑、按钮可点击。
