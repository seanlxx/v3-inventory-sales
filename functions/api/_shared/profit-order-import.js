import { all, batch, placeholders } from './d1.js';
import { moneyToCents, newId, nowIso, yearMonthFromDate } from './validators.js';

const IMPORT_SOURCE = 'zn';
const IMPORT_NOTE = 'zn Excel 订单明细补充导入';
const MAX_ORDERS = 2000;
const MAX_ITEMS_PER_ORDER = 25;
const MAX_BATCH_COMMANDS = 80;
const COST_LOOKUP_CHUNK_SIZE = 30;

const DEVICE_MACHINE_MAP = new Map([
  ['TBN5CFA0261G547T5D3', '1号机'],
  ['工厂测试47T5D3', '1号机'],
  ['TBN5CFA0261GJ6BG6EA', '2号机'],
  ['工厂测试6BG6EA', '2号机'],
  ['TBN5CFA0261KGGWA303', '3号机'],
  ['工厂测试GWA303', '3号机'],
  ['1号机', '1号机'],
  ['2号机', '2号机'],
  ['3号机', '3号机']
]);

export class OrderImportValidationError extends Error {}

function text(value) {
  return String(value ?? '').trim();
}

function normalizedName(value) {
  return text(value).toLowerCase();
}

function safeKey(value) {
  return text(value)
    .replace(/[^0-9a-zA-Z\u4e00-\u9fa5:_-]+/g, '_')
    .slice(0, 96) || newId();
}

function cents(value) {
  return Math.max(0, moneyToCents(value));
}

function validDate(value) {
  const date = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function machineFor(order) {
  return DEVICE_MACHINE_MAP.get(text(order.deviceCode))
    || DEVICE_MACHINE_MAP.get(text(order.deviceName))
    || DEVICE_MACHINE_MAP.get(text(order.machineId))
    || '';
}

function emptySummary(dryRun) {
  return {
    dryRun,
    ordersReceived: 0,
    ordersReady: 0,
    ordersImported: 0,
    ordersDuplicate: 0,
    ordersSkipped: 0,
    itemsReady: 0,
    itemsImported: 0,
    productsCreated: 0,
    productsMatched: 0,
    aliasesCreated: 0,
    missingCostItems: 0,
    warnings: 0
  };
}

function addWarning(summary, warnings, message) {
  summary.warnings += 1;
  if (warnings.length < 30) warnings.push(message);
}

function skipOrder(summary, warnings, orderNo, reason) {
  summary.ordersSkipped += 1;
  addWarning(summary, warnings, `订单 ${orderNo || '（缺少订单号）'} ${reason}`);
}

function normalizeOrder(rawOrder, summary, warnings) {
  const orderNo = text(rawOrder?.orderNo);
  if (!orderNo) {
    skipOrder(summary, warnings, '', '缺少订单号，已跳过');
    return null;
  }
  if (text(rawOrder.status) !== '已完成') {
    skipOrder(summary, warnings, orderNo, `状态为“${text(rawOrder.status) || '空'}”，已跳过`);
    return null;
  }

  const refundAmountCents = cents(rawOrder.refundAmount);
  if (refundAmountCents > 0) {
    skipOrder(summary, warnings, orderNo, '存在退款金额，已跳过，请单独核对退款');
    return null;
  }

  const machineId = machineFor(rawOrder);
  if (!machineId) {
    const device = text(rawOrder.deviceName) || text(rawOrder.deviceCode) || '未知设备';
    skipOrder(summary, warnings, orderNo, `无法识别设备“${device}”，已跳过`);
    return null;
  }

  const recordDate = validDate(rawOrder.recordDate);
  if (!recordDate) {
    skipOrder(summary, warnings, orderNo, '缺少有效创建日期，已跳过');
    return null;
  }

  const rawItems = Array.isArray(rawOrder.items) ? rawOrder.items : [];
  if (rawItems.length === 0) {
    skipOrder(summary, warnings, orderNo, '没有商品明细，已跳过');
    return null;
  }
  if (rawItems.length > MAX_ITEMS_PER_ORDER) {
    skipOrder(summary, warnings, orderNo, `商品明细超过 ${MAX_ITEMS_PER_ORDER} 条，已跳过`);
    return null;
  }

  const items = [];
  for (const rawItem of rawItems) {
    const productName = text(rawItem?.productName);
    const quantity = Math.round(Number(rawItem?.quantity));
    const unitPriceCents = cents(rawItem?.unitPrice);
    if (!productName || !Number.isFinite(quantity) || quantity <= 0) {
      skipOrder(summary, warnings, orderNo, '存在无效商品名称或数量，已跳过');
      return null;
    }
    items.push({
      barcode: text(rawItem?.barcode),
      productName,
      normalizedName: normalizedName(productName),
      quantity,
      unitPriceCents,
      lineAmountCents: unitPriceCents * quantity
    });
  }

  const grossAmountCents = items.reduce((sum, item) => sum + item.lineAmountCents, 0);
  const discountCents = cents(rawOrder.discount);
  const salesAmountCents = cents(rawOrder.salesAmount);
  const expectedSalesAmountCents = grossAmountCents - discountCents;
  if (grossAmountCents <= 0) {
    skipOrder(summary, warnings, orderNo, '商品金额合计必须大于 0，已跳过');
    return null;
  }
  if (salesAmountCents > 0 && Math.abs(expectedSalesAmountCents - salesAmountCents) > 1) {
    skipOrder(
      summary,
      warnings,
      orderNo,
      `商品金额减优惠与销售额不一致（${(expectedSalesAmountCents / 100).toFixed(2)} / ${(salesAmountCents / 100).toFixed(2)} 元），已跳过`
    );
    return null;
  }

  const platformFeeCents = cents(rawOrder.platformFee);
  const serviceFeeCents = cents(rawOrder.serviceFee);
  return {
    orderNo,
    machineId,
    recordDate,
    grossAmountCents,
    platformFeeCents,
    serviceFeeCents,
    discountCents,
    netRevenueCents: grossAmountCents - platformFeeCents - serviceFeeCents - discountCents,
    items
  };
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function existingOrderIds(db, orderNos) {
  const existing = new Set();
  for (const orderChunk of chunk(orderNos, 90)) {
    const rows = await all(db, `
      SELECT external_id
      FROM sales_records
      WHERE source = ?
        AND external_id IN (${placeholders(orderChunk.length)})
    `, [IMPORT_SOURCE, ...orderChunk]);
    for (const row of rows) existing.add(String(row.external_id));
  }
  return existing;
}

async function loadProductContext(db) {
  const products = await all(db, `
    SELECT id, canonical_name, normalized_name
    FROM products_global
  `);
  const aliases = await all(db, `
    SELECT product_global_id, normalized_alias, source, source_product_id, source_external_id
    FROM product_aliases
    WHERE status = 'active'
  `);

  const productById = new Map(products.map(product => [product.id, product]));
  const productByName = new Map(products.map(product => [product.normalized_name, product]));
  const productByAlias = new Map();
  const productByZnKey = new Map();

  for (const alias of aliases) {
    const product = productById.get(alias.product_global_id);
    if (!product) continue;
    if (alias.normalized_alias && !productByAlias.has(alias.normalized_alias)) {
      productByAlias.set(alias.normalized_alias, product);
    }
    if (alias.source === IMPORT_SOURCE) {
      for (const key of [alias.source_product_id, alias.source_external_id]) {
        if (key) productByZnKey.set(String(key), product);
      }
    }
  }

  return { productById, productByName, productByAlias, productByZnKey };
}

function productInsertCommand(product, timestamp) {
  return {
    sql: `
      INSERT INTO products_global (
        id, canonical_name, normalized_name, category, default_sell_price_cents,
        status, legacy_product_count, source_product_ids_json, created_at, updated_at
      )
      VALUES (?, ?, ?, '其他', ?, 'active', 0, '[]', ?, ?)
    `,
    params: [
      product.id,
      product.canonical_name,
      product.normalized_name,
      product.default_sell_price_cents,
      timestamp,
      timestamp
    ]
  };
}

function aliasInsertCommand(alias, timestamp) {
  return {
    sql: `
      INSERT INTO product_aliases (
        id, product_global_id, alias_name, normalized_alias, source,
        source_product_id, source_external_id, source_machine_id, status,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `,
    params: [
      alias.id,
      alias.productGlobalId,
      alias.aliasName,
      alias.normalizedAlias,
      IMPORT_SOURCE,
      alias.sourceKey,
      alias.barcode || alias.sourceKey,
      alias.machineId,
      timestamp,
      timestamp
    ]
  };
}

async function resolveProducts(db, orders, summary) {
  const context = await loadProductContext(db);
  const createdProducts = new Map();
  const newAliases = new Map();
  const matchedProductIds = new Set();

  for (const order of orders) {
    for (const item of order.items) {
      const sourceKey = item.barcode || item.normalizedName;
      let product = context.productByZnKey.get(sourceKey)
        || context.productByName.get(item.normalizedName)
        || context.productByAlias.get(item.normalizedName);

      if (!product) {
        product = {
          id: `pg:zn:${newId()}`,
          canonical_name: item.productName,
          normalized_name: item.normalizedName,
          default_sell_price_cents: item.unitPriceCents
        };
        createdProducts.set(product.id, product);
        context.productById.set(product.id, product);
        context.productByName.set(product.normalized_name, product);
      } else if (!createdProducts.has(product.id)) {
        matchedProductIds.add(product.id);
      }

      item.productGlobalId = product.id;
      if (!context.productByZnKey.has(sourceKey) && !newAliases.has(sourceKey)) {
        const alias = {
          id: `pa:zn:${safeKey(sourceKey)}`,
          productGlobalId: product.id,
          aliasName: item.productName,
          normalizedAlias: item.normalizedName,
          sourceKey,
          barcode: item.barcode,
          machineId: order.machineId
        };
        newAliases.set(sourceKey, alias);
        context.productByZnKey.set(sourceKey, product);
      }
    }
  }

  summary.productsCreated = createdProducts.size;
  summary.productsMatched = matchedProductIds.size;
  summary.aliasesCreated = newAliases.size;

  return {
    productCommands: [
      ...Array.from(createdProducts.values(), product => productInsertCommand(product, nowIso())),
      ...Array.from(newAliases.values(), alias => aliasInsertCommand(alias, nowIso()))
    ]
  };
}

async function loadLatestCosts(db, orders) {
  const requests = new Map();
  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.productGlobalId}|${order.recordDate}`;
      requests.set(key, {
        key,
        productGlobalId: item.productGlobalId,
        recordDate: order.recordDate
      });
    }
  }

  const costs = new Map();
  for (const requestChunk of chunk(Array.from(requests.values()), COST_LOOKUP_CHUNK_SIZE)) {
    const valuesSql = requestChunk.map(() => '(?, ?, ?)').join(', ');
    const params = requestChunk.flatMap(request => [request.productGlobalId, request.recordDate, request.key]);
    const rows = await all(db, `
      WITH requested(product_global_id, effective_at, lookup_key) AS (
        VALUES ${valuesSql}
      )
      SELECT
        requested.lookup_key,
        COALESCE((
          SELECT cs.unit_cost_cents
          FROM cost_snapshots cs
          WHERE cs.product_global_id = requested.product_global_id
            AND cs.unit_cost_cents > 0
            AND cs.effective_at <= requested.effective_at
          ORDER BY cs.effective_at DESC, cs.created_at DESC
          LIMIT 1
        ), 0) AS unit_cost_cents
      FROM requested
    `, params);
    for (const row of rows) costs.set(String(row.lookup_key), Number(row.unit_cost_cents) || 0);
  }
  return costs;
}

function saleCommandGroup(order, costs, timestamp, summary, warnings) {
  const recordKey = safeKey(order.orderNo);
  const recordId = `sr:zn:${recordKey}`;
  let totalCogsCents = 0;
  const commands = [];
  const itemCommands = [];

  order.items.forEach((item, index) => {
    const lookupKey = `${item.productGlobalId}|${order.recordDate}`;
    const unitCostCents = costs.get(lookupKey) || 0;
    const lineCogsCents = unitCostCents * item.quantity;
    const itemId = `sri:zn:${recordKey}:${index}`;
    totalCogsCents += lineCogsCents;
    if (unitCostCents <= 0) {
      summary.missingCostItems += 1;
      addWarning(summary, warnings, `订单 ${order.orderNo} 的商品“${item.productName}”未找到历史成本，成本按 0 记录`);
    }
    itemCommands.push(
      {
        sql: `
          INSERT INTO sales_record_items (
            id, sales_record_id, product_global_id, legacy_product_id,
            quantity, unit_price_cents, line_amount_cents, unit_cost_cents,
            line_cogs_cents, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          itemId,
          recordId,
          item.productGlobalId,
          item.barcode || null,
          item.quantity,
          item.unitPriceCents,
          item.lineAmountCents,
          unitCostCents,
          lineCogsCents,
          timestamp
        ]
      },
      {
        sql: `
          INSERT INTO cost_snapshots (
            id, product_global_id, source_type, source_record_id, source_item_id,
            legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents,
            effective_at, created_at
          )
          VALUES (?, ?, 'sale_item', ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          `cs:zn:sale:${recordKey}:${index}`,
          item.productGlobalId,
          recordId,
          itemId,
          item.barcode || null,
          unitCostCents,
          item.quantity,
          lineCogsCents,
          order.recordDate,
          timestamp
        ]
      }
    );
  });

  commands.push({
    sql: `
      INSERT INTO sales_records (
        id, type, machine_id, record_date, year_month, source, external_id,
        gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
        discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
        note, status, created_at, updated_at
      )
      VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `,
    params: [
      recordId,
      order.machineId,
      order.recordDate,
      yearMonthFromDate(order.recordDate),
      IMPORT_SOURCE,
      order.orderNo,
      order.grossAmountCents,
      order.platformFeeCents,
      order.serviceFeeCents,
      order.discountCents,
      order.netRevenueCents,
      totalCogsCents,
      order.netRevenueCents - totalCogsCents,
      IMPORT_NOTE,
      timestamp,
      timestamp
    ]
  });
  commands.push(...itemCommands);
  return commands;
}

async function runFlatCommands(db, commands) {
  for (const commandChunk of chunk(commands, MAX_BATCH_COMMANDS)) {
    await batch(db, commandChunk);
  }
}

async function runCommandGroups(db, groups) {
  let pending = [];
  for (const group of groups) {
    if (group.length > MAX_BATCH_COMMANDS) {
      throw new OrderImportValidationError('单个订单明细过多，无法安全写入');
    }
    if (pending.length > 0 && pending.length + group.length > MAX_BATCH_COMMANDS) {
      await batch(db, pending);
      pending = [];
    }
    pending.push(...group);
  }
  if (pending.length > 0) await batch(db, pending);
}

export async function importProfitOrders(env, payload = {}) {
  const dryRun = payload.dryRun === true;
  const summary = emptySummary(dryRun);
  const warnings = [];
  const rawOrders = Array.isArray(payload.orders) ? payload.orders : [];
  if (rawOrders.length === 0) throw new OrderImportValidationError('没有可处理的订单');
  if (rawOrders.length > MAX_ORDERS) {
    throw new OrderImportValidationError(`单次最多处理 ${MAX_ORDERS} 个订单`);
  }

  const seenOrderNos = new Set();
  const normalizedOrders = [];
  for (const rawOrder of rawOrders) {
    summary.ordersReceived += 1;
    const orderNo = text(rawOrder?.orderNo);
    if (orderNo && seenOrderNos.has(orderNo)) {
      summary.ordersDuplicate += 1;
      continue;
    }
    if (orderNo) seenOrderNos.add(orderNo);
    const order = normalizeOrder(rawOrder || {}, summary, warnings);
    if (order) normalizedOrders.push(order);
  }

  const existing = await existingOrderIds(env.DB, normalizedOrders.map(order => order.orderNo));
  const readyOrders = normalizedOrders.filter(order => {
    if (!existing.has(order.orderNo)) return true;
    summary.ordersDuplicate += 1;
    return false;
  });
  summary.ordersReady = readyOrders.length;
  summary.itemsReady = readyOrders.reduce((sum, order) => sum + order.items.length, 0);

  if (readyOrders.length === 0) return { summary, warnings };

  const { productCommands } = await resolveProducts(env.DB, readyOrders, summary);
  const costs = await loadLatestCosts(env.DB, readyOrders);
  const timestamp = nowIso();
  const saleGroups = readyOrders.map(order => saleCommandGroup(order, costs, timestamp, summary, warnings));

  if (!dryRun) {
    await runFlatCommands(env.DB, productCommands);
    await runCommandGroups(env.DB, saleGroups);
    summary.ordersImported = readyOrders.length;
    summary.itemsImported = summary.itemsReady;
  }

  return { summary, warnings };
}
