import { json, methodNotAllowed, parseJsonBody } from '../../_shared/http.js';
import { runShengmaAutoSync } from '../../_shared/shengma/service.js';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function authorize(request, env) {
  const expected = String(env.SHENGMA_CRON_TOKEN || env.CRON_TOKEN || '').trim();
  if (!expected) return { ok: false, code: 503, message: '未配置 SHENGMA_CRON_TOKEN，无法接受外部调度' };
  const provided = request.headers.get('x-cron-token') || '';
  if (!timingSafeEqual(expected, provided.trim())) {
    return { ok: false, code: 401, message: 'Invalid cron token' };
  }
  return { ok: true };
}

export async function onRequestPost(context) {
  const auth = authorize(context.request, context.env);
  if (!auth.ok) return json(auth.code, { message: auth.message });

  const body = await parseJsonBody(context.request).catch(() => ({}));
  try {
    const result = await runShengmaAutoSync(context.env, { force: !!body?.force });
    return json(200, result);
  } catch (error) {
    return json(500, { message: error instanceof Error ? error.message : '自动同步失败' });
  }
}

export function onRequest() {
  return methodNotAllowed();
}
