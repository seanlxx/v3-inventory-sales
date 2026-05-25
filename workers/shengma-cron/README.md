# shengma-cron Worker

由 Cloudflare Cron Triggers 每 5 分钟唤醒一次，调用 `functions/api/_shared/shengma/service.js` 中的 `runShengmaAutoSync`。
是否真正执行同步由前端"设置 → 三号机厂商同步 → 自动同步"里的调度配置决定（每日定时 / 固定间隔），到点才会触发。

## 一次性部署

```powershell
cd workers/shengma-cron
# 1) 写入盛码账号密码（与 Pages 项目里同名）
npx wrangler secret put SHENGMA_USERNAME
npx wrangler secret put SHENGMA_PASSWORD
# 可选：自定义 base url
# npx wrangler secret put SHENGMA_BASE_URL

# 2) 部署
npx wrangler deploy
```

部署成功后会自动按 cron 每 5 分钟唤醒一次。无需 GitHub。

## 手动触发（调试用）

```bash
curl -X POST https://v3-shengma-cron.<account>.workers.dev/run?force=1
```

`force=1` 会忽略调度条件强制运行；不带参数则与 cron 行为一致（到点才跑）。

## 与 Pages 的关系

- 共享同一个 D1 数据库（`v3-vending-inventory-sales-db`），所以 Worker 写库等价于 Pages 写库。
- Pages 那边的 `/api/integrations/shengma/auto-trigger` 仍然保留（带 `SHENGMA_CRON_TOKEN`），但已不再依赖。
