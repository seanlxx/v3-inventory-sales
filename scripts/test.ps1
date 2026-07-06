$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not ($env:NODE_OPTIONS -match '(^|\s)--experimental-sqlite(\s|$)')) {
  $env:NODE_OPTIONS = (($env:NODE_OPTIONS, "--experimental-sqlite") -join " ").Trim()
}

$tests = @(
  "scripts/test-ai-proxy-routing.mjs",
  "scripts/test-profit-system-phase1.mjs",
  "scripts/test-profit-api.mjs",
  "scripts/test-shengma-manual-sync.mjs",
  "scripts/test-legacy-api-archive.mjs"
)

foreach ($test in $tests) {
  Write-Host "Running $test"
  node $test
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Test failed: $test (exit code $LASTEXITCODE)"
    exit $LASTEXITCODE
  }
}

Write-Host "All regression tests passed"
