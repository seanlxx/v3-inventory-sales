param(
  [string]$DatabaseName = "v3-vending-inventory-sales-db",
  [string]$ExportFile = "",
  [switch]$KeepExport
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-CheckedCommand {
  param(
    [string]$Label,
    [scriptblock]$Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

$syncDir = Join-Path $root ".wrangler\d1-sync"
if (-not (Test-Path -LiteralPath $syncDir)) {
  New-Item -ItemType Directory -Path $syncDir | Out-Null
}

if ([string]::IsNullOrWhiteSpace($ExportFile)) {
  $ExportFile = Join-Path $syncDir "$DatabaseName-remote-data.sql"
} elseif (-not [System.IO.Path]::IsPathRooted($ExportFile)) {
  $ExportFile = Join-Path $root $ExportFile
}

$resetFile = Join-Path $syncDir "reset-local-data.sql"
$repairFile = Join-Path $syncDir "repair-local-migrations.sql"

$repairSql = @(
  "CREATE TABLE IF NOT EXISTS d1_migrations (",
  "  id INTEGER PRIMARY KEY,",
  "  name TEXT,",
  "  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
  ");",
  "INSERT OR IGNORE INTO d1_migrations (id, name)",
  "SELECT 1, '0001_initial_d1_schema.sql'",
  "WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_auth')",
  "  AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vending_records')",
  "  AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vending_record_images');",
  "INSERT OR IGNORE INTO d1_migrations (id, name)",
  "SELECT 2, '0002_chunk_record_images.sql'",
  "WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vending_record_image_chunks');",
  "INSERT OR IGNORE INTO d1_migrations (id, name)",
  "SELECT 3, '0003_cap_password_pbkdf2_iterations.sql'",
  "WHERE EXISTS (SELECT 1 FROM d1_migrations WHERE id = 1);",
  "INSERT OR IGNORE INTO d1_migrations (id, name)",
  "SELECT 4, '0004_r2_image_keys.sql'",
  "WHERE EXISTS (SELECT 1 FROM pragma_table_info('vending_record_images') WHERE name = 'r2_key');",
  "INSERT OR IGNORE INTO d1_migrations (id, name)",
  "SELECT 5, '0005_query_path_indexes.sql'",
  "WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_vending_records_store_year_month_updated_at');",
  "INSERT OR IGNORE INTO d1_migrations (id, name)",
  "SELECT 6, '0006_v3_structured_inventory_schema.sql'",
  "WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'products')",
  "  AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stock_movements')",
  "  AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inventory_balances');"
) -join [Environment]::NewLine
Set-Content -LiteralPath $repairFile -Value $repairSql -Encoding UTF8

function Repair-LocalMigrationHistory {
  "Repairing local migration history for $DatabaseName..."
  Invoke-CheckedCommand "Repairing local migration history" {
    & npx wrangler d1 execute $DatabaseName --local --file $repairFile --yes
  }
}

$resetSql = @(
  "PRAGMA foreign_keys = OFF;",
  "DELETE FROM sales_items;",
  "DELETE FROM sales_orders;",
  "DELETE FROM purchase_items;",
  "DELETE FROM purchase_orders;",
  "DELETE FROM stock_movements;",
  "DELETE FROM inventory_balances;",
  "DELETE FROM image_assets;",
  "DELETE FROM products;",
  "DELETE FROM vending_record_image_chunks;",
  "DELETE FROM vending_record_images;",
  "DELETE FROM vending_records;",
  "DELETE FROM app_sessions;",
  "DELETE FROM app_login_attempts;",
  "DELETE FROM app_auth;",
  "DELETE FROM d1_migrations;",
  "PRAGMA foreign_keys = ON;"
) -join [Environment]::NewLine
Set-Content -LiteralPath $resetFile -Value $resetSql -Encoding UTF8

Repair-LocalMigrationHistory

"Applying local migrations for $DatabaseName..."
Invoke-CheckedCommand "Applying local migrations" {
  & npx wrangler d1 migrations apply $DatabaseName --local
}

"Exporting remote D1 data from $DatabaseName..."
Invoke-CheckedCommand "Exporting remote D1 data" {
  & npx wrangler d1 export $DatabaseName --remote --no-schema --output $ExportFile --skip-confirmation
}

"Clearing local D1 data..."
Invoke-CheckedCommand "Clearing local D1 data" {
  & npx wrangler d1 execute $DatabaseName --local --file $resetFile --yes
}

"Importing remote data into local D1..."
try {
  Invoke-CheckedCommand "Importing remote data into local D1" {
    & npx wrangler d1 execute $DatabaseName --local --file $ExportFile --yes
  }
} catch {
  Repair-LocalMigrationHistory
  throw
}

Repair-LocalMigrationHistory

if (-not $KeepExport) {
  Remove-Item -LiteralPath $ExportFile -Force -ErrorAction SilentlyContinue
}

"Local D1 is synced from remote $DatabaseName."
