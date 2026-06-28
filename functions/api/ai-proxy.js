const AI_TEXT_TIMEOUT_MS = 60000;
const AI_IMAGE_TIMEOUT_MS = 90000;
const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_CLAUDE_BASE_URL = 'https://xcode.best/v1';
const DEFAULT_OPENCODE_BASE_URL = 'https://api.243706.xyz/v1';
const DEFAULT_YUNWU_BASE_URL = 'https://yunwu.ai/v1';
const DEFAULT_QWEN_MODEL_ID = 'qwen3.5-omni-plus';
const AI_MODEL_LIST_TIMEOUT_MS = 30000;
const AI_PLATFORMS = new Set(['opencode', 'qwen', 'deepseek', 'claude', 'yunwu']);

function json(status, payload) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', utf8Bytes(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function requireSession(context) {
  if (!context.env.DB) return { error: json(500, { error: 'D1 binding DB is not configured' }) };
  if (context.data?.session) return { session: context.data.session };

  const token = context.request.headers.get('X-VM-Session') || '';
  if (!token) return { error: json(401, { error: 'Unauthorized' }) };

  const tokenHash = await sha256(token);
  const session = await context.env.DB.prepare(`
    SELECT username, expires_at
    FROM app_sessions
    WHERE token_hash = ? AND expires_at > ?
    LIMIT 1
  `).bind(tokenHash, nowIso()).first();

  return session ? { session } : { error: json(401, { error: 'Unauthorized' }) };
}

function getPlatform(modelId = '') {
  if (modelId === DEFAULT_QWEN_MODEL_ID || modelId.startsWith('qwen')) return 'qwen';
  if (modelId === 'gemini-3.1-flash-lite') return 'yunwu';
  if (modelId.startsWith('deepseek')) return 'deepseek';
  if (modelId.startsWith('claude')) return 'claude';
  return 'opencode';
}

function normalizePlatform(value, fallback = 'qwen') {
  return AI_PLATFORMS.has(value) ? value : fallback;
}

function getConfig(platform, env) {
  if (platform === 'opencode') {
    return {
      apiKey: env.OPENCODE_API_KEY,
      baseUrl: env.OPENCODE_BASE_URL || DEFAULT_OPENCODE_BASE_URL
    };
  }
  if (platform === 'qwen') {
    return {
      apiKey: env.QWEN_API_KEY,
      baseUrl: env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL
    };
  }
  if (platform === 'deepseek') {
    return {
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL
    };
  }
  if (platform === 'claude') {
    return {
      apiKey: env.CLAUDE_API_KEY,
      baseUrl: env.CLAUDE_BASE_URL || DEFAULT_CLAUDE_BASE_URL
    };
  }
  if (platform === 'yunwu') {
    return {
      apiKey: env.YUNWU_API_KEY,
      baseUrl: env.YUNWU_BASE_URL || DEFAULT_YUNWU_BASE_URL
    };
  }
  return getConfig('opencode', env);
}

function safeParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function getSettingValue(db, key) {
  if (!db) return null;
  const row = await db.prepare(`
    SELECT data
    FROM vending_records
    WHERE store = 'settings' AND record_id = ?
    LIMIT 1
  `).bind(key).first();
  const data = safeParse(row?.data || '{}', {});
  return data?.value ?? null;
}

async function getStoredAiSettings(db) {
  const [configs, activeProvider] = await Promise.all([
    getSettingValue(db, 'aiClientConfigs'),
    getSettingValue(db, 'aiActiveProvider')
  ]);
  return {
    configs: configs && typeof configs === 'object' && !Array.isArray(configs) ? configs : {},
    activeProvider: normalizePlatform(activeProvider, 'qwen')
  };
}

function storedModelId(storedConfig) {
  const stored = storedConfig && typeof storedConfig === 'object' ? storedConfig : {};
  return typeof stored.modelId === 'string' ? stored.modelId.trim() : '';
}

async function resolveAiRequest(context, body) {
  if (body.modelId) {
    const platform = normalizePlatform(body.platform, getPlatform(body.modelId));
    const config = getConfig(platform, context.env);
    return {
      platform,
      config: config?.apiKey ? config : null,
      modelId: String(body.modelId).trim()
    };
  }

  const storedSettings = await getStoredAiSettings(context.env.DB);
  const platform = normalizePlatform(body.platform, storedSettings.activeProvider);
  const storedConfig = storedSettings.configs[platform];
  const config = getConfig(platform, context.env);
  const modelId = storedModelId(storedConfig) || (platform === 'qwen' ? DEFAULT_QWEN_MODEL_ID : '');

  return { platform, config: config?.apiKey ? config : null, modelId };
}

function configuredModels(env) {
  return {
    opencode: !!env.OPENCODE_API_KEY,
    qwen: !!env.QWEN_API_KEY,
    deepseek: !!env.DEEPSEEK_API_KEY,
    claude: !!env.CLAUDE_API_KEY,
    yunwu: !!env.YUNWU_API_KEY
  };
}

function configuredModelSources(env) {
  return configuredModels(env);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function openAIBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return value;
  }
}

function buildOpenAIPayload({ platform, body, stream }) {
  const messages = [];
  if (body.systemPrompt && platform !== 'deepseek') {
    messages.push({ role: 'system', content: body.systemPrompt });
  }

  const userContent = [];
  const userPrompt = platform === 'deepseek' && body.systemPrompt
    ? `系统要求：\n${body.systemPrompt}\n\n用户请求：\n${body.userPrompt || ''}`
    : (body.userPrompt || '');
  if (userPrompt) userContent.push({ type: 'text', text: userPrompt });
  const images = Array.isArray(body.images) && body.images.length > 0
    ? body.images
    : body.imageBase64 && body.mimeType
      ? [{ imageBase64: body.imageBase64, mimeType: body.mimeType }]
      : [];
  for (const image of images) {
    if (!image?.imageBase64 || !image?.mimeType) continue;
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}` }
    });
  }
  messages.push({ role: 'user', content: userContent.length > 0 ? userContent : userPrompt });

  const payload = {
    model: body.modelId,
    messages,
    temperature: 0.1,
    max_tokens: body.maxTokens
  };

  if (body.jsonSchema && images.length === 0) {
    payload.response_format = { type: 'json_object' };
  }

  if (stream) payload.stream = true;
  return payload;
}

async function callOpenAICompatible({ platform, config, body, timeoutMs }) {
  const payload = buildOpenAIPayload({ platform, body, stream: false });
  const res = await fetchWithTimeout(`${openAIBaseUrl(config.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(payload)
  }, timeoutMs);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.error?.code || `${platform} HTTP ${res.status}`);
  }
  return data.choices?.[0]?.message?.content || '';
}

async function listOpenAICompatibleModels({ platform, config }) {
  const res = await fetchWithTimeout(`${openAIBaseUrl(config.baseUrl)}/models`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    }
  }, AI_MODEL_LIST_TIMEOUT_MS);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.error?.code || `${platform} HTTP ${res.status}`);
  }

  const rawModels = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
  const models = rawModels
    .map(model => typeof model === 'string' ? model : model?.id)
    .map(model => String(model || '').trim())
    .filter(Boolean);
  return Array.from(new Set(models));
}

/**
 * 以 SSE 将上游 OpenAI 兼容流式响应透传到客户端。
 * 事件协议:
 *   event: open            data: {"platform":...}       首字节握手, 用户前端立即收到,避免误判"卡住"
 *   event: delta           data: {"text":"...chunk"}    每个增量 token
 *   event: done            data: {"text":"...full"}     结束, text 为累计完整内容
 *   event: error           data: {"error":"..."}        错误, 随后关闭
 */
async function streamOpenAICompatible({ platform, config, body, timeoutMs }) {
  const payload = buildOpenAIPayload({ platform, body, stream: true });

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const sseWrite = (event, payloadObj) => writer.write(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payloadObj)}\n\n`)
  );

  // 心跳: Cloudflare 与前端都通过持续字节判断"连接仍在",每 10s 写一条 comment 行
  let heartbeatId = null;
  const startHeartbeat = () => {
    heartbeatId = setInterval(() => {
      writer.write(encoder.encode(`: keep-alive ${Date.now()}\n\n`)).catch(() => {});
    }, 10000);
  };
  const stopHeartbeat = () => { if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; } };

  // 后台执行:立刻返回可读流,让 Pages Function 不必等待 body 完成
  (async () => {
    // 立即握手, 让客户端在首字节到达后即可切换 UI 状态
    await sseWrite('open', { platform, ts: Date.now() });
    startHeartbeat();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let upstream;
    try {
      upstream = await fetch(`${openAIBaseUrl(config.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err) {
      stopHeartbeat();
      clearTimeout(timer);
      const msg = err?.name === 'AbortError'
        ? `AI request timed out after ${Math.round(timeoutMs / 1000)} seconds`
        : (err?.message || 'AI upstream fetch failed');
      await sseWrite('error', { error: msg }).catch(() => {});
      try { await writer.close(); } catch {}
      return;
    }

    if (!upstream.ok || !upstream.body) {
      stopHeartbeat();
      clearTimeout(timer);
      let detail = '';
      try { detail = await upstream.text(); } catch {}
      let parsed;
      try { parsed = detail ? JSON.parse(detail) : null; } catch {}
      const msg = parsed?.error?.message || parsed?.error?.code || detail || `${platform} HTTP ${upstream.status}`;
      await sseWrite('error', { error: msg }).catch(() => {});
      try { await writer.close(); } catch {}
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffered = '';
    let accumulated = '';

    let streamErrored = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        // OpenAI SSE 每条消息以空行分隔
        let idx;
        while ((idx = buffered.indexOf('\n\n')) !== -1) {
          const raw = buffered.slice(0, idx);
          buffered = buffered.slice(idx + 2);

          // 逐行解析, 取 data: 开头
          for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payloadStr = trimmed.slice(5).trim();
            if (!payloadStr) continue;
            if (payloadStr === '[DONE]') {
              // 忽略, 循环外统一 close
              continue;
            }
            try {
              const chunk = JSON.parse(payloadStr);
              const delta = chunk?.choices?.[0]?.delta?.content
                || chunk?.choices?.[0]?.message?.content
                || '';
              if (delta) {
                accumulated += delta;
                await sseWrite('delta', { text: delta });
              }
            } catch {
              // 某些中转可能发非 JSON 行, 忽略
            }
          }
        }
      }
    } catch (err) {
      streamErrored = true;
      await sseWrite('error', { error: err?.message || 'stream interrupted' }).catch(() => {});
    } finally {
      stopHeartbeat();
      clearTimeout(timer);
      if (!streamErrored) {
        await sseWrite('done', { text: accumulated }).catch(() => {});
      }
      try { await writer.close(); } catch {}
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

export async function onRequestGet(context) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  return json(200, { configured: await configuredModelSources(context.env) });
}

export async function onRequestPost(context) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const request = await resolveAiRequest(context, body);
  if (body.action === 'models') {
    if (!request.config) {
      return json(503, { error: `${request.platform} API key is not configured` });
    }

    try {
      const models = await listOpenAICompatibleModels({ platform: request.platform, config: request.config });
      return json(200, { models });
    } catch (err) {
      return json(502, { error: err.message || 'Failed to fetch AI models' });
    }
  }

  if (!request.modelId) {
    return json(400, { error: 'Missing modelId' });
  }

  if (!request.config) {
    return json(503, { error: `${request.platform} API key is not configured on the server` });
  }

  const requestBody = { ...body, modelId: request.modelId };
  const hasImages = requestBody.imageBase64 || (Array.isArray(requestBody.images) && requestBody.images.length > 0);
  const timeoutMs = hasImages ? AI_IMAGE_TIMEOUT_MS : AI_TEXT_TIMEOUT_MS;

  // 流式模式: 前端通过 ?stream=1 或 body.stream=true 主动启用
  const url = new URL(context.request.url);
  const wantStream = url.searchParams.get('stream') === '1' || requestBody.stream === true;
  if (wantStream) {
    // 流式路径不抛异常, 错误经 SSE event:error 下发
    return streamOpenAICompatible({ platform: request.platform, config: request.config, body: requestBody, timeoutMs });
  }

  try {
    const text = await callOpenAICompatible({ platform: request.platform, config: request.config, body: requestBody, timeoutMs });
    return json(200, { text });
  } catch (err) {
    return json(502, { error: err.message || 'AI request failed' });
  }
}

export function onRequest() {
  return json(405, { error: 'Method not allowed' });
}
