import { all, first, run } from '../d1.js';
import { newId, nowIso, yearMonthFromDate } from '../validators.js';
import {
  SHENGMA_INTEGRATION,
  SHENGMA_LOCAL_MACHINE_NAME
} from './constants.js';
import { normalizeProductName } from './mapper.js';

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

function safeKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^0-9a-zA-Z\u4e00-\u9fa5:_-]+/g, '_')
    .slice(0, 96) || newId();
}

function saleDate(sale, fallbackStartDate) {
  const text = String(sale.date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallbackStartDate;
}

async function findProductByNormalized(db, normalizedName) {
  return await first(db, `
    SELECT pg.*
    FROM products_global pg
    WHERE pg.normalized_name = ?
    LIMIT 1
  `, [normalizedName]) || await first(db, `
    SELECT pg.*
    FROM product_aliases pa
    JOIN products_global pg ON pg.id = pa.product_global_id
    WHERE pa.status = 'active'
      AND (
        pa.normalized_alias = ?
        OR (pa.source = ? AND pa.source_product_id = ?)
      )
    LIMIT 1
  `, [normalizedName, SHENGMA_INTEGRATION, normalizedName]);
}

async function upsertAlias(env, productId, productName, normalizedName, timestamp) {
  const existing = await first(env.DB, `
    SELECT id
    FROM product_aliases
    WHERE source = ? AND source_product_id = ?
    LIMIT 1
  `, [SHENGMA_INTEGRATION, normalizedName]);
  const aliasId = existing?.id || `pa:shengma:${safeKey(normalizedName)}`;

  if (existing) {
    await run(env.DB, `
      UPDATE product_aliases
      SET product_global_id = ?,
          alias_name = ?,
          normalized_alias = ?,
          source_external_id = ?,
          source_machine_id = ?,
          status = 'active',
          updated_at = ?
      WHERE id = ?
    `, [
      productId,
      productName,
      normalizedName,
      normalizedName,
      SHENGMA_LOCAL_MACHINE_NAME,
      timestamp,
      aliasId
    ]);
    return;
  }

  await run(env.DB, `
    INSERT INTO product_aliases (
      id, product_global_id, alias_name, normalized_alias, source,
      source_product_id, source_external_id, source_machine_id, status,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `, [
    aliasId,
    productId,
    productName,
    normalizedName,
    SHENGMA_INTEGRATION,
    normalizedName,
    normalizedName,
    SHENGMA_LOCAL_MACHINE_NAME,
    timestamp,
    timestamp
  ]);
}

async function latestCostCents(env, productId, date) {
  const row = await first(env.DB, `
    SELECT unit_cost_cents
    FROM cost_snapshots
    WHERE product_global_id = ?
      AND effective_at <= ?
    ORDER BY effective_at DESC, created_at DESC
    LIMIT 1
  `, [productId, date]);
  return Number(row?.unit_cost_cents) || 0;
}

async function upsertManualCost(env, runId, productId, normalizedName, costCents, quantity, effectiveAt, timestamp, summary) {
  if (costCents === null || costCents === undefined) return;
  const previousCost = await latestCostCents(env, productId, effectiveAt);
  if (previousCost !== Number(costCents)) summary.costsUpdated += 1;

  const snapshotId = `cs:shengma:manual:${safeKey(normalizedName)}`;
  await run(env.DB, `
    INSERT INTO cost_snapshots (
      id, product_global_id, source_type, source_record_id, source_item_id,
      legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents,
      effective_at, created_at
    )
    VALUES (?, ?, 'manual_cost', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      product_global_id = excluded.product_global_id,
      source_record_id = excluded.source_record_id,
      legacy_product_id = excluded.legacy_product_id,
      unit_cost_cents = excluded.unit_cost_cents,
      quantity_context = excluded.quantity_context,
      total_cost_cents = excluded.total_cost_cents,
      effective_at = excluded.effective_at,
      created_at = excluded.created_at
  `, [
    snapshotId,
    productId,
    String(runId),
    `shengma:cost:${safeKey(normalizedName)}`,
    normalizedName,
    Number(costCents) || 0,
    Number(quantity) || null,
    (Number(costCents) || 0) * Math.max(0, Number(quantity) || 0),
    effectiveAt,
    timestamp
  ]);
}

async function ensureProfitProduct(env, item, summary, timestamp, runId = null, effectiveAt = timestamp.slice(0, 10)) {
  const productName = String(item.vendorProductName || '').trim();
  const normalizedName = item.normalizedName || normalizeProductName(productName);
  if (!productName || !normalizedName) return null;

  const existing = await findProductByNormalized(env.DB, normalizedName);
  const sellPriceCents = Math.max(0, Number(item.sellPriceCents) || 0);
  let productId = existing?.id;

  if (existing) {
    if ((Number(existing.default_sell_price_cents) || 0) !== sellPriceCents) summary.pricesUpdated += 1;
    await run(env.DB, `
      UPDATE products_global
      SET default_sell_price_cents = ?,
          category = COALESCE(category, '其他'),
          status = 'active',
          updated_at = ?
      WHERE id = ?
    `, [sellPriceCents, timestamp, productId]);
  } else {
    productId = `pg:shengma:${safeKey(normalizedName)}`;
    await run(env.DB, `
      INSERT INTO products_global (
        id, canonical_name, normalized_name, category, default_sell_price_cents,
        status, legacy_product_count, source_product_ids_json, created_at, updated_at
      )
      VALUES (?, ?, ?, '其他', ?, 'active', 0, '[]', ?, ?)
    `, [productId, productName, normalizedName, sellPriceCents, timestamp, timestamp]);
    summary.productsCreated += 1;
  }

  await upsertAlias(env, productId, productName, normalizedName, timestamp);
  await upsertManualCost(env, runId, productId, normalizedName, item.costCents, item.qty, effectiveAt, timestamp, summary);

  return {
    id: productId,
    canonical_name: existing?.canonical_name || productName,
    normalized_name: normalizedName
  };
}

async function insertInventorySnapshots(env, runId, inventoryItems, timestamp) {
  for (const item of inventoryItems) {
    for (const aisle of item.aisles || []) {
      await run(env.DB, `
        INSERT INTO external_inventory_snapshots (
          sync_run_id, vendor_aisle_code, vendor_product_name, qty,
          sell_price_cents, cost_cents, snapshotted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        runId,
        aisle.vendorAisleCode || null,
        aisle.vendorProductName,
        Math.max(0, Number(aisle.qty) || 0),
        Math.max(0, Number(aisle.sellPriceCents) || 0),
        aisle.costCents ?? null,
        Date.parse(timestamp) || Date.now()
      ]);
    }
  }
}

async function loadKnownProducts(env) {
  const rows = await all(env.DB, `
    SELECT
      pg.*,
      pa.normalized_alias
    FROM products_global pg
    LEFT JOIN product_aliases pa
      ON pa.product_global_id = pg.id
     AND pa.status = 'active'
  `);
  const productMap = new Map();
  for (const row of rows) {
    productMap.set(row.normalized_name, row);
    if (row.normalized_alias) productMap.set(row.normalized_alias, row);
  }
  return productMap;
}

async function productForSale(env, sale, productMap, summary, timestamp, runId, effectiveAt) {
  const normalizedName = normalizeProductName(sale.vendorProductName);
  if (productMap.has(normalizedName)) return productMap.get(normalizedName);

  const quantity = Math.max(1, Number(sale.quantity) || 1);
  const product = await ensureProfitProduct(env, {
    vendorProductName: sale.vendorProductName,
    normalizedName,
    sellPriceCents: Math.round((Number(sale.amountCents) || 0) / quantity),
    costCents: sale.costCents,
    qty: 0
  }, summary, timestamp, runId, effectiveAt);
  if (product) productMap.set(normalizedName, product);
  return product;
}

async function importSale(env, sale, product, fallbackDate, summary, warnings, timestamp) {
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

  const existing = await first(env.DB, `
    SELECT id
    FROM sales_records
    WHERE source = ? AND external_id = ?
    LIMIT 1
  `, [SHENGMA_INTEGRATION, sale.vendorOrderNo]);
  if (existing) {
    summary.salesDuplicate += 1;
    return;
  }

  const quantity = Math.max(1, Number(sale.quantity) || 1);
  const recordDate = saleDate(sale, fallbackDate);
  const amountCents = Number(sale.amountCents) || 0;
  const unitPriceCents = Math.round(amountCents / quantity);
  const unitCostCents = sale.costCents ?? await latestCostCents(env, product.id, recordDate);
  const lineCogsCents = (Number(unitCostCents) || 0) * quantity;
  const key = safeKey(sale.vendorOrderNo);
  const recordId = `sr:shengma:${key}`;
  const itemId = `sri:shengma:${key}:0`;
  const snapshotId = `cs:shengma:sale:${key}:0`;

  await run(env.DB, `
    INSERT INTO sales_records (
      id, type, machine_id, record_date, year_month, source, external_id,
      gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
      discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
      note, status, created_at, updated_at
    )
    VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, 'active', ?, ?)
  `, [
    recordId,
    SHENGMA_LOCAL_MACHINE_NAME,
    recordDate,
    yearMonthFromDate(recordDate),
    SHENGMA_INTEGRATION,
    sale.vendorOrderNo,
    amountCents,
    amountCents,
    lineCogsCents,
    amountCents - lineCogsCents,
    '盛码手动同步导入',
    timestamp,
    timestamp
  ]);
  await run(env.DB, `
    INSERT INTO sales_record_items (
      id, sales_record_id, product_global_id, legacy_sales_item_id, legacy_product_id,
      quantity, unit_price_cents, line_amount_cents, unit_cost_cents, line_cogs_cents,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    itemId,
    recordId,
    product.id,
    sale.vendorOrderNo,
    product.normalized_name || normalizeProductName(sale.vendorProductName),
    quantity,
    unitPriceCents,
    amountCents,
    Number(unitCostCents) || 0,
    lineCogsCents,
    timestamp
  ]);
  await run(env.DB, `
    INSERT INTO cost_snapshots (
      id, product_global_id, source_type, source_record_id, source_item_id,
      legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents,
      effective_at, created_at
    )
    VALUES (?, ?, 'sale_item', ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    snapshotId,
    product.id,
    recordId,
    itemId,
    product.normalized_name || normalizeProductName(sale.vendorProductName),
    Number(unitCostCents) || 0,
    quantity,
    lineCogsCents,
    recordDate,
    timestamp
  ]);

  summary.salesImported += 1;
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
  const timestamp = nowIso();
  const productMap = await loadKnownProducts(env);

  if (payload.scope.includes('inventory')) {
    for (const item of payload.inventoryItems) {
      const product = await ensureProfitProduct(env, item, summary, timestamp, runId, payload.endDate);
      if (product) productMap.set(item.normalizedName, product);
    }
    await insertInventorySnapshots(env, runId, payload.inventoryItems, timestamp);
    summary.inventoryAdjusted = payload.inventoryItems.length;
  }

  if (payload.scope.includes('sales')) {
    for (const sale of payload.sales) {
      const product = await productForSale(env, sale, productMap, summary, timestamp, runId, saleDate(sale, payload.startDate));
      await importSale(env, sale, product, payload.startDate, summary, warnings, timestamp);
    }
  }

  summary.warnings = warnings.length;
  return { summary, warnings };
}
