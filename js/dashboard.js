/**
 * 仪表盘模块
 */

const DASHBOARD_CHART_SERIES = [
  { key: 'amount', label: '销售额', shortLabel: '销售额', unit: 'money', axis: 'left', color: '#3b82f6', fill: true },
  { key: 'cogs', label: '销售成本', shortLabel: '成本', unit: 'money', axis: 'left', color: '#10b981' },
  { key: 'fee', label: '手续费', shortLabel: '手续费', unit: 'money', axis: 'left', color: '#f59e0b' },
  { key: 'profit', label: '净利润', shortLabel: '净利', unit: 'money', axis: 'left', color: '#06b6d4' },
  { key: 'profitRate', label: '利润率', shortLabel: '利率', unit: 'percent', axis: 'right', color: '#8b5cf6', dashed: true }
];

async function renderDashboard() {
  const cached = getPageData('dashboard');
  const liveMonth = getCurrentMonth();
  const useCache = cached && cached.currentMonth === liveMonth && !isPageDirty('dashboard');
  let products, sales, purchases, currentMonth, recentSales, prevSales = [], summary = null;
  const prevMonth = (() => {
    const d = new Date(liveMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  })();
  const businessSettings = await getBusinessSettings();

  if (useCache) {
    ({ products, sales, purchases, currentMonth, recentSales, prevSales = [], summary = null } = cached);
  } else {
    currentMonth = liveMonth;
    [products, sales, purchases, recentSales, prevSales, summary] = await Promise.all([
      getAllProducts(),
      getSalesByMonth(currentMonth),
      getPurchasesByMonth(currentMonth),
      getRecentSales(7),
      getSalesByMonth(prevMonth),
      getSalesSummary({ currentMonth, previousMonth: prevMonth, feeRate: businessSettings.feeRate, includeMonthly: false })
    ]);
  }
  currentMonth = liveMonth;

  // 按售货机分组
  const machines = await getMachines();

  const monthlySales = sales.filter(s => s.yearMonth === currentMonth);
  const currentSummary = summary?.current || {};
  const monthlyRevenue = currentSummary.revenue || 0;
  const monthlyRefunds = currentSummary.refunds || 0;
  const monthlyCogs = currentSummary.cogs || 0;
  const monthlyPurchaseCost = currentSummary.purchaseCost || 0;
  const monthlyFee = currentSummary.fee || 0;
  const monthlyProfit = currentSummary.profit || 0;
  const profitRate = currentSummary.profitRate || 0;

  const prevSummary = summary?.previous || {};
  const prevMonthlyRevenue = prevSummary.revenue || 0;
  const prevMonthlyCogs = prevSummary.cogs || 0;
  const prevMonthlyProfit = prevSummary.profit || 0;
  const revenueMom = calcMoMDelta(monthlyRevenue, prevMonthlyRevenue);
  const cogsMom = calcMoMDelta(monthlyCogs, prevMonthlyCogs);
  const profitMom = calcMoMDelta(monthlyProfit, prevMonthlyProfit);

  // 总库存
  const totalStock = products.reduce((sum, p) => sum + (p.currentStock || 0), 0);
  const activeProducts = products.filter(p => (p.currentStock || 0) > 0).length;
  const inventoryCost = products.reduce((sum, p) => sum + ((p.currentStock || 0) * (p.avgCost || 0)), 0);

  const lowStockProducts = products.filter(p => (p.currentStock || 0) <= businessSettings.lowStockThreshold);

  // 近7天销售趋势
  const recentDays = getRecentDays(7);
  const dailySalesData = recentDays.map(day => {
    const daySales = (recentSales || sales).filter(s => (s.date || '').startsWith(day) && s.type === 'daily');
    const amount = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const cogs = daySales.reduce((sum, s) => sum + (s.totalCogs || 0), 0);
    const fee = Math.round(amount * businessSettings.feeRate * 100) / 100;
    const profit = Math.round((amount - fee - cogs) * 100) / 100;
    return {
      date: day.substring(5),
      amount,
      cogs,
      fee,
      profit,
      profitRate: amount > 0 ? (profit / amount) * 100 : 0,
      count: daySales.length
    };
  });

  if (!useCache) {
    setPageData('dashboard', {
      products,
      sales,
      purchases,
      currentMonth,
      recentSales,
      prevSales,
      summary
    });
    consumePageDirty('dashboard');
  }

  const distributionRows = [
    { label: '销售成本', amount: monthlyCogs, color: '#3b82f6', mom: cogsMom },
    { label: '净利润', amount: monthlyProfit, color: monthlyProfit >= 0 ? '#22c55e' : '#ef4444', mom: profitMom },
    { label: '平台手续费', amount: monthlyFee, color: '#f59e0b' },
    { label: '退款金额', amount: Math.abs(monthlyRefunds), color: '#8b5cf6' }
  ];

  const renderMachineCard = (title, machineProducts) => `
      <div class="machine-card dashboard-machine-card card">
        <div class="card-header">
          <h3 class="card-title">${escapeHtml(title)}</h3>
          <span class="badge">${machineProducts.length} 种商品</span>
        </div>
        <div class="machine-products">
          ${machineProducts.length === 0 ? '<p class="empty-hint">暂无商品，去<a href="#" onclick="navigateTo(\'products\')">商品管理</a>添加</p>' :
    machineProducts.map((p, index) => `
            <div class="product-row ${index >= 5 ? 'product-row-extra' : ''}">
              <span class="product-name">${escapeHtml(p.name)}</span>
              <span class="product-stock ${(p.currentStock || 0) <= businessSettings.lowStockThreshold ? 'low-stock' : ''}">
                ${p.currentStock || 0}件
              </span>
            </div>
          `).join('') + (machineProducts.length > 5 ? `
            <button class="machine-expand-btn btn btn-ghost btn-sm" type="button" onclick="toggleMachineProducts(this)">
              <span class="expand-text">展开全部 ${machineProducts.length} 种商品</span>
              <span class="collapse-text">收起商品</span>
            </button>
          ` : '')}
        </div>
      </div>
  `;

  return `
    <div class="dashboard-page page-stack container-xl">
      <div class="dashboard-kpi-strip">
        <div class="dashboard-kpi-card card">
          <span class="dashboard-kpi-icon">${tablerIcon('currency-yuan')}</span>
          <span class="dashboard-kpi-label">本月销售额</span>
          <strong>${formatMoney(monthlyRevenue)}</strong>
          ${renderDashboardDelta(revenueMom)}
        </div>
        <div class="dashboard-kpi-card card">
          <span class="dashboard-kpi-icon">${tablerIcon('packages')}</span>
          <span class="dashboard-kpi-label">销售成本</span>
          <strong>${formatMoney(monthlyCogs)}</strong>
          ${renderDashboardDelta(cogsMom)}
        </div>
        <div class="dashboard-kpi-card card">
          <span class="dashboard-kpi-icon">${tablerIcon('trending-up')}</span>
          <span class="dashboard-kpi-label">净利润</span>
          <strong class="${monthlyProfit >= 0 ? 'text-green' : 'text-red'}">${formatMoney(monthlyProfit)}</strong>
          <span class="dashboard-kpi-note">利润率 ${formatNumber(profitRate, 1)}%</span>
        </div>
        <div class="dashboard-kpi-card card">
          <span class="dashboard-kpi-icon">${tablerIcon('building-store')}</span>
          <span class="dashboard-kpi-label">库存概况</span>
          <strong>${totalStock}</strong>
          <span class="dashboard-kpi-note">${activeProducts} 种有库存 · ${formatMoney(inventoryCost)}</span>
        </div>
      </div>

      <div class="dashboard-overview-grid">
        ${renderDashboardDistribution(distributionRows, monthlyRevenue)}

        <div class="glass-card card chart-card dashboard-panel dashboard-trend-card">
          <div class="card-header dashboard-card-header">
            <h3 class="card-title">${tablerIcon('chart-line')} 近7天销售趋势</h3>
            <div class="dashboard-chart-legend">
              ${renderDashboardChartLegend()}
            </div>
          </div>
          <div class="card-body mini-chart" id="salesChart">
            ${renderMiniChart(dailySalesData)}
          </div>
        </div>
      </div>

      <div class="dashboard-lower-grid">
        <div class="glass-card card dashboard-panel dashboard-machine-panel">
          <div class="card-header dashboard-card-header">
            <h3 class="card-title">${tablerIcon('building-store')} 售货机概览</h3>
            <span class="dashboard-panel-subtitle">${machines.length} 台设备</span>
          </div>
          <div class="card-body section-grid dashboard-machine-grid">
            ${machines.map(machineId => renderMachineCard(machineId, products.filter(p => p.machineId === machineId))).join('')}
          </div>
        </div>

        ${renderLowStockPanel(lowStockProducts)}
      </div>
    </div>
  `;
}

function renderDashboardChartLegend() {
  return DASHBOARD_CHART_SERIES.map(series => `
    <button class="dashboard-chart-legend-item" type="button" data-series="${series.key}" aria-pressed="true" aria-label="${escapeAttr(series.label)}" onclick="toggleDashboardChartSeries(this)" style="--series-color:${series.color}">
      <i class="legend-dot"></i><span class="legend-label-full">${escapeHtml(series.label)}</span><span class="legend-label-short" aria-hidden="true">${escapeHtml(series.shortLabel || series.label)}</span>
    </button>
  `).join('');
}

function renderDashboardDelta(mom) {
  return renderMoMBadge(mom) || '<span class="dashboard-kpi-note">暂无环比</span>';
}

function renderDashboardDistribution(rows, monthlyRevenue) {
  const positiveRows = rows.map(row => ({ ...row, chartAmount: Math.max(row.amount, 0) }));
  const total = positiveRows.reduce((sum, row) => sum + row.chartAmount, 0);
  const donutTotal = total || Math.max(monthlyRevenue, 1);
  const gradient = buildDashboardDonutGradient(positiveRows, donutTotal);

  return `
    <div class="glass-card card dashboard-panel dashboard-distribution-card">
      <div class="card-header dashboard-card-header">
        <h3 class="card-title">${tablerIcon('chart-donut')} 经营分布</h3>
        <span class="dashboard-panel-subtitle">${formatMoney(monthlyRevenue)} 销售额</span>
      </div>
      <div class="card-body dashboard-distribution-body">
        <div class="dashboard-donut-wrap">
          <div class="dashboard-donut" style="background: ${gradient};">
            <div class="dashboard-donut-hole">
              <strong>${formatNumber(monthlyRevenue, 0)}</strong>
              <span>本月销售</span>
            </div>
          </div>
        </div>
        <div class="dashboard-table-wrap">
          <table class="dashboard-distribution-table table table-vcenter card-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>金额</th>
                <th>占比</th>
                <th>环比</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => `
                <tr>
                  <td><span class="dashboard-color-dot" style="background:${row.color}"></span>${escapeHtml(row.label)}</td>
                  <td class="${row.amount >= 0 ? 'text-green' : 'text-red'}">${formatMoney(row.amount)}</td>
                  <td>${formatDashboardShare(Math.max(row.amount, 0), donutTotal)}</td>
                  <td>${row.mom ? formatDashboardMom(row.mom) : '<span class="dashboard-muted-text">-</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function buildDashboardDonutGradient(rows, total) {
  if (!rows.some(row => row.chartAmount > 0)) {
    return 'conic-gradient(#e2e8f0 0 100%)';
  }

  let cursor = 0;
  const segments = rows.filter(row => row.chartAmount > 0).map(row => {
    const start = cursor;
    cursor += (row.chartAmount / total) * 100;
    return `${row.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  return `conic-gradient(${segments.join(', ')})`;
}

function formatDashboardShare(amount, total) {
  if (!total || amount <= 0) return '0.0%';
  return `${formatNumber((amount / total) * 100, 1)}%`;
}

function formatDashboardMom(mom) {
  if (!mom || mom.pct === null) return '<span class="dashboard-muted-text">-</span>';
  const arrow = mom.direction === 'up' ? '↑' : mom.direction === 'down' ? '↓' : '→';
  const cls = mom.direction === 'up' ? 'text-green' : mom.direction === 'down' ? 'text-red' : 'dashboard-muted-text';
  return `<span class="${cls}">${arrow}${Math.abs(mom.pct)}%</span>`;
}

function renderLowStockPanel(lowStockProducts) {
  return `
    <div class="glass-card card dashboard-panel warning-card dashboard-warning-panel">
      <div class="card-header dashboard-card-header warning-card-header">
        <h3 class="card-title"><span class="warning-title-icon" aria-hidden="true">${tablerIcon('alert-triangle')}</span><span>低库存预警</span></h3>
        <span class="badge ${lowStockProducts.length > 0 ? 'badge-danger' : 'badge-success'}">${lowStockProducts.length} 种</span>
      </div>
      <div class="card-body warning-list">
        ${lowStockProducts.length > 0 ? lowStockProducts.slice(0, 8).map(p => `
          <div class="warning-item">
            <span class="warning-name">${escapeHtml(p.name)}</span>
            <span class="warning-machine">${escapeHtml(p.machineId)}</span>
            <span class="warning-stock">${p.currentStock || 0}件</span>
          </div>
        `).join('') : '<p class="empty-hint">库存状态正常，暂无低库存商品。</p>'}
      </div>
    </div>
  `;
}

function toggleMachineProducts(button) {
  const productsWrap = button.closest('.machine-products');
  if (!productsWrap) return;
  productsWrap.classList.toggle('expanded');
}

function toggleDashboardChartSeries(button) {
  const card = button.closest('.dashboard-trend-card');
  if (!card) return;

  const activeButtons = Array.from(card.querySelectorAll('.dashboard-chart-legend-item[aria-pressed="true"]'));
  const isActive = button.getAttribute('aria-pressed') === 'true';
  if (isActive && activeButtons.length <= 1) return;

  const nextActive = !isActive;
  const key = button.dataset.series;
  button.setAttribute('aria-pressed', nextActive ? 'true' : 'false');
  button.classList.toggle('is-muted', !nextActive);
  card.querySelectorAll(`[data-chart-series="${key}"]`).forEach(el => {
    el.classList.toggle('is-hidden', !nextActive);
  });

  const tooltip = card.querySelector('.line-chart-tooltip');
  if (tooltip) tooltip.classList.remove('is-visible');
}

function showDashboardChartTooltip(event, target) {
  const chart = target.closest('.line-chart');
  const card = target.closest('.dashboard-trend-card');
  if (!chart || !card) return;

  const tooltip = chart.querySelector('.line-chart-tooltip');
  if (!tooltip) return;

  const activeSeries = DASHBOARD_CHART_SERIES.filter(series => {
    return card.querySelector(`.dashboard-chart-legend-item[data-series="${series.key}"]`)?.getAttribute('aria-pressed') === 'true';
  });
  const rows = activeSeries.map(series => `
    <div class="line-chart-tooltip-row">
      <span><i style="background:${series.color}"></i>${series.label}</span>
      <strong>${formatDashboardChartValue(target.dataset[series.key], series.unit)}</strong>
    </div>
  `).join('');

  tooltip.innerHTML = `
    <div class="line-chart-tooltip-title">${target.dataset.date}</div>
    ${rows}
    <div class="line-chart-tooltip-foot">${target.dataset.count || 0} 笔销售记录</div>
  `;

  const chartRect = chart.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clientX = event?.clientX ?? (targetRect.left + targetRect.width / 2);
  const clientY = event?.clientY ?? (targetRect.top + targetRect.height / 2);
  const x = Math.min(Math.max(clientX - chartRect.left, 12), chartRect.width - 12);
  const y = Math.min(Math.max(clientY - chartRect.top, 12), chartRect.height - 12);

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.classList.add('is-visible');

  chart.querySelectorAll('.line-chart-hit.is-active, .line-chart-point.is-active').forEach(el => el.classList.remove('is-active'));
  target.classList.add('is-active');
  chart.querySelectorAll(`.line-chart-point[data-chart-index="${target.dataset.chartIndex}"]`).forEach(el => el.classList.add('is-active'));
}

function hideDashboardChartTooltip(target) {
  const chart = target.closest('.line-chart');
  if (!chart) return;
  chart.querySelector('.line-chart-tooltip')?.classList.remove('is-visible');
  chart.querySelectorAll('.line-chart-hit.is-active, .line-chart-point.is-active').forEach(el => el.classList.remove('is-active'));
}

/**
 * 渲染近 7 天销售折线图（纯 SVG，无需 Chart.js）
 */
function renderMiniChart(data) {
  const isCompactChart = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 520px)').matches;
  const width = isCompactChart ? 430 : 720;
  const height = isCompactChart ? 260 : 300;
  const padLeft = isCompactChart ? 42 : 48;
  const padRight = isCompactChart ? 36 : 42;
  const padTop = isCompactChart ? 18 : 16;
  const padBottom = 30;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const bottomY = padTop + plotHeight;
  const xForIndex = index => data.length === 1 ? padLeft + plotWidth / 2 : padLeft + (plotWidth * index) / (data.length - 1);
  const leftValues = data.flatMap(d => DASHBOARD_CHART_SERIES.filter(s => s.axis === 'left').map(s => Number(d[s.key]) || 0));
  const rightValues = data.flatMap(d => DASHBOARD_CHART_SERIES.filter(s => s.axis === 'right').map(s => Number(d[s.key]) || 0));
  const leftMin = Math.min(0, ...leftValues);
  const leftMax = Math.max(1, ...leftValues) * 1.15;
  const leftRange = leftMax - leftMin || 1;
  const rightMin = Math.min(0, ...rightValues);
  const rightMax = Math.max(100, ...rightValues);
  const rightRange = rightMax - rightMin || 1;
  const yForLeft = value => bottomY - (((Number(value) || 0) - leftMin) / leftRange) * plotHeight;
  const yForRight = value => bottomY - (((Number(value) || 0) - rightMin) / rightRange) * plotHeight;
  const zeroY = yForLeft(0);
  const chartSeries = DASHBOARD_CHART_SERIES.map(series => {
    const points = data.map((d, index) => ({
      x: xForIndex(index),
      y: series.axis === 'right' ? yForRight(d[series.key]) : yForLeft(d[series.key]),
      value: Number(d[series.key]) || 0,
      date: d.date
    }));
    const path = buildDashboardSmoothPath(points);
    return {
      ...series,
      points,
      path,
      areaPath: `${path} L ${points[points.length - 1].x.toFixed(2)} ${zeroY.toFixed(2)} L ${points[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`
    };
  });
  const gridLines = [0, 1, 2, 3, 4].map(i => {
    const ratio = i / 4;
    const y = padTop + plotHeight * ratio;
    const leftValue = leftMax - leftRange * ratio;
    const rightValue = rightMax - rightRange * ratio;
    return `
      <line class="line-chart-grid" x1="${padLeft}" y1="${y.toFixed(2)}" x2="${width - padRight}" y2="${y.toFixed(2)}"></line>
      <text class="line-chart-axis-label" x="${padLeft - 8}" y="${(y + 4).toFixed(2)}">${formatDashboardAxisMoney(leftValue)}</text>
      <text class="line-chart-axis-label line-chart-axis-label-right" x="${width - padRight + 8}" y="${(y + 4).toFixed(2)}">${formatDashboardAxisPercent(rightValue)}</text>
    `;
  }).join('');
  const labels = data.map((d, index) => `<text class="line-chart-label" x="${xForIndex(index).toFixed(2)}" y="${height - 10}">${d.date}</text>`).join('');
  const areas = chartSeries.filter(series => series.fill).map(series => `<path class="line-chart-area" data-chart-series="${series.key}" d="${series.areaPath}" style="--series-color:${series.color}"></path>`).join('');
  const paths = chartSeries.map(series => `<path class="line-chart-path ${series.dashed ? 'is-dashed' : ''}" data-chart-series="${series.key}" d="${series.path}" style="--series-color:${series.color}"></path>`).join('');
  const points = chartSeries.map(series => series.points.map((p, index) => `
    <g class="line-chart-point" data-chart-series="${series.key}" data-chart-index="${index}" style="--series-color:${series.color}">
      ${series.key === 'amount' ? `<text class="line-chart-value" x="${p.x.toFixed(2)}" y="${Math.max(14, p.y - 12).toFixed(2)}">${p.value > 0 ? formatMoney(p.value) : ''}</text>` : ''}
      <circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4.5"></circle>
    </g>
  `).join('')).join('');
  const hitZones = data.map((d, index) => {
    const x = xForIndex(index);
    const prevX = index === 0 ? padLeft : xForIndex(index - 1);
    const nextX = index === data.length - 1 ? width - padRight : xForIndex(index + 1);
    const zoneStart = index === 0 ? padLeft - 14 : (prevX + x) / 2;
    const zoneEnd = index === data.length - 1 ? width - padRight + 14 : (x + nextX) / 2;
    return `
      <g class="line-chart-hit" tabindex="0" focusable="true" role="button" aria-label="${escapeAttr(formatDashboardChartAria(d))}" data-chart-index="${index}" data-date="${escapeAttr(d.date)}" data-count="${d.count || 0}" data-amount="${d.amount || 0}" data-cogs="${d.cogs || 0}" data-fee="${d.fee || 0}" data-profit="${d.profit || 0}" data-profit-rate="${d.profitRate || 0}" onmousemove="showDashboardChartTooltip(event, this)" onmouseenter="showDashboardChartTooltip(event, this)" onfocus="showDashboardChartTooltip(null, this)" onmouseleave="hideDashboardChartTooltip(this)" onblur="hideDashboardChartTooltip(this)">
        <rect class="line-chart-hit-zone" x="${zoneStart.toFixed(2)}" y="${padTop}" width="${(zoneEnd - zoneStart).toFixed(2)}" height="${plotHeight}"></rect>
        <line class="line-chart-cursor" x1="${x.toFixed(2)}" y1="${padTop}" x2="${x.toFixed(2)}" y2="${bottomY}"></line>
      </g>
    `;
  }).join('');

  return `
    <div class="line-chart">
      <svg class="line-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="近7天销售趋势折线图">
        <defs>
          <linearGradient id="salesAmountAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.22"></stop>
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        ${gridLines}
        ${areas}
        ${paths}
        ${points}
        ${labels}
        ${hitZones}
      </svg>
      <div class="line-chart-tooltip" role="status"></div>
    </div>
  `;
}

function buildDashboardSmoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  return points.map((point, index) => {
    if (index === 0) return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const prev = points[index - 1];
    const next = points[index + 1] || point;
    const prevPrev = points[index - 2] || prev;
    const cp1x = prev.x + (point.x - prevPrev.x) * 0.16;
    const cp1y = prev.y + (point.y - prevPrev.y) * 0.16;
    const cp2x = point.x - (next.x - prev.x) * 0.16;
    const cp2y = point.y - (next.y - prev.y) * 0.16;
    return `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(' ');
}

function formatDashboardAxisMoney(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${sign}¥${formatNumber(abs / 1000000, 1)}M`;
  if (abs >= 1000) return `${sign}¥${formatNumber(abs / 1000, 1)}K`;
  return `${sign}¥${formatNumber(abs, 0)}`;
}

function formatDashboardAxisPercent(value) {
  return `${formatNumber(value, 0)}%`;
}

function formatDashboardChartValue(value, unit) {
  const n = Number(value) || 0;
  if (unit === 'percent') return `${formatNumber(n, 1)}%`;
  return formatMoney(n);
}

function formatDashboardChartAria(day) {
  return `${day.date} 销售额 ${formatMoney(day.amount)} 销售成本 ${formatMoney(day.cogs)} 手续费 ${formatMoney(day.fee)} 净利润 ${formatMoney(day.profit)} 利润率 ${formatNumber(day.profitRate, 1)}%`;
}

/**
 * 计算环比变化
 * @param {number} current 当月值
 * @param {number} previous 上月值
 * @returns {{ delta: number, pct: number|null, direction: 'up'|'down'|'flat' }}
 */
function calcMoMDelta(current, previous) {
  if (previous === 0) {
    return { delta: current, pct: null, direction: current > 0 ? 'up' : 'flat' };
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return {
    delta: current - previous,
    pct,
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'
  };
}

/**
 * 渲染环比徽章 HTML
 * @param {{ pct: number|null, direction: string }} mom
 * @returns {string}
 */
function renderMoMBadge(mom) {
  if (!mom || mom.pct === null) return '';
  const arrow = mom.direction === 'up' ? '↑' : mom.direction === 'down' ? '↓' : '→';
  const cls = mom.direction === 'up' ? 'mom-up' : mom.direction === 'down' ? 'mom-down' : 'mom-flat';
  return `<div class="stat-mom ${cls}">${arrow}${Math.abs(mom.pct)}% 环比</div>`;
}


