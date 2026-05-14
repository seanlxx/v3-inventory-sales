---
name: pages-deploy-troubleshoot
description: 排查 v3 售货机管理系统推送到 GitHub 后 Cloudflare Pages 自动部署失败的问题。当用户提到"部署失败/构建报错/Pages 构建日志/push 后没上线/生产环境没更新/Cloudflare 报错/wrangler pages deploy"等时使用。覆盖构建失败、绑定缺失、迁移未应用、环境变量缺失等常见场景的诊断与修复流程。
---

# Cloudflare Pages 部署排查（v3）

> 本项目部署流程：本地改代码 → git push origin master → Cloudflare Pages 自动拉取 → 构建 → 部署上线。
> 看到部署失败，按本文走，不要盲目重试 push。

## 触发场景

- 用户描述：「push 了但线上没更新」「Cloudflare 构建失败」「Pages 报错」「生产环境 500」「D1 表不存在」
- 用户给出 Pages 构建日志截图 / 错误信息
- 用户说「本地 dev 正常，线上不行」

## 第一原则

| ✅ 做 | ❌ 不做 |
| --- | --- |
| 先看 Pages 构建日志，找具体报错 | 不要猜"可能是 XX"，先看日志 |
| 一次只改一个疑点 | 不要同时改 3 个地方再 push |
| 本地先跑 `scripts/build.ps1` 确认能构建 | 不要本地没验证就 push 试错 |
| 检查 wrangler.jsonc 绑定与线上一致 | 不要假设"应该自动绑定" |

## 部署流程回顾

```
本地修改 → git add → git commit → git push origin master
                                        ↓
                          GitHub 仓库收到 push
                          https://github.com/seanlxx/v3-inventory-sales.git
                                        ↓
                          Cloudflare Pages 自动拉取 → 构建 → 部署上线
                          ├─ 1. npm install（在 frontend/）
                          ├─ 2. npm run generate（Nuxt 静态生成 → dist/）
                          ├─ 3. 复制 public_headers → dist/_headers
                          ├─ 4. 部署 dist/ + functions/api/ 到 Pages
                          └─ 5. 绑定 D1 (DB) + R2 (IMAGES)
```

## 常见失败场景 → 直接对症

### 场景 1：构建阶段失败（npm install / npm run generate 报错）

**症状：** Pages 构建日志里看到 `npm ERR!` / `ERROR` / `Build failed`

**90% 是这几个原因：**

| 报错关键词 | 原因 | 修复 |
| --- | --- | --- |
| `Cannot find module 'xxx'` | 依赖缺失或版本不对 | 本地 `cd frontend && npm install`，确认 package.json 和 package-lock.json 都提交了 |
| `TypeScript error in xxx.vue` | 类型错误 | 本地跑 `scripts/build.ps1`，修到构建通过再 push |
| `Nuxt generate failed` | 页面渲染报错 | 检查 pages/*.vue 里有没有只在客户端才能跑的代码（如 `window` / `localStorage`），用 `<ClientOnly>` 包裹 |
| `ENOENT: no such file or directory` | 路径错误 | 检查 import 路径大小写（Windows 不敏感，Linux 敏感） |
| `Out of memory` | 构建内存不够 | 联系 Cloudflare 提高构建资源，或拆分大文件 |

**修复流程：**
```
① 本地跑 scripts/build.ps1，复现报错
② 修到本地构建通过
③ git add → commit → push
④ 看 Pages 构建日志确认通过
```

### 场景 2：构建通过，但运行时报错（500 / D1 表不存在 / R2 读取失败）

**症状：** Pages 构建成功，但访问页面 500 / API 报错 / 图片加载失败

**90% 是这几个原因：**

| 报错关键词 | 原因 | 修复 |
| --- | --- | --- |
| `Binding DB is not defined` | D1 绑定缺失 | 去 Cloudflare Dashboard → Pages 项目 → Settings → Functions → D1 database bindings，确认绑定了 `v3-vending-inventory-sales-db` 到变量名 `DB` |
| `no such table: xxx` | 迁移未应用 | 本地跑 `npx wrangler d1 migrations apply v3-vending-inventory-sales-db --remote`，把 migrations/ 应用到线上 D1 |
| `Binding IMAGES is not defined` | R2 绑定缺失 | 去 Cloudflare Dashboard → Pages 项目 → Settings → Functions → R2 bucket bindings，确认绑定了 `v3-vending-inventory-sales-images` 到变量名 `IMAGES` |
| `OPENCODE_API_KEY is not defined` | 环境变量缺失 | 去 Pages 项目 → Settings → Environment variables，添加 AI provider 的 API key（见下表） |
| `Cannot read properties of undefined` | 代码里假设某个绑定一定存在 | 加防御性检查：`if (!env.DB) throw new Error('DB binding missing')` |

**AI provider 环境变量清单：**
| Provider | 变量名 | 说明 |
| --- | --- | --- |
| OpenCode | `OPENCODE_API_KEY` / `OPENCODE_BASE_URL` | AI 进货单识别 |
| 通义千问 | `QWEN_API_KEY` / `QWEN_BASE_URL` | 可选 |
| DeepSeek | `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | 可选 |
| Claude | `CLAUDE_API_KEY` / `CLAUDE_BASE_URL` | 可选 |
| 云雾 | `YUNWU_API_KEY` / `YUNWU_BASE_URL` | 可选 |

> ⚠️ 不要把 API key 写入源码或 wrangler.jsonc，只在 Pages 环境变量里配。

**修复流程：**
```
① 去 Cloudflare Dashboard 检查绑定和环境变量
② 缺什么补什么
③ Pages 会自动重新部署（或手动点 "Retry deployment"）
④ 访问线上页面确认正常
```

### 场景 3：构建通过，但页面空白 / 404

**症状：** 访问线上域名，看到空白页 / 404 / "Page not found"

**90% 是这几个原因：**

| 症状 | 原因 | 修复 |
| --- | --- | --- |
| 首页空白，控制台报 JS 错误 | dist/ 没正确生成 | 检查 `scripts/build.ps1` 是否把 `frontend/dist/` 复制到根目录 `dist/` |
| 所有页面 404 | Pages 输出目录配错 | 去 Pages 项目 → Settings → Builds and deployments → Build output directory，确认是 `dist` |
| `/api/*` 404 | functions/api/ 没部署 | 确认 `functions/api/` 在仓库根目录，Pages 会自动识别 |
| 静态资源 404（CSS / JS） | `_headers` 没生成 | 确认 `public_headers` 被复制为 `dist/_headers` |

**修复流程：**
```
① 本地跑 scripts/build.ps1，检查 dist/ 内容
② 确认 dist/ 里有 index.html / _nuxt/ / _headers
③ 去 Pages Dashboard 检查 Build output directory 配置
④ 重新部署
```

### 场景 4：本地 dev 正常，线上不行

**症状：** `dev.bat` 启动后一切正常，push 后线上报错

**90% 是这几个原因：**

| 差异点 | 本地 | 线上 | 修复 |
| --- | --- | --- | --- |
| 数据库 | 本地 `.wrangler/state/v3/d1/` | 远程 D1 | 本地跑 `npx wrangler d1 migrations apply ... --remote` |
| 环境变量 | `.env` / 本地 wrangler.toml | Pages 环境变量 | 去 Pages Dashboard 补环境变量 |
| Node 版本 | 本地可能 20.x | Pages 默认 18.x | 在 Pages 项目 → Settings → Environment variables 加 `NODE_VERSION=20` |
| 文件路径大小写 | Windows 不敏感 | Linux 敏感 | 检查 import 路径大小写 |

**修复流程：**
```
① 对照上表，找本地和线上的差异
② 补齐线上缺的配置 / 迁移
③ 重新部署
```

## 诊断工具箱

### 1. 查看 Pages 构建日志
```
Cloudflare Dashboard → Pages → 项目 → Deployments → 点最新一次 → View build log
```
90% 的问题在这里能看到具体报错。

### 2. 查看 Pages 实时日志（运行时错误）
```
Cloudflare Dashboard → Pages → 项目 → Functions → Real-time Logs
```
看 API 请求的报错堆栈。

### 3. 本地模拟生产构建
```powershell
cd frontend
npm run generate
# 检查 frontend/dist/ 是否正常生成
```

### 4. 检查远程 D1 表结构
```powershell
npx wrangler d1 execute v3-vending-inventory-sales-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```
确认 migrations/ 是否都应用了。

### 5. 检查绑定配置
```powershell
# 查看 wrangler.jsonc 里的绑定定义
Get-Content wrangler.jsonc | Select-String -Pattern "d1_databases|r2_buckets"
```
对照 Pages Dashboard 里的实际绑定。

## 回滚策略

如果新版本上线后出问题，快速回滚：

```
Cloudflare Dashboard → Pages → 项目 → Deployments
→ 找上一个正常的部署 → 点右侧 "..." → Rollback to this deployment
```

或者本地回滚代码：
```powershell
git log --oneline -10  # 找上一个正常的 commit
git revert <commit-hash>  # 生成一个反向 commit
git push origin master
```

> ⚠️ 不要用 `git reset --hard` + `git push --force`，会丢失历史。

## 验证清单（修复后过一遍）

- [ ] Pages 构建日志显示 "Success"
- [ ] 访问线上域名，首页正常加载
- [ ] 登录功能正常（说明 D1 绑定 + 迁移都对）
- [ ] 随便点一个页面，数据正常显示
- [ ] 如果改了 API，用浏览器 DevTools Network 看请求返回正常
- [ ] 如果涉及图片，检查图片能正常加载（说明 R2 绑定对）

## 反模式（看到立即停）

- 本地没跑 `scripts/build.ps1` 就 push 试错
- 同时改了 3 个地方（代码 + 绑定 + 环境变量），不知道哪个生效了
- 看到报错不读日志，直接问"为什么部署失败"
- 把 API key 写入 wrangler.jsonc 或源码里
- 用 `git push --force` 覆盖远程历史

## 完成后

回复时说明：
1. 具体是哪个场景（构建失败 / 绑定缺失 / 迁移未应用 / 环境变量缺失）
2. 做了什么修复（改了代码 / 补了绑定 / 应用了迁移 / 加了环境变量）
3. 线上验证结果（访问哪个 URL 确认正常）
4. 如果改了代码，附上 commit hash
