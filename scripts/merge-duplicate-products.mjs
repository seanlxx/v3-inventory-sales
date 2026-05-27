import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const outputDir = join(projectRoot, 'output', 'merge-products');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

const FUZZY_THRESHOLD = 0.72;

function normalizeProductName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/毫升/gi, 'ml')
    .replace(/克/gi, 'g')
    .replace(/升/gi, 'l')
    .replace(/[（）()【】[\]{}<>《》"'""''、，,。.!！?？:：;；\s_\-—/\\|+*=~`·￥$#@%^&]/g, '')
    .replace(/[^0-9a-z一-龥]/g, '');
}

function normalizeBarcode(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
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
  for (let i = 0; i < text.length - 1; i += 1) grams.add(text.slice(i, i + 2));
  return grams;
}

function jaccard(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function nameScore(leftName, rightName) {
  const l = normalizeCostText(leftName);
  const r = normalizeCostText(rightName);
  if (!l || !r) return 0;
  if (l === r) return 1;
  if (l.includes(r) || r.includes(l)) return 0.9;
  return Math.max(jaccard(l, r), coverage(l, r) * 0.72, coverage(r, l) * 0.72);
}

function parseWranglerJson(output) {
  const text = String(output || '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error(`Unable to parse wrangler JSON output: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

function runD1Query(sql) {
  const file = join(outputDir, `_q-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(file, String(sql).replace(/\s+/g, ' ').trim());
  const escaped = file.replace(/'/g, "''");
  const raw = execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `$sql = Get-Content -LiteralPath '${escaped}' -Raw; & npx wrangler d1 execute v3-vending-inventory-sales-db --remote --json --command $sql`
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 40 });
  return parseWranglerJson(raw).flatMap(item => item.results || []);
}

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function pickCanonical(group) {
  const sorted = [...group].sort((a, b) => {
    const aImp = a.normalized_name && a.external_id ? 2 : (a.normalized_name ? 1 : 0);
    const bImp = b.normalized_name && b.external_id ? 2 : (b.normalized_name ? 1 : 0);
    if (aImp !== bImp) return bImp - aImp;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  return sorted[0];
}

async function main() {
  console.log('Loading products from D1...');
  const products = runD1Query(`
    SELECT id, machine_id, name, normalized_name, external_id, status,
           sell_price_cents, category, created_at, updated_at
    FROM products
  `);
  console.log(`  total: ${products.length}`);

  const enriched = products.map(p => ({
    ...p,
    computed_norm: p.normalized_name || normalizeProductName(p.name)
  }));

  const activeByMachineNorm = new Map();
  for (const p of enriched) {
    if (p.status !== 'active') continue;
    const key = `${p.machine_id}|${p.computed_norm}`;
    if (!activeByMachineNorm.has(key)) activeByMachineNorm.set(key, []);
    activeByMachineNorm.get(key).push(p);
  }

  const merges = [];
  const conflictGroups = [];
  for (const [key, group] of activeByMachineNorm.entries()) {
    if (group.length < 2) continue;
    const canonical = pickCanonical(group);
    const others = group.filter(p => p.id !== canonical.id);
    if (group.filter(p => p.normalized_name && p.external_id).length > 1) {
      conflictGroups.push({ key, group });
    }
    for (const o of others) {
      merges.push({
        from: o,
        to: canonical,
        reason: 'exact-normalized-match',
        score: 1
      });
    }
  }

  const matchedFromIds = new Set(merges.map(m => m.from.id));
  const unmatchedOlds = enriched.filter(p =>
    p.status === 'active'
    && !p.normalized_name
    && !matchedFromIds.has(p.id)
  );
  const importedByMachine = new Map();
  for (const p of enriched) {
    if (p.status !== 'active' || !p.normalized_name) continue;
    if (!importedByMachine.has(p.machine_id)) importedByMachine.set(p.machine_id, []);
    importedByMachine.get(p.machine_id).push(p);
  }
  const fuzzyCandidates = [];
  for (const old of unmatchedOlds) {
    const candidates = importedByMachine.get(old.machine_id) || [];
    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = nameScore(old.name, c.name);
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (best && bestScore >= FUZZY_THRESHOLD) {
      fuzzyCandidates.push({ from: old, to: best, score: Number(bestScore.toFixed(3)) });
    }
  }

  console.log(`Merge plan:`);
  console.log(`  exact-normalized matches: ${merges.length}`);
  console.log(`  fuzzy matches (score>=${FUZZY_THRESHOLD}): ${fuzzyCandidates.length}`);
  console.log(`  conflict groups (multiple imported with same normalized_name): ${conflictGroups.length}`);

  if (conflictGroups.length > 0) {
    console.log('Conflict groups:');
    for (const c of conflictGroups) console.log(`  ${c.key} -> ${c.group.length} products`);
  }

  const planPath = join(outputDir, 'merge-plan.json');
  const planObj = {
    generated_at: new Date().toISOString(),
    exact: merges.map(m => ({
      from_id: m.from.id, from_name: m.from.name, from_machine: m.from.machine_id,
      to_id: m.to.id, to_name: m.to.name, to_machine: m.to.machine_id,
      reason: m.reason
    })),
    fuzzy: fuzzyCandidates.map(m => ({
      from_id: m.from.id, from_name: m.from.name, from_machine: m.from.machine_id,
      to_id: m.to.id, to_name: m.to.name, to_machine: m.to.machine_id,
      score: m.score
    })),
    conflicts: conflictGroups.map(c => ({
      key: c.key,
      members: c.group.map(p => ({ id: p.id, name: p.name }))
    })),
    unmatched_olds: unmatchedOlds
      .filter(p => !fuzzyCandidates.some(f => f.from.id === p.id))
      .map(p => ({ id: p.id, machine_id: p.machine_id, name: p.name }))
  };
  writeFileSync(planPath, JSON.stringify(planObj, null, 2));
  console.log(`Wrote merge plan: ${planPath}`);

  // 生成合并 SQL，使用所有 exact + fuzzy 配对
  const allPairs = [...merges, ...fuzzyCandidates];
  const sqlLines = [];
  const affectedNewProducts = new Set();
  for (const pair of allPairs) {
    const fromId = sqlString(pair.from.id);
    const toId = sqlString(pair.to.id);
    affectedNewProducts.add(`${pair.to.id}|${pair.to.machine_id}`);
    sqlLines.push(
      `-- ${pair.from.name} (${pair.from.id}) -> ${pair.to.name} (${pair.to.id}) [${pair.from.machine_id}]`,
      `UPDATE sales_items       SET product_id = ${toId} WHERE product_id = ${fromId};`,
      `UPDATE purchase_items    SET product_id = ${toId} WHERE product_id = ${fromId};`,
      `UPDATE stock_movements   SET product_id = ${toId} WHERE product_id = ${fromId};`,
      `UPDATE external_product_mappings SET local_product_id = ${toId} WHERE local_product_id = ${fromId};`,
      `DELETE FROM inventory_balances WHERE product_id = ${fromId};`,
      `DELETE FROM products WHERE id = ${fromId};`
    );
  }

  // 重建受影响新产品的 inventory_balances（用 0010 的算法）
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
  const sqlPath = join(outputDir, 'merge.sql');
  writeFileSync(sqlPath, sqlLines.join('\n'));
  console.log(`Wrote merge SQL: ${sqlPath}`);

  // 打印对照清单（按机台分）
  console.log('\n— 配对清单 —');
  for (const pair of allPairs.sort((a, b) =>
    a.from.machine_id.localeCompare(b.from.machine_id) || (a.score || 1) - (b.score || 1))) {
    const tag = (pair.score || 1) >= 0.9 ? '✓' : (pair.score || 0) >= 0.78 ? '~' : '?';
    console.log(`${tag} [${pair.from.machine_id}] (${(pair.score || 1).toFixed(2)}) ${pair.from.name}  →  ${pair.to.name}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
