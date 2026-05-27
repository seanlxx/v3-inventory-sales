import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const outputDir = join(projectRoot, 'output', 'merge-products');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

// 显式配对（machine_id, from_id, from_name, to_id, to_name）
const PAIRS = [
  ['1号机', 'moochey7r79euhx',                        '杨协成马蹄水饮料400ml',
            '618e6f9e-c4cb-4277-b73e-42713fb84d6b',   '楊協成马蹄水植物饮料400ml'],
  ['1号机', 'moo90h7otdducsc',                        '冰露饮用水550ml',
            '7582a7ab-518b-4dc0-bc93-734dc856d03e',   '冰露矿泉水(550ml)'],
  ['1号机', 'moob6o7nlmlce00',                        '娃哈哈营养快线原味500ml',
            'ed3023b6-e6b1-4716-ad31-01016855f64c',   '娃哈哈营养快线水果牛奶饮品原味500g'],
  ['1号机', '4ffad522-7c16-4f47-8b0f-9efd379e15ec',   '东鹏补水电解质饮料柠檬味555ml',
            'a17c714e-1997-4f2b-b42c-f826733c13f8',   '东鹏补水啦电解质水柠檬味1L'],
  ['2号机', 'moocdza8pdrvdrm',                        '曼悦芙肠仔风味面包80g',
            'bf043c3d-741f-44a7-8349-632507cb8422',   '曼悦芙爆汁肠仔面包80克'],
  ['2号机', 'moo8whmge93sxav',                        '双汇泡面搭档火腿肠35g',
            '0fb27918-2753-4893-92d7-afd4c3f82f61',   '双汇泡面搭档香肠35g(非标品如上架造成损失自行承担)'],
  ['2号机', 'cae21048-cd54-4cfc-bb1a-9642713362d1',   '统一拌皇番茄牛肉面',
            'f1ff9988-bcf0-44b0-ba16-3acf2102230d',   '茄皇茄皇牛肉面128克'],
  ['2号机', '3438ab77-eb2a-4935-8a56-d25100a0075c',   '满小饱冲泡肥汁米线6桶',
            '2790b630-7424-4c45-a979-a3826d8d064a',   '满小饱肥汁米线112.6g'],
  ['2号机', '9bb2a0b5-f5dc-4a31-8517-2c80269b6ece',   '3元面包',
            '8c68e745-9f34-42d9-be85-66eae87f6d86',   '美味软式面包85g']
];

// 合并完后或独立下架的产品 id
const ARCHIVE_IDS = [
  'a17c714e-1997-4f2b-b42c-f826733c13f8',  // 合并完后下架（东鹏补水啦1L）
  'c6c41420-5635-4cb4-b3df-2bbb7810be6f'   // 独立下架（康师傅劲凉冰红茶1L）
];

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function main() {
  const sqlLines = [];
  const affectedNewProducts = new Set();

  for (const [machineId, fromId, fromName, toId, toName] of PAIRS) {
    affectedNewProducts.add(`${toId}|${machineId}`);
    sqlLines.push(
      `-- ${fromName} (${fromId}) -> ${toName} (${toId}) [${machineId}]`,
      `UPDATE sales_items                SET product_id = ${sqlString(toId)} WHERE product_id = ${sqlString(fromId)};`,
      `UPDATE purchase_items             SET product_id = ${sqlString(toId)} WHERE product_id = ${sqlString(fromId)};`,
      `UPDATE stock_movements            SET product_id = ${sqlString(toId)} WHERE product_id = ${sqlString(fromId)};`,
      `UPDATE external_product_mappings  SET local_product_id = ${sqlString(toId)} WHERE local_product_id = ${sqlString(fromId)};`,
      `DELETE FROM inventory_balances WHERE product_id = ${sqlString(fromId)};`,
      `DELETE FROM products           WHERE id         = ${sqlString(fromId)};`
    );
  }

  const tuples = [...affectedNewProducts].map(s => {
    const [pid, mid] = s.split('|');
    return `(${sqlString(pid)}, ${sqlString(mid)})`;
  });
  if (tuples.length > 0) {
    sqlLines.push('-- 重建合并后产品的库存余额');
    sqlLines.push(`DELETE FROM inventory_balances WHERE (product_id, machine_id) IN (${tuples.join(', ')});`);
    sqlLines.push(`INSERT INTO inventory_balances (
  product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
  total_purchase_qty, total_purchase_cost_cents, updated_at
)
WITH valued_movements AS (
  SELECT
    m.product_id,
    m.machine_id,
    m.qty_delta,
    m.created_at,
    CASE
      WHEN m.movement_type = 'purchase' THEN COALESCE(pi.total_cost_cents, m.qty_delta * m.unit_cost_cents)
      WHEN m.movement_type IN ('sale', 'loss') THEN -COALESCE(si.line_cogs_cents, ABS(m.qty_delta) * m.unit_cost_cents)
      WHEN m.movement_type = 'refund' THEN COALESCE(si.line_cogs_cents, ABS(m.qty_delta) * m.unit_cost_cents)
      WHEN m.movement_type = 'adjustment' THEN m.qty_delta * m.unit_cost_cents
      WHEN m.movement_type = 'void' AND voided.movement_type = 'purchase' THEN -COALESCE(voided_pi.total_cost_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      WHEN m.movement_type = 'void' AND voided.movement_type IN ('sale', 'loss') THEN COALESCE(voided_si.line_cogs_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      WHEN m.movement_type = 'void' AND voided.movement_type = 'refund' THEN -COALESCE(voided_si.line_cogs_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      ELSE m.qty_delta * m.unit_cost_cents
    END AS value_delta_cents,
    CASE
      WHEN m.movement_type = 'purchase' THEN m.qty_delta
      WHEN m.movement_type = 'void' AND voided.movement_type = 'purchase' THEN m.qty_delta
      ELSE 0
    END AS purchase_qty_delta,
    CASE
      WHEN m.movement_type = 'purchase' THEN COALESCE(pi.total_cost_cents, m.qty_delta * m.unit_cost_cents)
      WHEN m.movement_type = 'void' AND voided.movement_type = 'purchase' THEN -COALESCE(voided_pi.total_cost_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      ELSE 0
    END AS purchase_cost_delta_cents
  FROM stock_movements m
  LEFT JOIN stock_movements voided ON voided.id = m.voids_movement_id
  LEFT JOIN purchase_items pi ON pi.id = m.ref_item_id
  LEFT JOIN purchase_items voided_pi ON voided_pi.id = voided.ref_item_id
  LEFT JOIN sales_items si ON si.id = m.ref_item_id
  LEFT JOIN sales_items voided_si ON voided_si.id = voided.ref_item_id
  WHERE (m.product_id, m.machine_id) IN (${tuples.join(', ')})
),
movement_totals AS (
  SELECT
    product_id, machine_id,
    SUM(qty_delta) AS quantity_on_hand,
    SUM(value_delta_cents) AS inventory_value_cents,
    SUM(purchase_qty_delta) AS total_purchase_qty,
    SUM(purchase_cost_delta_cents) AS total_purchase_cost_cents,
    MAX(created_at) AS updated_at
  FROM valued_movements
  GROUP BY product_id, machine_id
)
SELECT
  product_id, machine_id,
  CAST(quantity_on_hand AS INTEGER),
  CASE WHEN quantity_on_hand <= 0 THEN 0
       ELSE CAST(ROUND(1.0 * inventory_value_cents / quantity_on_hand) AS INTEGER) END,
  CASE WHEN quantity_on_hand <= 0 THEN 0
       ELSE CAST(inventory_value_cents AS INTEGER) END,
  CAST(total_purchase_qty AS INTEGER),
  CAST(total_purchase_cost_cents AS INTEGER),
  COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM movement_totals;`);
  }

  // 下架
  for (const id of ARCHIVE_IDS) {
    sqlLines.push(`-- archive ${id}`);
    sqlLines.push(`UPDATE products SET status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ${sqlString(id)};`);
  }

  const sqlPath = join(outputDir, 'merge-v2.sql');
  writeFileSync(sqlPath, sqlLines.join('\n'));
  console.log(`Wrote: ${sqlPath}`);
  console.log(`Pairs: ${PAIRS.length}, Archive: ${ARCHIVE_IDS.length}, Statements: ${sqlLines.filter(l => !l.startsWith('--')).length}`);
}

main();
