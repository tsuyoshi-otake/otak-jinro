import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useParams, useSearchParams } from 'next/navigation'
import RoomPage from './page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useSearchParams: jest.fn(),
}))

// Mock OpenAI
jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  })),
}))

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock as any

// Mock WebSocket
class MockWebSocket {
  readyState: number = 0 // CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 100)
  }

  send(data: string) {
    console.log('MockWebSocket send:', data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }
}

// @ts-ignore
global.WebSocket = jest.fn().mockImplementation((url: string) => new MockWebSocket(url))

describe('RoomPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useParams as jest.Mock).mockReturnValue({ roomId: 'ABC123' })
    ;(useSearchParams as jest.Mock).mockReturnValue({
      get: (key: string) => key === 'name' ? 'TestPlayer' : null
    })
  })

  it('初期化中はローディング表示を表示する', () => {
    render(<RoomPage />)
    
    // ローディング表示が表示されることを確認
    expect(screen.getByText('ルームに接続中...')).toBeInTheDocument()
    
    // エラーメッセージが表示されないことを確認
    expect(screen.queryByText('エラー')).not.toBeInTheDocument()
  })

  it('初期化後にWebSocket接続を開始する', async () => {
    render(<RoomPage />)
    
    // 初期化が完了するまで待つ
    await waitFor(() => {
      expect(screen.queryByText('ルームに接続中...')).not.toBeInTheDocument()
    }, { timeout: 200 })
    
    // WebSocket接続が作成されることを確認
    expect(global.WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('/api/rooms/ABC123/ws')
    )
  })

  it('パラメータが不正な場合、遅延してエラーを表示する', async () => {
    ;(useParams as jest.Mock).mockReturnValue({ roomId: '' })
    
    render(<RoomPage />)
    
    // 初期化中はエラーが表示されない
    expect(screen.queryByText('エラー')).not.toBeInTheDocument()
    
    // 初期化後、エラーが表示されるまで待つ
    await waitFor(() => {
      expect(screen.getByText('エラー')).toBeInTheDocument()
      expect(screen.getByText('ルームIDまたはプレイヤー名が不正です')).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it('WebSocket接続エラーも遅延して表示する', async () => {
    // WebSocketエラーをシミュレート
    class ErrorWebSocket extends MockWebSocket {
      constructor(url: string) {
        super(url)
        setTimeout(() => {
          if (this.onerror) {
            this.onerror(new Event('error'))
          }
        }, 150)
      }
    }
    
    // @ts-ignore
    global.WebSocket = jest.fn().mockImplementation((url: string) => new ErrorWebSocket(url))
    
    render(<RoomPage />)
    
    // 初期化が完了するまで待つ
    await waitFor(() => {
      expect(screen.queryByText('ルームに接続中...')).not.toBeInTheDocument()
    })
    
    // エラーが表示されるまで待つ
    await waitFor(() => {
      expect(screen.getByText('接続エラーが発生しました')).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it('WebSocket接続成功時はエラーをクリアする', async () => {
    render(<RoomPage />)
    
    // 初期化とWebSocket接続が完了するまで待つ
    await waitFor(() => {
      expect(screen.queryByText('ルームに接続中...')).not.toBeInTheDocument()
    })
    
    // エラーが表示されないことを確認
    expect(screen.queryByText('エラー')).not.toBeInTheDocument()
    
    // ゲーム画面の要素が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('ルーム: ABC123')).toBeInTheDocument()
      expect(screen.getByText('プレイヤー: TestPlayer')).toBeInTheDocument()
    })
  })
})