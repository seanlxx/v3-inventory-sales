param(
  [switch]$SyncRemote,
  [string]$DatabaseName = "v3-vending-inventory-sales-db"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$oldDevProcesses = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -in @('node.exe', 'cmd.exe')) -and
  ($_.CommandLine -match 'pages dev dist') -and
  ($_.CommandLine -match '--port 8788| 8788')
}
$oldDevProcesses | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\build.ps1")

if ($SyncRemote) {
  powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\sync-d1-remote-to-local.ps1") -DatabaseName $DatabaseName
} else {
  npx wrangler d1 migrations apply $DatabaseName --local
}

npx wrangler pages dev dist `
  --port 8788 `
  --compatibility-date 2026-05-05
