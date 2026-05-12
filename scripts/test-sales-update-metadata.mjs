import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const dbSource = readFileSync(join(projectRoot, 'js', 'db.js'), 'utf8');

const context = {
  console,
  window: {
    location: {
      origin: 'http://localhost'
    }
  }
};

vm.createContext(context);
vm.runInContext(`${dbSource}

function __clone(value) {
  return JSON.parse(JSON.stringify(value));
}

globalThis.__runSalesUpdateMetadataTest = async function() {
  const baseProduct = {
    id: 'p1',
    name: 'Test Tea',
    sellPrice: 9,
    avgCost: 4,
    currentStock: 8
  };
  const baseSale = {
    id: 's1',
    machineId: 'machine-a',
    date: '2026-05-01T10:00',
    yearMonth: '2026-05',
    totalAmount: 10,
    totalCogs: 6,
    items: [{
      productId: 'p1',
      productName: 'Test Tea',
      quantity: 2,
      actualDeducted: 2,
      sellPrice: 5,
      avgCost: 3,
      itemRevenue: 10,
      itemCogs: 6
    }],
    type: 'daily',
    note: 'old'
  };

  let records;
  let productUpdates;

  function resetRecords() {
    records = {
      [STORES.PRODUCTS]: { p1: __clone(baseProduct) },
      [STORES.SALES]: { s1: __clone(baseSale) }
    };
    productUpdates = [];
  }

  dbGet = async function(storeName, id) {
    return records[storeName] && records[storeName][id]
      ? __clone(records[storeName][id])
      : null;
  };

  dbPut = async function(storeName, data) {
    records[storeName][data.id] = __clone(data);
    return __clone(data);
  };

  updateProduct = async function(product) {
    productUpdates.push(__clone(product));
    records[STORES.PRODUCTS][product.id] = __clone(product);
    return __clone(product);
  };

  resetRecords();
  const metadataOnlySale = await updateSale('s1', {
    machineId: 'machine-b',
    date: '2026-04-30T09:00',
    note: 'date only',
    items: [{ productId: 'p1', quantity: 2 }]
  });
  const metadataOnlyUpdates = productUpdates.length;
  const metadataOnlyProduct = __clone(records[STORES.PRODUCTS].p1);

  resetRecords();
  const quantityChangedSale = await updateSale('s1', {
    machineId: 'machine-a',
    date: '2026-05-01T10:00',
    note: 'quantity changed',
    items: [{ productId: 'p1', quantity: 3 }]
  });
  const quantityChangedUpdates = productUpdates.length;
  const quantityChangedProduct = __clone(records[STORES.PRODUCTS].p1);

  return {
    metadataOnlySale,
    metadataOnlyUpdates,
    metadataOnlyProduct,
    quantityChangedSale,
    quantityChangedUpdates,
    quantityChangedProduct
  };
};
`, context, { filename: 'js/db.js' });

const result = await context.__runSalesUpdateMetadataTest();

assert.equal(result.metadataOnlyUpdates, 0, 'date-only edits should not update product inventory');
assert.equal(result.metadataOnlyProduct.currentStock, 8, 'date-only edits should keep product stock unchanged');
assert.equal(result.metadataOnlySale.date, '2026-04-30T09:00');
assert.equal(result.metadataOnlySale.yearMonth, '2026-04');
assert.equal(result.metadataOnlySale.machineId, 'machine-b');
assert.equal(result.metadataOnlySale.totalAmount, 10, 'date-only edits should preserve stored revenue');
assert.equal(result.metadataOnlySale.totalCogs, 6, 'date-only edits should preserve stored COGS');
assert.equal(result.metadataOnlySale.items[0].sellPrice, 5, 'date-only edits should preserve historical sell price');
assert.equal(result.metadataOnlySale.items[0].avgCost, 3, 'date-only edits should preserve historical cost');
assert.equal(result.metadataOnlySale.items[0].actualDeducted, 2, 'date-only edits should preserve actual deducted quantity');

assert.equal(result.quantityChangedUpdates, 2, 'quantity edits should still rollback and apply inventory');
assert.equal(result.quantityChangedProduct.currentStock, 7, 'quantity edits should apply the new deduction');
assert.equal(result.quantityChangedSale.totalAmount, 27, 'quantity edits should recalculate revenue from current product data');
assert.equal(result.quantityChangedSale.totalCogs, 12, 'quantity edits should recalculate COGS from current product data');
assert.equal(result.quantityChangedSale.items[0].actualDeducted, 3);

console.log('sales update metadata regression tests passed');
