import type { Product } from '~/types/product'

/**
 * AI 识别的商品名 → 库内 Product 的模糊匹配工具。
 *
 * 设计目标：AI 截图识别经常会和库里商品名有细微差异（"毫升" vs "ml"、
 * "克" vs "g"、多写"瓶装"/"•多肽型"/"1倍半"等修饰词），原先用字面 includes
 * 一旦差一个字就匹配不到。本工具做：
 *   1. 归一化（半角化、去空格/标点、单位同义、去常见修饰词）
 *   2. 双向 includes
 *   3. 字符覆盖率 + 规格命中 + bigram Jaccard 综合评分作为兜底
 */

type UnitReplacer = string | ((match: string, ...groups: string[]) => string)

const UNIT_SYNONYMS: Array<[RegExp, UnitReplacer]> = [
  // 体积
  [/毫升/g, 'ml'],
  [/cc(?![a-z])/g, 'ml'],
  // L / 升 → ml（统一到 ml 便于和小单位比较）
  [/(\d+(?:\.\d+)?)\s*(?:l|升)(?![a-z])/g, (_match, num: string) => {
    const value = Number(num)
    if (!Number.isFinite(value)) return _match
    return `${Math.round(value * 1000)}ml`
  }],
  // 重量
  [/千克/g, 'kg'],
  [/公斤/g, 'kg'],
  [/(?<![a-z])克(?![a-z])/g, 'g'],
  // 长度（少见，但保留）
  [/厘米/g, 'cm'],
  [/毫米/g, 'mm'],
  // 包装词去除
  [/听/g, '罐'],
  [/支装/g, '支'],
  [/瓶装/g, ''],
  [/盒装/g, ''],
  [/袋装/g, ''],
  [/罐装/g, '']
]

const STOPWORDS = [
  '饮用',
  '装',
  '盒',
  '装版',
  '版',
  '款',
  '正品',
  '官方',
  '新品',
  '促销',
  '原味',
  '原装',
  '1倍半',
  '倍半'
]

const PUNCT_RE = /[\s\-_/\\()（）【】\[\]·•・,.，。、;:：；！!?？"'"'""]/g
const SPEC_RE = /\d+(?:\.\d+)?(?:ml|g|kg|cm|mm|罐|支|包|袋|瓶)?/g

function toHalfWidth(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0x3000) result += ' '
    else if (code >= 0xFF01 && code <= 0xFF5E) result += String.fromCharCode(code - 0xFEE0)
    else result += value[index]
  }
  return result
}

/**
 * 把名字归一化成方便比较的形态：
 * - 全角转半角
 * - 转小写
 * - 单位同义替换
 * - 去标点和空白
 * - 去停用词
 */
export function normalizeProductName(rawValue: string): string {
  if (!rawValue) return ''
  let name = toHalfWidth(String(rawValue)).toLowerCase()
  for (const [pattern, replacement] of UNIT_SYNONYMS) {
    if (typeof replacement === 'string') {
      name = name.replace(pattern, replacement)
    } else {
      name = name.replace(pattern, replacement as (substring: string, ...args: unknown[]) => string)
    }
  }
  name = name.replace(PUNCT_RE, '')
  for (const word of STOPWORDS) {
    name = name.split(word).join('')
  }
  return name.trim()
}

function bigrams(value: string): Set<string> {
  const grams = new Set<string>()
  if (value.length === 0) return grams
  if (value.length === 1) {
    grams.add(value)
    return grams
  }
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2))
  }
  return grams
}

/**
 * 字符 bigram Jaccard 相似度，0~1。
 */
export function nameSimilarity(left: string, right: string): number {
  const leftN = normalizeProductName(left)
  const rightN = normalizeProductName(right)
  if (!leftN || !rightN) return 0
  if (leftN === rightN) return 1
  const leftGrams = bigrams(leftN)
  const rightGrams = bigrams(rightN)
  let intersection = 0
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1
  }
  const union = leftGrams.size + rightGrams.size - intersection
  if (union <= 0) return 0
  return intersection / union
}

function extractSpecs(value: string): string[] {
  return normalizeProductName(value).match(SPEC_RE) || []
}

function removeSpecs(value: string): string {
  return normalizeProductName(value).replace(SPEC_RE, '')
}

function charCoverage(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0
  const chars = Array.from(new Set(needle.split('')))
  if (chars.length === 0) return 0
  const hits = chars.filter(char => haystack.includes(char)).length
  return hits / chars.length
}

function specScore(left: string, right: string): number {
  const leftSpecs = extractSpecs(left)
  const rightSpecs = extractSpecs(right)
  if (leftSpecs.length === 0 || rightSpecs.length === 0) return 0
  const hits = leftSpecs.filter(spec => rightSpecs.includes(spec)).length
  return hits / Math.max(leftSpecs.length, rightSpecs.length)
}

function combinedNameScore(productName: string, rawName: string): number {
  const productN = normalizeProductName(productName)
  const rawN = normalizeProductName(rawName)
  if (!productN || !rawN) return 0
  if (productN === rawN) return 1
  if (productN.includes(rawN) || rawN.includes(productN)) return 0.9

  const productCore = removeSpecs(productName)
  const rawCore = removeSpecs(rawName)
  const coverage = Math.max(
    charCoverage(productCore, rawCore),
    charCoverage(rawCore, productCore)
  )
  const productCoverage = charCoverage(productCore, rawCore)
  const specs = specScore(productName, rawName)
  const jaccard = nameSimilarity(productName, rawName)

  // 库名常比 AI 识别名短：库名核心字符都在识别名里，且规格一致时应强匹配。
  if (specs >= 1 && productCoverage >= 0.72) return Math.max(0.82, jaccard)

  const specBoost = specs >= 1 ? 0.22 : specs > 0 ? 0.1 : 0
  return Math.min(1, Math.max(jaccard, coverage * 0.72 + specBoost))
}

export type ProductMatchConfidence = 'high' | 'medium' | 'low'

export type ProductMatchResult = {
  product: Product | null
  score: number
  confidence: ProductMatchConfidence
}

/**
 * 在商品列表里给一个原始名称找最佳匹配。
 *
 * 评分策略：
 *  - 完全相等 / 归一化相等 → 1.0（high）
 *  - 双向 includes 命中 → 0.85（high）
 *  - 综合相似度 ≥ 0.6 → high
 *  - 0.45 ≤ 综合相似度 < 0.6 → medium
 *  - 否则 → 视为未匹配（返回 null）
 *
 * 阈值保守：宁可让人工再选一下，也不要错配到不同商品。
 */
export function matchProductByName(
  rawName: string,
  products: readonly Product[]
): ProductMatchResult {
  const empty: ProductMatchResult = { product: null, score: 0, confidence: 'low' }
  if (!rawName || products.length === 0) return empty

  const trimmed = String(rawName).trim()
  if (!trimmed) return empty
  const target = normalizeProductName(trimmed)
  if (!target) return empty

  let bestExact: Product | null = null
  let bestInclude: Product | null = null
  let bestIncludeLen = 0
  let bestScore = 0
  let bestProduct: Product | null = null

  for (const product of products) {
    const productName = product.name || ''
    const productN = normalizeProductName(productName)
    if (!productN) continue

    if (productN === target || productName === trimmed) {
      bestExact = product
      break
    }

    const aInB = productN.length >= 2 && target.includes(productN)
    const bInA = target.length >= 2 && productN.includes(target)
    if (aInB || bInA) {
      // 取双方较短一边的长度作为权重，名字越长越有信息量
      const length = Math.min(productN.length, target.length)
      if (length > bestIncludeLen) {
        bestInclude = product
        bestIncludeLen = length
      }
    }

    const score = combinedNameScore(productName, trimmed)
    if (score > bestScore) {
      bestScore = score
      bestProduct = product
    }
  }

  if (bestExact) {
    return { product: bestExact, score: 1, confidence: 'high' }
  }
  if (bestInclude) {
    return { product: bestInclude, score: 0.85, confidence: 'high' }
  }
  if (bestProduct && bestScore >= 0.6) {
    return { product: bestProduct, score: bestScore, confidence: 'high' }
  }
  if (bestProduct && bestScore >= 0.45) {
    return { product: bestProduct, score: bestScore, confidence: 'medium' }
  }
  return empty
}

/**
 * 给后端 AI prompt 注入"已存在商品清单"用，按机器分组，名字尽量短，避免 token 爆炸。
 * 输出的字符串可以直接拼到 systemPrompt / userPrompt 里。
 */
export function buildProductCatalogPrompt(products: readonly Product[]): string {
  if (products.length === 0) return ''
  const lines = products.slice(0, 200).map(product => {
    const machine = product.machineId ? `[${product.machineId}]` : ''
    return `- ${product.id} | ${product.name}${machine ? ' ' + machine : ''}`
  })
  return [
    '以下是系统中已存在的商品清单（id | 名称 [所属机器]），请尽量从中选择匹配项，并在每个 item 中返回对应的 productId。',
    '若截图中的商品在清单中找不到，则保留原始 rawName，productId 留空字符串。',
    '清单：',
    ...lines
  ].join('\n')
}
