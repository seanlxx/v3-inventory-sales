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

function divBlocksByClass(html, className) {
  const source = String(html || '');
  const blocks = [];
  const pattern = /<div\b[^>]*\bclass=["']([^"']*)["'][^>]*>/gi;
  for (const match of source.matchAll(pattern)) {
    if (!match[1].split(/\s+/).includes(className)) continue;
    const start = match.index;
    let cursor = start + match[0].length;
    let depth = 1;
    while (depth > 0) {
      const nextOpen = source.slice(cursor).search(/<div\b/i);
      const nextClose = source.slice(cursor).search(/<\/div>/i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor += nextOpen + 4;
      } else {
        depth -= 1;
        cursor += nextClose + 6;
      }
    }
    if (depth === 0) blocks.push(source.slice(start, cursor));
  }
  return blocks;
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

function firstClassText(html, className) {
  const pattern = new RegExp(`<[^>]+\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
  return stripTags(String(html || '').match(pattern)?.[1] || '');
}

function attrValue(html, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)`, 'i');
  return String(html || '').match(pattern)?.[1] || '';
}

function parseGoodsCards(html) {
  return divBlocksByClass(html, 'item')
    .filter(block => /\bhuodao\s*=|goods-name|stock/i.test(block))
    .map((block) => {
      const vendorAisleCode = attrValue(block, 'huodao') || firstClassText(firstClassText(block, 'huodao') ? block : '', 'value');
      const productName = firstClassText(firstClassText(block, 'goods-name') ? block : '', 'goods-name');
      const priceHtml = divBlocksByClass(block, 'top')[0] || block;
      const sellPriceCents = parseMoney(firstClassText(priceHtml, 'price'));
      const stockHtml = divBlocksByClass(block, 'stock')[0] || '';
      const qty = parseInteger(firstClassText(stockHtml, 'value'));
      if (!productName || qty === null || sellPriceCents === null) return null;
      return {
        vendorAisleCode: vendorAisleCode || null,
        vendorProductName: productName,
        qty,
        sellPriceCents,
        hidden: /隐藏|已隐藏/i.test(stripTags(block)),
        raw: [vendorAisleCode, productName, String(qty), String(sellPriceCents / 100)]
      };
    })
    .filter(Boolean);
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
  return result.length > 0 ? result : parseGoodsCards(html);
}

function parseCostCards(html) {
  return divBlocksByClass(html, 'item')
    .filter(block => /curr-jinjia|cost_price|当前进价/i.test(block))
    .map((block) => {
      const vendorAisleCode = firstClassText(firstClassText(block, 'huodao') ? block : '', 'num')
        || stripTags(divBlocksByClass(block, 'huodao')[0] || '').match(/\d+/)?.[0]
        || null;
      const productName = firstClassText(block, 'goods');
      const costHtml = divBlocksByClass(block, 'curr-jinjia')[0] || block;
      const costCents = parseMoney(firstClassText(costHtml, 'value'));
      if (!productName || costCents === null) return null;
      return {
        vendorAisleCode,
        vendorProductName: productName,
        costCents,
        raw: [vendorAisleCode, productName, String(costCents / 100)]
      };
    })
    .filter(Boolean);
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
  return costs.length > 0 ? costs : parseCostCards(html);
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
