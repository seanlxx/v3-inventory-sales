/**
 * AI 补货建议和截图识别模块
 */

const AI_MODELS = [
  { id: 'qwen3.5-omni-plus', name: 'Qwen Omni Plus (百炼超大杯)' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (云雾中转)' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini (OpenCode 中转)' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (官方接口)' },
  { id: 'claude-sonnet-4-6-max', name: 'Claude Sonnet 4.6 Max (中转)' }
];
const AI_DEFAULT_MODEL = 'gpt-5.4-mini';
const AI_TEXT_TIMEOUT_MS = 60000;
const AI_IMAGE_TIMEOUT_MS = 90000;
const AI_TEXT_MAX_TOKENS = 10000;
const AI_IMAGE_MAX_TOKENS = 2048;
const AI_RESTOCK_PRODUCT_LIMIT = 180;
const AI_PROXY_URL = '/api/ai-proxy';
const AI_CLIENT_CONFIG_SETTING_KEY = 'aiClientConfigs';

const AI_PLATFORM_CONFIG = {
  opencode: { label: 'OpenCode 中转', defaultBaseUrl: 'https://api.243706.xyz/v1' },
  yunwu: { label: '云雾中转 API Key', defaultBaseUrl: 'https://yunwu.ai/v1' },
  qwen: { label: '阿里云百炼 API Key', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  deepseek: { label: 'DeepSeek API Key', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  claude: { label: 'Claude API Key', defaultBaseUrl: 'https://xcode.best/v1' }
};



/**
 * 获取当前选中的AI模型
 */
async function getSelectedAIModel() {
  const savedId = await getSetting('aiModel');
  const legacyIdMap = {
    'claude-sonnet-4-5': 'claude-sonnet-4-6-max',
    'claude-sonnet-4-6': 'claude-sonnet-4-6-max'
  };
  const normalizedId = legacyIdMap[savedId] || savedId;
  const found = AI_MODELS.find(m => m.id === normalizedId);
  if (found) return found;
  await setSetting('aiModel', AI_DEFAULT_MODEL);
  return AI_MODELS.find(m => m.id === AI_DEFAULT_MODEL) || AI_MODELS[0];
}

function getAIModelPlatform(modelId) {
  if (modelId === 'qwen3.5-omni-plus') return 'qwen';
  if (modelId === 'gemini-3.1-flash-lite') return 'yunwu';
  if ((modelId || '').startsWith('deepseek')) return 'deepseek';
  if ((modelId || '').startsWith('claude')) return 'claude';
  return 'opencode';
}

function getAIPlatformConfig(platform) {
  return AI_PLATFORM_CONFIG[platform] || AI_PLATFORM_CONFIG.opencode;
}

async function readAIClientConfigs() {
  try {
    return await getSetting(AI_CLIENT_CONFIG_SETTING_KEY) || {};
  } catch {
    return {};
  }
}

async function writeAIClientConfigs(configs) {
  await setSetting(AI_CLIENT_CONFIG_SETTING_KEY, configs || {});
}

async function getAIClientConfig(platform) {
  const saved = (await readAIClientConfigs())[platform] || {};
  const platformConfig = getAIPlatformConfig(platform);
  return {
    apiKey: saved.apiKey || '',
    baseUrl: saved.baseUrl || platformConfig.defaultBaseUrl
  };
}

async function getAIClientConfigForModel(modelId) {
  const platform = getAIModelPlatform(modelId);
  const config = await getAIClientConfig(platform);
  return config.apiKey ? config : null;
}

async function saveAIClientConfig(platform, config) {
  const configs = await readAIClientConfigs();
  const next = {
    apiKey: (config.apiKey || '').trim(),
    baseUrl: (config.baseUrl || getAIPlatformConfig(platform).defaultBaseUrl).trim()
  };

  if (!next.apiKey && !next.baseUrl) {
    delete configs[platform];
  } else {
    configs[platform] = next;
  }
  await writeAIClientConfigs(configs);
  return next;
}

async function clearAIClientConfig(platform) {
  const configs = await readAIClientConfigs();
  delete configs[platform];
  await writeAIClientConfigs(configs);
}

async function getAIConfigStatus(modelId) {
  const platform = getAIModelPlatform(modelId);
  const settingKey = platform;
  const label = getAIPlatformConfig(platform).label;
  const clientConfigured = !!(await getAIClientConfig(platform)).apiKey;
  try {
    const res = await fetch(AI_PROXY_URL, { headers: aiProxyHeaders({ Accept: 'application/json' }) });
    const data = await res.json().catch(() => ({}));
    const serverConfigured = !!data.configured?.[platform];
    return { platform, settingKey, label, configured: clientConfigured || serverConfigured, clientConfigured, serverConfigured };
  } catch {
    return { platform, settingKey, label, configured: clientConfigured, clientConfigured, serverConfigured: false };
  }
}

function aiProxyHeaders(extra = {}) {
  if (typeof cloudHeaders === 'function') {
    return cloudHeaders(extra);
  }

  const headers = { ...extra };
  try {
    const raw = sessionStorage.getItem('vendingAuthSession');
    const session = raw ? JSON.parse(raw) : null;
    if (session?.token && session.expiresAt > Date.now()) {
      headers['X-VM-Session'] = session.token;
    }
  } catch {}
  return headers;
}

async function ensureSelectedAIConfigured() {
  const model = await getSelectedAIModel();
  const status = await getAIConfigStatus(model.id);
  if (!status.configured) {
    throw new Error(`当前模型 ${model.name} 需要先在设置页面配置 ${status.label}`);
  }
  return { model, status };
}

async function fetchAIWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI 请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未返回。线上网络到模型平台较慢，请稍后重试，或在设置中切换到离你更近的模型服务。`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function formatAIProxyError(status, error) {
  const message = String(error || '').trim();
  if (status === 503) {
    if (/not configured|api key/i.test(message)) {
      return `AI 中转未配置 API Key：${message}。请在设置里填写当前模型的 API Key，或在部署环境配置对应的服务端环境变量。`;
    }
    return 'AI 中转服务未配置或暂不可用（HTTP 503）。请在设置里填写当前模型的 API Key，或在部署环境配置对应的服务端环境变量。';
  }
  return message || `AI proxy HTTP ${status}`;
}

/**
 * 统一的 AI 调用接口。
 */
async function callAI({ modelId, systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, jsonSchema }) {
  const outputTokenLimit = maxTokens || (imageBase64 ? AI_IMAGE_MAX_TOKENS : AI_TEXT_MAX_TOKENS);
  const timeoutMs = imageBase64 ? AI_IMAGE_TIMEOUT_MS : AI_TEXT_TIMEOUT_MS;
  const clientConfig = await getAIClientConfigForModel(modelId);

  const res = await fetchAIWithTimeout(AI_PROXY_URL, {
    method: 'POST',
    headers: aiProxyHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      modelId,
      systemPrompt,
      userPrompt,
      imageBase64,
      mimeType,
      maxTokens: outputTokenLimit,
      jsonSchema,
      clientConfig
    })
  }, timeoutMs);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatAIProxyError(res.status, data.error));
  }

  return data.text || '';
}

/**
 * 流式 AI 调用 —— 通过 SSE 从 /api/ai-proxy?stream=1 读取增量。
 * 与 callAI 语义等价,额外接受 onProgress 回调:
 *   onProgress({ phase, elapsedMs, bytes, delta })
 *     phase: 'connected' | 'streaming' | 'done' | 'error'
 *
 * 核心价值: 用户从"空白等 60 秒"→"首字节 <1s 后持续可见",消除"卡住"的感知。
 */
async function callAIStream({ modelId, systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, jsonSchema, onProgress }) {
  const outputTokenLimit = maxTokens || (imageBase64 ? AI_IMAGE_MAX_TOKENS : AI_TEXT_MAX_TOKENS);
  const timeoutMs = imageBase64 ? AI_IMAGE_TIMEOUT_MS : AI_TEXT_TIMEOUT_MS;
  const clientConfig = await getAIClientConfigForModel(modelId);
  const startedAt = Date.now();
  const emit = (phase, extra = {}) => {
    if (typeof onProgress === 'function') {
      try { onProgress({ phase, elapsedMs: Date.now() - startedAt, ...extra }); } catch {}
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${AI_PROXY_URL}?stream=1`, {
      method: 'POST',
      headers: aiProxyHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
      body: JSON.stringify({
        modelId,
        systemPrompt,
        userPrompt,
        imageBase64,
        mimeType,
        maxTokens: outputTokenLimit,
        jsonSchema,
        clientConfig,
        stream: true
      }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      // 流式模式下超时不大会触发,因为心跳保活;一旦触发说明连接建立本身就失败
      throw new Error(`AI 请求超过 ${Math.round(timeoutMs / 1000)} 秒仍无响应,请重试或切换模型。`);
    }
    throw err;
  }

  if (!response.ok || !response.body) {
    clearTimeout(timer);
    let errMsg;
    try {
      const data = await response.json();
      errMsg = formatAIProxyError(response.status, data.error);
    } catch {
      errMsg = `AI proxy HTTP ${response.status}`;
    }
    throw new Error(errMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffered = '';
  let accumulated = '';
  let finalText = '';
  let streamError = null;
  let bytes = 0;
  let firstDelta = true;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      buffered += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffered.indexOf('\n\n')) !== -1) {
        const frame = buffered.slice(0, idx);
        buffered = buffered.slice(idx + 2);
        let event = 'message';
        let dataLine = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          // 心跳 ":" 行自动忽略
        }
        if (!dataLine) continue;
        let payload;
        try { payload = JSON.parse(dataLine); } catch { continue; }

        if (event === 'open') {
          emit('connected', { bytes });
        } else if (event === 'delta') {
          const chunk = payload.text || '';
          if (chunk) {
            accumulated += chunk;
            if (firstDelta) { firstDelta = false; }
            emit('streaming', { bytes, delta: chunk, accumulated });
          }
        } else if (event === 'done') {
          finalText = payload.text || accumulated;
        } else if (event === 'error') {
          streamError = payload.error || 'AI stream error';
        }
      }
    }
  } finally {
    clearTimeout(timer);
    try { reader.releaseLock(); } catch {}
  }

  if (streamError) {
    emit('error', { error: streamError });
    throw new Error(streamError);
  }

  const result = finalText || accumulated;
  emit('done', { bytes, accumulated: result });
  return result;
}

/**
 * 启动一个 UI 计时器,把 "已等待 X.Xs" 持续刷到 DOM。
 * 返回 stop() 函数。调用方负责在 finally 里停止。
 * 元素选择: 先找 selector, 没有就忽略。保证 UI 层永远不会再说"卡住"。
 */
function startAIProgressTimer(selector, { prefix = '已等待', suffix = '' } = {}) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return () => {};
  const startedAt = Date.now();
  const tick = () => {
    const s = (Date.now() - startedAt) / 1000;
    el.textContent = `${prefix} ${s.toFixed(1)}s${suffix}`;
  };
  tick();
  const id = setInterval(tick, 100);
  return () => clearInterval(id);
}

const AI_SYSTEM_PROMPT = `你是一个专业的无人售货机运营顾问。根据提供的商品数据给出精准、前瞻的补货和运营建议。不要只复述当前库存，要预测未来3天、7天、14天的断货和滞销风险。

数据说明：
- stock: 当前库存
- sell_price: 零售价, cost: 进货成本, profit_per_unit: 单品利润
- profit_margin: 利润率
- sales_7d: 近7天销量, sales_prev_7d: 上一个7天销量 (用于对比近期趋势)
- trend: 销量趋势 (上升📈, 下降📉, 平稳, 停滞)
- avg_daily_7d: 近7天日均销量 (更侧重近期表现)
- stock_days: 按近期日均销量计算的库存可售天数（999=无销量但有库存）
- forecast_3d / forecast_7d / forecast_14d: 按趋势修正后的未来销量预测
- expected_stock_7d / expected_stock_14d: 如果不补货，未来7/14天后的预计剩余库存
- stockout_risk_7d / stockout_risk_14d: 未来7/14天是否存在断货风险
- forecast_basis: 预测依据，说明为什么调高或调低了销量预期

分析规则：
1. 补货建议：
   - 重点关注 forecast_7d、expected_stock_7d、stockout_risk_7d，而不只是 stock_days。
   - 如果未来3天可能断货，urgency 必须为“紧急”，建议补到 10-14 天预测销量。
   - 如果未来7天可能断货，urgency 为“紧急”或“一般”，建议补到 10 天预测销量。
   - 如果未来14天可能断货但7天安全，可少量提前补货，避免下次巡检前断货。
   - 上升趋势、近7天销量明显高于上一个7天、或高利润商品，应提高安全库存。
   - 下降趋势、低利润、长库存天数商品，应减少补货或不补货，避免占用资金。
2. 预见性要求：
   - 每条补货 reason 必须包含一个未来判断，例如“按预测7天卖X件，当前库存会剩Y件/断货”。
   - 对爆发增长商品，要提醒可能是短期波动还是趋势变强。
   - 对库存看似充足但14天会耗尽的商品，要提前提醒。
3. 滞销处理：识别 sales_7d=0 且 sales_prev_7d=0，或 trend="下降趋势📉" 且库存较高的商品，给出降价、组合销售、减少补货或替换建议。
4. 新品推荐：根据畅销品类、缺失品类、利润结构和滞销替换机会，建议引入的新品方向。

【极其重要】你必须严格遵守JSON语法，使用双引号包裹属性名，数组元素之间必须有逗号，且不要使用 markdown \`\`\`json 包裹：
{
  "restock_list": [{"name":"商品名","current":当前库存,"restock":建议补货数量,"urgency":"紧急/一般/充足","reason":"简短原因，必须包含未来3/7/14天预测和数据支撑"}],
  "unsalable_items": [{"name":"商品名","current":当前库存,"advice":"处理建议"}],
  "new_products": [{"category":"推荐品类","reason":"推荐理由"}]
}`;

/**
 * 获取补货建议
 */
async function getRestockAdvice(machineId, onProgress) {
  await ensureSelectedAIConfigured();
  const businessSettings = await getBusinessSettings();

  // 获取指定售货机的商品
  const allProducts = await getAllProducts();
  const products = machineId === 'all'
    ? allProducts
    : allProducts.filter(p => p.machineId === machineId);

  if (products.length === 0) {
    showToast('该售货机还没有添加商品', 'error');
    return null;
  }

  // 获取近14天销售数据并拆分为近7天和上一个7天
  const allSales = await getRecentSales(14);
  const recentDays = getRecentDays(14);
  const recent7Days = getRecentDays(7);
  const prev7Days = recentDays.filter(d => !recent7Days.includes(d));

  const recentSales = allSales.filter(s =>
    s.type === 'daily' && recentDays.some(day => (s.date || '').startsWith(day)) &&
    (machineId === 'all' || s.machineId === machineId)
  );

  // 计算多维度销量
  const sales7d = {};
  const salesPrev7d = {};

  recentSales.forEach(s => {
    if (s.items && s.items.length > 0) {
      const dateStr = (s.date || '').split('T')[0].split(' ')[0];
      const is7d = recent7Days.some(d => dateStr.startsWith(d));
      
      s.items.forEach(item => {
        if (is7d) {
          sales7d[item.productId] = (sales7d[item.productId] || 0) + (item.quantity || 0);
        } else {
          salesPrev7d[item.productId] = (salesPrev7d[item.productId] || 0) + (item.quantity || 0);
        }
      });
    }
  });

  // 计算近期有销售数据的天数，用来更准确地算近期日均销量
  const uniqueSaleDays7d = new Set(recentSales.filter(s => {
    const dateStr = (s.date || '').split('T')[0].split(' ')[0];
    return recent7Days.some(d => dateStr.startsWith(d));
  }).map(s => (s.date || '').split('T')[0].split(' ')[0]));
  const daysWithData7d = Math.max(uniqueSaleDays7d.size, 1);

  // 构建轻量数据摘要，优先把高风险商品发给 AI，避免线上请求体过大。
  const summary = products.map(p => {
    const sold7d = sales7d[p.id] || 0;
    const soldPrev7d = salesPrev7d[p.id] || 0;
    const avgDaily7d = Math.round((sold7d / daysWithData7d) * 10) / 10;
    const rawMomentum = soldPrev7d > 0 ? sold7d / soldPrev7d : (sold7d > 0 ? 1.4 : 1);
    const momentumFactor = Math.max(0.6, Math.min(1.8, rawMomentum));
    const forecastDaily = Math.round(avgDaily7d * momentumFactor * 10) / 10;
    
    // 趋势判断
    let trend = '平稳';
    if (sold7d > soldPrev7d * 1.3 && sold7d > 2) trend = '上升趋势📈';
    else if (sold7d < soldPrev7d * 0.7 && soldPrev7d > 2) trend = '下降趋势📉';
    else if (sold7d === 0 && soldPrev7d === 0) trend = '停滞无销量';

    // 计算利润率和库存可售天数
    const sellPrice = p.sellPrice || 0;
    const avgCost = p.avgCost || 0;
    const profitPerUnit = sellPrice - avgCost;
    const profitMargin = sellPrice > 0 ? Math.round(((sellPrice - avgCost) / sellPrice) * 100) : 0;
    const stockDays = avgDaily7d > 0 ? Math.round((p.currentStock || 0) / avgDaily7d * 10) / 10 : (p.currentStock > 0 ? 999 : 0);
    const currentStock = p.currentStock || 0;
    const forecast3d = Math.round(forecastDaily * 3 * 10) / 10;
    const forecast7d = Math.round(forecastDaily * 7 * 10) / 10;
    const forecast14d = Math.round(forecastDaily * 14 * 10) / 10;
    const expectedStock7d = Math.round((currentStock - forecast7d) * 10) / 10;
    const expectedStock14d = Math.round((currentStock - forecast14d) * 10) / 10;
    const stockoutRisk7d = forecast7d > currentStock;
    const stockoutRisk14d = forecast14d > currentStock;
    const forecastBasis = soldPrev7d > 0
      ? `近7天销量为上期${Math.round(rawMomentum * 100)}%，预测系数${momentumFactor}`
      : sold7d > 0
        ? '上期无销量但近7天有销售，按新品/回暖提高预测'
        : '近14天无销量，按滞销处理';

    const riskScore =
      (stockoutRisk7d ? 120 : stockoutRisk14d ? 60 : stockDays < 3 ? 100 : stockDays < 5 ? 70 : 0) +
      (trend === '上升趋势📈' ? 30 : trend === '下降趋势📉' ? 12 : 0) +
      (sold7d > 0 ? Math.min(25, sold7d) : 0) +
      (profitMargin > 40 && sold7d > 0 ? 15 : 0) +
      (expectedStock7d < 0 ? Math.min(30, Math.abs(expectedStock7d) * 3) : 0) +
      (sold7d === 0 && soldPrev7d === 0 && currentStock > 0 ? Math.min(20, currentStock) : 0);

    return {
      name: p.name,
      category: p.category || '其他',
      stock: currentStock,
      sell_price: sellPrice,
      cost: avgCost,
      profit_per_unit: Math.round(profitPerUnit * 100) / 100,
      profit_margin: profitMargin + '%',
      sales_7d: sold7d,
      sales_prev_7d: soldPrev7d,
      trend: trend,
      avg_daily_7d: avgDaily7d,
      forecast_daily: forecastDaily,
      forecast_3d: forecast3d,
      forecast_7d: forecast7d,
      forecast_14d: forecast14d,
      expected_stock_7d: expectedStock7d,
      expected_stock_14d: expectedStock14d,
      stockout_risk_7d: stockoutRisk7d,
      stockout_risk_14d: stockoutRisk14d,
      forecast_basis: forecastBasis,
      stock_days: stockDays,
      risk_score: riskScore
    };
  }).sort((a, b) => b.risk_score - a.risk_score || b.sales_7d - a.sales_7d)
    .slice(0, AI_RESTOCK_PRODUCT_LIMIT)
    .map(({ risk_score, ...item }) => item);

  try {
    const model = await getSelectedAIModel();
    const text = await callAIStream({
      modelId: model.id,
      systemPrompt: AI_SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        machine: machineId,
        operation_settings: {
          restock_target_days: businessSettings.restockTargetDays,
          low_stock_threshold: businessSettings.lowStockThreshold,
          forecast_windows: ['3d', '7d', '14d'],
          advice_style: 'forward-looking'
        },
        product_scope: summary.length < products.length ? `已优先分析 ${summary.length}/${products.length} 个高风险、高销量或未来14天可能断货商品` : '全部商品',
        products: summary
      }),
      maxTokens: AI_TEXT_MAX_TOKENS,
      jsonSchema: true,
      onProgress
    });

    // 解析JSON响应
    let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    // 修复常见的JSON语法错误：对象之间漏掉逗号
    cleanText = cleanText.replace(/\}\s*\{/g, '},{');
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        throw new Error(`${parseError.message}\n原始返回内容:\n${cleanText}`);
      }
    }
    throw new Error('未找到有效的JSON内容:\n' + text);
  } catch (error) {
    console.error('AI API Error:', error);
    throw error; // 抛出给调用者处理
  }
}

// ==================== 订单截图识别 ====================

/**
 * 构建 Vision Prompt（纯 OCR，不传商品目录）
 * 商品绑定由本地 prepareAIRecognizedPurchaseItems() 完成
 */
function buildVisionPrompt() {
  return `你是电商订单识别助手。分析截图提取商品和订单信息。

核心规则：
1. 提取订单中所有显示的日期时间（如下单时间、发货时间、成交时间等），并将其中**最晚/最近的一个日期时间**作为 \`orderDate\` 返回，格式为 YYYY-MM-DDTHH:mm（如 2026-03-17T16:18）。如果截图中没有任何时间，则此字段为空字符串。
2. 如果一个订单包含多种口味/款式（如"青皮桔、柠檬、西柚、血橙各3瓶"），必须拆分为多个独立商品。
3. **【极其重要】数量计算规则**：仔细查看商品标题或规格中的多件装信息（如 "*23袋", "24瓶装", "整箱15件"）。如果订单页面显示的购买件数为 1，但标题写了 "*23袋"，那么实际入库的 quantity 必须是 23。公式：实际 quantity = 订单件数 × 标题/规格中标明的单品数量。
4. orderTotal 是订单应付/订单总额/实付款金额，不是商品标价小计，也不是"实际已支付"金额。先用后付/货到付款时"实际已支付"显示 ¥0，此时必须取"订单应付/订单总额"字段，例如截图显示"订单应付: ¥52.06"则 orderTotal = 52.06；如果截图有"实付: ¥130.97"，orderTotal = 130.97。
5. totalPrice 优先填写该商品行在截图中看到的行金额/标价；如果订单实付低于商品标价合计，不要自己分摊，本地程序会按 orderTotal 统一分摊。
6. unitPrice 是单件进货成本；如果截图显示的是整箱/整件行金额，unitPrice = 行金额 / quantity。
7. 如果截图同时出现单价和总价，必须满足 totalPrice ≈ unitPrice × quantity；不一致时保留截图原文到 totalPriceText/unitPriceText，不要猜。
8. name格式：品牌+口味+规格（尽量去掉多件装的信息，还原为单品名称），如"水溶C100柠檬味450ml"。
9. rawName 保留截图原始商品名，normalizedName 返回你标准化后的单品名称。
10. quantityText、totalPriceText、unitPriceText 分别保留截图里的原始数量/总价/单价文字；如果没看到对应字段，返回空字符串。

返回JSON对象，格式如下：
{
  "orderDate": "YYYY-MM-DDTHH:mm",
  "orderTotal": 订单实付金额或0,
  "items": [
    {"rawName":"截图原始商品名","name":"单品简称","normalizedName":"标准化单品名","quantity":实际总件数,"quantityText":"截图数量原文","totalPrice":行金额,"totalPriceText":"截图总价原文","unitPrice":单件进货成本,"unitPriceText":"截图单价原文","category":"饮料/零食/日用品/烟酒/其他"}
  ]
}

不要用markdown包裹。`;
}

/**
 * 使用 AI 识别订单截图（纯 OCR，不传商品目录）
 * 商品绑定由调用方通过 prepareAIRecognizedPurchaseItems() 完成
 * @param {string} imageBase64
 * @param {string} mimeType
 */
async function recognizeOrderImage(imageBase64, mimeType, onProgress) {
  const model = await getSelectedAIModel();
  const prompt = buildVisionPrompt();

  try {
    const text = await callAIStream({
      modelId: model.id,
      userPrompt: prompt,
      imageBase64: imageBase64,
      mimeType: mimeType,
      maxTokens: 2048,
      jsonSchema: true,
      onProgress
    });

    console.log('AI Vision Response:', text);

    // 尝试直接解析
    let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    let parseError = null;
    
    try {
      const parsed = JSON.parse(cleanText);
      if (parsed.items) return parsed;
      if (Array.isArray(parsed)) return { orderDate: "", items: parsed };
    } catch (e) {
      parseError = e.message;
    }

    // 正则提取对象
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed.items) return parsed;
      } catch (e) {
        parseError = e.message;
      }
    }

    // 正则提取数组
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return { orderDate: "", items: JSON.parse(arrMatch[0]) };
      } catch (e) {
        parseError = e.message;
      }
    }

    let errMsg = 'AI返回格式无法解析';
    if (parseError) errMsg += ' (' + parseError + ')';
    throw new Error(errMsg + '\\n原始返回: ' + text);
  } catch (error) {
    console.error('AI Vision Error:', error);
    throw error;
  }
}

// ==================== 销售截图识别 ====================

function buildSalesVisionPrompt(existingProductNames) {
  const hasProducts = existingProductNames && existingProductNames.length > 0;
  const productList = hasProducts ? existingProductNames.map((name, index) => `${index + 1}. ${name}`).join('\n') : '无';
  const matchRule = hasProducts ? `

系统已有商品库：
${productList}

商品匹配规则：
- 如果截图商品能确定对应商品库中的同一商品，必须返回 matchedName，值必须完整复制商品库里的名称。
- 只有品牌、口味、规格都一致时才匹配；口味不确定时不要强行匹配。
- 如果无法确定对应关系，保留截图中的 name，不要返回 matchedName。` : '';

  return `你是售货机后台销售截图识别助手。只识别截图里“商品销售明细/商品列表”中的商品销量。

识别目标：提取每个商品的名称和销量，不提取销售额、库存、价格、条码、设备编号、订单号。

关键规则：
1. quantity 只能取“销量 / 销售数量 / 售出数量 / 出货数 / 件数”对应的整数。
2. 不要把金额、价格、库存、规格数字当销量，例如 500ml、330ml、1.25L、¥3.50、库存12、条码数字都不是销量。
3. 如果同一商品在截图里出现多行，合并为一条并累加 quantity。
4. name 保留可区分商品的品牌、口味、规格，去掉条码、设备名称、货道号等无关文字。
5. 看不清商品名或销量时不要猜，直接忽略该行。
6. quantity 必须是正整数。${matchRule}

返回严格 JSON 对象，不要 markdown：
{
  "items": [
    {"name":"截图商品名","quantity":销量,"matchedName":"系统商品名，可选"}
  ]
}`;
}

const AI_SALES_RECOGNITION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'integer' },
          matchedName: { type: 'string' }
        },
        required: ['name', 'quantity']
      }
    }
  },
  required: ['items']
};

function normalizeSalesRecognitionItems(items) {
  const merged = new Map();
  (items || []).forEach(item => {
    if (!item || typeof item !== 'object') return;
    const name = String(item.name || item.matchedName || '').trim();
    const matchedName = String(item.matchedName || '').trim();
    const quantity = Math.round(Number(item.quantity));
    if (!name || !Number.isFinite(quantity) || quantity <= 0) return;
    const key = matchedName || name;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (!existing.matchedName && matchedName) existing.matchedName = matchedName;
    } else {
      merged.set(key, { name, quantity, ...(matchedName ? { matchedName } : {}) });
    }
  });
  return Array.from(merged.values());
}

function parseSalesRecognitionResponse(text) {
  const cleanText = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const candidates = [cleanText];
  const objMatch = cleanText.match(/\{[\s\S]*\}/);
  if (objMatch && objMatch[0] !== cleanText) candidates.push(objMatch[0]);
  const arrMatch = cleanText.match(/\[[\s\S]*\]/);
  if (arrMatch) candidates.push(arrMatch[0]);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (Array.isArray(items)) return normalizeSalesRecognitionItems(items);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`AI返回格式无法解析${lastError ? `: ${lastError.message}` : ''}`);
}

/**
 * 识别销售截图
 */
async function recognizeSalesImage(imageBase64, mimeType, existingProductNames, onProgress) {
  const model = await getSelectedAIModel();
  const prompt = buildSalesVisionPrompt(existingProductNames);

  try {
    const text = await callAIStream({
      modelId: model.id,
      userPrompt: prompt,
      imageBase64: imageBase64,
      mimeType: mimeType,
      maxTokens: AI_IMAGE_MAX_TOKENS,
      jsonSchema: AI_SALES_RECOGNITION_SCHEMA,
      onProgress
    });

    console.log('AI Sales Vision Response:', text);
    const items = parseSalesRecognitionResponse(text);
    if (items.length === 0) throw new Error('未识别到有效销售商品');
    return items;
  } catch (error) {
    console.error('AI Sales Vision Error:', error);
    throw error;
  }
}

/**
 * 渲染AI补货建议页面
 */
async function renderAIPage() {
  const machines = await getMachines();
  const currentModel = await getSelectedAIModel();
  const aiStatus = await getAIConfigStatus(currentModel.id);

  // 加载缓存的建议结果
  const cached = await getSetting('lastAIAdvice');
  let cachedHtml = '';
  if (cached && cached.advice) {
    cachedHtml = buildAIResultHtml(cached.advice, cached.time, cached.machineId);
  }

  // 延迟恢复缓存的机器选择
  if (cached && cached.machineId) {
    setTimeout(() => {
      const sel = document.getElementById('aiMachineSelect');
      if (sel) sel.value = cached.machineId;
    }, 0);
  }

  return `
    <div class="ai-page page-stack container-xl">
    <div class="ai-action-card glass-card card">
      <div class="card-body">
      <div class="ai-action-row ai-control-grid">
        <div class="form-group ai-control-field">
          <label>选择售货机</label>
          <select id="aiMachineSelect" class="form-select">
            <option value="all">全部售货机</option>
            ${machines.map(m => optionHtml(m, m)).join('')}
          </select>
        </div>
        <div class="form-group ai-control-field ai-model-field">
          <label>AI 模型</label>
          <select id="aiModelSelect" class="form-select" onchange="saveAIPageModel()">
            ${AI_MODELS.map(m => optionHtml(m.id, m.name, m.id === currentModel.id)).join('')}
          </select>
        </div>
        <button class="btn btn-accent btn-lg ai-request-button" onclick="requestAIAdvice()" id="aiRequestBtn">
          ${tablerIcon('sparkles', 'btn-icon-left')} 获取补货建议
        </button>
      </div>
      <p class="config-hint">${tablerIcon('info-circle')} 模型和 API Key 可在 <a href="#" onclick="navigateTo('settings');return false" style="color:var(--accent-blue)">设置</a> 中管理</p>
      </div>
    </div>

    <div id="aiResultContainer" class="ai-result-container">
      ${cachedHtml || `
      <div class="ai-empty-state">
        <div class="empty-icon">${tablerIcon('brain')}</div>
        <p>点击上方按钮，AI将分析库存和销售趋势</p>
        <p class="empty-sub">每次请求约消耗 500 token，完全在免费额度内</p>
      </div>`}
    </div>
    </div>
  `;
}

// API Key 配置已移至设置页面 (app.js renderSettingsPage)

async function saveAIPageModel() {
  const select = document.getElementById('aiModelSelect');
  const modelId = select?.value || AI_DEFAULT_MODEL;
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) {
    showToast('请选择有效的 AI 模型', 'error');
    return;
  }

  await setSetting('aiModel', modelId);
  clearPageData('settings');
  showToast(`AI 模型已切换为 ${model.name}`);
}

/**
 * 请求AI补货建议
 */
async function requestAIAdvice() {
  const btn = document.getElementById('aiRequestBtn');
  const container = document.getElementById('aiResultContainer');
  const machineId = document.getElementById('aiMachineSelect').value;

  const currentModel = await getSelectedAIModel();

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> AI 分析中...';
  container.innerHTML = `
    <div class="ai-loading">
      <div class="pulse-dot"></div>
      <p id="aiAdviceProgress">正在使用 ${escapeHtml(currentModel.name)} 分析... 已等待 0.0s</p>
    </div>`;

  let advice = null;
  let lastError = null;
  const aiStart = Date.now();
  const progressEl = () => document.getElementById('aiAdviceProgress');
  const onProgress = (evt) => {
    const el = progressEl();
    if (!el) return;
    const secs = ((Date.now() - aiStart) / 1000).toFixed(1);
    if (evt.phase === 'connected') {
      el.textContent = `已连接 ${escapeHtml(currentModel.name)},等待首个 token... ${secs}s`;
    } else if (evt.phase === 'streaming') {
      const kb = (evt.bytes / 1024).toFixed(1);
      el.textContent = `${escapeHtml(currentModel.name)} 正在流式生成... ${secs}s · ${kb} KB`;
    } else if (evt.phase === 'done') {
      el.textContent = `AI 完成,正在解析 JSON... 用时 ${secs}s`;
    }
  };

  try {
    advice = await getRestockAdvice(machineId, onProgress);
  } catch (err) {
    lastError = err;
    console.error('AI advice failed:', err.message);
  }

  btn.disabled = false;
  btn.innerHTML = `${tablerIcon('sparkles', 'btn-icon-left')} 获取补货建议`;

  if (advice === null || (!advice.restock_list && !advice.unsalable_items && !advice.new_products)) {
    const errMsg = lastError ? lastError.message : '未知错误或返回格式异常';
    container.innerHTML = `
      <div class="ai-empty-state">
        <div class="empty-icon">${tablerIcon('circle-x')}</div>
        <p>获取建议失败</p>
        <p class="empty-sub" style="color:var(--accent-red);word-break:break-all;max-width:500px;margin:8px auto">${escapeHtml(errMsg)}</p>
        <p class="empty-sub">请检查: 1) <a href="#" onclick="navigateTo('settings');return false">设置</a>中当前模型的 API Key 是否正确 2) 网络是否能访问对应平台</p>
      </div>`;
    return;
  }

  // 保存到云端设置，供下次打开页面恢复
  const timeStr = new Date().toLocaleString();
  await setSetting('lastAIAdvice', { advice, time: timeStr, machineId });

  container.innerHTML = buildAIResultHtml(advice, timeStr, machineId);
}

/**
 * 构建AI建议结果HTML（供首次渲染和缓存恢复共用）
 */
function buildAIResultHtml(advice, timeStr, machineId) {
  const restockList = advice.restock_list || [];
  const unsalable = advice.unsalable_items || [];
  const newProducts = advice.new_products || [];

  if (restockList.length === 0 && unsalable.length === 0 && newProducts.length === 0) {
    return `
      <div class="ai-result-card glass-card card success">
        <div class="card-body">
        <div class="result-icon">${tablerIcon('circle-check')}</div>
        <h3 class="card-title">状态良好</h3>
        <p>当前所有商品库存充足，暂不需要补货，也没有异常滞销或新品推荐。</p>
        <p class="result-time">分析时间: ${escapeHtml(timeStr)}</p>
        </div>
      </div>`;
  }

  const urgentCount = restockList.filter(a => a.urgency === '紧急').length;

  let html = `
    <div class="ai-result-header">
      <h3>${tablerIcon('report-analytics')} AI 智能分析报告</h3>
      <span class="result-time">分析时间: ${escapeHtml(timeStr)}${machineId && machineId !== 'all' ? ` · ${escapeHtml(machineId)}` : ''}</span>
    </div>
  `;

  html += `
    <div class="analysis-section glass-card card">
      <div class="card-header"><h4 class="section-title card-title"><span class="section-icon">${tablerIcon('shopping-cart-plus')}</span> 补货建议 ${urgentCount > 0 ? `<span class="badge badge-danger">${urgentCount}项紧急</span>` : ''}</h4></div>
      <div class="card-body">
      ${restockList.length > 0 ? `
      <div class="restock-list">
        ${restockList.map(item => `
          <div class="restock-item glass-card card ${item.urgency === '紧急' ? 'urgent' : item.urgency === '充足' ? 'sufficient' : ''}">
            <div class="restock-info">
              <div class="restock-name">${escapeHtml(item.name)}</div>
              <div class="restock-detail">当前库存: <strong>${item.current}</strong> 件</div>
              <div class="restock-reason">${escapeHtml(item.reason)}</div>
            </div>
            <div class="restock-action">
              <span class="urgency-badge urgency-${escapeAttr(item.urgency)}">${escapeHtml(item.urgency)}</span>
              <div class="restock-qty">+${item.restock}</div>
              <div class="restock-label">建议补货</div>
            </div>
          </div>
        `).join('')}
      </div>
      ` : '<p class="text-muted" style="padding:10px">目前商品库存充足，暂无需补货。</p>'}
      </div>
    </div>
  `;

  if (unsalable.length > 0) {
    html += `
      <div class="analysis-section glass-card card">
        <div class="card-header"><h4 class="section-title card-title"><span class="section-icon">${tablerIcon('trending-down')}</span> 滞销处理建议</h4></div>
        <div class="card-body">
        <div class="unsalable-list">
          ${unsalable.map(item => `
            <div class="advice-card warning-accent">
              <div class="advice-title">${escapeHtml(item.name)} <span class="badge badge-warning">当前库存: ${item.current}</span></div>
              <div class="advice-body">${tablerIcon('bulb')} 建议：${escapeHtml(item.advice)}</div>
            </div>
          `).join('')}
        </div>
        </div>
      </div>
    `;
  }

  if (newProducts.length > 0) {
    html += `
      <div class="analysis-section glass-card card">
        <div class="card-header"><h4 class="section-title card-title"><span class="section-icon">${tablerIcon('sparkles')}</span> 新品引入推荐</h4></div>
        <div class="card-body">
        <div class="new-products-list">
          ${newProducts.map(item => `
            <div class="advice-card success-accent">
              <div class="advice-title">推荐品类：${escapeHtml(item.category)}</div>
              <div class="advice-body">${tablerIcon('bulb')} 理由：${escapeHtml(item.reason)}</div>
            </div>
          `).join('')}
        </div>
        </div>
      </div>
    `;
  }

  return html;
}

// ==================== 退款截图识别 ====================

const AI_REFUND_PROMPT = `你是售货机退款数据识别助手。分析这张订单/退款详情截图。

核心规则：
1. 提取截图中的“订单时间”或“退款时间”，作为 orderDate 返回，格式为 YYYY-MM-DDTHH:mm（如 2026-03-15T16:13）。如果截图中没有时间，则留空。
2. 提取截图中的“已退款金额”或总退款金额，作为 totalRefundAmount 返回（纯数字）。
3. 仔细识别【退款商品】部分。提取每个退款商品的名称、退款数量和它对应的退款金额（如果没有单品退款金额，则留空）。
4. name：商品的简短名称（去掉非标品说明、设备名称等无关信息），如"乖媳妇香辣味烤脖42g"
5. quantity：退款数量
6. refundAmount：该单品的实际退款金额（纯数字）

返回JSON对象格式如下：
{
  "orderDate": "YYYY-MM-DDTHH:mm",
  "totalRefundAmount": 0.50,
  "items": [
    {"name":"商品简称","quantity":退款数量,"refundAmount":单品退款金额}
  ]
}

不要用markdown包裹。`;

/**
 * 识别退款截图
 */
async function recognizeRefundImage(imageBase64, mimeType, onProgress) {
  const model = await getSelectedAIModel();

  try {
    const text = await callAIStream({
      modelId: model.id,
      userPrompt: AI_REFUND_PROMPT,
      imageBase64: imageBase64,
      mimeType: mimeType,
      maxTokens: 2048,
      jsonSchema: true,
      onProgress
    });

    console.log('AI Refund Vision Response:', text);

    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return JSON.parse(objMatch[0]);
    }
    throw new Error('AI返回格式无法解析');
  } catch (error) {
    console.error('AI Refund Vision Error:', error);
    throw error;
  }
}
