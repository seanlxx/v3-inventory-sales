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
    const classes = match[1].split(/\s+/);
    if (!classes.includes(className)) continue;
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
  const refundText = text.replace(/未退款|无退款|未退|立即退款|申请退款/g, ' ');
  const refunded = /已退款|退款成功|退款完成|已退|异常|失败|取消/.test(refundText);
  return paid && shipped && !refunded;
}

function firstDate(cells) {
  const text = cells.join(' ');
  const match = text.match(/\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?/);
  return match ? match[0].replace(/\b(\d)\b/g, '0$1') : '';
}

function labelValue(text, label, nextLabels) {
  const index = text.indexOf(label);
  if (index === -1) return '';
  let rest = text.slice(index + label.length).replace(/^[\s:：]+/, '');
  const nextIndexes = nextLabels
    .filter(nextLabel => nextLabel !== label)
    .map(nextLabel => rest.indexOf(nextLabel))
    .filter(nextIndex => nextIndex > 0);
  if (nextIndexes.length > 0) {
    rest = rest.slice(0, Math.min(...nextIndexes));
  }
  return rest.trim();
}

function parseSalesCards(html) {
  const labels = [
    '设备名称',
    '订单号码',
    '出货详情',
    '交易时间',
    '进价',
    '商品名称',
    '货道',
    '数量',
    '立即退款'
  ];

  const blocks = [
    ...divBlocksByClass(html, 'list-item'),
    ...divBlocksByClass(html, 'item')
  ];

  return Array.from(new Set(blocks))
    .filter(block => /订单号码|交易时间|出货详情/.test(stripTags(block)))
    .map((block) => {
      const text = stripTags(block);

      const headBlock = divBlocksByClass(block, 'head')[0] || '';
      const titleBlock = divBlocksByClass(block, 'title')[0] || '';
      const goodsNameBlock = divBlocksByClass(headBlock || block, 'goods-name2')[0] || '';
      const productNameFromLink = stripTags(goodsNameBlock).trim();
      const productNameFromTitle = stripTags(titleBlock)
        .split(/\s+/)
        .filter(part => !/^-?\d+(?:\.\d+)?$|已支付|未支付|支付|出货|退款/.test(part))[0] || '';
      const productName = (productNameFromLink || labelValue(text, '商品名称', labels) || productNameFromTitle)
        .replace(/[>›]+$/g, '')
        .trim();

      const amountCents = parseMoney(firstClassText(headBlock || block, 'price'))
        ?? parseMoney(stripTags(titleBlock).match(/-?\d+(?:\.\d+)?/)?.[0])
        ?? parseMoney(labelValue(text, '金额', labels));

      const vendorOrderNo = labelValue(text, '订单号码', labels).split(/\s+/)[0] || '';

      const footBlock = divBlocksByClass(block, 'foot')[0] || '';
      const numBlock = divBlocksByClass(footBlock || block, 'num')[0] || '';
      const quantityFromBlock = parseInteger(firstClassText(numBlock, 'value'));
      const quantity = quantityFromBlock
        ?? parseInteger(text.match(/数量\s*[:：]?\s*(-?\d+)/)?.[1])
        ?? 1;

      const costCents = parseMoney(labelValue(text, '进价', labels));
      const date = firstDate([labelValue(text, '交易时间', labels)]);

      const headerText = `${stripTags(headBlock)} ${stripTags(titleBlock)}`;
      const shipmentText = labelValue(text, '出货详情', labels);
      const statusText = `${headerText} ${shipmentText}`;

      if (!vendorOrderNo || !productName || amountCents === null) return null;
      return {
        vendorOrderNo,
        vendorProductName: productName,
        quantity: Math.max(1, quantity),
        amountCents,
        costCents,
        date: date ? date.slice(0, 10) : '',
        paidShipped: looksPaidShipped([statusText]),
        raw: [text]
      };
    })
    .filter(Boolean);
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
  return sales.length > 0 ? sales : parseSalesCards(html);
}

export function hasNextSalesPage(html, currentPage) {
  const text = stripTags(html);
  const source = String(html || '');

  const totalCountMatch = text.match(/共计\s*(\d+)\s*条/) || source.match(/共计\s*<span[^>]*>\s*(\d+)\s*<\/span>\s*条/i);
  if (totalCountMatch) {
    const total = Number(totalCountMatch[1]);
    if (Number.isFinite(total)) {
      const totalPages = Math.max(1, Math.ceil(total / 40));
      return currentPage < totalPages;
    }
  }

  if (/turnPage\s*\(\s*(\d+)\s*\)\s*"\s*>\s*下一页/.test(source)) return true;
  if (new RegExp(`下一页|下页|>${currentPage + 1}<`).test(source)) return true;

  const pageMatches = [...text.matchAll(/(?:共|总)\s*(\d+)\s*页/g)];
  const totalPages = pageMatches.map(match => Number(match[1])).filter(Number.isFinite).pop();
  return totalPages ? currentPage < totalPages : false;
}
