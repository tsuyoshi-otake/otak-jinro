'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Avatar } from '../../lib/avatars'

// AI名前の定数（表示用）
const AI_NAMES = ['アリス', 'ボブ', 'チャーリー', 'ダイアナ', 'イブ', 'フランク', 'グレース', 'ヘンリー', 'アイビー', 'ジャック', 'ケイト', 'ルーク']

// AIプレイヤーかどうかを判定する関数
const isAIPlayer = (playerName: string) => AI_NAMES.includes(playerName)

// 役職を日本語に変換する関数
const getRoleDisplayName = (role: string) => {
  switch (role) {
    case 'villager': return '村人'
    case 'werewolf': return '人狼'
    case 'seer': return '占い師'
    case 'medium': return '霊媒師'
    case 'hunter': return 'ハンター'
    case 'madman': return '狂人'
    default: return role
  }
}

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
  const router = useRouter()
  const roomId = searchParams.get('roomId') || ''
  const playerName = searchParams.get('name') || ''

  // ランディングページと同じ背景を使用（layout.tsxの背景を継承）
  const getSimpleBackground = () => {
    return 'bg-transparent'
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
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [resultModal, setResultModal] = useState<{
    type: 'vote' | 'ability' | 'execution' | 'death',
    title: string,
    content: string,
    show: boolean
  }>({ type: 'vote', title: '', content: '', show: false })
  const [lastSystemMessageId, setLastSystemMessageId] = useState<string | null>(null)

  // 結果モーダルを表示する関数
  const showResultModal = (type: 'vote' | 'ability' | 'execution' | 'death', title: string, content: string) => {
    setResultModal({ type, title, content, show: true })
    
    // 3秒後に自動で閉じる
    setTimeout(() => {
      setResultModal(prev => ({ ...prev, show: false }))
    }, 3000)
  }

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
                
                // チャットメッセージから結果を検出してモーダル表示（重複防止）
                if (message.gameState.chatMessages) {
                  const latestMessage = message.gameState.chatMessages[message.gameState.chatMessages.length - 1]
                  if (latestMessage && latestMessage.playerName === 'System' && latestMessage.id !== lastSystemMessageId) {
                    setLastSystemMessageId(latestMessage.id)
                    
                    if (latestMessage.content.includes('が処刑されました')) {
                      showResultModal('execution', '処刑結果', latestMessage.content)
                    } else if (latestMessage.content.includes('投票が同数')) {
                      showResultModal('vote', '投票結果', latestMessage.content)
                    } else if (latestMessage.content.includes('が襲撃されました') || latestMessage.content.includes('が死亡しました')) {
                      showResultModal('death', '夜の結果', latestMessage.content)
                    }
                  }
                }
                break
              case 'chat':
                // AIメッセージの場合は gameState の更新を待つ
                if (!message.isAI) {
                  setChatMessages(prev => [...prev, message.message])
                }
                break
              case 'divine_result':
                setDivineResult(message.message)
                showResultModal('ability', '占い結果', message.message)
                break
              case 'medium_result':
                setMediumResult(message.message)
                showResultModal('ability', '霊視結果', message.message)
                break
              case 'vote_result':
                showResultModal('vote', '投票結果', message.message || '投票が完了しました')
                break
              case 'execution_result':
                showResultModal('execution', '処刑結果', message.message || '処刑が実行されました')
                break
              case 'phase_change':
                if (message.phase === 'night' && message.deathMessage) {
                  showResultModal('death', '夜の結果', message.deathMessage)
                }
                break
              case 'game_ended':
                setGameEndResult(message.result)
                break
              case 'player_kicked':
                // キックされたプレイヤーの通知を表示
                const kickMessage = `${message.playerName} が ${message.kickedBy} によってキックされました`
                console.log(kickMessage)
                // チャットメッセージとして表示
                if (gameState) {
                  const systemMessage = {
                    id: Date.now().toString(),
                    playerId: 'system',
                    playerName: 'システム',
                    content: kickMessage,
                    timestamp: Date.now(),
                    type: 'system' as const
                  }
                  setGameState(prev => prev ? {
                    ...prev,
                    chatMessages: [...(prev.chatMessages || []), systemMessage]
                  } : prev)
                }
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

  // チャット自動スクロール（改善版）
  useEffect(() => {
    if (chatContainerRef.current) {
      // スムーズスクロールで最新メッセージを表示
      const container = chatContainerRef.current;
      const scrollToBottom = () => {
        container.scrollTop = container.scrollHeight;
      };
      
      // 少し遅延させてスクロール（レンダリング完了後）
      setTimeout(scrollToBottom, 100);
    }
  }, [chatMessages, gameState?.chatMessages])

  // タイマー管理用のref
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const lastUpdateTimeRef = useRef<number>(Date.now())
  
  // タイマー更新 - サーバーからの更新を優先
  useEffect(() => {
    // タイマーをクリア
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!gameState || gameState.phase === 'lobby' || gameState.phase === 'ended') return

    // サーバーからの更新時刻を記録
    lastUpdateTimeRef.current = Date.now()
    
    // 新しいタイマーを開始
    timerRef.current = setInterval(() => {
      setGameState(prev => {
        if (!prev || prev.timeRemaining <= 0 || prev.phase === 'lobby' || prev.phase === 'ended') return prev
        
        // サーバーからの最新更新から1秒以内の場合はスキップ（サーバー更新を優先）
        if (Date.now() - lastUpdateTimeRef.current < 1500) return prev
        
        return {
          ...prev,
          timeRemaining: Math.max(0, prev.timeRemaining - 1)
        }
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [gameState?.phase, gameState?.timeRemaining])

  // サーバーからの更新時刻を記録
  useEffect(() => {
    if (gameState) {
      lastUpdateTimeRef.current = Date.now()
    }
  }, [gameState])

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

  const kickPlayer = (playerId: string) => {
    if (ws.current && gameState) {
      sendMessage({
        type: 'kick_player',
        roomId: gameState.id,
        playerId
      })
    }
  }

  const getAIPlayerCount = () => {
    return gameState?.players.filter(p => isAIPlayer(p.name)).length || 0
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
      <div className={`min-h-screen text-white flex items-center justify-center transition-all duration-1000 ${getSimpleBackground()}`}>
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
      <div className={`min-h-screen text-white flex items-center justify-center transition-all duration-1000 ${getSimpleBackground()}`}>
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
      <div className={`min-h-screen text-white flex items-center justify-center transition-all duration-1000 ${getSimpleBackground()}`}>
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
    <div className={`min-h-screen text-white transition-all duration-1000 ${getSimpleBackground()} flex items-center justify-center`}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ゲーム状態 */}
        <div className="bg-black/40 backdrop-blur-md border border-white/20 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{getPhaseDisplay(gameState.phase)}</h2>
              {gameState.phase !== 'lobby' && gameState.phase !== 'ended' && (
                <p className="text-gray-400 text-sm">
                  {gameState.currentDay}日目 - 残り時間: {formatTime(gameState.timeRemaining)}
                </p>
              )}
            </div>
            {currentPlayer?.role && (
              <div className="text-right">
                <p className="text-xs text-gray-400">あなたの役職</p>
                <p className="text-base font-semibold text-white">{getRoleDisplayName(currentPlayer.role)}</p>
              </div>
            )}
          </div>

          <div className="text-center mb-3 py-2 border-y border-white/10">
            <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
              <span>ルーム: {gameState.id}</span>
              <span>プレイヤー: {playerName}</span>
            </div>
          </div>

          {/* ロビー時のコントロール */}
          {isHost && gameState.phase === 'lobby' && (
            <div className="flex gap-2 mb-2 mt-4 justify-between">
              <div className="flex gap-2">
                <button
                  onClick={addAIPlayer}
                  disabled={getAIPlayerCount() >= 8}
                  className="bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed border border-white/20 hover:border-white/30 disabled:border-white/10 text-white disabled:text-gray-400 px-4 py-2 rounded text-sm transition-colors"
                >
                  AI追加 ({getAIPlayerCount()}/8)
                </button>
                <button
                  onClick={startGame}
                  disabled={gameState.players.length < 4}
                  className="bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed border border-white/20 hover:border-white/30 disabled:border-white/10 text-white disabled:text-gray-400 px-4 py-2 rounded text-sm transition-colors"
                >
                  ゲーム開始 ({gameState.players.length}/10)
                </button>
              </div>
              <div className="flex gap-2">
                <span className={`px-4 py-2 rounded text-sm border ${isConnected ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                  {isConnected ? '接続中' : '切断'}
                </span>
                <button
                  onClick={() => setShowRulesModal(true)}
                  className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white rounded transition-colors"
                >
                  ゲームルール
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white rounded transition-colors"
                >
                  退出
                </button>
              </div>
            </div>
          )}

          {/* ゲーム中またはホスト以外の接続状態と退出ボタン */}
          {(gameState.phase !== 'lobby' || !isHost) && (
            <div className="flex gap-2 justify-end mt-4">
              <span className={`px-4 py-2 rounded text-sm border ${isConnected ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                {isConnected ? '接続中' : '切断'}
              </span>
              <button
                onClick={() => setShowRulesModal(true)}
                className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white rounded transition-colors"
              >
                ゲームルール
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white rounded transition-colors"
              >
                退出
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
                      {player.isHost && <span className="text-xs bg-white/20 border border-white/30 text-white px-1 rounded">HOST</span>}
                      {isAIPlayer(player.name) && <span className="text-xs bg-white/20 border border-white/30 text-white px-1 rounded">AI</span>}
                    </div>
                    {!player.isAlive && <span className="text-xs text-red-400">死亡</span>}
                  </div>
                  {isHost && gameState.phase === 'lobby' && !player.isHost && (
                    <button
                      onClick={() => kickPlayer(player.id)}
                      className="text-xs bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white px-2 py-1 rounded transition-colors"
                    >
                      キック
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* チャット */}
          <div className="lg:col-span-2 bg-black/30 backdrop-blur-md border border-white/20 rounded-lg shadow-lg p-4">
            <h3 className="text-lg font-semibold mb-4">チャット</h3>
            <div
              ref={chatContainerRef}
              className="h-[617px] overflow-y-auto mb-4 space-y-2 bg-black/40 backdrop-blur-md border border-white/20 p-3 rounded scrollbar-thin scrollbar-thumb-white/20"
            >
              {(gameState?.chatMessages || []).map((msg, index) => {
                const timestamp = new Date(msg.timestamp);
                const timeStr = timestamp.toLocaleTimeString('ja-JP', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });
                
                const isOwnMessage = msg.playerName === playerName;
                
                return (
                  <div key={index} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3`}>
                    <div className={`max-w-[70%] ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                      <div className={`text-xs text-gray-400 mb-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}>
                        <span className="mr-2">[{timeStr}]</span>
                        <span className={`font-medium ${
                          isAIPlayer(msg.playerName) ? 'text-gray-300' : 'text-white'
                        }`}>
                          {msg.playerName}
                        </span>
                      </div>
                      <div className={`p-3 rounded-lg text-sm ${
                        isOwnMessage
                          ? 'bg-white/20 text-white rounded-br-none'
                          : 'bg-white/10 text-white rounded-bl-none'
                      } backdrop-blur-sm border ${
                        isOwnMessage
                          ? 'border-white/30'
                          : 'border-white/20'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                placeholder={gameState.phase === 'lobby' ? "挨拶やルール確認をしましょう..." : "メッセージを入力..."}
                disabled={gameState.phase === 'ended' || !currentPlayer?.isAlive}
                className="flex-1 bg-black/50 backdrop-blur-md border border-white/30 rounded px-3 py-2 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleChat}
                disabled={!chatMessage.trim() || gameState.phase === 'ended' || !currentPlayer?.isAlive}
                className="bg-white/10 hover:bg-white/20 disabled:bg-white/5 border border-white/20 hover:border-white/30 disabled:border-white/10 text-white disabled:text-gray-400 px-4 py-2 rounded transition-colors"
              >
                送信
              </button>
            </div>
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
                        className="w-full text-left p-2 rounded bg-black/50 backdrop-blur-md border border-white/20 hover:bg-black/60 disabled:bg-white/20 disabled:border-white/30 transition-colors"
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
                        className="w-full text-left p-2 rounded bg-black/50 backdrop-blur-md border border-white/20 hover:bg-black/60 disabled:bg-white/20 disabled:border-white/30 transition-colors"
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
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-black/80 backdrop-blur-md border border-white/30 rounded-lg p-8 max-w-lg w-full mx-4 shadow-2xl">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-white mb-4">🎉 ゲーム終了 🎉</h2>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-6 mb-4">
                  <p className="text-2xl font-bold text-white mb-2">
                    🏆 {gameEndResult.winner} の勝利！
                  </p>
                  {gameEndResult.reason && (
                    <p className="text-lg text-gray-300 leading-relaxed">{gameEndResult.reason}</p>
                  )}
                </div>
                
                {/* プレイヤー結果表示 */}
                {gameState && (
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-lg p-4 mb-4">
                    <h3 className="text-lg font-semibold text-white mb-3">最終結果</h3>
                    <div className="grid grid-cols-1 gap-2 text-sm">
                      {gameState.players.map((player) => (
                        <div key={player.id} className="flex items-center justify-between bg-white/5 rounded p-2">
                          <div className="flex items-center gap-2">
                            <Avatar playerName={player.name} size="sm" />
                            <span className="text-white font-medium">{player.name}</span>
                            {isAIPlayer(player.name) && <span className="text-xs bg-white/20 border border-white/30 text-white px-1 rounded">AI</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{getRoleDisplayName(player.role || '')}</span>
                            <span className={`text-xs px-2 py-1 rounded ${player.isAlive ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-400'}`}>
                              {player.isAlive ? '生存' : '死亡'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setGameEndResult(null)}
                  className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white py-3 rounded-lg transition-colors font-medium"
                >
                  結果を閉じる
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white py-3 rounded-lg transition-colors font-medium"
                >
                  ホームに戻る
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ゲームルール説明モーダル */}
        {showRulesModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-black/80 backdrop-blur-md border border-white/30 rounded-lg p-6 max-w-lg w-full">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">人狼ゲームルール</h2>
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="text-gray-400 hover:text-white text-xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-3 text-sm text-gray-200">
                <div>
                  <h3 className="text-base font-semibold text-white mb-2">ゲーム概要</h3>
                  <p className="text-xs">村人チームと人狼チームの推理ゲーム。村人は人狼を全員処刑すれば勝利、人狼は村人と同数以上になれば勝利。</p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-white mb-2">主な役職</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/10 p-2 rounded">
                      <div className="font-medium text-white">村人</div>
                      <div className="text-gray-300">議論と投票で人狼を探す</div>
                    </div>
                    <div className="bg-white/10 p-2 rounded">
                      <div className="font-medium text-white">人狼</div>
                      <div className="text-gray-300">夜に村人を襲撃</div>
                    </div>
                    <div className="bg-white/10 p-2 rounded">
                      <div className="font-medium text-white">占い師</div>
                      <div className="text-gray-300">夜に1人の正体を確認</div>
                    </div>
                    <div className="bg-white/10 p-2 rounded">
                      <div className="font-medium text-white">霊媒師</div>
                      <div className="text-gray-300">処刑者の正体を確認</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-white mb-2">ゲームの流れ</h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="bg-white/20 px-2 py-1 rounded text-white font-medium">1</span>
                      <span className="text-gray-300">昼の議論 → チャットで話し合い</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="bg-white/20 px-2 py-1 rounded text-white font-medium">2</span>
                      <span className="text-gray-300">投票 → 怪しい人を選択</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="bg-white/20 px-2 py-1 rounded text-white font-medium">3</span>
                      <span className="text-gray-300">夜時間 → 各役職が行動</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-white mb-2">勝利条件</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/10 p-2 rounded border border-white/20">
                      <div className="font-medium text-white">村人チーム</div>
                      <div className="text-gray-300">人狼を全員処刑</div>
                    </div>
                    <div className="bg-white/10 p-2 rounded border border-white/20">
                      <div className="font-medium text-white">人狼チーム</div>
                      <div className="text-gray-300">村人と同数以上</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white px-4 py-2 rounded transition-colors text-sm"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 結果表示モーダル */}
        {resultModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-black/90 backdrop-blur-md border-2 border-white/40 rounded-lg p-6 max-w-md w-full shadow-2xl animate-pulse">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-4">{resultModal.title}</h2>
                <div className="bg-white/10 p-4 rounded-lg mb-4">
                  <p className="text-lg text-white whitespace-pre-line">{resultModal.content}</p>
                </div>
                <div className="text-sm text-gray-300">
                  このメッセージは自動的に閉じます...
                </div>
              </div>
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