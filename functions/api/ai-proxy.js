const AI_TEXT_TIMEOUT_MS = 60000;
const AI_IMAGE_TIMEOUT_MS = 90000;
const AI_BASE_URL = 'https://api.243706.xyz/v1';
const AI_MODEL_ID = 'gpt5.5';
const AI_PLATFORM = 'opencode';

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

function normalizeManualApiKey(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  if (body.systemPrompt) {
    messages.push({ role: 'system', content: body.systemPrompt });
  }

  const userContent = [];
  const userPrompt = body.userPrompt || '';
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

  return json(200, {
    baseUrl: AI_BASE_URL,
    modelId: AI_MODEL_ID,
    requiresApiKey: true
  });
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

  if (body.action === 'models') {
    return json(200, { models: [AI_MODEL_ID] });
  }

  const apiKey = normalizeManualApiKey(body.apiKey);
  if (!apiKey) {
    return json(400, { error: '请填写本次 AI 识别使用的 API Key' });
  }

  const config = { apiKey, baseUrl: AI_BASE_URL };
  const requestBody = { ...body, apiKey: undefined, modelId: AI_MODEL_ID };
  const hasImages = requestBody.imageBase64 || (Array.isArray(requestBody.images) && requestBody.images.length > 0);
  const timeoutMs = hasImages ? AI_IMAGE_TIMEOUT_MS : AI_TEXT_TIMEOUT_MS;

  // 流式模式: 前端通过 ?stream=1 或 body.stream=true 主动启用
  const url = new URL(context.request.url);
  const wantStream = url.searchParams.get('stream') === '1' || requestBody.stream === true;
  if (wantStream) {
    // 流式路径不抛异常, 错误经 SSE event:error 下发
    return streamOpenAICompatible({ platform: AI_PLATFORM, config, body: requestBody, timeoutMs });
  }

  try {
    const text = await callOpenAICompatible({ platform: AI_PLATFORM, config, body: requestBody, timeoutMs });
    return json(200, { text });
  } catch (err) {
    return json(502, { error: err.message || 'AI request failed' });
  }
}

export function onRequest() {
  return json(405, { error: 'Method not allowed' });
}
