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
  const env = {
    ...process.env,
    // wrangler 的 OAuth token 存在 %APPDATA%/xdg.config/.wrangler/config/default.toml
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || `${process.env.APPDATA}/xdg.config`
  };
  const raw = execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `$sql = Get-Content -LiteralPath '${escaped}' -Raw; & npx wrangler d1 execute v3-vending-inventory-sales-db --remote --json --command $sql`
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 40, env });
  return parseWranglerJson(raw).flatMap(item => item.results || []);
}

function main() {
  console.log('Loading inventory_balances...');
  const balances = runD1Query(`
    SELECT b.product_id, b.machine_id,
           b.quantity_on_hand AS qty,
           b.total_purchase_qty AS purchase_qty_cache,
           b.total_purchase_cost_cents AS purchase_cost_cache,
           b.inventory_value_cents AS inventory_value_cache,
           p.name, p.status
    FROM inventory_balances b
    JOIN products p ON p.id = b.product_id
  `);
  console.log(`  rows: ${balances.length}`);

  console.log('Loading stock_movements aggregates...');
  // 把每条 movement 按"实际净影响"聚合：void 会反向抵消被作废的那条
  const movementAgg = runD1Query(`
    WITH effective AS (
      SELECT
        m.product_id, m.machine_id,
        CASE WHEN m.movement_type='void' THEN voided.movement_type ELSE m.movement_type END AS effective_type,
        m.qty_delta,
        m.movement_type AS raw_type
      FROM stock_movements m
      LEFT JOIN stock_movements voided ON voided.id = m.voids_movement_id
    )
    SELECT product_id, machine_id, effective_type,
           SUM(qty_delta) AS qty_sum,
           COUNT(*) AS cnt
    FROM effective
    GROUP BY product_id, machine_id, effective_type
  `);
  // 拼成 map: key = `${pid}|${mid}` -> { purchase, sale, loss, refund, adjustment, total }
  const moveByKey = new Map();
  for (const r of movementAgg) {
    const k = `${r.product_id}|${r.machine_id}`;
    if (!moveByKey.has(k)) moveByKey.set(k, {
      purchase: 0, sale: 0, loss: 0, refund: 0, adjustment: 0, other: 0, total: 0
    });
    const o = moveByKey.get(k);
    const t = r.effective_type;
    const v = Number(r.qty_sum) || 0;
    if (t === 'purchase') o.purchase += v;
    else if (t === 'sale') o.sale += v;
    else if (t === 'loss') o.loss += v;
    else if (t === 'refund') o.refund += v;
    else if (t === 'adjustment') o.adjustment += v;
    else o.other += v;
    o.total += v;
  }

  console.log('Loading purchase_items aggregates...');
  const piAgg = runD1Query(`
    SELECT pi.product_id, po.machine_id,
           SUM(pi.quantity) AS qty,
           SUM(pi.total_cost_cents) AS cost
    FROM purchase_items pi
    JOIN purchase_orders po ON po.id = pi.purchase_id
    WHERE po.voided_at IS NULL
    GROUP BY pi.product_id, po.machine_id
  `);
  const piByKey = new Map(piAgg.map(r => [`${r.product_id}|${r.machine_id}`, r]));

  console.log('\n=== 核对：进货数量 vs 库存 + 出库 ===\n');

  const mismatches = [];
  for (const b of balances) {
    const k = `${b.product_id}|${b.machine_id}`;
    const m = moveByKey.get(k) || { purchase: 0, sale: 0, loss: 0, refund: 0, adjustment: 0, other: 0, total: 0 };
    const pi = piByKey.get(k) || { qty: 0, cost: 0 };

    // 出库 = 销售(负) + 报损(负) + 退货(正) + 调整(可正可负) + 其它
    const outflowsSigned = m.sale + m.loss + m.refund + m.adjustment + m.other; // 通常为负
    const expectedQty = m.purchase + outflowsSigned; // = total qty_delta
    const qtyFromCache = Number(b.qty) || 0;

    // 三组对比
    const ledgerVsCacheQty = Math.abs(qtyFromCache - expectedQty);          // 缓存当前库存 vs 流水净额
    const ledgerVsCachePurchase = Math.abs(Number(b.purchase_qty_cache || 0) - m.purchase); // 缓存进货 vs 流水进货
    const piVsCachePurchase = Math.abs(Number(b.purchase_qty_cache || 0) - Number(pi.qty || 0)); // 缓存进货 vs purchase_items 源数据

    if (ledgerVsCacheQty > 0 || ledgerVsCachePurchase > 0 || piVsCachePurchase > 0) {
      mismatches.push({
        machine_id: b.machine_id,
        name: b.name,
        status: b.status,
        product_id: b.product_id,
        cache_qty: qtyFromCache,
        ledger_net_qty: expectedQty,
        cache_purchase: Number(b.purchase_qty_cache || 0),
        ledger_purchase: m.purchase,
        pi_purchase: Number(pi.qty || 0),
        purchase_minus_outflow: m.purchase - Math.abs(outflowsSigned), // 直观值，仅供参考
        sale: m.sale, loss: m.loss, refund: m.refund, adjustment: m.adjustment, other: m.other,
        diff_cache_vs_ledger_qty: qtyFromCache - expectedQty,
        diff_cache_vs_ledger_purchase: Number(b.purchase_qty_cache || 0) - m.purchase,
        diff_pi_vs_cache_purchase: Number(pi.qty || 0) - Number(b.purchase_qty_cache || 0)
      });
    }
  }

  // 也找一下：在 purchase_items 里出现，但 inventory_balances 里没记录的产品（可能是合并/删除后丢失）
  const balanceKeys = new Set(balances.map(b => `${b.product_id}|${b.machine_id}`));
  const orphanedPi = [];
  for (const r of piAgg) {
    const k = `${r.product_id}|${r.machine_id}`;
    if (!balanceKeys.has(k)) orphanedPi.push(r);
  }

  console.log(`总 SKU 数：${balances.length}`);
  console.log(`不一致 SKU 数：${mismatches.length}`);
  console.log(`purchase_items 里有、inventory_balances 里却没有的 SKU：${orphanedPi.length}`);

  // 按机台总览：把"历史进货 = 当前库存 + 累计出库"这条恒等式直观展示
  const byMachine = new Map();
  for (const b of balances) {
    const k = `${b.product_id}|${b.machine_id}`;
    const m = moveByKey.get(k) || { purchase: 0, sale: 0, loss: 0, refund: 0, adjustment: 0, other: 0, total: 0 };
    if (!byMachine.has(b.machine_id)) byMachine.set(b.machine_id, {
      sku_count: 0, purchase_qty: 0, qty_on_hand: 0,
      sale_qty: 0, loss_qty: 0, refund_qty: 0, adj_qty: 0
    });
    const o = byMachine.get(b.machine_id);
    o.sku_count += 1;
    o.purchase_qty += m.purchase;
    o.qty_on_hand += Number(b.qty) || 0;
    o.sale_qty += Math.abs(m.sale);
    o.loss_qty += Math.abs(m.loss);
    o.refund_qty += m.refund; // refund 是正数（退回库存）
    o.adj_qty += m.adjustment;
  }

  console.log('\n— 按机台总览（恒等式：历史进货 = 当前库存 + 销售 + 报损 − 退货 − 调整） —');
  for (const [mid, s] of byMachine.entries()) {
    const restored = s.qty_on_hand + s.sale_qty + s.loss_qty - s.refund_qty - s.adj_qty;
    const diff = restored - s.purchase_qty;
    const tag = diff === 0 ? '✓' : '✗';
    console.log(`${tag} [${mid}] SKU=${s.sku_count}`);
    console.log(`    历史进货=${s.purchase_qty}  当前库存=${s.qty_on_hand}  销售=${s.sale_qty}  报损=${s.loss_qty}  退货=${s.refund_qty}  调整=${s.adj_qty}`);
    console.log(`    还原值=${restored}  Δ=${diff}`);
  }

  if (mismatches.length > 0) {
    console.log('\n— 不一致明细 —');
    console.log('字段说明：');
    console.log('  cache_qty=balances.quantity_on_hand');
    console.log('  ledger_net_qty=stock_movements 全部 qty_delta 之和（应=cache_qty）');
    console.log('  cache_purchase=balances.total_purchase_qty');
    console.log('  ledger_purchase=stock_movements 中 purchase 类型 qty_delta 之和');
    console.log('  pi_purchase=purchase_items 表中累计进货数量\n');

    // 排序：差异大的在前
    mismatches.sort((a, b) => {
      const sa = Math.abs(a.diff_cache_vs_ledger_qty) + Math.abs(a.diff_cache_vs_ledger_purchase) + Math.abs(a.diff_pi_vs_cache_purchase);
      const sb = Math.abs(b.diff_cache_vs_ledger_qty) + Math.abs(b.diff_cache_vs_ledger_purchase) + Math.abs(b.diff_pi_vs_cache_purchase);
      return sb - sa;
    });

    for (const m of mismatches) {
      console.log(`[${m.machine_id}] ${m.name}  (${m.status})`);
      console.log(`  cache_qty=${m.cache_qty}  ledger_net_qty=${m.ledger_net_qty}  Δ=${m.diff_cache_vs_ledger_qty}`);
      console.log(`  cache_purchase=${m.cache_purchase}  ledger_purchase=${m.ledger_purchase}  pi_purchase=${m.pi_purchase}`);
      console.log(`  Δ(cache vs ledger purchase)=${m.diff_cache_vs_ledger_purchase}  Δ(pi vs cache purchase)=${m.diff_pi_vs_cache_purchase}`);
      console.log(`  movements: sale=${m.sale} loss=${m.loss} refund=${m.refund} adj=${m.adjustment} other=${m.other}`);
      console.log(`  id=${m.product_id}\n`);
    }
  } else {
    console.log('\n✓ 所有 SKU 的 进货 / 库存 / 流水 三者完全对齐');
  }

  if (orphanedPi.length > 0) {
    console.log('\n— purchase_items 有进货但 inventory_balances 没记录 —');
    for (const r of orphanedPi) {
      console.log(`  [${r.machine_id}] product_id=${r.product_id}  qty=${r.qty}  cost=${r.cost}`);
    }
  }

  const reportPath = join(outputDir, 'verify-purchase-vs-inventory.json');
  writeFileSync(reportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    summary: {
      total_skus: balances.length,
      mismatch_count: mismatches.length,
      orphaned_purchase_items: orphanedPi.length
    },
    mismatches,
    orphanedPi
  }, null, 2));
  console.log(`\nWrote: ${reportPath}`);
}

main();
