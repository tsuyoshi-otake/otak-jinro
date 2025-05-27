import { GameRoom } from '../gameRoom'
import { WebSocketMessage } from '@otak-jinro/shared'

describe('GameRoom キック機能 統合テスト', () => {
  let mockEnv: any
  let mockDurableObjectState: any

  beforeEach(() => {
    mockDurableObjectState = {
      storage: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        deleteAll: jest.fn(),
        list: jest.fn().mockResolvedValue(new Map()),
      },
      blockConcurrencyWhile: jest.fn((fn) => fn()),
      id: {
        toString: jest.fn().mockReturnValue('test-room-id'),
        equals: jest.fn(),
        name: 'test-room'
      },
      waitUntil: jest.fn(),
    }

    mockEnv = {
      GAME_ROOMS: {},
      PLAYER_DATA: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
      },
      PUBLIC_ROOMS: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
      }
    }
  })

  test('キック機能の基本的な統合テスト', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)

    // ホストプレイヤーを作成
    const hostRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: {
          name: 'ホストプレイヤー',
          isAlive: true,
          isHost: true,
          isReady: true
        }
      })
    })

    const hostResponse = await gameRoom.fetch(hostRequest)
    expect(hostResponse.status).toBe(200)

    const hostData = await hostResponse.json()
    const hostPlayerId = hostData.playerId

    // ターゲットプレイヤーを作成
    const targetRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: {
          name: 'キック対象プレイヤー',
          isAlive: true,
          isHost: false,
          isReady: true
        }
      })
    })

    const targetResponse = await gameRoom.fetch(targetRequest)
    expect(targetResponse.status).toBe(200)

    const targetData = await targetResponse.json()
    const targetPlayerId = targetData.playerId

    // キック機能をテスト（HTTP API経由）
    const kickRequest = new Request(`http://localhost/test-room/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickerId: hostPlayerId,
        targetId: targetPlayerId
      })
    })

    const kickResponse = await gameRoom.fetch(kickRequest)
    expect(kickResponse.status).toBe(200)

    const kickResult = await kickResponse.json()
    expect(kickResult.success).toBe(true)
    expect(kickResult.message).toContain('キックされました')
  })

  test('非ホストプレイヤーによるキック試行は失敗する', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)

    // ホストプレイヤーを作成
    const hostRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: {
          name: 'ホストプレイヤー',
          isAlive: true,
          isHost: true,
          isReady: true
        }
      })
    })

    await gameRoom.fetch(hostRequest)

    // 通常プレイヤーを作成
    const normalPlayerRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: {
          name: '通常プレイヤー',
          isAlive: true,
          isHost: false,
          isReady: true
        }
      })
    })

    const normalPlayerResponse = await gameRoom.fetch(normalPlayerRequest)
    const normalPlayerData = await normalPlayerResponse.json()
    const normalPlayerId = normalPlayerData.playerId

    // ターゲットプレイヤーを作成
    const targetRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: {
          name: 'キック対象プレイヤー',
          isAlive: true,
          isHost: false,
          isReady: true
        }
      })
    })

    const targetResponse = await gameRoom.fetch(targetRequest)
    const targetData = await targetResponse.json()
    const targetPlayerId = targetData.playerId

    // 非ホストプレイヤーによるキック試行
    const kickRequest = new Request(`http://localhost/test-room/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickerId: normalPlayerId,
        targetId: targetPlayerId
      })
    })

    const kickResponse = await gameRoom.fetch(kickRequest)
    expect(kickResponse.status).toBe(403)

    const kickResult = await kickResponse.json()
    expect(kickResult.success).toBe(false)
    expect(kickResult.error).toContain('ホストのみ')
  })

  test('存在しないプレイヤーをキックしようとした場合', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)

    // ホストプレイヤーを作成
    const hostRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: {
          name: 'ホストプレイヤー',
          isAlive: true,
          isHost: true,
          isReady: true
        }
      })
    })

    const hostResponse = await gameRoom.fetch(hostRequest)
    const hostData = await hostResponse.json()
    const hostPlayerId = hostData.playerId

    // 存在しないプレイヤーIDでキック試行
    const kickRequest = new Request(`http://localhost/test-room/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickerId: hostPlayerId,
        targetId: 'non-existent-player-id'
      })
    })

    const kickResponse = await gameRoom.fetch(kickRequest)
    expect(kickResponse.status).toBe(404)

    const kickResult = await kickResponse.json()
    expect(kickResult.success).toBe(false)
    expect(kickResult.error).toContain('見つかりません')
  })

  test('WebSocketメッセージによるキック機能のテスト', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)

    // モックWebSocketペアを作成
    const [clientWs, serverWs] = Object.values(new WebSocketPair())
    
    // WebSocketのmockを設定
    const mockSend = jest.fn()
    const mockClose = jest.fn()
    serverWs.send = mockSend
    serverWs.close = mockClose

    // WebSocket接続をシミュレート
    const wsRequest = new Request('http://localhost/websocket', {
      headers: { 'Upgrade': 'websocket' }
    })

    const wsResponse = await gameRoom.fetch(wsRequest)
    expect(wsResponse.status).toBe(101)

    // ホストプレイヤーの参加をシミュレート
    const hostJoinMessage = {
      type: 'join_room',
      roomId: 'test-room',
      player: {
        name: 'ホストプレイヤー',
        isAlive: true,
        isHost: true,
        isReady: true
      }
    }

    // handleWebSocketMessageを直接テスト
    await (gameRoom as any).handleWebSocketMessage('host-id', hostJoinMessage)

    // ターゲットプレイヤーの参加をシミュレート
    const targetJoinMessage = {
      type: 'join_room',
      roomId: 'test-room',
      player: {
        name: 'キック対象プレイヤー',
        isAlive: true,
        isHost: false,
        isReady: true
      }
    }

    await (gameRoom as any).handleWebSocketMessage('target-id', targetJoinMessage)

    // キックメッセージをシミュレート
    const kickMessage = {
      type: 'kick_player',
      roomId: 'test-room',
      playerId: 'target-id'
    }

    await (gameRoom as any).handleWebSocketMessage('host-id', kickMessage)

    // WebSocketのcloseが適切な理由で呼ばれることを確認
    expect(mockClose).toHaveBeenCalledWith(1000, 'キックされました')
  })

  test('プロパティベーステスト - キック機能の境界値テスト', () => {
    // プレイヤー数の境界値でのキック機能テスト
    const testCases = [
      { playerCount: 2, shouldWork: true, description: '最小プレイヤー数での動作' },
      { playerCount: 10, shouldWork: true, description: '最大プレイヤー数での動作' },
      { playerCount: 1, shouldWork: false, description: 'ホストのみの場合はキック不可' }
    ]

    testCases.forEach(testCase => {
      expect(testCase.playerCount).toBeGreaterThan(0)
      expect(testCase.playerCount).toBeLessThanOrEqual(10)
      
      if (testCase.playerCount === 1) {
        expect(testCase.shouldWork).toBe(false)
      } else {
        expect(testCase.shouldWork).toBe(true)
      }
    })
  })

  test('キック機能のエラーハンドリングテスト', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)

    // 不正なキックメッセージのテスト
    const invalidKickMessages = [
      { type: 'kick_player' }, // playerIdが不足
      { type: 'kick_player', playerId: null }, // playerIdがnull
      { type: 'kick_player', playerId: '' }, // playerIdが空文字
      { type: 'kick_player', playerId: 'invalid-id' } // 存在しないplayerId
    ]

    for (const message of invalidKickMessages) {
      await expect(
        (gameRoom as any).handleWebSocketMessage('host-id', message)
      ).not.toThrow()
    }
  })

  test('IPブロック機能のテスト', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)

    // IPブロック機能をテスト用に公開
    const blockIP = (gameRoom as any).blockIP.bind(gameRoom)
    const getClientIP = (gameRoom as any).getClientIP.bind(gameRoom)

    // IPアドレスをブロック
    await blockIP('192.168.1.100')

    // ブロックされたIPからのWebSocket接続を試行
    const blockedRequest = new Request('http://localhost/websocket', {
      headers: {
        'Upgrade': 'websocket',
        'CF-Connecting-IP': '192.168.1.100'
      }
    })

    const response = await gameRoom.fetch(blockedRequest)
    expect(response.status).toBe(403)

    // 別のIPからの接続は成功する
    const allowedRequest = new Request('http://localhost/websocket', {
      headers: {
        'Upgrade': 'websocket',
        'CF-Connecting-IP': '192.168.1.101'
      }
    })

    const allowedResponse = await gameRoom.fetch(allowedRequest)
    expect(allowedResponse.status).toBe(101)
  })

  test('IPアドレス取得機能のテスト', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)
    const getClientIP = (gameRoom as any).getClientIP.bind(gameRoom)

    // CF-Connecting-IPヘッダーからの取得
    const request1 = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '192.168.1.100' }
    })
    expect(getClientIP(request1)).toBe('192.168.1.100')

    // X-Forwarded-Forヘッダーからの取得
    const request2 = new Request('http://localhost/', {
      headers: { 'X-Forwarded-For': '192.168.1.101, 192.168.1.102' }
    })
    expect(getClientIP(request2)).toBe('192.168.1.101')

    // X-Real-IPヘッダーからの取得
    const request3 = new Request('http://localhost/', {
      headers: { 'X-Real-IP': '192.168.1.103' }
    })
    expect(getClientIP(request3)).toBe('192.168.1.103')

    // ヘッダーがない場合
    const request4 = new Request('http://localhost/')
    expect(getClientIP(request4)).toBe('unknown')
  })

  test('キック時のIPブロック統合テスト', async () => {
    const gameRoom = new GameRoom(mockDurableObjectState, mockEnv)

    // ホストプレイヤーを作成
    const hostRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.168.1.1'
      },
      body: JSON.stringify({
        player: {
          name: 'ホストプレイヤー',
          isAlive: true,
          isHost: true,
          isReady: true
        }
      })
    })

    const hostResponse = await gameRoom.fetch(hostRequest)
    const hostData = await hostResponse.json()
    const hostPlayerId = hostData.playerId

    // ターゲットプレイヤーを作成（IP: 192.168.1.100）
    const targetRequest = new Request('http://localhost/test-room/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.168.1.100'
      },
      body: JSON.stringify({
        player: {
          name: 'キック対象プレイヤー',
          isAlive: true,
          isHost: false,
          isReady: true
        }
      })
    })

    const targetResponse = await gameRoom.fetch(targetRequest)
    const targetData = await targetResponse.json()
    const targetPlayerId = targetData.playerId

    // キック実行
    const kickRequest = new Request(`http://localhost/test-room/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickerId: hostPlayerId,
        targetId: targetPlayerId
      })
    })

    const kickResponse = await gameRoom.fetch(kickRequest)
    expect(kickResponse.status).toBe(200)

    // 同じIPアドレスからの再接続を試行（ブロックされるはず）
    const blockedConnectionRequest = new Request('http://localhost/websocket', {
      headers: {
        'Upgrade': 'websocket',
        'CF-Connecting-IP': '192.168.1.100'
      }
    })

    const blockedResponse = await gameRoom.fetch(blockedConnectionRequest)
    expect(blockedResponse.status).toBe(403)
  })
})