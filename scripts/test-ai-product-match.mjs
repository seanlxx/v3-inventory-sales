import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDir);

const matchUtil = readFileSync(join(root, 'frontend', 'app', 'utils', 'product-match.ts'), 'utf8');
const salesComposable = readFileSync(join(root, 'frontend', 'app', 'composables', 'useSales.ts'), 'utf8');
const purchasesComposable = readFileSync(join(root, 'frontend', 'app', 'composables', 'usePurchases.ts'), 'utf8');

// ── 1. product-match.ts 必须存在并导出关键 API ──────────────────────────────
assert.match(matchUtil, /export function normalizeProductName/, 'product-match must export normalizeProductName');
assert.match(matchUtil, /export function matchProductByName/, 'product-match must export matchProductByName');
assert.match(matchUtil, /export function buildProductCatalogPrompt/, 'product-match must export buildProductCatalogPrompt');

// ── 2. 单位/修饰词归一化规则必须覆盖核心同义 ───────────────────────────────
assert.match(matchUtil, /毫升/, 'unit synonyms must cover 毫升 → ml');
assert.match(matchUtil, /千克/, 'unit synonyms must cover 千克 → kg');
assert.match(matchUtil, /公斤/, 'unit synonyms must cover 公斤 → kg');
assert.match(matchUtil, /瓶装/, 'stopwords must cover 瓶装');
assert.match(matchUtil, /value\s*\*\s*1000/, 'L → ml conversion must be present');

// ── 3. useSales 必须使用新匹配工具，并注入商品清单 prompt ─────────────────
assert.match(
  salesComposable,
  /from '~\/utils\/product-match'/,
  'useSales must import product-match utilities'
);
assert.match(
  salesComposable,
  /matchProductByName\(/,
  'useSales must run fuzzy matching as fallback'
);
assert.match(
  salesComposable,
  /buildProductCatalogPrompt\(/,
  'useSales must inject product catalog into AI prompt'
);
assert.match(
  salesComposable,
  /AI 结果只用于人工确认，不能自动入账/,
  'useSales prompt must keep human-confirmation guarantee'
);

// ── 4. usePurchases 必须做相同的事 ───────────────────────────────────────
assert.match(
  purchasesComposable,
  /from '~\/utils\/product-match'/,
  'usePurchases must import product-match utilities'
);
assert.match(
  purchasesComposable,
  /matchProductByName\(/,
  'usePurchases must run fuzzy matching as fallback'
);
assert.match(
  purchasesComposable,
  /buildProductCatalogPrompt\(/,
  'usePurchases must inject product catalog into AI prompt'
);
assert.match(
  purchasesComposable,
  /AI 结果只用于人工确认，不能自动入账/,
  'usePurchases prompt must keep human-confirmation guarantee'
);

// ── 5. AI 候选必须优先采用 AI 返回的 productId（命中本地清单时） ──────────
assert.match(
  salesComposable,
  /aiProductId\s*\?\s*products\.find\(product => product\.id === aiProductId\)/,
  'useSales should prefer AI-supplied productId when present'
);
assert.match(
  purchasesComposable,
  /aiProductId\s*\?\s*products\.find\(product => product\.id === aiProductId\)/,
  'usePurchases should prefer AI-supplied productId when present'
);

console.log('AI sales/purchases product-match contract tests passed');
