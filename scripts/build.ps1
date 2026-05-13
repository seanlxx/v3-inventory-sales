$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$dist = Join-Path $root "dist"
$nuxtPublic = Join-Path $frontend ".output\public"

Push-Location $frontend
try {
  npm run generate
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $nuxtPublic)) {
  throw "Nuxt generate did not produce $nuxtPublic"
}

Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dist | Out-Null
Copy-Item -Path (Join-Path $nuxtPublic "*") -Destination $dist -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "public_headers") -Destination (Join-Path $dist "_headers") -Force
