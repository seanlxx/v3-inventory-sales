import assert from 'node:assert/strict';

import { onRequest } from '../functions/api/_middleware.js';

function sessionDb() {
  return {
    prepare: (sql) => ({
      bind: (...params) => ({
        first: async () => {
          assert.match(sql, /FROM app_sessions/);
          assert.equal(typeof params[0], 'string');
          assert.equal(params[1] > new Date(0).toISOString(), true);
          return { username: 'admin', expires_at: '2999-01-01T00:00:00.000Z' };
        }
      })
    })
  };
}

async function callMiddleware(pathname) {
  let nextCalled = false;
  const response = await onRequest({
    request: new Request(`https://example.test${pathname}`, {
      headers: { 'X-VM-Session': 'valid-session' }
    }),
    env: { DB: sessionDb() },
    data: {},
    next: async () => {
      nextCalled = true;
      return new Response('ok', { status: 200 });
    }
  });
  return { response, nextCalled };
}

for (const pathname of [
  '/api/images',
  '/api/products',
  '/api/inventory/balances',
  '/api/reports/dashboard',
  '/api/integrations/zn/import',
  '/api/integrations/shengma/sync'
]) {
  const { response, nextCalled } = await callMiddleware(pathname);
  assert.equal(response.status, 410, `${pathname} should be archived`);
  assert.equal(nextCalled, false, `${pathname} should not reach legacy handler`);
  const body = await response.json();
  assert.equal(body.code, 'LEGACY_SYSTEM_ARCHIVED');
}

for (const pathname of [
  '/api/profit/summary',
  '/api/settings',
  '/api/ai-proxy'
]) {
  const { response, nextCalled } = await callMiddleware(pathname);
  assert.equal(response.status, 200, `${pathname} should stay active`);
  assert.equal(nextCalled, true, `${pathname} should reach active handler`);
}

console.log('legacy API archive tests passed');
