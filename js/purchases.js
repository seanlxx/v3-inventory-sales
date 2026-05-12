/**
 * 进货管理模块
 */

function getPurchasesSelectedMonth(uiState, currentMonth) {
  return uiState.month || currentMonth;
}

function sortPurchaseRecords(records = []) {
  return [...records].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function purchasesCacheCoversMonth(cached, month) {
  if (!cached || isPageDirty('purchases')) return false;
  if (month === 'all') return !!cached.loadedAll;
  return !!cached.loadedAll || cached.loadedMonth === month;
}

async function loadPurchasesPageRecords(month) {
  const cached = getPageData('purchases') || {};
  if (purchasesCacheCoversMonth(cached, month)) return cached;

  const purchases = month === 'all'
    ? await getAllPurchases()
    : await getPurchasesByMonth(month);

  return setPageData('purchases', {
    ...cached,
    purchases,
    loadedMonth: month === 'all' ? null : month,
    loadedAll: month === 'all'
  });
}

function getPurchaseSummaryMonths(monthlyData = [], selectedMonth) {
  const months = new Set(monthlyData.map(item => item.month).filter(Boolean));
  if (selectedMonth && selectedMonth !== 'all') months.add(selectedMonth);
  return Array.from(months).sort().reverse();
}

async function renderPurchasesPage() {
  const uiState = getPageUiState('purchases');
  const cached = getPageData('purchases');
  const currentMonth = getCurrentMonth();
  const selectedMonth = getPurchasesSelectedMonth(uiState, currentMonth);
  const [recordData, products, summary] = await Promise.all([
    loadPurchasesPageRecords(selectedMonth),
    cached?.products && !isPageDirty('purchases') ? cached.products : getAllProducts(),
    getPurchaseSummary({ currentMonth, includeMonthly: true })
  ]);
  const purchases = sortPurchaseRecords(recordData.purchases || []);
  const monthlyData = summary.monthly || [];
  const summaryByMonth = Object.fromEntries(monthlyData.map(item => [item.month, item]));
  const currentSummary = selectedMonth === 'all'
    ? monthlyData.reduce((total, item) => ({
        total: total.total + (item.total || 0),
        quantity: total.quantity + (item.quantity || 0),
        count: total.count + (item.count || 0)
      }), { total: 0, quantity: 0, count: 0 })
    : (summaryByMonth[selectedMonth] || (selectedMonth === currentMonth ? summary.current : null) || {});

  const monthPurchases = selectedMonth === 'all'
    ? purchases.filter(p => !p.isDeletedProduct)
    : purchases.filter(p => p.date && p.date.startsWith(selectedMonth) && !p.isDeletedProduct);
  const monthTotal = currentSummary.total || 0;
  const monthQty = currentSummary.quantity || 0;
  const monthCount = currentSummary.count || 0;
  const monthLabel = selectedMonth === 'all' ? '全部' : selectedMonth;
  const purchaseMonthOptions = getPurchaseSummaryMonths(monthlyData, selectedMonth === 'all' ? currentMonth : selectedMonth);

  setPageData('purchases', {
    purchases,
    products,
    currentMonth,
    selectedMonth,
    monthPurchases,
    monthlyData,
    summary,
    loadedMonth: recordData.loadedMonth,
    loadedAll: recordData.loadedAll
  });
  consumePageDirty('purchases');

  const html = `
    <div class="purchases-page page-stack container-xl">
    <!-- 本月进货汇总 -->
    <div class="stats-grid stats-grid-3">
      <div class="stat-card glass-card card gradient-purple">
        <div class="stat-icon">${tablerIcon('packages')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="purchaseStatLabel1">进货总额</div>
          <div class="stat-period" id="purchaseStatPeriod1">${monthLabel}</div>
          <div class="stat-value" id="purchaseStatTotal">${formatMoney(monthTotal)}</div>
        </div>
      </div>
      <div class="stat-card glass-card card gradient-blue">
        <div class="stat-icon">${tablerIcon('chart-bar')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="purchaseStatLabel2">进货数量</div>
          <div class="stat-period" id="purchaseStatPeriod2">${monthLabel}</div>
          <div class="stat-value" id="purchaseStatQty">${monthQty}</div>
        </div>
      </div>
      <div class="stat-card glass-card card gradient-orange">
        <div class="stat-icon">${tablerIcon('receipt')}</div>
        <div class="stat-content stat-content-ordered">
          <div class="stat-label" id="purchaseStatLabel3">进货次数</div>
          <div class="stat-period" id="purchaseStatPeriod3">${monthLabel}</div>
          <div class="stat-value" id="purchaseStatCount">${monthCount}</div>
        </div>
      </div>
    </div>

    <!-- 进货记录列表 -->
    <div class="glass-card card purchase-record-card records-card">
      <div class="card-header sales-record-title record-card-header card-toolbar purchase-card-toolbar">
        <h3 class="card-title">进货记录</h3>
        <input type="text" id="purchaseSearch" class="form-control form-input form-input-sm toolbar-search record-title-search" placeholder="搜索商品名称..." value="${escapeAttr(uiState.search || '')}" oninput="filterPurchasesDebounced()">
        <label class="toolbar-field record-title-control purchase-month-control"><span>月份</span>
          <select id="purchaseMonthFilter" class="form-select form-select-sm" onchange="filterPurchases()">
            <option value="all" ${selectedMonth === 'all' ? 'selected' : ''}>全部月份</option>
            ${purchaseMonthOptions.map(m => `<option value="${m}" ${selectedMonth === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
        <div class="card-action-bar purchase-action-bar">
          <button class="btn btn-accent" onclick="showAIRecognizeModal()">
            ${tablerIcon('camera', 'btn-icon-left')} AI识别入库
          </button>
          <button class="btn btn-primary" onclick="showAddPurchaseModal()">
            ${tablerIcon('plus', 'btn-icon-left')} 手动录入
          </button>
        </div>
      </div>
      <div class="table-responsive" id="purchaseTableWrap">
        ${renderPurchaseTable(monthPurchases)}
      </div>
    </div>
    </div>
  `;

  requestAnimationFrame(() => {
    if (currentPage === 'purchases') {
      filterPurchases();
    }
  });

  return html;
}

function renderPurchaseTable(purchasesData) {
  if (!purchasesData || purchasesData.length === 0) {
    return '<div class="empty-state-sm"><p>暂无进货记录</p></div>';
  }
  const pager = getPaginatedItems('purchases', 'records', purchasesData);
  return `
    <table class="data-table table card-table table-vcenter">
      <thead>
        <tr>
          <th>日期</th>
          <th>商品</th>
          <th>售货机</th>
          <th>数量</th>
          <th>单价</th>
          <th>总价</th>
          <th>来源</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${pager.items.map(p => `
          <tr data-month="${p.date ? p.date.substring(0, 7) : ''}" style="${p.isDeletedProduct ? 'opacity: 0.5;' : ''}">
            <td>${formatDate(p.date)}</td>
            <td>
              <strong>${escapeHtml(p.productName || '未知商品')}</strong>
              ${p.isDeletedProduct ? '<span style="color:#ef4444;font-size:11px;border:1px solid #ef4444;border-radius:4px;padding:1px 4px;margin-left:6px">已删除商品</span>' : ''}
            </td>
            <td><span class="tag tag-machine">${escapeHtml(p.machineId || '-')}</span></td>
            <td>${p.quantity}</td>
            <td>${formatMoney(p.unitPrice)}</td>
            <td class="text-bold">${formatMoney(p.totalPrice)}</td>
            <td><span class="tag tag-source">${escapeHtml(p.source || '拼多多')}</span></td>
            <td>
              ${p.imageBase64 || p.hasImage ? `<button class="btn btn-icon btn-sm" onclick="showRecordImageModal(STORES.PURCHASES, '${escapeAttr(p.id)}')" title="查看原图" style="margin-right:4px;">${tablerIcon('photo')}</button>` : ''}
              <button class="btn btn-icon btn-sm" onclick="handleEditPurchase('${p.id}')" title="编辑" style="margin-right:4px;">${tablerIcon('pencil')}</button>
              <button class="btn btn-icon btn-sm btn-danger-ghost" onclick="handleDeletePurchase('${p.id}')" title="删除">${tablerIcon('trash')}</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${renderPaginationDock('purchases', 'records', pager, 'filterPurchases')}
  `;
}

/**
 * 筛选进货记录 (动态重新渲染表格)
 */
async function filterPurchases() {
  const uiState = getPageUiState('purchases');
  const month = document.getElementById('purchaseMonthFilter')?.value || uiState.month || getCurrentMonth();
  const searchRaw = document.getElementById('purchaseSearch')?.value ?? uiState.search ?? '';
  const search = searchRaw.toLowerCase().trim();
  const wrap = document.getElementById('purchaseTableWrap');
  if (!wrap) return;

  const filterChanged = month !== uiState.month || searchRaw !== uiState.search;
  if (filterChanged) {
    setPaginationPage('purchases', 'records', 1);
  }
  updatePageUiState('purchases', { month, search: searchRaw });

  const cached = await loadPurchasesPageRecords(month);
  const ordered = sortPurchaseRecords(cached.purchases || []);

  let filtered = month === 'all' ? ordered : ordered.filter(p => p.date && p.date.startsWith(month));
  if (search) {
    filtered = filtered.filter(p => (p.productName || '').toLowerCase().includes(search));
  }
  wrap.innerHTML = renderPurchaseTable(filtered);

  // 同步更新顶部的统计数据
  const validPurchases = filtered.filter(p => !p.isDeletedProduct);
  const total = validPurchases.reduce((sum, p) => sum + p.totalPrice, 0);
  const qty = validPurchases.reduce((sum, p) => sum + p.quantity, 0);
  const count = validPurchases.length;

  const monthLabel = month === 'all' ? '全部' : month;
  
  const elTotal = document.getElementById('purchaseStatTotal');
  if (elTotal) elTotal.innerText = formatMoney(total);
  const elQty = document.getElementById('purchaseStatQty');
  if (elQty) elQty.innerText = qty;
  const elCount = document.getElementById('purchaseStatCount');
  if (elCount) elCount.innerText = count;

  ['1', '2', '3'].forEach(index => {
    const period = document.getElementById(`purchaseStatPeriod${index}`);
    if (period) period.innerText = monthLabel;
  });
}

window.filterPurchasesDebounced = debounce(filterPurchases, 120);

/**
 * 获取可用月份列表
 */
function getAvailableMonths(records) {
  const months = new Set();
  records.forEach(r => {
    if (r.date) months.add(r.date.substring(0, 7));
  });
  return Array.from(months).sort().reverse();
}

/**
 * 显示添加进货对话框
 * 支持选择已有商品或输入新商品名称自动创建
 */
async function showAddPurchaseModal() {
  const machines = await getMachines();
  const products = await getAllProducts();

  const html = `
    <div class="form-grid">
      <div class="form-group full-width">
        <label>选择商品或新增 <span class="required">*</span></label>
        <select id="purchaseProduct" class="form-select" onchange="onPurchaseProductChange()">
          <option value="">-- 请选择已有商品 --</option>
          <option value="__new__">+ 新增商品...</option>
          ${products.map(p => optionHtml(p.id, `${p.name} (${p.machineId})`, false, `data-avgcost="${p.avgCost || 0}" data-stock="${p.currentStock || 0}" data-sell="${p.sellPrice || 0}"`)).join('')}
        </select>
      </div>
      <div id="newProductFields" class="form-grid full-width" style="display:none">
        <div class="form-group full-width">
          <label>商品名称 <span class="required">*</span></label>
          <input type="text" id="newProductName" class="form-control form-input" placeholder="如：可口可乐330ml">
        </div>
        <div class="form-group">
          <label>所属售货机 <span class="required">*</span></label>
          <select id="newProductMachine" class="form-select">
            ${machines.map(m => optionHtml(m, m)).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>商品分类</label>
          <select id="newProductCategory" class="form-select">
            ${CATEGORIES.map(c => optionHtml(c, c)).join('')}
          </select>
        </div>
        <div class="form-group full-width">
          <label>零售价 (元) <span class="required">*</span></label>
          <input type="number" id="newProductSellPrice" class="form-control form-input" step="0.1" min="0" placeholder="售货机售价">
        </div>
      </div>
      <div class="form-group">
        <label>进货总价 (元) <span class="required">*</span></label>
        <input type="number" id="purchaseTotalPrice" class="form-control form-input" step="0.01" min="0" placeholder="拼多多订单总价" oninput="calcPurchaseUnitPrice()">
      </div>
      <div class="form-group">
        <label>进货数量 <span class="required">*</span></label>
        <input type="number" id="purchaseQty" class="form-control form-input" min="1" value="1" oninput="calcPurchaseUnitPrice()">
      </div>
      <div class="form-group">
        <label>进货日期</label>
        <input type="datetime-local" id="purchaseDate" class="form-control form-input" value="${getNow()}">
      </div>
      <div class="form-group">
        <label>来源</label>
        <input type="text" id="purchaseSource" class="form-control form-input" value="拼多多" placeholder="进货渠道">
      </div>
      <div class="form-group full-width">
        <label>备注</label>
        <input type="text" id="purchaseNote" class="form-control form-input" placeholder="订单号、链接等">
      </div>
    </div>
    <div class="purchase-summary" id="purchaseSummary">
      <div class="summary-item">
        <span>自动计算单价:</span>
        <span class="summary-value" id="purchaseCalcUnitPrice">¥0.00</span>
      </div>
      <div class="summary-item">
        <span>当前历史均价:</span>
        <span class="summary-value" id="purchaseAvgCost">-</span>
      </div>
      <div class="summary-item">
        <span>当前库存:</span>
        <span class="summary-value" id="purchaseCurrentStock">-</span>
      </div>
    </div>
  `;

  const result = await showModal(`${tablerIcon('plus')} 录入进货`, html, { submitText: '提交', wide: true });
  if (result) {
    const productSelect = result.querySelector('#purchaseProduct').value;
    const qty = result.querySelector('#purchaseQty').value;
    const totalPrice = result.querySelector('#purchaseTotalPrice').value;

    if (!qty || qty <= 0) { showToast('请输入进货数量', 'error'); return; }
    if (!totalPrice || totalPrice <= 0) { showToast('请输入进货总价', 'error'); return; }

    const purchaseData = {
      quantity: parseInt(qty),
      totalPrice: parseFloat(totalPrice),
      source: result.querySelector('#purchaseSource').value.trim() || '拼多多',
      date: result.querySelector('#purchaseDate').value,
      note: result.querySelector('#purchaseNote').value.trim()
    };

    if (productSelect === '__new__') {
      // 新增商品模式
      const name = result.querySelector('#newProductName').value.trim();
      const sellPrice = result.querySelector('#newProductSellPrice').value;
      if (!name) { showToast('请输入商品名称', 'error'); return; }
      if (!sellPrice || sellPrice <= 0) { showToast('请输入零售价', 'error'); return; }

      purchaseData.productName = name;
      purchaseData.machineId = result.querySelector('#newProductMachine').value;
      purchaseData.category = result.querySelector('#newProductCategory').value;
      purchaseData.sellPrice = parseFloat(sellPrice);
    } else if (productSelect) {
      purchaseData.productId = productSelect;
    } else {
      showToast('请选择商品或新增商品', 'error');
      return;
    }

    const existingProduct = productSelect && productSelect !== '__new__' ? products.find(p => p.id === productSelect) : null;
    const warnings = collectPurchaseWarnings({
      name: purchaseData.productName || existingProduct?.name || '所选商品',
      qty: purchaseData.quantity,
      totalPrice: purchaseData.totalPrice,
      sellPrice: purchaseData.sellPrice || existingProduct?.sellPrice,
      existingProduct
    });
    if (warnings.length > 0) {
      const confirmed = await showConfirm(warnings.join('\n') + '\n\n仍要继续入库吗？');
      if (!confirmed) return;
    }

    await addPurchase(purchaseData);
    showToast('进货记录已添加，均价和库存已自动更新' + (productSelect === '__new__' ? '，新商品已自动创建' : ''));
    navigateTo('purchases');
  }
}

/**
 * 选择商品后更新摘要 / 切换新增表单
 */
function onPurchaseProductChange() {
  const select = document.getElementById('purchaseProduct');
  const newFields = document.getElementById('newProductFields');
  const val = select.value;

  if (val === '__new__') {
    newFields.style.display = '';
    document.getElementById('purchaseAvgCost').textContent = '新商品';
    document.getElementById('purchaseCurrentStock').textContent = '0 件';
  } else {
    newFields.style.display = 'none';
    const option = select.selectedOptions[0];
    if (option && option.value && option.value !== '__new__') {
      document.getElementById('purchaseAvgCost').textContent =
        parseFloat(option.dataset.avgcost) > 0 ? formatMoney(option.dataset.avgcost) : '暂无';
      document.getElementById('purchaseCurrentStock').textContent = option.dataset.stock + ' 件';
    } else {
      document.getElementById('purchaseAvgCost').textContent = '-';
      document.getElementById('purchaseCurrentStock').textContent = '-';
    }
  }
  calcPurchaseUnitPrice();
}

/**
 * 实时计算进货单价（总价 / 数量）
 */
function calcPurchaseUnitPrice() {
  const totalPrice = parseFloat(document.getElementById('purchaseTotalPrice').value) || 0;
  const qty = parseInt(document.getElementById('purchaseQty').value) || 0;
  const unitPrice = qty > 0 ? totalPrice / qty : 0;
  document.getElementById('purchaseCalcUnitPrice').textContent = formatMoney(unitPrice);
}

/**
 * 删除进货记录
 */
async function handleDeletePurchase(purchaseId) {
  const confirmed = await showConfirm('确定删除这条进货记录吗？删除后，此进货带来的库存和平均成本将被自动回退！');
  if (confirmed) {
    await deletePurchase(purchaseId);
    showToast('进货记录已删除');
    navigateTo('purchases');
  }
}

/**
 * 编辑进货记录
 */
async function handleEditPurchase(purchaseId) {
  const purchase = await dbGet(STORES.PURCHASES, purchaseId);
  if (!purchase) return;

  const html = `
    <div class="form-grid">
      <div class="form-group full-width">
        <label>关联商品</label>
        <input type="text" class="form-control form-input" value="${escapeAttr(purchase.productName || '未知商品')} (${escapeAttr(purchase.machineId || '')})" disabled style="background:#f5f6fa">
        <small class="text-muted">如需更换关联商品，请删除本记录后重新录入</small>
      </div>
      <div class="form-group">
        <label>进货总价 (元) <span class="required">*</span></label>
        <input type="number" id="editPurchaseTotalPrice" class="form-control form-input" step="0.01" min="0" value="${purchase.totalPrice}">
      </div>
      <div class="form-group">
        <label>进货数量 <span class="required">*</span></label>
        <input type="number" id="editPurchaseQty" class="form-control form-input" min="1" value="${purchase.quantity}">
      </div>
      <div class="form-group">
        <label>进货日期</label>
        <input type="datetime-local" id="editPurchaseDate" class="form-control form-input" value="${purchase.date || getNow()}">
      </div>
      <div class="form-group">
        <label>来源</label>
        <input type="text" id="editPurchaseSource" class="form-control form-input" value="${escapeAttr(purchase.source || '拼多多')}">
      </div>
      <div class="form-group full-width">
        <label>备注</label>
        <input type="text" id="editPurchaseNote" class="form-control form-input" value="${escapeAttr(purchase.note || '')}">
      </div>
    </div>
  `;

  const result = await showModal(`${tablerIcon('pencil')} 编辑进货记录`, html, { submitText: '保存修改', wide: true });
  if (result) {
    const qty = result.querySelector('#editPurchaseQty').value;
    const totalPrice = result.querySelector('#editPurchaseTotalPrice').value;

    if (!qty || qty <= 0) { showToast('请输入进货数量', 'error'); return; }
    if (!totalPrice || totalPrice < 0) { showToast('请输入进货总价', 'error'); return; }

    const newPurchaseData = {
      quantity: parseInt(qty),
      totalPrice: parseFloat(totalPrice),
      source: result.querySelector('#editPurchaseSource').value.trim() || '拼多多',
      date: result.querySelector('#editPurchaseDate').value,
      note: result.querySelector('#editPurchaseNote').value.trim()
    };

    try {
      await updatePurchase(purchaseId, newPurchaseData);
      showToast('进货记录已更新，均价和库存已自动调整');
      navigateTo('purchases');
    } catch (err) {
      showToast('更新失败: ' + err.message, 'error');
    }
  }
}

// ==================== AI 截图识别入库 ====================

/**
 * 显示AI识别入库对话框
 */
async function showAIRecognizeModal() {
  try {
    await ensureSelectedAIConfigured();
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const html = `
    <div class="ai-recognize-section">
      <div class="upload-area" id="uploadArea">
        <div class="upload-icon">${tablerIcon('camera-plus')}</div>
        <p>点击上传 / 拖拽 / <strong>Ctrl+V 粘贴</strong></p>
        <p class="upload-hint">支持拼多多、淘宝等平台的订单截图</p>
        <input type="file" id="orderImageInput" accept="image/*" style="display:none" onchange="handleOrderImageSelect(event)">
      </div>
      <div id="imagePreviewArea" style="display:none">
        <div class="preview-header">
          <span>${tablerIcon('clipboard-check')} 已选择截图</span>
          <button class="btn btn-sm btn-ghost" onclick="resetOrderImage()">重新选择</button>
        </div>
        <img id="orderImagePreview" class="order-preview-img" />
      </div>
      <div id="aiRecognizeStatus" style="display:none">
        <div class="ai-loading">
          <div class="pulse-dot"></div>
          <p id="aiRecognizeStatusText">AI 正在识别订单...</p>
        </div>
      </div>
      <div id="aiRecognizeResult" style="display:none"></div>
    </div>
  `;

  const result = await showModal(`${tablerIcon('camera')} AI 识别入库`, html, { hideFooter: true, wide: true });
}

/**
 * 上传区域点击/拖拽/粘贴处理
 */
document.addEventListener('click', (e) => {
  if (e.target.closest('#uploadArea')) {
    document.getElementById('orderImageInput')?.click();
  }
});

document.addEventListener('dragover', (e) => {
  if (e.target.closest('#uploadArea')) {
    e.preventDefault();
    e.target.closest('#uploadArea').classList.add('drag-over');
  }
});

document.addEventListener('dragleave', (e) => {
  if (e.target.closest('#uploadArea')) {
    e.target.closest('#uploadArea').classList.remove('drag-over');
  }
});

document.addEventListener('drop', (e) => {
  const area = e.target.closest('#uploadArea');
  if (area) {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processOrderImageFile(file);
    }
  }
});

/**
 * Ctrl+V 粘贴图片
 */
document.addEventListener('paste', (e) => {
  // 只在AI识别弹窗打开时响应粘贴
  const uploadArea = document.getElementById('uploadArea');
  if (!uploadArea) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) processOrderImageFile(file);
      return;
    }
  }
});

/**
 * 选择图片文件
 */
function handleOrderImageSelect(event) {
  const file = event.target.files[0];
  if (file) processOrderImageFile(file);
}

/**
 * 重新选择图片
 */
function resetOrderImage() {
  document.getElementById('uploadArea').style.display = '';
  document.getElementById('imagePreviewArea').style.display = 'none';
  document.getElementById('aiRecognizeStatus').style.display = 'none';
  document.getElementById('aiRecognizeResult').style.display = 'none';
}

/**
 * 处理选择的图片文件并调用AI识别
 */
function processOrderImageFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    const mimeType = file.type || 'image/png';

    // 显示预览
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = '';
    document.getElementById('orderImagePreview').src = dataUrl;

    // 开始AI识别
    document.getElementById('aiRecognizeStatus').style.display = '';
    document.getElementById('aiRecognizeResult').style.display = 'none';

    try {
      document.getElementById('aiRecognizeStatusText').textContent = '正在压缩图片并上传给 AI...';
      // 压缩图片用于 AI 识别和持久化存储
      const compressedBase64 = await compressImage(base64, mimeType);
      // 临时存储到全局变量供确认时使用
      window._tempPurchaseImageBase64 = compressedBase64;
      const aiMimeType = 'image/jpeg';

      const productsPromise = getAllProducts();
      document.getElementById('aiRecognizeStatusText').textContent = 'AI 正在识别订单...';
      const statusEl = document.getElementById('aiRecognizeStatusText');
      const aiStart = Date.now();
      const onProgress = (evt) => {
        if (!statusEl) return;
        const secs = ((Date.now() - aiStart) / 1000).toFixed(1);
        if (evt.phase === 'connected') {
          statusEl.textContent = `AI 已连接，正在生成结果... 已等待 ${secs}s`;
        } else if (evt.phase === 'streaming') {
          const kb = (evt.bytes / 1024).toFixed(1);
          statusEl.textContent = `AI 正在流式输出... 已等待 ${secs}s · ${kb} KB`;
        } else if (evt.phase === 'done') {
          statusEl.textContent = `AI 已完成，正在解析 JSON... 用时 ${secs}s`;
        }
      };
      const result = await recognizeOrderImage(compressedBase64, aiMimeType, onProgress);
      const allProducts = await productsPromise;
      document.getElementById('aiRecognizeStatus').style.display = 'none';
      await showAIRecognizeResult(result.items, allProducts, result.orderDate, resolvePurchaseOrderTotal(result));
    } catch (err) {
      document.getElementById('aiRecognizeStatus').style.display = 'none';
      document.getElementById('aiRecognizeResult').style.display = '';
      document.getElementById('aiRecognizeResult').innerHTML = `
        <div class="ai-error-box">
          <p>${tablerIcon('circle-x')} 识别失败</p>
          <pre style="text-align:left; white-space:pre-wrap; font-size:12px; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; max-height:200px; overflow-y:auto;">${escapeHtml(err.message)}</pre>
          <button class="btn btn-sm btn-ghost" onclick="resetOrderImage()" style="margin-top:10px;">重新上传</button>
        </div>
      `;
    }
  };
  reader.readAsDataURL(file);
}

/**
 * 显示AI识别结果（支持多商品 + 智能匹配提示 + 自动填入日期）
 */
async function showAIRecognizeResult(items, allProducts, orderDate, orderTotal) {
  const machines = await getMachines();
  const container = document.getElementById('aiRecognizeResult');
  container.style.display = '';
  const allocatedItems = allocatePurchaseOrderTotal(items, orderTotal);
  const preparedItems = prepareAIRecognizedPurchaseItems(allocatedItems, allProducts);

  const totalPrice = preparedItems.reduce((s, i) => s + (i.totalPrice || 0), 0);
  const totalQty = preparedItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const matchedCount = preparedItems.filter(i => i.matchedProductId).length;

  let itemsHtml = preparedItems.map((item, idx) => {
    // 自动判定机器：零食等吃食默认为2号机，其余（饮料）默认为1号机
    const isFood = ['零食', '食品', '日用品', '烟酒', '其他'].includes(item.category) || (item.name && (item.name.includes('辣条') || item.name.includes('面') || item.name.includes('干')));
    const defaultMachine = item.machineId || (isFood ? '2号机' : '1号机');

    // 查找匹配的已有商品
    let matchInfo = '';
    let autoSellPrice = item.sellPrice || '';
    const matchedProduct = item.matchedProductId
      ? allProducts.find(p => p.id === item.matchedProductId)
      : null;
    
    if (matchedProduct) {
      if (matchedProduct.sellPrice) {
        autoSellPrice = matchedProduct.sellPrice;
      }

      matchInfo = `
        <div class="ai-match-badge" id="aiMatch_${idx}">
          <span class="match-icon">${tablerIcon('link')}</span>
          <span>已匹配: <strong>${escapeHtml(matchedProduct.name)}</strong> · ${escapeHtml(matchedProduct.machineId || '-')} ${autoSellPrice ? `<span style="color:#2ecc71; margin-left:4px">(已同步售价: ¥${autoSellPrice})</span>` : ''}</span>
          <button class="btn btn-sm btn-ghost" onclick="unmatchAIItem('${idx}')" title="取消匹配，创建新商品">${tablerIcon('x')} 取消</button>
          <button class="btn btn-sm btn-ghost" onclick="manualBindAIItem('${idx}')" title="重新绑定已有商品">${tablerIcon('link')} 重新绑定</button>
        </div>
      `;
    } else {
      matchInfo = `
        <div class="ai-match-badge" id="aiMatch_${idx}" style="background: rgba(241,196,15,0.05); border-color: rgba(241,196,15,0.2);">
          <span class="match-icon">${tablerIcon('alert-triangle')}</span>
          <span style="color:#f1c40f">未匹配到商品，将作为新商品录入</span>
          <button class="btn btn-sm btn-ghost" onclick="manualBindAIItem('${idx}')" title="手动绑定已有商品">${tablerIcon('link')} 手动绑定</button>
        </div>
      `;
    }

    return `
    <div class="ai-item-row" data-idx="${idx}">
      <div class="ai-item-header">
        <span class="ai-item-badge">#${idx + 1}</span>
        <span class="ai-item-name" style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</span>
        ${item.matchedProductId ? '<span class="tag tag-category" style="background:rgba(46,204,113,0.15);color:#2ecc71;">已匹配</span>' : '<span class="tag tag-category" style="background:rgba(241,196,15,0.15);color:#f1c40f;">新商品</span>'}
        <button class="btn btn-sm btn-ghost" style="color:var(--accent-red); padding:2px 8px; margin-left:8px;" onclick="removeAIItem('${idx}')" title="删除此识别错误商品">${tablerIcon('trash')} 删除</button>
      </div>
      ${matchInfo}
      <div class="form-grid">
        <div class="form-group full-width">
          <label>商品名称</label>
          <input type="text" class="form-control form-input ai-field-name" value="${escapeAttr(item.name || '')}" oninput="updateAITotals()">
          <input type="hidden" class="ai-field-matched" value="${escapeAttr(item.matchedName || '')}">
          <input type="hidden" class="ai-field-product-id" value="${escapeAttr(item.matchedProductId || '')}">
          <input type="hidden" class="ai-field-raw-name" value="${escapeAttr(item.rawName || '')}">
          <input type="hidden" class="ai-field-ai-unit-price" value="${escapeAttr(item.unitPrice || '')}">
          <input type="hidden" class="ai-field-amount-warnings" value="${escapeAttr(JSON.stringify(item.amountWarnings || []))}">
        </div>
        <div class="form-group">
          <label>商品分类</label>
          <select class="form-select ai-field-category" onchange="updateAITotals()">
            ${CATEGORIES.map(c => optionHtml(c, c, c === (item.category || '饮料'))).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>所属售货机</label>
          <select class="form-select ai-field-machine" onchange="updateAITotals()">
            ${machines.map(m => optionHtml(m, m, m === defaultMachine)).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>数量</label>
          <input type="number" class="form-control form-input ai-field-qty" min="1" value="${item.quantity || 1}" oninput="updateAITotals()">
        </div>
        <div class="form-group">
          <label>分摊成本 (元)</label>
          <input type="number" class="form-control form-input ai-field-price" step="0.01" value="${(item.totalPrice || 0).toFixed(2)}" oninput="updateAITotals()">
          ${item.unitPrice ? `<p class="form-hint">AI单价 ${formatMoney(item.unitPrice)}</p>` : ''}
        </div>
        <div class="form-group full-width">
          <label>零售单价 (元)</label>
          <input type="number" class="form-control form-input ai-field-sell" step="0.1" min="0" value="${autoSellPrice}" placeholder="必填" oninput="updateAITotals()">
        </div>
      </div>
    </div>
  `}).join('');

  container.innerHTML = `
    <div class="ai-result-form">
      <h4>${tablerIcon('circle-check')} AI 识别出 ${preparedItems.length} 件商品 ${matchedCount > 0 ? `<span style="color:#2ecc71;font-size:13px;font-weight:normal;margin-left:8px">${tablerIcon('link')} 其中 ${matchedCount} 件匹配到已有商品</span>` : ''} <small class="text-muted">(可修改后确认入库)</small></h4>
      <div class="ai-items-list">
        ${itemsHtml}
      </div>
      <div style="margin-top: 10px; text-align: center;">
        <button class="btn btn-ghost btn-sm" onclick="addBlankAIItem()">${tablerIcon('plus')} 手动添加漏识别的商品</button>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="form-group full-width">
          <label>统一进货日期</label>
          <input type="datetime-local" id="aiResultDate" class="form-control form-input" value="${orderDate || getNow()}">
        </div>
      </div>
      <div id="aiRecognizeWarnings"></div>
      <div class="purchase-summary">
        <div class="summary-item">
          <span>合计:</span>
          <span class="summary-value">${preparedItems.length}种 / ${totalQty}件 / ${formatMoney(totalPrice)}</span>
        </div>
      </div>
      <div style="margin-top:16px; display:flex; gap:10px; justify-content:flex-end">
        <button class="btn btn-ghost" onclick="resetOrderImage()">重新识别</button>
        <button class="btn btn-primary" onclick="confirmAIRecognize()">${tablerIcon('circle-check')} 全部入库</button>
      </div>
    </div>
  `;
  renderAIRecognizeWarnings();
}

/**
 * 取消AI匹配，改为创建新商品
 */
function unmatchAIItem(idx) {
  const row = document.querySelector(`.ai-item-row[data-idx="${idx}"]`);
  if (!row) return;
  row.querySelector('.ai-field-matched').value = '';
  row.querySelector('.ai-field-product-id').value = '';
  const badge = document.getElementById(`aiMatch_${idx}`);
  if (badge) {
    badge.innerHTML = `
      <span class="match-icon">${tablerIcon('alert-triangle')}</span>
      <span style="color:#f1c40f">已取消匹配，将作为新商品录入</span>
      <button class="btn btn-sm btn-ghost" onclick="manualBindAIItem('${idx}')" title="手动绑定已有商品">${tablerIcon('link')} 手动绑定</button>
    `;
    badge.style.background = 'rgba(241,196,15,0.05)';
    badge.style.borderColor = 'rgba(241,196,15,0.2)';
  }
  // 更新标签
  const tags = row.querySelectorAll('.tag');
  tags.forEach(t => {
    if (t.textContent.includes('已匹配')) {
      t.textContent = '新商品';
      t.style.background = 'rgba(241,196,15,0.15)';
      t.style.color = '#f1c40f';
    }
  });
}

/**
 * 移除错误识别的AI商品行
 */
function removeAIItem(idx) {
  const row = document.querySelector(`.ai-item-row[data-idx="${idx}"]`);
  if (row) {
    row.remove();
    updateAITotals();
  }
}

/**
 * 手动增加一行空白的商品输入
 */
async function addBlankAIItem() {
  const list = document.querySelector('.ai-items-list');
  if (!list) return;
  const machines = await getMachines();

  const idx = 'manual_' + Date.now();
  
  const html = `
    <div class="ai-item-row" data-idx="${idx}">
      <div class="ai-item-header">
        <span class="ai-item-badge" style="background:var(--accent-orange)">手动</span>
        <span class="ai-item-name" style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="新商品">新商品</span>
        <span class="tag tag-category" style="background:rgba(241,196,15,0.15);color:#f1c40f;">新商品</span>
        <button class="btn btn-sm btn-ghost" style="color:var(--accent-red); padding:2px 8px; margin-left:8px;" onclick="removeAIItem('${idx}')" title="删除此商品">${tablerIcon('trash')} 删除</button>
      </div>
      <div class="ai-match-badge" id="aiMatch_${idx}" style="background: rgba(241,196,15,0.05); border-color: rgba(241,196,15,0.2);">
        <span class="match-icon">${tablerIcon('alert-triangle')}</span>
        <span style="color:#f1c40f">未匹配到商品，将作为新商品录入</span>
        <button class="btn btn-sm btn-ghost" onclick="manualBindAIItem('${idx}')" title="手动绑定已有商品">${tablerIcon('link')} 手动绑定</button>
      </div>
      <div class="form-grid">
        <div class="form-group full-width">
          <label>商品名称</label>
          <input type="text" class="form-control form-input ai-field-name" value="" placeholder="请输入商品名称" oninput="updateAITotals()">
          <input type="hidden" class="ai-field-matched" value="">
          <input type="hidden" class="ai-field-product-id" value="">
          <input type="hidden" class="ai-field-raw-name" value="">
          <input type="hidden" class="ai-field-ai-unit-price" value="">
          <input type="hidden" class="ai-field-amount-warnings" value="[]">
        </div>
        <div class="form-group">
          <label>商品分类</label>
          <select class="form-select ai-field-category" onchange="updateAITotals()">
            ${CATEGORIES.map(c => optionHtml(c, c, c === '饮料')).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>所属售货机</label>
          <select class="form-select ai-field-machine" onchange="updateAITotals()">
            ${machines.map(m => optionHtml(m, m, m === machines[0])).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>数量</label>
          <input type="number" class="form-control form-input ai-field-qty" min="1" value="1" oninput="updateAITotals()">
        </div>
        <div class="form-group">
          <label>分摊成本 (元)</label>
          <input type="number" class="form-control form-input ai-field-price" step="0.01" value="0.00" oninput="updateAITotals()">
        </div>
        <div class="form-group full-width">
          <label>零售单价 (元)</label>
          <input type="number" class="form-control form-input ai-field-sell" step="0.1" min="0" value="" placeholder="必填" oninput="updateAITotals()">
        </div>
      </div>
    </div>
  `;

  list.insertAdjacentHTML('beforeend', html);
  updateAITotals();
}

/**
 * 实时更新AI合计数据
 */
function updateAITotals() {
  const rows = document.querySelectorAll('.ai-item-row');
  let count = 0;
  let totalQty = 0;
  let totalPrice = 0;
  
  rows.forEach(r => {
    count++;
    const qty = parseInt(r.querySelector('.ai-field-qty').value || 0);
    const priceInput = r.querySelector('.ai-field-price');
    const unitInput = r.querySelector('.ai-field-ai-unit-price');
    const qtyValue = Number.isFinite(qty) && qty > 0 ? qty : 0;
    const totalValue = toNumber(priceInput?.value, 0);
    totalQty += qtyValue;
    totalPrice += totalValue;
    if (priceInput && unitInput && qtyValue > 0 && totalValue > 0) {
      unitInput.value = formatNumber(derivePurchaseUnitPrice(totalValue, qtyValue, toNumber(unitInput.value, 0)), 2);
    }
  });
  
  const summaryVal = document.querySelector('.purchase-summary .summary-value');
  if (summaryVal) {
    summaryVal.textContent = `${count}种 / ${totalQty}件 / ${formatMoney(totalPrice)}`;
  }
  renderAIRecognizeWarnings();
}

function findAIRecognizeExistingProduct(item, allProducts) {
  if (item.productId) {
    const product = allProducts.find(p => p.id === item.productId);
    if (product) return product;
  }
  const exact = allProducts.find(p => p.name === item.name && p.machineId === item.machineId);
  if (exact) return exact;
  if (item.matchedName) {
    return allProducts.find(p => p.name === item.matchedName && p.machineId === item.machineId) || null;
  }
  return null;
}

async function renderAIRecognizeWarnings() {
  const container = document.getElementById('aiRecognizeWarnings');
  if (!container) return;
  const allProducts = await getAllProducts();
  const warnings = [];
  document.querySelectorAll('#aiRecognizeResult .ai-item-row').forEach(row => {
    const name = row.querySelector('.ai-field-name')?.value.trim() || '未命名商品';
    const qty = toInt(row.querySelector('.ai-field-qty')?.value, 0);
    const totalPrice = toNumber(row.querySelector('.ai-field-price')?.value, 0);
    const sellPrice = toNumber(row.querySelector('.ai-field-sell')?.value, 0);
    const aiUnitPrice = toNumber(row.querySelector('.ai-field-ai-unit-price')?.value, 0);
    const matchedName = row.querySelector('.ai-field-matched')?.value;
    const matchedProductId = row.querySelector('.ai-field-product-id')?.value;
    const machineId = row.querySelector('.ai-field-machine')?.value;
    let amountWarnings = [];
    try {
      amountWarnings = JSON.parse(row.querySelector('.ai-field-amount-warnings')?.value || '[]');
    } catch {
      amountWarnings = [];
    }
    const existingProduct = findAIRecognizeExistingProduct({ productId: matchedProductId, matchedName, name, machineId }, allProducts);
    warnings.push(...collectPurchaseWarnings({ name, qty, totalPrice, sellPrice, existingProduct, aiUnitPrice, amountWarnings }));
  });
  container.innerHTML = buildWarningBox(warnings);
}

/**
 * 确认AI识别结果并批量入库
 */
async function confirmAIRecognize() {
  const rows = document.querySelectorAll('.ai-item-row');
  const date = document.getElementById('aiResultDate').value;

  if (rows.length === 0) {
    showToast('没有任何商品可以入库', 'error');
    return;
  }

  // 收集并验证每行数据
  const items = [];
  for (const row of rows) {
    const name = row.querySelector('.ai-field-name').value.trim();
    const machineId = row.querySelector('.ai-field-machine').value;
    const category = row.querySelector('.ai-field-category').value;
    const qty = parseInt(row.querySelector('.ai-field-qty').value);
    const totalPrice = parseFloat(row.querySelector('.ai-field-price').value);
    const sellPrice = parseFloat(row.querySelector('.ai-field-sell').value);
    const productId = row.querySelector('.ai-field-product-id')?.value || '';
    const matchedName = row.querySelector('.ai-field-matched')?.value || '';
    const aiUnitPrice = toNumber(row.querySelector('.ai-field-ai-unit-price')?.value, 0);
    let amountWarnings = [];
    try {
      amountWarnings = JSON.parse(row.querySelector('.ai-field-amount-warnings')?.value || '[]');
    } catch {
      amountWarnings = [];
    }

    if (!name) { showToast('请输入商品名称', 'error'); return; }
    if (!qty || qty <= 0) { showToast(`${name}: 请输入数量`, 'error'); return; }
    if (!totalPrice || totalPrice <= 0) { showToast(`${name}: 请输入成本`, 'error'); return; }
    if (!sellPrice || sellPrice <= 0) { showToast(`${name}: 请输入零售单价`, 'error'); return; }

    items.push({ name, machineId, category, qty, totalPrice, sellPrice, productId, matchedName, aiUnitPrice, amountWarnings });
  }

  try {
    const allProducts = await getAllProducts();
    const warnings = [];
    items.forEach(item => {
      const existing = findAIRecognizeExistingProduct(item, allProducts);
      warnings.push(...collectPurchaseWarnings({
        name: item.name,
        qty: item.qty,
        totalPrice: item.totalPrice,
        sellPrice: item.sellPrice,
        existingProduct: existing,
        aiUnitPrice: item.aiUnitPrice,
        amountWarnings: item.amountWarnings
      }));
    });
    if (warnings.length > 0) {
      const confirmed = await showConfirm(warnings.join('\n') + '\n\n仍要继续入库吗？');
      if (!confirmed) return;
    }
    const purchases = items.map(item => {
      const existing = findAIRecognizeExistingProduct(item, allProducts);
      return {
        productId: existing ? existing.id : undefined,
        productName: existing ? undefined : item.name,
        machineId: item.machineId,
        category: item.category,
        sellPrice: item.sellPrice,
        quantity: item.qty,
        totalPrice: item.totalPrice,
        source: '拼多多',
        date,
        note: 'AI截图识别入库'
      };
    });

    const result = await addPurchasesBatch(purchases, {
      imageBase64: window._tempPurchaseImageBase64 || null,
      mimeType: 'image/jpeg'
    });
    const successCount = result.purchases?.length || purchases.length;

    // 清理临时图片
    window._tempPurchaseImageBase64 = null;

    showToast(`成功入库 ${successCount} 件商品`);
    document.querySelector('.modal-overlay')?.querySelector('.modal-close')?.click();
    navigateTo('purchases');
  } catch (err) {
    showToast('入库失败: ' + err.message, 'error');
  }
}

/**
 * 手动绑定AI识别出的商品到已有商品
 */
async function manualBindAIItem(idx) {
  const allProducts = await getAllProducts();
  const row = document.querySelector(`.ai-item-row[data-idx="${idx}"]`);
  if (!row) return;

  const currentMatched = row.querySelector('.ai-field-matched').value;
  
  allProducts.sort((a, b) => a.name.localeCompare(b.name));

  const html = `
    <div class="form-group full-width">
      <label>选择要绑定的商品</label>
      <select id="manualBindSelect" class="form-select" size="15" style="width: 100%; height: 350px;">
        ${allProducts.map(p => optionHtml(p.id, `${p.name} (${p.machineId}) - ¥${p.sellPrice || 0}`, p.name === currentMatched, `data-name="${escapeAttr(p.name)}" data-machine="${escapeAttr(p.machineId)}" data-sell="${p.sellPrice || ''}" data-category="${escapeAttr(p.category || '')}"`)).join('')}
      </select>
    </div>
  `;

  const result = await showModal(`${tablerIcon('link')} 手动绑定商品`, html, { submitText: '确认绑定' });
  if (result) {
    const select = result.querySelector('#manualBindSelect');
    const option = select.selectedOptions[0];
    if (option && option.value) {
      const matchedName = option.dataset.name;
      const machineId = option.dataset.machine;
      const sellPrice = option.dataset.sell;
      const category = option.dataset.category;

      row.querySelector('.ai-field-matched').value = matchedName;
      row.querySelector('.ai-field-product-id').value = option.value;
      row.querySelector('.ai-field-name').value = matchedName;
      if (machineId) row.querySelector('.ai-field-machine').value = machineId;
      if (sellPrice) row.querySelector('.ai-field-sell').value = sellPrice;
      if (category) row.querySelector('.ai-field-category').value = category;
      renderAIRecognizeWarnings();

      const badge = document.getElementById(`aiMatch_${idx}`);
      if (badge) {
        badge.innerHTML = `
          <span class="match-icon">${tablerIcon('link')}</span>
          <span>已匹配: <strong>${escapeHtml(matchedName)}</strong> ${sellPrice ? `<span style="color:#2ecc71; margin-left:4px">(已同步售价: ¥${sellPrice})</span>` : ''}</span>
          <button class="btn btn-sm btn-ghost" onclick="unmatchAIItem('${idx}')" title="取消匹配，创建新商品">${tablerIcon('x')} 取消</button>
          <button class="btn btn-sm btn-ghost" onclick="manualBindAIItem('${idx}')" title="重新绑定">${tablerIcon('link')} 重新绑定</button>
        `;
        badge.style.background = '';
        badge.style.borderColor = '';
      }

      // Update tags
      const tags = row.querySelectorAll('.tag');
      tags.forEach(t => {
        if (t.textContent.includes('新商品')) {
          t.textContent = '已匹配';
          t.style.background = 'rgba(46,204,113,0.15)';
          t.style.color = '#2ecc71';
        }
      });
      
      // Update item name in header
      const nameSpan = row.querySelector('.ai-item-name');
      if (nameSpan) {
        nameSpan.textContent = matchedName;
        nameSpan.title = matchedName;
      }
    }
  }
}

