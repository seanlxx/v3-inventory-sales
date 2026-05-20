import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDir);

const purchasesComposable = readFileSync(join(root, 'frontend', 'app', 'composables', 'usePurchases.ts'), 'utf8');
const reviewDialog = readFileSync(join(root, 'frontend', 'app', 'components', 'purchases', 'PurchaseAiReviewDialog.vue'), 'utf8');
const productSearchSelect = readFileSync(join(root, 'frontend', 'app', 'components', 'common', 'ProductSearchSelect.vue'), 'utf8');

assert.ok(
  purchasesComposable.includes('/ai-proxy?stream=1'),
  'purchase AI recognition should call the server-side AI proxy stream'
);

assert.match(
  purchasesComposable,
  /AI 结果只用于人工确认，不能自动入账/,
  'purchase AI prompt must keep AI results out of automatic posting'
);

assert.match(
  purchasesComposable,
  /下单时间/,
  'purchase AI prompt should extract offline receipt dates from order time'
);

assert.match(
  purchasesComposable,
  /自动确认收货并付款¥106\.5/,
  'purchase AI prompt should prefer Pinduoduo automatic payment amount as real purchase cost'
);

assert.match(
  purchasesComposable,
  /date 优先用“发货时间”/,
  'purchase AI prompt should use Pinduoduo shipping time as purchase date'
);

assert.match(
  purchasesComposable,
  /normalizeAiCandidates\(parsed\?\.items \|\| \[\], products\.value\)/,
  'purchase AI candidates should be normalized against the local product list'
);

assert.match(
  purchasesComposable,
  /requestAiStream/,
  'purchase AI recognition should use streaming progress like sales recognition'
);

assert.match(
  purchasesComposable,
  /images: purchaseImages\.value\.map/,
  'purchase AI recognition should send multiple selected images to the AI proxy'
);

assert.match(
  reviewDialog,
  /multiple @change="handleFileChange"/,
  'purchase AI review dialog should support selecting multiple images at once'
);

assert.match(
  reviewDialog,
  /onImage: \(file: File\) => emit\('imageSelected', \[file\]\)/,
  'purchase AI review dialog should append pasted images to the recognition draft'
);

assert.match(
  purchasesComposable,
  /mergeAiCandidates/,
  'purchase AI recognition should merge duplicate products into one candidate'
);

assert.match(
  purchasesComposable,
  /isNewProduct/,
  'purchase AI recognition should keep unmatched items as new product drafts'
);

assert.match(
  purchasesComposable,
  /aiMetadata\.value = normalizeAiMetadata\(parsed\)/,
  'purchase AI metadata should be normalized from the recognition result'
);

assert.match(
  reviewDialog,
  /AI 结果只进入确认表，人工确认后才会调用进货入库接口/,
  'purchase AI review dialog should require human confirmation before posting'
);

assert.match(
  reviewDialog,
  /watch\(\(\) => props\.metadata/,
  'purchase AI review dialog should apply recognized metadata to the confirmation form'
);

assert.match(
  reviewDialog,
  /progressMessage/,
  'purchase AI review dialog should display recognition progress'
);

assert.match(
  reviewDialog,
  /新商品，需填写售价/,
  'purchase AI review dialog should require manual pricing for new products'
);

assert.match(
  productSearchSelect,
  /position: fixed/,
  'product search dropdown should escape table overflow clipping'
);

console.log('AI purchase recognition contract tests passed');
