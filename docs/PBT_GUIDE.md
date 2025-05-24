# Property-Based Testing (PBT) ガイド

## 概要

このプロジェクトでは、従来のユニットテストに加えて、Property-Based Testing (PBT) を導入しています。PBTは、テストケースを手動で作成する代わりに、プロパティ（不変条件）を定義し、ランダムに生成されたデータでそのプロパティが常に成り立つことを検証するテスト手法です。

## 使用ライブラリ

- **fast-check**: JavaScriptのPBTライブラリ
- **Jest**: テストランナー（既存）

## PBTの利点

### 1. 網羅的なテストカバレッジ
- 手動では思いつかないエッジケースを自動的に発見
- 大量のランダムデータでテストを実行

### 2. バグの早期発見
- 予期しない入力パターンでのバグを発見
- リグレッションの防止

### 3. 仕様の明確化
- プロパティの定義により、関数の期待される動作が明確になる
- ドキュメントとしての役割

## 実装されたPBTテスト

### 1. Shared Package (`packages/shared/src/utils/__tests__/gameUtils.pbt.test.ts`)

#### `assignRoles` 関数
```typescript
// プロパティ: 割り当てられた役職の総数は常にプレイヤー数と等しい
fc.assert(fc.property(
  playersArb(4, 12),
  (players) => {
    const result = assignRoles(players);
    return result.length === players.length;
  }
));
```

#### `checkWinCondition` 関数
```typescript
// プロパティ: 人狼が全滅した場合、村人チームが勝利する
fc.assert(fc.property(
  playersArb(4, 12),
  (players) => {
    const modifiedPlayers = players.map(p => ({
      ...p,
      isAlive: p.role !== 'werewolf'
    }));
    
    const villagerTeamAlive = modifiedPlayers.some(p => 
      p.isAlive && ['villager', 'seer', 'medium', 'hunter'].includes(p.role)
    );

    if (villagerTeamAlive) {
      const result = checkWinCondition(modifiedPlayers);
      return result === 'villagers';
    }
    return true;
  }
));
```

### 2. Workers Package (`packages/workers/src/__tests__/gameRoom.pbt.test.ts`)

#### HTTP リクエスト処理
```typescript
// プロパティ: WebSocketアップグレードリクエストは常に101または400を返す
await fc.assert(fc.asyncProperty(
  websocketHeadersArb,
  async (headers) => {
    const request = new Request('http://localhost/websocket', { headers });
    const response = await gameRoom.fetch(request);
    return response.status === 101 || response.status === 400;
  }
));
```

#### プレイヤー検証
```typescript
// プロパティ: 有効なプレイヤー名は受け入れられる
await fc.assert(fc.asyncProperty(
  playerNameArb,
  async (playerName) => {
    const playerData = { playerName, isAI: false };
    const request = new Request('http://localhost/api/room', {
      method: 'POST',
      body: JSON.stringify(playerData),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await gameRoom.fetch(request);
    
    if (response.status === 200) {
      const data = await response.json();
      return data.success === true && data.data.player.name === playerName;
    }
    return true;
  }
));
```

### 3. Frontend Package (`packages/frontend/src/lib/__tests__/utils.pbt.test.ts`)

#### CSS クラス名ユーティリティ
```typescript
// プロパティ: 文字列引数は常に結果に含まれる
fc.assert(fc.property(
  fc.array(classNameArb, { minLength: 1, maxLength: 10 }),
  (classNames) => {
    const result = cn(...classNames);
    return classNames.every(className => 
      className.split(/\s+/).every(cls => 
        cls.trim() === '' || result.includes(cls.trim())
      )
    );
  }
));
```

## Arbitraries（データ生成器）

### 基本的なArbitraries

```typescript
// プレイヤー名生成器
const playerNameArb = fc.string({ minLength: 2, maxLength: 20 })
  .filter(name => /^[a-zA-Z0-9ひらがなカタカナ漢字\s]+$/.test(name));

// プレイヤー役職生成器
const playerRoleArb = fc.constantFrom(
  'villager', 'werewolf', 'seer', 'medium', 'hunter', 'madman'
);

// プレイヤーオブジェクト生成器
const playerArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  name: fc.string({ minLength: 2, maxLength: 20 }),
  role: playerRoleArb,
  isAlive: fc.boolean(),
  isHost: fc.boolean(),
  isReady: fc.boolean(),
  joinedAt: fc.integer({ min: 0 })
});
```

### 複合Arbitraries

```typescript
// プレイヤー配列生成器
const playersArb = (minLength: number = 4, maxLength: number = 12) =>
  fc.array(playerArb, { minLength, maxLength }).map(players =>
    players.map((p, i) => ({ ...p, id: `player-${i}`, name: `Player${i}` }))
  );

// 投票配列生成器
const votesArb = fc.array(voteArb, { maxLength: 20 });
```

## 非同期テストの処理

非同期関数をテストする場合は、`fc.asyncProperty`を使用します：

```typescript
it('プロパティ: 非同期処理が正しく動作する', async () => {
  await fc.assert(fc.asyncProperty(
    someArbitrary,
    async (data) => {
      const result = await someAsyncFunction(data);
      return someCondition(result);
    }
  ));
});
```

## ベストプラクティス

### 1. 適切なプロパティの選択
- **不変条件**: 入力に関係なく常に成り立つべき条件
- **往復性**: エンコード→デコードで元の値に戻る
- **等価性**: 異なる実装が同じ結果を返す

### 2. Arbitrariesの設計
- **現実的なデータ**: 実際のユースケースに近いデータを生成
- **境界値**: エッジケースを含むデータ範囲
- **フィルタリング**: 無効なデータを除外

### 3. テストの可読性
- **明確なプロパティ名**: 何をテストしているかが分かる名前
- **コメント**: 複雑なプロパティには説明を追加
- **適切な粒度**: 一つのプロパティで一つの側面をテスト

### 4. パフォーマンス考慮
- **実行回数の調整**: 必要に応じて`numRuns`オプションを使用
- **タイムアウト**: 長時間実行されるテストには適切なタイムアウトを設定

## 実行方法

```bash
# すべてのテスト（従来のテスト + PBT）を実行
npm test

# 特定のパッケージのテストのみ実行
cd packages/shared && npm test
cd packages/workers && npm test
cd packages/frontend && npm test

# PBTテストのみ実行
npm test -- --testNamePattern="Property-Based Tests"
```

## トラブルシューティング

### 1. テストが失敗した場合
- fast-checkは失敗したケースの最小例を提供します
- `fc.assert`の出力を確認して、どのような入力で失敗したかを把握

### 2. パフォーマンスの問題
- `numRuns`オプションで実行回数を調整
- 複雑なArbitrariesを簡素化

### 3. 型エラー
- TypeScriptの型定義を確認
- Arbitrariesの型注釈を明示的に指定

## 今後の拡張

1. **新しい関数のPBTテスト追加**
2. **より複雑なプロパティの実装**
3. **パフォーマンステストの追加**
4. **統合テストでのPBT活用**

## 参考資料

- [fast-check公式ドキュメント](https://fast-check.dev/)
- [Property-Based Testing入門](https://hypothesis.works/articles/what-is-property-based-testing/)
- [Jest公式ドキュメント](https://jestjs.io/)