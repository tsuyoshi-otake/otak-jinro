# ローカルエリアネットワーク対応 Development Environment Startup Script

# Set UTF-8 encoding to prevent character corruption
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 > $null

Write-Host "=== otak-jinro LAN Development Environment Startup ===" -ForegroundColor Green

# ローカルIPアドレスを取得
$localIP = (Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null}).IPv4Address.IPAddress | Select-Object -First 1
Write-Host "ローカルIPアドレス: $localIP" -ForegroundColor Yellow

# Create log directory
$logDir = "logs"
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir
    Write-Host "Created log directory: $logDir" -ForegroundColor Yellow
}

# Stop existing processes
Write-Host "Stopping existing processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*node*" -and $_.MainWindowTitle -like "*otak-jinro*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Start Frontend (LANアクセス用に0.0.0.0でバインド)
Write-Host "Starting Frontend (LAN accessible on 0.0.0.0:3000)..." -ForegroundColor Cyan
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 > `$null; cd '$scriptDir\packages\frontend'; npm run dev 2>&1 | Tee-Object -FilePath '$scriptDir\logs\frontend.log'"

# Start Workers (LANアクセス用に0.0.0.0でバインド)
Write-Host "Starting Workers (LAN accessible on 0.0.0.0:8787)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 > `$null; cd '$scriptDir\packages\workers'; npm install; npx wrangler dev --ip 0.0.0.0 2>&1 | Tee-Object -FilePath '$scriptDir\logs\workers.log'"

# Display access information
Write-Host "`n=== ローカルエリアネットワーク アクセス情報 ===" -ForegroundColor Green
Write-Host "ローカルマシン アクセス:" -ForegroundColor White
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  Workers:  http://localhost:8787" -ForegroundColor White
Write-Host ""
Write-Host "他のデバイスからのアクセス:" -ForegroundColor Yellow
Write-Host "  Frontend: http://$localIP:3000" -ForegroundColor Yellow
Write-Host "  Workers:  http://$localIP:8787" -ForegroundColor Yellow

# Display log monitoring commands
Write-Host "`n=== Log Monitoring Commands ===" -ForegroundColor Green
Write-Host "Frontend Log: Get-Content -Path 'logs\frontend.log' -Wait -Tail 20" -ForegroundColor White
Write-Host "Workers Log:  Get-Content -Path 'logs\workers.log' -Wait -Tail 20" -ForegroundColor White
Write-Host "All Logs:     Get-Content -Path 'logs\*.log' -Wait -Tail 20" -ForegroundColor White

# Display firewall notice
Write-Host "`n=== ファイアウォール設定について ===" -ForegroundColor Magenta
Write-Host "他のデバイスからアクセスできない場合は、以下のポートを開放してください:" -ForegroundColor White
Write-Host "  - ポート 3000 (Frontend)" -ForegroundColor White
Write-Host "  - ポート 8787 (Workers)" -ForegroundColor White
Write-Host "Windows Defenderファイアウォールで受信規則を作成することをお勧めします。" -ForegroundColor White

Write-Host "`nPlease wait for startup to complete..." -ForegroundColor Yellow
Write-Host "起動完了後、他のデバイスから http://$localIP:3000 にアクセスしてテストしてください。" -ForegroundColor Green