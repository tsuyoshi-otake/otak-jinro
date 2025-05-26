'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Avatar } from '../../lib/avatars'

// AI名前の定数（表示用）
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
  const [isInitializing, setIsInitializing] = useState(true)
  const [delayedError, setDelayedError] = useState<string | null>(null)
  const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null)
  const [selectedAbilityTarget, setSelectedAbilityTarget] = useState<string | null>(null)
  const [divineResult, setDivineResult] = useState<string | null>(null)
  const [mediumResult, setMediumResult] = useState<string | null>(null)
  const [gameEndResult, setGameEndResult] = useState<any>(null)
  
  const ws = useRef<WebSocket | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // パラメータ検証
  useEffect(() => {
    if (!roomId || !playerName) {
      setError('ルームIDまたはプレイヤー名が指定されていません')
      setIsInitializing(false)
      return
    }

    // 遅延エラー処理
    const delayedErrorTimer = setTimeout(() => {
      if (isInitializing && !isConnected) {
        setDelayedError('接続に時間がかかっています。ページを再読み込みしてください。')
      }
    }, 500)

    return () => clearTimeout(delayedErrorTimer)
  }, [roomId, playerName, isInitializing, isConnected])

  // WebSocket接続
  useEffect(() => {
    if (!roomId || !playerName) return

    const connectWebSocket = () => {
      try {
        const wsUrl = process.env.NODE_ENV === 'production' 
          ? 'wss://otak-jinro-workers.tsuyoshi-otake.workers.dev/websocket'
          : 'ws://localhost:8787/websocket'
        
        ws.current = new WebSocket(wsUrl)

        ws.current.onopen = () => {
          console.log('WebSocket接続成功')
          setIsConnected(true)
          setError(null)
          setDelayedError(null)
          setIsInitializing(false)
          
          // ルーム参加
          ws.current?.send(JSON.stringify({
            type: 'join_room',
            roomId,
            player: {
              name: playerName,
              isAlive: true,
              isHost: false,
              isReady: true
            }
          }))
        }

        ws.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('受信メッセージ:', message)

            switch (message.type) {
              case 'game_state_update':
                setGameState(message.gameState)
                break
              case 'chat':
                setChatMessages(prev => [...prev, message.message])
                break
              case 'divine_result':
                setDivineResult(message.message)
                break
              case 'medium_result':
                setMediumResult(message.message)
                break
              case 'game_ended':
                setGameEndResult(message.result)
                break
              case 'error':
                setError(message.message)
                break
            }
          } catch (err) {
            console.error('メッセージ解析エラー:', err)
          }
        }

        ws.current.onclose = () => {
          console.log('WebSocket接続終了')
          setIsConnected(false)
          setIsInitializing(false)
          
          // 再接続試行
          setTimeout(() => {
            if (!isConnected) {
              connectWebSocket()
            }
          }, 3000)
        }

        ws.current.onerror = (error) => {
          console.error('WebSocket エラー:', error)
          setError('接続エラーが発生しました')
          setIsInitializing(false)
        }
      } catch (err) {
        console.error('WebSocket接続エラー:', err)
        setError('WebSocket接続に失敗しました')
        setIsInitializing(false)
      }
    }

    // 100ms遅延後に接続開始
    const timer = setTimeout(connectWebSocket, 100)
    return () => clearTimeout(timer)
  }, [roomId, playerName])

  // チャット自動スクロール
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  // タイマー更新
  useEffect(() => {
    if (!gameState || gameState.phase === 'lobby' || gameState.phase === 'ended') return

    const timer = setInterval(() => {
      setGameState(prev => {
        if (!prev || prev.timeRemaining <= 0) return prev
        return {
          ...prev,
          timeRemaining: Math.max(0, prev.timeRemaining - 1)
        }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [gameState?.phase])

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    }
  }

  const addAIPlayer = () => {
    if (ws.current && gameState) {
      sendMessage({
        type: 'add_ai_player',
        roomId: gameState.id
      })
    }
  }

  const startGame = () => {
    if (ws.current && gameState) {
      sendMessage({
        type: 'start_game',
        roomId: gameState.id
      })
    }
  }

  const handleChat = () => {
    if (!chatMessage.trim() || !ws.current || !gameState) return

    sendMessage({
      type: 'chat',
      roomId: gameState.id,
      message: {
        playerId: gameState.players.find(p => p.name === playerName)?.id || '',
        playerName,
        content: chatMessage.trim(),
        type: 'public'
      }
    })

    setChatMessage('')
  }

  const handleVote = (targetId: string) => {
    if (!ws.current || !gameState) return

    const playerId = gameState.players.find(p => p.name === playerName)?.id
    if (!playerId) return

    sendMessage({
      type: 'vote',
      roomId: gameState.id,
      vote: {
        voterId: playerId,
        targetId
      }
    })

    setSelectedVoteTarget(targetId)
  }

  const handleAbility = (targetId: string) => {
    if (!ws.current || !gameState) return

    const playerId = gameState.players.find(p => p.name === playerName)?.id
    if (!playerId) return

    sendMessage({
      type: 'use_ability',
      roomId: gameState.id,
      playerId,
      targetId
    })

    setSelectedAbilityTarget(targetId)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getPhaseDisplay = (phase: string) => {
    switch (phase) {
      case 'lobby': return 'ロビー'
      case 'day': return '昼の議論'
      case 'voting': return '投票時間'
      case 'night': return '夜時間'
      case 'ended': return 'ゲーム終了'
      default: return phase
    }
  }

  const getCurrentPlayer = () => {
    return gameState?.players.find(p => p.name === playerName)
  }

  const canVote = () => {
    const currentPlayer = getCurrentPlayer()
    return gameState?.phase === 'voting' && 
           currentPlayer?.isAlive && 
           !gameState.votes?.some(v => v.voterId === currentPlayer.id)
  }

  const canUseAbility = () => {
    const currentPlayer = getCurrentPlayer()
    return gameState?.phase === 'night' && 
           currentPlayer?.isAlive && 
           (currentPlayer.role === 'werewolf' || currentPlayer.role === 'seer' || currentPlayer.role === 'hunter')
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg">ルームに接続中...</p>
          {delayedError && (
            <p className="text-red-400 mt-2">{delayedError}</p>
          )}
        </div>
      </div>
    )
  }

  if (error && !gameState) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
          >
            再読み込み
          </button>
        </div>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg">ゲーム状態を読み込み中...</p>
        </div>
      </div>
    )
  }

  const currentPlayer = getCurrentPlayer()
  const isHost = currentPlayer?.isHost || false

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">人狼ゲーム</h1>
          <div className="flex items-center gap-4 text-sm text-gray-300">
            <span>ルーム: {gameState.id}</span>
            <span>プレイヤー: {playerName}</span>
            <span className={`px-2 py-1 rounded ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
              {isConnected ? '接続中' : '切断'}
            </span>
          </div>
        </div>

        {/* ゲーム状態 */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">{getPhaseDisplay(gameState.phase)}</h2>
              {gameState.phase !== 'lobby' && gameState.phase !== 'ended' && (
                <p className="text-gray-300">
                  {gameState.currentDay}日目 - 残り時間: {formatTime(gameState.timeRemaining)}
                </p>
              )}
            </div>
            {currentPlayer?.role && (
              <div className="text-right">
                <p className="text-sm text-gray-300">あなたの役職</p>
                <p className="text-lg font-semibold text-blue-400">{currentPlayer.role}</p>
              </div>
            )}
          </div>

          {/* ロビー時のコントロール */}
          {gameState.phase === 'lobby' && isHost && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={addAIPlayer}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm"
              >
                AI追加
              </button>
              <button
                onClick={startGame}
                disabled={gameState.players.length < 4}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded text-sm"
              >
                ゲーム開始 ({gameState.players.length}/20)
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* プレイヤーリスト */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">プレイヤー ({gameState.players.length})</h3>
            <div className="space-y-2">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-2 rounded ${
                    !player.isAlive ? 'opacity-50' : ''
                  } ${player.name === playerName ? 'bg-blue-900' : 'bg-gray-700'}`}
                >
                  <Avatar playerName={player.name} size="sm" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{player.name}</span>
                      {player.isHost && <span className="text-xs bg-yellow-600 px-1 rounded">HOST</span>}
                      {isAIPlayer(player.name) && <span className="text-xs bg-purple-600 px-1 rounded">AI</span>}
                    </div>
                    {!player.isAlive && <span className="text-xs text-red-400">死亡</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* チャット */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">チャット</h3>
            <div
              ref={chatContainerRef}
              className="h-64 overflow-y-auto mb-4 space-y-2 bg-gray-900 p-3 rounded"
            >
              {chatMessages.map((msg, index) => (
                <div key={index} className="text-sm">
                  <span className={`font-medium ${
                    isAIPlayer(msg.playerName) ? 'text-purple-400' : 'text-blue-400'
                  }`}>
                    {msg.playerName}:
                  </span>
                  <span className="ml-2">{msg.content}</span>
                </div>
              ))}
            </div>
            
            {gameState.phase !== 'lobby' && gameState.phase !== 'ended' && currentPlayer?.isAlive && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                  placeholder="メッセージを入力..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
                <button
                  onClick={handleChat}
                  disabled={!chatMessage.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded"
                >
                  送信
                </button>
              </div>
            )}
          </div>

          {/* アクション */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">アクション</h3>
            
            {/* 投票 */}
            {canVote() && (
              <div className="mb-4">
                <h4 className="font-medium mb-2">投票</h4>
                <div className="space-y-1">
                  {gameState.players
                    .filter(p => p.isAlive && p.id !== currentPlayer?.id)
                    .map(player => (
                      <button
                        key={player.id}
                        onClick={() => handleVote(player.id)}
                        disabled={selectedVoteTarget === player.id}
                        className="w-full text-left p-2 rounded bg-gray-700 hover:bg-gray-600 disabled:bg-green-700"
                      >
                        {player.name} {selectedVoteTarget === player.id && '✓'}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* 能力使用 */}
            {canUseAbility() && (
              <div className="mb-4">
                <h4 className="font-medium mb-2">能力使用</h4>
                <div className="space-y-1">
                  {gameState.players
                    .filter(p => {
                      if (currentPlayer?.role === 'werewolf') {
                        return p.isAlive && p.id !== currentPlayer?.id && p.role !== 'werewolf'
                      }
                      return p.isAlive && p.id !== currentPlayer?.id
                    })
                    .map(player => (
                      <button
                        key={player.id}
                        onClick={() => handleAbility(player.id)}
                        disabled={selectedAbilityTarget === player.id}
                        className="w-full text-left p-2 rounded bg-gray-700 hover:bg-gray-600 disabled:bg-green-700"
                      >
                        {player.name} {selectedAbilityTarget === player.id && '✓'}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* 投票結果 */}
            {gameState.votes && gameState.votes.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium mb-2">投票状況</h4>
                <div className="text-sm space-y-1">
                  {Object.entries(
                    gameState.votes.reduce((acc: any, vote) => {
                      const target = gameState.players.find(p => p.id === vote.targetId)
                      if (target) {
                        acc[target.name] = (acc[target.name] || 0) + 1
                      }
                      return acc
                    }, {})
                  ).map(([name, count]) => (
                    <div key={name} className="flex justify-between">
                      <span>{name}</span>
                      <span>{count as number}票</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 結果表示 */}
            {divineResult && (
              <div className="mb-4 p-3 bg-blue-900 rounded">
                <h4 className="font-medium mb-1">占い結果</h4>
                <p className="text-sm">{divineResult}</p>
                <button
                  onClick={() => setDivineResult(null)}
                  className="text-xs text-blue-300 mt-1"
                >
                  閉じる
                </button>
              </div>
            )}

            {mediumResult && (
              <div className="mb-4 p-3 bg-purple-900 rounded">
                <h4 className="font-medium mb-1">霊媒結果</h4>
                <p className="text-sm">{mediumResult}</p>
                <button
                  onClick={() => setMediumResult(null)}
                  className="text-xs text-purple-300 mt-1"
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ゲーム終了モーダル */}
        {gameEndResult && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-2xl font-bold mb-4">ゲーム終了</h2>
              <div className="mb-4">
                <p className="text-lg mb-2">
                  勝者: <span className="font-semibold text-green-400">{gameEndResult.winner}</span>
                </p>
                {gameEndResult.reason && (
                  <p className="text-sm text-gray-300">{gameEndResult.reason}</p>
                )}
              </div>
              <button
                onClick={() => setGameEndResult(null)}
                className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded"
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg">
            <p>{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-200 mt-1"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  )
}