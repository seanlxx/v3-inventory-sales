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
  costsMatched: 0,
  costsMissing: 0,
  warnings: 0
};

const COST_MATCH_THRESHOLD = 0.72;

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

function normalizeCostText(raw) {
  return normalizeProductName(raw)
    .replace(/饮料/g, '')
    .replace(/饮品/g, '')
    .replace(/复合茶/g, '茶')
    .replace(/天然矿泉水/g, '矿泉水')
    .replace(/纯净水/g, '水')
    .replace(/瓶装/g, '')
    .replace(/非标品如上架造成损失自行承担/g, '');
}

function uniqueChars(value) {
  return Array.from(new Set(String(value || '').split(''))).filter(Boolean);
}

function coverage(needle, haystack) {
  const chars = uniqueChars(needle);
  if (!chars.length || !haystack) return 0;
  return chars.filter(char => haystack.includes(char)).length / chars.length;
}

function bigrams(value) {
  const text = String(value || '');
  if (!text) return new Set();
  if (text.length === 1) return new Set([text]);
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function jaccard(left, right) {
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }
  return intersection / (leftGrams.size + rightGrams.size - intersection);
}

function nameScore(leftName, rightName) {
  const left = normalizeCostText(leftName);
  const right = normalizeCostText(rightName);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  return Math.max(
    jaccard(left, right),
    coverage(left, right) * 0.72,
    coverage(right, left) * 0.72
  );
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
  if (product) {
    // 回填：商品已存在但 barcode/normalized_name 缺失时，用 Excel 中的值补上
    const patches = [];
    const params = [];
    if (barcode && !product.external_id) {
      patches.push('external_id = ?');
      params.push(barcode);
      product.external_id = barcode;
    }
    if (normalized && !product.normalized_name) {
      patches.push('normalized_name = ?');
      params.push(normalized);
      product.normalized_name = normalized;
    }
    if (patches.length > 0) {
      patches.push('updated_at = ?');
      params.push(timestamp, product.id);
      statements.push(env.DB.prepare(
        `UPDATE products SET ${patches.join(', ')} WHERE id = ?`
      ).bind(...params));
    }
    return product;
  }

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

async function loadPurchaseCostCandidates(env, machineId, cache) {
  if (cache.has(machineId)) return cache.get(machineId);
  const rows = await all(env.DB, `
    SELECT
      p.id,
      p.machine_id,
      p.name,
      p.normalized_name,
      p.external_id,
      SUM(i.quantity) AS quantity,
      SUM(i.total_cost_cents) AS total_cost_cents,
      ROUND(1.0 * SUM(i.total_cost_cents) / NULLIF(SUM(i.quantity), 0), 0) AS avg_cost_cents
    FROM purchase_items i
    JOIN purchase_orders o ON o.id = i.purchase_id
    JOIN products p ON p.id = i.product_id
    WHERE o.voided_at IS NULL
      AND p.machine_id = ?
    GROUP BY p.id, p.machine_id, p.name, p.normalized_name, p.external_id
    HAVING SUM(i.quantity) > 0 AND SUM(i.total_cost_cents) > 0
  `, [machineId]);
  cache.set(machineId, rows);
  return rows;
}

function findPurchaseCostCandidate(candidates, line, product) {
  const barcode = normalizeBarcode(line.vendorBarcode);
  const normalized = normalizeProductName(line.vendorProductName);
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = 0;
    if (barcode && candidate.external_id === barcode) {
      score = 1;
    } else if (normalized && candidate.normalized_name === normalized) {
      score = 1;
    } else if (product?.id && candidate.id === product.id) {
      score = 0.95;
    } else {
      score = nameScore(line.vendorProductName, candidate.name);
    }

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore < COST_MATCH_THRESHOLD) return null;
  const avgCostCents = Math.max(0, Number(best.avg_cost_cents) || 0);
  return avgCostCents > 0 ? { ...best, score: bestScore, avgCostCents } : null;
}

function receivedAmountForOrder(lines, lineAmountTotal, fees) {
  const explicit = Math.max(0, Number(lines.find(line => Number(line.receivedAmountCents) > 0)?.receivedAmountCents) || 0);
  if (explicit > 0) return explicit;
  return Math.max(0, lineAmountTotal - fees.platformFeeCents - fees.serviceFeeCents);
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

async function reconcileExistingOrder(env, existing, lines, fees, summary, timestamp, costCandidateCache) {
  // 1) 订单级：手续费/服务费/优惠/销售额若变化，回填到 sales_orders
  const lineAmountTotal = lines.reduce((sum, l) => sum + Math.max(0,
    Number(l.lineAmountCents) || Number(l.unitPriceCents) * Number(l.quantity) || 0), 0);
  const receivedAmountCents = receivedAmountForOrder(lines, lineAmountTotal, fees);

  const patches = [];
  const params = [];
  if (Number(existing.platform_fee_cents || 0) !== fees.platformFeeCents) {
    patches.push('platform_fee_cents = ?'); params.push(fees.platformFeeCents);
  }
  if (Number(existing.service_fee_cents || 0) !== fees.serviceFeeCents) {
    patches.push('service_fee_cents = ?'); params.push(fees.serviceFeeCents);
  }
  if (Number(existing.discount_cents || 0) !== fees.discountCents) {
    patches.push('discount_cents = ?'); params.push(fees.discountCents);
  }
  if (lineAmountTotal > 0 && Number(existing.total_amount_cents || 0) !== lineAmountTotal) {
    patches.push('total_amount_cents = ?'); params.push(lineAmountTotal);
  }
  if (receivedAmountCents > 0 && Number(existing.received_amount_cents || 0) !== receivedAmountCents) {
    patches.push('received_amount_cents = ?'); params.push(receivedAmountCents);
  }
  if (patches.length > 0) {
    patches.push('updated_at = ?'); params.push(timestamp, existing.id);
    await env.DB.prepare(`UPDATE sales_orders SET ${patches.join(', ')} WHERE id = ?`).bind(...params).run();
    summary.ordersReconciled = (summary.ordersReconciled || 0) + 1;
  }

  // 2) 明细级：unit_price/line_amount 回填
  const items = await all(env.DB,
    `SELECT id, product_id, quantity, unit_price_cents, unit_cost_cents, line_amount_cents, line_cogs_cents
     FROM sales_items WHERE sales_order_id = ? ORDER BY id`, [existing.id]);
  let totalCogsCents = 0;
  let cogsChanged = false;
  for (let i = 0; i < Math.min(items.length, lines.length); i++) {
    const item = items[i];
    const line = lines[i];
    const unitPriceCents = Math.max(0, Number(line.unitPriceCents) || 0);
    const lineAmountCents = Math.max(0, Number(line.lineAmountCents) || unitPriceCents * Number(line.quantity));
    const ipatches = [];
    const iparams = [];
    if (unitPriceCents > 0 && Number(item.unit_price_cents) !== unitPriceCents) {
      ipatches.push('unit_price_cents = ?'); iparams.push(unitPriceCents);
    }
    if (lineAmountCents > 0 && Number(item.line_amount_cents) !== lineAmountCents) {
      ipatches.push('line_amount_cents = ?'); iparams.push(lineAmountCents);
    }
    if (ipatches.length > 0) {
      iparams.push(item.id);
      await env.DB.prepare(`UPDATE sales_items SET ${ipatches.join(', ')} WHERE id = ?`).bind(...iparams).run();
    }

    // 3) 商品级：回填 barcode/normalized_name
    const barcode = normalizeBarcode(line.vendorBarcode);
    const normalized = normalizeProductName(line.vendorProductName);
    let product = null;
    if (barcode || normalized) {
      product = await first(env.DB, `SELECT id, name, machine_id, external_id, normalized_name FROM products WHERE id = ?`, [item.product_id]);
      if (product) {
        const ppatches = [];
        const pparams = [];
        if (barcode && !product.external_id) {
          ppatches.push('external_id = ?'); pparams.push(barcode);
        }
        if (normalized && !product.normalized_name) {
          ppatches.push('normalized_name = ?'); pparams.push(normalized);
        }
        if (ppatches.length > 0) {
          ppatches.push('updated_at = ?'); pparams.push(timestamp, item.product_id);
          await env.DB.prepare(`UPDATE products SET ${ppatches.join(', ')} WHERE id = ?`).bind(...pparams).run();
        }
      }
    }

    const existingLineCogs = Number(item.line_cogs_cents) || 0;
    let lineCogsCents = existingLineCogs;
    if (existingLineCogs === 0) {
      if (!product) {
        product = await first(env.DB, `SELECT id, name, machine_id, external_id, normalized_name FROM products WHERE id = ?`, [item.product_id]);
      }
      const candidates = await loadPurchaseCostCandidates(env, existing.machine_id, costCandidateCache);
      const costMatch = findPurchaseCostCandidate(candidates, line, product);
      if (costMatch) {
        const quantity = Math.max(1, Number(item.quantity || line.quantity) || 1);
        lineCogsCents = costMatch.avgCostCents * quantity;
        await env.DB.prepare(`
          UPDATE sales_items
          SET unit_cost_cents = ?, line_cogs_cents = ?
          WHERE id = ?
        `).bind(costMatch.avgCostCents, lineCogsCents, item.id).run();
        await env.DB.prepare(`
          UPDATE stock_movements
          SET unit_cost_cents = ?
          WHERE ref_type = 'sales_order' AND ref_item_id = ?
        `).bind(costMatch.avgCostCents, item.id).run();
        cogsChanged = true;
        summary.costsMatched = (summary.costsMatched || 0) + 1;
      } else {
        summary.costsMissing = (summary.costsMissing || 0) + 1;
      }
    }
    totalCogsCents += lineCogsCents;
  }

  if (cogsChanged && Number(existing.total_cogs_cents || 0) !== totalCogsCents) {
    await env.DB.prepare(`
      UPDATE sales_orders
      SET total_cogs_cents = ?, updated_at = ?
      WHERE id = ?
    `).bind(totalCogsCents, timestamp, existing.id).run();
    summary.ordersReconciled = (summary.ordersReconciled || 0) + 1;
  }
}

async function importOneOrder(env, machineId, vendorOrderNo, lines, summary, warnings, balanceCache, costCandidateCache, timestamp) {
  const orderId = `zn:${vendorOrderNo}`.slice(0, 120);

  // 订单级聚合（同一订单号多行 Excel 通常重复列出相同手续费，取首行而非求和）
  const platformFeeCents = Math.max(0, Number(lines[0]?.platformFeeCents) || 0);
  const serviceFeeCents = Math.max(0, Number(lines[0]?.serviceFeeCents) || 0);
  const discountCents = Math.max(0, Number(lines[0]?.discountCents) || 0);

  const existing = await first(env.DB, `
    SELECT * FROM sales_orders
    WHERE (source = ? AND external_id = ?) OR id = ?
    LIMIT 1
  `, [ZN_INTEGRATION, vendorOrderNo, orderId]);
  if (existing) {
    summary.ordersDuplicate += 1;
    await reconcileExistingOrder(env, existing, lines, {
      platformFeeCents, serviceFeeCents, discountCents
    }, summary, timestamp, costCandidateCache);
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
    const candidates = Number(balance.avg_cost_cents) > 0
      ? []
      : await loadPurchaseCostCandidates(env, machineId, costCandidateCache);
    const costMatch = Number(balance.avg_cost_cents) > 0
      ? null
      : findPurchaseCostCandidate(candidates, line, product);
    const balanceCostCents = Number(balance.avg_cost_cents) || 0;
    const unitCostCents = line.costCents ?? (balanceCostCents || costMatch?.avgCostCents || 0);
    const lineCogsCents = unitCostCents * quantity;
    if (unitCostCents > 0) summary.costsMatched += 1;
    else summary.costsMissing += 1;

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
  const receivedAmountCents = receivedAmountForOrder(lines, totalAmount, {
    platformFeeCents,
    serviceFeeCents
  });

  statements.unshift(env.DB.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      platform_fee_cents, service_fee_cents, discount_cents, received_amount_cents,
      note, image_asset_id, voided_at, created_at, updated_at, external_id, source
    ) VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
  `).bind(orderId, machineId, orderDate, yearMonthFromDate(orderDate),
          totalAmount, totalCogs,
          platformFeeCents, serviceFeeCents, discountCents, receivedAmountCents,
          'zn 平台 Excel 导入',
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
      receivedAmountCents: Math.round((Number(row.receivedAmount) || 0) * 100),
      platformFeeCents: Math.round((Number(row.platformFee) || 0) * 100),
      serviceFeeCents: Math.round((Number(row.serviceFee) || 0) * 100),
      discountCents: Math.round((Number(row.discount) || 0) * 100),
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
  const costCandidateCache = new Map();
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
        await importOneOrder(env, machineId, vendorOrderNo, orderLines, summary, warnings, balanceCache, costCandidateCache, timestamp);
      } catch (error) {
        summary.ordersSkipped += 1;
        warnings.push(`订单 ${vendorOrderNo} 导入异常：${errorMessage(error)}`);
      }
    }
  }

  summary.warnings = warnings.length;
  return { summary, warnings };
}
