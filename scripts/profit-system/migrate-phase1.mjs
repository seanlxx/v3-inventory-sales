import { fileURLToPath } from 'node:url';

import { runD1File } from './_d1.mjs';

export function buildPhase1MigrationSql() {
  return `
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS __profit_product_map;

CREATE TABLE __profit_product_map AS
WITH normalized AS (
  SELECT
    id AS legacy_product_id,
    name,
    category,
    sell_price_cents,
    status,
    machine_id,
    external_id,
    normalized_name,
    manual_cost_cents,
    created_at,
    updated_at,
    CASE
      WHEN normalized_name LIKE 'merged:%' THEN lower(trim(substr(normalized_name, 8)))
      ELSE lower(trim(COALESCE(NULLIF(normalized_name, ''), name)))
    END AS global_key
  FROM products
),
mapped AS (
  SELECT
    *,
    'pg:' || MIN(legacy_product_id) OVER (PARTITION BY global_key) AS product_global_id
  FROM normalized
)
SELECT * FROM mapped;

INSERT INTO products_global (
  id, canonical_name, normalized_name, category, default_sell_price_cents, status,
  legacy_product_count, source_product_ids_json, created_at, updated_at
)
SELECT
  product_global_id,
  name,
  global_key,
  category,
  COALESCE(sell_price_cents, 0),
  CASE
    WHEN EXISTS (
      SELECT 1 FROM __profit_product_map active
      WHERE active.product_global_id = ranked.product_global_id
        AND active.status = 'active'
    ) THEN 'active'
    ELSE 'archived'
  END,
  (SELECT COUNT(*) FROM __profit_product_map count_rows WHERE count_rows.product_global_id = ranked.product_global_id),
  (SELECT json_group_array(legacy_product_id) FROM __profit_product_map ids WHERE ids.product_global_id = ranked.product_global_id),
  COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY product_global_id
      ORDER BY
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        CASE WHEN normalized_name LIKE 'merged:%' THEN 1 ELSE 0 END,
        updated_at DESC,
        legacy_product_id ASC
    ) AS rn
  FROM __profit_product_map
) ranked
WHERE rn = 1
ON CONFLICT(id) DO UPDATE SET
  canonical_name = excluded.canonical_name,
  normalized_name = excluded.normalized_name,
  category = excluded.category,
  default_sell_price_cents = excluded.default_sell_price_cents,
  status = excluded.status,
  legacy_product_count = excluded.legacy_product_count,
  source_product_ids_json = excluded.source_product_ids_json,
  updated_at = excluded.updated_at;

INSERT INTO product_aliases (
  id, product_global_id, alias_name, normalized_alias, source, source_product_id,
  source_external_id, source_machine_id, status, created_at, updated_at
)
SELECT
  'pa:' || legacy_product_id,
  product_global_id,
  name,
  lower(trim(name)),
  'legacy-products',
  legacy_product_id,
  external_id,
  machine_id,
  status,
  COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM __profit_product_map
WHERE 1 = 1
ON CONFLICT(id) DO UPDATE SET
  product_global_id = excluded.product_global_id,
  alias_name = excluded.alias_name,
  normalized_alias = excluded.normalized_alias,
  source_external_id = excluded.source_external_id,
  source_machine_id = excluded.source_machine_id,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO purchase_records (
  id, legacy_purchase_id, record_date, source, note, image_asset_id,
  status, voided_at, created_at, updated_at
)
SELECT
  'pr:' || id,
  id,
  record_date,
  COALESCE(NULLIF(source, ''), 'manual'),
  note,
  image_asset_id,
  CASE WHEN voided_at IS NULL THEN 'active' ELSE 'voided' END,
  voided_at,
  created_at,
  updated_at
FROM purchase_orders
WHERE 1 = 1
ON CONFLICT(id) DO UPDATE SET
  record_date = excluded.record_date,
  source = excluded.source,
  note = excluded.note,
  image_asset_id = excluded.image_asset_id,
  status = excluded.status,
  voided_at = excluded.voided_at,
  updated_at = excluded.updated_at;

INSERT INTO purchase_record_items (
  id, purchase_record_id, product_global_id, legacy_purchase_item_id,
  legacy_product_id, quantity, unit_cost_cents, total_cost_cents, created_at
)
SELECT
  'pri:' || pi.id,
  'pr:' || pi.purchase_id,
  map.product_global_id,
  pi.id,
  pi.product_id,
  pi.quantity,
  pi.unit_cost_cents,
  pi.total_cost_cents,
  pi.created_at
FROM purchase_items pi
JOIN __profit_product_map map ON map.legacy_product_id = pi.product_id
JOIN purchase_records pr ON pr.id = 'pr:' || pi.purchase_id
WHERE 1 = 1
ON CONFLICT(id) DO UPDATE SET
  purchase_record_id = excluded.purchase_record_id,
  product_global_id = excluded.product_global_id,
  legacy_product_id = excluded.legacy_product_id,
  quantity = excluded.quantity,
  unit_cost_cents = excluded.unit_cost_cents,
  total_cost_cents = excluded.total_cost_cents;

INSERT INTO sales_records (
  id, legacy_sales_id, type, machine_id, record_date, year_month, source, external_id,
  gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
  discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
  note, image_asset_id, status, voided_at, created_at, updated_at
)
SELECT
  'sr:' || id,
  id,
  type,
  machine_id,
  record_date,
  year_month,
  COALESCE(NULLIF(source, ''), 'manual'),
  external_id,
  CASE WHEN type = 'sale' THEN COALESCE(total_amount_cents, 0) ELSE 0 END AS gross_amount_cents,
  CASE
    WHEN type = 'refund' THEN COALESCE(NULLIF(refund_amount_cents, 0), total_amount_cents, 0)
    ELSE COALESCE(refund_amount_cents, 0)
  END AS refund_amount_cents,
  COALESCE(platform_fee_cents, 0),
  COALESCE(service_fee_cents, 0),
  COALESCE(discount_cents, 0),
  CASE
    WHEN type = 'sale' THEN
      COALESCE(total_amount_cents, 0)
      - COALESCE(refund_amount_cents, 0)
      - COALESCE(platform_fee_cents, 0)
      - COALESCE(service_fee_cents, 0)
      - COALESCE(discount_cents, 0)
    WHEN type = 'refund' THEN -COALESCE(NULLIF(refund_amount_cents, 0), total_amount_cents, 0)
    ELSE 0
  END AS net_revenue_cents,
  COALESCE(total_cogs_cents, 0),
  CASE
    WHEN type = 'sale' THEN
      COALESCE(total_amount_cents, 0)
      - COALESCE(refund_amount_cents, 0)
      - COALESCE(platform_fee_cents, 0)
      - COALESCE(service_fee_cents, 0)
      - COALESCE(discount_cents, 0)
      - COALESCE(total_cogs_cents, 0)
    WHEN type = 'refund' THEN
      -COALESCE(NULLIF(refund_amount_cents, 0), total_amount_cents, 0)
      + COALESCE(total_cogs_cents, 0)
    WHEN type = 'loss' THEN -COALESCE(total_cogs_cents, 0)
    ELSE 0
  END AS gross_profit_cents,
  note,
  image_asset_id,
  CASE WHEN voided_at IS NULL THEN 'active' ELSE 'voided' END,
  voided_at,
  created_at,
  updated_at
FROM sales_orders
WHERE 1 = 1
ON CONFLICT(id) DO UPDATE SET
  type = excluded.type,
  machine_id = excluded.machine_id,
  record_date = excluded.record_date,
  year_month = excluded.year_month,
  source = excluded.source,
  external_id = excluded.external_id,
  gross_amount_cents = excluded.gross_amount_cents,
  refund_amount_cents = excluded.refund_amount_cents,
  platform_fee_cents = excluded.platform_fee_cents,
  service_fee_cents = excluded.service_fee_cents,
  discount_cents = excluded.discount_cents,
  net_revenue_cents = excluded.net_revenue_cents,
  total_cogs_cents = excluded.total_cogs_cents,
  gross_profit_cents = excluded.gross_profit_cents,
  note = excluded.note,
  image_asset_id = excluded.image_asset_id,
  status = excluded.status,
  voided_at = excluded.voided_at,
  updated_at = excluded.updated_at;

INSERT INTO sales_record_items (
  id, sales_record_id, product_global_id, legacy_sales_item_id, legacy_product_id,
  quantity, unit_price_cents, line_amount_cents, unit_cost_cents, line_cogs_cents, created_at
)
SELECT
  'sri:' || si.id,
  'sr:' || si.sales_order_id,
  map.product_global_id,
  si.id,
  si.product_id,
  si.quantity,
  si.unit_price_cents,
  si.line_amount_cents,
  si.unit_cost_cents,
  si.line_cogs_cents,
  si.created_at
FROM sales_items si
JOIN __profit_product_map map ON map.legacy_product_id = si.product_id
JOIN sales_records sr ON sr.id = 'sr:' || si.sales_order_id
WHERE 1 = 1
ON CONFLICT(id) DO UPDATE SET
  sales_record_id = excluded.sales_record_id,
  product_global_id = excluded.product_global_id,
  legacy_product_id = excluded.legacy_product_id,
  quantity = excluded.quantity,
  unit_price_cents = excluded.unit_price_cents,
  line_amount_cents = excluded.line_amount_cents,
  unit_cost_cents = excluded.unit_cost_cents,
  line_cogs_cents = excluded.line_cogs_cents;

INSERT INTO cost_snapshots (
  id, product_global_id, source_type, source_record_id, source_item_id,
  legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
)
SELECT
  'cs:purchase:' || pri.legacy_purchase_item_id,
  pri.product_global_id,
  'purchase_item',
  pri.purchase_record_id,
  pri.id,
  pri.legacy_product_id,
  pri.unit_cost_cents,
  pri.quantity,
  pri.total_cost_cents,
  pr.record_date,
  pri.created_at
FROM purchase_record_items pri
JOIN purchase_records pr ON pr.id = pri.purchase_record_id
WHERE pr.status = 'active'
ON CONFLICT(id) DO UPDATE SET
  product_global_id = excluded.product_global_id,
  source_record_id = excluded.source_record_id,
  source_item_id = excluded.source_item_id,
  legacy_product_id = excluded.legacy_product_id,
  unit_cost_cents = excluded.unit_cost_cents,
  quantity_context = excluded.quantity_context,
  total_cost_cents = excluded.total_cost_cents,
  effective_at = excluded.effective_at;

INSERT INTO cost_snapshots (
  id, product_global_id, source_type, source_record_id, source_item_id,
  legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
)
SELECT
  'cs:sale:' || sri.legacy_sales_item_id,
  sri.product_global_id,
  'sale_item',
  sri.sales_record_id,
  sri.id,
  sri.legacy_product_id,
  sri.unit_cost_cents,
  sri.quantity,
  sri.line_cogs_cents,
  sr.record_date,
  sri.created_at
FROM sales_record_items sri
JOIN sales_records sr ON sr.id = sri.sales_record_id
WHERE sr.status = 'active'
ON CONFLICT(id) DO UPDATE SET
  product_global_id = excluded.product_global_id,
  source_record_id = excluded.source_record_id,
  source_item_id = excluded.source_item_id,
  legacy_product_id = excluded.legacy_product_id,
  unit_cost_cents = excluded.unit_cost_cents,
  quantity_context = excluded.quantity_context,
  total_cost_cents = excluded.total_cost_cents,
  effective_at = excluded.effective_at;

INSERT INTO cost_snapshots (
  id, product_global_id, source_type, source_record_id, source_item_id,
  legacy_product_id, unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
)
SELECT
  'cs:manual:' || legacy_product_id,
  product_global_id,
  'manual_cost',
  legacy_product_id,
  legacy_product_id,
  legacy_product_id,
  manual_cost_cents,
  NULL,
  manual_cost_cents,
  COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM __profit_product_map
WHERE COALESCE(manual_cost_cents, 0) > 0
ON CONFLICT(id) DO UPDATE SET
  product_global_id = excluded.product_global_id,
  unit_cost_cents = excluded.unit_cost_cents,
  total_cost_cents = excluded.total_cost_cents,
  effective_at = excluded.effective_at;

DROP TABLE IF EXISTS __profit_product_map;
`;
}

export function parseOptions(argv = process.argv.slice(2)) {
  return {
    local: argv.includes('--local')
  };
}

export function main() {
  const options = parseOptions();
  const output = runD1File(buildPhase1MigrationSql(), options);
  process.stdout.write(output);
  console.log(`profit system phase1 migration completed (${options.local ? 'local' : 'remote'})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
