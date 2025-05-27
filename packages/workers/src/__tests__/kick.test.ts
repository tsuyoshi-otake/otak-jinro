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
})