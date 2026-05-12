/**
 * Cloudflare D1 数据库封装
 * 管理商品、进货记录、销售记录的云端持久化存储
 */

const DATA_EXPORT_VERSION = 1;
const CLOUD_API_BASE = '/api/records';
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
  let product;

  if (purchase.productId) {
    product = await dbGet(STORES.PRODUCTS, purchase.productId);
    if (!product) throw new Error('商品不存在');
  } else if (purchase.productName) {
    // 自动创建新商品
    product = await addProduct({
      name: purchase.productName,
      machineId: purchase.machineId || '1号机',
      category: purchase.category || '其他',
      sellPrice: parseFloat(purchase.sellPrice) || 0,
      currentStock: 0
    });
  } else {
    throw new Error('请选择商品或输入新商品名称');
  }

  const quantity = parseInt(purchase.quantity);
  const totalPrice = parseFloat(purchase.totalPrice);
  const unitPrice = quantity > 0 ? Math.round((totalPrice / quantity) * 100) / 100 : 0;

  // 计算加权均价
  const oldTotalCost = product.totalPurchaseCost || 0;
  const oldTotalQty = product.totalPurchaseQty || 0;
  const newTotalCost = oldTotalCost + totalPrice;
  const newTotalQty = oldTotalQty + quantity;
  const newAvgCost = newTotalQty > 0 ? newTotalCost / newTotalQty : 0;

  // 更新商品（成本精确到分）
  product.avgCost = Math.round(newAvgCost * 100) / 100;
  product.totalPurchaseCost = Math.round(newTotalCost * 100) / 100;
  product.totalPurchaseQty = newTotalQty;
  product.currentStock = (product.currentStock || 0) + quantity;
  await updateProduct(product);

  // 保存进货记录
  const data = {
    id: generateId(),
    productId: product.id,
    productName: product.name,
    machineId: product.machineId,
    quantity: quantity,
    unitPrice: unitPrice,
    totalPrice: Math.round(totalPrice * 100) / 100,
    source: purchase.source || '拼多多',
    date: purchase.date || new Date().toISOString().split('T')[0],
    note: purchase.note || '',
    imageBase64: purchase.imageBase64 || null,
    createdAt: new Date().toISOString()
  };
  return await dbAdd(STORES.PURCHASES, data);
}

async function addPurchasesBatch(purchases, options = {}) {
  const result = await cloudRpc('vm_batch_add_purchases', {
    purchases,
    imageBase64: options.imageBase64 || null,
    mimeType: options.mimeType || 'image/jpeg'
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
  return await cloudRpc('vm_purchase_summary', options);
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
  const purchase = await dbGet(STORES.PURCHASES, id);
  await dbDelete(STORES.PURCHASES, id);
  if (purchase && purchase.productId) {
    const product = await dbGet(STORES.PRODUCTS, purchase.productId);
    if (product) {
      const remaining = await getPurchasesByProduct(purchase.productId);
      const newTotalCost = remaining.reduce((s, p) => s + (p.totalPrice || 0), 0);
      const newTotalQty = remaining.reduce((s, p) => s + (p.quantity || 0), 0);
      product.totalPurchaseCost = Math.round(newTotalCost * 100) / 100;
      product.totalPurchaseQty = newTotalQty;
      product.avgCost = newTotalQty > 0 ? Math.round((newTotalCost / newTotalQty) * 100) / 100 : 0;
      product.currentStock = Math.max(0, (product.currentStock || 0) - (purchase.quantity || 0));
      await updateProduct(product);
    }
  }
}

/**
 * 修改进货记录 (回退旧记录 -> 应用新记录 -> 更新记录)
 * 注意：不支持修改关联的商品，如果需要修改商品请删除后重新录入
 */
async function updatePurchase(id, newPurchaseData) {
  const oldPurchase = await dbGet(STORES.PURCHASES, id);
  if (!oldPurchase) throw new Error('进货记录不存在');

  const quantity = parseInt(newPurchaseData.quantity) || 0;
  const totalPrice = parseFloat(newPurchaseData.totalPrice) || 0;
  const unitPrice = quantity > 0
    ? Math.round((totalPrice / quantity) * 100) / 100
    : 0;

  const updatedPurchase = {
    ...oldPurchase,
    quantity,
    totalPrice: Math.round(totalPrice * 100) / 100,
    unitPrice,
    source: newPurchaseData.source !== undefined ? newPurchaseData.source : oldPurchase.source,
    date: newPurchaseData.date || oldPurchase.date,
    note: newPurchaseData.note !== undefined ? newPurchaseData.note : oldPurchase.note,
  };

  await dbPut(STORES.PURCHASES, updatedPurchase);

  if (updatedPurchase.productId) {
    const product = await dbGet(STORES.PRODUCTS, updatedPurchase.productId);
    if (product) {
      const allPurchases = await getPurchasesByProduct(updatedPurchase.productId);
      const totalCost = allPurchases.reduce((s, p) => s + (p.totalPrice || 0), 0);
      const totalQty = allPurchases.reduce((s, p) => s + (p.quantity || 0), 0);
      product.totalPurchaseCost = Math.round(totalCost * 100) / 100;
      product.totalPurchaseQty = totalQty;
      product.avgCost = totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : 0;
      product.currentStock = Math.max(0, (product.currentStock || 0) - (oldPurchase.quantity || 0) + quantity);
      await updateProduct(product);
    }
  }

  return updatedPurchase;
}
// ==================== 销售操作 ====================

/**
 * 添加销售记录
 * items 为必填，通过单品数量 × 零售价自动计算销售额
 * 同时计算 COGS（销售成本 = 单品数量 × 均价）并扣减库存
 */
async function addSale(sale) {
  const date = sale.date || new Date().toISOString().split('T')[0];
  const yearMonth = date.substring(0, 7);

  let totalAmount = 0;
  let totalCogs = 0;
  const enrichedItems = [];
  const saleItems = sale.items || [];
  const productIds = [...new Set(saleItems.map(item => item.productId).filter(Boolean))];
  const products = await Promise.all(productIds.map(id => dbGet(STORES.PRODUCTS, id)));
  const productMap = new Map(products.filter(Boolean).map(product => [product.id, product]));

  // 0. 预检库存是否充足，防止中途报错导致数据不一致
  for (const item of saleItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;
    const qty = parseInt(item.quantity) || 0;
    if (qty > (product.currentStock || 0)) {
      throw new Error(`商品 [${product.name}] 销售数量(${qty}) 大于当前库存(${(product.currentStock || 0)})，请修改后再提交`);
    }
  }

  // 遍历单品明细，计算销售额和成本
  for (const item of saleItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    const qty = parseInt(item.quantity) || 0;

    const itemRevenue = item.itemRevenue !== undefined ? parseFloat(item.itemRevenue) : Math.round(qty * (product.sellPrice || 0) * 100) / 100;
    const itemCogs = item.itemCogs !== undefined ? parseFloat(item.itemCogs) : Math.round(qty * (product.avgCost || 0) * 100) / 100;

    if (qty === 0 && itemRevenue === 0 && itemCogs === 0) continue;

    totalAmount += itemRevenue;
    totalCogs += itemCogs;

    // 扣减库存（记录实际扣减数，用于后续回退）
    const stockBefore = product.currentStock || 0;
    product.currentStock = Math.max(0, stockBefore - qty);
    const actualDeducted = stockBefore - product.currentStock;
    await updateProduct(product);

    enrichedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: qty,
      actualDeducted: actualDeducted,
      sellPrice: product.sellPrice,
      avgCost: product.avgCost,
      itemRevenue: itemRevenue,
      itemCogs: itemCogs
    });
  }

  const data = {
    id: generateId(),
    machineId: sale.machineId || '1号机',
    date: date,
    yearMonth: yearMonth,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalCogs: Math.round(totalCogs * 100) / 100,
    items: enrichedItems,
    type: sale.type || 'daily',
    note: sale.note || '',
    imageBase64: sale.imageBase64 || null,
    createdAt: new Date().toISOString()
  };

  return await dbAdd(STORES.SALES, data);
}

/**
 * 获取所有销售记录
 */
async function getAllSales(options = {}) {
  return await dbGetAll(STORES.SALES, options);
}

async function getSalesSummary(options = {}) {
  return await cloudRpc('vm_sales_summary', options);
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
  const sale = await dbGet(STORES.SALES, id);
  if (sale && sale.items) {
    for (const item of sale.items) {
      const product = await dbGet(STORES.PRODUCTS, item.productId);
      if (product) {
        // 使用实际扣减数回退，兼容旧数据用 quantity
        const rollbackQty = item.actualDeducted !== undefined ? item.actualDeducted : item.quantity;
        product.currentStock = (product.currentStock || 0) + rollbackQty;
        await updateProduct(product);
      }
    }
  }
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
  const oldSale = await dbGet(STORES.SALES, id);
  if (!oldSale) throw new Error('销售记录不存在');
  const oldItems = oldSale.items || [];
  const newItems = newSaleData.items || [];
  const date = newSaleData.date || oldSale.date;
  const yearMonth = date.substring(0, 7);

  if (!Object.prototype.hasOwnProperty.call(newSaleData, 'items') || canKeepExistingSaleCalculations(oldItems, newItems)) {
    return await dbPut(STORES.SALES, {
      ...oldSale,
      machineId: newSaleData.machineId || oldSale.machineId,
      date: date,
      yearMonth: yearMonth,
      note: newSaleData.note !== undefined ? newSaleData.note : oldSale.note,
      imageBase64: newSaleData.imageBase64 !== undefined ? newSaleData.imageBase64 : oldSale.imageBase64
    });
  }

  const productIds = [...new Set([
    ...oldItems.map(item => item.productId),
    ...newItems.map(item => item.productId)
  ].filter(Boolean))];
  const products = await Promise.all(productIds.map(productId => dbGet(STORES.PRODUCTS, productId)));
  const productMap = new Map(products.filter(Boolean).map(product => [product.id, product]));

  // 0. 预检新销售数据库存是否充足
  for (const item of newItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;
    const qty = parseInt(item.quantity) || 0;
    
    // 计算退回旧销量后的可用库存
    const oldItem = (oldSale.items || []).find(oi => oi.productId === item.productId);
    const rollbackQty = oldItem ? (oldItem.actualDeducted !== undefined ? oldItem.actualDeducted : oldItem.quantity) : 0;
    const availableStock = (product.currentStock || 0) + rollbackQty;
    
    if (qty > availableStock) {
      throw new Error(`商品 [${product.name}] 销售数量(${qty}) 大于当前可用库存(${availableStock})，请修改后再提交`);
    }
  }

  // 1. 回退旧库存（使用实际扣减数）
  for (const item of oldItems) {
    const product = productMap.get(item.productId);
    if (product) {
      const rollbackQty = item.actualDeducted !== undefined ? item.actualDeducted : item.quantity;
      product.currentStock = (product.currentStock || 0) + rollbackQty;
      await updateProduct(product);
    }
  }

  // 2. 应用新库存和计算新成本/售价
  let totalAmount = 0;
  let totalCogs = 0;
  const enrichedItems = [];

  for (const item of newItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    const qty = parseInt(item.quantity) || 0;

    const itemRevenue = item.itemRevenue !== undefined ? parseFloat(item.itemRevenue) : Math.round(qty * (product.sellPrice || 0) * 100) / 100;
    const itemCogs = item.itemCogs !== undefined ? parseFloat(item.itemCogs) : Math.round(qty * (product.avgCost || 0) * 100) / 100;

    if (qty === 0 && itemRevenue === 0 && itemCogs === 0) continue;

    totalAmount += itemRevenue;
    totalCogs += itemCogs;

    // 扣减新库存（记录实际扣减数）
    const stockBefore = product.currentStock || 0;
    product.currentStock = Math.max(0, stockBefore - qty);
    const actualDeducted = stockBefore - product.currentStock;
    await updateProduct(product);

    enrichedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: qty,
      actualDeducted: actualDeducted,
      sellPrice: product.sellPrice,
      avgCost: product.avgCost,
      itemRevenue: itemRevenue,
      itemCogs: itemCogs
    });
  }

  const updatedSale = {
    ...oldSale,
    machineId: newSaleData.machineId || oldSale.machineId,
    date: date,
    yearMonth: yearMonth,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalCogs: Math.round(totalCogs * 100) / 100,
    items: enrichedItems,
    note: newSaleData.note !== undefined ? newSaleData.note : oldSale.note,
    imageBase64: newSaleData.imageBase64 !== undefined ? newSaleData.imageBase64 : oldSale.imageBase64
  };

  return await dbPut(STORES.SALES, updatedSale);
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
  return await cloudRequest({
    method: 'POST',
    path: `?rpc=${encodeURIComponent(functionName)}`,
    body: payload || {},
    skipSession: options.skipSession
  });
}

async function dbAdd(storeName, data) {
  return await dbPut(storeName, data);
}

async function dbPut(storeName, data) {
  const recordId = getRecordId(storeName, data);
  if (!recordId) throw new Error('Missing record id');
  const imagePayload = stripRecordImagePayload(storeName, data);

  await cloudRequest({
    method: 'POST',
    body: {
      store: storeName,
      data: imagePayload.hadImagePayload
        ? {
            ...imagePayload.record,
            imageBase64: imagePayload.imageBase64 || '',
            mimeType: 'image/jpeg'
          }
        : imagePayload.record
    }
  });

  invalidateRecordCache(storeName);
  touchDataCachesForStore(storeName);
  return imagePayload.record;
}

async function dbGet(storeName, id) {
  return await cloudRequest({
    params: {
      store: storeName,
      recordId: String(id)
    }
  });
}

async function getRecordImageBase64(storeName, id) {
  const result = await cloudRequest({
    params: {
      store: storeName,
      recordId: String(id),
      image: '1'
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
    store: storeName,
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
  return await dbQueryRecords(storeName, {
    index: indexName,
    value: String(value)
  }, options);
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
    params: {
      store: storeName,
      recordId: String(id)
    }
  });
  invalidateRecordCache(storeName);
  touchDataCachesForStore(storeName);
}

async function dbClear(storeName) {
  await cloudRequest({
    method: 'DELETE',
    params: { store: storeName }
  });
  invalidateRecordCache(storeName);
  touchDataCachesForStore(storeName);
}

