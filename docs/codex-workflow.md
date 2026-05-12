# Codex 开发流程优化

本仓库现在把 Codex 相关流程分成四层：本地验证、GitHub CI、Codex PR 审查、定期巡检。

## 本地验证

改动业务源码后优先运行：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/build.ps1
powershell -ExecutionPolicy Bypass -File ./scripts/test.ps1
```

`scripts/test.ps1` 会统一执行现有 Node 回归测试：

- `scripts/test-products-filtering.mjs`
- `scripts/test-ai-purchase-recognition.mjs`
- `scripts/test-ai-proxy-routing.mjs`

涉及 D1 schema 时额外运行：

```powershell
npx wrangler d1 migrations apply vending-inventory-sales-db --local
```

## GitHub CI

`.github/workflows/ci.yml` 会在 PR 和 push 到 `master` 时执行：

1. 构建静态站点。
2. 运行回归测试。
3. 在本地 D1 上验证迁移。

Cloudflare Pages 仍然按现有方式从 `master` 自动部署；CI 的作用是尽早发现坏提交。

## Codex PR 审查

`.github/workflows/codex-pr-review.yml` 会在 PR 打开、更新、重新打开或从草稿转为可审查时运行 Codex 审查，并把结果评论到 PR。

需要在 GitHub 仓库中配置 secret：

```text
OPENAI_API_KEY
```

审查 prompt 位于 `.github/codex/prompts/review.md`，重点覆盖认证、Cloudflare Functions、D1、R2、AI 代理和前端业务计算风险。

## 仓库 Skill

`.agents/skills/vending-release-check/SKILL.md` 是给 Codex 使用的仓库专用 skill。它把本项目的验证矩阵、敏感文件限制、提交推送规则集中到一个可复用工作流里。

在 Codex 中处理发布、验证、PR 修复或部署前检查任务时，可以显式提到 `$vending-release-check`。

## 定期巡检

建议用 Codex app automation 每周做只读巡检：

- 检查 `AGENTS.md`、CI、脚本和部署文档是否一致。
- 检查是否出现未提交的构建产物、敏感文件或本地导出。
- 检查 Cloudflare 配置、D1 migrations 和测试入口是否有漂移。

巡检只输出建议，不应自动修改文件。
