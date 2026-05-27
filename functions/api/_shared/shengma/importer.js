import { all, first } from '../d1.js';
import { centsToMoney, newId, nowIso, yearMonthFromDate } from '../validators.js';
import {
  SHENGMA_INTEGRATION,
  SHENGMA_LOCAL_MACHINE_NAME
} from './constants.js';
import { normalizeProductName } from './mapper.js';
import {
  applyBalanceDelta,
  getBalance as getInventoryBalance,
  upsertBalanceStatement
} from '../inventory-balance.js';

const EMPTY_SUMMARY = {
  salesImported: 0,
  salesDuplicate: 0,
  salesSkipped: 0,
  productsCreated: 0,
  pricesUpdated: 0,
  costsUpdated: 0,
  inventoryAdjusted: 0,
  warnings: 0
};

function newSummaryPatch() {
  return { ...EMPTY_SUMMARY };
}

function mergeSummary(target, patch) {
  for (const key of Object.keys(EMPTY_SUMMARY)) {
    target[key] += Number(patch[key]) || 0;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function productToApi(row) {
  return {
    id: row.id,
    name: row.name,
    machineId: row.machine_id,
    category: row.category || '其他',
    sellPrice: centsToMoney(row.sell_price_cents),
    status: row.status,
    currentStock: Number(row.quantity_on_hand) || 0,
    avgCost: centsToMoney(row.avg_cost_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findProduct(db, item) {
  return await first(db, `
    SELECT *
    FROM products
    WHERE machine_id = ?
      AND (
        normalized_name = ?
        OR external_id = ?
        OR name = ?
      )
      AND status = 'active'
    LIMIT 1
  `, [SHENGMA_LOCAL_MACHINE_NAME, item.normalizedName, item.normalizedName, item.vendorProductName]);
}

async function getBalance(db, productId) {
  return await getInventoryBalance(db, productId, SHENGMA_LOCAL_MACHINE_NAME);
}

async function getCachedBalance(env, cache, productId) {
  if (!cache.has(productId)) {
    cache.set(productId, await getBalance(env.DB, productId));
  }
  return cache.get(productId);
}

function applyAdjustmentToBalance(balance, qtyDelta, unitCostCents, timestamp) {
  return applyBalanceDelta(balance, {
    qtyDelta,
    valueDeltaCents: qtyDelta * unitCostCents,
    timestamp
  });
}

async function ensureProduct(env, item, statements, summary, timestamp) {
  const existing = await findProduct(env.DB, item);
  if (existing) {
    if (existing.sell_price_cents !== item.sellPriceCents) summary.pricesUpdated += 1;
    statements.push(env.DB.prepare(`
      UPDATE products
      SET name = ?,
          normalized_name = ?,
          external_id = ?,
          sell_price_cents = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      existing.name || item.vendorProductName,
      item.normalizedName,
      item.normalizedName,
      item.sellPriceCents,
      timestamp,
      existing.id
    ));
    return existing;
  }

  const product = {
    id: newId(),
    machine_id: SHENGMA_LOCAL_MACHINE_NAME,
    name: item.vendorProductName,
    category: '其他',
    sell_price_cents: item.sellPriceCents,
    status: 'active',
    normalized_name: item.normalizedName,
    external_id: item.normalizedName,
    created_at: timestamp,
    updated_at: timestamp
  };
  statements.push(env.DB.prepare(`
    INSERT INTO products (
      id, machine_id, name, category, sell_price_cents, status,
      created_at, updated_at, normalized_name, external_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    product.id,
    product.machine_id,
    product.name,
    product.category,
    product.sell_price_cents,
    product.status,
    product.created_at,
    product.updated_at,
    product.normalized_name,
    product.external_id
  ));
  summary.productsCreated += 1;
  return product;
}

function addMappingStatement(db, item, productId, timestamp) {
  return db.prepare(`
    INSERT INTO external_product_mappings (
      integration, vendor_product_name, normalized_name, local_product_id, created_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(integration, vendor_product_name) DO UPDATE SET
      normalized_name = excluded.normalized_name,
      local_product_id = excluded.local_product_id
  `).bind(SHENGMA_INTEGRATION, item.vendorProductName, item.normalizedName, productId, timestamp);
}

function addSnapshotStatements(db, runId, item, timestamp) {
  return item.aisles.map(aisle => db.prepare(`
    INSERT INTO external_inventory_snapshots (
      sync_run_id, vendor_aisle_code, vendor_product_name, qty,
      sell_price_cents, cost_cents, snapshotted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    aisle.vendorAisleCode || null,
    aisle.vendorProductName,
    Math.max(0, Number(aisle.qty) || 0),
    Math.max(0, Number(aisle.sellPriceCents) || 0),
    aisle.costCents ?? null,
    timestamp
  ));
}

async function syncInventoryMetadata(env, runId, inventoryItems, summary, warnings, timestamp, balanceCache) {
  const productByNormalized = new Map();
  for (const item of inventoryItems) {
    const statements = [];
    const patch = newSummaryPatch();

    try {
      const product = await ensureProduct(env, item, statements, patch, timestamp);
      statements.push(addMappingStatement(env.DB, item, product.id, timestamp));
      statements.push(...addSnapshotStatements(env.DB, runId, item, timestamp));

      const balance = await getCachedBalance(env, balanceCache, product.id);
      if (item.costCents !== null && item.costCents !== undefined && balance.avg_cost_cents !== item.costCents) {
        patch.costsUpdated += 1;
      }
      const quantityOnHand = Number(balance.quantity_on_hand) || 0;
      const unitCostCents = item.costCents ?? (Number(balance.avg_cost_cents) || 0);
      const nextBalance = {
        ...balance,
        avg_cost_cents: quantityOnHand === 0 ? 0 : unitCostCents,
        inventory_value_cents: quantityOnHand * unitCostCents,
        updated_at: timestamp
      };
      statements.push(upsertBalanceStatement(env.DB, nextBalance));

      await env.DB.batch(statements);
      balanceCache.set(product.id, nextBalance);
      productByNormalized.set(item.normalizedName, product);
      mergeSummary(summary, patch);
    } catch (error) {
      warnings.push(`库存 ${item.vendorProductName} 同步失败：${errorMessage(error)}`);
    }
  }
  return productByNormalized;
}

async function calibrateInventory(env, runId, inventoryItems, productByNormalized, summary, warnings, timestamp, balanceCache) {
  for (const item of inventoryItems) {
    const product = productByNormalized.get(item.normalizedName);
    if (!product) continue;
    const balance = await getCachedBalance(env, balanceCache, product.id);
    const currentQty = Number(balance.quantity_on_hand) || 0;
    const delta = item.qty - currentQty;
    const unitCostCents = item.costCents ?? (Number(balance.avg_cost_cents) || 0);
    const externalId = `${SHENGMA_INTEGRATION}:adjust:${runId}:${product.id}`;
    const statements = [];
    const patch = newSummaryPatch();

    if (delta !== 0) {
      patch.inventoryAdjusted += 1;
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO stock_movements (
          id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
          ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
        ) VALUES (?, ?, ?, 'adjustment', ?, ?, 'external_sync_run', ?, NULL, NULL, ?, ?, ?)
      `).bind(
        `adjustment:${externalId}`,
        product.id,
        SHENGMA_LOCAL_MACHINE_NAME,
        delta,
        unitCostCents,
        String(runId),
        externalId,
        `盛码同步校准 ${new Date(timestamp).toLocaleString('zh-CN', { hour12: false })}`,
        timestamp
      ));
    }

    const nextBalance = {
      ...balance,
      quantity_on_hand: item.qty,
      avg_cost_cents: item.qty === 0 ? 0 : unitCostCents,
      inventory_value_cents: item.qty * unitCostCents,
      updated_at: timestamp
    };
    statements.push(upsertBalanceStatement(env.DB, nextBalance));

    try {
      await env.DB.batch(statements);
      balanceCache.set(product.id, nextBalance);
      mergeSummary(summary, patch);
    } catch (error) {
      warnings.push(`库存 ${item.vendorProductName} 校准失败：${errorMessage(error)}`);
    }
  }
}

function saleDate(sale, fallbackStartDate) {
  const text = String(sale.date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallbackStartDate;
}

async function importSale(env, sale, product, date, summary, warnings, timestamp, balanceCache) {
  const orderId = `shengma:${sale.vendorOrderNo}`.slice(0, 120);
  const existing = await first(env.DB, `
    SELECT id
    FROM sales_orders
    WHERE (source = ? AND external_id = ?)
       OR id = ?
    LIMIT 1
  `, [SHENGMA_INTEGRATION, sale.vendorOrderNo, orderId]);
  if (existing) {
    summary.salesDuplicate += 1;
    return;
  }
  if (!sale.paidShipped) {
    summary.salesSkipped += 1;
    warnings.push(`销售单 ${sale.vendorOrderNo} 不是“已支付+已出货+未退款”，已跳过`);
    return;
  }
  if (!product) {
    summary.salesSkipped += 1;
    warnings.push(`销售单 ${sale.vendorOrderNo} 商品未匹配：${sale.vendorProductName}`);
    return;
  }

  const balance = await getCachedBalance(env, balanceCache, product.id);
  const quantity = Math.max(1, Number(sale.quantity) || 1);
  const itemId = `${orderId}:0`;
  const unitPriceCents = Math.round(sale.amountCents / quantity);
  if (unitPriceCents < 0 || sale.amountCents < 0) {
    summary.salesSkipped += 1;
    warnings.push(`销售单 ${sale.vendorOrderNo} 金额无效，已跳过`);
    return;
  }

  const unitCostCents = sale.costCents ?? (Number(balance.avg_cost_cents) || 0);
  const lineCogsCents = unitCostCents * quantity;
  const orderDate = saleDate(sale, date);
  const statements = [];

  statements.push(env.DB.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      refund_amount_cents, received_amount_cents, note, image_asset_id, voided_at, created_at, updated_at, external_id, source
    ) VALUES (?, 'sale', ?, ?, ?, ?, ?, 0, ?, ?, NULL, NULL, ?, ?, ?, ?)
  `).bind(
    orderId,
    SHENGMA_LOCAL_MACHINE_NAME,
    orderDate,
    yearMonthFromDate(orderDate),
    sale.amountCents,
    lineCogsCents,
    sale.amountCents,
    '盛码同步导入',
    timestamp,
    timestamp,
    sale.vendorOrderNo,
    SHENGMA_INTEGRATION
  ));
  statements.push(env.DB.prepare(`
    INSERT INTO sales_items (
      id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
      line_amount_cents, line_cogs_cents, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(itemId, orderId, product.id, quantity, unitPriceCents, unitCostCents, sale.amountCents, lineCogsCents, timestamp));
  statements.push(env.DB.prepare(`
    INSERT INTO external_sales_imports (
      integration, vendor_order_no, local_sales_order_id, imported_at, raw_json
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(SHENGMA_INTEGRATION, sale.vendorOrderNo, orderId, Date.now(), JSON.stringify(sale)));
  statements.push(env.DB.prepare(`
    INSERT INTO stock_movements (
      id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
      ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
    ) VALUES (?, ?, ?, 'sale', ?, ?, 'sales_order', ?, ?, NULL, ?, ?, ?)
  `).bind(
    `sales_order:${orderId}:${product.id}:0`,
    product.id,
    SHENGMA_LOCAL_MACHINE_NAME,
    -quantity,
    unitCostCents,
    orderId,
    itemId,
    `${SHENGMA_INTEGRATION}:sale:${sale.vendorOrderNo}`,
    '盛码销售同步',
    timestamp
  ));
  const nextBalance = applyAdjustmentToBalance(balance, -quantity, unitCostCents, timestamp);
  statements.push(upsertBalanceStatement(env.DB, nextBalance));

  try {
    await env.DB.batch(statements);
    balanceCache.set(product.id, nextBalance);
    summary.salesImported += 1;
  } catch (error) {
    summary.salesSkipped += 1;
    warnings.push(`销售单 ${sale.vendorOrderNo} 导入失败：${errorMessage(error)}`);
  }
}

export function summarizeDryRun(inventoryItems, sales, warnings) {
  const summary = { ...EMPTY_SUMMARY };
  summary.productsCreated = inventoryItems.length;
  summary.pricesUpdated = inventoryItems.length;
  summary.costsUpdated = inventoryItems.filter(item => item.costCents !== null && item.costCents !== undefined).length;
  summary.inventoryAdjusted = inventoryItems.length;
  summary.salesImported = sales.filter(sale => sale.paidShipped).length;
  summary.salesSkipped = sales.length - summary.salesImported;
  summary.warnings = warnings.length;
  return summary;
}

export async function importShengmaData(env, runId, payload) {
  const summary = { ...EMPTY_SUMMARY };
  const warnings = [...payload.warnings];
  const balanceCache = new Map();
  const timestamp = nowIso();

  const productByNormalized = payload.scope.includes('inventory')
    ? await syncInventoryMetadata(env, runId, payload.inventoryItems, summary, warnings, timestamp, balanceCache)
    : new Map();

  if (!payload.scope.includes('inventory') && payload.scope.includes('sales')) {
    const products = await all(env.DB, `
      SELECT *
      FROM products
      WHERE machine_id = ? AND status = 'active'
    `, [SHENGMA_LOCAL_MACHINE_NAME]);
    for (const product of products) {
      productByNormalized.set(product.normalized_name || normalizeProductName(product.name), product);
    }
  }

  if (payload.scope.includes('sales')) {
    for (const sale of payload.sales) {
      const product = productByNormalized.get(normalizeProductName(sale.vendorProductName));
      await importSale(env, sale, product, payload.startDate, summary, warnings, timestamp, balanceCache);
    }
  }

  if (payload.scope.includes('inventory')) {
    await calibrateInventory(env, runId, payload.inventoryItems, productByNormalized, summary, warnings, timestamp, balanceCache);
  }

  summary.warnings = warnings.length;
  return { summary, warnings };
}

export async function listShengmaProducts(env) {
  const rows = await all(env.DB, `
    SELECT
      p.*,
      COALESCE(b.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(b.avg_cost_cents, 0) AS avg_cost_cents
    FROM products p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.machine_id = p.machine_id
    WHERE p.machine_id = ?
      AND p.status = 'active'
    ORDER BY p.name
  `, [SHENGMA_LOCAL_MACHINE_NAME]);
  return rows.map(productToApi);
}
