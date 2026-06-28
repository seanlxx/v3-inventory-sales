import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadSettingsFunction() {
  const files = [
    ['functions/api/_shared/d1.js', 'd1'],
    ['functions/api/_shared/http.js', 'http'],
    ['functions/api/_shared/validators.js', 'validators'],
    ['functions/api/settings.js', 'settings']
  ];
  const sources = Object.fromEntries(await Promise.all(files.map(async ([relative, key]) => {
    const source = await fs.readFile(path.join(root, relative), 'utf8');
    return [key, source];
  })));

  const transformed = `
${sources.d1.replaceAll('export ', '')}
${sources.http.replaceAll('export ', '')}
${sources.validators.replaceAll('export ', '')}
${sources.settings
    .replace(/import .*?;\n/g, '')
    .replace('export async function onRequestPost', 'async function onRequestPost')
    .replace('export async function onRequestGet', 'async function onRequestGet')
    .replace('export async function onRequestPut', 'async function onRequestPut')
    .replace('export async function onRequestDelete', 'async function onRequestDelete')
    .replace('export function onRequest', 'function onRequest')}
module.exports = { onRequestPost };
`;

  const module = { exports: {} };
  const context = vm.createContext({
    Response,
    module,
    console
  });
  vm.runInContext(transformed, context, { filename: 'settings-test.vm.js' });
  return module.exports;
}

function writableSettingsDb() {
  const writes = [];
  return {
    writes,
    prepare: () => ({
      bind: (...params) => ({
        run: async () => {
          writes.push(params);
          return { success: true };
        }
      })
    })
  };
}

async function testAiClientConfigsDropsSecrets() {
  const api = await loadSettingsFunction();
  const db = writableSettingsDb();
  const request = new Request('https://app.test/api/settings', {
    method: 'POST',
    body: JSON.stringify({
      key: 'aiClientConfigs',
      value: {
        qwen: {
          apiKey: 'must-not-be-stored',
          apiKeyMasked: '********tored',
          baseUrl: 'https://must-not-be-stored.example/v1',
          modelId: 'qwen-test-model'
        }
      }
    })
  });

  const response = await api.onRequestPost({ request, env: { DB: db } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    key: 'aiClientConfigs',
    value: {
      qwen: {
        modelId: 'qwen-test-model'
      }
    }
  });

  const persisted = JSON.parse(db.writes[0][1]);
  assert.deepEqual(persisted.value, {
    qwen: {
      modelId: 'qwen-test-model'
    }
  });
}

await testAiClientConfigsDropsSecrets();

console.log('Settings AI secret handling tests passed');
