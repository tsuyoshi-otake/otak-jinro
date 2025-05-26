# GitHub Pages デプロイメント手順

このファイルは、otak-jinroフロントエンドをGitHub Pagesにデプロイするための手順を説明します。

## 前提条件

1. GitHubリポジトリが作成されていること
2. リポジトリにコードがプッシュされていること
3. GitHub Actionsが有効になっていること

## 設定手順

### 1. GitHub Pages設定

1. GitHubリポジトリのページに移動
2. `Settings` タブをクリック
3. 左側のメニューから `Pages` を選択
4. Source セクションで `GitHub Actions` を選択

### 2. 必要な環境変数

GitHub Actionsワークフロー内で以下の環境変数が設定されます：

```yaml
NEXT_PUBLIC_WORKERS_URL: https://otak-jinro-workers.systemexe-research-and-development.workers.dev
NEXT_PUBLIC_WS_URL: wss://otak-jinro-workers.systemexe-research-and-development.workers.dev
```

### 3. デプロイメントフロー

1. `main` ブランチにコードをプッシュ
2. GitHub Actionsが自動的にトリガーされる
3. 以下のステップが実行される：
   - Node.js環境のセットアップ
   - 依存関係のインストール
   - 共有パッケージのビルド
   - フロントエンドのプロダクションビルド
   - GitHub Pagesへのデプロイ

### 4. アクセスURL

デプロイ後、以下のURLでアクセス可能になります：
```
https://[ユーザー名].github.io/otak-jinro/
```

## ファイル構成

### デプロイ関連ファイル

- `.github/workflows/deploy-github-pages.yml` - GitHub Actionsワークフロー
- `packages/frontend/public/404.html` - SPAルーティング用
- `packages/frontend/next.config.js` - 静的エクスポート設定

### 主要な設定変更

1. **Next.js設定**：
   - `output: 'export'` - 静的エクスポート有効化
   - `basePath: '/otak-jinro'` - GitHub Pagesサブパス対応
   - `images: { unoptimized: true }` - 画像最適化無効化

2. **SPA対応**：
   - 動的ルート `[roomId]` を削除
   - 単一ページアプリケーション設計に変更
   - URLパラメータによるルーティング実装

3. **クライアントサイドルーティング**：
   - `404.html` でSPAリダイレクト処理
   - `layout.tsx` でURL復元スクリプト

## トラブルシューティング

### ビルドエラー

- **動的ルートエラー**: 静的エクスポートでは動的ルートが制限されるため、SPAアーキテクチャに変更済み
- **Node環境エラー**: `cross-env` パッケージを使用してWindows/Linux互換性を確保

### デプロイエラー

- **権限エラー**: リポジトリのActionsとPages権限を確認
- **パスエラー**: `basePath` 設定がリポジトリ名と一致することを確認

## ローカルテスト

プロダクションビルドをローカルでテストする場合：

```bash
cd packages/frontend
npm run build:github
npx serve out
```

## 注意事項

- GitHub Pagesは静的ホスティングのため、サーバーサイド機能は使用できません
- WebSocket接続は外部のCloudflare Workersを使用します
- 初回デプロイ後、DNSプロパゲーションに最大10分程度かかる場合があります