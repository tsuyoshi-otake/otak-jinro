'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Modal } from '../../components/ui/modal'
import { getStoredApiKey, setStoredApiKey, validateApiKey, testApiKey, generateAIPersonality, generateAIResponse, determineAIResponse, updateEmotionalState } from '../../lib/openai'
import { Avatar } from '../../lib/avatars'

// AI名前の定数
const AI_NAMES = ['アリス', 'ボブ', 'チャーリー', 'ダイアナ', 'イブ', 'フランク', 'グレース', 'ヘンリー', 'アイビー', 'ジャック', 'ケイト', 'ルーク']

// AIプレイヤーかどうかを判定する関数
const isAIPlayer = (playerName: string) => AI_NAMES.includes(playerName)

interface Player {
  id: string
  name: string
  role?: string
  isAlive: boolean
  isHost: boolean
  isReady: boolean
}

interface Vote {
  voterId: string
  targetId: string
  timestamp: number
}

interface GameState {
  id: string
  phase: 'lobby' | 'day' | 'night' | 'voting' | 'ended'
  players: Player[]
  currentDay: number
  timeRemaining: number
  votes?: Vote[]
}

export default function RoomPage() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('roomId') || ''
  const playerName = searchParams.get('name') || ''
  
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatMessage, setChatMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [isTestingApiKey, setIsTestingApiKey] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [isAddingAI, setIsAddingAI] = useState(false)
  const [websocket, setWebsocket] = useState<WebSocket | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [showRules, setShowRules] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null)
  const [selectedAbilityTarget, setSelectedAbilityTarget] = useState<string | null>(null)
  const [aiPersonalities, setAiPersonalities] = useState<Map<string, any>>(new Map())
  const [showGameEndModal, setShowGameEndModal] = useState(false)
  const [gameResult, setGameResult] = useState<{winner: string, survivors: Player[]} | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [delayedError, setDelayedError] = useState<string | null>(null)

  // パラメータの検証
  useEffect(() => {
    if (!roomId || !playerName) {
      setError('ルームIDまたはプレイヤー名が指定されていません')
      setIsInitializing(false)
      return
    }
  }, [roomId, playerName])

  // WebSocket接続の初期化
  useEffect(() => {
    if (!roomId || !playerName) return

    let timeoutId: NodeJS.Timeout

    const connectWebSocket = () => {
      try {
        const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/api/rooms/${roomId}/ws`
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('WebSocket接続成功')
          setIsConnected(true)
          setError(null)
          setDelayedError(null)
          setIsInitializing(false)
          
          // ルーム参加メッセージを送信
          const joinMessage = {
            type: 'join_room',
            roomId: roomId,
            player: {
              name: playerName,
              isReady: false
            }
          }
          ws.send(JSON.stringify(joinMessage))
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            
            switch (message.type) {
              case 'game_state_update':
                setGameState(message.gameState)
                if (message.gameState.chatMessages) {
                  setChatMessages(message.gameState.chatMessages)
                }
                break
              case 'error':
                setError(message.message)
                break
            }
          } catch (error) {
            console.error('メッセージ解析エラー:', error)
          }
        }

        ws.onclose = () => {
          setIsConnected(false)
          setWebsocket(null)
        }

        ws.onerror = (error) => {
          console.error('WebSocket エラー:', error)
          setIsConnected(false)
          setWebsocket(null)
        }

        setWebsocket(ws)

      } catch (error) {
        console.error('WebSocket接続エラー:', error)
        setError('接続に失敗しました')
        setIsInitializing(false)
      }
    }

    // 500ms遅延でエラー表示
    timeoutId = setTimeout(() => {
      if (!isConnected && !error) {
        setDelayedError('接続に時間がかかっています...')
      }
    }, 500)

    // 100ms遅延で接続開始
    setTimeout(connectWebSocket, 100)

    return () => {
      clearTimeout(timeoutId)
      if (websocket) {
        websocket.close()
      }
    }
  }, [roomId, playerName])

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-300">ルームに接続中...</p>
          {delayedError && (
            <p className="text-yellow-400 mt-2 text-sm">{delayedError}</p>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-300">ゲーム状態を読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg shadow-lg p-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-white mb-2">
              ルーム: {roomId}
            </h1>
            <p className="text-gray-300">
              プレイヤー: {playerName} | 
              フェーズ: {gameState.phase} | 
              参加者: {gameState.players.length}人
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* プレイヤーリスト */}
            <div className="bg-white/5 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-white mb-3">プレイヤー</h2>
              <div className="space-y-2">
                {gameState.players.map((player) => (
                  <div key={player.id} className="flex items-center space-x-3">
                    <Avatar playerName={player.name} size="sm" />
                    <span className={`${player.isAlive ? 'text-white' : 'text-gray-500 line-through'}`}>
                      {player.name}
                      {player.isHost && ' (ホスト)'}
                      {isAIPlayer(player.name) && ' (AI)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* チャット */}
            <div className="lg:col-span-2 bg-white/5 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-white mb-3">チャット</h2>
              <div className="h-64 overflow-y-auto space-y-2 mb-4">
                {chatMessages.map((msg, index) => (
                  <div key={index} className="text-sm">
                    <span className="text-blue-400">{msg.playerName}:</span>
                    <span className="text-white ml-2">{msg.content}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              
              {gameState.phase !== 'ended' && (
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        // チャット送信ロジック
                        if (websocket && chatMessage.trim()) {
                          websocket.send(JSON.stringify({
                            type: 'chat',
                            roomId: roomId,
                            message: {
                              content: chatMessage,
                              type: 'public',
                              playerName: playerName
                            }
                          }))
                          setChatMessage('')
                        }
                      }
                    }}
                    placeholder="メッセージを入力..."
                    className="flex-1 px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      if (websocket && chatMessage.trim()) {
                        websocket.send(JSON.stringify({
                          type: 'chat',
                          roomId: roomId,
                          message: {
                            content: chatMessage,
                            type: 'public',
                            playerName: playerName
                          }
                        }))
                        setChatMessage('')
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                  >
                    送信
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ゲーム操作 */}
          {gameState.phase === 'lobby' && (
            <div className="mt-6 flex justify-center space-x-4">
              <button
                onClick={() => {
                  if (websocket) {
                    websocket.send(JSON.stringify({
                      type: 'start_game',
                      roomId: roomId
                    }))
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md"
              >
                ゲーム開始
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}