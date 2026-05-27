import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const outputDir = join(projectRoot, 'output', 'merge-products');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

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

function main() {
  const negatives = runD1Query(`
    SELECT b.product_id AS id, b.machine_id, b.quantity_on_hand AS qty,
           b.total_purchase_qty AS purchase_qty,
           b.total_purchase_cost_cents AS purchase_cost,
           p.name, p.normalized_name, p.external_id
    FROM inventory_balances b
    JOIN products p ON p.id = b.product_id
    WHERE b.quantity_on_hand < 0
  `);
  const negIds = negatives.map(n => `'${n.id}'`).join(',');

  const negStats = runD1Query(`
    SELECT product_id,
           SUM(CASE WHEN movement_type='sale'     THEN ABS(qty_delta) ELSE 0 END) AS sale_qty,
           SUM(CASE WHEN movement_type='purchase' THEN qty_delta      ELSE 0 END) AS purch_qty,
           SUM(CASE WHEN movement_type='loss'     THEN ABS(qty_delta) ELSE 0 END) AS loss_qty,
           SUM(CASE WHEN movement_type='refund'   THEN qty_delta      ELSE 0 END) AS refund_qty,
           MIN(created_at) AS first_mv,
           MAX(created_at) AS last_mv,
           COUNT(*) AS mv_count
    FROM stock_movements
    WHERE product_id IN (${negIds})
    GROUP BY product_id
  `);
  const negStatMap = new Map(negStats.map(r => [r.product_id, r]));

  // 同机上所有 active 产品 + 它们的购销活跃度
  const allActive = runD1Query(`
    SELECT p.id, p.machine_id, p.name, p.normalized_name, p.external_id,
           COALESCE(b.quantity_on_hand,0) AS qty,
           COALESCE(b.total_purchase_qty,0) AS purch_qty,
           COALESCE(b.total_purchase_cost_cents,0) AS purch_cost
    FROM products p
    LEFT JOIN inventory_balances b ON b.product_id=p.id AND b.machine_id=p.machine_id
    WHERE p.status='active'
  `);
  const negIdSet = new Set(negatives.map(n => n.id));

  // 关键 token 提取（去掉规格符号，留中文与数字）
  function tokens(name) {
    const text = String(name || '')
      .replace(/[（）()【】[\]]/g, '')
      .replace(/[ml毫升克升gG]/g, '')
      .replace(/[0-9.]+/g, '')
      .toLowerCase();
    return new Set(text.split('').filter(c => /[一-龥a-z]/.test(c)));
  }
  function specSig(name) {
    // 提取规格信号：(数字)(单位)
    const matches = String(name || '').toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(ml|毫升|l|升|g|克)/g);
    return Array.from(matches).map(m => {
      let n = parseFloat(m[1]);
      let u = m[2];
      if (u === '毫升') u = 'ml';
      if (u === '升') u = 'l';
      if (u === '克') u = 'g';
      if (u === 'l') { n *= 1000; u = 'ml'; }
      return `${n}${u}`;
    }).sort();
  }

  const overlap = (a, b) => {
    const inter = [...a].filter(x => b.has(x)).length;
    return inter / Math.max(a.size, b.size, 1);
  };

  console.log('=== 负库存核对 ===\n');
  for (const n of negatives) {
    const stat = negStatMap.get(n.id) || {};
    const negTok = tokens(n.name);
    const negSpec = specSig(n.name);
    console.log(`[${n.machine_id}] ${n.name}`);
    console.log(`  qty=${n.qty} purch=${n.purchase_qty}件/${n.purchase_cost}分 sale=${stat.sale_qty || 0} loss=${stat.loss_qty || 0} refund=${stat.refund_qty || 0}`);
    console.log(`  bcode=${n.external_id || '-'}  norm=${n.normalized_name || '-'}  spec=${negSpec.join(',') || '-'}  id=${n.id}`);

    const sameMachine = allActive.filter(p => p.machine_id === n.machine_id && !negIdSet.has(p.id));
    const cands = sameMachine.map(c => {
      const cTok = tokens(c.name);
      const ov = overlap(negTok, cTok);
      const cSpec = specSig(c.name);
      const specMatch = negSpec.length === 0 || cSpec.length === 0
        ? null
        : negSpec.join(',') === cSpec.join(',');
      return { c, overlap: ov, specMatch, cSpec };
    }).filter(x => x.overlap >= 0.55)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5);

    if (!cands.length) {
      console.log(`  → 无候选\n`);
      continue;
    }
    for (const cd of cands) {
      const tag = cd.specMatch === true ? '✓spec' : cd.specMatch === false ? '✗spec' : '~spec';
      console.log(`  ov=${cd.overlap.toFixed(2)} ${tag} ${cd.cSpec.join(',') || '-'} | qty=${cd.c.qty} pQty=${cd.c.purch_qty} pCost=${cd.c.purch_cost}`);
      console.log(`         ${cd.c.name}  bcode=${cd.c.external_id || '-'} [${cd.c.id}]`);
    }
    console.log('');
  }
}

main();
