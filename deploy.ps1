# Cloudflare デプロイスクリプト
# 使用方法: powershell -ExecutionPolicy Bypass -File deploy.ps1 [staging|production]

param(
    [Parameter(Position=0)]
    [ValidateSet("staging", "production", "")]
    [string]$Environment = "staging"
)

Write-Host "=== Cloudflare デプロイスクリプト ===" -ForegroundColor Green
Write-Host "環境: $Environment" -ForegroundColor Yellow

# エラー時に停止
$ErrorActionPreference = "Stop"

try {
    # 1. 依存関係の確認
    Write-Host "`n1. 依存関係の確認..." -ForegroundColor Cyan
    if (!(Get-Command wrangler -ErrorAction SilentlyContinue)) {
        Write-Host "エラー: wrangler CLI がインストールされていません" -ForegroundColor Red
        Write-Host "インストール: npm install -g wrangler" -ForegroundColor Yellow
        exit 1
    }

    # 2. テスト実行
    Write-Host "`n2. テスト実行..." -ForegroundColor Cyan
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "エラー: テストが失敗しました" -ForegroundColor Red
        exit 1
    }

    # 3. 型チェック
    Write-Host "`n3. 型チェック..." -ForegroundColor Cyan
    npm run type-check
    if ($LASTEXITCODE -ne 0) {
        Write-Host "エラー: 型チェックが失敗しました" -ForegroundColor Red
        exit 1
    }

    # 4. ビルド
    Write-Host "`n4. ビルド..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "エラー: ビルドが失敗しました" -ForegroundColor Red
        exit 1
    }

    # 5. Workers デプロイ
    Write-Host "`n5. Cloudflare Workers デプロイ..." -ForegroundColor Cyan
    Set-Location "packages/workers"
    
    if ($Environment -eq "production") {
        wrangler deploy --env production
    } else {
        wrangler deploy --env staging
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "エラー: Workers デプロイが失敗しました" -ForegroundColor Red
        Set-Location "../.."
        exit 1
    }

    # 6. Frontend ビルド（本番用）
    Write-Host "`n6. Frontend ビルド（本番用）..." -ForegroundColor Cyan
    Set-Location "../frontend"
    
    # 本番環境の場合は本番用環境変数を使用
    if ($Environment -eq "production") {
        $env:NODE_ENV = "production"
    }
    
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "エラー: Frontend ビルドが失敗しました" -ForegroundColor Red
        Set-Location "../.."
        exit 1
    }

    # 7. Pages デプロイ
    Write-Host "`n7. Cloudflare Pages デプロイ..." -ForegroundColor Cyan
    npx wrangler pages deploy .next --project-name otak-jinro-game
    if ($LASTEXITCODE -ne 0) {
        Write-Host "エラー: Pages デプロイが失敗しました" -ForegroundColor Red
        Set-Location "../.."
        exit 1
    }

    # 8. デプロイ完了
    Set-Location "../.."
    Write-Host "`n=== デプロイ完了 ===" -ForegroundColor Green
    
    if ($Environment -eq "production") {
        Write-Host "Workers: https://otak-jinro-workers.systemexe-research-and-development.workers.dev" -ForegroundColor Yellow
        Write-Host "Frontend: https://otak-jinro-game.pages.dev" -ForegroundColor Yellow
    } else {
        Write-Host "Workers: https://otak-jinro-workers-staging.systemexe-research-and-development.workers.dev" -ForegroundColor Yellow
        Write-Host "Frontend: 新しいデプロイURLを確認してください" -ForegroundColor Yellow
    }

    # 9. デプロイ状況確認
    Write-Host "`n9. デプロイ状況確認..." -ForegroundColor Cyan
    Set-Location "packages/workers"
    Write-Host "Workers デプロイ履歴:" -ForegroundColor Yellow
    wrangler deployments list --limit 3
    
    Set-Location "../.."
    Write-Host "`nPages デプロイ履歴:" -ForegroundColor Yellow
    wrangler pages deployment list --project-name otak-jinro-game --limit 3

} catch {
    Write-Host "`nエラーが発生しました: $($_.Exception.Message)" -ForegroundColor Red
    Set-Location (Split-Path $MyInvocation.MyCommand.Path)
    exit 1
}

Write-Host "`n=== デプロイスクリプト完了 ===" -ForegroundColor Green