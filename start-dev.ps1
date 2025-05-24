# Development Environment Startup Script

# Set UTF-8 encoding to prevent character corruption
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 > $null

Write-Host "=== otak-jinro Development Environment Startup ===" -ForegroundColor Green

# Create log directory
$logDir = "logs"
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir
    Write-Host "Created log directory: $logDir" -ForegroundColor Yellow
}

# Stop existing processes
Write-Host "Stopping existing processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*node*" -and $_.MainWindowTitle -like "*otak-jinro*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Start Frontend
Write-Host "Starting Frontend..." -ForegroundColor Cyan
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 > `$null; cd '$scriptDir\packages\frontend'; npm run dev 2>&1 | Tee-Object -FilePath '$scriptDir\logs\frontend.log'"

# Start Workers
Write-Host "Starting Workers..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 > `$null; cd '$scriptDir\packages\workers'; npm install; npx wrangler dev 2>&1 | Tee-Object -FilePath '$scriptDir\logs\workers.log'"

# Display log monitoring commands
Write-Host "`n=== Log Monitoring Commands ===" -ForegroundColor Green
Write-Host "Frontend Log: Get-Content -Path 'logs\frontend.log' -Wait -Tail 20" -ForegroundColor White
Write-Host "Workers Log:  Get-Content -Path 'logs\workers.log' -Wait -Tail 20" -ForegroundColor White
Write-Host "All Logs:     Get-Content -Path 'logs\*.log' -Wait -Tail 20" -ForegroundColor White

Write-Host "`n=== Server Check Commands ===" -ForegroundColor Green
Write-Host "Frontend:     curl http://localhost:3000" -ForegroundColor White
Write-Host "Workers:      curl http://localhost:8787/health" -ForegroundColor White

Write-Host "`nPlease wait for startup to complete..." -ForegroundColor Yellow