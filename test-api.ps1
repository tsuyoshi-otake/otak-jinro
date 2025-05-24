# API Test Script

# Set UTF-8 encoding to prevent character corruption
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 > $null

Write-Host "=== Otak Jinro API Test ===" -ForegroundColor Green

# Health Check
Write-Host "`n1. Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8787/health" -Method GET
    Write-Host "✅ Health check successful: $($health | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Room Creation Test
Write-Host "`n2. Room Creation Test" -ForegroundColor Yellow
try {
    $createRoomBody = @{
        hostName = "TestPlayer"
        settings = @{
            maxPlayers = 8
            dayDuration = 300
            nightDuration = 120
            votingDuration = 60
            enableVoiceChat = $false
            enableSpectators = $true
            customRoles = @()
        }
    } | ConvertTo-Json -Depth 3

    $roomResponse = Invoke-RestMethod -Uri "http://localhost:8787/api/rooms" -Method POST -Body $createRoomBody -ContentType "application/json"
    $roomId = $roomResponse.data.roomId
    Write-Host "✅ Room creation successful: Room ID = $roomId" -ForegroundColor Green

    # Room Info Retrieval Test
    Write-Host "`n3. Room Info Retrieval Test" -ForegroundColor Yellow
    $roomInfo = Invoke-RestMethod -Uri "http://localhost:8787/api/rooms/$roomId" -Method GET
    Write-Host "✅ Room info retrieval successful: $($roomInfo | ConvertTo-Json)" -ForegroundColor Green

    # Room Join Test
    Write-Host "`n4. Room Join Test" -ForegroundColor Yellow
    $joinBody = @{
        playerName = "Player1"
    } | ConvertTo-Json

    $joinResponse = Invoke-RestMethod -Uri "http://localhost:8787/api/rooms/$roomId/join" -Method POST -Body $joinBody -ContentType "application/json"
    Write-Host "✅ Room join successful: $($joinResponse | ConvertTo-Json)" -ForegroundColor Green

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Green