/**
 * Cloudflare D1 数据库封装
 * 管理商品、进货记录、销售记录的云端持久化存储
 */

const DATA_EXPORT_VERSION = 1;
const CLOUD_API_BASE = '/api';
const AUTH_SESSION_STORAGE_KEY = 'vendingAuthSession';

const STORES = {
  PRODUCTS: 'products',
  PURCHASES: 'purchases',
  SALES: 'sales',
  SETTINGS: 'settings'
};

const SECRET_SETTING_KEYS = new Set([
  'aiClientConfigs'
]);

let dbInstance = null;

function touchDataCachesForStore(storeName) {
  if (storeName === STORES.SETTINGS && typeof businessSettingsCache !== 'undefined') {
    businessSettingsCache = null;
  }

  if (typeof markPageDirty !== 'function') return;
  switch (storeName) {
    case STORES.PRODUCTS:
      markPageDirty('products');
      markPageDirty('dashboard');
      break;
    case STORES.PURCHASES:
      markPageDirty('purchases');
      markPageDirty('products');
      markPageDirty('dashboard');
      break;
    case STORES.SALES:
      markPageDirty('sales');
      markPageDirty('products');
      markPageDirty('dashboard');
      break;
    default:
      break;
  }
}

// ==================== 商品操作 ====================

/**
 * 添加商品
 */
async function addProduct(product) {
  const data = {
    id: generateId(),
    name: product.name,
    category: product.category || '其他',
    sellPrice: parseFloat(product.sellPrice) || 0,
    currentStock: parseInt(product.currentStock) || 0,
    machineId: product.machineId || '1号机',
    avgCost: 0,
    totalPurchaseQty: 0,
    totalPurchaseCost: 0,
    createdAt: new Date().toISOString()
  };
  return await dbAdd(STORES.PRODUCTS, data);
}

/**
 * 更新商品
 */
async function updateProduct(product) {
  return await dbPut(STORES.PRODUCTS, product);
}

/**
 * 获取所有商品
 */
async function getAllProducts() {
  return await dbGetAll(STORES.PRODUCTS);
}

async function getPurchasesByMonth(yearMonth, options = {}) {
  return await dbGetByDatePrefix(STORES.PURCHASES, yearMonth, options);
}

async function getRecentSales(days = 7, options = {}) {
  const since = getRecentDays(days)[0];
  return await dbGetSinceDate(STORES.SALES, since, options);
}

/**
 * 删除商品
 */
async function deleteProduct(id) {
  return await dbDelete(STORES.PRODUCTS, id);
}

// ==================== 进货操作 ====================

/**
 * 添加进货记录并自动更新商品均价和库存
 * 如果 productId 为空但提供了 productName，自动创建商品
 */
async function addPurchase(purchase) {
  const result = await cloudRequest({
    method: 'POST',
    path: storeEndpoint(STORES.PURCHASES),
    body: purchase
  });
  invalidateRecordCache(STORES.PRODUCTS);
  invalidateRecordCache(STORES.PURCHASES);
  touchDataCachesForStore(STORES.PURCHASES);
  return result;
}

async function addPurchasesBatch(purchases, options = {}) {
  const result = await cloudRequest({
    method: 'POST',
    path: storeEndpoint(STORES.PURCHASES),
    body: {
    purchases,
    imageBase64: options.imageBase64 || null,
    mimeType: options.mimeType || 'image/jpeg'
    }
  });

  invalidateRecordCache(STORES.PRODUCTS);
  invalidateRecordCache(STORES.PURCHASES);
  touchDataCachesForStore(STORES.PRODUCTS);
  touchDataCachesForStore(STORES.PURCHASES);
  return result || { purchases: [] };
}

/**
 * 获取所有进货记录
 */
async function getAllPurchases(options = {}) {
  return await dbGetAll(STORES.PURCHASES, options);
}

async function getPurchaseSummary(options = {}) {
  const summary = await cloudRequest({
    method: 'POST',
    path: '/reports/monthly',
    body: options
  });
  const normalize = item => item ? { ...item, total: item.purchaseCost || 0 } : null;
  return {
    monthly: (summary.monthly || []).map(normalize),
    current: normalize(summary.current)
  };
}

/**
 * 获取某商品的进货记录
 */
async function getPurchasesByProduct(productId, options = {}) {
  return await dbGetByIndex(STORES.PURCHASES, 'productId', productId, options);
}

/**
 * 删除进货记录，并自动扣减相应的库存和调整均价
 */
async function deletePurchase(id) {
  await dbDelete(STORES.PURCHASES, id);
}

/**
 * 修改进货记录 (回退旧记录 -> 应用新记录 -> 更新记录)
 * 注意：不支持修改关联的商品，如果需要修改商品请删除后重新录入
 */
async function updatePurchase(id, newPurchaseData) {
  const result = await cloudRequest({
    method: 'PUT',
    path: storeEndpoint(STORES.PURCHASES),
    params: { id },
    body: newPurchaseData
  });
  invalidateRecordCache(STORES.PRODUCTS);
  invalidateRecordCache(STORES.PURCHASES);
  touchDataCachesForStore(STORES.PURCHASES);
  return result;
}
// ==================== 销售操作 ====================

/**
 * 添加销售记录
 * items 为必填，通过单品数量 × 零售价自动计算销售额
 * 同时计算 COGS（销售成本 = 单品数量 × 均价）并扣减库存
 */
async function addSale(sale) {
  const type = sale.type === 'refund' ? 'refund' : (sale.type === 'loss' ? 'loss' : 'sale');
  const path = type === 'refund'
    ? '/inventory/refunds'
    : (type === 'loss' ? '/inventory/losses' : storeEndpoint(STORES.SALES));
  const result = await cloudRequest({
    method: 'POST',
    path,
    body: sale
  });
  invalidateRecordCache(STORES.PRODUCTS);
  invalidateRecordCache(STORES.SALES);
  touchDataCachesForStore(STORES.SALES);
  return result;
}

/**
 * 获取所有销售记录
 */
async function getAllSales(options = {}) {
  return await dbGetAll(STORES.SALES, options);
}

async function getSalesSummary(options = {}) {
  return await cloudRequest({
    method: 'POST',
    path: '/reports/monthly',
    body: options
  });
}

/**
 * 获取某月的销售记录
 */
async function getSalesByMonth(yearMonth, options = {}) {
  return await dbGetByIndex(STORES.SALES, 'yearMonth', yearMonth, options);
}

/**
 * 删除销售记录，并自动回退已扣减的库存
 */
async function deleteSale(id) {
  return await dbDelete(STORES.SALES, id);
}

function saleItemQuantitySignature(items = []) {
  return items
    .map(item => ({
      productId: item && item.productId ? String(item.productId) : '',
      quantity: parseInt(item && item.quantity) || 0
    }))
    .filter(item => item.productId && item.quantity !== 0)
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.quantity - b.quantity)
    .map(item => `${item.productId}:${item.quantity}`)
    .join('|');
}

function saleFinancialOverrideMatches(oldItem, newItem, key) {
  if (!newItem || newItem[key] === undefined) return true;
  const oldValue = Math.round((parseFloat(oldItem && oldItem[key]) || 0) * 100) / 100;
  const newValue = Math.round((parseFloat(newItem[key]) || 0) * 100) / 100;
  return oldValue === newValue;
}

function canKeepExistingSaleCalculations(oldItems = [], newItems = []) {
  if (saleItemQuantitySignature(oldItems) !== saleItemQuantitySignature(newItems)) {
    return false;
  }

  return newItems.every(newItem => {
    const oldItem = oldItems.find(item => item.productId === newItem.productId);
    return oldItem
      && saleFinancialOverrideMatches(oldItem, newItem, 'itemRevenue')
      && saleFinancialOverrideMatches(oldItem, newItem, 'itemCogs');
  });
}

/**
 * 修改销售记录 (回退旧库存 -> 应用新库存 -> 更新记录)
 */
async function updateSale(id, newSaleData) {
  const result = await cloudRequest({
    method: 'PUT',
    path: storeEndpoint(STORES.SALES),
    params: { id },
    body: newSaleData
  });
  invalidateRecordCache(STORES.PRODUCTS);
  invalidateRecordCache(STORES.SALES);
  touchDataCachesForStore(STORES.SALES);
  return result;
}

// ==================== 设置操作 ====================

async function getSetting(key) {
  const result = await dbGet(STORES.SETTINGS, key);
  return result ? result.value : null;
}

async function setSetting(key, value) {
  return await dbPut(STORES.SETTINGS, { key, value });
}

// ==================== 数据导出/导入 ====================

/**
 * 导出所有数据为JSON
 * @param {Object} options 导出选项
 * @param {boolean} options.excludeImages 是否排除图片数据以减小体积
 */
async function exportAllData(options = {}) {
  const products = await getAllProducts();
  const purchases = await getAllPurchases({ includeImages: !options.excludeImages });
  const sales = await getAllSales({ includeImages: !options.excludeImages });
  const allSettings = await dbGetAll(STORES.SETTINGS);

  const settingsMap = {};
  allSettings
    .filter(s => s.key !== 'authConfig' && !SECRET_SETTING_KEYS.has(s.key))
    .forEach(s => settingsMap[s.key] = s.value);

  // 如果选择排除图片，清除相关字段
  if (options.excludeImages) {
    purchases.forEach(p => {
      if (p.imageBase64) p.imageBase64 = null;
      delete p.hasImage;
    });
    sales.forEach(s => {
      if (s.imageBase64) s.imageBase64 = null;
      delete s.hasImage;
    });
  }

  return {
    exportDate: new Date().toISOString(),
    version: DATA_EXPORT_VERSION,
    data: {
      products,
      purchases,
      sales,
      settings: settingsMap
    }
  };
}

/**
 * 导入数据（覆盖现有数据）
 */
async function importAllData(jsonData) {
  if (!jsonData || !jsonData.data) throw new Error('无效的数据格式');

  const { products, purchases, sales, settings } = jsonData.data;
  // 清空现有数据
  await dbClear(STORES.PRODUCTS);
  await dbClear(STORES.PURCHASES);
  await dbClear(STORES.SALES);
  await dbClear(STORES.SETTINGS);

  // 导入数据
  for (const p of (products || [])) {
    await dbPut(STORES.PRODUCTS, p);
  }
  for (const p of (purchases || [])) {
    await dbPut(STORES.PURCHASES, p);
  }
  for (const s of (sales || [])) {
    await dbPut(STORES.SALES, s);
  }
  // 恢复所有设置
  if (settings && typeof settings === 'object') {
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'authConfig') continue;
      if (SECRET_SETTING_KEYS.has(key)) continue;
      await setSetting(key, value);
    }
  }
}

/**
 * 生成唯一ID
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ==================== Cloudflare D1 cloud storage ====================

const CLOUD_LIGHT_STORES = new Set([STORES.PURCHASES, STORES.SALES]);
const RECORD_CACHE_TTL_MS = 30000;
const recordReadCache = new Map();

function storeSupportsRecordImages(storeName) {
  return storeName === STORES.PURCHASES || storeName === STORES.SALES;
}

function stripRecordImagePayload(storeName, data) {
  if (!storeSupportsRecordImages(storeName) || !data || typeof data !== 'object') {
    return { record: data, imageBase64: null, hadImagePayload: false };
  }

  const imageBase64 = data.imageBase64 || null;
  const record = { ...data };
  delete record.imageBase64;
  if (imageBase64 || record.hasImage) {
    record.hasImage = true;
  }
  return { record, imageBase64, hadImagePayload: Object.prototype.hasOwnProperty.call(data, 'imageBase64') };
}

async function openDB() {
  if (dbInstance) return dbInstance;
  dbInstance = {
    provider: 'cloudflare-d1',
    url: CLOUD_API_BASE
  };
  return dbInstance;
}

function storeEndpoint(storeName) {
  switch (storeName) {
    case STORES.PRODUCTS:
      return '/products';
    case STORES.PURCHASES:
      return '/inventory/purchases';
    case STORES.SALES:
      return '/inventory/sales';
    case STORES.SETTINGS:
      return '/settings';
    default:
      throw new Error('Unsupported store');
  }
}

function getRecordId(storeName, data) {
  if (storeName === STORES.SETTINGS) return data && data.key;
  return data && data.id;
}

function buildCloudUrl(path = '', params = {}) {
  const url = new URL(`${CLOUD_API_BASE}${path || ''}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function getStoredAuthSessionToken() {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (!session || !session.token || !session.expiresAt) return '';
    if (session.expiresAt <= Date.now()) return '';
    return session.token;
  } catch {
    return '';
  }
}

function cloudHeaders(extra = {}, options = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };

  const sessionToken = options.skipSession ? '' : getStoredAuthSessionToken();
  if (sessionToken) {
    headers['X-VM-Session'] = sessionToken;
  }

  return {
    ...headers,
    ...extra
  };
}

function formatCloudError(text, fallback) {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.message) return parsed.message;
  } catch {
    // Plain text error body.
  }
  return text;
}

async function cloudRequest(options = {}) {
  const response = await fetch(buildCloudUrl(options.path || '', options.params || {}), {
    method: options.method || 'GET',
    headers: cloudHeaders(options.headers, { skipSession: options.skipSession }),
    body: options.body === undefined
      ? undefined
      : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
  });

  if (!response.ok) {
    const message = await response.text();
    if (!options.skipSession && response.status === 401 && typeof handleAuthExpired === 'function') {
      handleAuthExpired('登录已过期，请重新登录');
    }
    throw new Error(formatCloudError(message, `Cloud D1 request failed: ${response.status}`));
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function cloudRpc(functionName, payload = {}, options = {}) {
  const rpcPaths = {
    vm_login: '/auth/login',
    vm_get_auth_profile: '/auth/profile',
    vm_update_auth: '/auth/update',
    vm_batch_add_purchases: '/inventory/purchases',
    vm_sales_summary: '/reports/monthly',
    vm_purchase_summary: '/reports/monthly'
  };
  const path = rpcPaths[functionName];
  if (!path) throw new Error(`Unknown RPC: ${functionName}`);
  const result = await cloudRequest({
    method: functionName === 'vm_get_auth_profile' ? 'GET' : 'POST',
    path,
    body: functionName === 'vm_get_auth_profile' ? undefined : (payload || {}),
    skipSession: options.skipSession
  });
  if (functionName === 'vm_purchase_summary') {
    const normalize = item => item ? { ...item, total: item.purchaseCost || 0 } : null;
    return {
      monthly: (result.monthly || []).map(normalize),
      current: normalize(result.current)
    };
  }
  return result;
}

async function dbAdd(storeName, data) {
  return await dbPut(storeName, data);
}

async function dbPut(storeName, data) {
  const recordId = getRecordId(storeName, data);
  if (!recordId) throw new Error('Missing record id');
  if (storeName === STORES.PURCHASES && data && data.isDeletedProduct) {
    return data;
  }
  const imagePayload = stripRecordImagePayload(storeName, data);

  const body = imagePayload.hadImagePayload
    ? {
        ...imagePayload.record,
        imageBase64: imagePayload.imageBase64 || '',
        mimeType: 'image/jpeg'
      }
    : imagePayload.record;
  await cloudRequest({
    method: 'POST',
    path: storeEndpoint(storeName),
    body
  });

  invalidateRecordCache(storeName);
  touchDataCachesForStore(storeName);
  return imagePayload.record;
}

async function dbGet(storeName, id) {
  return await cloudRequest({
    path: storeEndpoint(storeName),
    params: {
      id: String(id)
    }
  });
}

async function getRecordImageBase64(storeName, id) {
  const result = await cloudRequest({
    path: '/images',
    params: {
      store: storeName,
      id: String(id)
    }
  });
  return result ? result.imageBase64 : null;
}

function shouldUseLightRecords(storeName, options = {}) {
  return !options.includeImages && CLOUD_LIGHT_STORES.has(storeName);
}

function getReadRelation(storeName, options = {}) {
  return shouldUseLightRecords(storeName, options) ? 'light' : 'full';
}

function cacheKeyForRead(storeName, params, options = {}) {
  if (options.includeImages) return null;
  return JSON.stringify({
    storeName,
    relation: getReadRelation(storeName, options),
    params
  });
}

function invalidateRecordCache(storeName) {
  for (const key of Array.from(recordReadCache.keys())) {
    if (key.includes(`"storeName":"${storeName}"`)) {
      recordReadCache.delete(key);
    }
  }
}

async function dbQueryRecords(storeName, filters = {}, options = {}) {
  const pageSize = 1000;
  let offset = 0;
  const records = [];
  const relation = getReadRelation(storeName, options);
  const baseParams = {
    relation,
    order: options.order || 'updated_at.asc',
    ...filters
  };
  const cacheKey = options.skipCache ? null : cacheKeyForRead(storeName, baseParams, options);

  if (cacheKey) {
    const cached = recordReadCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < RECORD_CACHE_TTL_MS) {
      return cached.data.map(record => ({ ...record }));
    }
  }

  while (true) {
    const page = await cloudRequest({
      path: storeEndpoint(storeName),
      params: {
        ...baseParams,
        limit: String(pageSize),
        offset: String(offset)
      }
    });
    if (options.includeImages && storeSupportsRecordImages(storeName)) {
      for (const record of page) {
        if (record && record.hasImage && record.id) {
          record.imageBase64 = await getRecordImageBase64(storeName, record.id);
        }
      }
    }
    records.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  if (cacheKey) {
    recordReadCache.set(cacheKey, {
      createdAt: Date.now(),
      data: records.map(record => ({ ...record }))
    });
  }

  return records;
}

async function dbGetAll(storeName, options = {}) {
  return await dbQueryRecords(storeName, {}, options);
}

async function dbGetByIndex(storeName, indexName, value, options = {}) {
  const filters = {};
  if (storeName === STORES.PURCHASES && indexName === 'productId') {
    filters.productId = String(value);
  } else if (storeName === STORES.SALES && indexName === 'yearMonth') {
    filters.yearMonth = String(value);
  } else if (indexName === 'machineId') {
    filters.machineId = String(value);
  } else {
    filters.index = indexName;
    filters.value = String(value);
  }
  return await dbQueryRecords(storeName, filters, options);
}

async function dbGetByDatePrefix(storeName, yearMonth, options = {}) {
  return await dbQueryRecords(storeName, {
    datePrefix: String(yearMonth)
  }, options);
}

async function dbGetSinceDate(storeName, date, options = {}) {
  return await dbQueryRecords(storeName, {
    sinceDate: String(date)
  }, options);
}

async function dbDelete(storeName, id) {
  await cloudRequest({
    method: 'DELETE',
    path: storeEndpoint(storeName),
    params: {
      id: String(id)
    }
  });
  invalidateRecordCache(storeName);
  touchDataCachesForStore(storeName);
}

async function dbClear(storeName) {
  await cloudRequest({
    method: 'DELETE',
    path: storeEndpoint(storeName),
    params: { store: storeName }
  });
  invalidateRecordCache(storeName);
  touchDataCachesForStore(storeName);
}

