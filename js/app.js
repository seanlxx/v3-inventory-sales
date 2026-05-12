/**
 * 主应用逻辑 - 路由 & 导航
 */

let currentPage = 'dashboard';

const AUTH_SESSION_KEY = 'vendingAuthSession';
const AUTH_DEFAULT_USERNAME = 'admin';
const AUTH_FALLBACK_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function applyBrowserUiProfile() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isChromeIOS = /CriOS/i.test(ua);
  const isFirefoxIOS = /FxiOS/i.test(ua);
  const isEdgeIOS = /EdgiOS/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isIOSSafari = isIOS && isSafari && !isChromeIOS && !isFirefoxIOS && !isEdgeIOS;

  document.body.classList.toggle('platform-ios', isIOS);
  document.body.classList.toggle('browser-ios-safari', isIOSSafari);
  document.body.classList.toggle('browser-ios-chrome', isIOS && isChromeIOS);
}

function syncVisualViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  if (height) {
    document.documentElement.style.setProperty('--app-visual-height', `${Math.round(height)}px`);
  }
}

function setupViewportMetrics() {
  syncVisualViewportHeight();
  window.visualViewport?.addEventListener('resize', syncVisualViewportHeight);
  window.visualViewport?.addEventListener('scroll', syncVisualViewportHeight);
  window.addEventListener('resize', syncVisualViewportHeight);
  window.addEventListener('orientationchange', () => {
    window.setTimeout(syncVisualViewportHeight, 250);
  });
}

if (document.body) {
  applyBrowserUiProfile();
  setupViewportMetrics();
  document.body.classList.add('auth-checking');
}

/**
 * 初始化应用
 */
async function initApp() {
  initTheme();

  try {
    await openDB();
    setupNavigation();

    if (await hasValidAuthSession()) {
      showAppShell();
      navigateTo('dashboard');
    } else {
      showLoginPage();
    }
  } catch (error) {
    console.error('App init error:', error);
    showLoginPage('系统初始化失败：' + error.message);
  }
}

function getAuthNow() {
  return Date.now();
}

async function getAuthConfig() {
  const profile = await cloudRpc('vm_get_auth_profile', {}, { skipSession: false });
  if (!profile) return { username: AUTH_DEFAULT_USERNAME, usesDefaultPassword: true };
  return {
    username: profile.username || AUTH_DEFAULT_USERNAME,
    usesDefaultPassword: !!(profile.usesDefaultPassword ?? profile.uses_default_password)
  };
}

function getAuthSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
}

async function hasValidAuthSession() {
  const session = getAuthSession();
  if (!session || !session.token || !session.expiresAt || session.expiresAt <= getAuthNow()) {
    clearAuthSession();
    return false;
  }

  updateAuthUserLabel(session.username || AUTH_DEFAULT_USERNAME);
  return true;
}

function setAuthSession(sessionData) {
  const fallbackExpiresAt = getAuthNow() + AUTH_FALLBACK_SESSION_DURATION_MS;
  const expiresAt = sessionData.expiresAt || sessionData.expires_at || fallbackExpiresAt;
  const normalizedExpiresAt = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
  const session = {
    token: sessionData.token,
    username: sessionData.username || AUTH_DEFAULT_USERNAME,
    issuedAt: getAuthNow(),
    expiresAt: Number.isFinite(normalizedExpiresAt) ? normalizedExpiresAt : fallbackExpiresAt,
    usesDefaultPassword: !!sessionData.usesDefaultPassword
  };
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    ...session
  }));
  updateAuthUserLabel(session.username);
  return session;
}

function clearAuthSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

async function verifyAuthCredentials(username, password) {
  const result = await cloudRpc('vm_login', {
    p_username: username.trim(),
    p_password: password
  }, { skipSession: true });

  if (!result || !result.token) {
    return null;
  }

  return {
    token: result.token,
    username: result.username,
    expiresAt: result.expires_at,
    usesDefaultPassword: !!result.uses_default_password
  };
}

function showAppShell() {
  const appLayout = document.getElementById('appLayout');
  if (appLayout) appLayout.hidden = false;
  document.getElementById('loginPage')?.remove();
  document.body.classList.remove('auth-checking', 'auth-mode');
  document.body.classList.add('auth-ready');
  updateAuthUserLabel(getAuthSession()?.username || AUTH_DEFAULT_USERNAME);
}

function showLoginPage(message = '') {
  clearAuthSession();
  const appLayout = document.getElementById('appLayout');
  if (appLayout) appLayout.hidden = true;

  let loginPage = document.getElementById('loginPage');
  if (!loginPage) {
    loginPage = document.createElement('main');
    loginPage.id = 'loginPage';
    loginPage.className = 'login-page';
    document.body.appendChild(loginPage);
  }

  loginPage.innerHTML = `
    <section class="login-panel card">
      <div class="login-brand">
        <div class="login-brand-icon">${tablerIcon('building-store')}</div>
        <div>
          <h1>售货机管理系统</h1>
          <p>请登录后继续管理库存、销售和利润</p>
        </div>
      </div>

      <form class="login-form" id="loginForm" autocomplete="on" novalidate>
        <div class="form-group">
          <label for="loginUsername">用户名</label>
          <input type="text" id="loginUsername" class="form-control form-input" placeholder="请输入用户名" autocomplete="username" required>
        </div>
        <div class="form-group">
          <label for="loginPassword">密码</label>
          <div class="password-input-wrap">
            <input type="password" id="loginPassword" class="form-control form-input" placeholder="请输入密码" autocomplete="current-password" required>
            <button type="button" class="btn btn-icon btn-ghost password-toggle" id="loginPasswordToggle" title="显示/隐藏密码">${tablerIcon('eye')}</button>
          </div>
        </div>
        <div class="login-error ${message ? 'active' : ''}" id="loginError">${escapeHtml(message)}</div>
        <button type="submit" class="btn btn-primary btn-lg login-submit" id="loginSubmit">${tablerIcon('login')} 登录</button>
      </form>
    </section>
  `;

  document.body.classList.remove('auth-checking', 'auth-ready');
  document.body.classList.add('auth-mode');

  const usernameInput = loginPage.querySelector('#loginUsername');
  const passwordInput = loginPage.querySelector('#loginPassword');
  const form = loginPage.querySelector('#loginForm');

  form?.addEventListener('submit', handleLoginSubmit);
  loginPage.querySelector('#loginPasswordToggle')?.addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    loginPage.querySelector('#loginPasswordToggle').innerHTML = tablerIcon(passwordInput.type === 'password' ? 'eye' : 'eye-off');
  });

  requestAnimationFrame(() => {
    (usernameInput.value ? passwordInput : usernameInput).focus({ preventScroll: true });
  });
}

function setLoginError(message) {
  const errorEl = document.getElementById('loginError');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.toggle('active', !!message);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('loginSubmit');
  const username = usernameInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  if (!username || !password) {
    setLoginError('请输入用户名和密码');
    return;
  }

  submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> 登录中';
  setLoginError('');

  try {
    const loginSession = await verifyAuthCredentials(username, password);
    if (!loginSession) {
      await new Promise(resolve => setTimeout(resolve, 350));
      throw new Error('用户名或密码错误');
    }

    const session = setAuthSession(loginSession);
    showAppShell();
    await navigateTo('dashboard');
    showToast(session.usesDefaultPassword ? '已使用默认账号登录，请尽快修改密码' : '登录成功', session.usesDefaultPassword ? 'info' : 'success');
  } catch (error) {
    setLoginError(error.message || '登录失败，请稍后重试');
    passwordInput.value = '';
    passwordInput.focus({ preventScroll: true });
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `${tablerIcon('login')} 登录`;
  }
}

function setupAuthControls() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !document.getElementById('authFooter')) {
    const footer = document.createElement('div');
    footer.id = 'authFooter';
    footer.className = 'auth-footer';
    footer.innerHTML = `
      <div class="auth-user">
        <span class="auth-user-dot">${tablerIcon('user-circle')}</span>
        <span id="authUserLabel">admin</span>
      </div>
      <button id="logoutBtn" class="btn btn-sm btn-ghost" title="退出登录">${tablerIcon('logout')} 退出</button>
    `;
    const themeWrap = sidebar.querySelector('.theme-toggle-wrap');
    sidebar.insertBefore(footer, themeWrap || null);
  }

  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
}

function updateAuthUserLabel(username) {
  const label = document.getElementById('authUserLabel');
  if (label) label.textContent = username || AUTH_DEFAULT_USERNAME;
}

function handleLogout() {
  clearPageData();
  clearAuthSession();
  currentPage = 'dashboard';
  showLoginPage();
  showToast('已退出登录', 'info');
}

function handleAuthExpired(message = '登录已过期，请重新登录') {
  clearPageData();
  clearAuthSession();
  currentPage = 'dashboard';
  showLoginPage(message);
}

/**
 * 设置导航事件
 */
function setupNavigation() {
  setupAuthControls();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) navigateTo(page);
    });
  });

  // 外观模式切换
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // 移动端菜单toggle
  const menuToggle = document.getElementById('menuToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('sidebar-open');
      sidebarOverlay?.classList.toggle('active');
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.remove('sidebar-open');
      sidebarOverlay.classList.remove('active');
    });
  }
}

/**
 * 导航到指定页面
 *
 * 策略: Skeleton-first + stale-while-revalidate
 *   1. 立刻切换激活态 / 关闭侧栏 (0ms 感知)
 *   2. 如果此页的上次渲染 HTML 仍在内存且未被标脏, 先把它塞回 mainContent
 *      —— 用户瞬间看到"上次的数据", 无白屏
 *   3. 随后异步跑 render*Page() 拉新数据, 完成后替换内容
 *   4. 如果没有缓存或缓存脏了, 展示轻量 skeleton 再拉数据
 *
 * 注: 脏标记由 db.js 的 markPageDirty 在数据变更后触发, 保证数据不会看到旧状态
 */
const _pageHtmlCache = new Map();
const _pageDirty = new Set();
let _navigationToken = 0;

function _pageSkeletonHtml(page) {
  const rows = page === 'dashboard' ? 4 : 6;
  const cards = [];
  for (let i = 0; i < rows; i++) {
    cards.push('<div class="skeleton-card" aria-hidden="true"></div>');
  }
  return `
    <div class="page-skeleton" data-page="${escapeHtml(page)}">
      <div class="skeleton-title" aria-hidden="true"></div>
      <div class="skeleton-grid">${cards.join('')}</div>
    </div>`;
}

async function navigateTo(page) {
  if (!(await hasValidAuthSession())) {
    showLoginPage('登录已过期，请重新登录');
    return;
  }

  currentPage = page;
  const content = document.getElementById('mainContent');
  if (!content) return;

  // 每次切换都推进 token; 并发切换时只有最后一次能落盘
  const token = ++_navigationToken;

  // 1) 立刻更新激活状态 + 关闭侧栏 — 0ms 感知
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  document.querySelector('.sidebar')?.classList.remove('sidebar-open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');

  // 2) 有干净缓存则先显示, 无缓存则展示 skeleton
  const cached = _pageHtmlCache.get(page);
  const isCachedUsable = cached && !_pageDirty.has(page);
  if (isCachedUsable) {
    content.innerHTML = cached;
    content.classList.remove('page-loading');
    content.classList.add('page-revalidating');
  } else {
    content.innerHTML = _pageSkeletonHtml(page);
    content.classList.add('page-loading');
    content.classList.remove('page-revalidating');
  }
  content.scrollTop = 0;

  // 3) 后台拉新数据 (SWR)
  try {
    let html = '';
    switch (page) {
      case 'dashboard':
        html = await renderDashboard();
        break;
      case 'products':
        html = await renderProductsPage();
        break;
      case 'purchases':
        html = await renderPurchasesPage();
        break;
      case 'sales':
        html = await renderSalesPage();
        break;
      case 'ai':
        html = await renderAIPage();
        break;
      case 'settings':
        html = await renderSettingsPage();
        break;
      default:
        html = '<div class="empty-state"><p>页面不存在</p></div>';
    }
    // 如果此间又发生新的导航则放弃落盘, 防止闪回旧页面
    if (token !== _navigationToken) return;
    content.innerHTML = html;
    _pageHtmlCache.set(page, html);
    _pageDirty.delete(page);
  } catch (error) {
    console.error('Page render error:', error);
    if (token !== _navigationToken) return;
    content.innerHTML = `<div class="error-state glass-card card"><h3>${tablerIcon('alert-circle')} 加载失败</h3><p>${escapeHtml(error.message)}</p></div>`;
  }

  content.classList.remove('page-loading', 'page-revalidating');
  if (typeof updatePageUiState === 'function') {
    updatePageUiState(page, getPageUiState(page));
  }
}

// 数据层调用 markPageDirty 时同步失效本模块的页面缓存
// 不覆盖外部同名函数, 而是 wrap 已有实现
if (typeof window !== 'undefined') {
  const _origMarkPageDirty = typeof markPageDirty === 'function' ? markPageDirty : null;
  window.markPageDirty = function (page) {
    if (page) _pageDirty.add(page);
    if (_origMarkPageDirty) _origMarkPageDirty(page);
  };
  const _origClearPageData = typeof clearPageData === 'function' ? clearPageData : null;
  window.clearPageData = function (page) {
    if (page) {
      _pageDirty.add(page);
      _pageHtmlCache.delete(page);
    } else {
      _pageDirty.clear();
      _pageHtmlCache.clear();
    }
    if (_origClearPageData) _origClearPageData(page);
  };
}

async function saveAuthSettings() {
  const username = document.getElementById('settingsLoginUsername')?.value.trim() || '';
  const currentPassword = document.getElementById('settingsCurrentPassword')?.value || '';
  const newPassword = document.getElementById('settingsNewPassword')?.value || '';
  const confirmPassword = document.getElementById('settingsConfirmPassword')?.value || '';

  if (!username) {
    showToast('用户名不能为空', 'error');
    return;
  }

  if (!currentPassword) {
    showToast('请输入当前密码后再保存', 'error');
    return;
  }

  if (newPassword || confirmPassword) {
    if (newPassword.length < 4) {
      showToast('新密码至少需要 4 位', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
  }

  try {
    const result = await cloudRpc('vm_update_auth', {
      p_username: username,
      p_current_password: currentPassword,
      p_new_password: newPassword || null
    });
    setAuthSession({
      token: result.token,
      username: result.username,
      expiresAt: result.expires_at,
      usesDefaultPassword: !!result.uses_default_password
    });
    showToast('账户安全设置已保存');
    await navigateTo('settings');
  } catch (error) {
    showToast('保存失败: ' + error.message, 'error');
  }
}

/**
 * 设置页面
 */
async function renderSettingsPage() {
  const currentModel = await getSelectedAIModel();
  const aiStatus = await getAIConfigStatus(currentModel.id);
  const aiPlatformConfig = getAIPlatformConfig(aiStatus.platform);
  const aiClientConfig = await getAIClientConfig(aiStatus.platform);
  const businessSettings = await getBusinessSettings();
  const authConfig = await getAuthConfig();
  const authUsername = authConfig.username || AUTH_DEFAULT_USERNAME;
  const usesDefaultPassword = !!authConfig.usesDefaultPassword;
  const machines = await getMachines();
  const envKeyByPlatform = {
    opencode: 'OPENCODE_API_KEY',
    yunwu: 'YUNWU_API_KEY',
    qwen: 'QWEN_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    claude: 'CLAUDE_API_KEY'
  };
  const baseEnvKeyByPlatform = {
    opencode: 'OPENCODE_BASE_URL',
    yunwu: 'YUNWU_BASE_URL',
    qwen: 'QWEN_BASE_URL',
    deepseek: 'DEEPSEEK_BASE_URL',
    claude: 'CLAUDE_BASE_URL'
  };
  const canEditAIConfig = true;
  const platformEnvKey = envKeyByPlatform[aiStatus.platform] || 'API_KEY';
  const platformBaseEnvKey = baseEnvKeyByPlatform[aiStatus.platform] || 'BASE_URL';
  const aiConfigHelp = aiStatus.platform === 'qwen'
    ? '百炼 API Key 保存在登录后的数据库设置中，不会随数据备份导出。'
    : aiStatus.serverConfigured
      ? `当前模型已配置服务器端 ${aiStatus.label}；也可以在这里保存数据库配置来覆盖当前平台。`
      : `服务器端未配置 ${aiStatus.label}，请在这里填写 API Key 和 Base URL，或在部署环境配置 ${platformEnvKey}。`;
  const aiKeyPlaceholder = `请输入 ${aiStatus.label}，或配置服务器 ${platformEnvKey}`;
  const aiBaseHint = aiStatus.platform === 'qwen'
    ? '百炼 OpenAI 兼容接口通常以 /v1 结尾，默认地址可直接使用。'
    : aiStatus.platform === 'deepseek'
      ? 'DeepSeek 官方接口地址为 https://api.deepseek.com/v1，需要使用 DeepSeek 官方 API Key，xcode.best 中转 Key 不可用。'
      : aiStatus.platform === 'yunwu'
        ? '云雾中转地址为 https://yunwu.ai/v1，默认模型 gemini-3.1-flash-lite。'
    : aiStatus.serverConfigured
      ? `中转地址来自服务器 ${platformBaseEnvKey}；数据库配置为空时优先使用服务器配置。`
      : 'OpenAI 兼容中转接口通常以 /v1 结尾；如果你的 Key 对应其它中转域名，请填写对应 Base URL。';

  return `
    <div class="settings-page page-stack container-xl">
    ${renderPageHeader({
      title: '设置',
      desc: '管理账户安全、经营参数、AI 配置、数据和售货机',
      icon: 'settings'
    })}

    <div class="settings-grid">
    <div class="settings-column">
    <div class="glass-card card settings-section">
      <div class="card-header"><h3 class="card-title">${tablerIcon('shield-lock')} 账户安全</h3></div>
      <div class="card-body">
      ${usesDefaultPassword ? `
        <div class="security-warning">
          当前仍在使用默认登录密码，请尽快修改。
        </div>
      ` : ''}
      <div class="form-grid">
        <div class="form-group">
          <label>登录用户名</label>
          <input type="text" id="settingsLoginUsername" class="form-control form-input"
            value="${escapeAttr(authUsername)}" autocomplete="username">
        </div>
        <div class="form-group">
          <label>当前密码</label>
          <input type="password" id="settingsCurrentPassword" class="form-control form-input" placeholder="请输入当前密码" autocomplete="current-password">
        </div>
        <div class="form-group">
          <label>新密码</label>
          <input type="password" id="settingsNewPassword" class="form-control form-input" placeholder="留空则不修改密码" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label>确认新密码</label>
          <input type="password" id="settingsConfirmPassword" class="form-control form-input" placeholder="再次输入新密码" autocomplete="new-password">
        </div>
      </div>
      <p class="form-hint">默认账号为 admin / admin。建议修改后妥善保存新密码。</p>
      <button class="btn btn-primary" style="margin-top: 12px;" onclick="saveAuthSettings()">${tablerIcon('device-floppy')} 保存账户安全设置</button>
      </div>
    </div>

    <div class="glass-card card settings-section">
      <div class="card-header"><h3 class="card-title">${tablerIcon('adjustments-horizontal')} 经营参数</h3></div>
      <div class="card-body">
      <div class="form-grid">
        <div class="form-group">
          <label>平台手续费率 (%)</label>
          <input type="number" id="settingsFeeRate" class="form-control form-input" step="0.01" min="0" value="${formatNumber(businessSettings.feeRate * 100, 2)}">
          <p class="form-hint">用于销售管理和仪表盘净利润计算，默认 0.6%。</p>
        </div>
        <div class="form-group">
          <label>低库存阈值 (件)</label>
          <input type="number" id="settingsLowStockThreshold" class="form-control form-input" min="0" step="1" value="${businessSettings.lowStockThreshold}">
          <p class="form-hint">库存小于等于此数值时进入预警。</p>
        </div>
        <div class="form-group">
          <label>补货目标天数</label>
          <input type="number" id="settingsRestockTargetDays" class="form-control form-input" min="1" step="1" value="${businessSettings.restockTargetDays}">
          <p class="form-hint">用于本地异常提醒和 AI 补货提示参考。</p>
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveBusinessSettings()">${tablerIcon('device-floppy')} 保存经营参数</button>
      </div>
    </div>

    <div class="glass-card card settings-section">
      <div class="card-header"><h3 class="card-title">${tablerIcon('database-export')} 数据管理</h3></div>
      <div class="card-body">
      <p class="settings-desc">备份数据防止浏览器清理导致数据丢失。建议定期备份。</p>
      
      <div class="form-group" style="margin-bottom: 20px;">
        <label class="checkbox-container">
          <input type="checkbox" id="exportExcludeImages" checked>
          <span class="checkbox-label">导出时不包含图片记录 (可大幅减小文件体积)</span>
        </label>
      </div>

      <div class="settings-actions">
        <button class="btn btn-accent" onclick="handleExportData()">
          ${tablerIcon('download', 'btn-icon-left')} 导出数据
        </button>
        <button class="btn btn-ghost" onclick="handleImportData()">
          ${tablerIcon('upload', 'btn-icon-left')} 导入数据
        </button>
        <input type="file" id="importFileInput" accept=".json" style="display:none" onchange="handleFileImport(event)">
      </div>
      </div>
    </div>

    <div class="glass-card card settings-section settings-danger">
      <div class="card-header"><h3 class="card-title">${tablerIcon('alert-triangle')} 危险操作</h3></div>
      <div class="card-body">
      <p class="settings-desc text-red">清空所有数据将不可恢复，请先备份。</p>
      <div class="settings-actions">
        <button class="btn btn-danger" onclick="handleClearAllData()">
          ${tablerIcon('trash', 'btn-icon-left')} 清空所有数据
        </button>
      </div>
      </div>
    </div>
    </div>
    <div class="settings-column">
    <div class="glass-card card settings-section">
      <div class="card-header"><h3 class="card-title">${tablerIcon('brain')} AI 配置</h3></div>
      <div class="card-body">
      <p class="settings-desc">GPT 走 OpenCode 中转，Gemini 可走云雾中转，DeepSeek 走官方接口，Claude 走 xcode.best 兼容中转；服务器未配置 Key 时可在这里手动填写。</p>
      <div class="form-grid">
        <div class="form-group">
          <label>当前模型配置状态</label>
          <div class="form-control form-input settings-status-field ${aiStatus.configured ? 'status-success' : 'status-warning'}">
            ${aiStatus.configured ? '已配置' : '未配置'} · ${escapeHtml(aiStatus.label)}${aiStatus.clientConfigured ? ' · 数据库配置' : aiStatus.serverConfigured ? ' · 服务器配置' : ''}
          </div>
          <p class="form-hint">${escapeHtml(aiConfigHelp)}</p>
        </div>
        <div class="form-group">
          <label>AI 模型</label>
          <select id="settingsAiModel" class="form-select" onchange="saveSettingsModel()">
            ${AI_MODELS.map(m => optionHtml(m.id, m.name, m.id === currentModel.id)).join('')}
          </select>
          <p class="form-hint">用于补货建议、订单截图识别、销售截图识别</p>
        </div>
        <div class="form-group">
          <label>${escapeHtml(aiPlatformConfig.label)}</label>
          <input type="password" id="settingsAiApiKey" class="form-control form-input" value="${escapeAttr(aiClientConfig.apiKey)}" placeholder="${escapeAttr(aiKeyPlaceholder)}" autocomplete="off" ${canEditAIConfig ? '' : 'disabled'}>
        </div>
        <div class="form-group">
          <label>API Base URL</label>
          <input type="url" id="settingsAiBaseUrl" class="form-control form-input" value="${escapeAttr(aiClientConfig.baseUrl)}" placeholder="${escapeAttr(aiPlatformConfig.defaultBaseUrl)}" autocomplete="off" ${canEditAIConfig ? '' : 'disabled'}>
          <p class="form-hint">${escapeHtml(aiBaseHint)}</p>
        </div>
      </div>
      <div class="settings-actions" style="margin-top: 12px;">
        <button class="btn btn-primary" onclick="saveSettingsApiKey()" ${canEditAIConfig ? '' : 'disabled'}>${tablerIcon('device-floppy')} 保存 AI API 配置</button>
        <button class="btn btn-ghost" onclick="clearSettingsApiKey()">${tablerIcon('eraser')} 清除数据库配置</button>
      </div>
      </div>
    </div>

    <div class="glass-card card settings-section">
      <div class="card-header"><h3 class="card-title">${tablerIcon('building-store')} 售货机管理</h3></div>
      <div class="card-body">
      <p class="settings-desc">管理售货机名称，修改后所有下拉菜单和仪表盘会自动更新。</p>
      <div id="machinesList" class="machine-list">
        ${machines.map((m, i) => `
          <div class="machine-item">
            <input type="text" class="form-control form-input machine-name-input" value="${escapeAttr(m)}" data-index="${i}" placeholder="售货机名称">
            <button class="btn btn-sm btn-danger-ghost" onclick="removeMachineItem(this)">${tablerIcon('trash')} 删除</button>
          </div>
        `).join('')}
      </div>
      <div class="settings-actions">
        <button class="btn btn-ghost btn-sm" onclick="addMachineItem()">${tablerIcon('plus')} 添加售货机</button>
        <button class="btn btn-primary btn-sm" onclick="saveMachinesSettings()">${tablerIcon('device-floppy')} 保存售货机设置</button>
      </div>
      <p class="form-hint">请至少保留一台售货机；已存在商品不会自动改名，需要在商品编辑中迁移。</p>
      </div>
    </div>
    </div>
    </div>
    </div>
  `;
}

/**
 * 保存所有的 API Keys 和配置
 */
function addMachineItem() {
  const list = document.getElementById('machinesList');
  if (!list) return;
  const index = list.querySelectorAll('.machine-item').length;
  list.insertAdjacentHTML('beforeend', `
    <div class="machine-item">
      <input type="text" class="form-control form-input machine-name-input" value="" data-index="${index}" placeholder="售货机名称">
      <button class="btn btn-sm btn-danger-ghost" onclick="removeMachineItem(this)">${tablerIcon('trash')} 删除</button>
    </div>
  `);
}

function removeMachineItem(button) {
  const item = button?.closest('.machine-item');
  if (!item) return;
  const list = document.getElementById('machinesList');
  if (list && list.querySelectorAll('.machine-item').length <= 1) {
    showToast('至少保留一台售货机', 'error');
    return;
  }
  item.remove();
}

async function saveMachinesSettings() {
  const names = Array.from(document.querySelectorAll('.machine-name-input'))
    .map(input => input.value.trim())
    .filter(Boolean);
  const uniqueNames = Array.from(new Set(names));
  if (uniqueNames.length === 0) {
    showToast('请至少填写一台售货机', 'error');
    return;
  }
  if (uniqueNames.length !== names.length) {
    showToast('售货机名称不能重复', 'error');
    return;
  }
  await setSetting('machines', JSON.stringify(uniqueNames));
  clearPageData();
  showToast('售货机设置已保存');
  await navigateTo('settings');
}
async function saveSettingsApiKey() {
  const model = await getSelectedAIModel();
  const platform = getAIModelPlatform(model.id);
  const apiKey = document.getElementById('settingsAiApiKey')?.value || '';
  const baseUrl = document.getElementById('settingsAiBaseUrl')?.value || '';

  if (!apiKey.trim()) {
    showToast('请输入 API Key 后再保存', 'error');
    return;
  }

  await saveAIClientConfig(platform, { apiKey, baseUrl });
  showToast('AI API 配置已保存');
  await navigateTo('settings');
}

async function clearSettingsApiKey() {
  const model = await getSelectedAIModel();
  await clearAIClientConfig(getAIModelPlatform(model.id));
  showToast('已清除当前模型平台的 AI 配置');
  await navigateTo('settings');
}

async function saveSettingsModel() {
  const select = document.getElementById('settingsAiModel');
  const modelId = select?.value || AI_DEFAULT_MODEL;
  if (!AI_MODELS.some(m => m.id === modelId)) {
    showToast('请选择有效的 AI 模型', 'error');
    return;
  }

  try {
    await setSetting('aiModel', modelId);
  } catch (error) {
    console.error('Save AI model failed:', error);
    showToast('AI 模型保存失败: ' + error.message, 'error');
    return;
  }

  const model = AI_MODELS.find(m => m.id === modelId);
  if (select) select.value = modelId;
  clearPageData('ai');
  clearPageData('settings');
  markPageDirty('ai');
  showToast(`AI 模型已保存为 ${model ? model.name : modelId}`);
  setTimeout(() => {
    if (currentPage === 'settings') navigateTo('settings');
  }, 80);
}

async function saveBusinessSettings() {
  const feePercent = toNumber(document.getElementById('settingsFeeRate')?.value, BUSINESS_DEFAULTS.feeRate * 100);
  const lowStockThreshold = Math.max(0, toInt(document.getElementById('settingsLowStockThreshold')?.value, BUSINESS_DEFAULTS.lowStockThreshold));
  const restockTargetDays = Math.max(1, toInt(document.getElementById('settingsRestockTargetDays')?.value, BUSINESS_DEFAULTS.restockTargetDays));

  await setSetting('feeRate', normalizeFeeRate(feePercent));
  await setSetting('lowStockThreshold', lowStockThreshold);
  await setSetting('restockTargetDays', restockTargetDays);
  markPageDirty('dashboard');
  markPageDirty('sales');
  markPageDirty('products');
  showToast('经营参数已保存');
}

async function handleExportData() {
  try {
    const excludeImages = document.getElementById('exportExcludeImages')?.checked || false;
    const data = await exportAllData({ excludeImages });
    const filename = `售货机数据备份${excludeImages ? '_轻量' : ''}_${getToday()}.json`;
    
    // 默认开启 minify 以减小体积
    downloadJSON(data, filename, true);
    
    showToast(excludeImages ? '数据已导出 (已排除图片)' : '数据已导出');
  } catch (error) {
    showToast('导出失败: ' + error.message, 'error');
  }
}

function handleImportData() {
  document.getElementById('importFileInput').click();
}

async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const confirmed = await showConfirm('导入数据将覆盖现有所有数据，确定继续吗？');
  if (!confirmed) return;

  try {
    const data = await readJSONFile(file);
    await importAllData(data);
    showToast('数据导入成功');
    navigateTo('dashboard');
  } catch (error) {
    showToast('导入失败: ' + error.message, 'error');
  }

  event.target.value = '';
}

async function handleClearAllData() {
  const confirmed = await showConfirm('确定清空所有数据吗？此操作不可恢复！');
  if (!confirmed) return;

  const confirmed2 = await showConfirm('再次确认：清空后所有商品、进货、销售记录都将删除！');
  if (!confirmed2) return;

  await dbClear(STORES.PRODUCTS);
  await dbClear(STORES.PURCHASES);
  await dbClear(STORES.SALES);
  showToast('所有数据已清空');
  navigateTo('dashboard');
}

/**
 * 初始化主题
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  
  if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
    document.body.classList.add('light-mode');
  }
  updateThemeIcon();
}

/**
 * 切换主题
 */
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  updateThemeIcon();
}

/**
 * 更新主题图标
 */
function updateThemeIcon() {
  const btn = document.getElementById('themeToggleBtn');
  const isLight = document.body.classList.contains('light-mode');
  document.documentElement.setAttribute('data-bs-theme', isLight ? 'light' : 'dark');
  if (btn) {
    btn.innerHTML = tablerIcon(isLight ? 'sun' : 'moon');
  }
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', initApp);
