import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const options = parseArgs(process.argv.slice(2));
const migrationDir = resolve(projectRoot, options.dir);
const generatedAt = new Date().toISOString();

mkdirSync(migrationDir, { recursive: true });

const v2Products = readJson('v2-products.json');
const v2Purchases = readJson('v2-purchases.json');
const v2Sales = readJson('v2-sales.json');
const v2Images = readJson('v2-images-manifest.json');

const warnings = [];
const products = [];
const imageAssets = [];
const purchaseOrders = [];
const purchaseItems = [];
const salesOrders = [];
const salesItems = [];
const movementEvents = [];

const productById = new Map();
const v2CurrentStockByProductMachine = new Map();
const imageAssetBySource = new Map();
const imageAssetByR2Key = new Map();
const seenPurchaseIds = new Set();
const seenSalesIds = new Set();

buildImageAssets();
buildProducts();
buildPurchases();
buildSales();

movementEvents.sort(compareMovementEvents);
const stockMovements = movementEvents.map(event => event.movement);
const inventoryBalances = buildInventoryBalances(movementEvents);

writeJson('v3-products.json', products);
writeJson('v3-purchase-orders.json', purchaseOrders);
writeJson('v3-purchase-items.json', purchaseItems);
writeJson('v3-sales-orders.json', salesOrders);
writeJson('v3-sales-items.json', salesItems);
writeJson('v3-stock-movements.json', stockMovements);
writeJson('v3-inventory-balances.json', inventoryBalances);
writeJson('v3-image-assets.json', imageAssets);
writeJson('v3-reconciliation-input.json', buildReconciliationInput());

console.log(`Transformed v2 JSON into v3 migration files in ${relativeMigrationDir()}.`);
console.log(`products: ${products.length}`);
console.log(`purchase_orders: ${purchaseOrders.length}`);
console.log(`purchase_items: ${purchaseItems.length}`);
console.log(`sales_orders: ${salesOrders.length}`);
console.log(`sales_items: ${salesItems.length}`);
console.log(`stock_movements: ${stockMovements.length}`);
console.log(`inventory_balances: ${inventoryBalances.length}`);
console.log(`image_assets: ${imageAssets.length}`);
console.log(`warnings: ${warnings.length}`);

function buildImageAssets() {
  for (const row of v2Images) {
    const sourceStore = stringOrNull(row.store);
    const sourceRecordId = stringOrNull(row.record_id);
    const sourceKey = sourceStore && sourceRecordId ? `${sourceStore}:${sourceRecordId}` : null;
    const r2Key = stringOrNull(row.r2_key);

    if (!sourceKey) {
      warn('image_missing_source', row.record_id, 'Skipped image row without store or record_id.');
      continue;
    }

    if (!r2Key) {
      warn('image_missing_r2_key', sourceKey, 'Skipped image asset because v2 row has no R2 key.');
      continue;
    }

    const existingAssetId = imageAssetByR2Key.get(r2Key);
    if (existingAssetId) {
      imageAssetBySource.set(sourceKey, existingAssetId);
      warn('duplicate_image_r2_key', sourceKey, 'Reused existing image asset for duplicate R2 key.');
      continue;
    }

    const asset = {
      id: sourceKey,
      r2_key: r2Key,
      mime_type: stringOrNull(row.mime_type) || 'image/jpeg',
      size_bytes: null,
      source_store: sourceStore,
      source_record_id: sourceRecordId,
      created_at: timestampFrom(row)
    };

    imageAssets.push(asset);
    imageAssetByR2Key.set(r2Key, asset.id);
    imageAssetBySource.set(sourceKey, asset.id);
  }
}

function buildProducts() {
  for (const row of v2Products) {
    const data = parseData(row);
    const id = stringOrNull(row.record_id) || stringOrNull(data.id);
    const machineId = stringOrNull(row.machine_id) || stringOrNull(data.machineId) || stringOrNull(data.machine_id);
    const name = stringOrNull(row.name) || stringOrNull(data.name);

    if (!id || !machineId || !name) {
      warn('product_missing_required_field', id || row.record_id, 'Skipped product without id, machine_id, or name.');
      continue;
    }

    const product = {
      id,
      machine_id: machineId,
      name,
      category: stringOrNull(row.category) || stringOrNull(data.category),
      sell_price_cents: moneyToCents(firstDefined(data.sellPrice, data.price)),
      status: 'active',
      created_at: timestampFrom(row, data),
      updated_at: timestampFrom({ created_at: row.updated_at }, { createdAt: data.updatedAt })
    };

    products.push(product);
    productById.set(id, product);
    v2CurrentStockByProductMachine.set(balanceKey(id, machineId), integerQuantity(data.currentStock));
  }
}

function buildPurchases() {
  for (const row of v2Purchases) {
    const data = parseData(row);
    const orderId = stringOrNull(row.record_id) || stringOrNull(data.id);
    const productId = stringOrNull(row.product_id) || stringOrNull(data.productId);
    const product = productById.get(productId);
    const machineId = stringOrNull(row.machine_id) || stringOrNull(data.machineId) || product?.machine_id;
    const recordDate = recordDateFrom(row, data);
    const quantity = integerQuantity(data.quantity);

    if (!orderId || !productId || !product || !machineId || !recordDate || quantity <= 0) {
      warn('purchase_missing_required_field', orderId || row.record_id, 'Skipped purchase without valid order, product, machine, date, or quantity.');
      continue;
    }
    if (seenPurchaseIds.has(orderId)) {
      warn('duplicate_purchase_id', orderId, 'Skipped duplicate purchase id.');
      continue;
    }
    seenPurchaseIds.add(orderId);

    const createdAt = timestampFrom(row, data);
    const unitCostCents = moneyToCents(data.unitPrice);
    const totalCostCents = hasValue(data.totalPrice) ? moneyToCents(data.totalPrice) : quantity * unitCostCents;
    const itemId = `${orderId}:0`;

    purchaseOrders.push({
      id: orderId,
      machine_id: machineId,
      record_date: recordDate,
      source: stringOrNull(data.source),
      note: stringOrNull(data.note),
      image_asset_id: imageAssetBySource.get(`purchases:${orderId}`) || null,
      voided_at: null,
      created_at: createdAt,
      updated_at: timestampFrom({ created_at: row.updated_at }, { createdAt: data.updatedAt }) || createdAt
    });

    purchaseItems.push({
      id: itemId,
      purchase_id: orderId,
      product_id: productId,
      quantity,
      unit_cost_cents: unitCostCents,
      total_cost_cents: totalCostCents,
      created_at: createdAt
    });

    movementEvents.push({
      record_date: recordDate,
      created_at: createdAt,
      priority: 0,
      value_delta_cents: totalCostCents,
      purchase_quantity: quantity,
      purchase_cost_cents: totalCostCents,
      movement: {
        id: `purchase_order:${orderId}:${productId}:0`,
        product_id: productId,
        machine_id: machineId,
        movement_type: 'purchase',
        qty_delta: quantity,
        unit_cost_cents: unitCostCents,
        ref_type: 'purchase_order',
        ref_id: orderId,
        ref_item_id: itemId,
        voids_movement_id: null,
        created_at: createdAt
      }
    });
  }
}

function buildSales() {
  for (const row of v2Sales) {
    const data = parseData(row);
    const orderId = stringOrNull(row.record_id) || stringOrNull(data.id);
    const recordDate = recordDateFrom(row, data);
    const yearMonth = stringOrNull(row.year_month) || stringOrNull(data.yearMonth) || recordDate?.slice(0, 7);
    const type = normalizeSalesType(data.type, orderId);
    const items = Array.isArray(data.items) ? data.items : [];
    const fallbackMachine = firstProductMachine(items);
    const machineId = stringOrNull(row.machine_id) || stringOrNull(data.machineId) || fallbackMachine;

    if (!orderId || !machineId || !recordDate || !yearMonth) {
      warn('sales_order_missing_required_field', orderId || row.record_id, 'Skipped sales order without id, machine, date, or year_month.');
      continue;
    }
    if (seenSalesIds.has(orderId)) {
      warn('duplicate_sales_id', orderId, 'Skipped duplicate sales id.');
      continue;
    }
    seenSalesIds.add(orderId);

    const createdAt = timestampFrom(row, data);
    const orderSalesItems = [];
    let itemAmountTotal = 0;
    let itemCogsTotal = 0;

    items.forEach((item, index) => {
      const productId = stringOrNull(item.productId);
      const product = productById.get(productId);
      const quantity = Math.abs(integerQuantity(item.quantity));

      if (!productId || !product || quantity <= 0) {
        warn('sales_item_missing_required_field', `${orderId}:${index}`, 'Skipped sales item without valid product or quantity.');
        return;
      }

      const itemId = `${orderId}:${index}`;
      const unitPriceCents = moneyToCents(item.sellPrice);
      const unitCostCents = moneyToCents(item.avgCost);
      const lineAmountCents = type === 'loss'
        ? 0
        : positiveMoneyCents(firstDefined(item.itemRevenue, unitPriceCents * quantity / 100));
      const lineCogsCents = positiveMoneyCents(firstDefined(item.itemCogs, unitCostCents * quantity / 100));
      const qtyDelta = type === 'refund' ? quantity : -quantity;

      itemAmountTotal += lineAmountCents;
      itemCogsTotal += lineCogsCents;

      orderSalesItems.push({
        id: itemId,
        sales_order_id: orderId,
        product_id: productId,
        quantity,
        unit_price_cents: unitPriceCents,
        unit_cost_cents: unitCostCents,
        line_amount_cents: lineAmountCents,
        line_cogs_cents: lineCogsCents,
        created_at: createdAt
      });

      movementEvents.push({
        record_date: recordDate,
        created_at: createdAt,
        priority: 1,
        value_delta_cents: type === 'refund' ? lineCogsCents : -lineCogsCents,
        purchase_quantity: 0,
        purchase_cost_cents: 0,
        movement: {
          id: `sales_order:${orderId}:${productId}:${index}`,
          product_id: productId,
          machine_id: machineId,
          movement_type: type,
          qty_delta: qtyDelta,
          unit_cost_cents: unitCostCents,
          ref_type: 'sales_order',
          ref_id: orderId,
          ref_item_id: itemId,
          voids_movement_id: null,
          created_at: createdAt
        }
      });
    });

    const totalAmountCents = type === 'loss'
      ? 0
      : (hasValue(data.totalAmount) ? positiveMoneyCents(data.totalAmount) : itemAmountTotal);
    const totalCogsCents = hasValue(data.totalCogs) ? positiveMoneyCents(data.totalCogs) : itemCogsTotal;

    salesOrders.push({
      id: orderId,
      type,
      machine_id: machineId,
      record_date: recordDate,
      year_month: yearMonth,
      total_amount_cents: totalAmountCents,
      total_cogs_cents: totalCogsCents,
      note: stringOrNull(data.note),
      image_asset_id: imageAssetBySource.get(`sales:${orderId}`) || null,
      voided_at: null,
      created_at: createdAt,
      updated_at: timestampFrom({ created_at: row.updated_at }, { createdAt: data.updatedAt }) || createdAt
    });
    salesItems.push(...orderSalesItems);
  }
}

function buildInventoryBalances(events) {
  const balances = new Map();

  for (const event of events) {
    const movement = event.movement;
    const key = balanceKey(movement.product_id, movement.machine_id);
    const current = balances.get(key) || {
      product_id: movement.product_id,
      machine_id: movement.machine_id,
      quantity_on_hand: 0,
      avg_cost_cents: 0,
      inventory_value_cents: 0,
      total_purchase_qty: 0,
      total_purchase_cost_cents: 0,
      updated_at: movement.created_at
    };

    current.quantity_on_hand += movement.qty_delta;
    current.inventory_value_cents += event.value_delta_cents;
    current.total_purchase_qty += event.purchase_quantity;
    current.total_purchase_cost_cents += event.purchase_cost_cents;
    current.updated_at = movement.created_at;

    if (current.quantity_on_hand === 0) {
      current.avg_cost_cents = 0;
      current.inventory_value_cents = 0;
    } else {
      current.avg_cost_cents = Math.round(current.inventory_value_cents / current.quantity_on_hand);
    }

    balances.set(key, current);
  }

  return Array.from(balances.values()).sort((a, b) =>
    a.machine_id.localeCompare(b.machine_id) || a.product_id.localeCompare(b.product_id)
  );
}

function buildReconciliationInput() {
  const v2 = summarizeV2();
  const v3 = summarizeV3();
  return {
    generated_at: generatedAt,
    warning_count: warnings.length,
    warnings: warnings.slice(0, 200),
    v2,
    v3
  };
}

function summarizeV2() {
  const purchaseTotals = { quantity: 0, total_cost_cents: 0 };
  for (const row of v2Purchases) {
    const data = parseData(row);
    const quantity = integerQuantity(data.quantity);
    if (quantity <= 0) continue;
    const unitCostCents = moneyToCents(data.unitPrice);
    purchaseTotals.quantity += quantity;
    purchaseTotals.total_cost_cents += hasValue(data.totalPrice) ? moneyToCents(data.totalPrice) : quantity * unitCostCents;
  }

  const salesByType = emptySalesTotals();
  for (const row of v2Sales) {
    const data = parseData(row);
    const type = normalizeSalesType(data.type, row.record_id, false);
    const items = Array.isArray(data.items) ? data.items : [];
    const fallbackAmount = items.reduce((sum, item) => {
      if (type === 'loss') return sum;
      const quantity = Math.abs(integerQuantity(item.quantity));
      const unitPriceCents = moneyToCents(item.sellPrice);
      return sum + positiveMoneyCents(firstDefined(item.itemRevenue, unitPriceCents * quantity / 100));
    }, 0);
    const fallbackCogs = items.reduce((sum, item) => {
      const quantity = Math.abs(integerQuantity(item.quantity));
      const unitCostCents = moneyToCents(item.avgCost);
      return sum + positiveMoneyCents(firstDefined(item.itemCogs, unitCostCents * quantity / 100));
    }, 0);

    salesByType[type].count += 1;
    salesByType[type].total_amount_cents += type === 'loss'
      ? 0
      : (hasValue(data.totalAmount) ? positiveMoneyCents(data.totalAmount) : fallbackAmount);
    salesByType[type].total_cogs_cents += hasValue(data.totalCogs) ? positiveMoneyCents(data.totalCogs) : fallbackCogs;
  }

  return {
    products: v2Products.length,
    purchases: v2Purchases.length,
    sales: v2Sales.length,
    images: v2Images.length,
    images_with_r2_key: v2Images.filter(row => stringOrNull(row.r2_key)).length,
    images_without_r2_key: v2Images.filter(row => !stringOrNull(row.r2_key)).length,
    purchase_totals: purchaseTotals,
    sales_by_type: salesByType,
    current_stock_by_product_machine: Object.fromEntries(v2CurrentStockByProductMachine)
  };
}

function summarizeV3() {
  const purchaseTotals = purchaseItems.reduce((totals, item) => {
    totals.quantity += item.quantity;
    totals.total_cost_cents += item.total_cost_cents;
    return totals;
  }, { quantity: 0, total_cost_cents: 0 });

  const salesByType = emptySalesTotals();
  for (const order of salesOrders) {
    salesByType[order.type].count += 1;
    salesByType[order.type].total_amount_cents += order.total_amount_cents;
    salesByType[order.type].total_cogs_cents += order.total_cogs_cents;
  }

  return {
    products: products.length,
    purchase_orders: purchaseOrders.length,
    purchase_items: purchaseItems.length,
    sales_orders: salesOrders.length,
    sales_items: salesItems.length,
    stock_movements: stockMovements.length,
    inventory_balances: inventoryBalances.length,
    image_assets: imageAssets.length,
    purchase_totals: purchaseTotals,
    sales_by_type: salesByType,
    balance_quantity_by_product_machine: Object.fromEntries(
      inventoryBalances.map(balance => [balanceKey(balance.product_id, balance.machine_id), balance.quantity_on_hand])
    )
  };
}

function firstProductMachine(items) {
  for (const item of items) {
    const product = productById.get(stringOrNull(item.productId));
    if (product?.machine_id) return product.machine_id;
  }
  return null;
}

function compareMovementEvents(left, right) {
  return left.record_date.localeCompare(right.record_date)
    || left.created_at.localeCompare(right.created_at)
    || left.priority - right.priority
    || left.movement.id.localeCompare(right.movement.id);
}

function normalizeSalesType(value, recordId, shouldWarn = true) {
  if (value === null || value === undefined || value === '' || value === 'daily') return 'sale';
  if (value === 'sale' || value === 'refund' || value === 'loss') return value;
  if (shouldWarn) {
    warn('unknown_sales_type', recordId, `Mapped unknown sales type "${value}" to sale.`);
  }
  return 'sale';
}

function recordDateFrom(row, data) {
  const value = stringOrNull(row.record_date)
    || stringOrNull(data.date)
    || stringOrNull(data.recordDate)
    || stringOrNull(data.createdAt)
    || stringOrNull(row.created_at);
  return value ? value.slice(0, 10) : null;
}

function timestampFrom(row = {}, data = {}) {
  return stringOrNull(row.created_at)
    || stringOrNull(data.createdAt)
    || stringOrNull(data.created_at)
    || generatedAt;
}

function parseData(row) {
  if (!row?.data) return {};
  if (typeof row.data === 'object') return row.data;
  try {
    return JSON.parse(row.data);
  } catch {
    warn('invalid_json_data', row.record_id, 'Record data is not valid JSON; treated as empty object.');
    return {};
  }
}

function readJson(fileName) {
  return JSON.parse(readFileSync(join(migrationDir, fileName), 'utf8'));
}

function writeJson(fileName, value) {
  writeFileSync(join(migrationDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function moneyToCents(value) {
  if (!hasValue(value)) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function positiveMoneyCents(value) {
  return Math.abs(moneyToCents(value));
}

function integerQuantity(value) {
  if (!hasValue(value)) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const string = String(value).trim();
  return string ? string : null;
}

function firstDefined(...values) {
  return values.find(hasValue);
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function balanceKey(productId, machineId) {
  return `${productId}|${machineId}`;
}

function emptySalesTotals() {
  return {
    sale: { count: 0, total_amount_cents: 0, total_cogs_cents: 0 },
    refund: { count: 0, total_amount_cents: 0, total_cogs_cents: 0 },
    loss: { count: 0, total_amount_cents: 0, total_cogs_cents: 0 }
  };
}

function warn(code, recordId, message) {
  warnings.push({
    code,
    record_id: recordId === null || recordId === undefined ? '' : String(recordId),
    message
  });
}

function relativeMigrationDir() {
  return migrationDir.startsWith(projectRoot) ? migrationDir.slice(projectRoot.length + 1) : migrationDir;
}

function parseArgs(argv) {
  const parsed = { dir: '.migration' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dir') {
      parsed.dir = requireValue(argv, ++index, arg);
    } else if (arg.startsWith('--dir=')) {
      parsed.dir = arg.slice('--dir='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
