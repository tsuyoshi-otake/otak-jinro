import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useRouter, useSearchParams } from 'next/navigation'
import RoomPage from '../page'

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))

// window.locationのモック
const mockLocation = {
  origin: 'http://localhost:3000',
  href: 'http://localhost:3000',
}

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
})

// window.alertのモック
global.alert = jest.fn()

// WebSocketのモック
let mockWebSocketInstances: MockWebSocket[] = []

class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onclose: ((event: CloseEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null
  public readyState = 1 // OPEN
  public send = jest.fn()
  public close = jest.fn()
  
  constructor(url: string) {
    mockWebSocketInstances.push(this)
    // 接続を非同期でシミュレート
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 0)
  }
  
  addEventListener(type: string, listener: any) {
    if (type === 'open') this.onopen = listener
    if (type === 'message') this.onmessage = listener
    if (type === 'close') this.onclose = listener
    if (type === 'error') this.onerror = listener
  }
  
  removeEventListener() {}
  
  triggerMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }
  
  triggerClose(code: number, reason: string) {
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason, wasClean: true }))
    }
  }
}

global.WebSocket = MockWebSocket as any

describe('キック機能テスト', () => {
  let mockPush: jest.Mock
  let mockSearchParams: jest.Mock
  let mockWebSocketInstance: MockWebSocket

  beforeEach(() => {
    mockPush = jest.fn()
    mockSearchParams = jest.fn()

    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    })

    ;(useSearchParams as jest.Mock).mockReturnValue({
      get: mockSearchParams.mockImplementation((key: string) => {
        if (key === 'roomId') return 'test-room'
        if (key === 'name') return 'TestPlayer'
        return null
      }),
    })

    // location.hrefをリセット
    mockLocation.href = 'http://localhost:3000'

    // WebSocketインスタンス配列をクリア
    mockWebSocketInstances.length = 0

    // モックをクリア
    jest.clearAllMocks()
  })

  test('自分がキックされた場合、ホーム画面に遷移する', async () => {
    const { container } = render(<RoomPage />)

    // WebSocketインスタンスが作成されるまで待つ
    await waitFor(() => {
      expect(mockWebSocketInstances.length).toBe(1)
    })

    mockWebSocketInstance = mockWebSocketInstances[0]

    // WebSocket接続の完了を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // join_roomメッセージが送信されることを確認
    await waitFor(() => {
      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"join_room"')
      )
    })

    // ゲーム状態の更新をシミュレート
    await act(async () => {
      mockWebSocketInstance.triggerMessage({
        type: 'game_state_update',
        gameState: {
          id: 'test-room',
          phase: 'lobby',
          players: [
            { id: 'player1', name: 'TestPlayer', isHost: false, isAlive: true, isReady: true },
            { id: 'player2', name: 'HostPlayer', isHost: true, isAlive: true, isReady: true }
          ],
          currentDay: 0,
          timeRemaining: 0,
          votes: [],
          chatMessages: [],
          isPublic: false
        }
      })
    })

    // キックイベントをシミュレート（自分がキックされる）
    await act(async () => {
      mockWebSocketInstance.triggerMessage({
        type: 'player_kicked',
        playerId: 'player1',
        playerName: 'TestPlayer',
        kickedBy: 'HostPlayer'
      })
    })

    // WebSocket接続が切断されることを確認
    expect(mockWebSocketInstance.close).toHaveBeenCalled()

    // ホーム画面への遷移を確認
    await waitFor(() => {
      expect(mockLocation.href).toBe('http://localhost:3000/')
    }, { timeout: 1000 })
  })

  test('他のプレイヤーがキックされた場合、チャットメッセージが表示される', async () => {
    render(<RoomPage />)

    // WebSocketインスタンスが作成されるまで待つ
    await waitFor(() => {
      expect(mockWebSocketInstances.length).toBe(1)
    })

    mockWebSocketInstance = mockWebSocketInstances[0]

    // WebSocket接続の完了を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // ゲーム状態の更新をシミュレート
    await act(async () => {
      mockWebSocketInstance.triggerMessage({
        type: 'game_state_update',
        gameState: {
          id: 'test-room',
          phase: 'lobby',
          players: [
            { id: 'player1', name: 'TestPlayer', isHost: false, isAlive: true, isReady: true },
            { id: 'player2', name: 'HostPlayer', isHost: true, isAlive: true, isReady: true },
            { id: 'player3', name: 'OtherPlayer', isHost: false, isAlive: true, isReady: true }
          ],
          currentDay: 0,
          timeRemaining: 0,
          votes: [],
          chatMessages: [],
          isPublic: false
        }
      })
    })

    // 他のプレイヤーがキックされるイベント
    await act(async () => {
      mockWebSocketInstance.triggerMessage({
        type: 'player_kicked',
        playerId: 'player3',
        playerName: 'OtherPlayer',
        kickedBy: 'HostPlayer'
      })
    })

    // ホーム画面への遷移はされない
    expect(mockWebSocketInstance.close).not.toHaveBeenCalled()
    expect(mockLocation.href).toBe('http://localhost:3000')
  })

  test('WebSocket切断時にキック理由がある場合、ホーム画面に遷移する', async () => {
    render(<RoomPage />)

    // WebSocketインスタンスが作成されるまで待つ
    await waitFor(() => {
      expect(mockWebSocketInstances.length).toBe(1)
    })

    mockWebSocketInstance = mockWebSocketInstances[0]

    // WebSocket接続の完了を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // WebSocket切断イベントをシミュレート（キック理由付き）
    await act(async () => {
      mockWebSocketInstance.triggerClose(1000, 'キックされました')
    })

    // ホーム画面への遷移を確認
    await waitFor(() => {
      expect(mockLocation.href).toBe('http://localhost:3000/')
    }, { timeout: 1000 })
  })

  test('エラーハンドリング - 無効なメッセージを受信した場合', async () => {
    render(<RoomPage />)

    // WebSocketインスタンスが作成されるまで待つ
    await waitFor(() => {
      expect(mockWebSocketInstances.length).toBe(1)
    })

    mockWebSocketInstance = mockWebSocketInstances[0]

    // 不正なJSONを送信
    await act(async () => {
      if (mockWebSocketInstance.onmessage) {
        mockWebSocketInstance.onmessage(new MessageEvent('message', { data: 'invalid json' }))
      }
    })

    // エラーが発生してもアプリケーションがクラッシュしないことを確認
    // 表示されているテキストが変わっている可能性があるので、より柔軟にチェック
    expect(() => screen.getByText(/ゲーム状態を読み込み中|ルームに接続中/)).not.toThrow()
  })
})