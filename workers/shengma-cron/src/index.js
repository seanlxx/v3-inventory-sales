// Cloudflare Worker: shengma 自动同步触发器
// 由 Cron Triggers 每 5 分钟唤醒一次，复用 Pages Functions 里的同步逻辑。
// 与 Pages 共享同一个 D1 (DB) 与 R2 (IMAGES) 绑定；通过 wrangler.jsonc 配置。

import { runShengmaAutoSync } from '../../../functions/api/_shared/shengma/service.js';

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runShengmaAutoSync(env, {}).catch((error) => {
      console.error('[shengma-cron] auto sync failed', error);
    }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' }
      });
    }
    if (url.pathname === '/run' && request.method === 'POST') {
      // 内部手动触发：依赖与 cron 相同的 schedule 判断；要强制可加 ?force=1
      const force = url.searchParams.get('force') === '1';
      try {
        const result = await runShengmaAutoSync(env, { force });
        return new Response(JSON.stringify(result), {
          headers: { 'content-type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ message: error instanceof Error ? error.message : 'sync failed' }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        });
      }
    }
    return new Response('Not found', { status: 404 });
  }
};
