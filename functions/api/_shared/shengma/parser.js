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

function blocksByClass(html, className) {
  const source = String(html || '');
  const blocks = [];
  const pattern = /<([a-z][\w:-]*)\b[^>]*\bclass=["']([^"']*)["'][^>]*>/gi;
  for (const match of source.matchAll(pattern)) {
    const tag = match[1].toLowerCase();
    if (!match[2].split(/\s+/).includes(className)) continue;
    const start = match.index;
    let cursor = start + match[0].length;
    let depth = 1;
    const openPattern = new RegExp(`<${tag}\\b`, 'i');
    const closePattern = new RegExp(`</${tag}>`, 'i');
    while (depth > 0) {
      const rest = source.slice(cursor);
      const nextOpen = rest.search(openPattern);
      const nextClose = rest.search(closePattern);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor += nextOpen + tag.length + 1;
      } else {
        depth -= 1;
        cursor += nextClose + tag.length + 3;
      }
    }
    if (depth === 0) blocks.push(source.slice(start, cursor));
  }
  return blocks;
}

function uniqueBlocks(blocks) {
  return [...new Set(blocks.filter(Boolean))];
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

function firstClassValue(html, classNames) {
  for (const className of classNames) {
    const value = firstClassText(html, className);
    if (value) return value;
  }
  return '';
}

function attrValue(html, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)`, 'i');
  return String(html || '').match(pattern)?.[1] || '';
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

function firstLabelValue(text, labels, nextLabels) {
  for (const label of labels) {
    const value = labelValue(text, label, nextLabels);
    if (value) return value;
  }
  return '';
}

function candidateItemBlocks(html) {
  return uniqueBlocks([
    ...blocksByClass(html, 'item'),
    ...blocksByClass(html, 'list-item'),
    ...blocksByClass(html, 'goods-item'),
    ...blocksByClass(html, 'goods-card'),
    ...blocksByClass(html, 'product-item'),
    ...blocksByClass(html, 'cell')
  ]);
}

function parseGoodsCards(html) {
  const labels = [
    '商品名称',
    '商品名',
    '商品',
    '货道编号',
    '货道名称',
    '货道',
    '库存数量',
    '当前库存',
    '库存',
    '余量',
    '售价',
    '销售价',
    '价格',
    '单价',
    '状态'
  ];

  return candidateItemBlocks(html)
    .filter(block => /货道|商品|库存|余量|售价|价格|goods-name|stock|huodao/i.test(block))
    .map((block) => {
      const text = stripTags(block);
      const aisleBlock = blocksByClass(block, 'huodao')[0] || '';
      const vendorAisleCode = attrValue(block, 'huodao')
        || firstClassValue(aisleBlock, ['value', 'num'])
        || firstLabelValue(text, ['货道编号', '货道名称', '货道'], labels).split(/\s+/)[0]
        || '';
      const productName = firstClassValue(block, ['goods-name', 'goods-name2', 'product-name', 'name'])
        || firstLabelValue(text, ['商品名称', '商品名', '商品'], labels);
      const stockBlock = blocksByClass(block, 'stock')[0] || block;
      const qty = parseInteger(firstClassValue(stockBlock, ['value', 'num', 'stock-value']))
        ?? parseInteger(firstLabelValue(text, ['库存数量', '当前库存', '库存', '余量'], labels));
      const priceBlock = blocksByClass(block, 'top')[0] || block;
      const sellPriceCents = parseMoney(firstClassValue(priceBlock, ['price', 'sell-price', 'sale-price']))
        ?? parseMoney(firstLabelValue(text, ['售价', '销售价', '价格', '单价'], labels));
      if (!productName || qty === null || sellPriceCents === null) return null;
      return {
        vendorAisleCode: vendorAisleCode || null,
        vendorProductName: productName,
        qty,
        sellPriceCents,
        hidden: /隐藏|已隐藏|display\s*:\s*none/i.test(`${block} ${text}`),
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
  const labels = [
    '商品名称',
    '商品名',
    '商品',
    '货道编号',
    '货道名称',
    '货道',
    '当前进价',
    '进价',
    '成本',
    '成本价'
  ];

  return candidateItemBlocks(html)
    .filter(block => /进价|成本|curr-jinjia|cost_price|cost/i.test(block))
    .map((block) => {
      const text = stripTags(block);
      const aisleBlock = blocksByClass(block, 'huodao')[0] || '';
      const vendorAisleCode = attrValue(block, 'huodao')
        || firstClassValue(aisleBlock, ['num', 'value'])
        || firstLabelValue(text, ['货道编号', '货道名称', '货道'], labels).split(/\s+/)[0]
        || null;
      const productName = firstClassValue(block, ['goods-name', 'goods-name2', 'product-name', 'goods', 'name'])
        || firstLabelValue(text, ['商品名称', '商品名', '商品'], labels);
      const costBlock = blocksByClass(block, 'curr-jinjia')[0]
        || blocksByClass(block, 'cost_price')[0]
        || block;
      const costCents = parseMoney(firstClassValue(costBlock, ['value', 'price', 'cost']))
        ?? parseMoney(firstLabelValue(text, ['当前进价', '进价', '成本价', '成本'], labels));
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

function unitCostFromLineCost(lineCostCents, quantity) {
  if (lineCostCents === null || lineCostCents === undefined) return null;
  return Math.round((Number(lineCostCents) || 0) / Math.max(1, Number(quantity) || 1));
}

function parseSalesCards(html) {
  const labels = [
    '设备名称',
    '订单号码',
    '订单号',
    '出货详情',
    '交易时间',
    '进价',
    '成本',
    '商品名称',
    '商品',
    '货道',
    '数量',
    '金额',
    '实收金额',
    '立即退款'
  ];

  return candidateItemBlocks(html)
    .filter(block => /订单号码|订单号|交易时间|出货详情|已支付|已出货/.test(stripTags(block)))
    .map((block) => {
      const text = stripTags(block);
      const headBlock = blocksByClass(block, 'head')[0] || '';
      const productName = firstClassValue(headBlock || block, ['goods-name2', 'goods-name', 'product-name', 'goods', 'name'])
        || firstLabelValue(text, ['商品名称', '商品'], labels);
      const amountCents = parseMoney(firstClassValue(headBlock || block, ['price', 'amount', 'money']))
        ?? parseMoney(firstLabelValue(text, ['实收金额', '金额'], labels));
      const vendorOrderNo = firstLabelValue(text, ['订单号码', '订单号'], labels).split(/\s+/)[0] || '';
      const footBlock = blocksByClass(block, 'foot')[0] || '';
      const numBlock = blocksByClass(footBlock || block, 'num')[0] || '';
      const quantity = parseInteger(firstClassValue(numBlock, ['value', 'num']))
        ?? parseInteger(firstLabelValue(text, ['数量'], labels))
        ?? 1;
      const lineCostCents = parseMoney(firstLabelValue(text, ['进价', '成本'], labels));
      const costCents = unitCostFromLineCost(lineCostCents, quantity);
      const date = firstDate([firstLabelValue(text, ['交易时间'], labels)]);
      const shipmentText = firstLabelValue(text, ['出货详情'], labels);
      const statusText = `${stripTags(headBlock)} ${shipmentText || text}`;

      if (!vendorOrderNo || !productName || amountCents === null) return null;
      return {
        vendorOrderNo,
        vendorProductName: productName,
        quantity: Math.max(1, quantity),
        amountCents,
        costCents,
        lineCostCents,
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
    const lineCostCents = parseMoney(cellAt(cells, ['进价', '成本']));
    const costCents = unitCostFromLineCost(lineCostCents, quantity);
    const date = firstDate(cells);

    if (!vendorOrderNo || !productName || amountCents === null) continue;
    sales.push({
      vendorOrderNo,
      vendorProductName: productName,
      quantity: Math.max(1, quantity),
      amountCents,
      costCents,
      lineCostCents,
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

  if (/turnPage\s*\(\s*(\d+)\s*\)\s*["']?\s*>\s*下一页/.test(source)) return true;
  if (/下一页|下页/.test(text)) return true;
  if (new RegExp(`(?:第|页码|pageno|pageNo|data-page)\\s*["'=:\\- ]*${currentPage + 1}\\b`, 'i').test(source)) return true;
  const pageMatches = [...text.matchAll(/(?:共|总)\s*(\d+)\s*页/g)];
  const totalPages = pageMatches.map(match => Number(match[1])).filter(Number.isFinite).pop();
  return totalPages ? currentPage < totalPages : false;
}
