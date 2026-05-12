/**
 * 销售 & 利润管理模块
 * 利润 = 销售额 - 手续费 - 销售成本(COGS)
 * 进货成本单独展示，不直接计入利润
 */

function getSalesSelectedMonth(uiState, currentMonth) {
  return uiState.month || currentMonth;
}

function salesRecordMonth(record) {
  return record.yearMonth;
}

function sortSalesRecords(records = []) {
  return [...records].sort((a, b) => {
    const d = (b.date || '').localeCompare(a.date || '');
    if (d !== 0) return d;
    return parseInt(b.id || 0) - parseInt(a.id || 0);
  });
}

function salesCacheCoversMonth(cached, month) {
  if (!cached || isPageDirty('sales')) return false;
  if (month === 'all') return !!cached.loadedAll;
  return !!cached.loadedAll || cached.loadedMonth === month;
}

async function loadSalesPageRecords(month) {
  const cached = getPageData('sales') || {};
  if (salesCacheCoversMonth(cached, month)) return cached;

  const [sales, purchases] = month === 'all'
    ? await Promise.all([getAllSales(), getAllPurchases()])
    : await Promise.all([getSalesByMonth(month), getPurchasesByMonth(month)]);

  return setPageData('sales', {
    ...cached,
    sales,
    purchases,
    loadedMonth: month === 'all' ? null : month,
    loadedAll: month === 'all'
  });
}

function getSalesSummaryMonths(monthlyData = [], selectedMonth) {
  const months = new Set(monthlyData.map(item => item.month).filter(Boolean));
  if (selectedMonth && selectedMonth !== 'all') months.add(selectedMonth);
  return Array.from(months).sort().reverse();
}

async function renderSalesPage() {
  const uiState = getPageUiState('sales');
  const cached = getPageData('sales');
  const currentMonth = getCurrentMonth();
  const selectedMonth = getSalesSelectedMonth(uiState, currentMonth);
  const businessSettings = await getBusinessSettings();
  const [recordData, products, summary] = await Promise.all([
    loadSalesPageRecords(selectedMonth),
    cached?.products && !isPageDirty('sales') ? cached.products : getAllProducts(),
    getSalesSummary({ currentMonth, feeRate: businessSettings.feeRate, includeMonthly: true })
  ]);
  const sales = sortSalesRecords(recordData.sales || []);
  const purchases = recordData.purchases || [];
  const monthlyData = summary.monthly || [];
  const summaryByMonth = Object.fromEntries(monthlyData.map(item => [item.month, item]));
  const currentSummary = selectedMonth === 'all'
    ? monthlyData.reduce((total, item) => ({
        revenue: total.revenue + (item.revenue || 0),
        cogs: total.cogs + (item.cogs || 0),
        fee: total.fee + (item.fee || 0),
        profit: total.profit + (item.profit || 0),
        purchaseCost: total.purchaseCost + (item.purchaseCost || 0)
      }), { revenue: 0, cogs: 0, fee: 0, profit: 0, purchaseCost: 0 })
    : (summaryByMonth[selectedMonth] || (selectedMonth === currentMonth ? summary.current : null) || {});

  const visibleSales = selectedMonth === 'all'
    ? sales
    : sales.filter(s => salesRecordMonth(s) === selectedMonth);
  const monthlyRevenue = currentSummary.revenue || 0;
  const monthlyCogs = currentSummary.cogs || 0;
  const monthlyPurchaseCost = currentSummary.purchaseCost || 0;
  const monthlyFee = currentSummary.fee || 0;
  const monthlyProfit = currentSummary.profit || 0;
  const profitRate = selectedMonth === 'all'
    ? (monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0)
    : (currentSummary.profitRate || 0);
  const monthLabel = selectedMonth === 'all' ? '全部' : selectedMonth;
  const salesMonthOptions = getSalesSummaryMonths(monthlyData, selectedMonth === 'all' ? currentMonth : selectedMonth);

  setPageData('sales', {
    sales,
    products,
    purchases,
    currentMonth,
    selectedMonth,
    visibleSales,
    monthlyData,
    summary,
    loadedMonth: recordData.loadedMonth,
    loadedAll: recordData.loadedAll
  });
  consumePageDirty('sales');

  const html = `
    <div class="sales-page page-stack container-xl">
    <!-- 当月汇总 -->
    <div class="stats-grid stats-grid-6 sales-stats">
      <div class="stat-card glass-card card gradient-blue">
        <div class="stat-icon">${tablerIcon('currency-yuan')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="salesStatLabel1">销售额</div>
          <div class="stat-period" id="salesStatPeriod1">${monthLabel}</div>
          <div class="stat-value" id="salesStatRevenue">${formatMoney(monthlyRevenue)}</div>
        </div>
      </div>
      <div class="stat-card glass-card card gradient-purple">
        <div class="stat-icon">${tablerIcon('packages')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="salesStatLabel2">销售成本</div>
          <div class="stat-period" id="salesStatPeriod2">${monthLabel}</div>
          <div class="stat-value" id="salesStatCogs">${formatMoney(monthlyCogs)}</div>
        </div>
      </div>
      <div class="stat-card glass-card card gradient-orange">
        <div class="stat-icon">${tablerIcon('credit-card')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="salesStatLabel3">手续费 (${formatPercentRate(businessSettings.feeRate)})</div>
          <div class="stat-period" id="salesStatPeriod3">${monthLabel}</div>
          <div class="stat-value" id="salesStatFee">${formatMoney(monthlyFee)}</div>
        </div>
      </div>
      <div class="stat-card glass-card card ${monthlyProfit >= 0 ? 'gradient-green' : 'gradient-red'}" id="salesStatProfitCard">
        <div class="stat-icon" id="salesStatProfitIcon">${tablerIcon(monthlyProfit >= 0 ? 'trending-up' : 'trending-down')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="salesStatLabel4">净利润</div>
          <div class="stat-period" id="salesStatPeriod4">${monthLabel}</div>
          <div class="stat-value" id="salesStatProfit">${formatMoney(monthlyProfit)}</div>
        </div>
      </div>
      <div class="stat-card glass-card card gradient-orange">
        <div class="stat-icon">${tablerIcon('percentage')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="salesStatLabel5">利润率</div>
          <div class="stat-period" id="salesStatPeriod5">${monthLabel}</div>
          <div class="stat-value" id="salesStatRate">${formatNumber(profitRate, 1)}%</div>
        </div>
      </div>
      <div class="stat-card glass-card card gradient-purple">
        <div class="stat-icon">${tablerIcon('shopping-cart')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="salesStatLabel6">进货支出</div>
          <div class="stat-period" id="salesStatPeriod6">${monthLabel}</div>
          <div class="stat-value" id="salesStatPurchase">${formatMoney(monthlyPurchaseCost)}</div>
        </div>
      </div>
    </div>

    <!-- 月度利润对比 -->
    ${monthlyData.length > 0 ? `
    <div class="glass-card card monthly-profit-card">
      <div class="card-header sales-record-title">
        <h3 class="card-title">${tablerIcon('chart-line')} 月度利润对比</h3>
      </div>
      <div class="table-responsive">
        <table class="data-table table card-table table-vcenter">
          <thead>
            <tr>
              <th>月份</th>
              <th>销售额</th>
              <th>销售成本</th>
              <th>手续费</th>
              <th>净利润</th>
              <th>利润率</th>
              <th>进货支出</th>
            </tr>
          </thead>
          <tbody>
            ${monthlyData.map(m => `
              <tr>
                <td data-label="月份"><strong class="monthly-profit-value">${m.month}</strong></td>
                <td data-label="销售额"><span class="monthly-profit-value">${formatMoney(m.revenue)}</span></td>
                <td data-label="销售成本"><span class="monthly-profit-value">${formatMoney(m.cogs)}</span></td>
                <td data-label="手续费"><span class="monthly-profit-value">${formatMoney(m.fee)}</span></td>
                <td data-label="净利润" class="${m.profit >= 0 ? 'text-green' : 'text-red'} text-bold"><span class="monthly-profit-value">${formatMoney(m.profit)}</span></td>
                <td data-label="利润率"><span class="monthly-profit-value">${formatNumber(m.profitRate, 1)}%</span></td>
                <td data-label="进货支出" class="text-muted"><span class="monthly-profit-value">${formatMoney(m.purchaseCost)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- 销售记录 -->
    <div class="glass-card card sales-record-card">
      <div class="card-header sales-record-title record-card-header card-toolbar sales-card-toolbar">
        <h3 class="card-title">销售记录</h3>
        <input type="text" id="salesSearch" class="form-control form-input form-input-sm toolbar-search sales-search-input" placeholder="搜索商品名称..." value="${escapeAttr(uiState.search || '')}" oninput="filterSalesRecordsDebounced()">
        <label class="toolbar-field sales-month-control"><span>月份</span>
          <select id="salesMonthFilter" class="form-select form-select-sm sales-month-filter" onchange="filterSalesRecords()">
            <option value="all" ${selectedMonth === 'all' ? 'selected' : ''}>全部月份</option>
            ${salesMonthOptions.map(m => `<option value="${m}" ${selectedMonth === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
        <div class="card-action-bar sales-action-bar">
          <button class="btn btn-accent" onclick="showAIRefundRecognizeModal()">
            ${tablerIcon('receipt-refund', 'btn-icon-left')} AI识别退款
          </button>
          <button class="btn btn-ai-gradient" onclick="showAISalesRecognizeModal()">
            ${tablerIcon('camera', 'btn-icon-left')} AI识别销售
          </button>
          <button class="btn btn-primary" onclick="showAddDailySaleModal()">
            ${tablerIcon('plus', 'btn-icon-left')} 录入每日销售
          </button>
          <button class="btn btn-danger" onclick="showAddLossModal()">
            ${tablerIcon('trash', 'btn-icon-left')} 登记损耗
          </button>
        </div>
      </div>
      <div id="salesTableWrap">
        ${renderSalesTable(visibleSales)}
      </div>
    </div>
    </div>
  `;

  requestAnimationFrame(() => {
    if (currentPage === 'sales') {
      filterSalesRecords();
    }
  });

  return html;
}

function getSaleDisplayTime(sale) {
  if (sale.date && (sale.date.includes('T') || sale.date.includes(' '))) {
    const parts = sale.date.replace('T', ' ').split(' ');
    return parts[1] ? parts[1].substring(0, 5) : '-';
  }
  return '-';
}

function renderSalesTable(salesData) {
  if (!salesData || salesData.length === 0) {
    return '<div class="empty-state-sm"><p>暂无销售记录</p></div>';
  }

  // 按天分组
  const groupedByDay = [];
  let currentGroup = null;
  salesData.forEach(s => {
    const dayDate = (s.date || '').split('T')[0].split(' ')[0];
    if (!currentGroup || currentGroup.date !== dayDate) {
      currentGroup = { date: dayDate, sales: [], totalAmount: 0, totalProfit: 0, totalItems: 0, yearMonth: s.yearMonth };
      groupedByDay.push(currentGroup);
    }
    currentGroup.sales.push(s);
    currentGroup.totalAmount += s.totalAmount || 0;
    currentGroup.totalProfit += (s.totalAmount || 0) - (s.totalCogs || 0);
    currentGroup.totalItems += (s.items || []).reduce((sum, i) => sum + Math.abs(i.quantity || 0), 0);
  });

  const pager = getPaginatedItems('sales', 'records', groupedByDay);
  let html = '<div class="sales-day-list">';

  pager.items.forEach((group, index) => {
    const profitClass = group.totalProfit >= 0 ? 'text-green' : 'text-red';
    const collapsedClass = index === 0 ? '' : ' collapsed';
    const actionHtml = group.sales.map(sale => {
      const timeLabel = group.sales.length > 1 ? `<span class="sales-day-action-time">${getSaleDisplayTime(sale)}</span>` : '';
      return `
        <span class="sales-day-action-set">
          ${timeLabel}
          ${sale.imageBase64 || sale.hasImage ? `<button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); showRecordImageModal(STORES.SALES, '${escapeAttr(sale.id)}')" title="查看原图">${tablerIcon('photo')}</button>` : ''}
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); showEditSaleModal('${sale.id}')" title="修改">${tablerIcon('pencil')}</button>
          <button class="btn btn-icon btn-sm btn-danger-ghost" onclick="event.stopPropagation(); handleDeleteSale('${sale.id}')" title="删除">${tablerIcon('trash')}</button>
        </span>
      `;
    }).join('');

    html += `
      <div class="sales-day-group${collapsedClass}" data-month="${group.yearMonth}">
        <div class="sales-day-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="sales-day-left">
            <span class="sales-day-date">${tablerIcon('calendar')} ${group.date}</span>
            <span class="sales-day-count">${group.sales.length} 笔</span>
          </div>
          <div class="sales-day-stats">
            <span><small>件数</small><b>${group.totalItems}</b></span>
            <span><small>销售</small><b>${formatMoney(group.totalAmount)}</b></span>
            <span><small>毛利</small><b class="${profitClass}">${formatMoney(group.totalProfit)}</b></span>
          </div>
          <div class="sales-day-actions">${actionHtml}</div>
          <span class="sales-day-chevron">▼</span>
        </div>
        <div class="sales-day-body">
    `;

    group.sales.forEach(s => {
      const grossProfit = (s.totalAmount || 0) - (s.totalCogs || 0);
      const items = s.items || [];
      const itemCount = items.reduce((sum, i) => sum + Math.abs(i.quantity || 0), 0);
      const itemSummary = items.length > 0 ? `${items.length} 种 / ${itemCount} 件` : '无明细';

      // Accent color based on type
      let accentClass = '';
      if (s.type === 'refund') accentClass = 'refund';
      else if (s.type === 'loss') accentClass = 'loss';

      // Time
      const timeStr = getSaleDisplayTime(s);

      // Type tags
      let typeTags = '';
      if (s.type === 'refund') typeTags = '<span class="tag tag-refund sale-type-tag">退款</span>';
      else if (s.type === 'loss') typeTags = '<span class="tag tag-loss sale-type-tag">损耗</span>';
      // Item detail grid
      const chipHtml = items.map(i => {
        const productName = escapeHtml(i.productName || '?');
        const quantity = Math.abs(i.quantity || 0);
        return `
          <span class="sale-item-chip" title="${productName} ×${quantity}">
            <span class="sale-item-name-text">${productName}</span>
            <span class="sale-item-qty">×${quantity}</span>
          </span>
        `;
      }).join('');

      html += `
        <div class="sale-card">
          <div class="sale-card-accent ${accentClass}"></div>
          <div class="sale-card-body">
            <div class="sale-card-main">
              <div class="sale-card-topline">
                <span class="sale-card-time">${timeStr}</span>
                <span class="tag tag-machine sale-machine-tag">${escapeHtml(s.machineId)}</span>
                ${typeTags}
                <span class="sale-card-item-count">${itemSummary}</span>
              </div>
              ${items.length > 0 ? `<div class="sale-card-items">${chipHtml}</div>` : ''}
              ${s.note ? `<div class="sale-card-note">📝 ${escapeHtml(s.note)}</div>` : ''}
            </div>
          </div>
        </div>`;
    });

    html += `</div></div>`;
  });

  html += '</div>';
  html += renderPaginationDock('sales', 'records', pager, 'filterSalesRecords');
  return html;
}

/**
 * 筛选销售记录 (动态重新渲染表格)
 */
async function filterSalesRecords() {
  const uiState = getPageUiState('sales');
  const month = document.getElementById('salesMonthFilter')?.value || uiState.month || getCurrentMonth();
  const searchRaw = document.getElementById('salesSearch')?.value ?? uiState.search ?? '';
  const search = searchRaw.toLowerCase().trim();
  const wrap = document.getElementById('salesTableWrap');
  if (!wrap) return;

  const filterChanged = month !== uiState.month || searchRaw !== uiState.search;
  if (filterChanged) {
    setPaginationPage('sales', 'records', 1);
  }
  updatePageUiState('sales', { month, search: searchRaw });

  const cached = await loadSalesPageRecords(month);
  const ordered = sortSalesRecords(cached.sales || []);

  let filtered = month === 'all' ? ordered : ordered.filter(s => salesRecordMonth(s) === month);
  if (search) {
    filtered = filtered.filter(s => {
      // 搜索销售明细中的商品名称
      if (!s.items || s.items.length === 0) return false;
      return s.items.some(item => (item.productName || '').toLowerCase().includes(search));
    });
  }
  wrap.innerHTML = renderSalesTable(filtered);

  // 同步更新顶部的统计数据
  const monthlyRevenue = filtered.reduce((sum, s) => sum + s.totalAmount, 0);
  const monthlyCogs = filtered.reduce((sum, s) => sum + (s.totalCogs || 0), 0);
  
  const businessSettings = await getBusinessSettings();
  const monthlyFee = Math.round(monthlyRevenue * businessSettings.feeRate * 100) / 100;
  const monthlyProfit = Math.round((monthlyRevenue - monthlyFee - monthlyCogs) * 100) / 100;
  const profitRate = monthlyRevenue > 0 ? ((monthlyProfit / monthlyRevenue) * 100) : 0;

  // 获取该月的进货数据
  const allPurchases = cached.purchases || [];
  const monthPurchases = month === 'all' ? allPurchases : allPurchases.filter(p => p.date && p.date.startsWith(month));
  const monthlyPurchaseCost = monthPurchases.reduce((sum, p) => sum + p.totalPrice, 0);

  const monthLabel = month === 'all' ? '全部' : month;

  const elRev = document.getElementById('salesStatRevenue'); if (elRev) elRev.innerText = formatMoney(monthlyRevenue);
  const elCogs = document.getElementById('salesStatCogs'); if (elCogs) elCogs.innerText = formatMoney(monthlyCogs);
  const elFee = document.getElementById('salesStatFee'); if (elFee) elFee.innerText = formatMoney(monthlyFee);
  const elProfit = document.getElementById('salesStatProfit'); if (elProfit) elProfit.innerText = formatMoney(monthlyProfit);
  const elRate = document.getElementById('salesStatRate'); if (elRate) elRate.innerText = formatNumber(profitRate, 1) + '%';
  const elPurchase = document.getElementById('salesStatPurchase'); if (elPurchase) elPurchase.innerText = formatMoney(monthlyPurchaseCost);

  const profitCard = document.getElementById('salesStatProfitCard');
  if (profitCard) {
    profitCard.className = `stat-card glass-card card ${monthlyProfit >= 0 ? 'gradient-green' : 'gradient-red'}`;
  }
  const profitIcon = document.getElementById('salesStatProfitIcon');
  if (profitIcon) profitIcon.innerHTML = tablerIcon(monthlyProfit >= 0 ? 'trending-up' : 'trending-down');

  const l3 = document.getElementById('salesStatLabel3');
  if (l3) l3.innerText = `手续费 (${formatPercentRate(businessSettings.feeRate)})`;
  ['1', '2', '3', '4', '5', '6'].forEach(index => {
    const period = document.getElementById(`salesStatPeriod${index}`);
    if (period) period.innerText = monthLabel;
  });
}

window.filterSalesRecordsDebounced = debounce(filterSalesRecords, 120);

/**
 * 计算月度利润数据
 * 利润 = 销售额 - 手续费 - COGS（非进货成本）
 */
function calcMonthlyProfitData(sales, purchases, feeRate = BUSINESS_DEFAULTS.feeRate) {
  const months = new Set();
  sales.forEach(s => { if (s.yearMonth) months.add(s.yearMonth); });
  purchases.forEach(p => { if (p.date) months.add(p.date.substring(0, 7)); });

  return Array.from(months).sort().reverse().map(month => {
    const monthSales = sales.filter(s => s.yearMonth === month);
    const revenue = monthSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const cogs = monthSales.reduce((sum, s) => sum + (s.totalCogs || 0), 0);
    const fee = Math.round(revenue * feeRate * 100) / 100;
    const profit = Math.round((revenue - fee - cogs) * 100) / 100;
    const profitRate = revenue > 0 ? (profit / revenue * 100) : 0;
    const purchaseCost = purchases.filter(p => p.date && p.date.startsWith(month)).reduce((sum, p) => sum + p.totalPrice, 0);
    return { month, revenue, cogs, fee, profit, profitRate, purchaseCost };
  });
}

/**
 * 显示每日销售录入对话框
 * 通过输入每个商品的销售数量，自动计算总额
 */
async function showAddDailySaleModal() {
  const machines = await getMachines();
  const products = await getAllProducts();

  if (products.length === 0) {
    showToast('请先添加商品（可在进货管理中直接新增）', 'error');
    return;
  }

  // 按售货机分组
  const grouped = {};
  machines.forEach(m => grouped[m] = []);
  products.forEach(p => {
    if (grouped[p.machineId]) grouped[p.machineId].push(p);
  });

  const html = `
    <div class="form-grid">
      <div class="form-group">
        <label>售货机 <span class="required">*</span></label>
        <select id="saleMachine" class="form-select" onchange="onSaleMachineChange()">
          ${machines.map(m => optionHtml(m, m)).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>日期 <span class="required">*</span></label>
        <input type="datetime-local" id="saleDate" class="form-control form-input" value="${getNow()}">
      </div>
      <div class="form-group full-width">
        <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4);">
          <div>
            <label>备注</label>
            <input type="text" id="saleNote" class="form-control form-input" placeholder="可选备注">
          </div>
          <div>
            <label>搜索商品</label>
            <input type="text" id="saleProductSearch" class="form-control form-input" placeholder="输入商品名称过滤" oninput="onSaleMachineChange()">
          </div>
        </div>
      </div>
    </div>

    <div class="sale-items-section">
      <div class="section-header">
        <h4>${tablerIcon('list-details')} 单品销售数量</h4>
      </div>
      <div id="saleItemsContainer">
        ${products.map(p => `
          <div class="sale-item-row" data-machine="${escapeAttr(p.machineId)}" data-name="${escapeAttr(p.name)}">
            <span class="sale-item-name">
              ${escapeHtml(p.name)}
              <small class="text-muted">(${formatMoney(p.sellPrice)} / 库存:${p.currentStock || 0})</small>
            </span>
            <div class="sale-item-input">
              <input type="number" class="form-control form-input form-input-sm sale-item-qty"
                data-product-id="${p.id}" data-sell-price="${p.sellPrice || 0}"
                data-avg-cost="${p.avgCost || 0}"
                min="0" value="" placeholder="0"
                oninput="calcSaleTotal()">
              <span>件</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="purchase-summary">
      <div class="summary-item">
        <span>销售总额（自动计算）:</span>
        <span class="summary-value text-green" id="saleCalcTotal">¥0.00</span>
      </div>
      <div class="summary-item">
        <span>销售成本:</span>
        <span class="summary-value" id="saleCalcCogs">¥0.00</span>
      </div>
      <div class="summary-item">
        <span>预计毛利:</span>
        <span class="summary-value" id="saleCalcProfit">¥0.00</span>
      </div>
    </div>
  `;

  const result = await new Promise(resolve => {
    showModal(`${tablerIcon('plus')} 录入每日销售`, html, { 
      submitText: '提交', 
      wide: true, 
      onReady: (overlay, close) => {
        onSaleMachineChange();
        
        // 拦截默认提交行为
        const submitBtn = overlay.querySelector('#modalSubmit');
        const oldSubmit = submitBtn.onclick;
        submitBtn.replaceWith(submitBtn.cloneNode(true));
        const newSubmitBtn = overlay.querySelector('#modalSubmit');
        
        newSubmitBtn.addEventListener('click', async () => {
          const items = [];
          const qtyInputs = overlay.querySelectorAll('.sale-item-qty');
          qtyInputs.forEach(input => {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
              items.push({
                productId: input.dataset.productId,
                quantity: qty
              });
            }
          });

          if (items.length === 0) {
            showToast('请至少输入一个商品的销售数量', 'error');
            return;
          }

          try {
            const warnings = collectSaleWarnings(items, products);
            if (warnings.length > 0) {
              const confirmed = await showConfirm(warnings.join('\n') + '\n\n仍要继续录入销售吗？');
              if (!confirmed) return;
            }
            await addSale({
              machineId: overlay.querySelector('#saleMachine').value,
              date: overlay.querySelector('#saleDate').value,
              items: items,
              type: 'daily',
              note: overlay.querySelector('#saleNote').value.trim()
            });

            showToast('销售记录已添加，库存和成本已自动更新');
            close(true);
            navigateTo('sales');
          } catch (err) {
            showToast('录入失败: ' + err.message, 'error');
          }
        });
      }
    });
  });

}

/**
 * 切换售货机时筛选商品列表
 */
function onSaleMachineChange() {
  const machine = document.getElementById('saleMachine')?.value;
  const searchInput = document.getElementById('saleProductSearch')?.value.toLowerCase().trim() || '';
  if (!machine) return;
  const rows = document.querySelectorAll('.sale-item-row');
  rows.forEach(row => {
    const machineMatches = row.dataset.machine === machine;
    const name = row.dataset.name ? row.dataset.name.toLowerCase() : '';
    const searchMatches = searchInput === '' || name.includes(searchInput);
    row.style.display = machineMatches && searchMatches ? '' : 'none';
  });
}

/**
 * 实时计算销售总额和成本
 */
function calcSaleTotal() {
  let total = 0;
  let cogs = 0;
  const qtyInputs = document.querySelectorAll('.sale-item-qty');
  qtyInputs.forEach(input => {
    const qty = parseInt(input.value) || 0;
    if (qty > 0) {
      total += qty * (parseFloat(input.dataset.sellPrice) || 0);
      cogs += qty * (parseFloat(input.dataset.avgCost) || 0);
    }
  });
  const totalEl = document.getElementById('saleCalcTotal');
  const cogsEl = document.getElementById('saleCalcCogs');
  const profitEl = document.getElementById('saleCalcProfit');
  if (totalEl) totalEl.textContent = formatMoney(total);
  if (cogsEl) cogsEl.textContent = formatMoney(cogs);
  if (profitEl) profitEl.textContent = formatMoney(total - cogs);
}

/**
 * 删除销售记录
 */
async function handleDeleteSale(saleId) {
  const confirmed = await showConfirm('确定删除这条销售记录吗？删除后，该订单扣减的库存将会自动退还！');
  if (confirmed) {
    await deleteSale(saleId);
    showToast('销售记录已删除');
    navigateTo('sales');
  }
}



/**
 * 修改销售记录
 */
async function showEditSaleModal(saleId) {
  const machines = await getMachines();
  const sale = await dbGet(STORES.SALES, saleId);
  if (!sale) {
    showToast('记录不存在', 'error');
    return;
  }

  const products = await getAllProducts();
  if (products.length === 0) return;

  const grouped = {};
  machines.forEach(m => grouped[m] = []);
  products.forEach(p => {
    if (grouped[p.machineId]) grouped[p.machineId].push(p);
  });

  // Convert old items to map for easy lookup
  const saleItemsMap = {};
  (sale.items || []).forEach(i => {
    saleItemsMap[i.productId] = i.quantity;
  });

  const html = `
    <div class="form-grid">
      <div class="form-group">
        <label>售货机 <span class="required">*</span></label>
        <select id="saleMachine" class="form-select" onchange="onSaleMachineChange()">
          ${machines.map(m => optionHtml(m, m, m === sale.machineId)).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>日期 <span class="required">*</span></label>
        <input type="datetime-local" id="saleDate" class="form-control form-input" value="${sale.date || getNow()}">
      </div>
      <div class="form-group full-width">
        <label>备注</label>
        <input type="text" id="saleNote" class="form-control form-input" value="${escapeAttr(sale.note || '')}" placeholder="可选备注">
      </div>
    </div>

    <div class="sale-items-section">
      <div class="section-header">
        <h4>${tablerIcon('list-details')} 修改单品销售数量</h4>
      </div>
      <div id="saleItemsContainer">
        ${products.map(p => {
          const oldQty = saleItemsMap[p.id] || '';
          return `
          <div class="sale-item-row" data-machine="${escapeAttr(p.machineId)}">
            <span class="sale-item-name">
              ${escapeHtml(p.name)}
              <small class="text-muted">(${formatMoney(p.sellPrice)} / 当前库存:${p.currentStock || 0})</small>
            </span>
            <div class="sale-item-input">
              <input type="number" class="form-control form-input form-input-sm sale-item-qty"
                data-product-id="${p.id}" data-sell-price="${p.sellPrice || 0}"
                data-avg-cost="${p.avgCost || 0}"
                min="0" value="${oldQty}" placeholder="0"
                oninput="calcSaleTotal()">
              <span>件</span>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>

    <div class="purchase-summary">
      <div class="summary-item">
        <span>新销售总额:</span>
        <span class="summary-value text-green" id="saleCalcTotal">¥0.00</span>
      </div>
      <div class="summary-item">
        <span>新销售成本:</span>
        <span class="summary-value" id="saleCalcCogs">¥0.00</span>
      </div>
      <div class="summary-item">
        <span>新预计毛利:</span>
        <span class="summary-value" id="saleCalcProfit">¥0.00</span>
      </div>
    </div>
  `;

  const result = await new Promise(resolve => {
    showModal(`${tablerIcon('pencil')} 修改销售记录`, html, { 
      submitText: '保存修改', 
      wide: true, 
      onReady: (overlay, close) => {
        onSaleMachineChange();
        calcSaleTotal();
        
        // 拦截默认提交行为
        const submitBtn = overlay.querySelector('#modalSubmit');
        submitBtn.replaceWith(submitBtn.cloneNode(true));
        const newSubmitBtn = overlay.querySelector('#modalSubmit');
        
        newSubmitBtn.addEventListener('click', async () => {
          const items = [];
          const qtyInputs = overlay.querySelectorAll('.sale-item-qty');
          qtyInputs.forEach(input => {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
              const itemData = {
                productId: input.dataset.productId,
                quantity: qty
              };
              if (sale.type === 'loss') {
                itemData.itemRevenue = 0;
              }
              items.push(itemData);
            }
          });

          if (items.length === 0) {
            showToast('修改失败：请至少输入一个商品的销售数量', 'error');
            return;
          }

          try {
            const warnings = collectSaleWarnings(items, products);
            if (warnings.length > 0) {
              const confirmed = await showConfirm(warnings.join('\n') + '\n\n仍要继续保存修改吗？');
              if (!confirmed) return;
            }
            await updateSale(saleId, {
              machineId: overlay.querySelector('#saleMachine').value,
              date: overlay.querySelector('#saleDate').value,
              note: overlay.querySelector('#saleNote').value.trim(),
              items: items
            });
            showToast('销售记录已修改');
            close(true);
            navigateTo('sales');
          } catch (err) {
            showToast('修改失败: ' + err.message, 'error');
          }
        });
      }
    });
  });

}

// ==================== AI 销售截图识别 ====================

/**
 * 显示AI销售识别对话框
 */
async function showAISalesRecognizeModal() {
  try {
    await ensureSelectedAIConfigured();
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const products = await getAllProducts();
  if (products.length === 0) {
    showToast('请先添加商品', 'error');
    return;
  }

  const html = `
    <div class="ai-recognize-section">
      <div class="upload-area" id="salesUploadArea">
        <div class="upload-icon">${tablerIcon('camera-plus')}</div>
        <p>点击上传 / 拖拽 / <strong>Ctrl+V 粘贴</strong></p>
        <p class="upload-hint">上传售货机后台的销售详情截图</p>
        <input type="file" id="salesImageInput" accept="image/*" style="display:none" onchange="handleSalesImageSelect(event)">
      </div>
      <div id="salesImagePreview" style="display:none">
        <div class="preview-header">
          <span>${tablerIcon('clipboard-check')} 已选择截图</span>
          <button class="btn btn-sm btn-ghost" onclick="resetSalesImage()">重新选择</button>
        </div>
        <img id="salesPreviewImg" class="order-preview-img" />
      </div>
      <div id="salesAIStatus" style="display:none">
        <div class="ai-loading">
          <div class="pulse-dot"></div>
          <p id="salesAIStatusText">AI 正在识别销售数据...</p>
        </div>
      </div>
      <div id="salesAIResult" style="display:none"></div>
    </div>
  `;

  await showModal(`${tablerIcon('camera')} AI 识别销售`, html, { hideFooter: true, wide: true });
}

// 上传区域事件（销售）
document.addEventListener('click', (e) => {
  if (e.target.closest('#salesUploadArea')) {
    document.getElementById('salesImageInput')?.click();
  }
});
document.addEventListener('dragover', (e) => {
  if (e.target.closest('#salesUploadArea')) {
    e.preventDefault();
    e.target.closest('#salesUploadArea').classList.add('drag-over');
  }
});
document.addEventListener('dragleave', (e) => {
  if (e.target.closest('#salesUploadArea')) {
    e.target.closest('#salesUploadArea').classList.remove('drag-over');
  }
});
document.addEventListener('drop', (e) => {
  const area = e.target.closest('#salesUploadArea');
  if (area) {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processSalesImageFile(file);
  }
});
// Ctrl+V 粘贴（销售弹窗）
document.addEventListener('paste', (e) => {
  const area = document.getElementById('salesUploadArea');
  if (!area) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) processSalesImageFile(file);
      return;
    }
  }
});

function handleSalesImageSelect(event) {
  const file = event.target.files[0];
  if (file) processSalesImageFile(file);
}

function resetSalesImage() {
  document.getElementById('salesUploadArea').style.display = '';
  document.getElementById('salesImagePreview').style.display = 'none';
  document.getElementById('salesAIStatus').style.display = 'none';
  document.getElementById('salesAIResult').style.display = 'none';
}

async function processSalesImageFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    const mimeType = file.type;

    // 显示预览
    document.getElementById('salesUploadArea').style.display = 'none';
    document.getElementById('salesImagePreview').style.display = '';
    document.getElementById('salesPreviewImg').src = dataUrl;
    document.getElementById('salesAIStatus').style.display = '';

    try {
      const statusText = document.getElementById('salesAIStatusText');
      if (statusText) statusText.textContent = '正在压缩图片并上传给 AI...';
      // 压缩图片用于 AI 识别和保存到数据库
      const compressedBase64 = await compressImage(base64, mimeType, 2200, 0.9);
      window._tempSalesImageBase64 = compressedBase64;
      const aiMimeType = 'image/jpeg';

      const products = await getAllProducts();
      const existingNames = Array.from(new Set(products.map(p => p.name)));

      if (statusText) statusText.textContent = 'AI 正在识别销售数据...';
      const aiStart = Date.now();
      const onProgress = (evt) => {
        if (!statusText) return;
        const secs = ((Date.now() - aiStart) / 1000).toFixed(1);
        if (evt.phase === 'connected') {
          statusText.textContent = `AI 已连接，正在生成结果... 已等待 ${secs}s`;
        } else if (evt.phase === 'streaming') {
          const kb = (evt.bytes / 1024).toFixed(1);
          statusText.textContent = `AI 正在流式输出... 已等待 ${secs}s · ${kb} KB`;
        } else if (evt.phase === 'done') {
          statusText.textContent = `AI 已完成，正在解析数据... 用时 ${secs}s`;
        }
      };
      const result = await recognizeSalesImage(compressedBase64, aiMimeType, existingNames, onProgress);
      document.getElementById('salesAIStatus').style.display = 'none';
      showSalesAIResult(result);
    } catch (err) {
      document.getElementById('salesAIStatus').style.display = 'none';
      document.getElementById('salesAIResult').style.display = '';
      document.getElementById('salesAIResult').innerHTML = `
        <div class="ai-error-box">
          <p>${tablerIcon('circle-x')} 识别失败: ${escapeHtml(err.message)}</p>
          <button class="btn btn-sm btn-ghost" onclick="resetSalesImage()">重新上传</button>
        </div>
      `;
    }
  };
  reader.readAsDataURL(file);
}

/**
 * 显示销售AI识别结果，匹配已有商品并让用户确认
 */
async function showSalesAIResult(aiItems) {
  const machines = await getMachines();
  const products = await getAllProducts();
  const container = document.getElementById('salesAIResult');
  container.style.display = '';

  // 优先使用 AI 明确返回的 matchedName；低置信或相近候选不自动匹配，避免错扣库存。
  const matched = aiItems.map(ai => ({
    ai,
    ...findBestSalesAIProductMatch(ai, products)
  }));

  const itemsHtml = matched.map((m, idx) => {
    const productListId = `salesAIProducts_${idx}`;
    const selectedLabel = m.match ? `${m.match.name} (${m.match.machineId})` : '';
    const productOptions = products.map(p =>
      `<option value="${escapeAttr(`${p.name} (${p.machineId})`)}" data-product-id="${escapeAttr(p.id)}"></option>`
    ).join('');

    return `
      <div class="ai-item-row" data-idx="${idx}">
        <div class="ai-item-header">
          <span class="ai-item-badge">#${idx + 1}</span>
          <span class="ai-item-name">AI识别: ${escapeHtml(m.ai.name)} × ${m.ai.quantity}</span>
          ${m.match ? `<span class="match-tag match-ok">${tablerIcon('circle-check')} 已匹配</span>` : `<span class="match-tag match-warn">${tablerIcon('alert-triangle')} 未匹配</span>`}
          <button class="btn btn-sm btn-ghost" style="color:var(--accent-red); padding:2px 8px; margin-left:8px;" onclick="removeSalesAIItem('${idx}')" title="删除此识别错误商品">${tablerIcon('trash')} 删除</button>
        </div>
        <div class="form-grid">
          <div class="form-group ai-product-select-group">
            <label>匹配商品</label>
            <input type="text" class="form-control form-input ai-product-search" list="${productListId}" value="${escapeAttr(selectedLabel)}" placeholder="输入商品名搜索" oninput="syncAISalesProductSearch(this)">
            <input type="hidden" class="sales-ai-product" value="${m.match ? escapeAttr(m.match.id) : ''}">
            <datalist id="${productListId}">${productOptions}</datalist>
          </div>
          <div class="form-group">
            <label>数量</label>
            <input type="number" class="form-control form-input sales-ai-qty" min="0" value="${m.ai.quantity || 0}" oninput="renderSalesAIWarnings()">
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="ai-result-form">
      <h4>${tablerIcon('circle-check')} AI 识别出 ${aiItems.length} 件商品</h4>
      <div class="ai-items-list">${itemsHtml}</div>
      <div style="margin-top: 10px; text-align: center;">
        <button class="btn btn-ghost btn-sm" onclick="addBlankSalesAIItem()">${tablerIcon('plus')} 手动添加漏识别的商品</button>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="form-group">
          <label>售货机</label>
          <select id="salesAIMachine" class="form-select">
            ${machines.map(m => optionHtml(m, m)).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>日期</label>
          <input type="datetime-local" id="salesAIDate" class="form-control form-input" value="${getNow()}">
        </div>
      </div>
      <div id="salesAIWarnings"></div>
      <div style="margin-top:16px; display:flex; gap:10px; justify-content:flex-end">
        <button class="btn btn-ghost" onclick="resetSalesImage()">重新识别</button>
        <button class="btn btn-primary" onclick="confirmAISales()">${tablerIcon('circle-check')} 录入销售</button>
      </div>
    </div>
  `;
  renderSalesAIWarnings();
}

function normalizeSalesMatchName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function scoreSalesNameMatch(source, target) {
  const a = normalizeSalesMatchName(source);
  const b = normalizeSalesMatchName(target);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))) return 0.88;

  let common = 0;
  let remaining = b;
  for (const ch of a) {
    const index = remaining.indexOf(ch);
    if (index !== -1) {
      common++;
      remaining = remaining.slice(0, index) + remaining.slice(index + 1);
    }
  }
  return common / Math.max(a.length, b.length);
}

function findBestSalesAIProductMatch(ai, products) {
  const candidates = [ai?.matchedName, ai?.name].filter(Boolean);
  const exactMatchedName = ai?.matchedName
    ? products.find(product => product.name === ai.matchedName)
    : null;
  if (exactMatchedName) return { match: exactMatchedName, score: 1 };

  const scored = [];
  for (const product of products) {
    let score = 0;
    for (const candidate of candidates) {
      score = Math.max(score, scoreSalesNameMatch(candidate, product.name));
    }
    scored.push({ product, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.45) return { match: null, score: best ? best.score : 0 };
  if (second && best.score < 0.9 && best.score - second.score < 0.08) {
    return { match: null, score: best.score };
  }
  return { match: best.product, score: best.score };
}

/**
 * 简单的模糊匹配：计算两个字符串的相似度
 */
function fuzzyMatch(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  
  // 计算共有字符比例（避免重复字符导致分数过高）
  let common = 0;
  const shorter = a.length < b.length ? a : b;
  let longer = a.length < b.length ? b : a;
  
  for (const ch of shorter) {
    const idx = longer.indexOf(ch);
    if (idx !== -1) {
      common++;
      // 把匹配过的字符删掉，防止 "维维维" 匹配 "维他奶" 得满分
      longer = longer.substring(0, idx) + longer.substring(idx + 1);
    }
  }
  return common / Math.max(a.length, b.length);
}

/**
 * 移除错误识别的销售AI商品行
 */
function removeSalesAIItem(idx) {
  const row = document.querySelector(`#salesAIResult .ai-item-row[data-idx="${idx}"]`);
  if (row) {
    row.remove();
  }
}

/**
 * 手动增加一行空白的商品输入
 */
async function addBlankSalesAIItem() {
  const list = document.querySelector('#salesAIResult .ai-items-list');
  if (!list) return;

  const products = await getAllProducts();
  const idx = 'manual_' + Date.now();
  
  const productListId = `salesAIProducts_${idx}`;
  const productOptions = products.map(p =>
    `<option value="${escapeAttr(`${p.name} (${p.machineId})`)}" data-product-id="${escapeAttr(p.id)}"></option>`
  ).join('');

  const html = `
    <div class="ai-item-row" data-idx="${idx}">
      <div class="ai-item-header">
        <span class="ai-item-badge" style="background:var(--accent-orange)">手动</span>
        <span class="ai-item-name">手动添加</span>
        <button class="btn btn-sm btn-ghost" style="color:var(--accent-red); padding:2px 8px; margin-left:8px;" onclick="removeSalesAIItem('${idx}')" title="删除此商品">${tablerIcon('trash')} 删除</button>
      </div>
      <div class="form-grid">
        <div class="form-group ai-product-select-group">
          <label>匹配商品</label>
          <input type="text" class="form-control form-input ai-product-search" list="${productListId}" placeholder="输入商品名搜索" oninput="syncAISalesProductSearch(this)">
          <input type="hidden" class="sales-ai-product" value="">
          <datalist id="${productListId}">${productOptions}</datalist>
        </div>
        <div class="form-group">
          <label>数量</label>
          <input type="number" class="form-control form-input sales-ai-qty" min="1" value="1" oninput="renderSalesAIWarnings()">
        </div>
      </div>
    </div>
  `;

  list.insertAdjacentHTML('beforeend', html);
  renderSalesAIWarnings();
}

/**
 * AI销售识别中同步可搜索商品输入框与隐藏商品ID
 */
function syncAISalesProductSearch(inputEl) {
  const group = inputEl.closest('.ai-product-select-group');
  if (!group) return;

  const productInput = group.querySelector('.sales-ai-product');
  const option = Array.from(group.querySelectorAll('datalist option'))
    .find(item => item.value === inputEl.value);
  if (productInput) {
    productInput.value = option ? option.dataset.productId || '' : '';
  }
  renderSalesAIWarnings();
}

async function renderSalesAIWarnings() {
  const container = document.getElementById('salesAIWarnings');
  if (!container) return;
  const products = await getAllProducts();
  const items = [];
  document.querySelectorAll('#salesAIResult .ai-item-row').forEach(row => {
    const productId = row.querySelector('.sales-ai-product')?.value;
    const qty = toInt(row.querySelector('.sales-ai-qty')?.value, 0);
    if (productId && qty > 0) items.push({ productId, quantity: qty });
  });
  container.innerHTML = buildWarningBox(collectSaleWarnings(items, products));
}

/**
 * 确认AI销售识别结果并录入
 */
async function confirmAISales() {
  const rows = document.querySelectorAll('#salesAIResult .ai-item-row');
  const machineId = document.getElementById('salesAIMachine').value;
  const date = document.getElementById('salesAIDate').value;

  const items = [];
  for (const row of rows) {
    const productId = row.querySelector('.sales-ai-product').value;
    const qty = parseInt(row.querySelector('.sales-ai-qty').value) || 0;
    if (productId && qty > 0) {
      items.push({ productId, quantity: qty });
    }
  }

  if (items.length === 0) {
    showToast('请至少匹配一个商品', 'error');
    return;
  }

  try {
    const products = await getAllProducts();
    const warnings = collectSaleWarnings(items, products);
    if (warnings.length > 0) {
      const confirmed = await showConfirm(warnings.join('\n') + '\n\n仍要继续录入销售吗？');
      if (!confirmed) return;
    }
    await addSale({ 
      machineId, 
      date, 
      items, 
      type: 'daily', 
      note: 'AI截图识别销售',
      imageBase64: window._tempSalesImageBase64 || null
    });
    window._tempSalesImageBase64 = null;

    showToast(`成功录入 ${items.length} 件商品的销售数据`);
    document.querySelector('.modal-overlay')?.querySelector('.modal-close')?.click();
    navigateTo('sales');
  } catch (err) {
    showToast('录入失败: ' + err.message, 'error');
  }
}

// ==================== AI 退款截图识别 ====================

async function showAIRefundRecognizeModal() {
  try {
    await ensureSelectedAIConfigured();
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const products = await getAllProducts();
  if (products.length === 0) {
    showToast('请先添加商品', 'error');
    return;
  }

  const html = `
    <div class="ai-recognize-section">
      <div class="upload-area" id="refundUploadArea">
        <div class="upload-icon">${tablerIcon('receipt-refund')}</div>
        <p>点击上传 / 拖拽 / <strong>Ctrl+V 粘贴</strong></p>
        <p class="upload-hint">上传带有【退款商品】信息的订单详情截图</p>
        <input type="file" id="refundImageInput" accept="image/*" style="display:none" onchange="handleRefundImageSelect(event)">
      </div>
      <div id="refundImagePreview" style="display:none">
        <div class="preview-header">
          <span>${tablerIcon('clipboard-check')} 已选择退款截图</span>
          <button class="btn btn-sm btn-ghost" onclick="resetRefundImage()">重新选择</button>
        </div>
        <img id="refundPreviewImg" class="order-preview-img" />
      </div>
      <div id="refundAIStatus" style="display:none">
        <div class="ai-loading">
          <div class="pulse-dot"></div>
          <p id="refundAIStatusText">AI 正在识别退款数据...</p>
        </div>
      </div>
      <div id="refundAIResult" style="display:none"></div>
    </div>
  `;

  await showModal(`${tablerIcon('receipt-refund')} AI 识别退款`, html, { hideFooter: true, wide: true });
}

// 事件绑定
document.addEventListener('click', (e) => {
  if (e.target.closest('#refundUploadArea')) {
    document.getElementById('refundImageInput')?.click();
  }
});
document.addEventListener('dragover', (e) => {
  if (e.target.closest('#refundUploadArea')) {
    e.preventDefault();
    e.target.closest('#refundUploadArea').classList.add('drag-over');
  }
});
document.addEventListener('dragleave', (e) => {
  if (e.target.closest('#refundUploadArea')) {
    e.target.closest('#refundUploadArea').classList.remove('drag-over');
  }
});
document.addEventListener('drop', (e) => {
  const area = e.target.closest('#refundUploadArea');
  if (area) {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processRefundImageFile(file);
  }
});
document.addEventListener('paste', (e) => {
  const area = document.getElementById('refundUploadArea');
  if (!area) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) processRefundImageFile(file);
      return;
    }
  }
});

function handleRefundImageSelect(event) {
  const file = event.target.files[0];
  if (file) processRefundImageFile(file);
}

function resetRefundImage() {
  document.getElementById('refundUploadArea').style.display = '';
  document.getElementById('refundImagePreview').style.display = 'none';
  document.getElementById('refundAIStatus').style.display = 'none';
  document.getElementById('refundAIResult').style.display = 'none';
}

async function processRefundImageFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    const mimeType = file.type;

    document.getElementById('refundUploadArea').style.display = 'none';
    document.getElementById('refundImagePreview').style.display = '';
    document.getElementById('refundPreviewImg').src = dataUrl;
    document.getElementById('refundAIStatus').style.display = '';

    try {
      const statusText = document.getElementById('refundAIStatusText');
      if (statusText) statusText.textContent = '正在压缩图片并上传给 AI...';
      const compressedBase64 = await compressImage(base64, mimeType);
      window._tempRefundImageBase64 = compressedBase64;
      const aiMimeType = 'image/jpeg';

      if (statusText) statusText.textContent = 'AI 正在识别退款数据...';
      const aiStart = Date.now();
      const onProgress = (evt) => {
        if (!statusText) return;
        const secs = ((Date.now() - aiStart) / 1000).toFixed(1);
        if (evt.phase === 'connected') {
          statusText.textContent = `AI 已连接，正在生成结果... 已等待 ${secs}s`;
        } else if (evt.phase === 'streaming') {
          const kb = (evt.bytes / 1024).toFixed(1);
          statusText.textContent = `AI 正在流式输出... 已等待 ${secs}s · ${kb} KB`;
        } else if (evt.phase === 'done') {
          statusText.textContent = `AI 已完成，正在解析数据... 用时 ${secs}s`;
        }
      };
      const result = await recognizeRefundImage(compressedBase64, aiMimeType, onProgress);
      document.getElementById('refundAIStatus').style.display = 'none';
      showRefundAIResult(result);
    } catch (err) {
      document.getElementById('refundAIStatus').style.display = 'none';
      document.getElementById('refundAIResult').style.display = '';
      document.getElementById('refundAIResult').innerHTML = `
        <div class="ai-error-box">
          <p>${tablerIcon('circle-x')} 识别失败: ${escapeHtml(err.message)}</p>
          <button class="btn btn-sm btn-ghost" onclick="resetRefundImage()">重新上传</button>
        </div>
      `;
    }
  };
  reader.readAsDataURL(file);
}

function removeRefundAIItem(idx) {
  const row = document.querySelector(`#refundAIResult .ai-item-row[data-idx="${idx}"]`);
  if (row) row.remove();
}

async function addBlankRefundAIItem() {
  const list = document.querySelector('#refundAIResult .ai-items-list');
  if (!list) return;

  const products = await getAllProducts();
  const idx = 'refund_manual_' + Date.now();
  
  const productOptions = products.map(p =>
    optionHtml(p.id, `${p.name} (${p.machineId})`)
  ).join('');

  const html = `
    <div class="ai-item-row" data-idx="${idx}">
      <div class="ai-item-header">
        <span class="ai-item-badge" style="background:var(--accent-orange)">手动</span>
        <span class="ai-item-name">手动添加退款商品</span>
        <button class="btn btn-sm btn-ghost" style="color:var(--accent-red); padding:2px 8px; margin-left:8px;" onclick="removeRefundAIItem('${idx}')" title="删除此商品">${tablerIcon('trash')} 删除</button>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>退款商品</label>
          <select class="form-select refund-ai-product" onchange="renderRefundAIWarnings()">
            <option value="">-- 请选择退款商品 --</option>
            ${productOptions}
          </select>
        </div>
        <div class="form-group">
          <label>退回库存数</label>
          <input type="number" class="form-control form-input refund-ai-qty" min="0" value="1" oninput="renderRefundAIWarnings()">
        </div>
        <div class="form-group">
          <label>实际退款额</label>
          <input type="number" class="form-control form-input refund-ai-amount" step="0.01" min="0" placeholder="默认全额" oninput="renderRefundAIWarnings()">
        </div>
      </div>
    </div>
  `;

  list.insertAdjacentHTML('beforeend', html);
}

async function showRefundAIResult(result) {
  const machines = await getMachines();
  const products = await getAllProducts();
  const container = document.getElementById('refundAIResult');
  container.style.display = '';

  const aiItems = result.items || [];
  
  const matched = aiItems.map(ai => {
    let bestMatch = null;
    let bestScore = 0;
    for (const p of products) {
      const score = fuzzyMatch(ai.name, p.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }
    return { ai, match: bestScore > 0.3 ? bestMatch : null };
  });

  const itemsHtml = matched.map((m, idx) => {
    const productOptions = products.map(p =>
      optionHtml(p.id, `${p.name} (${p.machineId})`, !!(m.match && m.match.id === p.id))
    ).join('');

    return `
      <div class="ai-item-row" data-idx="${idx}">
        <div class="ai-item-header">
          <span class="ai-item-badge" style="background:var(--accent-red)">退款</span>
          <span class="ai-item-name">识别: ${escapeHtml(m.ai.name)} × ${m.ai.quantity}</span>
          ${m.match ? `<span class="match-tag match-ok">${tablerIcon('circle-check')} 已匹配</span>` : `<span class="match-tag match-warn">${tablerIcon('alert-triangle')} 未匹配</span>`}
          <button class="btn btn-sm btn-ghost" style="color:var(--accent-red); padding:2px 8px; margin-left:8px;" onclick="removeRefundAIItem('${idx}')" title="删除">${tablerIcon('trash')} 删除</button>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>退款商品</label>
            <select class="form-select refund-ai-product" onchange="renderRefundAIWarnings()">
              <option value="">-- 跳过此项 --</option>
              ${productOptions}
            </select>
          </div>
          <div class="form-group">
            <label>退回库存数</label>
            <input type="number" class="form-control form-input refund-ai-qty" min="0" value="${m.ai.quantity || 0}" oninput="renderRefundAIWarnings()">
          </div>
          <div class="form-group">
            <label>实际退款额</label>
            <input type="number" class="form-control form-input refund-ai-amount" step="0.01" min="0" value="${m.ai.refundAmount !== undefined ? m.ai.refundAmount : (result.totalRefundAmount !== undefined && aiItems.length === 1 ? result.totalRefundAmount : '')}" placeholder="默认全额" oninput="renderRefundAIWarnings()">
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="ai-result-form">
      <h4>${tablerIcon('circle-check')} AI 识别出 ${aiItems.length} 件退款商品</h4>
      <div class="ai-items-list">${itemsHtml}</div>
      <div style="margin-top: 10px; text-align: center;">
        <button class="btn btn-ghost btn-sm" onclick="addBlankRefundAIItem()">${tablerIcon('plus')} 手动添加漏识别的退款商品</button>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="form-group">
          <label>退款归属售货机</label>
          <select id="refundAIMachine" class="form-select">
            ${machines.map(m => optionHtml(m, m)).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>退款归属时间 (用于冲抵该月销售额)</label>
          <input type="datetime-local" id="refundAIDate" class="form-control form-input" value="${result.orderDate || getNow()}">
        </div>
      </div>

      <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
        <label style="display:flex; align-items:center; cursor:pointer;">
          <input type="checkbox" id="refundAITestMode" style="margin-right:8px; width:16px; height:16px;">
          <strong>这是一个“机器调试单”</strong>
          <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">(选中后仅退回库存，总价和利润计为0，不影响财务报表)</span>
        </label>
      </div>
      <p class="text-muted" style="margin-top:8px; font-size:12px;">提示：退款将自动作为负数录入，冲抵所选月份的销售额和利润，并归还商品库存。</p>
      <div id="refundAIWarnings"></div>
      <div style="margin-top:16px; display:flex; gap:10px; justify-content:flex-end">
        <button class="btn btn-ghost" onclick="resetRefundImage()">重新识别</button>
        <button class="btn btn-accent" onclick="confirmAIRefund()">${tablerIcon('receipt-refund')} 确认冲账</button>
      </div>
    </div>
  `;
  renderRefundAIWarnings();
}

async function renderRefundAIWarnings() {
  const container = document.getElementById('refundAIWarnings');
  if (!container) return;
  const products = await getAllProducts();
  const warnings = [];
  document.querySelectorAll('#refundAIResult .ai-item-row').forEach(row => {
    const productId = row.querySelector('.refund-ai-product')?.value;
    const qty = toInt(row.querySelector('.refund-ai-qty')?.value, 0);
    const amount = toNumber(row.querySelector('.refund-ai-amount')?.value, 0);
    const product = products.find(p => p.id === productId);
    if (!product || !productId) return;
    if (qty >= 30) warnings.push(`${product.name}: 退款退回 ${qty} 件，请确认数量`);
    if (amount > 0 && qty > 0 && product.sellPrice > 0 && amount > product.sellPrice * qty * 1.2) {
      warnings.push(`${product.name}: 退款额 ${formatMoney(amount)} 明显高于按零售价计算的 ${formatMoney(product.sellPrice * qty)}`);
    }
  });
  container.innerHTML = buildWarningBox(warnings);
}

async function confirmAIRefund() {
  const rows = document.querySelectorAll('#refundAIResult .ai-item-row');
  const machineId = document.getElementById('refundAIMachine').value;
  const date = document.getElementById('refundAIDate').value;
  const products = await getAllProducts();

  const items = [];
  for (const row of rows) {
    const productId = row.querySelector('.refund-ai-product').value;
    const qty = parseInt(row.querySelector('.refund-ai-qty').value) || 0;
    const amountStr = row.querySelector('.refund-ai-amount').value;
    
    if (productId) {
      let amount = 0;
      if (amountStr !== '') {
        amount = parseFloat(amountStr);
      } else {
        const prod = products.find(p => p.id === productId);
        amount = (prod ? prod.sellPrice : 0) * qty;
      }

      if (qty > 0 || amount > 0) {
        const prod = products.find(p => p.id === productId);
        items.push({ 
          productId, 
          quantity: -qty,
          itemRevenue: -amount,
          itemCogs: -(qty * (prod ? prod.avgCost : 0))
        });
      }
    }
  }

  if (items.length === 0) {
    showToast('请至少匹配一个退款商品', 'error');
    return;
  }

  try {
    const refundWarnings = [];
    items.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return;
      const qty = Math.abs(item.quantity || 0);
      const amount = Math.abs(item.itemRevenue || 0);
      if (qty >= 30) refundWarnings.push(`${prod.name}: 退款退回 ${qty} 件，请确认数量`);
      if (amount > 0 && qty > 0 && prod.sellPrice > 0 && amount > prod.sellPrice * qty * 1.2) {
        refundWarnings.push(`${prod.name}: 退款额 ${formatMoney(amount)} 明显高于按零售价计算的 ${formatMoney(prod.sellPrice * qty)}`);
      }
    });
    if (refundWarnings.length > 0) {
      const confirmed = await showConfirm(refundWarnings.join('\n') + '\n\n仍要继续冲账吗？');
      if (!confirmed) return;
    }
    await addSale({ 
      machineId, 
      date, 
      items, 
      type: 'refund', 
      note: 'AI识别订单退款冲账',
      imageBase64: window._tempRefundImageBase64 || null
    });
    window._tempRefundImageBase64 = null;

    showToast(`成功录入 ${items.length} 件退款商品冲账`);
    document.querySelector('.modal-overlay')?.querySelector('.modal-close')?.click();
    navigateTo('sales');
  } catch (err) {
    showToast('冲账失败: ' + err.message, 'error');
  }
}

/**
 * 显示登记损耗对话框
 */
async function showAddLossModal() {
  const machines = await getMachines();
  const products = await getAllProducts();

  if (products.length === 0) {
    showToast('请先添加商品', 'error');
    return;
  }

  const grouped = {};
  machines.forEach(m => grouped[m] = []);
  products.forEach(p => {
    if (grouped[p.machineId]) grouped[p.machineId].push(p);
  });

  const html = `
    <div class="form-grid">
      <div class="form-group">
        <label>售货机 <span class="required">*</span></label>
        <select id="lossMachine" class="form-select" onchange="onLossMachineChange()">
          ${machines.map(m => optionHtml(m, m)).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>日期 <span class="required">*</span></label>
        <input type="datetime-local" id="lossDate" class="form-control form-input" value="${getNow()}">
      </div>
      <div class="form-group full-width">
        <label>备注 (损耗原因)</label>
        <input type="text" id="lossNote" class="form-control form-input" placeholder="如：过期、损坏、丢失">
      </div>
    </div>

    <div class="sale-items-section">
      <div class="section-header">
        <h4>${tablerIcon('list-details')} 损耗商品数量</h4>
      </div>
      <div id="lossItemsContainer">
        ${products.map(p => `
          <div class="sale-item-row" data-machine="${escapeAttr(p.machineId)}">
            <span class="sale-item-name">
              ${escapeHtml(p.name)}
              <small class="text-muted">(成本:${formatMoney(p.avgCost)} / 库存:${p.currentStock || 0})</small>
            </span>
            <div class="sale-item-input">
              <input type="number" class="form-control form-input form-input-sm loss-item-qty"
                data-product-id="${p.id}"
                data-avg-cost="${p.avgCost || 0}"
                min="0" value="" placeholder="0"
                oninput="calcLossTotal()">
              <span>件</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="purchase-summary">
      <div class="summary-item">
        <span>损耗成本总计:</span>
        <span class="summary-value text-red" id="lossCalcCogs">¥0.00</span>
      </div>
    </div>
  `;

  const result = await new Promise(resolve => {
    showModal(`${tablerIcon('trash')} 登记损耗`, html, { 
      submitText: '提交损耗', 
      wide: true, 
      onReady: (overlay, close) => {
        onLossMachineChange();
        
        const submitBtn = overlay.querySelector('#modalSubmit');
        submitBtn.replaceWith(submitBtn.cloneNode(true));
        const newSubmitBtn = overlay.querySelector('#modalSubmit');
        
        newSubmitBtn.addEventListener('click', async () => {
          const items = [];
          const qtyInputs = overlay.querySelectorAll('.loss-item-qty');
          qtyInputs.forEach(input => {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
              items.push({
                productId: input.dataset.productId,
                quantity: qty,
                itemRevenue: 0 // 损耗没有收入
              });
            }
          });

          if (items.length === 0) {
            showToast('请至少输入一个损耗商品数量', 'error');
            return;
          }

          try {
            const warnings = collectSaleWarnings(items, products);
            if (warnings.length > 0) {
              const confirmed = await showConfirm(warnings.join('\n') + '\n\n仍要继续登记损耗吗？');
              if (!confirmed) return;
            }
            await addSale({
              machineId: overlay.querySelector('#lossMachine').value,
              date: overlay.querySelector('#lossDate').value,
              items: items,
              type: 'loss',
              note: overlay.querySelector('#lossNote').value.trim()
            });

            showToast('损耗已登记，库存和成本已更新');
            close(true);
            navigateTo('sales');
          } catch (err) {
            showToast('登记失败: ' + err.message, 'error');
          }
        });
      }
    });
  });
}

function onLossMachineChange() {
  const machine = document.getElementById('lossMachine')?.value;
  if (!machine) return;
  const rows = document.querySelectorAll('.sale-item-row');
  rows.forEach(row => {
    // We reuse sale-item-row class, so we need to filter if it's inside lossItemsContainer
    if (row.closest('#lossItemsContainer')) {
      row.style.display = row.dataset.machine === machine ? '' : 'none';
    }
  });
}

function calcLossTotal() {
  let cogs = 0;
  const qtyInputs = document.querySelectorAll('.loss-item-qty');
  qtyInputs.forEach(input => {
    const qty = parseInt(input.value) || 0;
    if (qty > 0) {
      cogs += qty * (parseFloat(input.dataset.avgCost) || 0);
    }
  });
  const cogsEl = document.getElementById('lossCalcCogs');
  if (cogsEl) cogsEl.textContent = formatMoney(cogs);
}

