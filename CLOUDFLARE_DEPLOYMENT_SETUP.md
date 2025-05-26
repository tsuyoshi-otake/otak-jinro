# Cloudflare Workers デプロイメント設定ガイド

このドキュメントでは、GitHub ActionsでCloudflare Workersを自動デプロイするための設定方法を説明します。

## 必要なシークレットの設定

GitHubリポジトリの設定で以下のシークレットを追加してください：

### 1. Cloudflare API Token
- **名前**: `CLOUDFLARE_API_TOKEN`
- **値**: Cloudflareダッシュボードで生成したAPIトークン

#### APIトークンの作成手順：
1. [Cloudflareダッシュボード](https://dash.cloudflare.com/profile/api-tokens)にアクセス
2. 「Create Token」をクリック
3. 「Custom token」を選択
4. 以下の権限を設定：
   - **Account**: `Cloudflare Workers:Edit`
   - **Zone**: `Zone:Read` (必要に応じて)
   - **Zone Resources**: `Include All zones`

### 2. Cloudflare Account ID
- **名前**: `CLOUDFLARE_ACCOUNT_ID`
- **値**: CloudflareアカウントID

#### アカウントIDの確認方法：
1. Cloudflareダッシュボードにログイン
2. 右サイドバーの「Account ID」をコピー

### 3. OpenAI API Key
- **名前**: `OPENAI_API_KEY`
- **値**: OpenAIのAPIキー

#### OpenAI APIキーの取得方法：
1. [OpenAI Platform](https://platform.openai.com/api-keys)にアクセス
2. 「Create new secret key」をクリック
3. 生成されたキーをコピー（一度しか表示されません）

## GitHub Secretsの設定手順

1. GitHubリポジトリページに移動
2. 「Settings」タブをクリック
3. 左サイドバーの「Secrets and variables」→「Actions」をクリック
4. 「New repository secret」をクリック
5. 上記の3つのシークレットをそれぞれ追加

## デプロイメントフロー

GitHub Actionsワークフローは以下の順序で実行されます：

1. **Build**: 共有パッケージとWorkersパッケージをビルド
2. **Deploy Workers**: Cloudflare Workersにデプロイ
3. **Deploy Pages**: GitHub Pagesにフロントエンドをデプロイ

## ローカル開発での設定

ローカル開発でOpenAI機能をテストする場合：

```bash
# Workersディレクトリに移動
cd packages/workers

# シークレットを設定
wrangler secret put OPENAI_API_KEY
# プロンプトでAPIキーを入力

# 開発サーバー起動
npm run dev
```

## 環境別設定

### Development環境
- ローカル開発用
- `wrangler dev`で起動
- シークレットは手動設定

### Production環境
- GitHub Actionsでの自動デプロイ
- シークレットはGitHub Secretsから自動注入
- `wrangler deploy --env production`で実行

## トラブルシューティング

### デプロイエラーの場合
1. Cloudflare API Tokenの権限を確認
2. Account IDが正しいか確認
3. OpenAI APIキーが有効か確認

### ローカル開発でAI機能が動作しない場合
1. `wrangler secret list`でシークレットが設定されているか確認
2. OpenAI APIキーの残高を確認
3. ネットワーク接続を確認

## OpenAI APIキーの保存場所詳細

### Cloudflare Workers内での保存場所
OpenAI APIキーは以下の場所に暗号化されて保存されます：

1. **Cloudflareダッシュボード**
   - Workers & Pages → あなたのWorker名 → Settings → Variables and Secrets
   - 「Secrets」セクションに`OPENAI_API_KEY`として保存

2. **Cloudflareのインフラ内**
   - Cloudflareのセキュアなシークレット管理システム
   - 実行時のみWorkerインスタンスに注入される
   - 暗号化されて保存、平文では見えない

### 確認方法
```bash
# 現在のシークレット一覧を確認
cd packages/workers
wrangler secret list

# 本番環境のシークレット確認
wrangler secret list --env production

# または提供されたスクリプトを使用
./check-secrets.ps1
```

### 設定方法
```bash
# ローカル開発用
wrangler secret put OPENAI_API_KEY

# 本番環境用
wrangler secret put OPENAI_API_KEY --env production
```

### GitHub Actionsでの自動設定
GitHub Actionsでは以下のステップで自動設定されます：
```yaml
- name: Set Cloudflare Workers Secrets
  run: |
    cd packages/workers
    echo "${{ secrets.OPENAI_API_KEY }}" | npx wrangler secret put OPENAI_API_KEY --env production
```

## セキュリティ注意事項

- APIキーは絶対にコードにハードコーディングしない
- GitHub Secretsは暗号化されて保存される
- Cloudflare Workersのシークレットも暗号化保存
- 本番環境でのみ実際のAPIキーを使用する
- 開発環境では制限されたAPIキーを使用することを推奨
- シークレットは実行時のみWorkerに注入され、ログには出力されない

## 参考リンク

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [OpenAI API Documentation](https://platform.openai.com/docs/)