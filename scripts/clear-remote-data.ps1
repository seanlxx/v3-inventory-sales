# 清空远程 D1 所有业务数据
# 使用方式：powershell -ExecutionPolicy Bypass -File ./scripts/clear-remote-data.ps1

param(
    [switch]$Confirm = $false
)

$ErrorActionPreference = "Stop"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "⚠️  远程 D1 数据清空脚本" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host ""
Write-Host "将清空以下表中的所有数据：" -ForegroundColor Yellow
Write-Host "  • products（商品）"
Write-Host "  • purchase_orders / purchase_items（进货单）"
Write-Host "  • sales_orders / sales_items（销售单）"
Write-Host "  • stock_movements / stock_transfers（库存流水）"
Write-Host "  • inventory_balances（库存余额）"
Write-Host "  • image_assets（图片资产）"
Write-Host "  • vending_records*（旧版记录）"
Write-Host "  • external_*（外部集成数据）"
Write-Host ""
Write-Host "保留的表：" -ForegroundColor Green
Write-Host "  • app_auth, app_sessions, app_login_attempts（认证系统）"
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

# 执行清空 SQL
$sqlFile = "scripts/clear-all-business-data.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ 找不到 $sqlFile" -ForegroundColor Red
    exit 1
}

try {
    Write-Host "  → 连接远程 D1: v3-vending-inventory-sales-db" -ForegroundColor Gray
    npx wrangler d1 execute v3-vending-inventory-sales-db --remote --file $sqlFile

    Write-Host ""
    Write-Host "✅ 远程数据清空完成！" -ForegroundColor Green
    Write-Host ""
    Write-Host "后续步骤：" -ForegroundColor Cyan
    Write-Host "  1. 清空 R2 图片存储（可选）："
    Write-Host "     npx wrangler r2 object delete --bucket=v3-vending-inventory-sales-images --recursive '*'"
    Write-Host "  2. 本地同步远程数据："
    Write-Host "     powershell -ExecutionPolicy Bypass -File ./scripts/dev.ps1 -SyncRemote -DatabaseName v3-vending-inventory-sales-db"
    Write-Host "  3. 启动本地开发服务验证系统正常："
    Write-Host "     .\dev.bat"
    Write-Host ""
}
catch {
    Write-Host "❌ 执行失败: $_" -ForegroundColor Red
    exit 1
}
