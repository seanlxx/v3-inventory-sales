param(
  [string]$DatabaseName = "v3-vending-inventory-sales-db",
  [string]$ExportFile = "",
  [switch]$KeepExport
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

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

"Applying local migrations for $DatabaseName..."
& npx wrangler d1 migrations apply $DatabaseName --local

"Exporting remote D1 data from $DatabaseName..."
& npx wrangler d1 export $DatabaseName --remote --no-schema --output $ExportFile --skip-confirmation

"Clearing local D1 data..."
& npx wrangler d1 execute $DatabaseName --local --file $resetFile --yes

"Importing remote data into local D1..."
& npx wrangler d1 execute $DatabaseName --local --file $ExportFile --yes

if (-not $KeepExport) {
  Remove-Item -LiteralPath $ExportFile -Force -ErrorAction SilentlyContinue
}

"Local D1 is synced from remote $DatabaseName."
