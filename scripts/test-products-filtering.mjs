import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const productsSource = readFileSync(join(projectRoot, 'js', 'products.js'), 'utf8');

const context = {
  console,
  window: {},
  debounce: callback => callback
};

vm.createContext(context);
vm.runInContext(productsSource, context, { filename: 'js/products.js' });

const products = [
  { id: 'p1', name: '冰镇绿茶', machineId: '1号机', category: '饮料' },
  { id: 'p2', name: '海盐柠檬水', machineId: '2号机', category: '饮料' }
];

assert.deepEqual(
  Array.from(context.getProductMachineOptions(['1号机'], products)),
  ['1号机', '2号机'],
  'existing product machines should be merged into configured machine options'
);

assert.equal(
  context.getActiveProductMachine(undefined, ['1号机', '2号机']),
  '',
  'product management should default to all machines'
);

const productNameMatches = products.filter(product => context.productMatchesProductFilters(product, {
  machine: '',
  category: 'all',
  search: '海盐柠檬水'
}));

assert.deepEqual(
  productNameMatches.map(product => product.id),
  ['p2'],
  'all-machine search should find a 2号机 product by product name'
);

const machineTextMatches = products.filter(product => context.productMatchesProductFilters(product, {
  machine: '',
  category: 'all',
  search: '2号机'
}));

assert.deepEqual(
  machineTextMatches.map(product => product.id),
  ['p2'],
  'searching 2号机 should match products assigned to 2号机'
);

console.log('products filtering regression tests passed');
