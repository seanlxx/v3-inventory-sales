$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function ConvertFrom-WranglerJson($RawOutput, $Label) {
  $text = ($RawOutput -join "`n").Trim()
  $jsonStart = $text.IndexOf("[")
  if ($jsonStart -lt 0) {
    throw "$Label did not return a JSON array. Output: $text"
  }

  return $text.Substring($jsonStart) | ConvertFrom-Json
}

function Invoke-CheckedNative($Label, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

$dirty = git status --short
if ($dirty) {
  throw "Working tree is not clean. Commit or stash changes before deploying."
}

powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build.ps1")

$commitHash = (git rev-parse HEAD).Trim()
$commitMessage = (git log -1 --pretty=%s).Trim()

Invoke-CheckedNative "wrangler pages deploy" {
  npx wrangler pages deploy .\dist `
    --project-name v3-inventory-sales `
    --branch master `
    --commit-hash $commitHash `
    --commit-message $commitMessage
}

$deploymentsJson = npx wrangler pages deployment list --project-name v3-inventory-sales --environment production --json
if ($LASTEXITCODE -ne 0) {
  throw "wrangler pages deployment list failed with exit code $LASTEXITCODE."
}

$deployments = ConvertFrom-WranglerJson $deploymentsJson "wrangler pages deployment list"
$expectedSource = $commitHash.Substring(0, 7)
$matchingDeployments = @($deployments | Where-Object { $_.Source -eq $expectedSource })
$latest = @($matchingDeployments | Where-Object { $_.Status -ne "Failure" -and $_.Status -ne "Idle" } | Select-Object -First 1)[0]

if (-not $latest) {
  $statuses = ($matchingDeployments | ForEach-Object { "$($_.Deployment): $($_.Status)" }) -join "; "
  throw "No successful Pages deployment found for $expectedSource. Matching deployments: $statuses"
}

if ($latest.Source -ne $expectedSource) {
  throw "Latest Pages deployment source is $($latest.Source), expected $expectedSource"
}

$response = Invoke-WebRequest -Uri "https://v3-inventory-sales.pages.dev/inventory/" -UseBasicParsing -TimeoutSec 30
if ($response.StatusCode -ne 200) {
  throw "Production /inventory/ returned HTTP $($response.StatusCode)"
}

Write-Host "Pages deployment verified: $($latest.Deployment)"
