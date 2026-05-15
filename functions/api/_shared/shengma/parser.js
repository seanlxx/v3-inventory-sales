function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableRows(html) {
  return [...String(html || '').matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
    .map(match => match[0])
    .map(rowHtml => ({
      html: rowHtml,
      cells: [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => stripTags(cell[1]))
    }))
    .filter(row => row.cells.length > 0);
}

function parseMoney(text) {
  const match = String(text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function parseInteger(text) {
  const match = String(text || '').replace(/,/g, '').match(/-?\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function cellAt(cells, names, fallbackIndex = -1) {
  const headers = cells.map(cell => cell.toLowerCase());
  for (const name of names) {
    const index = headers.findIndex(cell => cell.includes(name.toLowerCase()));
    if (index !== -1 && index + 1 < cells.length) return cells[index + 1];
  }
  return fallbackIndex >= 0 ? cells[fallbackIndex] : '';
}

function rowHidden(row) {
  return /隐藏|已隐藏|display\s*:\s*none/i.test(`${row.html} ${row.cells.join(' ')}`);
}

export function parseGoods(html) {
  const rows = tableRows(html);
  const result = [];
  for (const row of rows) {
    const cells = row.cells;
    const joined = cells.join(' ');
    if (!/货道|商品|库存|售价|价格|余量/.test(joined)) continue;
    if (/商品名称|货道名称|库存数量|售价/.test(joined) && cells.length <= 6) continue;

    const productName = cellAt(cells, ['商品名称', '商品', '名称'], cells.length > 2 ? 2 : 1);
    const qty = parseInteger(cellAt(cells, ['库存', '余量', '数量'], cells.length > 3 ? 3 : -1));
    const sellPriceCents = parseMoney(cellAt(cells, ['售价', '价格', '单价'], cells.length > 4 ? 4 : -1));
    const vendorAisleCode = cellAt(cells, ['货道编号', '货道', '编号'], 0);

    if (!productName || qty === null || sellPriceCents === null) continue;
    result.push({
      vendorAisleCode: vendorAisleCode || null,
      vendorProductName: productName,
      qty,
      sellPriceCents,
      hidden: rowHidden(row),
      raw: cells
    });
  }
  return result;
}

export function parseCosts(html) {
  const rows = tableRows(html);
  const costs = [];
  for (const row of rows) {
    const cells = row.cells;
    const joined = cells.join(' ');
    if (!/进价|成本|商品/.test(joined)) continue;
    if (/商品名称|进价|成本/.test(joined) && cells.length <= 4) continue;

    const productName = cellAt(cells, ['商品名称', '商品', '名称'], cells.length > 1 ? 1 : 0);
    const costCents = parseMoney(cellAt(cells, ['进价', '成本'], cells.length > 2 ? 2 : -1));
    const vendorAisleCode = cellAt(cells, ['货道编号', '货道', '编号'], 0);
    if (!productName || costCents === null) continue;
    costs.push({
      vendorAisleCode: vendorAisleCode || null,
      vendorProductName: productName,
      costCents,
      raw: cells
    });
  }
  return costs;
}

function looksPaidShipped(cells) {
  const text = cells.join(' ');
  const paid = /已支付|支付成功|已付款|成功/.test(text);
  const shipped = /已出货|出货成功|已取货|完成/.test(text);
  const refunded = /退款|已退|异常|失败|取消/.test(text);
  return paid && shipped && !refunded;
}

function firstDate(cells) {
  const text = cells.join(' ');
  const match = text.match(/\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?/);
  return match ? match[0].replace(/\b(\d)\b/g, '0$1') : '';
}

export function parseSales(html) {
  const rows = tableRows(html);
  const sales = [];
  for (const row of rows) {
    const cells = row.cells;
    const joined = cells.join(' ');
    if (!/\d{4}-\d{1,2}-\d{1,2}|订单|支付|出货|商品/.test(joined)) continue;
    if (/订单号|商品名称|支付状态|出货状态/.test(joined) && cells.length <= 8) continue;

    const vendorOrderNo = cellAt(cells, ['订单号', '订单', '流水号'], 0);
    const productName = cellAt(cells, ['商品名称', '商品', '名称'], cells.length > 2 ? 2 : 1);
    const quantity = parseInteger(cellAt(cells, ['数量', '购买数量'], cells.length > 3 ? 3 : -1)) ?? 1;
    const amountCents = parseMoney(cellAt(cells, ['实收', '金额', '成交', '支付'], cells.length > 4 ? 4 : -1));
    const costCents = parseMoney(cellAt(cells, ['进价', '成本']));
    const date = firstDate(cells);

    if (!vendorOrderNo || !productName || amountCents === null) continue;
    sales.push({
      vendorOrderNo,
      vendorProductName: productName,
      quantity: Math.max(1, quantity),
      amountCents,
      costCents,
      date: date ? date.slice(0, 10) : '',
      paidShipped: looksPaidShipped(cells),
      raw: cells
    });
  }
  return sales;
}

export function hasNextSalesPage(html, currentPage) {
  const text = stripTags(html);
  if (new RegExp(`下一页|下页|>${currentPage + 1}<`).test(String(html))) return true;
  const pageMatches = [...text.matchAll(/(?:共|总)\s*(\d+)\s*页/g)];
  const totalPages = pageMatches.map(match => Number(match[1])).filter(Number.isFinite).pop();
  return totalPages ? currentPage < totalPages : false;
}

