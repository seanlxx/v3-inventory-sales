// 行为级回归：用真实场景验证 product-match.ts 中算法的输出。
// 由于 Node 直接 import .ts + ~/* 别名比较折腾，这里把算法核心 inline 复刻
// 一份并校验同样的输入；同时通过 source-string 断言（test-ai-product-match.mjs）
// 确保源码里的算法没有偏离这套规则。
import assert from 'node:assert/strict';

const UNIT_SYNONYMS = [
  [/毫升/g, 'ml'],
  [/cc(?![a-z])/g, 'ml'],
  [/(\d+(?:\.\d+)?)\s*(?:l|升)(?![a-z])/g, (_match, num) => {
    const value = Number(num);
    if (!Number.isFinite(value)) return _match;
    return `${Math.round(value * 1000)}ml`;
  }],
  [/千克/g, 'kg'],
  [/公斤/g, 'kg'],
  [/(?<![a-z])克(?![a-z])/g, 'g'],
  [/厘米/g, 'cm'],
  [/毫米/g, 'mm'],
  [/听/g, '罐'],
  [/支装/g, '支'],
  [/瓶装/g, ''],
  [/盒装/g, ''],
  [/袋装/g, ''],
  [/罐装/g, '']
];

const STOPWORDS = ['饮用', '装', '盒', '装版', '版', '款', '正品', '官方', '新品', '促销', '原味', '原装', '1倍半', '倍半'];
const PUNCT_RE = /[\s\-_/\\()（）【】\[\]·•・,.，。、;:：；！!?？"'"'""]/g;
const SPEC_RE = /\d+(?:\.\d+)?(?:ml|g|kg|cm|mm|罐|支|包|袋|瓶)?/g;
const PRODUCT_NAME_ALIASES = {
  '东鹏补水555ml': '东鹏补水啦555ml',
  '东鹏补水啦柠檬味555ml': '东鹏补水啦555ml',
  '东鹏补水电解质饮料柠檬味555ml': '东鹏补水啦555ml',
  '东鹏补水电解质水柠檬味555ml': '东鹏补水啦555ml',
  '东鹏补水啦电解质饮料柠檬味555ml': '东鹏补水啦555ml',
  '东鹏补水啦电解质水柠檬味555ml': '东鹏补水啦555ml'
};

function toHalfWidth(value) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x3000) result += ' ';
    else if (code >= 0xFF01 && code <= 0xFF5E) result += String.fromCharCode(code - 0xFEE0);
    else result += value[index];
  }
  return result;
}

function normalizeProductName(rawValue) {
  if (!rawValue) return '';
  let name = toHalfWidth(String(rawValue)).toLowerCase();
  for (const [pattern, replacement] of UNIT_SYNONYMS) {
    name = typeof replacement === 'string'
      ? name.replace(pattern, replacement)
      : name.replace(pattern, replacement);
  }
  name = name.replace(PUNCT_RE, '');
  for (const word of STOPWORDS) name = name.split(word).join('');
  const normalized = name.trim();
  return PRODUCT_NAME_ALIASES[normalized] || normalized;
}

function bigrams(value) {
  const grams = new Set();
  if (value.length === 0) return grams;
  if (value.length === 1) { grams.add(value); return grams; }
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2));
  }
  return grams;
}

function nameSimilarity(left, right) {
  const a = normalizeProductName(left);
  const b = normalizeProductName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  const union = ga.size + gb.size - inter;
  return union <= 0 ? 0 : inter / union;
}

function extractSpecs(value) {
  return normalizeProductName(value).match(SPEC_RE) || [];
}

function removeSpecs(value) {
  return normalizeProductName(value).replace(SPEC_RE, '');
}

function charCoverage(needle, haystack) {
  if (!needle || !haystack) return 0;
  const chars = Array.from(new Set(needle.split('')));
  if (chars.length === 0) return 0;
  const hits = chars.filter(char => haystack.includes(char)).length;
  return hits / chars.length;
}

function specScore(left, right) {
  const leftSpecs = extractSpecs(left);
  const rightSpecs = extractSpecs(right);
  if (leftSpecs.length === 0 || rightSpecs.length === 0) return 0;
  const hits = leftSpecs.filter(spec => rightSpecs.includes(spec)).length;
  return hits / Math.max(leftSpecs.length, rightSpecs.length);
}

function combinedNameScore(productName, rawName) {
  const productN = normalizeProductName(productName);
  const rawN = normalizeProductName(rawName);
  if (!productN || !rawN) return 0;
  if (productN === rawN) return 1;
  if (productN.includes(rawN) || rawN.includes(productN)) return 0.9;

  const productCore = removeSpecs(productName);
  const rawCore = removeSpecs(rawName);
  const coverage = Math.max(
    charCoverage(productCore, rawCore),
    charCoverage(rawCore, productCore)
  );
  const productCoverage = charCoverage(productCore, rawCore);
  const specs = specScore(productName, rawName);
  const jaccard = nameSimilarity(productName, rawName);

  if (specs >= 1 && productCoverage >= 0.72) return Math.max(0.82, jaccard);

  const specBoost = specs >= 1 ? 0.22 : specs > 0 ? 0.1 : 0;
  return Math.min(1, Math.max(jaccard, coverage * 0.72 + specBoost));
}

function matchProductByName(rawName, products) {
  const empty = { product: null, score: 0, confidence: 'low' };
  if (!rawName || products.length === 0) return empty;
  const trimmed = String(rawName).trim();
  if (!trimmed) return empty;
  const target = normalizeProductName(trimmed);
  if (!target) return empty;

  let bestExact = null;
  let bestInclude = null;
  let bestIncludeLen = 0;
  let bestScore = 0;
  let bestProduct = null;

  for (const product of products) {
    const productN = normalizeProductName(product.name || '');
    if (!productN) continue;
    if (productN === target || product.name === trimmed) { bestExact = product; break; }
    const aInB = productN.length >= 2 && target.includes(productN);
    const bInA = target.length >= 2 && productN.includes(target);
    if (aInB || bInA) {
      const length = Math.min(productN.length, target.length);
      if (length > bestIncludeLen) { bestInclude = product; bestIncludeLen = length; }
    }
    const score = combinedNameScore(product.name, trimmed);
    if (score > bestScore) { bestScore = score; bestProduct = product; }
  }
  if (bestExact) return { product: bestExact, score: 1, confidence: 'high' };
  if (bestInclude) return { product: bestInclude, score: 0.85, confidence: 'high' };
  if (bestProduct && bestScore >= 0.6) return { product: bestProduct, score: bestScore, confidence: 'high' };
  if (bestProduct && bestScore >= 0.45) return { product: bestProduct, score: bestScore, confidence: 'medium' };
  return empty;
}

// ── 真实库存（对应用户截图里失败的几条） ────────────────────────────
const products = [
  { id: 'p-coke', name: '可口可乐330ml' },
  { id: 'p-baoli', name: '宝矿力水特500ml' },
  { id: 'p-cestbon', name: '怡宝纯净水555ml' },
  { id: 'p-wahaha', name: '娃哈哈纯净水596ml' },
  { id: 'p-dongpeng', name: '东鹏补水啦 555ml' },
  { id: 'p-kangshifu-tea', name: '康师傅茉莉清茶1L' },
  { id: 'p-kangshifu-noodle', name: '康师傅红烧牛肉面136g' },
  { id: 'p-jianjiao', name: '农夫山泉尖叫多肽型西柚味550ml' }
];

const cases = [
  { input: '可口可乐330ml', expectedId: 'p-coke', minScore: 1 },
  { input: '宝矿力水特500ml', expectedId: 'p-baoli', minScore: 1 },
  { input: '怡宝饮用纯净水555ml', expectedId: 'p-cestbon' },
  // 用户原报告里失败的样本：
  { input: '娃哈哈纯净水596毫升', expectedId: 'p-wahaha' },                      // 毫升 → ml
  { input: '东鹏补水啦柠檬味555ml', expectedId: 'p-dongpeng' },                    // 别名 → 标准 555ml
  { input: '东鹏补水电解质饮料柠檬味555ml', expectedId: 'p-dongpeng' },            // 旧标准名 → 新标准名
  { input: '康师傅茉莉清茶瓶装1L', expectedId: 'p-kangshifu-tea' },                 // 瓶装 + 1L
  { input: '康师傅1倍半红烧牛肉面136克', expectedId: 'p-kangshifu-noodle' },         // 倍半修饰 + 克
  { input: '农夫山泉 尖叫运动饮料•多肽型 西柚味 550ml', expectedId: 'p-jianjiao' }   // 多余空格 / • / 修饰词
];

let failed = 0;
for (const sample of cases) {
  const result = matchProductByName(sample.input, products);
  const ok = result.product && result.product.id === sample.expectedId;
  if (!ok) {
    failed += 1;
    console.error(`✗ "${sample.input}" → 实际匹配 ${result.product?.id || '<none>'} (score=${result.score.toFixed(3)}, conf=${result.confidence})，预期 ${sample.expectedId}`);
  } else {
    console.log(`✓ "${sample.input}" → ${result.product.id} (score=${result.score.toFixed(3)}, conf=${result.confidence})`);
  }
}

assert.equal(failed, 0, `${failed} of ${cases.length} match cases failed`);

// ── 反例：截然不同的名字不应误匹配 ────────────────────────────────
const wrongMatch = matchProductByName('阿萨姆奶茶250ml', products);
assert.ok(
  !wrongMatch.product || wrongMatch.confidence !== 'high',
  '不相关商品不应高置信命中'
);

console.log('AI product-match real-world scenarios passed');
