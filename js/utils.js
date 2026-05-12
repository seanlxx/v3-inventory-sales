/**
 * 工具函数集
 */

/**
 * 格式化金额（保留2位小数）
 */
function formatMoney(amount) {
  return '¥' + (parseFloat(amount) || 0).toFixed(2);
}

/**
 * 格式化数字（保留2位小数）
 */
function formatNumber(num, digits = 2) {
  return (parseFloat(num) || 0).toFixed(digits);
}

function toNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function optionHtml(value, label, selected = false, extraAttrs = '') {
  const attrs = extraAttrs ? ` ${extraAttrs}` : '';
  return `<option value="${escapeAttr(value)}"${selected ? ' selected' : ''}${attrs}>${escapeHtml(label)}</option>`;
}

function tablerIcon(name, className = '') {
  const extraClass = className ? ` ${escapeAttr(className)}` : '';
  return `<i class="ti ti-${escapeAttr(name)}${extraClass}" aria-hidden="true"></i>`;
}

function renderPageHeader({ title, desc, icon, pretitle = '运营中心', actions = '' }) {
  return `
    <div class="page-header app-page-header d-print-none">
      <div class="page-title-wrap">
        <div class="page-pretitle">${escapeHtml(pretitle)}</div>
        <h2 class="page-title">
          <span class="page-icon">${tablerIcon(icon)}</span>
          <span>${escapeHtml(title)}</span>
        </h2>
        ${desc ? `<p class="page-desc text-secondary">${escapeHtml(desc)}</p>` : ''}
      </div>
      ${actions ? `<div class="header-actions page-header-actions btn-list">${actions}</div>` : ''}
    </div>
  `;
}

/**
 * 格式化日期 (包含时间)
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 获取当前日期 YYYY-MM-DD
 */
function getToday() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().split('T')[0];
}

/**
 * 获取当前日期和时间 YYYY-MM-DDTHH:mm (用于 datetime-local)
 */
function getNow() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 16);
}

/**
 * 获取当前月份 YYYY-MM
 */
function getCurrentMonth() {
  return getToday().substring(0, 7);
}

/**
 * 获取最近N天的日期列表
 */
function getRecentDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const APP_RUNTIME = typeof window !== 'undefined' ? window : globalThis;

const BUSINESS_DEFAULTS = {
  feeRate: 0.006,
  lowStockThreshold: 3,
  restockTargetDays: 7
};
const BUSINESS_SETTINGS_CACHE_MS = 30000;
let businessSettingsCache = null;

function normalizeFeeRate(value) {
  const n = toNumber(value, BUSINESS_DEFAULTS.feeRate);
  if (n > 1) return n / 100;
  if (n < 0) return BUSINESS_DEFAULTS.feeRate;
  return n;
}

async function getBusinessSettings() {
  if (businessSettingsCache && Date.now() - businessSettingsCache.createdAt < BUSINESS_SETTINGS_CACHE_MS) {
    return { ...businessSettingsCache.value };
  }

  const [feeRateRaw, lowStockRaw, restockDaysRaw] = await Promise.all([
    typeof getSetting === 'function' ? getSetting('feeRate') : null,
    typeof getSetting === 'function' ? getSetting('lowStockThreshold') : null,
    typeof getSetting === 'function' ? getSetting('restockTargetDays') : null
  ]);

  const value = {
    feeRate: normalizeFeeRate(feeRateRaw ?? BUSINESS_DEFAULTS.feeRate),
    lowStockThreshold: Math.max(0, toInt(lowStockRaw, BUSINESS_DEFAULTS.lowStockThreshold)),
    restockTargetDays: Math.max(1, toInt(restockDaysRaw, BUSINESS_DEFAULTS.restockTargetDays))
  };
  businessSettingsCache = { createdAt: Date.now(), value };
  return { ...value };
}

function formatPercentRate(rate) {
  return formatNumber(normalizeFeeRate(rate) * 100, 2).replace(/\.?0+$/, '') + '%';
}

function buildWarningBox(warnings, title = '请留意以下异常') {
  const list = (warnings || []).filter(Boolean);
  if (list.length === 0) return '';
  return `
    <div class="warning-box">
      <strong>${tablerIcon('alert-triangle')} ${escapeHtml(title)}</strong>
      <ul>
        ${list.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function normalizePurchaseMatchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/毫升/g, 'ml')
    .replace(/升/g, 'l')
    .replace(/千克|公斤/g, 'kg')
    .replace(/克/g, 'g')
    .replace(/[×＊*]/g, 'x')
    .replace(/[\s\-_()（）\[\]【】{}.,，。:：;；/\\|+]+/g, '')
    .replace(/[^\p{Script=Han}a-z0-9.]/gu, '');
}

function extractPurchaseSpecTokens(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase();
  const tokens = [];
  text.replace(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|ml|毫升|l|升|g|克)/g, (_, rawNum, rawUnit) => {
    let num = parseFloat(rawNum);
    let unit = rawUnit;
    if (!Number.isFinite(num)) return '';
    if (unit === '毫升') unit = 'ml';
    if (unit === '升') unit = 'l';
    if (unit === '克') unit = 'g';
    if (unit === '千克' || unit === '公斤') unit = 'kg';
    if (unit === 'l') {
      num *= 1000;
      unit = 'ml';
    }
    if (unit === 'kg') {
      num *= 1000;
      unit = 'g';
    }
    tokens.push(`${Math.round(num * 100) / 100}${unit}`);
    return '';
  });
  text.replace(/(\d+)\s*(瓶|罐|盒|包|袋|支|个|条|片|杯|桶|箱|件)/g, (_, rawNum, unit) => {
    tokens.push(`${parseInt(rawNum, 10)}${unit}`);
    return '';
  });
  return Array.from(new Set(tokens));
}

function normalizePurchaseMoney(value, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
  }
  let text = String(value ?? '').normalize('NFKC').trim();
  if (!text) return fallback;
  text = text
    .replace(/[￥¥元\s]/g, '')
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1');
  if (/^-?\d+,\d{1,2}$/.test(text) && !text.includes('.')) {
    text = text.replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }
  text = text.replace(/[^\d.-]/g, '');
  const firstDot = text.indexOf('.');
  if (firstDot !== -1) {
    text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '');
  }
  const n = parseFloat(text);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

function normalizePurchaseQuantity(value, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
  }
  const text = String(value ?? '')
    .normalize('NFKC')
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1');
  const match = text.match(/\d+/);
  if (!match) return fallback;
  return Math.max(0, parseInt(match[0], 10) || fallback);
}

function analyzePurchaseAmounts(item = {}) {
  const quantity = normalizePurchaseQuantity(item.quantity ?? item.quantityText, 0);
  let totalPrice = normalizePurchaseMoney(item.totalPrice ?? item.totalPriceText, 0);
  let unitPrice = normalizePurchaseMoney(item.unitPrice ?? item.unitPriceText, 0);
  const amountWarnings = [];

  if (quantity > 0 && totalPrice > 0 && unitPrice > 0) {
    const expectedTotal = Math.round(quantity * unitPrice * 100) / 100;
    const tolerance = Math.max(0.02, totalPrice * 0.005);
    if (Math.abs(expectedTotal - totalPrice) > tolerance) {
      const swappedTolerance = Math.max(0.02, unitPrice * 0.005);
      if (quantity > 1 && Math.abs(totalPrice * quantity - unitPrice) <= swappedTolerance) {
        const originalTotal = totalPrice;
        totalPrice = unitPrice;
        unitPrice = originalTotal;
        amountWarnings.push(`AI疑似把单价和总价填反，已按数量校正总价为 ${formatMoney(totalPrice)}，单价为 ${formatMoney(unitPrice)}`);
      } else {
        amountWarnings.push(`AI识别单价 ${formatMoney(unitPrice)} × 数量 ${quantity} 与总价 ${formatMoney(totalPrice)} 不一致，请核对截图`);
      }
    }
  } else if (quantity > 0 && totalPrice <= 0 && unitPrice > 0) {
    totalPrice = Math.round(quantity * unitPrice * 100) / 100;
    amountWarnings.push(`AI未识别总价，已按单价 × 数量预填 ${formatMoney(totalPrice)}，请确认`);
  } else if (quantity > 0 && totalPrice > 0 && unitPrice <= 0) {
    unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
  }

  if (quantity > 1 && totalPrice > 0 && unitPrice > 0 && Math.abs(totalPrice - unitPrice) <= 0.01) {
    amountWarnings.push(`数量为 ${quantity}，但单价和总价相同，请确认金额字段是否识别错位`);
  }

  return { quantity, totalPrice, unitPrice, amountWarnings };
}

function roundPurchaseMoney(value) {
  return Math.round(value * 100) / 100;
}

function derivePurchaseUnitPrice(totalPrice, quantity, fallback = 0) {
  const qty = normalizePurchaseQuantity(quantity, 0);
  const total = normalizePurchaseMoney(totalPrice, 0);
  if (qty <= 0 || total <= 0) return fallback;
  return Math.round((total / qty) * 100) / 100;
}

function sumPurchaseOrderLineTotals(items = []) {
  if (!Array.isArray(items)) return 0;
  return roundPurchaseMoney(items.reduce((sum, item) => {
    return sum + normalizePurchaseMoney(item?.totalPrice ?? item?.totalPriceText, 0);
  }, 0));
}

function firstPositivePurchaseMoney(values = []) {
  for (const value of values) {
    const amount = normalizePurchaseMoney(value, 0);
    if (amount > 0) return amount;
  }
  return 0;
}

function readPurchaseDiscountTotal(result = {}) {
  return Math.abs(firstPositivePurchaseMoney([
    result.discountTotal,
    result.discountAmount,
    result.orderDiscount,
    result.couponDiscount,
    result.totalDiscount,
    result.discountTotalText,
    result.discountText
  ]));
}

function resolvePurchaseOrderTotal(result = {}) {
  const items = Array.isArray(result.items) ? result.items : [];
  const lineTotal = sumPurchaseOrderLineTotals(items);
  const discountTotal = readPurchaseDiscountTotal(result);
  const discountedTotal = lineTotal > 0 && discountTotal > 0 && discountTotal < lineTotal
    ? roundPurchaseMoney(lineTotal - discountTotal)
    : 0;

  const payableTotal = firstPositivePurchaseMoney([
    result.orderPayable,
    result.payableTotal,
    result.payableAmount,
    result.amountPayable,
    result.finalTotal,
    result.dueTotal,
    result.actualTotal
  ]);
  if (payableTotal > 0) return payableTotal;

  const orderTotal = normalizePurchaseMoney(result.orderTotal ?? result.orderTotalText, 0);
  if (orderTotal > 0) {
    const orderLooksLikeUndiscountedLineTotal = discountedTotal > 0 && Math.abs(orderTotal - lineTotal) <= 0.02;
    if (!orderLooksLikeUndiscountedLineTotal) return orderTotal;
  }

  const paidTotal = firstPositivePurchaseMoney([
    result.paidTotal,
    result.actualPaid,
    result.actualPaidAmount,
    result.paidAmount
  ]);
  if (paidTotal > 0) return paidTotal;

  if (discountedTotal > 0) return discountedTotal;
  return orderTotal > 0 ? orderTotal : 0;
}

function allocatePurchaseOrderTotal(items = [], orderTotal = 0) {
  const totalPaid = normalizePurchaseMoney(orderTotal, 0);
  if (!Array.isArray(items) || items.length === 0 || totalPaid <= 0) return items;

  const prepared = items.map(item => ({
    item,
    quantity: normalizePurchaseQuantity(item.quantity ?? item.quantityText, 0),
    lineTotal: normalizePurchaseMoney(item.totalPrice ?? item.totalPriceText, 0),
    unitPrice: normalizePurchaseMoney(item.unitPrice ?? item.unitPriceText, 0)
  }));
  const sumLineTotal = Math.round(prepared.reduce((sum, entry) => sum + entry.lineTotal, 0) * 100) / 100;
  if (sumLineTotal <= 0) return items;

  const tolerance = Math.max(0.02, totalPaid * 0.005);
  if (Math.abs(sumLineTotal - totalPaid) <= tolerance) return items;

  let allocatedCents = 0;
  const paidCents = Math.round(totalPaid * 100);
  return prepared.map((entry, index) => {
    const isLast = index === prepared.length - 1;
    const cents = isLast
      ? paidCents - allocatedCents
      : Math.round((entry.lineTotal / sumLineTotal) * paidCents);
    allocatedCents += cents;
    const allocatedTotal = Math.round(cents) / 100;
    const allocatedUnit = entry.quantity > 0 ? Math.round((allocatedTotal / entry.quantity) * 100) / 100 : entry.unitPrice;
    const warnings = Array.isArray(entry.item.amountWarnings) ? entry.item.amountWarnings.slice() : [];
    warnings.push(`已按订单实付 ${formatMoney(totalPaid)} 从商品标价合计 ${formatMoney(sumLineTotal)} 比例分摊`);
    return {
      ...entry.item,
      totalPrice: allocatedTotal,
      unitPrice: allocatedUnit,
      amountWarnings: warnings
    };
  });
}

function scorePurchaseProductCandidate(item = {}, product = {}) {
  if (!product || !product.name) return { product, score: 0, specConflict: false };
  const names = [item.matchedName, item.normalizedName, item.normalized_name, item.name, item.rawName, item.raw_name]
    .filter(Boolean)
    .map(normalizePurchaseMatchText)
    .filter(Boolean);
  const productName = normalizePurchaseMatchText(product.name);
  if (!productName || names.length === 0) return { product, score: 0, specConflict: false };

  const inputSpecs = new Set(names.flatMap(extractPurchaseSpecTokens));
  const productSpecs = new Set(extractPurchaseSpecTokens(product.name));
  const specConflict = inputSpecs.size > 0 && productSpecs.size > 0 && !Array.from(inputSpecs).some(token => productSpecs.has(token));
  if (specConflict) return { product, score: 0, specConflict: true };

  let score = 0;
  for (const name of names) {
    if (name === productName) score = Math.max(score, 100);
    else if (name.includes(productName) || productName.includes(name)) {
      const shorterLength = Math.min(name.length, productName.length);
      score = Math.max(score, shorterLength >= 8 ? 94 : 82);
    }
    else {
      const a = new Set([...name]);
      const b = new Set([...productName]);
      const common = [...a].filter(ch => b.has(ch)).length;
      const overlap = common / Math.max(a.size, b.size, 1);
      score = Math.max(score, Math.round(overlap * 72));
    }
  }
  if (item.category && product.category && item.category === product.category) score += 4;
  if (item.machineId && product.machineId && item.machineId === product.machineId) score += 4;
  if (item.matchedName && normalizePurchaseMatchText(item.matchedName) === productName) score += 8;
  return { product, score: Math.min(score, 120), specConflict };
}

function findPurchaseProductMatch(item = {}, products = []) {
  if (item.matchedProductId) {
    const product = products.find(p => p.id === item.matchedProductId);
    if (product) {
      const compatibility = scorePurchaseProductCandidate(item, product);
      if (compatibility.score >= 55 || normalizePurchaseMatchText(item.matchedName || item.name) === normalizePurchaseMatchText(product.name)) {
        return { product, score: 120, candidates: [product] };
      }
    }
  }

  const scored = products
    .map(product => scorePurchaseProductCandidate(item, product))
    .filter(entry => entry.score > 0 && !entry.specConflict)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { product: null, score: 0, candidates: [] };
  const second = scored[1];
  const isClearWinner = best.score >= 90 && (!second || best.score - second.score >= 12);
  return {
    product: isClearWinner ? best.product : null,
    score: best.score,
    candidates: scored.slice(0, 3).map(entry => entry.product)
  };
}

function prepareAIRecognizedPurchaseItems(items = [], products = []) {
  return (items || []).map(item => {
    const amountInfo = analyzePurchaseAmounts(item);
    const rawName = String(item.rawName || item.raw_name || item.name || item.normalizedName || item.normalized_name || '').trim();
    const displayName = String(item.normalizedName || item.normalized_name || item.name || rawName).trim();
    // Always use local matching; ignore any matchedProductId/matchedName from AI
    const match = findPurchaseProductMatch({ ...item, name: displayName, rawName, matchedProductId: '', matchedName: '' }, products);
    const product = match.product;
    return {
      ...item,
      rawName,
      name: product ? product.name : displayName,
      matchedName: product ? product.name : '',
      matchedProductId: product ? product.id : '',
      machineId: product ? product.machineId : (item.machineId || ''),
      category: product ? product.category : (item.category || '饮料'),
      sellPrice: product ? product.sellPrice : (item.sellPrice || ''),
      quantity: amountInfo.quantity,
      totalPrice: amountInfo.totalPrice,
      unitPrice: amountInfo.unitPrice,
      amountWarnings: amountInfo.amountWarnings,
      matchScore: match.score,
      matchCandidates: match.candidates || []
    };
  }).filter(item => item.name && item.quantity > 0);
}

function collectPurchaseWarnings({ name, qty, totalPrice, sellPrice, existingProduct, aiUnitPrice, amountWarnings }) {
  const warnings = [];
  const addWarning = warning => {
    if (warning && !warnings.includes(warning)) warnings.push(warning);
  };
  (Array.isArray(amountWarnings) ? amountWarnings : []).forEach(addWarning);
  const quantity = toInt(qty, 0);
  const costTotal = toNumber(totalPrice, 0);
  const unitCost = derivePurchaseUnitPrice(costTotal, quantity, 0);
  const aiUnit = toNumber(aiUnitPrice, 0);
  const retail = toNumber(sellPrice, existingProduct ? existingProduct.sellPrice : 0);
  const avgCost = toNumber(existingProduct ? existingProduct.avgCost : 0, 0);

  if (quantity >= 100) addWarning(`${name}: 数量为 ${quantity} 件，请确认是否把整箱/整包数量算对了`);
  if (unitCost <= 0) addWarning(`${name}: 单件成本为 0 或无效`);
  if (quantity > 0 && costTotal > 0 && aiUnit > 0) {
    const expectedTotal = Math.round(quantity * aiUnit * 100) / 100;
    const tolerance = Math.max(0.02, costTotal * 0.005);
    if (Math.abs(expectedTotal - costTotal) > tolerance) {
      addWarning(`${name}: AI单价 ${formatMoney(aiUnit)} × 数量 ${quantity} 与总价 ${formatMoney(costTotal)} 不一致`);
    }
  }
  if (retail > 0 && unitCost > 0 && retail <= unitCost) addWarning(`${name}: 零售价不高于进货成本，可能会亏损`);
  if (retail > 0 && unitCost > 0 && ((retail - unitCost) / retail) < 0.1) addWarning(`${name}: 毛利率低于 10%`);
  if (avgCost > 0 && unitCost > 0) {
    const diffRate = Math.abs(unitCost - avgCost) / avgCost;
    if (diffRate >= 0.5 && Math.abs(unitCost - avgCost) >= 0.3) {
      addWarning(`${name}: 本次单件成本 ${formatMoney(unitCost)} 与历史均价 ${formatMoney(avgCost)} 偏差较大`);
    }
  }
  return warnings;
}

function collectSaleWarnings(items, products) {
  const warnings = [];
  const productMap = new Map((products || []).map(p => [p.id, p]));
  (items || []).forEach(item => {
    const product = productMap.get(item.productId);
    if (!product) return;
    const qty = Math.abs(toInt(item.quantity, 0));
    const stock = toInt(product.currentStock, 0);
    if (qty > stock && item.quantity > 0) warnings.push(`${product.name}: 本次数量 ${qty} 件超过当前库存 ${stock} 件`);
    if (qty >= 30) warnings.push(`${product.name}: 本次数量为 ${qty} 件，请确认截图或手填数量无误`);
    if (toNumber(product.sellPrice, 0) <= 0) warnings.push(`${product.name}: 零售价为 0，销售额可能异常`);
    if (toNumber(product.avgCost, 0) <= 0 && item.quantity > 0) warnings.push(`${product.name}: 缺少进货均价，利润计算会偏高`);
  });
  return warnings;
}

/**
 * 全局 UI 状态缓存
 */
function getAppUiState() {
  if (!APP_RUNTIME.__uiState) {
    APP_RUNTIME.__uiState = {
      products: { machine: null, category: 'all', search: '' },
      purchases: { month: null, search: '' },
      sales: { month: null, search: '' }
    };
  }
  return APP_RUNTIME.__uiState;
}

function getPageData(page) {
  if (!APP_RUNTIME.__pageData) APP_RUNTIME.__pageData = {};
  return APP_RUNTIME.__pageData[page] || null;
}

function setPageData(page, data) {
  if (!APP_RUNTIME.__pageData) APP_RUNTIME.__pageData = {};
  APP_RUNTIME.__pageData[page] = data;
  return data;
}

function clearPageData(page) {
  if (APP_RUNTIME.__pageData) {
    if (page) delete APP_RUNTIME.__pageData[page];
    else APP_RUNTIME.__pageData = {};
  }
}

function markPageDirty(page) {
  if (!APP_RUNTIME.__pageDirty) APP_RUNTIME.__pageDirty = {};
  APP_RUNTIME.__pageDirty[page] = true;
}

function consumePageDirty(page) {
  const dirtyMap = APP_RUNTIME.__pageDirty;
  if (!dirtyMap || !dirtyMap[page]) return false;
  delete dirtyMap[page];
  return true;
}

function isPageDirty(page) {
  return !!(APP_RUNTIME.__pageDirty && APP_RUNTIME.__pageDirty[page]);
}

function getPageUiState(page) {
  const state = getAppUiState();
  if (!state[page]) state[page] = {};
  return state[page];
}

function updatePageUiState(page, patch = {}) {
  const state = getPageUiState(page);
  Object.assign(state, patch);
  return state;
}

const MOBILE_PAGE_SIZE = 10;
const MOBILE_PAGINATION_QUERY = '(max-width: 768px)';

function isMobilePaginationViewport() {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_PAGINATION_QUERY).matches;
  }
  return typeof window.innerWidth === 'number' && window.innerWidth <= 768;
}

function getPaginationKey(page, scope = 'default') {
  return `${page}:${scope}`;
}

function getPaginationPage(page, scope = 'default') {
  const state = getPageUiState(page);
  const key = getPaginationKey(page, scope);
  const pageNumber = toInt(state[key], 1);
  return Math.max(1, pageNumber);
}

function setPaginationPage(page, scope, value) {
  const key = getPaginationKey(page, scope);
  updatePageUiState(page, { [key]: Math.max(1, toInt(value, 1)) });
}

const PAGINATION_REFRESH_CALLBACKS = {
  filterPurchases: () => typeof filterPurchases === 'function' ? filterPurchases() : undefined,
  filterSalesRecords: () => typeof filterSalesRecords === 'function' ? filterSalesRecords() : undefined,
  refreshProductsGrid: () => typeof refreshProductsGrid === 'function' ? refreshProductsGrid() : undefined
};

function runPaginationRefresh(refreshFnName) {
  const refresh = PAGINATION_REFRESH_CALLBACKS[refreshFnName];
  if (refresh) refresh();
}

function getPaginatedItems(page, scope, items, pageSize = MOBILE_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  if (!isMobilePaginationViewport()) {
    return {
      items: list,
      total: list.length,
      currentPage: 1,
      totalPages: 1,
      pageSize: list.length || pageSize,
      start: list.length === 0 ? 0 : 1,
      end: list.length,
      paginationEnabled: false
    };
  }

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(getPaginationPage(page, scope), totalPages);
  setPaginationPage(page, scope, currentPage);
  const start = (currentPage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    total: list.length,
    currentPage,
    totalPages,
    pageSize,
    start: list.length === 0 ? 0 : start + 1,
    end: Math.min(start + pageSize, list.length),
    paginationEnabled: true
  };
}

function renderPaginationDock(page, scope, pager, refreshFnName) {
  if (!pager || pager.paginationEnabled === false || pager.total <= pager.pageSize) return '';
  const safePage = escapeAttr(page);
  const safeScope = escapeAttr(scope);
  const safeRefresh = escapeAttr(refreshFnName);
  const pageButtons = Array.from({ length: pager.totalPages }, (_, i) => {
    const pageNumber = i + 1;
    const active = pageNumber === pager.currentPage ? ' active' : '';
    return `<button class="pagination-page-btn${active}" data-pagination-action="page" data-pagination-target-page="${pageNumber}">${pageNumber}</button>`;
  }).join('');

  return `
    <div class="mobile-pagination-dock" data-pagination-page="${safePage}" data-pagination-scope="${safeScope}" data-pagination-refresh="${safeRefresh}">
      <section class="pagination-inline" aria-label="分页选择">
        <div class="pagination-summary">
          <span>第 ${pager.currentPage} / ${pager.totalPages} 页</span>
          <small>${pager.start}-${pager.end} / 共 ${pager.total} 条</small>
        </div>
        <div class="pagination-page-grid">${pageButtons}</div>
        <div class="pagination-drawer-actions">
          <button class="btn btn-ghost" ${pager.currentPage <= 1 ? 'disabled' : ''} data-pagination-action="page" data-pagination-target-page="${pager.currentPage - 1}">上一页</button>
          <button class="btn btn-primary" ${pager.currentPage >= pager.totalPages ? 'disabled' : ''} data-pagination-action="page" data-pagination-target-page="${pager.currentPage + 1}">下一页</button>
        </div>
      </section>
    </div>
  `;
}

if (typeof document !== 'undefined' && !APP_RUNTIME.__paginationDelegationReady) {
  APP_RUNTIME.__paginationDelegationReady = true;
  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-pagination-action]');
    if (!control) return;
    const dock = control.closest('.mobile-pagination-dock');
    if (!dock) return;

    const page = dock.dataset.paginationPage;
    const scope = dock.dataset.paginationScope || 'default';
    const action = control.dataset.paginationAction;
    event.preventDefault();

    if (action === 'open') {
      return;
    }
    if (action === 'close') {
      closePaginationDrawer(page, scope);
      return;
    }
    if (action === 'page') {
      setPaginationPage(page, scope, control.dataset.paginationTargetPage);
      closePaginationDrawer(page, scope);
      runPaginationRefresh(dock.dataset.paginationRefresh);
    }
  });
}

function findPaginationDock(page, scope) {
  return Array.from(document.querySelectorAll('.mobile-pagination-dock')).find(dock => {
    return dock.dataset.paginationPage === page && dock.dataset.paginationScope === scope;
  }) || null;
}

function closePaginationDrawer(page, scope = 'default') {
  findPaginationDock(page, scope)?.classList.remove('drawer-open');
}

/**
 * 显示Toast消息
 */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast-message');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  const icon = type === 'success' ? 'circle-check' : type === 'error' ? 'circle-x' : 'info-circle';
  toast.innerHTML = `
    <span class="toast-icon">${tablerIcon(icon)}</span>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/**
 * 显示确认对话框
 */
function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog modal-content">
        <div class="confirm-icon">${tablerIcon('alert-triangle')}</div>
        <p class="confirm-message">${escapeHtml(message)}</p>
        <div class="confirm-actions btn-list">
          <button class="btn btn-ghost" id="confirmCancel">取消</button>
          <button class="btn btn-danger" id="confirmOk">确认</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let settled = false;
    const okBtn = overlay.querySelector('#confirmOk');
    const cancelBtn = overlay.querySelector('#confirmCancel');

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
    };

    const close = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      overlay.classList.remove('modal-active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    okBtn?.addEventListener('click', () => close(true));
    cancelBtn?.addEventListener('click', () => close(false));

    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => {
      overlay.classList.add('modal-active');
      okBtn?.focus({ preventScroll: true });
    });
  });
}

/**
 * 显示模态弹窗
 */
function showModal(title, contentHtml, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-dialog modal-dialog-centered ${options.wide ? 'modal-lg modal-wide' : ''}">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">${title}</h3>
            <button class="btn-close modal-close" id="modalClose" aria-label="关闭"></button>
          </div>
          <div class="modal-body">
            ${contentHtml}
          </div>
          ${options.hideFooter ? '' : `
          <div class="modal-footer">
            <div class="btn-list justify-content-end">
              <button class="btn btn-ghost" id="modalCancel">取消</button>
              <button class="btn btn-primary" id="modalSubmit">${escapeHtml(options.submitText || '确认')}</button>
            </div>
          </div>
          `}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let settled = false;
    const allowBackdropClose = options.closeOnBackdrop === true;

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
    };

    const close = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      overlay.classList.remove('modal-active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        close(null);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        const active = document.activeElement;
        if (!active || !overlay.contains(active) || active.tagName === 'TEXTAREA') return;
        const submitBtn = overlay.querySelector('#modalSubmit');
        if (submitBtn && !submitBtn.disabled) {
          e.preventDefault();
          submitBtn.click();
        }
      }
    };

    overlay.addEventListener('click', (e) => {
      if (allowBackdropClose && e.target === overlay) close(null);
    });

    overlay.querySelector('#modalClose')?.addEventListener('click', () => close(null));
    if (overlay.querySelector('#modalCancel')) {
      overlay.querySelector('#modalCancel').addEventListener('click', () => close(null));
    }
    if (overlay.querySelector('#modalSubmit')) {
      overlay.querySelector('#modalSubmit').addEventListener('click', () => close(overlay));
    }

    document.addEventListener('keydown', onKeyDown);

    // 如果有回调，让调用者自定义行为
    if (options.onReady) {
      options.onReady(overlay, close);
    }

    requestAnimationFrame(() => {
      overlay.classList.add('modal-active');
      const focusSelector = options.initialFocusSelector || 'input:not([type="hidden"]), select, textarea, button:not(.modal-close)';
      const focusTarget = overlay.querySelector(focusSelector);
      if (focusTarget && typeof focusTarget.focus === 'function') {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch {
          focusTarget.focus();
        }
      }
    });
  });
}

/**
 * 防抖
 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 下载JSON文件
 */
function downloadJSON(data, filename, minify = true) {
  const jsonStr = minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 读取JSON文件
 */
function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result));
      } catch (err) {
        reject(new Error('JSON解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

/**
 * 商品类别列表
 */
const CATEGORIES = ['饮料', '零食', '日用品', '烟酒', '其他'];

/**
 * 售货机列表
 */
const MACHINES = ['1号机', '2号机'];

async function getMachines() {
  try {
    const raw = typeof getSetting === 'function' ? await getSetting('machines') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return MACHINES.slice();
}

/**
 * 压缩图片，返回 base64 字符串
 */
function compressImage(base64Str, mimeType, maxSide = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:${mimeType};base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const longestSide = Math.max(width, height);
      if (longestSide > maxSide) {
        const ratio = maxSide / longestSide;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // 强制转为 JPEG 以减小体积
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = reject;
  });
}

/**
 * 显示全屏图片预览弹窗
 */
function showImageModal(base64Str) {
  const html = `
    <div style="text-align:center; padding:10px 0;">
      <img src="data:image/jpeg;base64,${base64Str}" style="max-width:100%; max-height:70vh; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
    </div>
  `;
  showModal(`${tablerIcon('photo')} 原图查看`, html, { hideFooter: true, wide: true });
}

async function showRecordImageModal(storeName, recordId) {
  try {
    const imageBase64 = typeof getRecordImageBase64 === 'function'
      ? await getRecordImageBase64(storeName, recordId)
      : (await dbGet(storeName, recordId))?.imageBase64;
    if (!imageBase64) {
      showToast('这条记录没有保存原图', 'info');
      return;
    }
    showImageModal(imageBase64);
  } catch (err) {
    showToast('原图加载失败: ' + err.message, 'error');
  }
}
