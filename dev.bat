@echo off
setlocal

cd /d "%~dp0"

set "D1_DATABASE_NAME=v3-vending-inventory-sales-db"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" -SyncRemote -DatabaseName "%D1_DATABASE_NAME%"

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo dev.ps1 failed with exit code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)
