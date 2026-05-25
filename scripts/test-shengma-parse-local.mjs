import { readFile } from 'node:fs/promises';
import { parseGoods, parseCosts, parseSales, hasNextSalesPage } from '../functions/api/_shared/shengma/parser.js';
import { aggregateInventory } from '../functions/api/_shared/shengma/mapper.js';

const dir = 'output/codex-vendor-probe/responses';
const goodsHtml = await readFile(`${dir}/goods.html`, 'utf-8');
const costsHtml = await readFile(`${dir}/setJinjia.html`, 'utf-8');
const salesP1 = await readFile(`${dir}/salesAll-may-p1.html`, 'utf-8');
const salesP2 = await readFile(`${dir}/salesAll-may-p2.html`, 'utf-8');

const goods = parseGoods(goodsHtml);
const costs = parseCosts(costsHtml);
const sales1 = parseSales(salesP1);
const sales2 = parseSales(salesP2);

console.log('goods rows:', goods.length, 'first:', goods[0]);
console.log('costs rows:', costs.length, 'first:', costs[0]);
console.log('sales p1 rows:', sales1.length);
console.log('sales p1 first:', sales1[0]);
console.log('sales p1 paidShipped count:', sales1.filter(s => s.paidShipped).length);
console.log('sales p2 rows:', sales2.length);
console.log('hasNext p1:', hasNextSalesPage(salesP1, 1));
console.log('hasNext p2:', hasNextSalesPage(salesP2, 2));

const warnings = [];
const agg = aggregateInventory(goods, costs, warnings);
console.log('aggregated products:', agg.length);
console.log('first 5 products:', agg.slice(0, 5).map(g => ({ name: g.vendorProductName, qty: g.qty, sellPriceCents: g.sellPriceCents, costCents: g.costCents })));
console.log('warnings sample:', warnings.slice(0, 3), 'total:', warnings.length);
