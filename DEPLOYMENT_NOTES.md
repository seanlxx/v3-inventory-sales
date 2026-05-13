# 部署注意事项

本文件记录 v3 项目的 GitHub / Cloudflare Pages 关键信息，避免后续 agent 继续误判部署链路。

## 当前事实

| 项 | 值 |
| --- | --- |
| GitHub 仓库 | `seanlxx/v3-inventory-sales` |
| 仓库 ID | `1236634894` |
| 仓库 owner | `seanlxx` |
| 仓库 owner ID | `75605350` |
| 生产分支 | `master` |
| Cloudflare Pages 项目 | `v3-inventory-sales` |
| Pages 域名 | `https://v3-inventory-sales.pages.dev` |
| Pages Git integration | 已连接 GitHub |
| D1 绑定 | `DB` |
| D1 database_id | `2994755e-9625-4adc-a6f6-2e18c7b18bfe` |
| R2 绑定 | `IMAGES` |
| R2 bucket | `v3-vending-inventory-sales-images` |

## 重要结论

1. 当前仓库、分支和 `wrangler.jsonc` 项目名已经是 v3，不要再把问题归因到本地仓库指向 v2。
2. `v3-inventory-sales` Pages 项目必须保持 GitHub Git integration；`git push origin master` 后应自动触发 Cloudflare Pages 构建部署。
3. Direct Upload 创建的 Pages 项目不能后来改成 Git integration。若以后再次发现 `Git Provider = No`，不要反复改代码，应检查 Pages 项目创建方式。
4. 如果必须重建 Pages 项目，先备份旧项目配置，再删除旧项目并新建同名 Git-integrated Pages 项目，连接 GitHub 仓库 `seanlxx/v3-inventory-sales`，生产分支选择 `master`。

## Pages 构建配置

Cloudflare Pages Git 构建命令：

```sh
cd frontend && npm ci && npm run generate && cd .. && rm -rf dist && mkdir -p dist && cp -R frontend/dist/. dist/ && cp public_headers dist/_headers
```

输出目录：

```text
dist
```

注意：Cloudflare 构建环境中 `nuxt generate` 产物为 `frontend/dist`。不要使用本地 `scripts/build.ps1` 里的 `frontend/.output/public` 路径作为 Pages Git 构建命令，否则会导致构建失败。

## 操作红线

- 不要把 API Key、Cloudflare token、GitHub token 写入源码或 Markdown。
- 不要手工提交 `dist/`、`.wrangler/`、`.openacp/` 或数据库导出文件。
- 不要把 `production_branch` 改回 `main`；本仓库生产分支是 `master`。
- 不要为了触发部署做无意义代码改动。可以使用 Cloudflare Dashboard 或 Pages API 触发部署。
- 删除或重建 Pages 前必须确认 D1/R2 绑定能恢复。

## 快速验证

```powershell
git status --short
git branch --show-current
git remote -v
npx wrangler pages project list
npx wrangler pages deployment list --project-name v3-inventory-sales
```

期望结果：

- 当前分支是 `master`。
- `origin` 指向 `https://github.com/seanlxx/v3-inventory-sales.git`。
- `v3-inventory-sales` 的 `Git Provider` 是 `Yes`。
- 最新生产部署来自 `master` 分支。
