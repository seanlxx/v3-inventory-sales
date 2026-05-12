/**
 * 商品管理模块
 */

const PRODUCT_ALL_MACHINES_VALUE = '';
const PRODUCT_ALL_MACHINES_LABEL = '全部机器';

function normalizeProductMachineId(machineId) {
  return String(machineId || '').trim();
}

function getProductMachineOptions(configuredMachines = [], products = []) {
  const seenMachines = new Set();
  const machineOptions = [];
  const addMachine = (machineId) => {
    const normalizedMachineId = normalizeProductMachineId(machineId);
    if (!normalizedMachineId || seenMachines.has(normalizedMachineId)) return;
    seenMachines.add(normalizedMachineId);
    machineOptions.push(normalizedMachineId);
  };

  configuredMachines.forEach(addMachine);
  products.forEach(product => addMachine(product?.machineId));
  return machineOptions;
}

function getActiveProductMachine(savedMachine, machineOptions = []) {
  const normalizedMachineId = normalizeProductMachineId(savedMachine);
  return normalizedMachineId && machineOptions.includes(normalizedMachineId) ? normalizedMachineId : PRODUCT_ALL_MACHINES_VALUE;
}

function productMatchesSearch(product, searchText) {
  const normalizedSearch = String(searchText || '').trim().toLowerCase();
  if (!normalizedSearch) return true;
  return `${product?.name || ''} ${product?.machineId || ''}`.toLowerCase().includes(normalizedSearch);
}

function productMatchesProductFilters(product, filters = {}) {
  const activeMachine = normalizeProductMachineId(filters.machine);
  const activeCategory = filters.category || 'all';
  const matchMachine = !activeMachine || normalizeProductMachineId(product.machineId) === activeMachine;
  const matchCategory = !activeCategory || activeCategory === 'all' || product.category === activeCategory;
  return matchMachine && matchCategory && productMatchesSearch(product, filters.search);
}

function renderProductMachineFilterOptions(machineOptions = [], activeMachine = PRODUCT_ALL_MACHINES_VALUE) {
  return [
    optionHtml(PRODUCT_ALL_MACHINES_VALUE, PRODUCT_ALL_MACHINES_LABEL, activeMachine === PRODUCT_ALL_MACHINES_VALUE),
    ...machineOptions.map(machineId => optionHtml(machineId, machineId, machineId === activeMachine))
  ].join('');
}

async function renderProductsPage() {
  const uiState = getPageUiState('products');
  const cached = getPageData('products');
  const useCache = cached && !isPageDirty('products');
  let products, sales;
  if (useCache) {
    ({ products, sales } = cached);
  } else {
    [products, sales] = await Promise.all([
      getAllProducts(),
      getRecentSales(7)
    ]);
  }
  const businessSettings = await getBusinessSettings();

  // 计算近7天每个商品的销量
  const recentDays = getRecentDays(7);
  const salesByProduct = {};
  sales.forEach(s => {
    if (s.type === 'daily' && s.items) {
      const saleDay = (s.date || '').split('T')[0].split(' ')[0];
      const dayIndex = recentDays.indexOf(saleDay);
      if (dayIndex !== -1) {
        s.items.forEach(item => {
          if (item.productId) {
            if (!salesByProduct[item.productId]) {
              salesByProduct[item.productId] = { total: 0, daily: [0,0,0,0,0,0,0] };
            }
            salesByProduct[item.productId].total += (item.quantity || 0);
            salesByProduct[item.productId].daily[dayIndex] += (item.quantity || 0);
          }
        });
      }
    }
  });

  // 存储到全局供刷新使用
  window._productSalesMap = salesByProduct;
  setPageData('products', {
    products,
    sales,
    salesByProduct,
    recentDays
  });
  consumePageDirty('products');

  // 恢复排序状态，默认按销量降序；保留用户显式取消的空状态
  const hasSavedSortState = Object.prototype.hasOwnProperty.call(uiState, 'sortState');
  window._productSortState = hasSavedSortState ? uiState.sortState : { key: 'sales', dir: 'desc' };
  if (!hasSavedSortState) {
    updatePageUiState('products', { sortState: window._productSortState });
  }

  const configuredMachines = await getMachines();
  const machines = getProductMachineOptions(configuredMachines, products);
  const activeMachine = getActiveProductMachine(uiState.machine, machines);
  const activeCategory = uiState.category || 'all';
  const activeSearch = uiState.search || '';
  const normalizedUiMachine = normalizeProductMachineId(uiState.machine);
  if (normalizedUiMachine !== activeMachine) {
    updatePageUiState('products', { machine: activeMachine });
  }
  const filteredProducts = products.filter(product => productMatchesProductFilters(product, {
    machine: activeMachine,
    category: activeCategory,
    search: activeSearch
  }));
  sortProductList(filteredProducts, window._productSortState, salesByProduct);
  const pager = getPaginatedItems('products', 'records', filteredProducts);
  const theadHtml = `
    <thead><tr>
      <th class="th-sortable" data-sort-key="name" onclick="toggleHeaderSort(this)">商品 <span class="sort-arrow"></span></th>
      <th class="th-sortable" data-sort-key="sellprice" onclick="toggleHeaderSort(this)">零售价 <span class="sort-arrow"></span></th>
      <th class="th-sortable" data-sort-key="avgcost" onclick="toggleHeaderSort(this)">进货均价 <span class="sort-arrow"></span></th>
      <th class="th-sortable" data-sort-key="profit" onclick="toggleHeaderSort(this)">单品利润 <span class="sort-arrow"></span></th>
      <th class="th-sortable" data-sort-key="profitrate" onclick="toggleHeaderSort(this)">利润率 <span class="sort-arrow"></span></th>
      <th class="th-sortable" data-sort-key="stock" onclick="toggleHeaderSort(this)">库存 <span class="sort-arrow"></span></th>
      <th class="th-sortable" data-sort-key="sales" onclick="toggleHeaderSort(this)">近7天销量 <span class="sort-arrow">↓</span></th>
      <th class="th-sortable" data-sort-key="totalpurchase" onclick="toggleHeaderSort(this)">累计进货 <span class="sort-arrow"></span></th>
      <th style="text-align:right">操作</th>
    </tr></thead>`;

  // 初始化箭头显示（延迟到DOM就绪）
  setTimeout(() => { updateSortArrows(); }, 0);
  const html = `
    <div class="products-page page-stack container-xl">
    <!-- 商品列表 -->
    <div class="products-table-card card">
      <div class="card-header product-table-title card-toolbar product-card-toolbar">
        <h3 class="card-title">商品列表</h3>
        <label class="toolbar-field product-table-control"><span>售货机</span>
            <select id="productMachineFilter" class="form-select form-select-sm" onchange="filterProducts()">
              ${renderProductMachineFilterOptions(machines, activeMachine)}
            </select>
        </label>
        <label class="toolbar-field product-table-control"><span>分类</span>
            <select id="productCategoryFilter" class="form-select form-select-sm" onchange="filterProducts()">
              <option value="all" ${activeCategory === 'all' ? 'selected' : ''}>全部</option>
              ${CATEGORIES.map(c => optionHtml(c, c, c === activeCategory)).join('')}
            </select>
        </label>
        <input type="text" id="productSearch" class="form-control form-input form-input-sm toolbar-search product-table-search"
          placeholder="搜索商品名称..." value="${escapeAttr(activeSearch)}" oninput="filterProductsDebounced()">
        <span class="badge toolbar-badge">${filteredProducts.length} 种商品</span>
        <div class="card-action-bar product-action-bar">
          <button class="btn btn-ghost btn-outline-secondary" onclick="exportProductsCSV()" title="导出CSV">
            ${tablerIcon('download', 'btn-icon-left')} 导出
          </button>
          <label class="btn btn-ghost btn-outline-secondary" title="导入CSV">
            ${tablerIcon('upload', 'btn-icon-left')} 导入
            <input type="file" id="importCsvFile" accept=".csv" style="display:none;" onchange="importProductsCSV(event)">
          </label>
          <button class="btn btn-primary" onclick="showAddProductModal()">
            ${tablerIcon('plus', 'btn-icon-left')} 添加商品
          </button>
        </div>
      </div>
      <div class="table-responsive products-table">
        <table class="data-table table card-table table-vcenter">
          ${theadHtml}
          <tbody class="productsGrid" data-machine="records">
            ${filteredProducts.length === 0 ?
            `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">${tablerIcon('package')}</div><p>暂无商品</p></div></td></tr>` :
            pager.items.map(p => renderProductRow(p, salesByProduct[p.id] || { total: 0, daily: [0,0,0,0,0,0,0] }, recentDays, businessSettings.lowStockThreshold)).join('')}
          </tbody>
        </table>
      </div>
      ${renderPaginationDock('products', 'records', pager, 'refreshProductsGrid')}
    </div>
    </div>
  `;

  requestAnimationFrame(() => {
    if (currentPage === 'products') {
      updateSortArrows();
      sortProducts();
      filterProducts();
    }
  });

  return html;
}

function renderProductRow(p, salesData, recentDays, lowStockThreshold = BUSINESS_DEFAULTS.lowStockThreshold) {
  const sellPrice = p.sellPrice || 0;
  const avgCost = p.avgCost || 0;
  const hasCost = avgCost > 0;
  const profitPerUnit = hasCost ? sellPrice - avgCost : 0;
  const profitRate = hasCost && sellPrice > 0 ? ((profitPerUnit / sellPrice) * 100) : 0;
  
  const sales7d = salesData ? salesData.total : 0;
  const dailySales = salesData ? salesData.daily : [0,0,0,0,0,0,0];
  const productId = escapeAttr(p.id);
  const productName = escapeHtml(p.name);
  const productNameAttr = escapeAttr(p.name);
  const machineId = escapeAttr(p.machineId);
  const category = escapeAttr(p.category);
  const salesTrendHtml = renderProductSalesTrend(dailySales, recentDays, productName);

  return `
    <tr class="product-row" onclick="showProductHistoryModal('${productId}')" data-id="${productId}" data-machine="${machineId}" data-category="${category}" data-name="${productNameAttr}" data-sellprice="${sellPrice}" data-avgcost="${avgCost}" data-profit="${profitPerUnit}" data-profitrate="${profitRate}" data-stock="${p.currentStock || 0}" data-sales="${sales7d}" data-totalpurchase="${p.totalPurchaseQty || 0}" style="cursor: pointer;">
      <td class="product-name-cell">
        <div style="font-weight: 600; margin-bottom: 4px; font-size: 14px;">${productName}</div>
        <div style="display: flex; gap: 4px;">
          <span class="tag tag-machine">${escapeHtml(p.machineId)}</span>
          <span class="tag tag-category">${escapeHtml(p.category)}</span>
        </div>
      </td>
      <td class="product-price-cell text-bold">${formatMoney(sellPrice)}</td>
      <td class="product-cost-cell" title="${hasCost ? `参考整箱: 12个=¥${formatNumber(avgCost * 12)} | 15个=¥${formatNumber(avgCost * 15)} | 24个=¥${formatNumber(avgCost * 24)}` : ''}" style="cursor: help;">
        ${hasCost ? formatMoney(avgCost) : '<span class="text-muted">暂无</span>'}
      </td>
      <td class="product-profit-cell ${profitPerUnit > 0 ? 'text-green' : 'text-red'} text-bold">
        ${hasCost ? formatMoney(profitPerUnit) : '-'}
      </td>
      <td class="product-rate-cell ${profitRate > 0 ? 'text-green' : 'text-red'}">
        ${hasCost ? `${formatNumber(profitRate, 1)}%` : '-'}
      </td>
      <td class="product-stock-cell ${(p.currentStock || 0) <= lowStockThreshold ? 'text-red text-bold' : 'text-bold'}">
        ${p.currentStock || 0}
      </td>
      <td class="product-sales-td">
        <div class="product-sales-cell">
          <div class="product-sales-summary">
            <span class="product-sales-value ${sales7d > 0 ? 'text-green' : 'text-muted'}">${sales7d} 件</span>
          </div>
          ${salesTrendHtml}
        </div>
      </td>
      <td class="product-total-purchase-td text-muted">${p.totalPurchaseQty || 0}</td>
      <td class="product-actions-td" style="text-align: right; white-space: nowrap;">
        <button class="btn btn-icon btn-sm product-action-btn" onclick="event.stopPropagation(); showEditProductModal('${productId}')" title="编辑" aria-label="编辑">
          ${tablerIcon('pencil', 'action-icon')}
        </button>
        <button class="btn btn-icon btn-sm btn-danger-ghost product-action-btn" onclick="event.stopPropagation(); handleDeleteProduct('${productId}')" title="删除" aria-label="删除">
          ${tablerIcon('trash', 'action-icon')}
        </button>
      </td>
    </tr>
  `;
}

function renderProductSalesTrend(dailySales, recentDays, productName = '') {
  const width = 136;
  const height = 40;
  const padX = 7;
  const padTop = 5;
  const padBottom = 7;
  const values = Array.isArray(dailySales) && dailySales.length ? dailySales : [0,0,0,0,0,0,0];
  const maxVal = Math.max(...values, 1);
  const plotWidth = width - padX * 2;
  const plotHeight = height - padTop - padBottom;
  const bottomY = padTop + plotHeight;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : padX + (plotWidth * index) / (values.length - 1);
    const y = bottomY - ((value || 0) / maxVal) * plotHeight;
    return { value: value || 0, x, y, date: recentDays?.[index] || '', index };
  });
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${bottomY.toFixed(2)} L ${points[0].x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
  const hitWidth = plotWidth / Math.max(values.length - 1, 1);

  return `
    <div class="product-sales-trend" onclick="event.stopPropagation()">
      <svg class="product-sales-line-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(productName)} 每日销售趋势">
        <path class="product-sales-line-area" d="${areaPath}"></path>
        <path class="product-sales-line-path" d="${linePath}"></path>
        ${points.map(point => `
          <g class="product-sales-point" tabindex="0" focusable="true" role="button" aria-label="${escapeAttr(formatProductSalesTrendLabel(point))}" data-index="${point.index}" data-date="${escapeAttr(point.date)}" data-value="${point.value}" onmousemove="showProductSalesTrendTooltip(event, this)" onmouseenter="showProductSalesTrendTooltip(event, this)" onfocus="showProductSalesTrendTooltip(null, this)" onmouseleave="hideProductSalesTrendTooltip(this)" onblur="hideProductSalesTrendTooltip(this)">
            <title>${escapeHtml(formatProductSalesTrendLabel(point))}</title>
            <rect class="product-sales-hit-zone" x="${(point.x - hitWidth / 2).toFixed(2)}" y="0" width="${hitWidth.toFixed(2)}" height="${height}"></rect>
            <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.8"></circle>
          </g>
        `).join('')}
      </svg>
      <div class="product-sales-tooltip" role="status"></div>
    </div>
  `;
}

function formatProductSalesTrendLabel(point) {
  const date = point.date ? point.date.substring(5) : '当天';
  return `${date} 销售 ${point.value} 件`;
}

function showProductSalesTrendTooltip(event, target) {
  const chart = target.closest('.product-sales-trend');
  if (!chart) return;
  const tooltip = chart.querySelector('.product-sales-tooltip');
  if (!tooltip) return;

  tooltip.innerHTML = `
    <strong>${escapeHtml((target.dataset.date || '').substring(5) || '当天')}</strong>
    <span>${toInt(target.dataset.value, 0)} 件</span>
  `;

  const chartRect = chart.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clientX = event?.clientX ?? (targetRect.left + targetRect.width / 2);
  const x = Math.min(Math.max(clientX - chartRect.left, 12), chartRect.width - 12);

  tooltip.style.left = `${x}px`;
  tooltip.classList.add('is-visible');
  chart.querySelectorAll('.product-sales-point.is-active').forEach(el => el.classList.remove('is-active'));
  target.classList.add('is-active');
}

function hideProductSalesTrendTooltip(target) {
  const chart = target.closest('.product-sales-trend');
  if (!chart) return;
  chart.querySelector('.product-sales-tooltip')?.classList.remove('is-visible');
  chart.querySelectorAll('.product-sales-point.is-active').forEach(el => el.classList.remove('is-active'));
}

/**
 * 局部刷新商品列表，保留搜索和筛选状态
 */
async function refreshProductsGrid() {
  const grids = document.querySelectorAll('.productsGrid');
  if (grids.length === 0) return;
  
  const products = await getAllProducts();
  const salesMap = window._productSalesMap || {};
  const recentDays = getRecentDays(7);
  const businessSettings = await getBusinessSettings();
  const configuredMachines = await getMachines();
  const machines = getProductMachineOptions(configuredMachines, products);
  const machineSelect = document.getElementById('productMachineFilter');
  const productUiState = getPageUiState('products');
  const activeMachine = getActiveProductMachine(machineSelect ? machineSelect.value : productUiState.machine, machines);
  if (machineSelect) {
    machineSelect.innerHTML = renderProductMachineFilterOptions(machines, activeMachine);
    machineSelect.value = activeMachine;
  }
  const activeCategory = document.getElementById('productCategoryFilter')?.value || productUiState.category || 'all';
  const activeSearch = document.getElementById('productSearch')?.value ?? productUiState.search ?? '';
  updatePageUiState('products', { machine: activeMachine, category: activeCategory, search: activeSearch });
  setPageData('products', {
    ...(getPageData('products') || {}),
    products,
    salesByProduct: salesMap,
    recentDays
  });

  grids.forEach(grid => {
    const filteredProducts = products.filter(product => productMatchesProductFilters(product, {
      machine: activeMachine,
      category: activeCategory,
      search: activeSearch
    }));
    sortProductList(filteredProducts, window._productSortState, salesMap);
    const pager = getPaginatedItems('products', 'records', filteredProducts);
    grid.innerHTML = filteredProducts.length === 0 ?
      `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">${tablerIcon('package')}</div><p>暂无商品</p></div></td></tr>` :
      pager.items.map(p => renderProductRow(p, salesMap[p.id] || { total: 0, daily: [0,0,0,0,0,0,0] }, recentDays, businessSettings.lowStockThreshold)).join('');
    const tableWrap = grid.closest('.table-responsive');
    const existingDock = tableWrap?.querySelector('.mobile-pagination-dock');
    existingDock?.remove();
    tableWrap?.insertAdjacentHTML('beforeend', renderPaginationDock('products', 'records', pager, 'refreshProductsGrid'));
    const badge = tableWrap?.querySelector('.product-table-title .badge');
    if (badge) badge.textContent = filteredProducts.length + ' 种商品';
  });
    
  filterProducts();
  sortProducts();
  consumePageDirty('products');
}

/**
 * 筛选商品
 */
function filterProducts() {
  const uiState = getPageUiState('products');
  const machineSelect = document.getElementById('productMachineFilter');
  const categorySelect = document.getElementById('productCategoryFilter');
  const searchInput = document.getElementById('productSearch');
  const machine = machineSelect ? machineSelect.value : normalizeProductMachineId(uiState.machine);
  const category = categorySelect ? categorySelect.value : uiState.category || 'all';
  const searchRaw = searchInput ? searchInput.value : uiState.search || '';
  const search = searchRaw.toLowerCase();
  const filterChanged = machine !== normalizeProductMachineId(uiState.machine) || category !== (uiState.category || 'all') || searchRaw !== (uiState.search || '');
  if (filterChanged) {
    setPaginationPage('products', 'records', 1);
  }
  updatePageUiState('products', { machine, category, search: searchRaw });

  if (filterChanged) {
    refreshProductsGrid();
    return;
  }

  // Row filtering by machine, category, and search (across all panels)
  const rows = document.querySelectorAll('.product-row');
  rows.forEach(row => {
    const matchMachine = !machine || row.dataset.machine === machine;
    const matchCategory = !category || category === 'all' || row.dataset.category === category;
    const rowSearchText = `${row.dataset.name || ''} ${row.dataset.machine || ''}`.toLowerCase();
    const matchSearch = !search || rowSearchText.includes(search);
    row.style.display = (matchMachine && matchCategory && matchSearch) ? '' : 'none';
  });

  if (window._productSortState) {
    sortProducts();
  }
}
/**
 * 当前排序状态: { key: string, dir: 'asc'|'desc' } | null
 */
window._productSortState = null;

/**
 * 点击表头切换排序
 */
async function toggleHeaderSort(thEl) {
  const key = thEl.dataset.sortKey;
  if (!key) return;

  const state = window._productSortState;
  if (state && state.key === key) {
    // 同列: asc -> desc -> 取消
    if (state.dir === 'asc') {
      window._productSortState = { key, dir: 'desc' };
    } else {
      window._productSortState = null;
    }
  } else {
    // 新列: 默认升序
    window._productSortState = { key, dir: 'asc' };
  }
  updatePageUiState('products', { sortState: window._productSortState });

  updateSortArrows();
  if (isMobilePaginationViewport()) {
    await refreshProductsGrid();
  } else {
    sortProducts();
  }
}

/**
 * 更新表头排序箭头
 */
function updateSortArrows() {
  const allTh = document.querySelectorAll('.products-table .th-sortable');
  const state = window._productSortState;
  allTh.forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    th.classList.remove('sort-asc', 'sort-desc');
    if (state && th.dataset.sortKey === state.key) {
      th.classList.add(state.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      arrow.textContent = state.dir === 'asc' ? ' ↑' : ' ↓';
    } else {
      arrow.textContent = '';
    }
  });
}

window.filterProductsDebounced = debounce(filterProducts, 120);

function getProductSortValue(product, key, salesMap = {}) {
  switch (key) {
    case 'name':
      return product.name || '';
    case 'sellprice':
      return toNumber(product.sellPrice, 0);
    case 'avgcost':
      return toNumber(product.avgCost, 0);
    case 'profit':
      return toNumber(product.sellPrice, 0) - toNumber(product.avgCost, 0);
    case 'stock':
      return toInt(product.currentStock, 0);
    case 'sales':
      return toInt((salesMap[product.id] || { total: 0 }).total, 0);
    case 'profitrate': {
      const sellPrice = toNumber(product.sellPrice, 0);
      const avgCost = toNumber(product.avgCost, 0);
      return avgCost > 0 && sellPrice > 0 ? ((sellPrice - avgCost) / sellPrice) * 100 : 0;
    }
    case 'totalpurchase':
      return toInt(product.totalPurchaseQty, 0);
    default:
      return 0;
  }
}

function sortProductList(products, state, salesMap = {}) {
  if (!Array.isArray(products) || !state) return products;
  const { key, dir } = state;
  const mult = dir === 'asc' ? 1 : -1;
  products.sort((a, b) => {
    const valA = getProductSortValue(a, key, salesMap);
    const valB = getProductSortValue(b, key, salesMap);
    if (key === 'name') return String(valA).localeCompare(String(valB), 'zh-CN') * mult;
    return (valA - valB) * mult;
  });
  return products;
}

/**
 * 排序商品
 */
function sortProducts() {
  const state = window._productSortState;
  if (!state) return;

  const grids = document.querySelectorAll('.productsGrid');
  grids.forEach(grid => {
    const cards = Array.from(grid.querySelectorAll('.product-row'));
    if (cards.length === 0) return;

    const { key, dir } = state;
    const mult = dir === 'asc' ? 1 : -1;

    cards.sort((a, b) => {
      let valA, valB;
      switch (key) {
        case 'name':
          valA = a.dataset.name || '';
          valB = b.dataset.name || '';
          return valA.localeCompare(valB, 'zh-CN') * mult;
        case 'sellprice':
          valA = parseFloat(a.dataset.sellprice) || 0;
          valB = parseFloat(b.dataset.sellprice) || 0;
          break;
        case 'avgcost':
          valA = parseFloat(a.dataset.avgcost) || 0;
          valB = parseFloat(b.dataset.avgcost) || 0;
          break;
        case 'profit':
          valA = parseFloat(a.dataset.profit) || 0;
          valB = parseFloat(b.dataset.profit) || 0;
          break;
        case 'stock':
          valA = parseInt(a.dataset.stock) || 0;
          valB = parseInt(b.dataset.stock) || 0;
          break;
        case 'sales':
          valA = parseInt(a.dataset.sales) || 0;
          valB = parseInt(b.dataset.sales) || 0;
          break;
        case 'profitrate':
          valA = parseFloat(a.dataset.profitrate) || 0;
          valB = parseFloat(b.dataset.profitrate) || 0;
          break;
        case 'totalpurchase':
          valA = parseInt(a.dataset.totalpurchase) || 0;
          valB = parseInt(b.dataset.totalpurchase) || 0;
          break;
        default:
          return 0;
      }
      return (valA - valB) * mult;
    });

    cards.forEach(card => grid.appendChild(card));
  });
}

/**
 * 显示商品进销记录对话框
 */
async function showProductHistoryModal(productId) {
  const product = await dbGet(STORES.PRODUCTS, productId);
  if (!product) return;

  const [allSales, allPurchases] = await Promise.all([
    getAllSales(),
    getPurchasesByProduct(productId)
  ]);
  const businessSettings = await getBusinessSettings();

  const history = [];

  // 1. 过滤并格式化销售记录
  for (const s of allSales) {
    if (!s.items) continue;
    for (const item of s.items) {
      if (item.productId === productId) {
        history.push({
          date: s.date,
          type: 'sale',
          quantity: item.quantity,
          amount: item.itemRevenue !== undefined ? item.itemRevenue : Math.round(item.quantity * product.sellPrice * 100) / 100,
          timestamp: new Date(s.createdAt || s.date).getTime()
        });
      }
    }
  }

  // 2. 过滤并格式化进货记录
  for (const p of allPurchases) {
    history.push({
      date: p.date,
      type: 'purchase',
      quantity: p.quantity,
      amount: p.totalPrice,
      timestamp: new Date(p.createdAt || p.date).getTime()
    });
  }

  // 按时间倒序排列 (最新的在前面)
  history.sort((a, b) => b.timestamp - a.timestamp);

  const html = `
    <div class="product-history-container">
      <div class="history-header" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <h3 style="margin:0 0 6px 0; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
          ${escapeHtml(product.name)}
          <span class="tag tag-machine" style="font-size:12px">${escapeHtml(product.machineId)}</span>
        </h3>
        <p style="margin:0; color:var(--text-muted); font-size:13px; display:flex; gap:16px;">
          <span>当前库存: <strong style="${(product.currentStock || 0) <= businessSettings.lowStockThreshold ? 'color:var(--accent-red)' : 'color:var(--text-primary)'}">${product.currentStock || 0}</strong> 件</span>
          <span>零售价: <strong style="color:var(--text-primary)">¥${product.sellPrice || 0}</strong></span>
          <span>均价: <strong style="color:var(--text-primary)">¥${product.avgCost || 0}</strong></span>
        </p>
      </div>
      
      ${product.avgCost > 0 ? `
      <div style="margin-bottom:16px; padding:12px; background:rgba(79,143,255,0.06); border-radius:8px; border:1px solid rgba(79,143,255,0.12);">
        <div style="font-size:12px; color:var(--accent-blue); font-weight:600; margin-bottom:8px;">${tablerIcon('package')} 建议进货价（参考均价 ¥${(product.avgCost || 0).toFixed(2)}/件）</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:80px; text-align:center; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px;">
            <div style="font-size:11px; color:var(--text-muted);">12 件/箱</div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-top:2px;">¥${(product.avgCost * 12).toFixed(2)}</div>
          </div>
          <div style="flex:1; min-width:80px; text-align:center; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px;">
            <div style="font-size:11px; color:var(--text-muted);">15 件/箱</div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-top:2px;">¥${(product.avgCost * 15).toFixed(2)}</div>
          </div>
          <div style="flex:1; min-width:80px; text-align:center; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px;">
            <div style="font-size:11px; color:var(--text-muted);">16 件/箱</div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-top:2px;">¥${(product.avgCost * 16).toFixed(2)}</div>
          </div>
          <div style="flex:1; min-width:80px; text-align:center; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px;">
            <div style="font-size:11px; color:var(--text-muted);">24 件/箱</div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-top:2px;">¥${(product.avgCost * 24).toFixed(2)}</div>
          </div>
        </div>
      </div>
      ` : ''}
      
      <div class="history-timeline" style="max-height: 400px; overflow-y: auto; padding-right: 4px;">
        ${history.length === 0 ? '<div class="empty-state-sm"><p>暂无进销记录</p></div>' : ''}
        ${history.map(record => `
          <div class="history-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.03);">
            <div>
              <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">
                ${(record.date || '').replace('T', ' ').substring(0, 16)}
              </div>
              ${record.type === 'sale' 
                ? `<span class="tag" style="background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.2);">卖出</span>`
                : `<span class="tag" style="background:rgba(99,102,241,0.1); color:#818cf8; border:1px solid rgba(99,102,241,0.2);">进货</span>`
              }
            </div>
            <div style="text-align:right;">
              <div style="font-weight:600; font-size:15px; ${record.type === 'sale' ? 'color:#10b981;' : 'color:#818cf8;'}">
                ${record.type === 'sale' ? '-' : '+'}${record.quantity} 件
              </div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                ${record.type === 'sale' ? '收入' : '支出'} ¥${record.amount}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  await showModal(`${tablerIcon('package')} 商品流水`, html, { submitText: '关闭窗口', wide: false });
}

/**
 * 显示添加商品对话框
 */
async function showAddProductModal() {
  const machines = await getMachines();
  const html = `
    <div class="form-grid">
      <div class="form-group">
        <label>商品名称 <span class="required">*</span></label>
        <input type="text" id="productName" class="form-control form-input" placeholder="如：可口可乐330ml">
      </div>
      <div class="form-group">
        <label>所属售货机 <span class="required">*</span></label>
        <select id="productMachine" class="form-select">
          ${machines.map(m => optionHtml(m, m)).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>商品分类</label>
        <select id="productCategory" class="form-select">
          ${CATEGORIES.map(c => optionHtml(c, c)).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>零售价 (元) <span class="required">*</span></label>
        <input type="number" id="productSellPrice" class="form-control form-input" step="0.1" min="0" placeholder="售货机售价">
      </div>
      <div class="form-group">
        <label>初始库存</label>
        <input type="number" id="productStock" class="form-control form-input" min="0" value="0" placeholder="当前库存数量">
      </div>
    </div>
  `;

  const result = await showModal(`${tablerIcon('plus')} 添加商品`, html, { submitText: '添加' });
  if (result) {
    const name = result.querySelector('#productName').value.trim();
    const sellPrice = result.querySelector('#productSellPrice').value;

    if (!name) { showToast('请输入商品名称', 'error'); return; }
    if (!sellPrice) { showToast('请输入零售价', 'error'); return; }

    await addProduct({
      name,
      machineId: result.querySelector('#productMachine').value,
      category: result.querySelector('#productCategory').value,
      sellPrice: parseFloat(sellPrice),
      currentStock: parseInt(result.querySelector('#productStock').value) || 0
    });
    showToast('商品添加成功');
    refreshProductsGrid();
  }
}

/**
 * 显示编辑商品对话框
 */
async function showEditProductModal(productId) {
  const product = await dbGet(STORES.PRODUCTS, productId);
  if (!product) { showToast('商品不存在', 'error'); return; }
  const machines = await getMachines();

  const html = `
    <div class="form-grid">
      <div class="form-group">
        <label>商品名称 <span class="required">*</span></label>
        <input type="text" id="editProductName" class="form-control form-input" value="${escapeAttr(product.name)}">
      </div>
      <div class="form-group">
        <label>所属售货机</label>
        <select id="editProductMachine" class="form-select">
          ${machines.map(m => optionHtml(m, m, product.machineId === m)).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>商品分类</label>
        <select id="editProductCategory" class="form-select">
          ${CATEGORIES.map(c => optionHtml(c, c, product.category === c)).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>零售价 (元)</label>
        <input type="number" id="editProductSellPrice" class="form-control form-input" step="0.1" min="0" value="${product.sellPrice}">
      </div>
      <div class="form-group">
        <label>当前库存</label>
        <input type="number" id="editProductStock" class="form-control form-input" min="0" value="${product.currentStock || 0}">
      </div>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color)">
      <h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">${tablerIcon('chart-bar')} 进货成本数据 <small style="font-weight:normal;color:var(--text-muted)">(可修正AI识别错误)</small></h4>
      <div class="form-grid">
        <div class="form-group">
          <label>累计进货数量 (件)</label>
          <input type="number" id="editTotalPurchaseQty" class="form-control form-input" min="0" value="${product.totalPurchaseQty || 0}"
            oninput="recalcEditAvgCost()">
        </div>
        <div class="form-group">
          <label>累计进货成本 (元)</label>
          <input type="number" id="editTotalPurchaseCost" class="form-control form-input" step="0.01" min="0" value="${(product.totalPurchaseCost || 0).toFixed(2)}"
            oninput="recalcEditAvgCost()">
        </div>
        <div class="form-group">
          <label>进货均价 (元/件)</label>
          <input type="number" id="editAvgCost" class="form-control form-input" step="0.01" min="0" value="${(product.avgCost || 0).toFixed(2)}" readonly
            style="background:rgba(255,255,255,0.02);color:var(--text-muted)">
          <p class="form-hint">自动计算 = 累计成本 ÷ 累计数量</p>
          <p class="form-hint" id="editSuggestedPriceHint" style="margin-top: 4px; color: var(--accent-blue);">
            参考整箱进货价: 12个(¥${formatNumber((product.avgCost || 0) * 12)}) | 15个(¥${formatNumber((product.avgCost || 0) * 15)}) | 24个(¥${formatNumber((product.avgCost || 0) * 24)})
          </p>
        </div>
      </div>
    </div>
  `;

  const result = await showModal(`${tablerIcon('pencil')} 编辑商品`, html, { submitText: '保存' });
  if (result) {
    product.name = result.querySelector('#editProductName').value.trim() || product.name;
    product.machineId = result.querySelector('#editProductMachine').value;
    product.category = result.querySelector('#editProductCategory').value;
    product.sellPrice = parseFloat(result.querySelector('#editProductSellPrice').value) || product.sellPrice;
    product.currentStock = parseInt(result.querySelector('#editProductStock').value) || 0;

    // 更新进货数据
    const newQty = parseInt(result.querySelector('#editTotalPurchaseQty').value) || 0;
    const newCost = parseFloat(result.querySelector('#editTotalPurchaseCost').value) || 0;
    product.totalPurchaseQty = newQty;
    product.totalPurchaseCost = Math.round(newCost * 100) / 100;
    product.avgCost = newQty > 0 ? Math.round((newCost / newQty) * 100) / 100 : 0;

    await updateProduct(product);
    showToast('商品已更新');
    refreshProductsGrid();
  }
}

/**
 * 编辑商品时自动重算均价
 */
function recalcEditAvgCost() {
  const qty = parseInt(document.getElementById('editTotalPurchaseQty')?.value) || 0;
  const cost = parseFloat(document.getElementById('editTotalPurchaseCost')?.value) || 0;
  const avgField = document.getElementById('editAvgCost');
  const hintField = document.getElementById('editSuggestedPriceHint');
  if (avgField) {
    const avg = qty > 0 ? cost / qty : 0;
    avgField.value = avg.toFixed(2);
    if (hintField) {
      hintField.innerText = `参考整箱进货价: 12个(¥${formatNumber(avg * 12)}) | 15个(¥${formatNumber(avg * 15)}) | 24个(¥${formatNumber(avg * 24)})`;
    }
  }
}

/**
 * 删除商品
 */
async function handleDeleteProduct(productId) {
  const product = await dbGet(STORES.PRODUCTS, productId);
  if (!product) return;

  const confirmed = await showConfirm(`确定删除商品"${product.name}"吗？相关的进货记录将被标记为[已删除商品]，并从进货统计中扣除。`);
  if (confirmed) {
    // 同步标记进货记录
    const purchases = await getPurchasesByProduct(productId, { includeImages: true });
    let markedCount = 0;
    for (const pur of purchases) {
      pur.isDeletedProduct = true;
      await dbPut(STORES.PURCHASES, pur);
      markedCount++;
    }

    await deleteProduct(productId);
    showToast(`商品已删除` + (markedCount > 0 ? `，已标记 ${markedCount} 条进货记录` : ''));
    refreshProductsGrid();
  }
}





// ==================== CSV 导入导出 ====================

/**
 * 导出商品为 CSV
 */
async function exportProductsCSV() {
  const products = await getAllProducts();
  if (products.length === 0) {
    showToast('没有商品可导出', 'info');
    return;
  }

  const headers = ['id', 'name', 'machineId', 'category', 'sellPrice', 'currentStock', 'avgCost', 'totalPurchaseQty', 'totalPurchaseCost'];
  const headerRow = ['商品ID(勿改)', '商品名称', '售货机', '分类', '零售价', '当前库存', '进货均价', '累计进货数量', '累计进货成本'];
  
  let csvContent = headerRow.join(',') + '\n';
  
  products.forEach(p => {
    const row = headers.map(key => {
      let val = p[key];
      if (val === undefined || val === null) val = '';
      // Escape commas and quotes
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val}"`;
      }
      return val;
    });
    csvContent += row.join(',') + '\n';
  });

  // 添加 BOM，防止 Excel 打开中文乱码
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `商品数据_${getToday()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 从 CSV 导入商品并更新
 */
async function importProductsCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const confirmed = await showConfirm('导入CSV将覆盖现有商品的库存和价格等信息，确定要继续吗？（建议先导出备份）');
  if (!confirmed) {
    event.target.value = ''; // Reset
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('CSV文件为空或格式不正确');
      }

      // 简单 CSV 解析 (假设没有复杂的包含换行的引号)
      const parseCSVLine = (line) => {
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuote && line[i+1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuote = !inQuote;
            }
          } else if (char === ',' && !inQuote) {
            result.push(cur);
            cur = '';
          } else {
            cur += char;
          }
        }
        result.push(cur);
        return result;
      };

      // 忽略第一行(表头)
      let updatedCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length < 9) continue;
        
        const id = row[0];
        if (!id) continue;

        const product = await dbGet(STORES.PRODUCTS, id);
        if (product) {
          product.name = row[1] || product.name;
          product.machineId = row[2] || product.machineId;
          product.category = row[3] || product.category;
          product.sellPrice = parseFloat(row[4]) || product.sellPrice;
          product.currentStock = parseInt(row[5]) || 0;
          product.avgCost = parseFloat(row[6]) || 0;
          product.totalPurchaseQty = parseInt(row[7]) || 0;
          product.totalPurchaseCost = parseFloat(row[8]) || 0;
          
          await updateProduct(product);
          updatedCount++;
        }
      }
      
      showToast(`成功更新 ${updatedCount} 个商品`);
      refreshProductsGrid();
    } catch (err) {
      showToast('导入失败: ' + err.message, 'error');
    } finally {
      event.target.value = ''; // Reset input
    }
  };
  
  reader.onerror = () => {
    showToast('文件读取失败', 'error');
    event.target.value = '';
  };
  
  reader.readAsText(file);
}
