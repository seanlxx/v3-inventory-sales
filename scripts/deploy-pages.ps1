$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dirty = git status --short
if ($dirty) {
  throw "Working tree is not clean. Commit or stash changes before deploying."
}

powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build.ps1")

$commitHash = (git rev-parse HEAD).Trim()
$commitMessage = (git log -1 --pretty=%s).Trim()

npx wrangler pages deploy .\dist `
  --project-name v3-inventory-sales `
  --branch master `
  --commit-hash $commitHash `
  --commit-message $commitMessage

$deploymentsJson = npx wrangler pages deployment list --project-name v3-inventory-sales --environment production --json
$deployments = $deploymentsJson | ConvertFrom-Json
$latest = $deployments[0]

if ($latest.Source -ne $commitHash.Substring(0, 7)) {
  throw "Latest Pages deployment source is $($latest.Source), expected $($commitHash.Substring(0, 7))"
}

if ($latest.Status -eq "Failure" -or $latest.Status -eq "Idle") {
  throw "Latest Pages deployment status is $($latest.Status)"
}

$response = Invoke-WebRequest -Uri "https://v3-inventory-sales.pages.dev/inventory" -UseBasicParsing -TimeoutSec 30
if ($response.StatusCode -ne 200) {
  throw "Production /inventory returned HTTP $($response.StatusCode)"
}

Write-Host "Pages deployment verified: $($latest.Deployment)"
