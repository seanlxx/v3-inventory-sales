param(
  [switch]$SyncRemote
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
  powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\sync-d1-remote-to-local.ps1")
} else {
  npx wrangler d1 migrations apply v3-vending-inventory-sales-db --local
}

$opencodeConfigPath = Join-Path $env:USERPROFILE ".config\opencode\opencode.json"
$opencodeBindings = @()
if (Test-Path -LiteralPath $opencodeConfigPath) {
  try {
    $opencodeConfig = Get-Content -Raw -LiteralPath $opencodeConfigPath | ConvertFrom-Json
    $openaiOptions = $opencodeConfig.provider.openai.options
    if ($openaiOptions.apiKey) {
      $opencodeBindings += @("--binding", "OPENCODE_API_KEY=$($openaiOptions.apiKey)")
    }
    if ($openaiOptions.baseURL) {
      $opencodeBindings += @("--binding", "OPENCODE_BASE_URL=$($openaiOptions.baseURL)")
    }
  } catch {
    Write-Warning "无法读取 OpenCode 中转配置: $($_.Exception.Message)"
  }
}

npx wrangler pages dev dist `
  --port 8788 `
  --compatibility-date 2026-05-05 `
  @opencodeBindings
