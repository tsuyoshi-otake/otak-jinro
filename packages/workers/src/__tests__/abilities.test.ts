import { GameRoom } from '../gameRoom'

describe('GameRoom 特殊能力テスト', () => {
  let mockEnv: any
  let mockDurableObjectState: any
  let gameRoom: GameRoom

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

    gameRoom = new GameRoom(mockDurableObjectState, mockEnv)
  })

  test('占い師の占い能力が正常に動作する', async () => {
    // モックのゲーム状態を設定
    const mockGameRoom = gameRoom as any
    const seerPlayerId = 'seer-player-1'
    const werewolfPlayerId = 'werewolf-player-1'

    mockGameRoom.gameState = {
      id: 'test-room',
      phase: 'night',
      players: [
        { 
          id: seerPlayerId, 
          name: '占い師プレイヤー', 
          role: 'seer', 
          isAlive: true,
          seerResults: []
        },
        { 
          id: werewolfPlayerId, 
          name: '人狼プレイヤー', 
          role: 'werewolf', 
          isAlive: true 
        }
      ],
      currentDay: 1,
      timeRemaining: 180,
      chatMessages: [],
      nightActions: []
    }

    // sendToPlayerメソッドをモック
    const sendToPlayerSpy = jest.spyOn(mockGameRoom, 'sendToPlayer').mockImplementation(() => {})

    // 占い能力を使用
    await mockGameRoom.handleUseAbility(seerPlayerId, {
      type: 'use_ability',
      roomId: 'test-room',
      playerId: seerPlayerId,
      targetId: werewolfPlayerId,
      ability: 'divine'
    })

    // 占い師のseerResultsが設定されていることを確認
    const seerPlayer = mockGameRoom.gameState.players.find((p: any) => p.id === seerPlayerId)
    expect(seerPlayer.seerResults).toBeDefined()
    expect(seerPlayer.seerResults.length).toBe(1)
    expect(seerPlayer.seerResults[0].target).toBe('人狼プレイヤー')
    expect(seerPlayer.seerResults[0].result).toBe('人狼')

    // システムメッセージが送信されていることを確認
    expect(sendToPlayerSpy).toHaveBeenCalledWith(seerPlayerId, expect.objectContaining({
      type: 'system_message',
      message: '占い結果: 人狼プレイヤーは人狼'
    }))
  })

  test('人狼の襲撃能力が正常に動作する', async () => {
    const mockGameRoom = gameRoom as any
    const werewolfPlayerId = 'werewolf-player-1'
    const villagerPlayerId = 'villager-player-1'

    mockGameRoom.gameState = {
      id: 'test-room',
      phase: 'night',
      players: [
        { 
          id: werewolfPlayerId, 
          name: '人狼プレイヤー', 
          role: 'werewolf', 
          isAlive: true 
        },
        { 
          id: villagerPlayerId, 
          name: '村人プレイヤー', 
          role: 'villager', 
          isAlive: true 
        }
      ],
      currentDay: 1,
      timeRemaining: 180,
      chatMessages: [],
      nightActions: []
    }

    const sendToPlayerSpy = jest.spyOn(mockGameRoom, 'sendToPlayer').mockImplementation(() => {})

    // 人狼の襲撃能力を使用
    await mockGameRoom.handleUseAbility(werewolfPlayerId, {
      type: 'use_ability',
      roomId: 'test-room',
      playerId: werewolfPlayerId,
      targetId: villagerPlayerId,
      ability: 'attack'
    })

    // nightActionsに襲撃が記録されていることを確認
    expect(mockGameRoom.gameState.nightActions).toBeDefined()
    expect(mockGameRoom.gameState.nightActions.length).toBe(1)
    expect(mockGameRoom.gameState.nightActions[0].type).toBe('attack')
    expect(mockGameRoom.gameState.nightActions[0].actorId).toBe(werewolfPlayerId)
    expect(mockGameRoom.gameState.nightActions[0].targetId).toBe(villagerPlayerId)

    // 確認メッセージが送信されていることを確認
    expect(sendToPlayerSpy).toHaveBeenCalledWith(werewolfPlayerId, expect.objectContaining({
      type: 'ability_used',
      message: '村人プレイヤーを襲撃対象に選びました'
    }))
  })

  test('狩人の護衛能力が正常に動作する', async () => {
    const mockGameRoom = gameRoom as any
    const hunterPlayerId = 'hunter-player-1'
    const villagerPlayerId = 'villager-player-1'

    mockGameRoom.gameState = {
      id: 'test-room',
      phase: 'night',
      players: [
        { 
          id: hunterPlayerId, 
          name: '狩人プレイヤー', 
          role: 'hunter', 
          isAlive: true 
        },
        { 
          id: villagerPlayerId, 
          name: '村人プレイヤー', 
          role: 'villager', 
          isAlive: true 
        }
      ],
      currentDay: 1,
      timeRemaining: 180,
      chatMessages: [],
      nightActions: []
    }

    const sendToPlayerSpy = jest.spyOn(mockGameRoom, 'sendToPlayer').mockImplementation(() => {})

    // 狩人の護衛能力を使用
    await mockGameRoom.handleUseAbility(hunterPlayerId, {
      type: 'use_ability',
      roomId: 'test-room',
      playerId: hunterPlayerId,
      targetId: villagerPlayerId,
      ability: 'guard'
    })

    // nightActionsに護衛が記録されていることを確認
    expect(mockGameRoom.gameState.nightActions).toBeDefined()
    expect(mockGameRoom.gameState.nightActions.length).toBe(1)
    expect(mockGameRoom.gameState.nightActions[0].type).toBe('guard')
    expect(mockGameRoom.gameState.nightActions[0].actorId).toBe(hunterPlayerId)
    expect(mockGameRoom.gameState.nightActions[0].targetId).toBe(villagerPlayerId)

    // 確認メッセージが送信されていることを確認
    expect(sendToPlayerSpy).toHaveBeenCalledWith(hunterPlayerId, expect.objectContaining({
      type: 'ability_used',
      message: '村人プレイヤーを護衛しました'
    }))
  })

  test('霊媒師の霊視能力が正常に動作する', async () => {
    const mockGameRoom = gameRoom as any
    const mediumPlayerId = 'medium-player-1'

    mockGameRoom.gameState = {
      id: 'test-room',
      phase: 'night',
      players: [
        { 
          id: mediumPlayerId, 
          name: '霊媒師プレイヤー', 
          role: 'medium', 
          isAlive: true,
          mediumResults: []
        }
      ],
      currentDay: 2,
      timeRemaining: 180,
      chatMessages: [],
      lastExecuted: {
        id: 'executed-player',
        name: '処刑された人狼',
        role: 'werewolf'
      }
    }

    const sendToPlayerSpy = jest.spyOn(mockGameRoom, 'sendToPlayer').mockImplementation(() => {})

    // 霊媒師の霊視能力を使用
    await mockGameRoom.handleUseAbility(mediumPlayerId, {
      type: 'use_ability',
      roomId: 'test-room',
      playerId: mediumPlayerId,
      targetId: mediumPlayerId,
      ability: 'divine'
    })

    // 霊媒師のmediumResultsが設定されていることを確認
    const mediumPlayer = mockGameRoom.gameState.players.find((p: any) => p.id === mediumPlayerId)
    expect(mediumPlayer.mediumResults).toBeDefined()
    expect(mediumPlayer.mediumResults.length).toBe(1)
    expect(mediumPlayer.mediumResults[0].target).toBe('処刑された人狼')
    expect(mediumPlayer.mediumResults[0].result).toBe('人狼')

    // システムメッセージが送信されていることを確認
    expect(sendToPlayerSpy).toHaveBeenCalledWith(mediumPlayerId, expect.objectContaining({
      type: 'system_message',
      message: '霊媒結果: 処刑された人狼は人狼'
    }))
  })

  test('昼フェーズでは特殊能力が使用できない', async () => {
    const mockGameRoom = gameRoom as any
    const seerPlayerId = 'seer-player-1'

    mockGameRoom.gameState = {
      id: 'test-room',
      phase: 'day', // 昼フェーズ
      players: [
        { 
          id: seerPlayerId, 
          name: '占い師プレイヤー', 
          role: 'seer', 
          isAlive: true 
        }
      ],
      currentDay: 1,
      timeRemaining: 180,
      chatMessages: []
    }

    const sendToPlayerSpy = jest.spyOn(mockGameRoom, 'sendToPlayer').mockImplementation(() => {})

    // 昼フェーズで占い能力を使用しようとする
    await mockGameRoom.handleUseAbility(seerPlayerId, {
      type: 'use_ability',
      roomId: 'test-room',
      playerId: seerPlayerId,
      targetId: 'target-player',
      ability: 'divine'
    })

    // エラーメッセージが送信されていることを確認
    expect(sendToPlayerSpy).toHaveBeenCalledWith(seerPlayerId, expect.objectContaining({
      type: 'error',
      message: expect.stringContaining('能力を使用できません')
    }))
  })

  test('死んでいるプレイヤーは特殊能力を使用できない', async () => {
    const mockGameRoom = gameRoom as any
    const seerPlayerId = 'seer-player-1'

    mockGameRoom.gameState = {
      id: 'test-room',
      phase: 'night',
      players: [
        { 
          id: seerPlayerId, 
          name: '占い師プレイヤー', 
          role: 'seer', 
          isAlive: false // 死んでいる
        }
      ],
      currentDay: 1,
      timeRemaining: 180,
      chatMessages: []
    }

    const sendToPlayerSpy = jest.spyOn(mockGameRoom, 'sendToPlayer').mockImplementation(() => {})

    // 死んだプレイヤーが能力を使用しようとする
    await mockGameRoom.handleUseAbility(seerPlayerId, {
      type: 'use_ability',
      roomId: 'test-room',
      playerId: seerPlayerId,
      targetId: 'target-player',
      ability: 'divine'
    })

    // エラーメッセージが送信されていることを確認
    expect(sendToPlayerSpy).toHaveBeenCalledWith(seerPlayerId, expect.objectContaining({
      type: 'error',
      message: expect.stringContaining('能力を使用できません')
    }))
  })
})