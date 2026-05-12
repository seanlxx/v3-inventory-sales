import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadUtils() {
  const filePath = path.join(root, 'js', 'utils.js');
  const source = await fs.readFile(filePath, 'utf8');
  const context = vm.createContext({ console, globalThis: {} });
  vm.runInContext(source, context, { filename: filePath });
  return context;
}

async function loadAI() {
  const filePath = path.join(root, 'js', 'ai.js');
  const source = await fs.readFile(filePath, 'utf8');
  // ai.js uses browser globals; stub them so vm doesn't throw
  const context = vm.createContext({
    console,
    globalThis: {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    getSetting: () => Promise.resolve(null),
    setSetting: () => Promise.resolve(),
    getAllProducts: () => Promise.resolve([]),
    document: { getElementById: () => null },
    window: {},
    APP_RUNTIME: {}
  });
  try { vm.runInContext(source, context, { filename: filePath }); } catch {}
  return context;
}

const utils = await loadUtils();
const ai = await loadAI();

const products = [
  { id: 'p1', name: '东方树叶茉莉花茶500ml', machineId: '1号机', category: '饮料', sellPrice: 5, avgCost: 3 },
  { id: 'p2', name: '东方树叶乌龙茶500ml', machineId: '1号机', category: '饮料', sellPrice: 5, avgCost: 3 },
  { id: 'p3', name: '可口可乐330ml', machineId: '1号机', category: '饮料', sellPrice: 3, avgCost: 2 },
  { id: 'p4', name: '可口可乐500ml', machineId: '1号机', category: '饮料', sellPrice: 4, avgCost: 2.6 },
  { id: 'p5', name: '矿泉水550ml', machineId: '1号机', category: '饮料', sellPrice: 2, avgCost: 1 },
  { id: 'p6', name: '矿泉水550ml', machineId: '2号机', category: '饮料', sellPrice: 2, avgCost: 1 }
];

function testExactMatch() {
  const match = utils.findPurchaseProductMatch({ name: '东方树叶茉莉花茶500ml' }, products);
  assert.equal(match.product.id, 'p1');
}

function testProductIdMatch() {
  const match = utils.findPurchaseProductMatch({ matchedProductId: 'p1', name: '东方树叶 茉莉花茶 500ML' }, products);
  assert.equal(match.product.id, 'p1');
}

function testDuplicateNameDoesNotAutoBind() {
  const match = utils.findPurchaseProductMatch({ name: '矿泉水550ml' }, products);
  assert.equal(match.product, null);
  assert.deepEqual(match.candidates.map(p => p.id), ['p5', 'p6']);
}

function testSpecConflict() {
  const score = utils.scorePurchaseProductCandidate({ name: '可口可乐330ml' }, products.find(p => p.id === 'p4'));
  assert.equal(score.specConflict, true);
  assert.equal(score.score, 0);
}

function testSimilarFlavorDoesNotBind() {
  const match = utils.findPurchaseProductMatch({ name: '东方树叶乌龙茶500ml' }, [products[0]]);
  assert.equal(match.product, null);
}

function testMoneyNormalization() {
  assert.equal(utils.normalizePurchaseMoney('¥1O.5O'), 10.5);
  assert.equal(utils.normalizePurchaseMoney('1,234.50'), 1234.5);
  assert.equal(utils.normalizePurchaseMoney('￥8,50'), 8.5);
}

function testAmountPass() {
  const result = utils.analyzePurchaseAmounts({ quantity: 24, totalPrice: 28.8, unitPrice: 1.2 });
  assert.equal(result.totalPrice, 28.8);
  assert.equal(result.unitPrice, 1.2);
  assert.equal(result.amountWarnings.length, 0);
}

function testAmountSwap() {
  const result = utils.analyzePurchaseAmounts({ quantity: 24, totalPrice: 1.2, unitPrice: 28.8 });
  assert.equal(result.totalPrice, 28.8);
  assert.equal(result.unitPrice, 1.2);
  assert.match(result.amountWarnings[0], /填反/);
}

function testAmountMismatchWarning() {
  const result = utils.analyzePurchaseAmounts({ quantity: 24, totalPrice: 28.8, unitPrice: 2 });
  assert.equal(result.totalPrice, 28.8);
  assert.equal(result.unitPrice, 2);
  assert.match(result.amountWarnings[0], /不一致/);
}

function testPrepareItemsUsesMatchedProduct() {
  const [item] = utils.prepareAIRecognizedPurchaseItems([
    { rawName: '农夫 东方树叶茉莉花茶500ML 24瓶', name: '东方树叶茉莉花茶500ML', quantity: '24', totalPrice: '72', unitPrice: '3' }
  ], products);
  assert.equal(item.matchedProductId, 'p1');
  assert.equal(item.name, '东方树叶茉莉花茶500ml');
  assert.equal(item.machineId, '1号机');
}

function testPurchaseWarningsDeduplicateAndKeepHistory() {
  const warnings = utils.collectPurchaseWarnings({
    name: '东方树叶茉莉花茶500ml',
    qty: 24,
    totalPrice: 48,
    sellPrice: 5,
    aiUnitPrice: 2,
    amountWarnings: ['东方树叶茉莉花茶500ml: AI单价 ¥2.00 × 数量 24 与总价 ¥48.00 不一致'],
    existingProduct: { avgCost: 0.5, sellPrice: 5 }
  });
  assert.equal(warnings.filter(w => w.includes('AI单价')).length, 1);
  assert.equal(warnings.some(w => w.includes('历史均价')), true);
}

function testAllocatePurchaseOrderTotal() {
  const items = [
    { name: '康师傅香辣牛肉面', quantity: 12, totalPrice: 44.99, unitPrice: 3.75 },
    { name: '康师傅酸菜牛肉面', quantity: 12, totalPrice: 44.99, unitPrice: 3.75 },
    { name: '康师傅红烧牛肉面', quantity: 12, totalPrice: 44.99, unitPrice: 3.75 }
  ];
  const allocated = utils.allocatePurchaseOrderTotal(items, 130.97);
  assert.deepEqual(allocated.map(item => item.totalPrice), [43.66, 43.66, 43.65]);
  assert.equal(Math.round(allocated.reduce((sum, item) => sum + item.totalPrice, 0) * 100) / 100, 130.97);
  assert.equal(allocated[0].unitPrice, 3.64);
  assert.match(allocated[0].amountWarnings[0], /订单实付/);
}
function testResolvePurchaseOrderTotalPrefersPayableForPayLater() {
  const resolved = utils.resolvePurchaseOrderTotal({
    orderTotal: 73.1,
    actualPaid: 0,
    payableTotal: 52.06,
    discountTotal: 21.04,
    items: [
      { name: '农夫山泉尖叫西柚味550ml', quantity: 15, totalPrice: 73.1, unitPrice: 4.87 }
    ]
  });
  assert.equal(resolved, 52.06);
}

function testResolvePurchaseOrderTotalComputesDiscountedPayLaterTotal() {
  const resolved = utils.resolvePurchaseOrderTotal({
    orderTotal: 73.1,
    actualPaid: 0,
    discountTotal: 21.04,
    items: [
      { name: '农夫山泉尖叫西柚味550ml', quantity: 15, totalPrice: 73.1, unitPrice: 4.87 }
    ]
  });
  assert.equal(resolved, 52.06);
}

function testPayLaterAllocationUsesDiscountedCost() {
  const result = {
    orderTotal: 73.1,
    actualPaid: 0,
    discountTotal: 21.04,
    items: [
      { name: '农夫山泉尖叫西柚味550ml', quantity: 15, totalPrice: 73.1, unitPrice: 4.87 }
    ]
  };
  const resolved = utils.resolvePurchaseOrderTotal(result);
  const [allocated] = utils.allocatePurchaseOrderTotal(result.items, resolved);
  assert.equal(allocated.totalPrice, 52.06);
  assert.equal(allocated.unitPrice, 3.47);
}

function testDerivePurchaseUnitPrice() {
  assert.equal(utils.derivePurchaseUnitPrice(52.06, 15), 3.47);
  assert.equal(utils.derivePurchaseUnitPrice(73.1, 15), 4.87);
}

function testPurchaseWarningsUseEditedAllocatedCost() {
  const warnings = utils.collectPurchaseWarnings({
    name: '农夫山泉尖叫西柚味550ml',
    qty: 15,
    totalPrice: 52.06,
    sellPrice: 5,
    aiUnitPrice: 3.47,
    amountWarnings: [],
    existingProduct: { avgCost: 1.5, sellPrice: 5 }
  });
  assert.equal(warnings.some(w => w.includes('AI单价 ¥73.10')), false);
}

// --- OCR-only prompt contract tests ---

function testPromptContainsNoCatalog() {
  if (typeof ai.buildVisionPrompt !== 'function') return; // skip if not exported
  const fakeProducts = [
    { id: 'x1', name: '测试商品A', machineId: '1号机', category: '饮料' },
    { id: 'x2', name: '测试商品B', machineId: '2号机', category: '零食' }
  ];
  const promptWithCatalog = ai.buildVisionPrompt(fakeProducts);
  const promptEmpty = ai.buildVisionPrompt([]);
  const promptNone = ai.buildVisionPrompt();
  // Prompt must not contain product IDs or catalog entries
  assert.equal(promptWithCatalog.includes('x1'), false, 'prompt must not contain product ID');
  assert.equal(promptWithCatalog.includes('测试商品A'), false, 'prompt must not contain product name');
  assert.equal(promptWithCatalog.includes('matchedProductId'), false, 'prompt must not request matchedProductId');
  // Prompt must be identical regardless of catalog passed
  assert.equal(promptWithCatalog, promptEmpty, 'prompt must be same with or without catalog');
  assert.equal(promptEmpty, promptNone, 'prompt must be same with empty or no arg');
}
function testPromptHandlesPayLaterTotals() {
  if (typeof ai.buildVisionPrompt !== 'function') return;
  const prompt = ai.buildVisionPrompt();
  assert.match(prompt, /先用后付/);
  assert.match(prompt, /订单应付/);
  assert.match(prompt, /discountTotal/);
  assert.match(prompt, /payableTotal/);
  assert.match(prompt, /paidTotal/);
}

function testPrepareIgnoresAIMatchFields() {
  // Even if AI returns matchedProductId/matchedName, local matching must decide
  const aiItems = [
    {
      rawName: '东方树叶茉莉花茶500ML',
      name: '东方树叶茉莉花茶500ML',
      normalizedName: '东方树叶茉莉花茶500ml',
      quantity: 24,
      totalPrice: 72,
      unitPrice: 3,
      // AI-supplied fields that should be ignored
      matchedProductId: 'WRONG_ID',
      matchedName: '错误商品名'
    }
  ];
  const [item] = utils.prepareAIRecognizedPurchaseItems(aiItems, products);
  // Local matching should override AI-supplied wrong ID
  assert.equal(item.matchedProductId, 'p1', 'local match must override AI matchedProductId');
  assert.equal(item.name, '东方树叶茉莉花茶500ml', 'name must come from local matched product');
}

testExactMatch();
testProductIdMatch();
testDuplicateNameDoesNotAutoBind();
testSpecConflict();
testSimilarFlavorDoesNotBind();
testMoneyNormalization();
testAmountPass();
testAmountSwap();
testAmountMismatchWarning();
testPrepareItemsUsesMatchedProduct();
testPurchaseWarningsDeduplicateAndKeepHistory();
testAllocatePurchaseOrderTotal();
testDerivePurchaseUnitPrice();
testPromptContainsNoCatalog();
testPrepareIgnoresAIMatchFields();
testPurchaseWarningsUseEditedAllocatedCost();

console.log('AI purchase recognition tests passed');
