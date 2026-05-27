import { first } from './d1.js';
import { nowIso } from './validators.js';

export const LEGACY_SHARED_MACHINE_IDS = new Set(['1/2号机', '1/2号机总库存', '总库存']);
export const DEFAULT_MACHINE_ID = '1号机';

export function normalizeMachineId(value, fallback = DEFAULT_MACHINE_ID) {
  return String(value || '').trim() || fallback;
}

export function isLegacySharedMachine(machineId) {
  return LEGACY_SHARED_MACHINE_IDS.has(normalizeMachineId(machineId, ''));
}

export function productCanServeMachine(productMachineId, orderMachineId) {
  const productMachine = normalizeMachineId(productMachineId, '');
  const orderMachine = normalizeMachineId(orderMachineId);
  if (!productMachine) return true;
  if (productMachine === orderMachine) return true;
  return isLegacySharedMachine(productMachine) && (orderMachine === '1号机' || orderMachine === '2号机');
}

export function balanceKey(productId, machineId) {
  return `${productId}\u0000${normalizeMachineId(machineId)}`;
}

export function emptyBalance(productId, machineId, timestamp = nowIso()) {
  return {
    product_id: productId,
    machine_id: normalizeMachineId(machineId),
    quantity_on_hand: 0,
    avg_cost_cents: 0,
    inventory_value_cents: 0,
    total_purchase_qty: 0,
    total_purchase_cost_cents: 0,
    updated_at: timestamp
  };
}

export async function getBalance(dbOrEnv, productId, machineId, cache = null) {
  const db = dbOrEnv.DB || dbOrEnv;
  const stockMachineId = normalizeMachineId(machineId);
  const key = balanceKey(productId, stockMachineId);
  if (cache?.has(key)) return cache.get(key);

  const row = await first(db, `
    SELECT *
    FROM inventory_balances
    WHERE product_id = ? AND machine_id = ?
    LIMIT 1
  `, [productId, stockMachineId]);

  const balance = row || emptyBalance(productId, stockMachineId);
  if (cache) cache.set(key, balance);
  return balance;
}

export function upsertBalanceStatement(db, balance) {
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
    normalizeMachineId(balance.machine_id),
    Number(balance.quantity_on_hand) || 0,
    Math.max(0, Number(balance.avg_cost_cents) || 0),
    Math.max(0, Number(balance.inventory_value_cents) || 0),
    Number(balance.total_purchase_qty) || 0,
    Math.max(0, Number(balance.total_purchase_cost_cents) || 0),
    balance.updated_at || nowIso()
  );
}

export function movementStatement(db, movement) {
  return db.prepare(`
    INSERT INTO stock_movements (
      id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
      ref_type, ref_id, ref_item_id, voids_movement_id, external_id, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    movement.id,
    movement.product_id,
    normalizeMachineId(movement.machine_id),
    movement.movement_type,
    Number(movement.qty_delta) || 0,
    Math.max(0, Number(movement.unit_cost_cents) || 0),
    movement.ref_type,
    movement.ref_id,
    movement.ref_item_id || null,
    movement.voids_movement_id || null,
    movement.external_id || null,
    movement.reason || null,
    movement.created_at || nowIso()
  );
}

export function applyBalanceDelta(balance, delta = {}) {
  const next = { ...balance };
  const previousQty = Number(balance.quantity_on_hand) || 0;
  const previousValueCents = Math.max(0, Number(balance.inventory_value_cents) || 0);
  const qtyDelta = Number(delta.qtyDelta ?? delta.qty_delta) || 0;
  const valueDeltaCents = Number(delta.valueDeltaCents ?? delta.value_delta_cents) || 0;

  next.machine_id = normalizeMachineId(balance.machine_id);
  next.quantity_on_hand = previousQty + qtyDelta;
  next.inventory_value_cents = previousValueCents + valueDeltaCents;
  next.total_purchase_qty = (Number(next.total_purchase_qty) || 0) + (Number(delta.purchaseQtyDelta) || 0);
  next.total_purchase_cost_cents = (Number(next.total_purchase_cost_cents) || 0) + (Number(delta.purchaseCostDeltaCents) || 0);
  next.updated_at = delta.timestamp || nowIso();

  if (next.quantity_on_hand <= 0) {
    next.avg_cost_cents = 0;
    next.inventory_value_cents = 0;
  } else {
    if (previousQty < 0 && qtyDelta > 0 && valueDeltaCents > 0) {
      next.inventory_value_cents = Math.round(next.quantity_on_hand * (valueDeltaCents / qtyDelta));
    }
    next.inventory_value_cents = Math.max(0, Number(next.inventory_value_cents) || 0);
    next.avg_cost_cents = Math.round(next.inventory_value_cents / next.quantity_on_hand);
  }

  return next;
}

export async function applyMovement(
  env,
  cache,
  movement,
  valueDeltaCents,
  statements,
  purchaseQtyDelta = 0,
  purchaseCostDeltaCents = 0
) {
  const stockMachineId = normalizeMachineId(movement.machine_id);
  const normalizedMovement = { ...movement, machine_id: stockMachineId };
  const balance = await getBalance(env, normalizedMovement.product_id, stockMachineId, cache);
  const nextBalance = applyBalanceDelta(balance, {
    qtyDelta: normalizedMovement.qty_delta,
    valueDeltaCents,
    purchaseQtyDelta,
    purchaseCostDeltaCents,
    timestamp: normalizedMovement.created_at
  });
  cache?.set(balanceKey(normalizedMovement.product_id, stockMachineId), nextBalance);
  statements.push(movementStatement(env.DB, normalizedMovement));
  statements.push(upsertBalanceStatement(env.DB, nextBalance));
  return nextBalance;
}
