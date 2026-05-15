import { encryptLoginPassword } from './crypto.js';
import {
  SHENGMA_DEFAULT_BASE_URL,
  SHENGMA_SESSION_SETTING_KEY,
  SHENGMA_VENDOR_MACHINE_ID
} from './constants.js';
import { getSettingValue, saveSettingValue } from './settings.js';

const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
};

function joinCookie(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
      .map(cookie => cookie.split(';')[0])
      .filter(Boolean)
      .join('; ');
  }

  const cookie = headers.get('set-cookie');
  return cookie ? cookie.split(/,(?=[^;,]+=)/).map(value => value.split(';')[0]).join('; ') : '';
}

function mergeCookies(...cookies) {
  const jar = new Map();
  for (const cookie of cookies) {
    String(cookie || '')
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const index = part.indexOf('=');
        if (index > 0) jar.set(part.slice(0, index), part);
      });
  }
  return Array.from(jar.values()).join('; ');
}

function isLoginPage(text, response) {
  const url = response?.url || '';
  return /mobilelogin|login/i.test(url)
    || /name=["']username["']|mobilelogin\.html|encryptAesKey/.test(text || '');
}

function isSuccessfulLoginResponse(response, cookie) {
  const location = response.headers.get('location') || '';
  return !!cookie
    && (response.ok || response.status === 302 || response.status === 303)
    && !/mobilelogin|login/i.test(location);
}

function isLoginFormContent(text) {
  return /name=["']username["']|mobilelogin\.html|encryptAesKey/.test(text || '');
}

export function getShengmaConfig(env) {
  return {
    baseUrl: String(env.SHENGMA_BASE_URL || SHENGMA_DEFAULT_BASE_URL).replace(/\/$/, ''),
    username: String(env.SHENGMA_USERNAME || '').trim(),
    password: String(env.SHENGMA_PASSWORD || '')
  };
}

export function hasShengmaCredentials(env) {
  const config = getShengmaConfig(env);
  return !!(config.username && config.password);
}

export class ShengmaClient {
  constructor(env) {
    this.env = env;
    this.config = getShengmaConfig(env);
    this.cookie = '';
  }

  async ensureSession() {
    if (!this.config.username || !this.config.password) {
      throw new Error('缺少 SHENGMA_USERNAME 或 SHENGMA_PASSWORD，请先在 Cloudflare Pages Secret 中配置');
    }

    const cached = await getSettingValue(this.env.DB, SHENGMA_SESSION_SETTING_KEY);
    if (cached?.cookie && Number(cached.expiresAt || 0) > Date.now()) {
      this.cookie = String(cached.cookie);
      if (await this.verifyCookie()) return this.cookie;
    }

    await this.login();
    return this.cookie;
  }

  async verifyCookie() {
    if (!this.cookie) return false;
    const response = await this.fetchPath(`/mobile/goods.html?id=${SHENGMA_VENDOR_MACHINE_ID}&pageName=machine&v=9`, {
      allowLoginPage: true
    });
    return !isLoginPage(response.text, response.response);
  }

  async login() {
    const loginPage = await fetch(`${this.config.baseUrl}/mobile/mobilelogin.html`, {
      method: 'GET',
      redirect: 'manual',
      headers: DEFAULT_HEADERS
    });
    const initialCookie = joinCookie(loginPage.headers);
    const encrypted = encryptLoginPassword(this.config.password);
    const body = new URLSearchParams({
      username: this.config.username,
      password: encrypted.password,
      encryptAesKey: encrypted.encryptAesKey,
      rememberMe: 'true'
    });

    const response = await fetch(`${this.config.baseUrl}/mobile/mobilelogin.html`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...DEFAULT_HEADERS,
        ...(initialCookie ? { Cookie: initialCookie } : {}),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const text = await response.text();
    const cookie = mergeCookies(initialCookie, joinCookie(response.headers));
    if (!isSuccessfulLoginResponse(response, cookie)) {
      throw new Error(`盛码登录失败：HTTP ${response.status}`);
    }
    if (response.ok && isLoginFormContent(text)) {
      throw new Error(`盛码登录失败：HTTP ${response.status}`);
    }

    this.cookie = cookie;
    await saveSettingValue(this.env.DB, SHENGMA_SESSION_SETTING_KEY, {
      cookie,
      expiresAt: Date.now() + 50 * 60 * 1000
    });
  }

  async fetchPath(path, options = {}) {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        ...(this.cookie ? { Cookie: this.cookie } : {})
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`盛码接口请求失败：${path} HTTP ${response.status}`);
    }
    if (!options.allowLoginPage && isLoginPage(text, response)) {
      if (options.allowRelogin === false) {
        throw new Error(`盛码会话已失效，重新登录后仍返回登录页：${path}`);
      }
      await this.login();
      return await this.fetchPath(path, { ...options, allowRelogin: false });
    }
    return { text, response };
  }

  async fetchGoods() {
    await this.ensureSession();
    return (await this.fetchPath(`/mobile/goods.html?id=${SHENGMA_VENDOR_MACHINE_ID}&pageName=machine&v=9`)).text;
  }

  async fetchCosts() {
    await this.ensureSession();
    return (await this.fetchPath(`/mobile/setJinjia.html?id=${SHENGMA_VENDOR_MACHINE_ID}`)).text;
  }

  async fetchSalesPage(startDate, endDate, pageNo) {
    await this.ensureSession();
    const params = new URLSearchParams({
      pageType: '0',
      id: SHENGMA_VENDOR_MACHINE_ID,
      startTime: startDate,
      endTime: endDate,
      pageno: String(pageNo)
    });
    return (await this.fetchPath(`/mobile/salesAll.html?${params}`)).text;
  }
}
