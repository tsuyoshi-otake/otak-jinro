# Cloudflare Workers シークレット確認スクリプト

Write-Host "=== Cloudflare Workers シークレット確認 ===" -ForegroundColor Green

# Workersディレクトリに移動
Set-Location "packages/workers"

Write-Host "`n1. 現在設定されているシークレット一覧:" -ForegroundColor Yellow
try {
    wrangler secret list
} catch {
    Write-Host "エラー: wranglerコマンドが見つからないか、認証が必要です" -ForegroundColor Red
    Write-Host "以下のコマンドで認証してください:" -ForegroundColor Cyan
    Write-Host "wrangler login" -ForegroundColor Cyan
}

Write-Host "`n2. 本番環境のシークレット一覧:" -ForegroundColor Yellow
try {
    wrangler secret list --env production
} catch {
    Write-Host "エラー: 本番環境のシークレット取得に失敗しました" -ForegroundColor Red
}

Write-Host "`n3. OpenAI APIキーを設定する場合:" -ForegroundColor Yellow
Write-Host "wrangler secret put OPENAI_API_KEY" -ForegroundColor Cyan
Write-Host "wrangler secret put OPENAI_API_KEY --env production" -ForegroundColor Cyan

Write-Host "`n4. シークレットを削除する場合:" -ForegroundColor Yellow
Write-Host "wrangler secret delete OPENAI_API_KEY" -ForegroundColor Cyan
Write-Host "wrangler secret delete OPENAI_API_KEY --env production" -ForegroundColor Cyan

# 元のディレクトリに戻る
Set-Location "../.."

Write-Host "`n=== 確認完了 ===" -ForegroundColor Green