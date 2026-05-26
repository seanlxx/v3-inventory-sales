import { all, first, run } from './d1.js';
import { putImageAsset, upsertImageAssetStatement } from './image-service.js';
import {
  centsToMoney,
  hasOwn,
  legacySalesType,
  moneyToCents,
  newId,
  normalizeSalesType,
  nowIso,
  positiveQuantity,
  quantity,
  recordDate,
  stringOrNull,
  yearMonthFromDate
} from './validators.js';
import { canServeOrderMachine, isSharedStockMachine, SHARED_PRODUCT_STOCK_MACHINE_SQL, stockMachineIdFor } from './stock-scope.js';

export class InventoryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InventoryValidationError';
  }
}

const PRODUCT_STATUSES = new Set(['active', 'archived']);
const IN_CLAUSE_BATCH_SIZE = 50;

function validationError(message) {
  return new InventoryValidationError(message);
}

function balanceKey(productId, machineId) {
  return `${productId}\u0000${machineId}`;
}

function balanceToLegacy(row = {}) {
  return {
    currentStock: Number(row.quantity_on_hand) || 0,
    avgCost: centsToMoney(row.avg_cost_cents),
    totalPurchaseQty: Number(row.total_purchase_qty) || 0,
    totalPurchaseCost: centsToMoney(row.total_purchase_cost_cents)
  };
}

function productToLegacy(row) {
  return {
    id: row.id,
    name: row.name,
    machineId: row.machine_id,
    stockMachineId: row.stock_machine_id || stockMachineIdFor(row.machine_id),
    category: row.category || '其他',
    sellPrice: centsToMoney(row.sell_price_cents),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...balanceToLegacy(row)
  };
}

function purchaseToLegacy(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    machineId: row.machine_id,
    quantity: Number(row.quantity) || 0,
    unitPrice: centsToMoney(row.unit_cost_cents),
    totalPrice: centsToMoney(row.total_cost_cents),
    source: row.source || '拼多多',
    date: row.record_date,
    note: row.note || '',
    hasImage: !!row.image_asset_id,
    voidedAt: row.voided_at || null,
    createdAt: row.created_at
  };
}

function purchaseOrderToLegacy(order, items = []) {
  const totalCostCents = items.reduce((sum, item) => sum + (Number(item.total_cost_cents) || 0), 0);
  const quantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return {
    id: order.id,
    machineId: order.machine_id,
    date: order.record_date,
    source: order.source || '拼多多',
    note: order.note || '',
    imageAssetId: order.image_asset_id || null,
    hasImage: !!order.image_asset_id,
    status: order.voided_at ? 'voided' : 'active',
    voidedAt: order.voided_at || null,
    items: items.map(row => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      quantity: Number(row.quantity) || 0,
      unitPrice: centsToMoney(row.unit_cost_cents),
      totalPrice: centsToMoney(row.total_cost_cents)
    })),
    quantity,
    totalCost: centsToMoney(totalCostCents),
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
}

function saleOrderToLegacy(order, items = []) {
  return {
    id: order.id,
    machineId: order.machine_id,
    date: order.record_date,
    yearMonth: order.year_month,
    totalAmount: centsToMoney(order.total_amount_cents),
    receivedAmount: centsToMoney(order.received_amount_cents ?? order.total_amount_cents),
    totalCogs: centsToMoney(order.total_cogs_cents),
    items,
    type: legacySalesType(order.type),
    note: order.note || '',
    hasImage: !!order.image_asset_id,
    status: order.voided_at ? 'voided' : 'active',
    voidedAt: order.voided_at || null,
    source: order.source || 'manual',
    externalId: order.external_id || null,
    createdAt: order.created_at
  };
}

function saleItemToLegacy(row) {
  return {
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity) || 0,
    actualDeducted: row.order_type === 'refund' ? 0 : Number(row.quantity) || 0,
    sellPrice: centsToMoney(row.unit_price_cents),
    avgCost: centsToMoney(row.unit_cost_cents),
    itemRevenue: centsToMoney(row.line_amount_cents),
    itemCogs: centsToMoney(row.line_cogs_cents)
  };
}

function productRowFromPayload(payload, existing = null) {
  const timestamp = nowIso();
  const machineId = stockMachineIdFor(stringOrNull(payload.machineId) || existing?.machine_id || '1号机');
  return {
    id: stringOrNull(payload.id) || existing?.id || newId(),
    machine_id: machineId,
    name: stringOrNull(payload.name) || existing?.name || '',
    category: stringOrNull(payload.category) || existing?.category || '其他',
    sell_price_cents: moneyToCents(hasOwn(payload, 'sellPrice') ? payload.sellPrice : centsToMoney(existing?.sell_price_cents)),
    status: existing?.status || 'active',
    created_at: existing?.created_at || stringOrNull(payload.createdAt) || timestamp,
    updated_at: timestamp
  };
}

function normalizeProductStatus(value) {
  const status = stringOrNull(value);
  if (!PRODUCT_STATUSES.has(status)) throw validationError('Invalid product status');
  return status;
}

async function getProduct(env, productId) {
  return await first(env.DB, `
    SELECT *
    FROM products
    WHERE id = ?
    LIMIT 1
  `, [productId]);
}

async function getProductByNameMachine(env, name, machineId) {
  const stockMachineId = stockMachineIdFor(machineId);
  return await first(env.DB, `
    SELECT *
    FROM products
    WHERE name = ? AND machine_id = ? AND status = 'active'
    LIMIT 1
  `, [name, stockMachineId]);
}

async function getBalance(env, productId, machineId, cache = new Map()) {
  const stockMachineId = stockMachineIdFor(machineId);
  const key = balanceKey(productId, stockMachineId);
  if (cache.has(key)) return cache.get(key);

  const row = await first(env.DB, `
    SELECT *
    FROM inventory_balances
    WHERE product_id = ? AND machine_id = ?
    LIMIT 1
  `, [productId, stockMachineId]);

  const balance = row || {
    product_id: productId,
    machine_id: stockMachineId,
    quantity_on_hand: 0,
    avg_cost_cents: 0,
    inventory_value_cents: 0,
    total_purchase_qty: 0,
    total_purchase_cost_cents: 0,
    updated_at: nowIso()
  };
  cache.set(key, balance);
  return balance;
}

function upsertProductStatement(db, product) {
  return db.prepare(`
    INSERT INTO products (
      id, machine_id, name, category, sell_price_cents, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      machine_id = excluded.machine_id,
      name = excluded.name,
      category = excluded.category,
      sell_price_cents = excluded.sell_price_cents,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    product.id,
    product.machine_id,
    product.name,
    product.category,
    product.sell_price_cents,
    product.status,
    product.created_at,
    product.updated_at
  );
}

function upsertBalanceStatement(db, balance) {
  return db.prepare(`
    INSERT INTO inventory_balances (
      product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
      total_purchase_qty, total_purchase_cost_cents, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id, machine_id) DO UPDATE SET
      quantity_on_hand = excluded.quantity_on_hand,
      avg_cost_cents = excluded.avg_cost_cents,
      inventory_value_cents = excluded.inventory_value_cents,
      total_purchase_qty = excluded.total_purchase_qty,
      total_purchase_cost_cents = excluded.total_purchase_cost_cents,
      updated_at = excluded.updated_at
  `).bind(
    balance.product_id,
    balance.machine_id,
    balance.quantity_on_hand,
    balance.avg_cost_cents,
    balance.inventory_value_cents,
    balance.total_purchase_qty,
    balance.total_purchase_cost_cents,
    balance.updated_at
  );
}

function movementStatement(db, movement) {
  return db.prepare(`
    INSERT INTO stock_movements (
      id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
      ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    movement.id,
    movement.product_id,
    movement.machine_id,
    movement.movement_type,
    movement.qty_delta,
    movement.unit_cost_cents,
    movement.ref_type,
    movement.ref_id,
    movement.ref_item_id || null,
    movement.voids_movement_id || null,
    movement.external_id || null,
    movement.reason || null,
    movement.created_at
  );
}

function applyBalanceDelta(balance, delta) {
  const next = { ...balance };
  next.quantity_on_hand += delta.qtyDelta;
  next.inventory_value_cents += delta.valueDeltaCents;
  next.total_purchase_qty += delta.purchaseQtyDelta || 0;
  next.total_purchase_cost_cents += delta.purchaseCostDeltaCents || 0;
  next.updated_at = delta.timestamp;

  if (next.quantity_on_hand === 0) {
    next.avg_cost_cents = 0;
    next.inventory_value_cents = 0;
  } else {
    next.avg_cost_cents = Math.round(next.inventory_value_cents / next.quantity_on_hand);
  }

  return next;
}

async function applyMovement(env, cache, movement, valueDeltaCents, statements, purchaseQtyDelta = 0, purchaseCostDeltaCents = 0) {
  const balance = await getBalance(env, movement.product_id, movement.machine_id, cache);
  const nextBalance = applyBalanceDelta(balance, {
    qtyDelta: movement.qty_delta,
    valueDeltaCents,
    purchaseQtyDelta,
    purchaseCostDeltaCents,
    timestamp: movement.created_at
  });
  cache.set(balanceKey(movement.product_id, nextBalance.machine_id), nextBalance);
  statements.push(movementStatement(env.DB, movement));
  statements.push(upsertBalanceStatement(env.DB, nextBalance));
  return nextBalance;
}

export async function listProducts(env, options = {}) {
  const conditions = [];
  const params = [];
  if (!options.includeArchived) conditions.push("p.status = 'active'");
  if (options.id) {
    conditions.push('p.id = ?');
    params.push(options.id);
  }
  if (options.machineId) {
    conditions.push(`${SHARED_PRODUCT_STOCK_MACHINE_SQL} = ?`);
    params.push(stockMachineIdFor(options.machineId));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await all(env.DB, `
    SELECT
      p.*,
      ${SHARED_PRODUCT_STOCK_MACHINE_SQL} AS stock_machine_id,
      COALESCE(b.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(b.avg_cost_cents, 0) AS avg_cost_cents,
      COALESCE(b.inventory_value_cents, 0) AS inventory_value_cents,
      COALESCE(b.total_purchase_qty, 0) AS total_purchase_qty,
      COALESCE(b.total_purchase_cost_cents, 0) AS total_purchase_cost_cents
    FROM products p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.machine_id = ${SHARED_PRODUCT_STOCK_MACHINE_SQL}
    ${where}
    ORDER BY p.machine_id, p.name
  `, params);
  return rows.map(productToLegacy);
}

export async function saveProduct(env, payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid product');
  const existing = payload.id ? await getProduct(env, payload.id) : null;
  const product = productRowFromPayload(payload, existing);
  if (!product.name) throw new Error('Missing product name');

  const statements = [upsertProductStatement(env.DB, product)];
  await env.DB.batch(statements);

  if (hasOwn(payload, 'currentStock')) {
    await createAdjustment(env, {
      productId: product.id,
      machineId: product.machine_id,
      quantityOnHand: quantity(payload.currentStock),
      unitCost: hasOwn(payload, 'avgCost') ? payload.avgCost : 0,
      note: 'product stock edit'
    });
  }

  const [saved] = await listProducts(env, { id: product.id, includeArchived: true });
  return saved;
}

export async function archiveProduct(env, productId) {
  return await updateProductStatus(env, productId, 'archived');
}

export async function updateProductStatus(env, productId, status) {
  const id = stringOrNull(productId);
  if (!id) throw validationError('Missing product id');
  const existing = await getProduct(env, id);
  if (!existing) throw validationError('Product not found');

  const normalizedStatus = normalizeProductStatus(status);
  await run(env.DB, `
    UPDATE products
    SET status = ?, updated_at = ?
    WHERE id = ?
  `, [normalizedStatus, nowIso(), id]);

  const [saved] = await listProducts(env, { id, includeArchived: true });
  return saved;
}

async function ensurePurchaseProduct(env, purchase, statements) {
  let product = purchase.productId ? await getProduct(env, purchase.productId) : null;
  const productName = stringOrNull(purchase.productName);
  const machineId = stockMachineIdFor(stringOrNull(purchase.machineId) || product?.machine_id || '1号机');

  if (!product && productName) {
    product = await getProductByNameMachine(env, productName, machineId);
  }

  if (!product && productName) {
    product = productRowFromPayload({
      name: productName,
      machineId,
      category: purchase.category || '其他',
      sellPrice: purchase.sellPrice || 0,
      currentStock: 0
    });
    statements.push(upsertProductStatement(env.DB, product));
  }

  if (!product) throw new Error('Product not found');
  return product;
}

export async function createPurchases(env, payload) {
  if (Array.isArray(payload?.items)) {
    return await createPurchaseOrder(env, payload);
  }

  const items = Array.isArray(payload?.purchases) ? payload.purchases : [payload];
  if (!items.length) throw new Error('Missing purchases');

  const timestamp = nowIso();
  const statements = [];
  const balanceCache = new Map();
  const saved = [];
  const imageBase64 = payload?.imageBase64 || items[0]?.imageBase64 || '';
  const firstOrderId = stringOrNull(items[0]?.id) || newId();
  const sharedImage = imageBase64
    ? await putImageAsset(env, 'purchases', firstOrderId, imageBase64, payload?.mimeType || items[0]?.mimeType || 'image/jpeg')
    : null;
  if (sharedImage) statements.push(upsertImageAssetStatement(env.DB, sharedImage));

  for (let index = 0; index < items.length; index += 1) {
    const input = items[index] || {};
    const product = await ensurePurchaseProduct(env, input, statements);
    const orderId = index === 0 ? firstOrderId : (stringOrNull(input.id) || newId());
    const qty = positiveQuantity(input.quantity);
    const totalCostCents = moneyToCents(input.totalPrice);
    const unitCostCents = moneyToCents(input.unitPrice) || (qty > 0 ? Math.round(totalCostCents / qty) : 0);
    if (qty <= 0) throw new Error('Invalid purchase quantity');
    if (totalCostCents <= 0) throw new Error('Invalid purchase total price');

    const date = recordDate(input.date);
    const itemId = `${orderId}:0`;
    const machineId = stockMachineIdFor(product.machine_id);

    statements.push(env.DB.prepare(`
      INSERT INTO purchase_orders (
        id, machine_id, record_date, source, note, image_asset_id, voided_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).bind(
      orderId,
      machineId,
      date,
      stringOrNull(input.source) || '拼多多',
      stringOrNull(input.note),
      sharedImage?.id || null,
      timestamp,
      timestamp
    ));

    statements.push(env.DB.prepare(`
      INSERT INTO purchase_items (
        id, purchase_id, product_id, quantity, unit_cost_cents, total_cost_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(itemId, orderId, product.id, qty, unitCostCents, totalCostCents, timestamp));

    await applyMovement(env, balanceCache, {
      id: `purchase_order:${orderId}:${product.id}:0`,
      product_id: product.id,
      machine_id: machineId,
      movement_type: 'purchase',
      qty_delta: qty,
      unit_cost_cents: unitCostCents,
      ref_type: 'purchase_order',
      ref_id: orderId,
      ref_item_id: itemId,
      voids_movement_id: null,
      created_at: timestamp
    }, totalCostCents, statements, qty, totalCostCents);

    saved.push({
      id: orderId,
      productId: product.id,
      productName: product.name,
      machineId,
      quantity: qty,
      unitPrice: centsToMoney(unitCostCents),
      totalPrice: centsToMoney(totalCostCents),
      source: stringOrNull(input.source) || '拼多多',
      date,
      note: stringOrNull(input.note) || '',
      hasImage: !!sharedImage,
      createdAt: timestamp
    });
  }

  await env.DB.batch(statements);
  return { purchases: saved };
}

export async function createPurchaseOrder(env, payload) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  if (!rawItems.length) throw new Error('Missing purchases');

  const timestamp = nowIso();
  const statements = [];
  const balanceCache = new Map();
  const orderId = stringOrNull(payload.id) || newId();
  const imageBase64 = stringOrNull(payload.imageBase64);
  const sharedImage = imageBase64
    ? await putImageAsset(env, 'purchases', orderId, imageBase64, payload.mimeType || 'image/jpeg')
    : null;
  if (sharedImage) statements.push(upsertImageAssetStatement(env.DB, sharedImage));

  let orderMachineId = stringOrNull(payload.machineId);
  const products = [];
  for (const rawItem of rawItems) {
    const product = await ensurePurchaseProduct(env, {
      ...rawItem,
      machineId: rawItem.machineId || payload.machineId
    }, statements);
    products.push({ rawItem, product });
    if (!orderMachineId) orderMachineId = product.machine_id;
  }
  orderMachineId = stockMachineIdFor(orderMachineId || '1号机');

  const date = recordDate(payload.date);
  const imageAssetId = stringOrNull(payload.imageAssetId) || sharedImage?.id || null;
  statements.push(env.DB.prepare(`
    INSERT INTO purchase_orders (
      id, machine_id, record_date, source, note, image_asset_id, voided_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).bind(
    orderId,
    orderMachineId,
    date,
    stringOrNull(payload.source) || '拼多多',
    stringOrNull(payload.note),
    imageAssetId,
    timestamp,
    timestamp
  ));

  const savedItems = [];
  for (let index = 0; index < products.length; index += 1) {
    const { rawItem, product } = products[index];
    const qty = positiveQuantity(rawItem.quantity);
    const totalCostCents = moneyToCents(rawItem.totalPrice);
    const unitCostCents = moneyToCents(rawItem.unitPrice) || (qty > 0 ? Math.round(totalCostCents / qty) : 0);
    if (qty <= 0) throw new Error('Invalid purchase quantity');
    if (totalCostCents <= 0) throw new Error('Invalid purchase total price');

    const itemId = `${orderId}:${index}`;
    statements.push(env.DB.prepare(`
      INSERT INTO purchase_items (
        id, purchase_id, product_id, quantity, unit_cost_cents, total_cost_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(itemId, orderId, product.id, qty, unitCostCents, totalCostCents, timestamp));

    await applyMovement(env, balanceCache, {
      id: `purchase_order:${orderId}:${product.id}:${index}`,
      product_id: product.id,
      machine_id: orderMachineId,
      movement_type: 'purchase',
      qty_delta: qty,
      unit_cost_cents: unitCostCents,
      ref_type: 'purchase_order',
      ref_id: orderId,
      ref_item_id: itemId,
      voids_movement_id: null,
      created_at: timestamp
    }, totalCostCents, statements, qty, totalCostCents);

    savedItems.push({
      id: itemId,
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      unit_cost_cents: unitCostCents,
      total_cost_cents: totalCostCents
    });
  }

  await env.DB.batch(statements);
  return {
    purchase: purchaseOrderToLegacy({
      id: orderId,
      machine_id: orderMachineId,
      record_date: date,
      source: stringOrNull(payload.source) || '拼多多',
      note: stringOrNull(payload.note) || '',
      image_asset_id: imageAssetId,
      voided_at: null,
      created_at: timestamp,
      updated_at: timestamp
    }, savedItems),
    purchases: savedItems.map(item => ({
      id: orderId,
      productId: item.product_id,
      productName: item.product_name,
      machineId: orderMachineId,
      quantity: item.quantity,
      unitPrice: centsToMoney(item.unit_cost_cents),
      totalPrice: centsToMoney(item.total_cost_cents),
      source: stringOrNull(payload.source) || '拼多多',
      date,
      note: stringOrNull(payload.note) || '',
      hasImage: !!imageAssetId,
      createdAt: timestamp
    }))
  };
}

export async function listPurchases(env, filters = {}) {
  const conditions = ['o.voided_at IS NULL'];
  const params = [];
  if (filters.id) {
    conditions.push('o.id = ?');
    params.push(filters.id);
  }
  if (filters.productId) {
    conditions.push('i.product_id = ?');
    params.push(filters.productId);
  }
  if (filters.datePrefix) {
    conditions.push('o.record_date >= ? AND o.record_date < ?');
    params.push(filters.datePrefix, `${filters.datePrefix}\uffff`);
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 1000, 1), 1000);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  params.push(limit, offset);

  const rows = await all(env.DB, `
    SELECT
      o.*,
      i.product_id,
      i.quantity,
      i.unit_cost_cents,
      i.total_cost_cents,
      p.name AS product_name
    FROM purchase_orders o
    JOIN purchase_items i ON i.purchase_id = o.id
    JOIN products p ON p.id = i.product_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.record_date DESC, o.created_at DESC
    LIMIT ? OFFSET ?
  `, params);
  return rows.map(purchaseToLegacy);
}

export async function listPurchaseOrders(env, filters = {}) {
  const conditions = [];
  const params = [];
  const status = filters.status || 'active';

  if (status === 'voided') {
    conditions.push('o.voided_at IS NOT NULL');
  } else if (status !== 'all') {
    conditions.push('o.voided_at IS NULL');
  }
  if (filters.id) {
    conditions.push('o.id = ?');
    params.push(filters.id);
  }
  if (filters.productId) {
    conditions.push('EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.purchase_id = o.id AND pi.product_id = ?)');
    params.push(filters.productId);
  }
  if (filters.datePrefix) {
    conditions.push('o.record_date >= ? AND o.record_date < ?');
    params.push(filters.datePrefix, `${filters.datePrefix}\uffff`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 1000);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const orders = await all(env.DB, `
    SELECT *
    FROM purchase_orders o
    ${where}
    ORDER BY o.record_date DESC, o.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  if (!orders.length) return [];

  const ids = orders.map(order => order.id);
  const itemRows = await all(env.DB, `
    SELECT
      i.*,
      p.name AS product_name
    FROM purchase_items i
    JOIN products p ON p.id = i.product_id
    WHERE i.purchase_id IN (${ids.map(() => '?').join(', ')})
    ORDER BY i.purchase_id, i.id
  `, ids);

  const itemsByOrder = new Map();
  for (const item of itemRows) {
    if (!itemsByOrder.has(item.purchase_id)) itemsByOrder.set(item.purchase_id, []);
    itemsByOrder.get(item.purchase_id).push(item);
  }

  return orders.map(order => purchaseOrderToLegacy(order, itemsByOrder.get(order.id) || []));
}

export async function getPurchaseOrder(env, id) {
  const [purchase] = await listPurchaseOrders(env, { id, status: 'all', limit: 1 });
  return purchase || null;
}

export async function getPurchase(env, id) {
  const [purchase] = await listPurchases(env, { id, limit: 1 });
  return purchase || null;
}

export async function updatePurchase(env, id, payload) {
  const existing = await getPurchase(env, id);
  if (!existing) throw new Error('Purchase not found');

  const changesInventory = ['productId', 'productName', 'quantity', 'unitPrice', 'totalPrice'].some(key => hasOwn(payload, key));
  if (!changesInventory) {
    await run(env.DB, `
      UPDATE purchase_orders
      SET record_date = ?, source = ?, note = ?, updated_at = ?
      WHERE id = ? AND voided_at IS NULL
    `, [
      recordDate(payload.date || existing.date),
      stringOrNull(payload.source) || existing.source || '拼多多',
      stringOrNull(payload.note) || '',
      nowIso(),
      id
    ]);
    return await getPurchase(env, id);
  }

  await voidDocument(env, { refType: 'purchase_order', id });
  const result = await createPurchases(env, {
    ...existing,
    ...payload,
    id: newId()
  });
  return result.purchases[0];
}

async function loadProductsForItems(env, items) {
  const ids = [...new Set(items.map(item => stringOrNull(item.productId)).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await all(env.DB, `
    SELECT *
    FROM products
    WHERE id IN (${ids.map(() => '?').join(', ')})
  `, ids);
  return new Map(rows.map(row => [row.id, row]));
}

export async function createSalesOrder(env, payload, forcedType = null) {
  const type = forcedType || normalizeSalesType(payload?.type);
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  if (!rawItems.length) throw validationError('缺少销售明细');

  const productMap = await loadProductsForItems(env, rawItems);
  const missingItem = rawItems.find(item => stringOrNull(item?.productId) && !productMap.has(stringOrNull(item.productId)));
  if (missingItem) throw validationError('销售明细中包含不存在的商品，请重新选择商品');

  const timestamp = nowIso();
  const date = recordDate(payload.date);
  const yearMonth = yearMonthFromDate(date);
  const orderId = stringOrNull(payload.id) || newId();
  const productMachineIds = [...new Set(Array.from(productMap.values()).map(product => stockMachineIdFor(product.machine_id)).filter(Boolean))];
  const requestedMachineId = stringOrNull(payload.machineId);
  const machineId = requestedMachineId || (productMachineIds.length === 1 ? productMachineIds[0] : '1号机');
  const stockMachineId = stockMachineIdFor(machineId);
  const mismatchedProduct = Array.from(productMap.values()).find(product => !canServeOrderMachine(product.machine_id, machineId));
  if (mismatchedProduct) {
    throw validationError(`${mismatchedProduct.name} 属于 ${mismatchedProduct.machine_id}，不能记入 ${machineId}`);
  }
  const statements = [];
  const balanceCache = new Map();
  const savedItems = [];
  let totalAmountCents = 0;
  let totalCogsCents = 0;

  const imageAsset = payload?.imageBase64
    ? await putImageAsset(env, 'sales', orderId, payload.imageBase64, payload.mimeType || 'image/jpeg')
    : null;
  if (imageAsset) statements.push(upsertImageAssetStatement(env.DB, imageAsset));

  statements.push(env.DB.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      received_amount_cents, note, image_asset_id, voided_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, NULL, ?, ?)
  `).bind(
    orderId,
    type,
    machineId,
    date,
    yearMonth,
    stringOrNull(payload.note),
    imageAsset?.id || null,
    timestamp,
    timestamp
  ));

  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index] || {};
    const product = productMap.get(stringOrNull(item.productId));
    if (!product) continue;

    const qty = positiveQuantity(item.quantity);
    if (qty <= 0) continue;

    const balance = await getBalance(env, product.id, stockMachineId, balanceCache);
    if ((type === 'sale' || type === 'loss') && qty > balance.quantity_on_hand) {
      throw validationError(`${product.name} 库存不足：当前 ${balance.quantity_on_hand}，本次 ${qty}`);
    }

    const unitPriceCents = type === 'loss'
      ? 0
      : (moneyToCents(item.sellPrice) || product.sell_price_cents || 0);
    const explicitLineCogs = hasOwn(item, 'itemCogs') ? Math.abs(moneyToCents(item.itemCogs)) : 0;
    const unitCostCents = explicitLineCogs && qty > 0 ? Math.round(explicitLineCogs / qty) : (balance.avg_cost_cents || moneyToCents(item.avgCost));
    const lineAmountCents = type === 'loss'
      ? 0
      : (hasOwn(item, 'itemRevenue') ? Math.abs(moneyToCents(item.itemRevenue)) : qty * unitPriceCents);
    const lineCogsCents = explicitLineCogs || qty * unitCostCents;
    const itemId = `${orderId}:${index}`;
    const qtyDelta = type === 'refund' ? qty : -qty;

    totalAmountCents += lineAmountCents;
    totalCogsCents += lineCogsCents;

    statements.push(env.DB.prepare(`
      INSERT INTO sales_items (
        id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
        line_amount_cents, line_cogs_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(itemId, orderId, product.id, qty, unitPriceCents, unitCostCents, lineAmountCents, lineCogsCents, timestamp));

    await applyMovement(env, balanceCache, {
      id: `sales_order:${orderId}:${product.id}:${index}`,
      product_id: product.id,
      machine_id: stockMachineId,
      movement_type: type,
      qty_delta: qtyDelta,
      unit_cost_cents: unitCostCents,
      ref_type: 'sales_order',
      ref_id: orderId,
      ref_item_id: itemId,
      voids_movement_id: null,
      created_at: timestamp
    }, type === 'refund' ? lineCogsCents : -lineCogsCents, statements);

    savedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: qty,
      actualDeducted: type === 'refund' ? 0 : qty,
      sellPrice: centsToMoney(unitPriceCents),
      avgCost: centsToMoney(unitCostCents),
      itemRevenue: centsToMoney(lineAmountCents),
      itemCogs: centsToMoney(lineCogsCents)
    });
  }

  if (!savedItems.length) throw validationError('没有有效的销售明细，请确认商品和数量');

  statements.push(env.DB.prepare(`
    UPDATE sales_orders
    SET total_amount_cents = ?,
        total_cogs_cents = ?,
        received_amount_cents = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(totalAmountCents, totalCogsCents, totalAmountCents, timestamp, orderId));

  await env.DB.batch(statements);

  return {
    id: orderId,
    machineId,
    date,
    yearMonth,
    totalAmount: centsToMoney(totalAmountCents),
    receivedAmount: centsToMoney(totalAmountCents),
    totalCogs: centsToMoney(totalCogsCents),
    items: savedItems,
    type: legacySalesType(type),
    note: stringOrNull(payload.note) || '',
    hasImage: !!imageAsset,
    createdAt: timestamp
  };
}

export async function listSales(env, filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.status === 'voided') {
    conditions.push('o.voided_at IS NOT NULL');
  } else if (filters.status !== 'all') {
    conditions.push('o.voided_at IS NULL');
  }
  if (filters.id) {
    conditions.push('o.id = ?');
    params.push(filters.id);
  }
  if (filters.type && filters.type !== 'all') {
    conditions.push('o.type = ?');
    params.push(normalizeSalesType(filters.type));
  }
  if (filters.machineId && filters.machineId !== 'all') {
    conditions.push('o.machine_id = ?');
    params.push(filters.machineId);
  }
  if (filters.productId && filters.productId !== 'all') {
    conditions.push(`EXISTS (
      SELECT 1
      FROM sales_items si
      WHERE si.sales_order_id = o.id AND si.product_id = ?
    )`);
    params.push(filters.productId);
  }
  if (filters.yearMonth) {
    conditions.push('o.year_month = ?');
    params.push(filters.yearMonth);
  }
  if (filters.datePrefix) {
    conditions.push('o.record_date >= ? AND o.record_date < ?');
    params.push(filters.datePrefix, `${filters.datePrefix}\uffff`);
  }
  if (filters.sinceDate) {
    conditions.push('o.record_date >= ?');
    params.push(filters.sinceDate);
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 1000, 1), 1000);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  params.push(limit, offset);

  const orders = await all(env.DB, `
    SELECT *
    FROM sales_orders o
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY o.record_date DESC, o.created_at DESC
    LIMIT ? OFFSET ?
  `, params);
  if (!orders.length) return [];

  const ids = orders.map(order => order.id);
  const itemRows = [];
  for (let index = 0; index < ids.length; index += IN_CLAUSE_BATCH_SIZE) {
    const batchIds = ids.slice(index, index + IN_CLAUSE_BATCH_SIZE);
    itemRows.push(...await all(env.DB, `
      SELECT
        i.*,
        o.type AS order_type,
        p.name AS product_name
      FROM sales_items i
      JOIN sales_orders o ON o.id = i.sales_order_id
      JOIN products p ON p.id = i.product_id
      WHERE i.sales_order_id IN (${batchIds.map(() => '?').join(', ')})
      ORDER BY i.sales_order_id, i.id
    `, batchIds));
  }
  const itemsByOrder = new Map();
  for (const item of itemRows) {
    if (!itemsByOrder.has(item.sales_order_id)) itemsByOrder.set(item.sales_order_id, []);
    itemsByOrder.get(item.sales_order_id).push(saleItemToLegacy(item));
  }

  return orders.map(order => saleOrderToLegacy(order, itemsByOrder.get(order.id) || []));
}

export async function getSale(env, id) {
  const [sale] = await listSales(env, { id, limit: 1 });
  return sale || null;
}

function itemSignature(items = []) {
  return items
    .map(item => `${item.productId}:${positiveQuantity(item.quantity)}`)
    .filter(item => !item.endsWith(':0'))
    .sort()
    .join('|');
}

export async function updateSalesOrder(env, id, payload) {
  const existing = await getSale(env, id);
  if (!existing) throw new Error('Sales order not found');
  if (existing.source && existing.source !== 'manual') throw new Error('外部同步销售单为只读，不能编辑');

  const hasItems = Array.isArray(payload?.items);
  if (!hasItems || itemSignature(payload.items) === itemSignature(existing.items)) {
    const date = recordDate(payload.date || existing.date);
    await run(env.DB, `
      UPDATE sales_orders
      SET record_date = ?,
          year_month = ?,
          note = ?,
          updated_at = ?
      WHERE id = ? AND voided_at IS NULL
    `, [date, yearMonthFromDate(date), stringOrNull(payload.note) || '', nowIso(), id]);
    return await getSale(env, id);
  }

  await voidDocument(env, { refType: 'sales_order', id });
  return await createSalesOrder(env, {
    ...existing,
    ...payload,
    id: newId(),
    type: normalizeSalesType(existing.type)
  }, normalizeSalesType(existing.type));
}

export async function createAdjustment(env, payload) {
  const productId = stringOrNull(payload.productId);
  const product = productId ? await getProduct(env, productId) : null;
  if (!product) throw new Error('Product not found');

  const machineId = stockMachineIdFor(stringOrNull(payload.machineId) || product.machine_id);
  if (isSharedStockMachine(machineId)) {
    throw validationError('1/2号机总库存只按入库单和销售扣减计算，不允许盘点调整');
  }
  const balanceCache = new Map();
  const current = await getBalance(env, product.id, machineId, balanceCache);
  const target = hasOwn(payload, 'quantityOnHand') ? quantity(payload.quantityOnHand) : null;
  const qtyDelta = target === null ? quantity(payload.qtyDelta) : target - current.quantity_on_hand;
  if (qtyDelta === 0) return productToLegacy({ ...product, ...current });

  const timestamp = nowIso();
  const unitCostCents = moneyToCents(payload.unitCost) || current.avg_cost_cents || 0;
  const statements = [];
  const adjustmentId = stringOrNull(payload.id) || newId();
  await applyMovement(env, balanceCache, {
    id: `adjustment:${adjustmentId}:${product.id}:0`,
    product_id: product.id,
    machine_id: machineId,
    movement_type: 'adjustment',
    qty_delta: qtyDelta,
    unit_cost_cents: unitCostCents,
    ref_type: 'adjustment',
    ref_id: adjustmentId,
    ref_item_id: null,
    voids_movement_id: null,
    created_at: timestamp
  }, qtyDelta * unitCostCents, statements);

  await env.DB.batch(statements);
  const [saved] = await listProducts(env, { id: product.id, includeArchived: true });
  return saved;
}

export async function voidDocument(env, payload) {
  const refType = payload.refType === 'purchase' ? 'purchase_order'
    : payload.refType === 'sales' ? 'sales_order'
    : payload.refType;
  const id = stringOrNull(payload.id || payload.refId);
  if (!id || !['purchase_order', 'sales_order'].includes(refType)) {
    throw new Error('Invalid void target');
  }

  const table = refType === 'purchase_order' ? 'purchase_orders' : 'sales_orders';
  const order = await first(env.DB, `SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  if (!order) throw new Error('Document not found');
  if (refType === 'sales_order' && order.source && order.source !== 'manual') {
    throw new Error('外部同步销售单为只读，不能作废');
  }
  if (order.voided_at) return { id, refType, voided: true };

  const movements = await all(env.DB, `
    SELECT *
    FROM stock_movements
    WHERE ref_type = ? AND ref_id = ? AND movement_type != 'void'
    ORDER BY created_at, id
  `, [refType, id]);
  const timestamp = nowIso();
  const statements = [
    env.DB.prepare(`UPDATE ${table} SET voided_at = ?, updated_at = ? WHERE id = ?`).bind(timestamp, timestamp, id)
  ];
  const balanceCache = new Map();

  for (const movement of movements) {
    const reverse = {
      id: `void:${movement.id}`,
      product_id: movement.product_id,
      machine_id: movement.machine_id,
      movement_type: 'void',
      qty_delta: -movement.qty_delta,
      unit_cost_cents: movement.unit_cost_cents,
      ref_type: movement.ref_type,
      ref_id: movement.ref_id,
      ref_item_id: movement.ref_item_id,
      voids_movement_id: movement.id,
      created_at: timestamp
    };
    const voidValue = await getVoidValueDelta(env, movement, reverse);
    const valueDelta = voidValue.valueDeltaCents;
    const purchaseQtyDelta = voidValue.purchaseQtyDelta;
    const purchaseCostDelta = voidValue.purchaseCostDeltaCents;
    await applyMovement(env, balanceCache, reverse, valueDelta, statements, purchaseQtyDelta, purchaseCostDelta);
  }

  await env.DB.batch(statements);
  return { id, refType, voided: true };
}

async function getVoidValueDelta(env, movement, reverse) {
  if (movement.movement_type === 'purchase') {
    const item = await first(env.DB, `
      SELECT quantity, total_cost_cents
      FROM purchase_items
      WHERE id = ?
      LIMIT 1
    `, [movement.ref_item_id]);
    const quantityDelta = -Math.abs(Number(item?.quantity ?? movement.qty_delta) || 0);
    const costDelta = -Math.abs(Number(item?.total_cost_cents ?? movement.qty_delta * movement.unit_cost_cents) || 0);
    return {
      valueDeltaCents: costDelta,
      purchaseQtyDelta: quantityDelta,
      purchaseCostDeltaCents: costDelta
    };
  }

  if (movement.movement_type === 'sale' || movement.movement_type === 'loss' || movement.movement_type === 'refund') {
    const item = await first(env.DB, `
      SELECT line_cogs_cents
      FROM sales_items
      WHERE id = ?
      LIMIT 1
    `, [movement.ref_item_id]);
    const cogs = Math.abs(Number(item?.line_cogs_cents ?? movement.qty_delta * movement.unit_cost_cents) || 0);
    return {
      valueDeltaCents: movement.movement_type === 'refund' ? -cogs : cogs,
      purchaseQtyDelta: 0,
      purchaseCostDeltaCents: 0
    };
  }

  return {
    valueDeltaCents: reverse.qty_delta * movement.unit_cost_cents,
    purchaseQtyDelta: 0,
    purchaseCostDeltaCents: 0
  };
}

export async function monthlyReport(env, options = {}) {
  const feeRate = Math.max(0, Number(options.feeRate) || 0);
  const months = options.includeMonthly === false
    ? [options.currentMonth, options.previousMonth].filter(Boolean)
    : [];
  const salesFilter = months.length ? `AND year_month IN (${months.map(() => '?').join(', ')})` : '';
  const salesRows = await all(env.DB, `
    SELECT
      year_month AS month,
      COALESCE(SUM(total_amount_cents), 0) AS revenue_cents,
      COALESCE(SUM(received_amount_cents), 0) AS received_cents,
      COALESCE(SUM(total_cogs_cents), 0) AS cogs_cents,
      COALESCE(SUM(CASE WHEN type = 'refund' THEN total_amount_cents ELSE 0 END), 0) AS refunds_cents,
      COUNT(*) AS sales_count
    FROM sales_orders
    WHERE voided_at IS NULL
      ${salesFilter}
    GROUP BY year_month
  `, months);

  const purchaseFilter = months.length
    ? `AND substr(o.record_date, 1, 7) IN (${months.map(() => '?').join(', ')})`
    : '';
  const purchaseRows = await all(env.DB, `
    SELECT
      substr(o.record_date, 1, 7) AS month,
      COALESCE(SUM(i.total_cost_cents), 0) AS purchase_cents,
      COALESCE(SUM(i.quantity), 0) AS quantity,
      COUNT(*) AS count
    FROM purchase_orders o
    JOIN purchase_items i ON i.purchase_id = o.id
    WHERE o.voided_at IS NULL
      ${purchaseFilter}
    GROUP BY substr(o.record_date, 1, 7)
  `, months);

  const byMonth = new Map();
  const ensureMonth = month => {
    if (!month) return null;
    if (!byMonth.has(month)) {
      byMonth.set(month, {
        month,
        revenue: 0,
        received: 0,
        cogs: 0,
        fee: 0,
        profit: 0,
        profitRate: 0,
        purchaseCost: 0,
        refunds: 0,
        salesCount: 0,
        quantity: 0,
        count: 0
      });
    }
    return byMonth.get(month);
  };

  for (const row of salesRows) {
    const item = ensureMonth(row.month);
    if (!item) continue;
    item.revenue = centsToMoney(row.revenue_cents);
    item.received = centsToMoney(row.received_cents);
    item.cogs = centsToMoney(row.cogs_cents);
    item.refunds = centsToMoney(row.refunds_cents);
    item.salesCount = Number(row.sales_count) || 0;
  }
  for (const row of purchaseRows) {
    const item = ensureMonth(row.month);
    if (!item) continue;
    item.purchaseCost = centsToMoney(row.purchase_cents);
    item.quantity = Number(row.quantity) || 0;
    item.count = Number(row.count) || 0;
  }

  const monthly = Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month)).map(item => {
    item.fee = Math.round(Math.max(item.revenue - item.received, item.revenue * feeRate, 0) * 100) / 100;
    item.profit = Math.round((item.received - item.cogs) * 100) / 100;
    item.profitRate = item.received > 0 ? (item.profit / item.received) * 100 : 0;
    return item;
  });
  const monthMap = Object.fromEntries(monthly.map(item => [item.month, item]));

  return {
    monthly: options.includeMonthly === false ? [] : monthly,
    current: options.currentMonth ? monthMap[options.currentMonth] || null : null,
    previous: options.previousMonth ? monthMap[options.previousMonth] || null : null
  };
}
