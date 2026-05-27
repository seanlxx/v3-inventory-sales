import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const outputDir = join(projectRoot, 'output', 'merge-products');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

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

function normalizeCostText(raw) {
  return normalizeProductName(raw)
    .replace(/饮料/g, '')
    .replace(/饮品/g, '')
    .replace(/复合茶/g, '茶')
    .replace(/天然矿泉水/g, '矿泉水')
    .replace(/纯净水/g, '水')
    .replace(/瓶装/g, '')
    .replace(/植物/g, '')
    .replace(/水果牛奶/g, '')
    .replace(/非标品如上架造成损失自行承担/g, '');
}

function uniqueChars(value) {
  return Array.from(new Set(String(value || '').split(''))).filter(Boolean);
}
function coverage(needle, haystack) {
  const chars = uniqueChars(needle);
  if (!chars.length || !haystack) return 0;
  return chars.filter(c => haystack.includes(c)).length / chars.length;
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
  const a = bigrams(left); const b = bigrams(right);
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
  if (start < 0 || end < start) throw new Error(`bad wrangler output: ${text.slice(0, 400)}`);
  return JSON.parse(text.slice(start, end + 1));
}
function runD1Query(sql) {
  const file = join(outputDir, `_q-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(file, String(sql).replace(/\s+/g, ' ').trim());
  const escaped = file.replace(/'/g, "''");
  const raw = execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `$sql = Get-Content -LiteralPath '${escaped}' -Raw; & npx wrangler d1 execute v3-vending-inventory-sales-db --remote --json --command $sql`
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 40 });
  return parseWranglerJson(raw).flatMap(item => item.results || []);
}

const FUZZY_THRESHOLD = 0.6;

function main() {
  console.log('Loading data...');
  const negatives = runD1Query(`
    SELECT b.product_id AS id, b.machine_id, b.quantity_on_hand AS qty,
           b.total_purchase_qty AS purchase_qty,
           b.total_purchase_cost_cents AS purchase_cost,
           p.name, p.normalized_name, p.external_id, p.created_at
    FROM inventory_balances b
    JOIN products p ON p.id = b.product_id
    WHERE b.quantity_on_hand < 0
    ORDER BY b.machine_id, p.name
  `);
  const allProducts = runD1Query(`
    SELECT p.id, p.machine_id, p.name, p.normalized_name, p.external_id, p.created_at,
           COALESCE(b.quantity_on_hand, 0) AS qty,
           COALESCE(b.total_purchase_qty, 0) AS purchase_qty,
           COALESCE(b.total_purchase_cost_cents, 0) AS purchase_cost
    FROM products p
    LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.machine_id = p.machine_id
    WHERE p.status = 'active'
  `);
  console.log(`  negatives: ${negatives.length}`);
  console.log(`  active products: ${allProducts.length}`);

  const negativeIds = new Set(negatives.map(n => n.id));
  const candidatesByMachine = new Map();
  for (const p of allProducts) {
    if (negativeIds.has(p.id)) continue;
    if (!candidatesByMachine.has(p.machine_id)) candidatesByMachine.set(p.machine_id, []);
    candidatesByMachine.get(p.machine_id).push(p);
  }

  const matches = [];
  for (const neg of negatives) {
    const pool = candidatesByMachine.get(neg.machine_id) || [];
    const scored = pool.map(c => ({ c, score: nameScore(neg.name, c.name) }))
      .filter(x => x.score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    matches.push({ neg, candidates: scored });
  }

  console.log('\n— 候选清单 —\n');
  for (const m of matches) {
    const n = m.neg;
    console.log(`[${n.machine_id}] ${n.name}`);
    console.log(`  qty=${n.qty} purchaseQty=${n.purchase_qty} purchaseCost=${n.purchase_cost}  id=${n.id}`);
    if (m.candidates.length === 0) {
      console.log(`  (无候选)\n`);
      continue;
    }
    for (const cand of m.candidates) {
      const c = cand.c;
      console.log(`  ${cand.score.toFixed(2)}  qty=${c.qty} pQty=${c.purchase_qty} pCost=${c.purchase_cost}  ${c.name}  [${c.id}]`);
    }
    console.log('');
  }

  writeFileSync(join(outputDir, 'negative-stock-candidates.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), matches }, null, 2));
  console.log(`Wrote: ${join(outputDir, 'negative-stock-candidates.json')}`);
}

main();
