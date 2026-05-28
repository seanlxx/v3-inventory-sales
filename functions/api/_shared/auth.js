import { first, run } from './d1.js';
import { json } from './http.js';
import { nowIso } from './validators.js';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_CLEANUP_MS = 30 * 60 * 1000;
const LOGIN_LIMIT = 8;
const PASSWORD_HASH_ITERATIONS = 100000;
const DEFAULT_AUTH_HASH = 'pbkdf2-sha256$100000$dmVuZGluZy1kMS1kZWZhdWx0LXNhbHQtMjAyNjA1MDU$kyDuylUYrOAl8qCMwVTvUqV46ta9cyUMcVRS5hDWMwo';

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value));
}

function base64UrlToBytes(value) {
  const base64 = String(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', utf8Bytes(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', utf8Bytes(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    key,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > PASSWORD_HASH_ITERATIONS) return false;
  const actual = await pbkdf2(password, base64UrlToBytes(parts[2]), iterations);
  return timingSafeEqual(actual, parts[3]);
}

async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iterations = PASSWORD_HASH_ITERATIONS;
  const digest = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${bytesToBase64Url(salt)}$${digest}`;
}

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToBase64Url(buffer);
}

export function isPublicApiRequest(request) {
  if (request.method === 'OPTIONS') return true;
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/login') return true;
  return false;
}

export async function ensureAuthRow(db) {
  const account = await first(db, 'SELECT * FROM app_auth WHERE singleton = 1');
  if (account) return account;
  await run(db, `
    INSERT INTO app_auth (singleton, username, password_hash, uses_default_password)
    VALUES (1, 'admin', ?, 1)
  `, [DEFAULT_AUTH_HASH]);
  return await first(db, 'SELECT * FROM app_auth WHERE singleton = 1');
}

export async function validateSession(request, env) {
  const token = request.headers.get('X-VM-Session') || '';
  if (!token) return null;
  const tokenHash = await sha256(token);
  return await first(env.DB, `
    SELECT username, expires_at
    FROM app_sessions
    WHERE token_hash = ? AND expires_at > ?
    LIMIT 1
  `, [tokenHash, nowIso()]);
}

export async function requireSession(context) {
  if (context.data?.session) return { session: context.data.session };
  const session = await validateSession(context.request, context.env);
  return session ? { session } : { error: json(401, { message: 'Unauthorized' }) };
}

export async function login(context, body) {
  if (!body || typeof body !== 'object') return json(400, { message: 'Invalid credentials' });

  const ip = clientIp(context.request);
  const now = Date.now();
  const cutoff = new Date(now - LOGIN_WINDOW_MS).toISOString();
  const cleanup = new Date(now - LOGIN_CLEANUP_MS).toISOString();

  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').bind(nowIso()),
    context.env.DB.prepare('DELETE FROM app_login_attempts WHERE attempted_at < ?').bind(cleanup)
  ]);

  const recent = await first(context.env.DB, `
    SELECT COUNT(*) AS count
    FROM app_login_attempts
    WHERE ip = ? AND attempted_at > ?
  `, [ip, cutoff]);

  if ((recent?.count || 0) >= LOGIN_LIMIT) {
    return json(429, { message: 'Too many login attempts. Try again later.' });
  }

  const account = await ensureAuthRow(context.env.DB);
  const username = String(body.p_username || body.username || '').trim();
  const password = String(body.p_password || body.password || '');
  const passwordOk = username === account.username && await verifyPassword(password, account.password_hash);

  if (!passwordOk) {
    await run(context.env.DB, 'INSERT INTO app_login_attempts (ip, attempted_at) VALUES (?, ?)', [ip, nowIso()]);
    return json(200, null);
  }

  const token = randomToken();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM app_login_attempts WHERE ip = ?').bind(ip),
    context.env.DB.prepare(`
      INSERT INTO app_sessions (token_hash, username, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(await sha256(token), account.username, expiresAt, nowIso())
  ]);

  return json(200, {
    token,
    username: account.username,
    expires_at: expiresAt,
    uses_default_password: !!account.uses_default_password
  });
}

export async function authProfile(context) {
  const account = await ensureAuthRow(context.env.DB);
  return json(200, {
    username: account.username,
    uses_default_password: !!account.uses_default_password
  });
}

export async function updateAuth(context, body) {
  if (!body || typeof body !== 'object') return json(400, { message: 'Invalid auth payload' });

  const account = await ensureAuthRow(context.env.DB);
  const currentPassword = String(body.p_current_password || body.currentPassword || '');
  if (!await verifyPassword(currentPassword, account.password_hash)) {
    return json(400, { message: 'Current password is incorrect' });
  }

  const nextUsername = String(body.p_username || body.username || '').trim();
  const nextPassword = body.p_new_password || body.newPassword || '';
  if (nextUsername.length < 3 || nextUsername.length > 64) {
    return json(400, { message: 'Username length must be 3 to 64 characters' });
  }
  if (nextPassword && String(nextPassword).length < 4) {
    return json(400, { message: 'New password must be at least 4 characters' });
  }

  const passwordHash = nextPassword ? await hashPassword(String(nextPassword)) : account.password_hash;
  await run(context.env.DB, `
    UPDATE app_auth
    SET username = ?,
        password_hash = ?,
        uses_default_password = ?,
        updated_at = ?
    WHERE singleton = 1
  `, [nextUsername, passwordHash, nextPassword ? 0 : account.uses_default_password, nowIso()]);

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM app_sessions'),
    context.env.DB.prepare(`
      INSERT INTO app_sessions (token_hash, username, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(await sha256(token), nextUsername, expiresAt, nowIso())
  ]);

  return json(200, {
    token,
    username: nextUsername,
    expires_at: expiresAt,
    uses_default_password: !nextPassword && !!account.uses_default_password
  });
}
