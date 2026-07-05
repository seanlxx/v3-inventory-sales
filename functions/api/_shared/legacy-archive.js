import { json } from './http.js';

const ARCHIVED_EXACT_PATHS = new Set([
  '/api/images',
  '/api/products'
]);

const ARCHIVED_PATH_PREFIXES = [
  '/api/inventory/',
  '/api/reports/',
  '/api/integrations/zn/',
  '/api/integrations/shengma/'
];

export function isArchivedLegacyApiRequest(request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (ARCHIVED_EXACT_PATHS.has(pathname)) return true;

  const pathWithSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return ARCHIVED_PATH_PREFIXES.some(prefix => pathWithSlash.startsWith(prefix));
}

export function legacyApiArchived() {
  return json(410, {
    code: 'LEGACY_SYSTEM_ARCHIVED',
    message: '旧库存系统接口已归档，请使用利润系统接口。'
  });
}
