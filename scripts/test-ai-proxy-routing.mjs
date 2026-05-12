import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadCloudflareProxy() {
  const filePath = path.join(root, 'functions', 'api', 'ai-proxy.js');
  const source = await fs.readFile(filePath, 'utf8');
  const transformed = source
    .replace('export async function onRequestGet', 'async function onRequestGet')
    .replace('export async function onRequestPost', 'async function onRequestPost')
    .replace('export function onRequest', 'function onRequest')
    + '\nmodule.exports = { onRequestGet, onRequestPost, onRequest };\n';

  const module = { exports: {} };
  const calls = [];
  const context = vm.createContext({
    AbortController,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    Response,
    crypto: webcrypto,
    TextEncoder,
    URL,
    clearTimeout,
    console,
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"items":[]}' } }] })
      };
    },
    module,
    setTimeout
  });
  vm.runInContext(transformed, context, { filename: filePath });
  return { api: module.exports, calls };
}

function sessionDb() {
  return {
    prepare: (sql) => ({
      bind: (...params) => ({
        first: async () => {
          assert.match(sql, /FROM app_sessions/);
          assert.equal(params[1] > new Date(0).toISOString(), true);
          return { username: 'admin', expires_at: '2999-01-01T00:00:00.000Z' };
        }
      })
    })
  };
}

function proxyBody(overrides = {}) {
  return {
    modelId: 'gpt-5.4-mini',
    userPrompt: 'recognize sales from image',
    imageBase64: 'abc123',
    mimeType: 'image/jpeg',
    maxTokens: 128,
    clientConfig: {
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1'
    },
    ...overrides
  };
}

function assertChatCompletionImageCall(call) {
  assert.equal(call.url, 'https://example.test/v1/chat/completions');
  const payload = JSON.parse(call.options.body);
  assert.equal(payload.model, 'gpt-5.4-mini');
  const content = payload.messages.at(-1).content;
  assert.equal(content[0].type, 'text');
  assert.equal(content[1].type, 'image_url');
  assert.equal(content[1].image_url.url, 'data:image/jpeg;base64,abc123');
}

async function testCloudflareImageRouting() {
  const { api, calls } = await loadCloudflareProxy();
  const request = new Request('https://app.test/api/ai-proxy', {
    method: 'POST',
    body: JSON.stringify(proxyBody()),
    headers: { 'X-VM-Session': 'valid-session' }
  });
  const response = await api.onRequestPost({ request, env: { DB: sessionDb() } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assertChatCompletionImageCall(calls[0]);
}

async function testTextJsonRouting() {
  const { api, calls } = await loadCloudflareProxy();
  const request = new Request('https://app.test/api/ai-proxy', {
    method: 'POST',
    headers: { 'X-VM-Session': 'valid-session' },
    body: JSON.stringify(proxyBody({
      imageBase64: undefined,
      mimeType: undefined,
      jsonSchema: { type: 'object' }
    }))
  });
  const response = await api.onRequestPost({ request, env: { DB: sessionDb() } });
  assert.equal(response.status, 200);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
  assert.deepEqual(payload.response_format, { type: 'json_object' });
}

async function testRequiresSession() {
  const { api, calls } = await loadCloudflareProxy();
  const request = new Request('https://app.test/api/ai-proxy', {
    method: 'POST',
    body: JSON.stringify(proxyBody())
  });
  const response = await api.onRequestPost({ request, env: { DB: sessionDb() } });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
}

await testCloudflareImageRouting();
await testTextJsonRouting();
await testRequiresSession();

console.log('AI proxy routing tests passed');
