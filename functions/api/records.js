const ALLOWED_STORES = new Set(['products', 'purchases', 'sales', 'settings']);
const IMAGE_STORES = new Set(['purchases', 'sales']);
const PAGE_SIZE_MAX = 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_CLEANUP_MS = 30 * 60 * 1000;
const LOGIN_LIMIT = 8;
const IMAGE_CHUNK_SIZE = 50000;
const PASSWORD_HASH_ITERATIONS = 100000;
const DEFAULT_AUTH_HASH = 'pbkdf2-sha256$100000$dmVuZGluZy1kMS1kZWZhdWx0LXNhbHQtMjAyNjA1MDU$kyDuylUYrOAl8qCMwVTvUqV46ta9cyUMcVRS5hDWMwo';

function json(status, payload) {
  if (status === 204) {
    return new Response(null, {
      status,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
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

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

function getSessionToken(request) {
  return request.headers.get('X-VM-Session') || '';
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageR2Key(storeName, recordId) {
  return `${storeName}/${encodeURIComponent(recordId)}`;
}

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToBase64Url(buffer);
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value));
}

function base64UrlToBytes(value) {
  const base64 = String(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', utf8Bytes(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8Bytes(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
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
  for (let i = 0; i < maxLength; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
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

async function ensureAuthRow(db) {
  const account = await db.prepare('SELECT * FROM app_auth WHERE singleton = 1').first();
  if (account) return account;
  await db.prepare(`
    INSERT INTO app_auth (singleton, username, password_hash, uses_default_password)
    VALUES (1, 'admin', ?, 1)
  `).bind(DEFAULT_AUTH_HASH).run();
  return await db.prepare('SELECT * FROM app_auth WHERE singleton = 1').first();
}

async function validateSession(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const session = await env.DB.prepare(`
    SELECT username, expires_at
    FROM app_sessions
    WHERE token_hash = ? AND expires_at > ?
    LIMIT 1
  `).bind(tokenHash, nowIso()).first();
  return session || null;
}

async function requireSession(context) {
  const session = await validateSession(context.request, context.env);
  if (!session) return { error: json(401, { message: 'Unauthorized' }) };
  return { session };
}

function parseJsonBody(request) {
  return request.json().catch(() => null);
}

function getRecordId(storeName, record) {
  if (!record || typeof record !== 'object') return '';
  return String(storeName === 'settings' ? record.key || '' : record.id || '');
}

function normalizeRecord(storeName, record, hasImage = false) {
  const data = record && typeof record === 'object' ? { ...record } : {};
  delete data.imageBase64;
  if (IMAGE_STORES.has(storeName) && hasImage) data.hasImage = true;
  return data;
}

function toStoredRow(storeName, record, hasImage = false) {
  const normalized = normalizeRecord(storeName, record, hasImage);
  return {
    data: JSON.stringify(normalized),
    machineId: typeof normalized.machineId === 'string' ? normalized.machineId : null,
    productId: typeof normalized.productId === 'string' ? normalized.productId : null,
    recordDate: typeof normalized.date === 'string' ? normalized.date : null,
    yearMonth: typeof normalized.yearMonth === 'string' ? normalized.yearMonth : null,
    name: typeof normalized.name === 'string' ? normalized.name : null,
    category: typeof normalized.category === 'string' ? normalized.category : null,
    hasImage: IMAGE_STORES.has(storeName) && hasImage ? 1 : 0
  };
}

function imageChunks(imageBase64) {
  const value = String(imageBase64 || '');
  const chunks = [];
  for (let index = 0; index < value.length; index += IMAGE_CHUNK_SIZE) {
    chunks.push(value.slice(index, index + IMAGE_CHUNK_SIZE));
  }
  return chunks;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function newRecordId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${randomToken(6)}`;
}

function parseRecord(row) {
  if (!row) return null;
  const record = JSON.parse(row.data);
  if (row.has_image && IMAGE_STORES.has(row.store)) record.hasImage = true;
  return record;
}

async function putR2Image(env, storeName, recordId, imageBase64, mimeType) {
  if (!env.IMAGES || !imageBase64) return null;
  const key = imageR2Key(storeName, recordId);
  await env.IMAGES.put(key, base64ToBytes(imageBase64), {
    httpMetadata: { contentType: mimeType || 'image/jpeg' },
    customMetadata: { store: storeName, record_id: recordId }
  });
  return key;
}

async function deleteR2Image(env, key) {
  if (!env.IMAGES || !key) return;
  await env.IMAGES.delete(key);
}

async function getR2ImageBase64(env, key) {
  if (!env.IMAGES || !key) return null;
  const object = await env.IMAGES.get(key);
  if (!object) return null;
  return bytesToBase64(new Uint8Array(await object.arrayBuffer()));
}

function safeStore(storeName) {
  return ALLOWED_STORES.has(storeName) ? storeName : '';
}

async function listRecords(context, url) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  const storeName = safeStore(url.searchParams.get('store'));
  if (!storeName) return json(400, { message: 'Invalid store' });

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || PAGE_SIZE_MAX, 1), PAGE_SIZE_MAX);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const conditions = ['store = ?'];
  const params = [storeName];

  const indexName = url.searchParams.get('index');
  const indexValue = url.searchParams.get('value');
  if (indexName && indexValue !== null) {
    const columnByIndex = {
      machineId: 'machine_id',
      productId: 'product_id',
      yearMonth: 'year_month'
    };
    const column = columnByIndex[indexName];
    if (!column) return json(400, { message: 'Unsupported index' });
    conditions.push(`${column} = ?`);
    params.push(indexValue);
  }

  const datePrefix = url.searchParams.get('datePrefix');
  if (datePrefix) {
    conditions.push('record_date >= ? AND record_date < ?');
    params.push(datePrefix, `${datePrefix}\uffff`);
  }

  const sinceDate = url.searchParams.get('sinceDate');
  if (sinceDate) {
    conditions.push('record_date >= ?');
    params.push(sinceDate);
  }

  const order = url.searchParams.get('order') === 'updated_at.desc' ? 'DESC' : 'ASC';
  const { results } = await context.env.DB.prepare(`
    SELECT store, record_id, data, has_image
    FROM vending_records
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at ${order}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return json(200, (results || []).map(parseRecord));
}

async function getRecord(context, storeName, recordId) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  const row = await context.env.DB.prepare(`
    SELECT store, record_id, data, has_image
    FROM vending_records
    WHERE store = ? AND record_id = ?
    LIMIT 1
  `).bind(storeName, recordId).first();

  return json(200, row ? parseRecord(row) : null);
}

async function upsertRecord(context, storeName, body) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;
  if (!body || typeof body !== 'object') return json(400, { message: 'Invalid record' });

  const recordId = getRecordId(storeName, body);
  if (!recordId) return json(400, { message: 'Missing record id' });

  const hadImagePayload = Object.prototype.hasOwnProperty.call(body, 'imageBase64');
  const imageBase64 = body.imageBase64 || '';
  const existing = await context.env.DB.prepare(`
    SELECT r.has_image, i.r2_key
    FROM vending_records r
    LEFT JOIN vending_record_images i
      ON i.store = r.store AND i.record_id = r.record_id
    WHERE r.store = ? AND r.record_id = ?
    LIMIT 1
  `).bind(storeName, recordId).first();
  const nextHasImage = IMAGE_STORES.has(storeName)
    ? (hadImagePayload ? !!imageBase64 : !!existing?.has_image || !!body.hasImage)
    : false;
  const row = toStoredRow(storeName, body, nextHasImage);
  const timestamp = nowIso();
  const mimeType = body.mimeType || 'image/jpeg';
  const r2Key = IMAGE_STORES.has(storeName) && hadImagePayload && imageBase64
    ? await putR2Image(context.env, storeName, recordId, imageBase64, mimeType)
    : null;
  if (IMAGE_STORES.has(storeName) && hadImagePayload && !imageBase64) {
    await deleteR2Image(context.env, existing?.r2_key || imageR2Key(storeName, recordId));
  }

  await context.env.DB.batch([
    context.env.DB.prepare(`
      INSERT INTO vending_records (
        store, record_id, data, machine_id, product_id, record_date, year_month,
        name, category, has_image, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store, record_id) DO UPDATE SET
        data = excluded.data,
        machine_id = excluded.machine_id,
        product_id = excluded.product_id,
        record_date = excluded.record_date,
        year_month = excluded.year_month,
        name = excluded.name,
        category = excluded.category,
        has_image = excluded.has_image,
        updated_at = excluded.updated_at
    `).bind(
      storeName,
      recordId,
      row.data,
      row.machineId,
      row.productId,
      row.recordDate,
      row.yearMonth,
      row.name,
      row.category,
      row.hasImage,
      timestamp,
      timestamp
    ),
    ...(IMAGE_STORES.has(storeName) && hadImagePayload
      ? [
          imageBase64
            ? context.env.DB.prepare(`
                INSERT INTO vending_record_images (
                  store, record_id, image_base64, mime_type, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(store, record_id) DO UPDATE SET
                  image_base64 = excluded.image_base64,
                  mime_type = excluded.mime_type,
                  updated_at = excluded.updated_at
              `).bind(storeName, recordId, '', mimeType, timestamp, timestamp)
            : context.env.DB.prepare(`
                DELETE FROM vending_record_images
                WHERE store = ? AND record_id = ?
              `).bind(storeName, recordId),
          context.env.DB.prepare(`
            DELETE FROM vending_record_image_chunks
            WHERE store = ? AND record_id = ?
          `).bind(storeName, recordId),
          ...(r2Key ? [] : imageChunks(imageBase64).map((chunk, index) => context.env.DB.prepare(`
            INSERT INTO vending_record_image_chunks (
              store, record_id, chunk_index, chunk_base64
            ) VALUES (?, ?, ?, ?)
          `).bind(storeName, recordId, index, chunk))),
          ...(r2Key ? [context.env.DB.prepare(`
            UPDATE vending_record_images
            SET r2_key = ?
            WHERE store = ? AND record_id = ?
          `).bind(r2Key, storeName, recordId)] : [])
        ]
      : [])
  ]);

  return json(200, JSON.parse(row.data));
}

async function batchAddPurchases(context, body) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  const items = Array.isArray(body?.purchases) ? body.purchases : [];
  if (items.length === 0) return json(400, { message: 'Missing purchases' });

  const timestamp = nowIso();
  const imageBase64 = body.imageBase64 || '';
  const mimeType = body.mimeType || 'image/jpeg';
  const { results } = await context.env.DB.prepare(`
    SELECT data
    FROM vending_records
    WHERE store = 'products'
  `).all();
  const products = (results || []).map(row => JSON.parse(row.data));
  const productById = new Map(products.map(product => [product.id, product]));
  const productByNameMachine = new Map(products.map(product => [`${product.machineId || '1号机'}\u0000${product.name || ''}`, product]));
  const changedProducts = new Set();
  const statements = [];
  const savedPurchases = [];

  for (const purchase of items) {
    const quantity = parseInt(purchase.quantity, 10);
    const totalPrice = Number(purchase.totalPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) return json(400, { message: 'Invalid purchase quantity' });
    if (!Number.isFinite(totalPrice) || totalPrice <= 0) return json(400, { message: 'Invalid purchase total price' });

    let product = purchase.productId ? productById.get(purchase.productId) : null;
    if (!product && purchase.productName) {
      product = productByNameMachine.get(`${purchase.machineId || '1号机'}\u0000${purchase.productName}`) || null;
    }
    if (!product && purchase.productName) {
      product = {
        id: newRecordId(),
        name: purchase.productName,
        category: purchase.category || '其他',
        sellPrice: Number(purchase.sellPrice) || 0,
        currentStock: 0,
        machineId: purchase.machineId || '1号机',
        avgCost: 0,
        totalPurchaseQty: 0,
        totalPurchaseCost: 0,
        createdAt: timestamp
      };
      productById.set(product.id, product);
      productByNameMachine.set(`${product.machineId}\u0000${product.name}`, product);
    }
    if (!product) return json(400, { message: 'Product not found' });

    const newTotalCost = (product.totalPurchaseCost || 0) + totalPrice;
    const newTotalQty = (product.totalPurchaseQty || 0) + quantity;
    product.avgCost = newTotalQty > 0 ? roundMoney(newTotalCost / newTotalQty) : 0;
    product.totalPurchaseCost = roundMoney(newTotalCost);
    product.totalPurchaseQty = newTotalQty;
    product.currentStock = (product.currentStock || 0) + quantity;
    changedProducts.add(product.id);

    const purchaseRecord = {
      id: newRecordId(),
      productId: product.id,
      productName: product.name,
      machineId: product.machineId,
      quantity,
      unitPrice: quantity > 0 ? roundMoney(totalPrice / quantity) : 0,
      totalPrice: roundMoney(totalPrice),
      source: purchase.source || '拼多多',
      date: purchase.date || new Date().toISOString().split('T')[0],
      note: purchase.note || '',
      createdAt: timestamp
    };
    savedPurchases.push(purchaseRecord);
  }

  for (const productId of changedProducts) {
    const product = productById.get(productId);
    const row = toStoredRow('products', product, false);
    statements.push(context.env.DB.prepare(`
      INSERT INTO vending_records (
        store, record_id, data, machine_id, product_id, record_date, year_month,
        name, category, has_image, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store, record_id) DO UPDATE SET
        data = excluded.data,
        machine_id = excluded.machine_id,
        product_id = excluded.product_id,
        record_date = excluded.record_date,
        year_month = excluded.year_month,
        name = excluded.name,
        category = excluded.category,
        has_image = excluded.has_image,
        updated_at = excluded.updated_at
    `).bind('products', product.id, row.data, row.machineId, row.productId, row.recordDate, row.yearMonth, row.name, row.category, row.hasImage, timestamp, timestamp));
  }

  const hasSharedImage = !!imageBase64;
  const sharedImageOwnerId = hasSharedImage ? savedPurchases[0]?.id : '';
  const sharedR2Key = hasSharedImage && sharedImageOwnerId
    ? await putR2Image(context.env, 'purchases', sharedImageOwnerId, imageBase64, mimeType)
    : null;

  for (const purchase of savedPurchases) {
    const hasImage = !!imageBase64;
    const row = toStoredRow('purchases', purchase, hasImage);
    statements.push(context.env.DB.prepare(`
      INSERT INTO vending_records (
        store, record_id, data, machine_id, product_id, record_date, year_month,
        name, category, has_image, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store, record_id) DO UPDATE SET
        data = excluded.data,
        machine_id = excluded.machine_id,
        product_id = excluded.product_id,
        record_date = excluded.record_date,
        year_month = excluded.year_month,
        name = excluded.name,
        category = excluded.category,
        has_image = excluded.has_image,
        updated_at = excluded.updated_at
    `).bind('purchases', purchase.id, row.data, row.machineId, row.productId, row.recordDate, row.yearMonth, row.name, row.category, row.hasImage, timestamp, timestamp));

    if (hasImage) {
      statements.push(context.env.DB.prepare(`
        INSERT INTO vending_record_images (
          store, record_id, image_base64, mime_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(store, record_id) DO UPDATE SET
          image_base64 = excluded.image_base64,
          mime_type = excluded.mime_type,
          updated_at = excluded.updated_at
      `).bind('purchases', purchase.id, '', mimeType, timestamp, timestamp));
      statements.push(context.env.DB.prepare(`
        DELETE FROM vending_record_image_chunks
        WHERE store = ? AND record_id = ?
      `).bind('purchases', purchase.id));
      if (sharedR2Key) {
        statements.push(context.env.DB.prepare(`
          UPDATE vending_record_images
          SET r2_key = ?
          WHERE store = ? AND record_id = ?
        `).bind(sharedR2Key, 'purchases', purchase.id));
      } else {
        statements.push(...imageChunks(imageBase64).map((chunk, index) => context.env.DB.prepare(`
          INSERT INTO vending_record_image_chunks (
            store, record_id, chunk_index, chunk_base64
          ) VALUES (?, ?, ?, ?)
        `).bind('purchases', purchase.id, index, chunk)));
      }
    }
  }

  await context.env.DB.batch(statements);
  return json(200, { purchases: savedPurchases });
}

async function deleteRecord(context, storeName, recordId) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;
  const image = await context.env.DB.prepare(`
    SELECT r2_key
    FROM vending_record_images
    WHERE store = ? AND record_id = ?
    LIMIT 1
  `).bind(storeName, recordId).first();
  await deleteR2Image(context.env, image?.r2_key || imageR2Key(storeName, recordId));

  await context.env.DB.batch([
    context.env.DB.prepare(`
      DELETE FROM vending_record_image_chunks
      WHERE store = ? AND record_id = ?
    `).bind(storeName, recordId),
    context.env.DB.prepare(`
      DELETE FROM vending_record_images
      WHERE store = ? AND record_id = ?
    `).bind(storeName, recordId),
    context.env.DB.prepare(`
      DELETE FROM vending_records
      WHERE store = ? AND record_id = ?
    `).bind(storeName, recordId)
  ]);

  return json(204, null);
}

async function clearStore(context, storeName) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;
  if (IMAGE_STORES.has(storeName)) {
    const images = await context.env.DB.prepare(`
      SELECT record_id, r2_key
      FROM vending_record_images
      WHERE store = ?
    `).bind(storeName).all();
    await Promise.all((images.results || []).map(image => (
      deleteR2Image(context.env, image.r2_key || imageR2Key(storeName, image.record_id))
    )));
  }

  await context.env.DB.batch([
    context.env.DB.prepare(`
      DELETE FROM vending_record_image_chunks
      WHERE store = ?
    `).bind(storeName),
    context.env.DB.prepare(`
      DELETE FROM vending_record_images
      WHERE store = ?
    `).bind(storeName),
    context.env.DB.prepare(`
      DELETE FROM vending_records
      WHERE store = ?
    `).bind(storeName)
  ]);

  return json(204, null);
}

async function readStoreRecords(context, storeName) {
  const { results } = await context.env.DB.prepare(`
    SELECT store, record_id, data, has_image
    FROM vending_records
    WHERE store = ?
  `).bind(storeName).all();
  return (results || []).map(parseRecord).filter(Boolean);
}

function monthFromRecord(record) {
  if (record.yearMonth) return record.yearMonth;
  return record.date ? String(record.date).substring(0, 7) : '';
}

function summarizeSalesByMonth(sales, purchases, feeRate) {
  const months = new Map();
  const ensureMonth = month => {
    if (!month) return null;
    if (!months.has(month)) {
      months.set(month, { month, revenue: 0, cogs: 0, refunds: 0, purchaseCost: 0, salesCount: 0 });
    }
    return months.get(month);
  };

  for (const sale of sales) {
    const item = ensureMonth(monthFromRecord(sale));
    if (!item) continue;
    const amount = Number(sale.totalAmount) || 0;
    item.revenue += amount;
    item.cogs += Number(sale.totalCogs) || 0;
    item.salesCount += 1;
    if (sale.type === 'refund') item.refunds += amount;
  }

  for (const purchase of purchases) {
    const item = ensureMonth(monthFromRecord(purchase));
    if (!item || purchase.isDeletedProduct) continue;
    item.purchaseCost += Number(purchase.totalPrice) || 0;
  }

  return Array.from(months.values()).sort((a, b) => b.month.localeCompare(a.month)).map(item => {
    const revenue = roundMoney(item.revenue);
    const cogs = roundMoney(item.cogs);
    const fee = roundMoney(revenue * feeRate);
    const profit = roundMoney(revenue - fee - cogs);
    return {
      month: item.month,
      revenue,
      cogs,
      fee,
      profit,
      profitRate: revenue > 0 ? (profit / revenue) * 100 : 0,
      purchaseCost: roundMoney(item.purchaseCost),
      refunds: roundMoney(item.refunds),
      salesCount: item.salesCount
    };
  });
}

async function queryAll(db, sql, params = []) {
  const statement = db.prepare(sql);
  const response = params.length > 0
    ? await statement.bind(...params).all()
    : await statement.all();
  return response.results || [];
}

function monthInClause(column, months) {
  if (!months.length) return { clause: '', params: [] };
  return {
    clause: ` AND ${column} IN (${months.map(() => '?').join(', ')})`,
    params: months
  };
}

function recordDateMonthClause(months) {
  if (!months.length) return { clause: '', params: [] };
  const parts = [];
  const params = [];
  for (const month of months) {
    parts.push('(record_date >= ? AND record_date < ?)');
    params.push(month, `${month}\uffff`);
  }
  return {
    clause: ` AND (${parts.join(' OR ')})`,
    params
  };
}

async function readSalesMonthlyAggregates(context, months = []) {
  const filter = monthInClause('year_month', months);
  const rows = await queryAll(context.env.DB, `
    SELECT
      year_month AS month,
      COALESCE(SUM(CAST(json_extract(data, '$.totalAmount') AS REAL)), 0) AS revenue,
      COALESCE(SUM(CAST(json_extract(data, '$.totalCogs') AS REAL)), 0) AS cogs,
      COALESCE(SUM(
        CASE
          WHEN json_extract(data, '$.type') = 'refund'
          THEN CAST(json_extract(data, '$.totalAmount') AS REAL)
          ELSE 0
        END
      ), 0) AS refunds,
      COUNT(*) AS salesCount
    FROM vending_records
    WHERE store = 'sales'
      AND year_month IS NOT NULL
      ${filter.clause}
    GROUP BY year_month
  `, filter.params);

  return rows.map(row => ({
    month: row.month,
    revenue: Number(row.revenue) || 0,
    cogs: Number(row.cogs) || 0,
    refunds: Number(row.refunds) || 0,
    salesCount: Number(row.salesCount) || 0
  }));
}

async function readPurchaseMonthlyAggregates(context, months = []) {
  const filter = recordDateMonthClause(months);
  const rows = await queryAll(context.env.DB, `
    SELECT
      substr(record_date, 1, 7) AS month,
      COALESCE(SUM(CAST(json_extract(data, '$.totalPrice') AS REAL)), 0) AS total,
      COALESCE(SUM(CAST(json_extract(data, '$.quantity') AS INTEGER)), 0) AS quantity,
      COUNT(*) AS count
    FROM vending_records
    WHERE store = 'purchases'
      AND record_date IS NOT NULL
      AND COALESCE(CAST(json_extract(data, '$.isDeletedProduct') AS INTEGER), 0) != 1
      ${filter.clause}
    GROUP BY substr(record_date, 1, 7)
    ORDER BY month DESC
  `, filter.params);

  return rows.map(row => ({
    month: row.month,
    total: roundMoney(row.total),
    quantity: Number(row.quantity) || 0,
    count: Number(row.count) || 0
  }));
}

function summarizeAggregatedSalesByMonth(salesRows, purchaseRows, feeRate) {
  const months = new Map();
  const ensureMonth = month => {
    if (!month) return null;
    if (!months.has(month)) {
      months.set(month, { month, revenue: 0, cogs: 0, refunds: 0, purchaseCost: 0, salesCount: 0 });
    }
    return months.get(month);
  };

  for (const sale of salesRows) {
    const item = ensureMonth(sale.month);
    if (!item) continue;
    item.revenue += Number(sale.revenue) || 0;
    item.cogs += Number(sale.cogs) || 0;
    item.refunds += Number(sale.refunds) || 0;
    item.salesCount += Number(sale.salesCount) || 0;
  }

  for (const purchase of purchaseRows) {
    const item = ensureMonth(purchase.month);
    if (!item) continue;
    item.purchaseCost += Number(purchase.total) || 0;
  }

  return Array.from(months.values()).sort((a, b) => b.month.localeCompare(a.month)).map(item => {
    const revenue = roundMoney(item.revenue);
    const cogs = roundMoney(item.cogs);
    const fee = roundMoney(revenue * feeRate);
    const profit = roundMoney(revenue - fee - cogs);
    return {
      month: item.month,
      revenue,
      cogs,
      fee,
      profit,
      profitRate: revenue > 0 ? (profit / revenue) * 100 : 0,
      purchaseCost: roundMoney(item.purchaseCost),
      refunds: roundMoney(item.refunds),
      salesCount: item.salesCount
    };
  });
}

async function salesSummary(context, body = {}) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  const feeRate = Math.max(0, Number(body.feeRate) || 0);
  const currentMonth = typeof body.currentMonth === 'string' ? body.currentMonth : '';
  const previousMonth = typeof body.previousMonth === 'string' ? body.previousMonth : '';
  const includeMonthly = body.includeMonthly !== false;
  const monthFilter = includeMonthly
    ? []
    : Array.from(new Set([currentMonth, previousMonth].filter(Boolean)));
  const [sales, purchases] = await Promise.all([
    readSalesMonthlyAggregates(context, monthFilter),
    readPurchaseMonthlyAggregates(context, monthFilter)
  ]);
  const monthly = summarizeAggregatedSalesByMonth(sales, purchases, feeRate);
  const byMonth = Object.fromEntries(monthly.map(item => [item.month, item]));

  return json(200, {
    monthly: includeMonthly ? monthly : [],
    current: byMonth[currentMonth] || null,
    previous: byMonth[previousMonth] || null
  });
}

async function purchaseSummary(context, body = {}) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  const currentMonth = typeof body.currentMonth === 'string' ? body.currentMonth : '';
  const includeMonthly = body.includeMonthly !== false;
  const months = await readPurchaseMonthlyAggregates(context, includeMonthly ? [] : [currentMonth].filter(Boolean));
  const byMonth = Object.fromEntries(months.map(item => [item.month, item]));

  return json(200, {
    monthly: includeMonthly ? months : [],
    current: byMonth[currentMonth] || null
  });
}
async function getImage(context, storeName, recordId) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;
  if (!IMAGE_STORES.has(storeName)) return json(400, { message: 'Unsupported image store' });

  const image = await context.env.DB.prepare(`
    SELECT image_base64, mime_type, r2_key
    FROM vending_record_images
    WHERE store = ? AND record_id = ?
    LIMIT 1
  `).bind(storeName, recordId).first();

  if (!image) return json(200, null);
  const r2ImageBase64 = await getR2ImageBase64(context.env, image.r2_key || imageR2Key(storeName, recordId));
  if (r2ImageBase64) {
    return json(200, {
      store: storeName,
      record_id: recordId,
      imageBase64: r2ImageBase64,
      mimeType: image.mime_type
    });
  }

  const chunks = await context.env.DB.prepare(`
    SELECT chunk_base64
    FROM vending_record_image_chunks
    WHERE store = ? AND record_id = ?
    ORDER BY chunk_index ASC
  `).bind(storeName, recordId).all();
  const chunkedImage = (chunks.results || []).map(row => row.chunk_base64).join('');

  return json(200, {
    store: storeName,
    record_id: recordId,
    imageBase64: chunkedImage || image.image_base64,
    mimeType: image.mime_type
  });
}

async function login(context, body) {
  if (!body || typeof body !== 'object') return json(400, { message: 'Invalid credentials' });

  const ip = clientIp(context.request);
  const now = Date.now();
  const cutoff = new Date(now - LOGIN_WINDOW_MS).toISOString();
  const cleanup = new Date(now - LOGIN_CLEANUP_MS).toISOString();

  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').bind(nowIso()),
    context.env.DB.prepare('DELETE FROM app_login_attempts WHERE attempted_at < ?').bind(cleanup)
  ]);

  const recent = await context.env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM app_login_attempts
    WHERE ip = ? AND attempted_at > ?
  `).bind(ip, cutoff).first();

  if ((recent?.count || 0) >= LOGIN_LIMIT) {
    return json(429, { message: '登录尝试过于频繁，请稍后再试' });
  }

  const account = await ensureAuthRow(context.env.DB);
  const username = String(body.p_username || body.username || '').trim();
  const password = String(body.p_password || body.password || '');
  const passwordOk = username === account.username && await verifyPassword(password, account.password_hash);

  if (!passwordOk) {
    await context.env.DB.prepare('INSERT INTO app_login_attempts (ip, attempted_at) VALUES (?, ?)')
      .bind(ip, nowIso())
      .run();
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

async function authProfile(context) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;

  const account = await ensureAuthRow(context.env.DB);
  return json(200, {
    username: account.username,
    uses_default_password: !!account.uses_default_password
  });
}

async function updateAuth(context, body) {
  const auth = await requireSession(context);
  if (auth.error) return auth.error;
  if (!body || typeof body !== 'object') return json(400, { message: 'Invalid auth payload' });

  const account = await ensureAuthRow(context.env.DB);
  const currentPassword = String(body.p_current_password || body.currentPassword || '');
  if (!await verifyPassword(currentPassword, account.password_hash)) {
    return json(400, { message: '当前密码不正确' });
  }

  const nextUsername = String(body.p_username || body.username || '').trim();
  const nextPassword = body.p_new_password || body.newPassword || '';
  if (nextUsername.length < 3 || nextUsername.length > 64) {
    return json(400, { message: '用户名长度需要在 3 到 64 位之间' });
  }
  if (nextPassword && String(nextPassword).length < 4) {
    return json(400, { message: '新密码至少需要 4 位' });
  }

  const passwordHash = nextPassword ? await hashPassword(String(nextPassword)) : account.password_hash;
  await context.env.DB.prepare(`
    UPDATE app_auth
    SET username = ?,
        password_hash = ?,
        uses_default_password = ?,
        updated_at = ?
    WHERE singleton = 1
  `).bind(nextUsername, passwordHash, nextPassword ? 0 : account.uses_default_password, nowIso()).run();

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

async function routeRpc(context, functionName, body) {
  switch (functionName) {
    case 'vm_login':
      return await login(context, body);
    case 'vm_get_auth_profile':
      return await authProfile(context);
    case 'vm_update_auth':
      return await updateAuth(context, body);
    case 'vm_batch_add_purchases':
      return await batchAddPurchases(context, body);
    case 'vm_sales_summary':
      return await salesSummary(context, body);
    case 'vm_purchase_summary':
      return await purchaseSummary(context, body);
    default:
      return json(404, { message: 'Unknown RPC' });
  }
}

async function handle(context) {
  if (!context.env.DB) return json(500, { message: 'D1 binding DB is not configured' });

  const url = new URL(context.request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const tail = segments.slice(1);
  const queryRpc = url.searchParams.get('rpc');

  if (queryRpc) {
    const body = context.request.method === 'POST' ? await parseJsonBody(context.request) : {};
    return await routeRpc(context, queryRpc, body || {});
  }

  if (tail[0] === 'records' && tail.length === 1) {
    const storeName = safeStore(url.searchParams.get('store'));
    const recordId = url.searchParams.get('recordId');
    const wantsImage = url.searchParams.get('image') === '1';

    if (context.request.method === 'GET') {
      if (recordId && wantsImage) {
        if (!storeName) return json(400, { message: 'Invalid store' });
        return await getImage(context, storeName, recordId);
      }
      if (recordId) {
        if (!storeName) return json(400, { message: 'Invalid store' });
        return await getRecord(context, storeName, recordId);
      }
      return await listRecords(context, url);
    }

    if (context.request.method === 'POST' || context.request.method === 'PUT') {
      const body = await parseJsonBody(context.request);
      const bodyStore = safeStore(body?.store || storeName);
      if (!bodyStore) return json(400, { message: 'Invalid store' });
      return await upsertRecord(context, bodyStore, body?.data || body);
    }

    if (context.request.method === 'DELETE') {
      if (!storeName) return json(400, { message: 'Invalid store' });
      return recordId
        ? await deleteRecord(context, storeName, recordId)
        : await clearStore(context, storeName);
    }
  }

  if (tail[0] === 'rpc' && tail[1]) {
    const body = context.request.method === 'POST' ? await parseJsonBody(context.request) : {};
    return await routeRpc(context, tail[1], body || {});
  }

  if (tail[0] === 'records') {
    if (context.request.method === 'GET') return await listRecords(context, url);
    const body = await parseJsonBody(context.request);
    const storeName = safeStore(body?.store);
    if (!storeName) return json(400, { message: 'Invalid store' });
    return await upsertRecord(context, storeName, body?.data);
  }

  if (tail[0] === 'record' && tail[1] && tail[2]) {
    const storeName = safeStore(tail[1]);
    const recordId = decodeURIComponent(tail.slice(2).join('/'));
    if (!storeName) return json(400, { message: 'Invalid store' });
    if (context.request.method === 'GET') return await getRecord(context, storeName, recordId);
    if (context.request.method === 'PUT') {
      const body = await parseJsonBody(context.request);
      return await upsertRecord(context, storeName, body);
    }
    if (context.request.method === 'DELETE') return await deleteRecord(context, storeName, recordId);
  }

  if (tail[0] === 'store' && tail[1] && context.request.method === 'DELETE') {
    const storeName = safeStore(tail[1]);
    if (!storeName) return json(400, { message: 'Invalid store' });
    return await clearStore(context, storeName);
  }

  if (tail[0] === 'image' && tail[1] && tail[2] && context.request.method === 'GET') {
    const storeName = safeStore(tail[1]);
    const recordId = decodeURIComponent(tail.slice(2).join('/'));
    if (!storeName) return json(400, { message: 'Invalid store' });
    return await getImage(context, storeName, recordId);
  }

  return json(404, { message: 'Not found' });
}

export async function onRequest(context) {
  try {
    return await handle(context);
  } catch (error) {
    console.error(error);
    return json(500, { message: error.message || 'Internal Server Error' });
  }
}


