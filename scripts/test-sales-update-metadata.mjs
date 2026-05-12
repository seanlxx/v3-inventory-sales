import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const dbSource = readFileSync(join(projectRoot, 'js', 'db.js'), 'utf8');

const requests = [];
const context = {
  console,
  URL,
  window: {
    location: {
      origin: 'http://localhost'
    }
  },
  fetch: async (url, options = {}) => {
    requests.push({
      url,
      method: options.method,
      body: options.body ? JSON.parse(options.body) : null
    });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, received: requests.at(-1) })
    };
  }
};

vm.createContext(context);
vm.runInContext(`${dbSource}

globalThis.__runSalesUpdateRoutingTest = async function() {
  return await updateSale('s1', {
    machineId: 'machine-b',
    date: '2026-04-30',
    note: 'date only',
    items: [{ productId: 'p1', quantity: 2 }]
  });
};
`, context, { filename: 'js/db.js' });

const result = await context.__runSalesUpdateRoutingTest();

assert.equal(requests.length, 1, 'updateSale should make exactly one API request');
assert.equal(requests[0].method, 'PUT');
assert.equal(requests[0].url, 'http://localhost/api/inventory/sales?id=s1');
assert.deepEqual(requests[0].body, {
  machineId: 'machine-b',
  date: '2026-04-30',
  note: 'date only',
  items: [{ productId: 'p1', quantity: 2 }]
});
assert.equal(result.received.url, requests[0].url);

console.log('sales update routing regression tests passed');
