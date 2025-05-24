# Log Monitoring Script

# Set UTF-8 encoding to prevent character corruption
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 > $null

param(
    [string]$Service = "all"
)

Write-Host "=== otak-jinro Log Monitoring ===" -ForegroundColor Green

# Check log directory
if (!(Test-Path "logs")) {
    Write-Host "Log directory not found. Please run start-dev.ps1 first." -ForegroundColor Red
    exit 1
}

switch ($Service.ToLower()) {
    "frontend" {
        Write-Host "Monitoring Frontend logs..." -ForegroundColor Cyan
        if (Test-Path "logs\frontend.log") {
            Get-Content -Path "logs\frontend.log" -Wait -Tail 20
        } else {
            Write-Host "Frontend log file not found." -ForegroundColor Red
        }
    }
    "workers" {
        Write-Host "Monitoring Workers logs..." -ForegroundColor Cyan
        if (Test-Path "logs\workers.log") {
            Get-Content -Path "logs\workers.log" -Wait -Tail 20
        } else {
            Write-Host "Workers log file not found." -ForegroundColor Red
        }
    }
    "all" {
        Write-Host "Monitoring all logs..." -ForegroundColor Cyan
        $logFiles = Get-ChildItem -Path "logs\*.log" -ErrorAction SilentlyContinue
        if ($logFiles.Count -gt 0) {
            Get-Content -Path "logs\*.log" -Wait -Tail 20
        } else {
            Write-Host "No log files found." -ForegroundColor Red
        }
    }
    default {
        Write-Host "Usage:" -ForegroundColor Yellow
        Write-Host "  .\watch-logs.ps1 frontend  # Frontend logs only" -ForegroundColor White
        Write-Host "  .\watch-logs.ps1 workers   # Workers logs only" -ForegroundColor White
        Write-Host "  .\watch-logs.ps1 all       # All logs (default)" -ForegroundColor White
    }
}