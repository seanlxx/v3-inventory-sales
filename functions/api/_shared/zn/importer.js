import { all, first } from '../d1.js';
import { centsToMoney, newId, nowIso, yearMonthFromDate } from '../validators.js';
import { ZN_INTEGRATION, mapZnDeviceToMachine } from './constants.js';
import { normalizeProductName } from '../shengma/mapper.js';

const EMPTY_SUMMARY = {
  ordersImported: 0,
  ordersDuplicate: 0,
  ordersSkipped: 0,
  linesImported: 0,
  productsCreated: 0,
  warnings: 0
};

function newSummary() {
  return { ...EMPTY_SUMMARY };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function normalizeBarcode(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  // '6920152400975-2' → '6920152400975'；纯数字也保留
  const match = text.match(/^(\d{8,14})/);
  return match ? match[1] : '';
}

function toDateOnly(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return '';
}

async function findOrCreateProduct(env, machineId, line, statements, summary, timestamp) {
  const barcode = normalizeBarcode(line.vendorBarcode);
  const normalized = normalizeProductName(line.vendorProductName);

  let product = null;
  if (barcode) {
    product = await first(env.DB, `
      SELECT * FROM products
      WHERE machine_id = ? AND external_id = ? AND status = 'active'
      LIMIT 1
    `, [machineId, barcode]);
  }
  if (!product && normalized) {
    product = await first(env.DB, `
      SELECT * FROM products
      WHERE machine_id = ?
        AND (normalized_name = ? OR name = ?)
        AND status = 'active'
      LIMIT 1
    `, [machineId, normalized, line.vendorProductName]);
  }
  if (product) return product;

  product = {
    id: newId(),
    machine_id: machineId,
    name: line.vendorProductName || (barcode || '未知商品'),
    category: '其他',
    sell_price_cents: Math.max(0, Number(line.unitPriceCents) || 0),
    status: 'active',
    normalized_name: normalized,
    external_id: barcode || normalized,
    created_at: timestamp,
    updated_at: timestamp
  };
  statements.push(env.DB.prepare(`
    INSERT INTO products (
      id, machine_id, name, category, sell_price_cents, status,
      created_at, updated_at, normalized_name, external_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    product.id, product.machine_id, product.name, product.category,
    product.sell_price_cents, product.status,
    product.created_at, product.updated_at,
    product.normalized_name, product.external_id
  ));
  summary.productsCreated += 1;
  return product;
}

async function getBalance(env, productId, machineId) {
  return await first(env.DB, `
    SELECT * FROM inventory_balances
    WHERE product_id = ? AND machine_id = ?
    LIMIT 1
  `, [productId, machineId]) || {
    product_id: productId,
    machine_id: machineId,
    quantity_on_hand: 0,
    avg_cost_cents: 0,
    inventory_value_cents: 0,
    total_purchase_qty: 0,
    total_purchase_cost_cents: 0,
    updated_at: nowIso()
  };
}

function upsertBalanceStmt(env, balance) {
  return env.DB.prepare(`
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
    balance.product_id, balance.machine_id, balance.quantity_on_hand,
    balance.avg_cost_cents, balance.inventory_value_cents,
    balance.total_purchase_qty, balance.total_purchase_cost_cents,
    balance.updated_at
  );
}

function groupLines(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = line.vendorOrderNo;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  return groups;
}

async function importOneOrder(env, machineId, vendorOrderNo, lines, summary, warnings, balanceCache, timestamp) {
  const orderId = `zn:${vendorOrderNo}`.slice(0, 120);

  const existing = await first(env.DB, `
    SELECT id FROM sales_orders
    WHERE (source = ? AND external_id = ?) OR id = ?
    LIMIT 1
  `, [ZN_INTEGRATION, vendorOrderNo, orderId]);
  if (existing) {
    summary.ordersDuplicate += 1;
    return;
  }

  const orderDate = toDateOnly(lines[0]?.date) || toDateOnly(new Date().toISOString());
  const statements = [];
  let totalAmount = 0;
  let totalCogs = 0;
  let itemIndex = 0;

  for (const line of lines) {
    if (!line.vendorProductName) {
      warnings.push(`订单 ${vendorOrderNo} 缺商品名，跳过此行`);
      continue;
    }
    const product = await findOrCreateProduct(env, machineId, line, statements, summary, timestamp);
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const unitPriceCents = Math.max(0, Number(line.unitPriceCents) || 0);
    const lineAmountCents = Math.max(0, Number(line.lineAmountCents) || unitPriceCents * quantity);

    const balanceKey = `${product.id}|${machineId}`;
    if (!balanceCache.has(balanceKey)) {
      balanceCache.set(balanceKey, await getBalance(env, product.id, machineId));
    }
    const balance = balanceCache.get(balanceKey);
    const unitCostCents = line.costCents ?? Number(balance.avg_cost_cents) || 0;
    const lineCogsCents = unitCostCents * quantity;

    const itemId = `${orderId}:${itemIndex}`;
    statements.push(env.DB.prepare(`
      INSERT INTO sales_items (
        id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
        line_amount_cents, line_cogs_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(itemId, orderId, product.id, quantity, unitPriceCents, unitCostCents,
            lineAmountCents, lineCogsCents, timestamp));

    statements.push(env.DB.prepare(`
      INSERT INTO stock_movements (
        id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
        ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
      ) VALUES (?, ?, ?, 'sale', ?, ?, 'sales_order', ?, ?, NULL, ?, ?, ?)
    `).bind(
      `sales_order:${orderId}:${product.id}:${itemIndex}`,
      product.id, machineId, -quantity, unitCostCents,
      orderId, itemId,
      `${ZN_INTEGRATION}:sale:${vendorOrderNo}:${itemIndex}`,
      'zn 平台 Excel 导入', timestamp
    ));

    const nextQty = Number(balance.quantity_on_hand) - quantity;
    const nextValue = Number(balance.inventory_value_cents) - quantity * unitCostCents;
    const nextBalance = {
      ...balance,
      quantity_on_hand: nextQty,
      inventory_value_cents: nextValue,
      avg_cost_cents: nextQty === 0 ? 0 : Math.round(nextValue / nextQty),
      updated_at: timestamp
    };
    if (nextQty === 0) nextBalance.inventory_value_cents = 0;
    statements.push(upsertBalanceStmt(env, nextBalance));
    balanceCache.set(balanceKey, nextBalance);

    totalAmount += lineAmountCents;
    totalCogs += lineCogsCents;
    summary.linesImported += 1;
    itemIndex += 1;
  }

  if (itemIndex === 0) {
    summary.ordersSkipped += 1;
    return;
  }

  statements.unshift(env.DB.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      note, image_asset_id, voided_at, created_at, updated_at, external_id, source
    ) VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
  `).bind(orderId, machineId, orderDate, yearMonthFromDate(orderDate),
          totalAmount, totalCogs, 'zn 平台 Excel 导入',
          timestamp, timestamp, vendorOrderNo, ZN_INTEGRATION));

  statements.push(env.DB.prepare(`
    INSERT INTO external_sales_imports (
      integration, vendor_order_no, local_sales_order_id, imported_at, raw_json
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(ZN_INTEGRATION, vendorOrderNo, orderId, Date.now(), JSON.stringify({ lines })));

  try {
    await env.DB.batch(statements);
    summary.ordersImported += 1;
  } catch (error) {
    summary.ordersSkipped += 1;
    warnings.push(`订单 ${vendorOrderNo} 导入失败：${errorMessage(error)}`);
  }
}

function validatePayload(body) {
  const orders = Array.isArray(body?.orders) ? body.orders : [];
  if (orders.length === 0) throw new Error('订单数据为空');

  const lines = [];
  const skipped = { canceled: 0, refunded: 0, unmappedDevice: 0, missing: 0 };
  const unmappedDevices = new Set();

  for (const row of orders) {
    const status = String(row?.status || '').trim();
    if (status && status !== '已完成') {
      skipped.canceled += 1;
      continue;
    }
    if ((Number(row?.refundAmount) || 0) > 0) {
      skipped.refunded += 1;
      continue;
    }
    const machineId = mapZnDeviceToMachine(row?.deviceCode);
    if (!machineId) {
      skipped.unmappedDevice += 1;
      unmappedDevices.add(String(row?.deviceCode || ''));
      continue;
    }
    if (!row?.vendorOrderNo || !row?.vendorProductName) {
      skipped.missing += 1;
      continue;
    }
    lines.push({
      machineId,
      vendorOrderNo: String(row.vendorOrderNo).trim(),
      vendorProductName: String(row.vendorProductName).trim(),
      vendorBarcode: String(row.vendorBarcode || '').trim(),
      quantity: Math.max(1, Number(row.quantity) || 1),
      unitPriceCents: Math.round((Number(row.unitPrice) || 0) * 100),
      lineAmountCents: Math.round((Number(row.lineAmount ?? row.unitPrice ?? 0) || 0) * 100),
      date: row.date || ''
    });
  }

  return { lines, skipped, unmappedDevices: Array.from(unmappedDevices) };
}

export async function runZnImport(env, body) {
  const { lines, skipped, unmappedDevices } = validatePayload(body);
  const summary = newSummary();
  const warnings = [];
  const balanceCache = new Map();
  const timestamp = nowIso();

  if (skipped.canceled) warnings.push(`已跳过 ${skipped.canceled} 个非"已完成"订单`);
  if (skipped.refunded) warnings.push(`已跳过 ${skipped.refunded} 个含退款订单`);
  if (skipped.unmappedDevice) warnings.push(`未识别设备编号 ${unmappedDevices.join(' / ')}，对应 ${skipped.unmappedDevice} 行已跳过`);
  if (skipped.missing) warnings.push(`已跳过 ${skipped.missing} 行缺失订单号或商品名的数据`);

  // 按机器分组，再按订单号聚合
  const byMachine = new Map();
  for (const line of lines) {
    if (!byMachine.has(line.machineId)) byMachine.set(line.machineId, []);
    byMachine.get(line.machineId).push(line);
  }

  for (const [machineId, machineLines] of byMachine.entries()) {
    const groups = groupLines(machineLines);
    for (const [vendorOrderNo, orderLines] of groups.entries()) {
      try {
        await importOneOrder(env, machineId, vendorOrderNo, orderLines, summary, warnings, balanceCache, timestamp);
      } catch (error) {
        summary.ordersSkipped += 1;
        warnings.push(`订单 ${vendorOrderNo} 导入异常：${errorMessage(error)}`);
      }
    }
  }

  summary.warnings = warnings.length;
  return { summary, warnings };
}
