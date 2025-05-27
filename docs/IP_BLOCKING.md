# IPブロック機能

## 概要
キックされたプレイヤーのIPアドレスを自動的にブロックし、同じIPアドレスからの再接続を防ぐ機能です。

## 機能詳細

### 1. IPアドレス管理
- **取得**: Cloudflareのヘッダー（`CF-Connecting-IP`、`X-Forwarded-For`、`X-Real-IP`）からクライアントIPを取得
- **保存**: プレイヤーIDとIPアドレスのマッピングを保持
- **永続化**: ブロックリストはDurable Objectのstorageに永続化

### 2. キック時の処理
```typescript
// キック処理時の流れ
1. キック対象プレイヤーのIPアドレスを取得
2. AIプレイヤーでない場合のみIPをブロックリストに追加
3. ブロックリストを永続化ストレージに保存
4. プレイヤーを削除
5. WebSocket接続を切断
```

### 3. アクセス制御
- **WebSocket接続**: 接続時にIPアドレスをチェックし、ブロックされたIPは`403 Forbidden`で拒否
- **HTTP API**: API呼び出し時にもIPアドレスをチェック
- **ゲーム参加**: ルーム参加時にもIPブロックチェックを実行

## 実装ポイント

### IPアドレス取得の優先順位
1. `CF-Connecting-IP` (Cloudflareの実際のクライアントIP)
2. `X-Forwarded-For` (プロキシ経由の場合、最初のIPを使用)
3. `X-Real-IP` (リバースプロキシの実際のクライアントIP)
4. `unknown` (IPが取得できない場合)

### AIプレイヤーの除外
```typescript
if (targetIP && !isAIPlayer(targetPlayer.name)) {
  await this.blockIP(targetIP);
}
```
AIプレイヤーのキックではIPブロックを行いません。

### 永続化
```typescript
// ブロックリストの保存
await this.state.storage.put('blockedIPs', Array.from(this.blockedIPs));

// ブロックリストの読み込み
const blockedIPsData = await this.state.storage.get('blockedIPs');
if (blockedIPsData) {
  this.blockedIPs = new Set(blockedIPsData as string[]);
}
```

## セキュリティ考慮事項

### 1. プロキシ・VPN対策
- 複数のヘッダーから適切なIPアドレスを取得
- CloudflareのCF-Connecting-IPを最優先で使用

### 2. IPアドレス偽装対策
- サーバーサイドでのIPアドレス検証
- 信頼できるプロキシヘッダーのみを使用

### 3. 永続化とパフォーマンス
- Durable Objectのstorageを使用した永続化
- メモリ上でのSetによる高速検索

## テストケース

### 1. 基本的なIPブロック機能
```typescript
test('IPブロック機能のテスト', async () => {
  await blockIP('192.168.1.100')
  const response = await gameRoom.fetch(blockedRequest)
  expect(response.status).toBe(403)
})
```

### 2. IPアドレス取得機能
```typescript
test('IPアドレス取得機能のテスト', async () => {
  // CF-Connecting-IP, X-Forwarded-For, X-Real-IP の各ヘッダーをテスト
})
```

### 3. キック時のIPブロック統合テスト
```typescript
test('キック時のIPブロック統合テスト', async () => {
  // キック実行後に同じIPからの接続が拒否されることを確認
})
```

## 運用上の注意点

### 1. 誤ブロック対策
- 管理者による手動ブロック解除機能が必要（将来的な拡張）
- ブロック期間の設定（将来的な拡張）

### 2. 共有IP環境
- 会社や学校などの共有IP環境では複数ユーザーがブロックされる可能性
- 必要に応じてより詳細な識別子の併用を検討

### 3. ログとモニタリング
```typescript
console.log(`Blocked IP ${ipAddress} for kicked player ${playerName}`)
console.log(`Blocked IP ${clientIP} attempted to connect`)
```
ブロック状況の適切なログ出力でセキュリティ状況を監視

## 設定可能項目（将来拡張）

- ブロック期間の設定
- 管理者による手動ブロック解除
- IPホワイトリスト機能
- 地域ベースのアクセス制御