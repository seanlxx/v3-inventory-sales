const BLOCKED_KEYWORDS = ['请勿下单', '测试', '勿点'];

export function normalizeProductName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/毫升/gi, 'ml')
    .replace(/克/gi, 'g')
    .replace(/升/gi, 'l')
    .replace(/[（）()【】[\]{}<>《》"'“”‘’、，,。.!！?？:：;；\s_\-—/\\|+*=~`·￥$#@%^&]/g, '')
    .replace(/[^0-9a-z\u4e00-\u9fa5]/g, '');
}

export function shouldIgnoreAisle(item) {
  const name = String(item.vendorProductName || '');
  return !!item.hidden
    || BLOCKED_KEYWORDS.some(keyword => name.includes(keyword))
    || (/^商品\d+$/.test(name) && Number(item.sellPriceCents) >= 99900)
    || Number(item.sellPriceCents) === 99900;
}

function modePrice(values, tie = 'min') {
  const counts = new Map();
  for (const value of values.filter(value => value !== null && value !== undefined)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  if (counts.size === 0) return null;
  const entries = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return tie === 'max' ? right[0] - left[0] : left[0] - right[0];
  });
  return entries[0][0];
}

export function aggregateInventory(goodsRows, costRows, warnings) {
  const costByAisle = new Map();
  const costsByName = new Map();
  for (const cost of costRows) {
    if (cost.vendorAisleCode) costByAisle.set(cost.vendorAisleCode, cost.costCents);
    const normalized = normalizeProductName(cost.vendorProductName);
    if (!costsByName.has(normalized)) costsByName.set(normalized, []);
    costsByName.get(normalized).push(cost.costCents);
  }

  const grouped = new Map();
  for (const row of goodsRows) {
    if (shouldIgnoreAisle(row)) {
      warnings.push(`已忽略货道 ${row.vendorAisleCode || '-'}：${row.vendorProductName}`);
      continue;
    }
    const normalizedName = normalizeProductName(row.vendorProductName);
    if (!normalizedName) continue;
    const costCents = row.vendorAisleCode && costByAisle.has(row.vendorAisleCode)
      ? costByAisle.get(row.vendorAisleCode)
      : modePrice(costsByName.get(normalizedName) || [], 'max');
    const group = grouped.get(normalizedName) || {
      vendorProductName: row.vendorProductName,
      normalizedName,
      qty: 0,
      aisles: [],
      sellPrices: [],
      costs: []
    };
    group.qty += Math.max(0, Number(row.qty) || 0);
    group.aisles.push({ ...row, costCents });
    group.sellPrices.push(row.sellPriceCents);
    if (costCents !== null && costCents !== undefined) group.costs.push({ costCents, qty: Math.max(0, Number(row.qty) || 0) });
    grouped.set(normalizedName, group);
  }

  return [...grouped.values()].map(group => {
    const sellPriceCents = modePrice(group.sellPrices, 'min') ?? 0;
    if (new Set(group.sellPrices).size > 1) {
      warnings.push(`${group.vendorProductName} 多货道售价不一致，已采用出现次数最多/最低售价`);
    }

    const stockedCosts = group.costs.filter(cost => cost.qty > 0);
    let costCents = null;
    if (stockedCosts.length > 0) {
      const totalQty = stockedCosts.reduce((sum, cost) => sum + cost.qty, 0);
      costCents = Math.round(stockedCosts.reduce((sum, cost) => sum + cost.costCents * cost.qty, 0) / totalQty);
    } else {
      costCents = modePrice(group.costs.map(cost => cost.costCents), 'max');
    }
    if (new Set(group.costs.map(cost => cost.costCents)).size > 1) {
      warnings.push(`${group.vendorProductName} 多货道成本不一致，已按库存加权或保守值计算`);
    }

    return {
      ...group,
      sellPriceCents,
      costCents
    };
  });
}
