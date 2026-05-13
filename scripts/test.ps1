$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not ($env:NODE_OPTIONS -match '(^|\s)--experimental-sqlite(\s|$)')) {
  $env:NODE_OPTIONS = (($env:NODE_OPTIONS, "--experimental-sqlite") -join " ").Trim()
}

$tests = @(
  "scripts/test-inventory-service.mjs",
  "scripts/test-ai-purchase-recognition.mjs",
  "scripts/test-ai-proxy-routing.mjs"
)

foreach ($test in $tests) {
  Write-Host "Running $test"
  node $test
}

Write-Host "All regression tests passed"
