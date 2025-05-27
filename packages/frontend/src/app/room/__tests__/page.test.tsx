import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter, useSearchParams } from 'next/navigation'
import RoomPage from '../page'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))

// Mock WebSocket
const MockWebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  readyState: 1,
}))

Object.assign(MockWebSocket, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
})

;(global as any).WebSocket = MockWebSocket

describe('RoomPage キック機能テスト', () => {
  const mockPush = jest.fn()
  const mockSearchParams = {
    get: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush
    })
    ;(useSearchParams as jest.Mock).mockReturnValue(mockSearchParams)
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'roomId') return 'test-room-123'
      if (key === 'name') return 'テストプレイヤー'
      return null
    })
    
    // alert のモック
    window.alert = jest.fn()
  })

  test('自分がキックされた時にホーム画面に遷移する', async () => {
    const { container } = render(<RoomPage />)
    
    // WebSocket接続のシミュレーション
    const mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      onopen: null as any,
      onmessage: null as any,
      onclose: null as any,
      onerror: null as any,
      readyState: 1,
    }
    
    // WebSocketコンストラクタのモック
    MockWebSocket.mockImplementation(() => mockWebSocket)
    
    // コンポーネントが再レンダリングされるのを待つ
    await waitFor(() => {
      expect(mockWebSocket.onmessage).toBeTruthy()
    })
    
    // ゲーム状態をシミュレート（プレイヤーが存在する状態）
    const gameStateMessage = {
      type: 'game_state_update',
      gameState: {
        id: 'test-room-123',
        phase: 'lobby',
        players: [
          { id: 'player-1', name: 'テストプレイヤー', isHost: false, isAlive: true, role: 'villager' },
          { id: 'player-2', name: '他のプレイヤー', isHost: true, isAlive: true, role: 'villager' }
        ],
        currentDay: 1,
        timeRemaining: 300,
        chatMessages: []
      }
    }
    
    // ゲーム状態更新メッセージを送信
    mockWebSocket.onmessage({
      data: JSON.stringify(gameStateMessage)
    })
    
    // プレイヤーキックメッセージを送信（自分がキックされた場合）
    const kickMessage = {
      type: 'player_kicked',
      playerId: 'player-1',
      playerName: 'テストプレイヤー',
      kickedBy: '他のプレイヤー'
    }
    
    mockWebSocket.onmessage({
      data: JSON.stringify(kickMessage)
    })
    
    // ホーム画面に遷移することを確認
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('あなたはルームからキックされました。')
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  test('他のプレイヤーがキックされた時は遷移しない', async () => {
    const { container } = render(<RoomPage />)
    
    const mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      onopen: null as any,
      onmessage: null as any,
      onclose: null as any,
      onerror: null as any,
      readyState: 1,
    }
    
    MockWebSocket.mockImplementation(() => mockWebSocket)
    
    await waitFor(() => {
      expect(mockWebSocket.onmessage).toBeTruthy()
    })
    
    // ゲーム状態をシミュレート
    const gameStateMessage = {
      type: 'game_state_update',
      gameState: {
        id: 'test-room-123',
        phase: 'lobby',
        players: [
          { id: 'player-1', name: 'テストプレイヤー', isHost: false, isAlive: true, role: 'villager' },
          { id: 'player-2', name: '他のプレイヤー', isHost: true, isAlive: true, role: 'villager' }
        ],
        currentDay: 1,
        timeRemaining: 300,
        chatMessages: []
      }
    }
    
    mockWebSocket.onmessage({
      data: JSON.stringify(gameStateMessage)
    })
    
    // 他のプレイヤーがキックされた場合
    const kickMessage = {
      type: 'player_kicked',
      playerId: 'player-2',
      playerName: '他のプレイヤー',
      kickedBy: 'ホストプレイヤー'
    }
    
    mockWebSocket.onmessage({
      data: JSON.stringify(kickMessage)
    })
    
    // ホーム画面に遷移しないことを確認
    await waitFor(() => {
      expect(window.alert).not.toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()
    }, { timeout: 1000 })
  })

  test('WebSocket切断時のキック検知', async () => {
    const { container } = render(<RoomPage />)
    
    const mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      onopen: null as any,
      onmessage: null as any,
      onclose: null as any,
      onerror: null as any,
      readyState: 1,
    }
    
    MockWebSocket.mockImplementation(() => mockWebSocket)
    
    await waitFor(() => {
      expect(mockWebSocket.onclose).toBeTruthy()
    })
    
    // キックによる切断をシミュレート
    mockWebSocket.onclose({
      code: 1000,
      reason: 'キックされました',
      wasClean: true
    })
    
    // ホーム画面に遷移することを確認
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('あなたはルームからキックされました。')
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  test('通常の切断時はキック処理しない', async () => {
    const { container } = render(<RoomPage />)
    
    const mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      onopen: null as any,
      onmessage: null as any,
      onclose: null as any,
      onerror: null as any,
      readyState: 1,
    }
    
    MockWebSocket.mockImplementation(() => mockWebSocket)
    
    await waitFor(() => {
      expect(mockWebSocket.onclose).toBeTruthy()
    })
    
    // 通常の切断をシミュレート
    mockWebSocket.onclose({
      code: 1000,
      reason: 'Normal closure',
      wasClean: true
    })
    
    // ホーム画面に遷移しないことを確認
    await waitFor(() => {
      expect(window.alert).not.toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()
    }, { timeout: 1000 })
  })
})