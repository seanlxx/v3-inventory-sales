# 在本地 D1 注入一条登录 session，便于 Playwright / 自动化脚本带登录态访问本地服务。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File ./scripts/inject-local-session.ps1
#   powershell -ExecutionPolicy Bypass -File ./scripts/inject-local-session.ps1 -Username admin -DurationHours 24
#
# 输出：
#   token         : 32 字节随机 token，前端写到 sessionStorage / 请求头 X-VM-Session
#   tokenHash     : SHA-256 base64url（无 padding），已写入本地 D1 app_sessions 表
#   sessionFile   : output\local-session\session.json（无 BOM，可直接被 Playwright 读取）
#
# 注意：
# - 只写本地 D1（--local），不会动远程数据库
# - output/ 已在 .gitignore 中，session.json 不会被提交
# - 不依赖 npx.ps1 / npm.ps1，不受 PowerShell 执行策略影响

[CmdletBinding()]
param(
  [string]$Username = 'admin',
  [string]$DatabaseName = 'v3-vending-inventory-sales-db',
  [int]$DurationHours = 24
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

# ── 1. 生成 32 字节随机 token，编码为 base64url（与后端 sha256 输入约定一致）──
$tokenBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($tokenBytes)
$token = [Convert]::ToBase64String($tokenBytes).TrimEnd('=').Replace('+','-').Replace('/','_')

# ── 2. 算 SHA-256 base64url（无 padding），与 functions/api/_shared/auth.js 的 sha256 函数一致 ──
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token))
} finally {
  $sha.Dispose()
}
$tokenHash = [Convert]::ToBase64String($hashBytes).TrimEnd('=').Replace('+','-').Replace('/','_')

# ── 3. 计算时间字段（ISO 8601，UTC，毫秒精度）──
$now = (Get-Date).ToUniversalTime()
$createdAt = $now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$expiresAt = $now.AddHours($DurationHours).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

# ── 4. 写入本地 D1（用 npx.cmd 绕过 PowerShell 执行策略）──
$sql = "INSERT INTO app_sessions (token_hash, username, expires_at, created_at) VALUES ('$tokenHash', '$Username', '$expiresAt', '$createdAt');"

Write-Host "Writing session to local D1 ($DatabaseName)..." -ForegroundColor Cyan
& npx.cmd wrangler d1 execute $DatabaseName --local --command $sql | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "wrangler d1 execute 失败，请确认本地 D1 已初始化（先跑过 dev.bat 或 npx wrangler d1 migrations apply $DatabaseName --local）"
}

# ── 5. 输出无 BOM 的 session.json，供 Playwright / 其他工具读取 ──
$outputDir = Join-Path $repoRoot 'output\local-session'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$sessionFile = Join-Path $outputDir 'session.json'

$payload = [ordered]@{
  username  = $Username
  token     = $token
  tokenHash = $tokenHash
  expiresAt = $expiresAt
  createdAt = $createdAt
}
$json = $payload | ConvertTo-Json -Depth 5

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($sessionFile, $json, $utf8NoBom)

# ── 6. 打印结果 ──
Write-Host ""
Write-Host "Local session injected." -ForegroundColor Green
Write-Host ("  username    : {0}" -f $Username)
Write-Host ("  token       : {0}" -f $token)
Write-Host ("  tokenHash   : {0}" -f $tokenHash)
Write-Host ("  expiresAt   : {0}" -f $expiresAt)
Write-Host ("  sessionFile : {0}" -f $sessionFile)
Write-Host ""
Write-Host "Playwright / fetch 端用法：" -ForegroundColor Yellow
Write-Host "  - 请求头加 X-VM-Session: <token>"
Write-Host "  - 或 sessionStorage.setItem('vm:session', '<token>')"
