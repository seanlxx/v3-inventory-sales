# 清空 R2 图片存储
# 使用方式：powershell -ExecutionPolicy Bypass -File ./scripts/clear-r2-images.ps1

param(
    [switch]$Confirm = $false
)

$ErrorActionPreference = "Stop"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "⚠️  R2 图片存储清空脚本" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host ""
Write-Host "将清空 R2 存储桶中的所有图片：" -ForegroundColor Yellow
Write-Host "  • 存储桶: v3-vending-inventory-sales-images" -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  此操作不可逆！" -ForegroundColor Red
Write-Host ""

if (-not $Confirm) {
    Write-Host "确认执行？(y/n): " -ForegroundColor Yellow -NoNewline
    $response = Read-Host
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "已取消。" -ForegroundColor Gray
        exit 0
    }
}

Write-Host ""
Write-Host "执行中..." -ForegroundColor Cyan

try {
    Write-Host "  → 删除 R2 中的所有对象..." -ForegroundColor Gray
    npx wrangler r2 object delete --bucket=v3-vending-inventory-sales-images --recursive '*'

    Write-Host ""
    Write-Host "✅ R2 图片存储已清空！" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "❌ 执行失败: $_" -ForegroundColor Red
    exit 1
}
