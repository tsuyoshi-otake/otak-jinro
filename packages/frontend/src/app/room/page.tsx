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

interface ChatMessage {
  id: string
  playerId: string
  playerName: string
  content: string
  timestamp: number
  type: string
}

interface GameState {
  id: string
  phase: 'lobby' | 'day' | 'night' | 'voting' | 'ended'
  players: Player[]
  currentDay: number
  timeRemaining: number
  votes?: Vote[]
  chatMessages?: ChatMessage[]
}

export default function RoomPage() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('roomId') || ''
  const playerName = searchParams.get('name') || ''

  // 動的背景色を計算する関数（細かいグラデーション対応）
  const getDynamicBackground = () => {
    if (!gameState) {
      return 'bg-gradient-to-br from-blue-900 via-purple-900 to-violet-800'
    }

    const { phase, timeRemaining } = gameState
    
    // フェーズごとの基本時間設定
    const phaseDurations = {
      lobby: 0,
      day: 90,
      voting: 30,
      night: 30,
      ended: 0
    }
    
    const totalTime = phaseDurations[phase] || 90
    const progress = Math.max(0, Math.min(1, timeRemaining / totalTime))
    
    switch (phase) {
      case 'day':
        // 昼: 10段階の細かいグラデーション変化（視認性向上のため少し暗めに調整）
        if (progress > 0.9) {
          // 90-100%: 早朝の清々しい空（暗めに調整）
          return 'bg-gradient-to-br from-sky-400 via-blue-500 to-cyan-600'
        } else if (progress > 0.8) {
          // 80-90%: 朝の明るい空（暗めに調整）
          return 'bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-700'
        } else if (progress > 0.7) {
          // 70-80%: 午前の青空（暗めに調整）
          return 'bg-gradient-to-br from-blue-500 via-sky-600 to-blue-700'
        } else if (progress > 0.6) {
          // 60-70%: 昼前の空
          return 'bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800'
        } else if (progress > 0.5) {
          // 50-60%: 正午の空
          return 'bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-700'
        } else if (progress > 0.4) {
          // 40-50%: 午後の空
          return 'bg-gradient-to-br from-indigo-600 via-purple-700 to-pink-700'
        } else if (progress > 0.3) {
          // 30-40%: 夕方の空
          return 'bg-gradient-to-br from-purple-600 via-pink-700 to-orange-700'
        } else if (progress > 0.2) {
          // 20-30%: 夕焼け始まり
          return 'bg-gradient-to-br from-pink-600 via-orange-700 to-red-700'
        } else if (progress > 0.1) {
          // 10-20%: 夕焼け本格化
          return 'bg-gradient-to-br from-orange-600 via-red-700 to-pink-800'
        } else {
          // 0-10%: 夕暮れ
          return 'bg-gradient-to-br from-red-700 via-pink-800 to-purple-900'
        }
      
      case 'voting':
        // 投票: 10段階の緊張感グラデーション
        if (progress > 0.9) {
          return 'bg-gradient-to-br from-red-400 via-pink-500 to-purple-600'
        } else if (progress > 0.8) {
          return 'bg-gradient-to-br from-red-500 via-pink-600 to-purple-700'
        } else if (progress > 0.7) {
          return 'bg-gradient-to-br from-red-600 via-pink-700 to-purple-800'
        } else if (progress > 0.6) {
          return 'bg-gradient-to-br from-red-700 via-pink-800 to-purple-900'
        } else if (progress > 0.5) {
          return 'bg-gradient-to-br from-red-800 via-rose-800 to-purple-900'
        } else if (progress > 0.4) {
          return 'bg-gradient-to-br from-red-900 via-rose-900 to-violet-900'
        } else if (progress > 0.3) {
          return 'bg-gradient-to-br from-rose-800 via-red-900 to-violet-900'
        } else if (progress > 0.2) {
          return 'bg-gradient-to-br from-rose-900 via-red-950 to-violet-950'
        } else if (progress > 0.1) {
          return 'bg-gradient-to-br from-red-950 via-rose-950 to-purple-950'
        } else {
          return 'bg-gradient-to-br from-black via-red-950 to-purple-950'
        }
      
      case 'night':
        // 夜: 10段階の夜空グラデーション
        if (progress > 0.9) {
          // 90-100%: 宵の口
          return 'bg-gradient-to-br from-slate-600 via-blue-800 to-indigo-800'
        } else if (progress > 0.8) {
          // 80-90%: 夜の始まり
          return 'bg-gradient-to-br from-slate-700 via-blue-900 to-indigo-900'
        } else if (progress > 0.7) {
          // 70-80%: 夜が深まる
          return 'bg-gradient-to-br from-slate-800 via-blue-900 to-indigo-900'
        } else if (progress > 0.6) {
          // 60-70%: 深夜前
          return 'bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950'
        } else if (progress > 0.5) {
          // 50-60%: 深夜
          return 'bg-gradient-to-br from-gray-900 via-slate-950 to-blue-950'
        } else if (progress > 0.4) {
          // 40-50%: 真夜中
          return 'bg-gradient-to-br from-black via-slate-950 to-blue-950'
        } else if (progress > 0.3) {
          // 30-40%: 夜明け前の静寂
          return 'bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950'
        } else if (progress > 0.2) {
          // 20-30%: 夜明け前
          return 'bg-gradient-to-br from-indigo-950 via-purple-950 to-blue-900'
        } else if (progress > 0.1) {
          // 10-20%: 夜明けの兆し
          return 'bg-gradient-to-br from-indigo-900 via-purple-900 to-blue-800'
        } else {
          // 0-10%: 夜明け直前
          return 'bg-gradient-to-br from-purple-900 via-indigo-800 to-blue-700'
        }
      
      case 'ended':
        // 終了: 落ち着いた色合い
        return 'bg-gradient-to-br from-gray-700 via-slate-800 to-gray-900'
      
      default:
        // ロビー: デフォルト
        return 'bg-gradient-to-br from-blue-900 via-purple-900 to-violet-800'
    }
  }
  
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
          ? `wss://otak-jinro-workers.systemexe-research-and-development.workers.dev/api/rooms/${roomId}/ws`
          : `ws://localhost:8787/api/rooms/${roomId}/ws`
        
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
      <div className={`min-h-screen text-white flex items-center justify-center transition-all duration-1000 ${getDynamicBackground()}`}>
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
      <div className={`min-h-screen text-white flex items-center justify-center transition-all duration-1000 ${getDynamicBackground()}`}>
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
      <div className={`min-h-screen text-white flex items-center justify-center transition-all duration-1000 ${getDynamicBackground()}`}>
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
    <div className={`min-h-screen text-white transition-all duration-1000 ${getDynamicBackground()}`}>
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6 text-center">
          <h1 className="text-4xl font-bold mb-2">otak-jinro</h1>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-300">
            <span>ルーム: {gameState.id}</span>
            <span>プレイヤー: {playerName}</span>
            <span className={`px-2 py-1 rounded ${isConnected ? 'bg-green-600/80 backdrop-blur-sm' : 'bg-red-600/80 backdrop-blur-sm'}`}>
              {isConnected ? '接続中' : '切断'}
            </span>
            <button
              onClick={() => window.location.href = '/'}
              className="px-3 py-1 text-sm bg-red-500/20 backdrop-blur-sm border border-red-400/30 hover:bg-red-500/30 rounded transition-colors"
            >
              退出
            </button>
          </div>
        </div>

        {/* ゲーム状態 */}
        <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-lg shadow-lg p-4 mb-6">
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
                ゲーム開始 ({gameState.players.length}/10)
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* プレイヤーリスト */}
          <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-lg shadow-lg p-4">
            <h3 className="text-lg font-semibold mb-4">プレイヤー ({gameState.players.length})</h3>
            <div className="space-y-2">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-2 rounded ${
                    !player.isAlive ? 'opacity-50' : ''
                  } ${player.name === playerName ? 'bg-blue-600/30 backdrop-blur-sm border border-blue-400/30' : 'bg-white/5 backdrop-blur-sm border border-white/10'}`}
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
          <div className="lg:col-span-2 bg-black/50 backdrop-blur-md border border-white/20 rounded-lg shadow-lg p-4">
            <h3 className="text-lg font-semibold mb-4">チャット</h3>
            <div
              ref={chatContainerRef}
              className="h-[617px] overflow-y-auto mb-4 space-y-2 bg-black/60 backdrop-blur-md border border-white/20 p-3 rounded"
            >
              {(gameState?.chatMessages || []).map((msg, index) => {
                const timestamp = new Date(msg.timestamp);
                const timeStr = timestamp.toLocaleTimeString('ja-JP', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });
                
                return (
                  <div key={index} className="text-sm">
                    <span className="text-gray-400 text-xs mr-2">
                      [{timeStr}]
                    </span>
                    <span className={`font-medium ${
                      isAIPlayer(msg.playerName) ? 'text-purple-400' : 'text-blue-400'
                    }`}>
                      {msg.playerName}:
                    </span>
                    <span className="ml-2">{msg.content}</span>
                  </div>
                );
              })}
            </div>
            
            {gameState.phase !== 'lobby' && gameState.phase !== 'ended' && currentPlayer?.isAlive && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                  placeholder="メッセージを入力..."
                  className="flex-1 bg-black/50 backdrop-blur-md border border-white/30 rounded px-3 py-2 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-lg shadow-lg p-4">
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
                        className="w-full text-left p-2 rounded bg-black/50 backdrop-blur-md border border-white/20 hover:bg-black/60 disabled:bg-green-600/50 transition-colors"
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
                        className="w-full text-left p-2 rounded bg-black/50 backdrop-blur-md border border-white/20 hover:bg-black/60 disabled:bg-green-600/50 transition-colors"
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
              <div className="mb-4 p-3 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded">
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
              <div className="mb-4 p-3 bg-purple-500/20 backdrop-blur-sm border border-purple-400/30 rounded">
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
            <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
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
                className="w-full bg-black/50 backdrop-blur-md border border-white/20 hover:bg-black/60 py-2 rounded transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-white p-4 rounded-lg shadow-lg">
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