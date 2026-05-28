import { all, first } from '../d1.js';
import { centsToMoney, newId, nowIso, yearMonthFromDate } from '../validators.js';
import { computeReceivedAmountCents } from '../money.js';
import { ZN_INTEGRATION, mapZnDeviceToMachine } from './constants.js';
import { normalizeProductName } from '../shengma/mapper.js';
import {
  applyBalanceDelta as applyBalanceDeltaToRow,
  getBalance,
  normalizeMachineId,
  upsertBalanceStatement
} from '../inventory-balance.js';

const EMPTY_SUMMARY = {
  ordersImported: 0,
  ordersDuplicate: 0,
  ordersSkipped: 0,
  linesImported: 0,
  productsCreated: 0,
  productsExisting: 0,
  productsStandardized: 0,
  costsMatched: 0,
  costsMissing: 0,
  warnings: 0
};

const COST_MATCH_THRESHOLD = 0.72;
const ZN_PRODUCT_MACHINE_ID = '1/2号机';

function newSummary() {
  return { ...EMPTY_SUMMARY };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || '未知错误');
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

function toMoneyCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function normalizeRowText(value) {
  return String(value || '').trim();
}

function standardProductName(value) {
  return normalizeProductName(value) || normalizeRowText(value) || '未知商品';
}

function znProductMachineIdFor(machineId) {
  const stockMachineId = normalizeMachineId(machineId);
  return stockMachineId === '1号机' || stockMachineId === '2号机'
    ? ZN_PRODUCT_MACHINE_ID
    : stockMachineId;
}

function hasProductLine(row) {
  return !!normalizeRowText(row?.vendorProductName);
}

function expectedItemCount(row) {
  const title = normalizeRowText(row?.title);
  const match = title.match(/(?:共计消费|共计)(\d+)件商品/);
  if (match) return Math.max(1, Number(match[1]) || 1);
  const priceCents = toMoneyCents(row?.lineAmount ?? row?.price);
  const unitPriceCents = toMoneyCents(row?.unitPrice);
  const quantity = Math.max(1, Number(row?.quantity) || 1);
  if (priceCents > unitPriceCents * quantity) return Math.max(quantity + 1, 2);
  return quantity;
}

function normalizeMultiItemLineAmounts(lines) {
  const groups = groupLines(lines);
  for (const groupLines of groups.values()) {
    if (groupLines.length <= 1) continue;
    for (const line of groupLines) {
      const calculated = Math.max(0, Number(line.unitPriceCents) || 0) * Math.max(1, Number(line.quantity) || 1);
      if (calculated > 0) line.lineAmountCents = calculated;
    }
  }
}

async function patchProductMetadata(env, product, line, statements, summary, timestamp) {
  const normalized = normalizeProductName(line.vendorProductName);
  const standardName = standardProductName(line.vendorProductName);
  const rawName = normalizeRowText(line.vendorProductName);
  const patches = [];
  const params = [];
  if (normalized && !product.normalized_name) {
    patches.push('normalized_name = ?');
    params.push(normalized);
    product.normalized_name = normalized;
  }
  if (standardName && product.name === rawName && product.name !== standardName) {
    patches.push('name = ?');
    params.push(standardName);
    product.name = standardName;
    if (summary) summary.productsStandardized = (summary.productsStandardized || 0) + 1;
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

async function findOrCreateProduct(env, machineId, line, statements, summary, timestamp, costCandidateCache) {
  const stockMachineId = normalizeMachineId(machineId);
  const productMachineId = znProductMachineIdFor(stockMachineId);
  const normalized = normalizeProductName(line.vendorProductName);
  const rawName = normalizeRowText(line.vendorProductName);
  const displayName = standardProductName(line.vendorProductName);

  let product = null;
  if (!product && normalized) {
    product = await first(env.DB, `
      SELECT * FROM products
      WHERE machine_id = ?
        AND (normalized_name = ? OR external_id = ? OR name = ? OR name = ?)
        AND status = 'active'
      LIMIT 1
    `, [productMachineId, normalized, normalized, rawName, displayName]);
  }
  if (product) return await patchProductMetadata(env, product, line, statements, summary, timestamp);

  product = await findMergedTargetProduct(env, productMachineId, rawName, normalized, displayName);
  if (product) return await patchProductMetadata(env, product, line, statements, summary, timestamp);

  const candidates = await loadPurchaseCostCandidates(env, stockMachineId, costCandidateCache);
  const purchaseMatch = findPurchaseCostCandidate(candidates, line, null);
  if (purchaseMatch) return await patchProductMetadata(env, purchaseMatch, line, statements, summary, timestamp);

  product = {
    id: newId(),
    machine_id: productMachineId,
    name: displayName,
    category: '其他',
    sell_price_cents: Math.max(0, Number(line.unitPriceCents) || 0),
    status: 'active',
    normalized_name: normalized,
    external_id: normalized || null,
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

async function findMergedTargetProduct(env, productMachineId, rawName, normalizedName, displayName) {
  const normalized = normalizedName || normalizeProductName(rawName) || normalizeProductName(displayName);
  const rawLower = normalizeRowText(rawName).toLowerCase();
  const displayLower = normalizeRowText(displayName).toLowerCase();
  const mergedRows = await all(env.DB, `
    SELECT name, external_id, SUBSTR(normalized_name, 8) AS target_normalized_name
    FROM products
    WHERE machine_id = ?
      AND status = 'archived'
      AND normalized_name LIKE 'merged:%'
  `, [productMachineId]);
  const merged = mergedRows.find(row => {
    const rowName = normalizeRowText(row.name);
    const rowNameLower = rowName.toLowerCase();
    const rowExternalId = normalizeRowText(row.external_id);
    return (rawLower && rowNameLower === rawLower)
      || (displayLower && rowNameLower === displayLower)
      || (normalized && rowExternalId === normalized)
      || (normalized && normalizeProductName(rowName) === normalized)
      || (normalized && rowExternalId && normalizeProductName(rowExternalId) === normalized);
  });
  if (!merged?.target_normalized_name) return null;

  return await first(env.DB, `
    SELECT *
    FROM products
    WHERE machine_id = ?
      AND status = 'active'
      AND normalized_name = ?
    LIMIT 1
  `, [productMachineId, merged.target_normalized_name]);
}

async function findZnProduct(env, productMachineId, rawName, normalizedName) {
  const displayName = standardProductName(rawName);
  const product = await first(env.DB, `
    SELECT *
    FROM products
    WHERE machine_id = ?
      AND status = 'active'
      AND (normalized_name = ? OR external_id = ? OR name = ? OR name = ?)
    LIMIT 1
  `, [productMachineId, normalizedName, normalizedName, rawName, displayName]);
  return product || await findMergedTargetProduct(env, productMachineId, rawName, normalizedName, displayName);
}

function productLineKey(productMachineId, normalizedName) {
  return `${productMachineId}|${normalizedName}`;
}

export async function preImportZnProducts(env, body) {
  const { lines, skipped, unmappedDevices } = validatePayload(body);
  const summary = {
    productsParsed: 0,
    productsCreated: 0,
    productsExisting: 0,
    productsStandardized: 0,
    rowsSkipped: skipped.canceled + skipped.refunded + skipped.unmappedDevice + skipped.missing,
    warnings: 0
  };
  const warnings = [];
  const timestamp = nowIso();
  const uniqueProducts = new Map();

  if (skipped.canceled) warnings.push(`已跳过 ${skipped.canceled} 个非"已完成"订单`);
  if (skipped.refunded) warnings.push(`已跳过 ${skipped.refunded} 个含退款订单`);
  if (skipped.unmappedDevice) warnings.push(`未识别设备编号 ${unmappedDevices.join(' / ')}，对应 ${skipped.unmappedDevice} 行已跳过`);
  if (skipped.missing) warnings.push(`已跳过 ${skipped.missing} 行缺失订单号或商品名的数据`);

  for (const line of lines) {
    const quantity = Math.max(0, Number(line.quantity) || 0);
    if (quantity <= 0) {
      summary.rowsSkipped += 1;
      warnings.push(`商品 ${line.vendorProductName || '-'} 数量无效（${line.quantity}），已跳过`);
      continue;
    }
    const normalizedName = normalizeProductName(line.vendorProductName);
    if (!normalizedName) {
      summary.rowsSkipped += 1;
      warnings.push(`商品 ${line.vendorProductName || '-'} 无法生成标准商品名称，已跳过`);
      continue;
    }
    const productMachineId = znProductMachineIdFor(line.machineId);
    const key = productLineKey(productMachineId, normalizedName);
    if (!uniqueProducts.has(key)) {
      uniqueProducts.set(key, {
        machineId: productMachineId,
        rawName: normalizeRowText(line.vendorProductName),
        standardName: standardProductName(line.vendorProductName),
        normalizedName,
        sellPriceCents: Math.max(0, Number(line.unitPriceCents) || 0)
      });
    }
  }

  summary.productsParsed = uniqueProducts.size;

  for (const item of uniqueProducts.values()) {
    const existing = await findZnProduct(env, item.machineId, item.rawName, item.normalizedName);
    if (existing) {
      const statements = [];
      await patchProductMetadata(
        env,
        existing,
        { vendorProductName: item.rawName },
        statements,
        summary,
        timestamp
      );
      if (statements.length > 0) await env.DB.batch(statements);
      summary.productsExisting += 1;
      continue;
    }

    await env.DB.prepare(`
      INSERT INTO products (
        id, machine_id, name, category, sell_price_cents, status,
        created_at, updated_at, normalized_name, external_id
      ) VALUES (?, ?, ?, '其他', ?, 'active', ?, ?, ?, ?)
    `).bind(
      newId(),
      item.machineId,
      item.standardName,
      item.sellPriceCents,
      timestamp,
      timestamp,
      item.normalizedName,
      item.normalizedName
    ).run();
    summary.productsCreated += 1;
  }

  summary.warnings = warnings.length;
  return { summary, warnings };
}

async function loadPurchaseCostCandidates(env, machineId, cache) {
  const stockMachineId = normalizeMachineId(machineId);
  if (cache.has(stockMachineId)) return cache.get(stockMachineId);
  const rows = await all(env.DB, `
    SELECT
      p.id,
      o.machine_id,
      p.machine_id AS product_machine_id,
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
      AND o.machine_id = ?
    GROUP BY p.id, o.machine_id, p.machine_id, p.name, p.normalized_name, p.external_id
    HAVING SUM(i.quantity) > 0 AND SUM(i.total_cost_cents) > 0
  `, [stockMachineId]);
  cache.set(stockMachineId, rows);
  return rows;
}

function findPurchaseCostCandidate(candidates, line, product) {
  const normalized = normalizeProductName(line.vendorProductName);
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = 0;
    if (normalized && candidate.normalized_name === normalized) {
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
  return computeReceivedAmountCents({
    grossAmountCents: lineAmountTotal,
    refundAmountCents: fees.refundAmountCents,
    platformFeeCents: fees.platformFeeCents,
    serviceFeeCents: fees.serviceFeeCents
  });
}

function applyBalanceDelta(balance, qtyDelta, valueDeltaCents, timestamp) {
  return applyBalanceDeltaToRow(balance, { qtyDelta, valueDeltaCents, timestamp });
}

function upsertBalanceStmt(env, balance) {
  return upsertBalanceStatement(env.DB, balance);
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

async function restoreExistingOrderInventory(env, existing, timestamp) {
  const movements = await all(env.DB, `
    SELECT product_id, machine_id, qty_delta, unit_cost_cents, ref_item_id
    FROM stock_movements
    WHERE ref_type = 'sales_order'
      AND ref_id = ?
      AND movement_type = 'sale'
  `, [existing.id]);
  for (const movement of movements) {
    const balance = await getBalance(env, movement.product_id, movement.machine_id);
    const quantity = Math.abs(Number(movement.qty_delta) || 0);
    const valueCents = quantity * (Number(movement.unit_cost_cents) || 0);
    await upsertBalanceStmt(env, applyBalanceDelta(balance, quantity, valueCents, timestamp)).run();
  }
}

async function rebuildExistingOrder(env, existing, lines, fees, summary, timestamp, costCandidateCache) {
  const statements = [];
  const balanceCache = new Map();
  let totalAmount = 0;
  let totalCogs = 0;
  let itemIndex = 0;

  await restoreExistingOrderInventory(env, existing, timestamp);
  await env.DB.prepare("DELETE FROM stock_movements WHERE ref_type = 'sales_order' AND ref_id = ?")
    .bind(existing.id)
    .run();
  await env.DB.prepare('DELETE FROM sales_items WHERE sales_order_id = ?')
    .bind(existing.id)
    .run();

  for (const line of lines) {
    if (!line.vendorProductName) continue;
    const stockMachineId = normalizeMachineId(existing.machine_id);
    const product = await findOrCreateProduct(env, existing.machine_id, line, statements, summary, timestamp, costCandidateCache);
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const unitPriceCents = Math.max(0, Number(line.unitPriceCents) || 0);
    const lineAmountCents = Math.max(0, Number(line.lineAmountCents) || unitPriceCents * quantity);

    const balanceKey = `${product.id}|${stockMachineId}`;
    if (!balanceCache.has(balanceKey)) {
      balanceCache.set(balanceKey, await getBalance(env, product.id, stockMachineId));
    }
    const balance = balanceCache.get(balanceKey);
    const candidates = Number(balance.avg_cost_cents) > 0
      ? []
      : await loadPurchaseCostCandidates(env, stockMachineId, costCandidateCache);
    const costMatch = Number(balance.avg_cost_cents) > 0
      ? null
      : findPurchaseCostCandidate(candidates, line, product);
    const balanceCostCents = Number(balance.avg_cost_cents) || 0;
    const unitCostCents = line.costCents ?? (balanceCostCents || costMatch?.avgCostCents || 0);
    const lineCogsCents = unitCostCents * quantity;
    if (unitCostCents > 0) summary.costsMatched = (summary.costsMatched || 0) + 1;
    else summary.costsMissing = (summary.costsMissing || 0) + 1;

    const itemId = `${existing.id}:${itemIndex}`;
    statements.push(env.DB.prepare(`
      INSERT INTO sales_items (
        id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
        line_amount_cents, line_cogs_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(itemId, existing.id, product.id, quantity, unitPriceCents, unitCostCents,
            lineAmountCents, lineCogsCents, timestamp));

    statements.push(env.DB.prepare(`
      INSERT INTO stock_movements (
        id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
        ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
      ) VALUES (?, ?, ?, 'sale', ?, ?, 'sales_order', ?, ?, NULL, ?, ?, ?)
    `).bind(
      `sales_order:${existing.id}:${product.id}:${itemIndex}`,
      product.id, stockMachineId, -quantity, unitCostCents,
      existing.id, itemId,
      `${ZN_INTEGRATION}:sale:${existing.external_id || existing.id}:${itemIndex}`,
      'zn 平台 Excel 导入校正', timestamp
    ));

    const nextBalance = applyBalanceDelta(balance, -quantity, -quantity * unitCostCents, timestamp);
    statements.push(upsertBalanceStmt(env, nextBalance));
    balanceCache.set(balanceKey, nextBalance);

    totalAmount += lineAmountCents;
    totalCogs += lineCogsCents;
    itemIndex += 1;
  }

  if (itemIndex === 0) return;
  const receivedAmountCents = receivedAmountForOrder(lines, totalAmount, fees);
  statements.push(env.DB.prepare(`
    UPDATE sales_orders
    SET total_amount_cents = ?,
        total_cogs_cents = ?,
        platform_fee_cents = ?,
        service_fee_cents = ?,
        discount_cents = ?,
        refund_amount_cents = ?,
        received_amount_cents = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    totalAmount,
    totalCogs,
    fees.platformFeeCents,
    fees.serviceFeeCents,
    fees.discountCents,
    fees.refundAmountCents || 0,
    receivedAmountCents,
    timestamp,
    existing.id
  ));

  await env.DB.batch(statements);
  summary.ordersReconciled = (summary.ordersReconciled || 0) + 1;
}

async function reconcileExistingOrder(env, existing, lines, fees, summary, timestamp, costCandidateCache) {
  const items = await all(env.DB,
    `SELECT id, product_id, quantity, unit_price_cents, unit_cost_cents, line_amount_cents, line_cogs_cents
     FROM sales_items WHERE sales_order_id = ? ORDER BY id`, [existing.id]);
  if (items.length !== lines.length && lines.length > 0) {
    await rebuildExistingOrder(env, existing, lines, fees, summary, timestamp, costCandidateCache);
    return;
  }

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
  if (Number(existing.refund_amount_cents || 0) !== (fees.refundAmountCents || 0)) {
    patches.push('refund_amount_cents = ?'); params.push(fees.refundAmountCents || 0);
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

    // 3) 商品级：回填 normalized_name。zn 商品条码不写入商品档案。
    const normalized = normalizeProductName(line.vendorProductName);
    let product = null;
    if (normalized) {
      product = await first(env.DB, `SELECT id, name, machine_id, external_id, normalized_name FROM products WHERE id = ?`, [item.product_id]);
      if (product) {
        const ppatches = [];
        const pparams = [];
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
  const stockMachineId = normalizeMachineId(machineId);
  const orderId = `zn:${vendorOrderNo}`.slice(0, 120);

  // 订单级聚合（同一订单号多行 Excel 通常重复列出相同手续费，取首行而非求和）
  const platformFeeCents = Math.max(0, Number(lines[0]?.platformFeeCents) || 0);
  const serviceFeeCents = Math.max(0, Number(lines[0]?.serviceFeeCents) || 0);
  const discountCents = Math.max(0, Number(lines[0]?.discountCents) || 0);
  const refundAmountCents = Math.max(0, Number(lines[0]?.refundAmountCents) || 0);

  const existing = await first(env.DB, `
    SELECT * FROM sales_orders
    WHERE (source = ? AND external_id = ?) OR id = ?
    LIMIT 1
  `, [ZN_INTEGRATION, vendorOrderNo, orderId]);
  if (existing) {
    summary.ordersDuplicate += 1;
    await reconcileExistingOrder(env, existing, lines, {
      platformFeeCents, serviceFeeCents, discountCents, refundAmountCents
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
    const quantity = Math.max(0, Number(line.quantity) || 0);
    if (quantity <= 0) {
      warnings.push(`订单 ${vendorOrderNo} 商品 ${line.vendorProductName} 数量无效（${line.quantity}），跳过此行`);
      continue;
    }
    const product = await findOrCreateProduct(env, machineId, line, statements, summary, timestamp, costCandidateCache);
    const unitPriceCents = Math.max(0, Number(line.unitPriceCents) || 0);
    const lineAmountCents = Math.max(0, Number(line.lineAmountCents) || unitPriceCents * quantity);

    const balanceKey = `${product.id}|${stockMachineId}`;
    if (!balanceCache.has(balanceKey)) {
      balanceCache.set(balanceKey, await getBalance(env, product.id, stockMachineId));
    }
    const balance = balanceCache.get(balanceKey);
    const candidates = Number(balance.avg_cost_cents) > 0
      ? []
      : await loadPurchaseCostCandidates(env, stockMachineId, costCandidateCache);
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

    const movementCreatedAt = `${orderDate}T00:00:00.000Z`;
    statements.push(env.DB.prepare(`
      INSERT INTO stock_movements (
        id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
        ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
      ) VALUES (?, ?, ?, 'sale', ?, ?, 'sales_order', ?, ?, NULL, ?, ?, ?)
    `).bind(
      `sales_order:${orderId}:${product.id}:${itemIndex}`,
      product.id, stockMachineId, -quantity, unitCostCents,
      orderId, itemId,
      `${ZN_INTEGRATION}:sale:${vendorOrderNo}:${itemIndex}`,
      'zn 平台 Excel 导入', movementCreatedAt
    ));

    const nextBalance = applyBalanceDelta(balance, -quantity, -quantity * unitCostCents, timestamp);
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
    serviceFeeCents,
    refundAmountCents
  });

  statements.unshift(env.DB.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      platform_fee_cents, service_fee_cents, discount_cents, refund_amount_cents, received_amount_cents,
      note, image_asset_id, voided_at, created_at, updated_at, external_id, source
    ) VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
  `).bind(orderId, machineId, orderDate, yearMonthFromDate(orderDate),
          totalAmount, totalCogs,
          platformFeeCents, serviceFeeCents, discountCents, refundAmountCents, receivedAmountCents,
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
  let currentOrder = null;

  for (const row of orders) {
    const vendorOrderNo = normalizeRowText(row?.vendorOrderNo);
    const hasOrderNo = !!vendorOrderNo;
    const status = normalizeRowText(row?.status || currentOrder?.status);
    const refundAmount = Number(hasOrderNo ? row?.refundAmount : currentOrder?.refundAmount) || 0;
    const deviceCode = normalizeRowText(row?.deviceCode || currentOrder?.deviceCode);
    if (vendorOrderNo) {
      currentOrder = {
        vendorOrderNo,
        status,
        refundAmount,
        deviceCode,
        receivedAmount: row?.receivedAmount,
        platformFee: row?.platformFee,
        serviceFee: row?.serviceFee,
        discount: row?.discount,
        date: row?.date,
        expectedItems: expectedItemCount(row),
        itemCount: 0
      };
    }

    if (status && status !== '已完成') {
      skipped.canceled += 1;
      continue;
    }
    if (refundAmount > 0) {
      skipped.refunded += 1;
      continue;
    }
    const machineId = mapZnDeviceToMachine(deviceCode);
    if (!machineId) {
      skipped.unmappedDevice += 1;
      unmappedDevices.add(deviceCode);
      continue;
    }
    const canInheritOrder = !vendorOrderNo
      && currentOrder
      && currentOrder.itemCount < currentOrder.expectedItems
      && hasProductLine(row);
    const effectiveOrderNo = vendorOrderNo || (canInheritOrder ? currentOrder.vendorOrderNo : '');
    if (!effectiveOrderNo || !hasProductLine(row)) {
      skipped.missing += 1;
      continue;
    }
    lines.push({
      machineId,
      vendorOrderNo: effectiveOrderNo,
      vendorProductName: normalizeRowText(row.vendorProductName),
      vendorBarcode: '',
      quantity: Math.max(0, Number(row.quantity) || 0),
      unitPriceCents: toMoneyCents(row.unitPrice),
      lineAmountCents: toMoneyCents(row.lineAmount ?? row.unitPrice),
      receivedAmountCents: toMoneyCents(hasOrderNo ? row.receivedAmount : currentOrder?.receivedAmount),
      refundAmountCents: toMoneyCents(hasOrderNo ? row.refundAmount : currentOrder?.refundAmount),
      platformFeeCents: toMoneyCents(hasOrderNo ? row.platformFee : currentOrder?.platformFee),
      serviceFeeCents: toMoneyCents(hasOrderNo ? row.serviceFee : currentOrder?.serviceFee),
      discountCents: toMoneyCents(hasOrderNo ? row.discount : currentOrder?.discount),
      date: row.date || currentOrder?.date || ''
    });
    if (currentOrder && effectiveOrderNo === currentOrder.vendorOrderNo) currentOrder.itemCount += 1;
  }

  normalizeMultiItemLineAmounts(lines);
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
