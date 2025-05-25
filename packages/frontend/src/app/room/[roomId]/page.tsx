'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Modal } from '../../../components/ui/modal'
import { getStoredApiKey, setStoredApiKey, validateApiKey, testApiKey, generateAIPersonality, generateAIResponse, determineAIResponse, updateEmotionalState } from '../../../lib/openai'
import { Avatar } from '../../../lib/avatars'

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
  const params = useParams()
  const searchParams = useSearchParams()
  const roomId = params.roomId as string
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

  // タイマーの実装
  useEffect(() => {
    if (gameState && gameState.phase !== 'lobby' && gameState.phase !== 'ended') {
      setTimeRemaining(gameState.timeRemaining)
      
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 0) return 0
          return prev - 1
        })
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [gameState?.phase, gameState?.timeRemaining])
  
  // フェーズ変更時に選択状態をリセット
  useEffect(() => {
    setSelectedVoteTarget(null)
    setSelectedAbilityTarget(null)
  }, [gameState?.phase])
  
  // チャットの自動スクロール（投票フェーズでは無効）
  useEffect(() => {
    // 投票フェーズやゲーム終了時は自動スクロールしない
    if (gameState?.phase === 'voting' || gameState?.phase === 'ended') {
      return
    }
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, gameState?.phase])
  
  // AIの応答を生成
  // AI応答処理用のref（重複防止）
  const lastProcessedMessageRef = useRef<string | null>(null)
  
  useEffect(() => {
    const processAIResponses = async () => {
      const apiKey = getStoredApiKey()
      if (!apiKey || !gameState || gameState.phase === 'lobby' || gameState.phase === 'ended') return
      
      // 最新のメッセージを取得
      const latestMessage = chatMessages[chatMessages.length - 1]
      if (!latestMessage || isAIPlayer(latestMessage.playerName)) return
      
      // 既に処理済みのメッセージかチェック
      if (lastProcessedMessageRef.current === latestMessage.id) return
      lastProcessedMessageRef.current = latestMessage.id
      
      // AIプレイヤーを取得
      const aiPlayers = gameState.players.filter(p =>
        isAIPlayer(p.name) &&
        p.isAlive
      )
      
      if (aiPlayers.length === 0) return
      
      // AIプレイヤーの個性を初期化（まだ生成されていない場合）
      for (const aiPlayer of aiPlayers) {
        if (!aiPersonalities.has(aiPlayer.id)) {
          try {
            const personality = await generateAIPersonality(apiKey, aiPlayer.name)
            setAiPersonalities(prev => new Map(prev.set(aiPlayer.id, personality)))
          } catch (error) {
            console.error('Failed to generate AI personality:', error)
          }
        }
      }
      
      // 文脈に基づいてAI応答を決定
      const shouldRespond = await determineAIResponse(apiKey, latestMessage, aiPlayers, chatMessages, gameState)
      if (shouldRespond.respond) {
        const respondingAI = shouldRespond.aiPlayer
        const aiPersonality = aiPersonalities.get(respondingAI.id)
        
        // 改善されたコンテキスト構築
        const fullChatHistory = chatMessages.slice(-20).map(msg =>
          `${msg.playerName}: ${msg.content}`
        ).join('\n')
        
        // 役職名の日本語マッピング
        const roleNames: { [key: string]: string } = {
          'villager': '村人',
          'werewolf': '人狼',
          'seer': '占い師',
          'medium': '霊媒師',
          'hunter': '狩人',
          'madman': '狂人'
        }
        
        // 生存プレイヤー情報
        const alivePlayers = gameState.players.filter(p => p.isAlive).map(p => p.name).join(', ')
        const deadPlayers = gameState.players.filter(p => !p.isAlive).map(p => p.name).join(', ')
        
        // 過去の投票や処刑情報を分析
        const gameHistory = chatMessages.filter(msg =>
          msg.content.includes('処刑') || msg.content.includes('襲撃') || msg.content.includes('占い')
        ).slice(-5).map(msg => `${msg.playerName}: ${msg.content}`).join('\n')
        
        // 詳細なゲームコンテキスト
        const gameContext = `
【ゲーム状況】
- フェーズ: ${gameState.phase === 'day' ? '昼の議論時間' : gameState.phase === 'night' ? '夜時間' : '投票時間'}
- 日数: ${gameState.currentDay}日目
- 生存者: ${alivePlayers}
- 死亡者: ${deadPlayers || 'なし'}

【あなたの情報】
- 名前: ${respondingAI.name}
- 役職: ${respondingAI.role ? (roleNames[respondingAI.role] || respondingAI.role) : '村人'}
- 応答理由: ${shouldRespond.reason}

【重要な過去の出来事】
${gameHistory || '特になし'}

【最近の会話の流れ】
${fullChatHistory}

【戦略的指針】
${respondingAI.role === 'werewolf' ?
  '人狼として: 村人を装い、疑いを他者に向ける。仲間の人狼を守る。' :
  respondingAI.role === 'seer' ?
  '占い師として: 占い結果を戦略的に公開し、人狼を見つける。' :
  respondingAI.role === 'hunter' ?
  '狩人として: 重要人物を守り、自分の正体は隠す。' :
  '村人として: 論理的推理で人狼を見つけ、村を勝利に導く。'
}
        `
        
        try {
          // 1-3秒後に応答（より自然なタイミング）
          setTimeout(async () => {
            // 改善されたプロンプト生成
            const mentionsMe = latestMessage.content.includes(respondingAI.name)
            const isAccusation = latestMessage.content.includes('人狼') || latestMessage.content.includes('怪しい') || latestMessage.content.includes('疑')
            const isQuestion = latestMessage.content.includes('？') || latestMessage.content.includes('?') || latestMessage.content.includes('どう思う') || latestMessage.content.includes('どうする')
            
            let prompt = ''
            
            if (mentionsMe) {
              prompt = `${latestMessage.playerName}があなた（${respondingAI.name}）に対して「${latestMessage.content}」と発言しました。この発言に対して、あなたの役職（${roleNames[respondingAI.role] || '村人'}）として適切に反応してください。疑われている場合は論理的に反論し、質問されている場合は戦略的に答えてください。`
            } else if (isAccusation) {
              prompt = `${latestMessage.playerName}が「${latestMessage.content}」と推理や疑いを述べました。この推理を分析し、あなたの役職（${roleNames[respondingAI.role] || '村人'}）の視点から具体的な意見を述べてください。他のプレイヤーの名前を挙げて賛成・反対・別の疑いを提示してください。`
            } else if (isQuestion) {
              prompt = `${latestMessage.playerName}が「${latestMessage.content}」と質問しました。あなたの役職（${roleNames[respondingAI.role] || '村人'}）として、この質問に戦略的に答えてください。具体的な情報や推理を含めて回答してください。`
            } else {
              prompt = `${latestMessage.playerName}が「${latestMessage.content}」と発言しました。この発言を受けて、あなたの役職（${roleNames[respondingAI.role] || '村人'}）として適切に反応してください。ゲームを進展させる具体的な推理、疑問、または戦略的な意見を述べてください。`
            }
            
            prompt += `
            
重要な指示:
- 1-2文で簡潔だが具体的に応答
- 曖昧な発言は絶対に避ける
- 具体的なプレイヤー名を挙げる
- あなたの役職の勝利条件を意識する
- 過去の会話の流れを考慮する
- ${respondingAI.name}として一貫した性格で発言する`
            
            let response = await generateAIResponse(
              apiKey,
              prompt,
              gameContext,
              aiPersonality
            )
            
            // AIの応答も校閲する
            
            // 感情状態を更新
            if (aiPersonality) {
              let emotionalEvent: any = null
              
              // メッセージ内容に基づいて感情イベントを判定
              if (latestMessage.content.includes(respondingAI.name) &&
                  (latestMessage.content.includes('怪しい') || latestMessage.content.includes('疑'))) {
                emotionalEvent = 'accused'
              } else if (latestMessage.content.includes(respondingAI.name) &&
                         latestMessage.content.includes('信頼')) {
                emotionalEvent = 'defended'
              }
              
              if (emotionalEvent) {
                const updatedEmotion = updateEmotionalState(aiPersonality.emotionalState, emotionalEvent)
                const updatedPersonality = { ...aiPersonality, emotionalState: updatedEmotion }
                setAiPersonalities(prev => new Map(prev.set(respondingAI.id, updatedPersonality)))
              }
            }
            
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              const chatMsg = {
                type: 'chat',
                roomId: roomId,
                message: {
                  content: response,
                  type: 'public' as const,
                  playerName: respondingAI.name
                },
                isAI: true,
                aiPlayerId: respondingAI.id
              }
              console.log('Sending AI response:', chatMsg)
              websocket.send(JSON.stringify(chatMsg))
            }
          }, Math.floor(Math.random() * 3000) + 2000) // 2-5秒の自然な遅延
        } catch (error) {
          console.error('AI response error:', error)
        }
      }
    }
    
    processAIResponses()
  }, [chatMessages, gameState, websocket, roomId])

  // 自発的AI発言システム（会話停滞時）
  useEffect(() => {
    const handleProactiveAI = async () => {
      const apiKey = getStoredApiKey()
      if (!apiKey || !gameState || gameState.phase === 'lobby' || gameState.phase === 'ended') return
      
      const aiPlayers = gameState.players.filter(p => isAIPlayer(p.name) && p.isAlive)
      if (aiPlayers.length === 0) return
      
      // 最後のメッセージから30秒経過した場合に自発的発言を検討
      const lastMessage = chatMessages[chatMessages.length - 1]
      if (!lastMessage) return
      
      const timeSinceLastMessage = Date.now() - new Date(lastMessage.timestamp || Date.now()).getTime()
      
      if (timeSinceLastMessage > 30000) { // 30秒
        // ランダムなAIプレイヤーが自発的に発言
        const speakingAI = aiPlayers[Math.floor(Math.random() * aiPlayers.length)]
        
        const recentMessages = chatMessages.slice(-10).map(msg =>
          `${msg.playerName}: ${msg.content}`
        ).join('\n')
        
        const roleNames: { [key: string]: string } = {
          'villager': '村人',
          'werewolf': '人狼',
          'seer': '占い師',
          'medium': '霊媒師',
          'hunter': '狩人',
          'madman': '狂人'
        }
        
        const alivePlayers = gameState.players.filter(p => p.isAlive).map(p => p.name).join(', ')
        
        const proactivePrompt = `
会話が停滞しています。あなた（${speakingAI.name}、役職: ${roleNames[speakingAI.role || 'villager'] || '村人'}）として、ゲームを進展させる自発的な発言をしてください。

【現在の状況】
- フェーズ: ${gameState.phase === 'day' ? '昼の議論時間' : '投票時間'}
- ${gameState.currentDay}日目
- 生存者: ${alivePlayers}

【最近の会話】
${recentMessages}

以下のような発言を考えてください：
- 新しい推理や疑問の提起
- 他のプレイヤーへの質問
- 投票の提案や意見
- 情報の整理や分析

1-2文で具体的に発言してください。曖昧な発言は避け、ゲームを前進させる内容にしてください。
        `
        
        try {
          const response = await generateAIResponse(apiKey, proactivePrompt, '', aiPersonalities.get(speakingAI.id))
          
          if (websocket && websocket.readyState === WebSocket.OPEN) {
            const chatMsg = {
              type: 'chat',
              roomId: roomId,
              message: {
                content: response,
                type: 'public' as const,
                playerName: speakingAI.name
              },
              isAI: true,
              aiPlayerId: speakingAI.id
            }
            websocket.send(JSON.stringify(chatMsg))
          }
        } catch (error) {
          console.error('Proactive AI response error:', error)
        }
      }
    }
    
    // 35秒ごとに自発的発言をチェック
    const proactiveInterval = setInterval(handleProactiveAI, 35000)
    return () => clearInterval(proactiveInterval)
  }, [chatMessages, gameState, websocket, roomId])

  useEffect(() => {
    // Initialize API key from localStorage
    const storedApiKey = getStoredApiKey()
    if (storedApiKey) {
      setApiKey(storedApiKey)
    }
  }, [])

  useEffect(() => {
    // 初期化フラグを設定
    const initTimer = setTimeout(() => {
      setIsInitializing(false)
      
      // 初期化後にパラメータチェック
      if (!roomId || !playerName) {
        setDelayedError('ルームIDまたはプレイヤー名が不正です')
      }
    }, 100) // 100ms遅延

    return () => clearTimeout(initTimer)
  }, [])

  // エラー表示の遅延処理
  useEffect(() => {
    if (delayedError && !isInitializing) {
      const errorTimer = setTimeout(() => {
        setError(delayedError)
      }, 500) // 500ms遅延してエラーを表示

      return () => clearTimeout(errorTimer)
    }
  }, [delayedError, isInitializing])

  useEffect(() => {
    // 初期化中はWebSocket接続を開始しない
    if (isInitializing || !roomId || !playerName) {
      return
    }

    // WebSocket接続を試行
    const connectWebSocket = () => {
      try {
        const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/api/rooms/${roomId}/ws`
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('WebSocket接続成功')
          console.log('Player name from URL:', playerName)
          console.log('Room ID:', roomId)
          setIsConnected(true)
          setError(null)
          setDelayedError(null)
          
          // ルーム参加メッセージを送信
          const joinMessage = {
            type: 'join_room',
            roomId: roomId,
            player: {
              name: playerName,
              isReady: false
            }
          }
          console.log('Sending join message:', joinMessage)
          ws.send(JSON.stringify(joinMessage))
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('受信メッセージ:', message)
            
            switch (message.type) {
              case 'game_state_update':
                setGameState(message.gameState)
                // チャットメッセージも更新
                if (message.gameState.chatMessages) {
                  setChatMessages(message.gameState.chatMessages)
                }
                // ゲーム終了チェック
                if (message.gameState.phase === 'ended' && !showGameEndModal) {
                  const survivors = message.gameState.players.filter((p: Player) => p.isAlive)
                  const aliveWerewolves = survivors.filter((p: Player) => p.role === 'werewolf')
                  const aliveVillagers = survivors.filter((p: Player) =>
                    p.role !== 'werewolf' && p.role !== 'madman'
                  )
                  
                  let winner = ''
                  if (aliveWerewolves.length === 0) {
                    winner = '村人チーム'
                  } else if (aliveWerewolves.length >= aliveVillagers.length) {
                    winner = '人狼チーム'
                  } else {
                    winner = 'ゲーム継続中' // 念のため
                  }
                  
                  console.log('[ゲーム終了判定]', {
                    phase: message.gameState.phase,
                    survivors: survivors.length,
                    werewolves: aliveWerewolves.length,
                    villagers: aliveVillagers.length,
                    winner
                  })
                  
                  setGameResult({ winner, survivors })
                  setShowGameEndModal(true)
                }
                break
              case 'divine_result':
                // 占い師の結果をチャットに表示
                const divineMessage = {
                  id: `divine-${Date.now()}`,
                  playerId: 'system',
                  playerName: '占い結果',
                  content: message.message,
                  timestamp: Date.now(),
                  type: 'system'
                }
                setChatMessages(prev => [...prev, divineMessage])
                break
              case 'medium_result':
                // 霊媒師の結果をチャットに表示
                const mediumMessage = {
                  id: `medium-${Date.now()}`,
                  playerId: 'system',
                  playerName: '霊媒結果',
                  content: message.message,
                  timestamp: Date.now(),
                  type: 'system'
                }
                setChatMessages(prev => [...prev, mediumMessage])
                break
              case 'ability_used':
                // 能力使用の確認メッセージ
                const abilityMessage = {
                  id: `ability-${Date.now()}`,
                  playerId: 'system',
                  playerName: 'システム',
                  content: message.message,
                  timestamp: Date.now(),
                  type: 'system'
                }
                setChatMessages(prev => [...prev, abilityMessage])
                break
              case 'error':
                setDelayedError(message.message)
                break
              default:
                console.log('未知のメッセージタイプ:', message.type)
            }
          } catch (err) {
            console.error('メッセージ解析エラー:', err)
          }
        }

        ws.onclose = () => {
          console.log('WebSocket接続が閉じられました')
          setIsConnected(false)
        }

        ws.onerror = (error) => {
          console.error('WebSocketエラー:', error)
          setDelayedError('接続エラーが発生しました')
          setIsConnected(false)
        }

        return ws
      } catch (err) {
        console.error('WebSocket接続失敗:', err)
        setDelayedError('WebSocket接続に失敗しました')
        return null
      }
    }

    const ws = connectWebSocket()
    if (ws) {
      setWebsocket(ws)
    }
    
    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [roomId, playerName, isInitializing])

  // メッセージ送信中フラグ（二重送信防止）
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  
  const sendChatMessage = async () => {
    if (!chatMessage.trim() || isSendingMessage) return
    
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      setIsSendingMessage(true)
      const apiKey = getStoredApiKey()
      let messageContent = chatMessage.trim()
      const originalMessage = messageContent
      
      
      const chatMsg = {
        type: 'chat',
        roomId: roomId,
        message: {
          content: messageContent,
          type: 'public' as const,
          playerName: playerName
        }
      }
      
      console.log('Sending player message:', chatMsg)
      websocket.send(JSON.stringify(chatMsg))
      setChatMessage('')
      setIsSendingMessage(false)
    } else {
      console.error('WebSocket is not connected')
      setError('WebSocket接続が切断されています')
      setIsSendingMessage(false)
    }
  }

  const handleApiKeySubmit = async () => {
    if (!validateApiKey(apiKey)) {
      setApiKeyError('Invalid API key format. Must start with "sk-" and be at least 20 characters.')
      return
    }

    setIsTestingApiKey(true)
    setApiKeyError(null)

    try {
      const isValid = await testApiKey(apiKey)
      if (isValid) {
        setStoredApiKey(apiKey)
        setShowApiKeyModal(false)
        setApiKeyError(null)
      } else {
        setApiKeyError('API key test failed. Please check your key and try again.')
      }
    } catch (error) {
      setApiKeyError('Failed to test API key. Please try again.')
    } finally {
      setIsTestingApiKey(false)
    }
  }

  const addAIPlayer = async () => {
    const storedApiKey = getStoredApiKey()
    if (!storedApiKey) {
      setShowApiKeyModal(true)
      return
    }

    setIsAddingAI(true)
    try {
      const existingAINames = gameState?.players?.filter(p => isAIPlayer(p.name)).map(p => p.name) || []
      const availableNames = AI_NAMES.filter(name => !existingAINames.includes(name))
      
      if (availableNames.length === 0) {
        console.error('すべてのAI名が使用済みです')
        return
      }
      
      const aiName = availableNames[0]
      
      // First add the player without personality (faster)
      const response = await fetch(`${process.env.NEXT_PUBLIC_WORKERS_URL}/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerName: aiName,
          isAI: true
        })
      })
      
      if (!response.ok) {
        console.error('AIプレイヤー追加に失敗しました')
        return
      }
      
      // Generate AI personality asynchronously in the background
      generateAIPersonality(storedApiKey, aiName).then(personality => {
        console.log(`Generated personality for ${aiName}:`, personality)
        // Store personality for later use during game
      }).catch(error => {
        console.error('AI personality generation failed:', error)
      })
      
    } catch (error) {
      console.error('AIプレイヤー追加エラー:', error)
    } finally {
      setIsAddingAI(false)
    }
  }

  const leaveRoom = () => {
    if (window.confirm('ルームから退出しますか？')) {
      window.location.href = '/'
    }
  }

  const kickPlayer = async (playerId: string, playerName: string) => {
    if (!window.confirm(`${playerName}をキックしますか？`)) {
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_WORKERS_URL}/api/rooms/${roomId}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId: playerId
        })
      })
      
      if (!response.ok) {
        console.error('プレイヤーのキックに失敗しました')
      }
    } catch (error) {
      console.error('キックエラー:', error)
    }
  }

  // 初期化中はローディング表示
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-300">ルームに接続中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-6 max-w-md">
          <h2 className="text-xl font-bold text-red-400 mb-2">エラー</h2>
          <p className="text-red-300">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">ルーム: {roomId}</h1>
              <p className="text-gray-300">プレイヤー: {playerName}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowRules(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded-md transition-colors"
              >
                ルール説明
              </button>
              <button
                onClick={() => setShowHint(true)}
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1 rounded-md transition-colors"
              >
                ヒント
              </button>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-300">
                  {isConnected ? '接続中' : '切断'}
                </span>
              </div>
              <button
                onClick={leaveRoom}
                className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1 rounded-md transition-colors"
              >
                退出
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* プレイヤーリスト */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                プレイヤー ({gameState?.players?.length || 0})
              </h2>
              <div className="space-y-2">
                {gameState?.players?.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-2 bg-white/5 rounded-md"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${player.isAlive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-white">{player.name || 'Unknown Player'}</span>
                        {player.isHost && (
                          <span className="text-xs bg-yellow-600 text-white px-1 rounded">HOST</span>
                        )}
                        {player.name && isAIPlayer(player.name) && (
                          <span className="text-xs bg-purple-600 text-white px-1 rounded">AI</span>
                        )}
                      </div>
                      {player.name && isAIPlayer(player.name) && aiPersonalities.has(player.id) && (
                        <div className="text-xs text-gray-400 mt-1 ml-4">
                          {(() => {
                            const personality = aiPersonalities.get(player.id)
                            if (!personality) return null
                            const emotions = personality.emotionalState
                            const dominantEmotion = Object.entries(emotions).reduce((a, b) =>
                              emotions[a[0]] > emotions[b[0]] ? a : b
                            )[0]
                            const emotionEmojis = {
                              happiness: '😊',
                              anger: '😠',
                              fear: '😰',
                              confidence: '😎',
                              suspicion: '🤔'
                            }
                            const personalityNames = {
                              aggressive: '攻撃的',
                              cautious: '慎重',
                              analytical: '分析的',
                              emotional: '感情的',
                              charismatic: '魅力的',
                              suspicious: '疑い深い'
                            }
                            return `${personalityNames[personality.personality as keyof typeof personalityNames] || personality.personality} | ${emotionEmojis[dominantEmotion as keyof typeof emotionEmojis]} ${emotions[dominantEmotion]}`
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${player.isReady ? 'bg-blue-500' : 'bg-gray-500'}`}></div>
                      {/* キックボタン（ホストのみ、自分以外） */}
                      {gameState?.players?.find(p => p.isHost && p.name === playerName) &&
                       player.name !== playerName && (
                        <button
                          onClick={() => kickPlayer(player.id, player.name || 'Unknown Player')}
                          className="text-red-400 hover:text-red-300 text-xs px-1 py-0.5 rounded transition-colors"
                          title="キック"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )) || (
                  <p className="text-gray-400 text-center">プレイヤーを読み込み中...</p>
                )}
              </div>
              
              {/* AIプレイヤー追加ボタン */}
              {gameState?.phase === 'lobby' && (gameState?.players?.length || 0) < 12 && (
                <div className="mt-4 pt-4 border-t border-white/20">
                  <button
                    onClick={addAIPlayer}
                    disabled={isAddingAI}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors"
                  >
                    {isAddingAI ? '追加中...' : 'AIプレイヤーを追加'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ゲームエリア */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">
                  ゲーム状態: {gameState?.phase || 'ロビー'}
                </h2>
                {gameState?.phase !== 'lobby' && (
                  <div className="text-white">
                    Day {gameState?.currentDay} - 残り時間: {timeRemaining !== null ? timeRemaining : gameState?.timeRemaining}秒
                  </div>
                )}
              </div>

              {/* 自分の役職表示 */}
              {gameState?.phase !== 'lobby' && gameState?.phase !== 'ended' && (
                <div className="mb-4 p-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg border border-purple-500/30">
                  <div className="flex items-center space-x-3">
                    <div className="text-purple-300">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-300">あなたの役職</p>
                      <p className="text-lg font-bold text-white">
                        {(() => {
                          const myPlayer = gameState?.players?.find(p => p.name === playerName);
                          if (!myPlayer || !myPlayer.role) return '不明';
                          
                          const roleNames: { [key: string]: string } = {
                            'villager': '村人',
                            'werewolf': '人狼',
                            'seer': '占い師',
                            'medium': '霊媒師',
                            'hunter': '狩人',
                            'madman': '狂人'
                          };
                          
                          return roleNames[myPlayer.role] || myPlayer.role;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 投票・能力使用UI */}
              {gameState?.phase === 'voting' && (
                <div className="mb-4 p-4 bg-red-900/30 border border-red-600/50 rounded-lg">
                  <h3 className="text-lg font-bold text-red-300 mb-3">投票フェーズ</h3>
                  <p className="text-red-200 text-sm mb-4">処刑する人を選んでください</p>
                  
                  {/* 現在の投票状況 */}
                  {gameState.votes && gameState.votes.length > 0 && (
                    <div className="mb-4 p-3 bg-red-800/20 rounded-lg">
                      <h4 className="text-red-300 font-medium mb-2">現在の投票状況:</h4>
                      <div className="text-sm text-red-200">
                        {(() => {
                          const voteCount = new Map();
                          gameState.votes.forEach(vote => {
                            const target = gameState.players.find(p => p.id === vote.targetId);
                            if (target) {
                              voteCount.set(target.name, (voteCount.get(target.name) || 0) + 1);
                            }
                          });
                          return Array.from(voteCount.entries()).map(([name, count]) => (
                            <div key={name}>{name}: {count}票</div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 gap-2">
                    {gameState.players.filter(p => p.isAlive && p.name !== playerName).map(player => {
                      // このプレイヤーに自分が投票しているかチェック
                      const myVote = gameState.votes?.find(v => {
                        const voter = gameState.players.find(p => p.id === v.voterId);
                        return voter?.name === playerName && v.targetId === player.id;
                      });
                      
                      return (
                        <button
                          key={player.id}
                          onClick={() => {
                            setSelectedVoteTarget(player.id)
                            if (websocket && websocket.readyState === WebSocket.OPEN) {
                              const voteMessage = {
                                type: 'vote',
                                roomId: roomId,
                                vote: {
                                  targetId: player.id
                                }
                              }
                              websocket.send(JSON.stringify(voteMessage))
                            }
                          }}
                          className={`flex items-center space-x-3 p-3 border rounded-lg transition-colors ${
                            selectedVoteTarget === player.id
                              ? 'bg-red-500/70 border-red-300 text-white shadow-lg ring-2 ring-red-400'
                              : myVote
                              ? 'bg-red-600/50 border-red-400 text-white'
                              : 'bg-red-800/30 hover:bg-red-700/40 border-red-600/30 text-white'
                          }`}
                        >
                          <Avatar playerName={player.name} size="sm" />
                          <span className="font-medium">{player.name}</span>
                          {selectedVoteTarget === player.id && <span className="text-red-100 text-sm">選択中</span>}
                          {myVote && selectedVoteTarget !== player.id && <span className="text-red-300 text-sm">投票済み</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {gameState?.phase === 'night' && (
                <div className="mb-4 p-4 bg-blue-900/30 border border-blue-600/50 rounded-lg">
                  <h3 className="text-lg font-bold text-blue-300 mb-3">夜フェーズ</h3>
                  {(() => {
                    const myPlayer = gameState?.players?.find(p => p.name === playerName);
                    if (!myPlayer || !myPlayer.role) return null;
                    
                    if (myPlayer.role === 'werewolf') {
                      return (
                        <>
                          <p className="text-blue-200 text-sm mb-4">襲撃する村人を選んでください</p>
                          <div className="grid grid-cols-1 gap-2">
                            {gameState.players.filter(p => p.isAlive && p.name !== playerName && p.role !== 'werewolf').map(player => (
                              <button
                                key={player.id}
                                onClick={() => {
                                  setSelectedAbilityTarget(player.id)
                                  if (websocket && websocket.readyState === WebSocket.OPEN) {
                                    const abilityMessage = {
                                      type: 'use_ability',
                                      roomId: roomId,
                                      targetId: player.id,
                                      ability: 'attack'
                                    }
                                    websocket.send(JSON.stringify(abilityMessage))
                                  }
                                }}
                                className={`flex items-center space-x-3 p-3 border rounded-lg transition-colors ${
                                  selectedAbilityTarget === player.id
                                    ? 'bg-red-500/70 border-red-300 shadow-lg ring-2 ring-red-400'
                                    : 'bg-blue-800/30 hover:bg-blue-700/40 border-blue-600/30'
                                }`}
                              >
                                <Avatar playerName={player.name} size="sm" />
                                <span className="text-white font-medium">{player.name}</span>
                                {selectedAbilityTarget === player.id && <span className="text-red-100 text-sm">選択中</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      )
                    } else if (myPlayer.role === 'seer') {
                      return (
                        <>
                          <p className="text-blue-200 text-sm mb-4">占いたい人を選んでください</p>
                          <div className="grid grid-cols-1 gap-2">
                            {gameState.players.filter(p => p.isAlive && p.name !== playerName).map(player => (
                              <button
                                key={player.id}
                                onClick={() => {
                                  setSelectedAbilityTarget(player.id)
                                  if (websocket && websocket.readyState === WebSocket.OPEN) {
                                    const abilityMessage = {
                                      type: 'use_ability',
                                      roomId: roomId,
                                      targetId: player.id,
                                      ability: 'divine'
                                    }
                                    websocket.send(JSON.stringify(abilityMessage))
                                  }
                                }}
                                className={`flex items-center space-x-3 p-3 border rounded-lg transition-colors ${
                                  selectedAbilityTarget === player.id
                                    ? 'bg-purple-500/70 border-purple-300 shadow-lg ring-2 ring-purple-400'
                                    : 'bg-blue-800/30 hover:bg-blue-700/40 border-blue-600/30'
                                }`}
                              >
                                <Avatar playerName={player.name} size="sm" />
                                <span className="text-white font-medium">{player.name}</span>
                                {selectedAbilityTarget === player.id && <span className="text-purple-100 text-sm">🔮 選択中</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      )
                    } else if (myPlayer.role === 'hunter') {
                      return (
                        <>
                          <p className="text-blue-200 text-sm mb-4">守りたい人を選んでください</p>
                          <div className="grid grid-cols-1 gap-2">
                            {gameState.players.filter(p => p.isAlive).map(player => (
                              <button
                                key={player.id}
                                onClick={() => {
                                  setSelectedAbilityTarget(player.id)
                                  if (websocket && websocket.readyState === WebSocket.OPEN) {
                                    const abilityMessage = {
                                      type: 'use_ability',
                                      roomId: roomId,
                                      targetId: player.id,
                                      ability: 'guard'
                                    }
                                    websocket.send(JSON.stringify(abilityMessage))
                                  }
                                }}
                                className={`flex items-center space-x-3 p-3 border rounded-lg transition-colors ${
                                  selectedAbilityTarget === player.id
                                    ? 'bg-green-500/70 border-green-300 shadow-lg ring-2 ring-green-400'
                                    : 'bg-blue-800/30 hover:bg-blue-700/40 border-blue-600/30'
                                }`}
                              >
                                <Avatar playerName={player.name} size="sm" />
                                <span className="text-white font-medium">{player.name}</span>
                                {selectedAbilityTarget === player.id && <span className="text-green-100 text-sm">選択中</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      )
                    } else if (myPlayer.role === 'medium') {
                      return (
                        <>
                          <p className="text-blue-200 text-sm mb-4">前日の処刑者について霊視できます</p>
                          <button
                            onClick={() => {
                              if (websocket && websocket.readyState === WebSocket.OPEN) {
                                const abilityMessage = {
                                  type: 'use_ability',
                                  roomId: roomId,
                                  targetId: '', // 霊媒師は対象不要
                                  ability: 'divine'
                                }
                                websocket.send(JSON.stringify(abilityMessage))
                              }
                            }}
                            className="flex items-center justify-center space-x-2 p-3 bg-purple-800/30 hover:bg-purple-700/40 border border-purple-600/30 rounded-lg transition-colors text-white"
                          >
                            <span className="text-purple-300">🔮</span>
                            <span className="font-medium">霊視を行う</span>
                          </button>
                        </>
                      )
                    } else {
                      return (
                        <p className="text-blue-200 text-sm">朝を待ちましょう...</p>
                      )
                    }
                  })()}
                </div>
              )}

              {gameState?.phase === 'lobby' ? (
                <div className="text-center py-8">
                  <p className="text-gray-300 mb-4">
                    ゲーム開始を待っています...
                  </p>
                  {(gameState?.players?.length || 0) < 4 ? (
                    <p className="text-sm text-gray-400">
                      最低4人のプレイヤーが必要です（現在: {gameState?.players?.length || 0}人）
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-green-400">
                        ゲーム開始可能です！（{gameState?.players?.length}人）
                      </p>
                      {gameState?.players?.find(p => p.isHost && p.name === playerName) && (
                        <button
                          onClick={() => {
                            if (websocket && websocket.readyState === WebSocket.OPEN) {
                              const startGameMessage = {
                                type: 'start_game',
                                roomId: roomId
                              }
                              console.log('Sending start game message:', startGameMessage)
                              websocket.send(JSON.stringify(startGameMessage))
                            } else {
                              console.error('WebSocket is not connected')
                              setError('WebSocket接続が切断されています')
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
                        >
                          ゲーム開始
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <h3 className="text-white font-medium mb-2">ゲーム進行中</h3>
                    <p className="text-gray-300">
                      現在のフェーズ: {gameState?.phase}
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* 独立したチャットエリア */}
      <div className="container mx-auto px-4 mt-6">
        <div className="bg-white/5 rounded-lg p-4">
          <h3 className="text-white font-medium mb-3">チャット</h3>
          <div className="bg-black/30 rounded-lg p-4 h-64 overflow-y-auto mb-3 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            {chatMessages.length > 0 ? (
              <>
                {chatMessages.map((msg, index) => (
                  <div key={index} className="mb-3 animate-fadeIn">
                    {msg.playerName === 'System' ? (
                      // Systemメッセージの特別なスタイル
                      <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3">
                        <div className="flex items-start space-x-2">
                          <div className="flex-shrink-0">
                            <Avatar playerName={msg.playerName} size="sm" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-baseline space-x-2 mb-1">
                              <span className="font-medium text-yellow-300 text-sm">
                                System
                              </span>
                              <span className="text-xs text-yellow-400/70">
                                {new Date(msg.timestamp).toLocaleTimeString('ja-JP', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <p className="text-yellow-200 text-sm break-words">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // 通常のプレイヤーメッセージ
                      <div className="flex items-start space-x-2">
                        <div className="flex-shrink-0">
                          <Avatar playerName={msg.playerName} size="sm" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-baseline space-x-2 mb-1">
                            <span className="font-medium text-white text-sm">
                              {msg.playerName}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(msg.timestamp).toLocaleTimeString('ja-JP', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-gray-300 text-sm break-words">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </>
            ) : (
              <p className="text-gray-400 text-sm text-center">チャットメッセージはありません</p>
            )}
          </div>
          <div className="flex space-x-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
              placeholder="メッセージを入力..."
              className="flex-1 px-4 py-2.5 bg-white/10 border border-white/20 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white/15 transition-colors"
            />
            <button
              onClick={sendChatMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-md font-medium transition-colors"
            >
              送信
            </button>
          </div>
        </div>
      </div>

      {/* OpenAI API Key Modal */}
      <Modal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        title="OpenAI API Key Setup"
      >
        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            To add AI players, please enter your OpenAI API key. It will be stored locally in your browser.
          </p>
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {apiKeyError && (
            <p className="text-red-400 text-sm">{apiKeyError}</p>
          )}
          <div className="flex space-x-2">
            <button
              onClick={handleApiKeySubmit}
              disabled={isTestingApiKey || !apiKey}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {isTestingApiKey ? 'Testing...' : 'Save & Test'}
            </button>
            <button
              onClick={() => setShowApiKeyModal(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Your API key is stored locally and never sent to our servers.
          </p>
        </div>
      </Modal>


      {/* ルール説明モーダル */}
      <Modal
        isOpen={showRules}
        onClose={() => setShowRules(false)}
        title="人狼ゲームのルール"
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">ゲームの目的</h3>
            <p className="text-gray-300 text-sm">
              村人チームは人狼を全員見つけ出して処刑することが目的です。
              人狼チームは村人の数を人狼と同数以下にすることが目的です。
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">ゲームの流れ</h3>
            <ol className="list-decimal list-inside text-gray-300 text-sm space-y-1">
              <li>昼フェーズ（3分）: 全員で議論し、誰が人狼か推理します</li>
              <li>投票フェーズ（45秒）: 処刑する人を投票で決めます</li>
              <li>夜フェーズ（1分）: 人狼が襲撃する村人を選びます</li>
              <li>これを繰り返し、どちらかのチームが勝利条件を満たすまで続けます</li>
            </ol>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">役職一覧</h3>
            <div className="space-y-2">
              <div className="bg-white/10 p-2 rounded">
                <h4 className="font-medium text-white">村人</h4>
                <p className="text-gray-300 text-sm">特殊能力はありません。推理と議論で人狼を見つけましょう。</p>
              </div>
              <div className="bg-red-900/20 p-2 rounded">
                <h4 className="font-medium text-red-300">人狼</h4>
                <p className="text-gray-300 text-sm">夜に村人を襲撃できます。昼は村人のふりをしましょう。</p>
              </div>
              <div className="bg-blue-900/20 p-2 rounded">
                <h4 className="font-medium text-blue-300">占い師</h4>
                <p className="text-gray-300 text-sm">夜に一人を占い、人狼かどうか知ることができます。</p>
              </div>
              <div className="bg-purple-900/20 p-2 rounded">
                <h4 className="font-medium text-purple-300">霊媒師</h4>
                <p className="text-gray-300 text-sm">処刑された人が人狼だったかどうか知ることができます。</p>
              </div>
              <div className="bg-green-900/20 p-2 rounded">
                <h4 className="font-medium text-green-300">狩人</h4>
                <p className="text-gray-300 text-sm">夜に一人を守り、人狼の襲撃から護ることができます。</p>
              </div>
              <div className="bg-yellow-900/20 p-2 rounded">
                <h4 className="font-medium text-yellow-300">狂人</h4>
                <p className="text-gray-300 text-sm">人狼チームですが、誰が人狼か知りません。</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ヒントモーダル */}
      <Modal
        isOpen={showHint}
        onClose={() => setShowHint(false)}
        title="ゲームのヒント"
        size="lg"
      >
        <div className="space-y-4">
          {gameState?.phase === 'lobby' && (
            <div className="bg-blue-900/20 p-3 rounded">
              <p className="text-blue-300 text-sm">
                ゲームを始めるには最低4人のプレイヤーが必要です。
                AIプレイヤーを追加して人数を増やしましょう！
              </p>
            </div>
          )}
          
          {gameState?.phase === 'day' && (
            <div className="space-y-3">
              <div className="bg-yellow-900/20 p-3 rounded">
                <p className="text-yellow-300 text-sm">
                  昼フェーズ: みんなで話し合って怪しい人を見つけましょう。
                  発言の矛盾や不自然な行動に注目！
                </p>
              </div>
              <div className="bg-green-900/20 p-3 rounded">
                <p className="text-green-300 text-sm">
                  チャットで積極的に発言しましょう。
                  「誰が怪しいと思う？」「昨夜何か気づいたことは？」など
                </p>
              </div>
            </div>
          )}
          
          {gameState?.phase === 'voting' && (
            <div className="bg-red-900/20 p-3 rounded">
              <p className="text-red-300 text-sm">
                投票フェーズ: 最も怪しいと思う人に投票しましょう。
                最多票の人が処刑されます。
              </p>
            </div>
          )}
          
          {gameState?.phase === 'night' && (
            <div className="bg-blue-900/20 p-3 rounded">
              <p className="text-blue-300 text-sm">
                夜フェーズ: 特殊能力を持つ役職は行動できます。
                村人は朝を待ちましょう。
              </p>
            </div>
          )}
          
          <div className="border-t border-white/20 pt-3">
            <h4 className="font-medium text-white mb-2">初心者向けアドバイス</h4>
            <ul className="list-disc list-inside text-gray-300 text-sm space-y-1">
              <li>自分の役職は他の人に言わない方が安全です</li>
              <li>人狼は嘘をつくので、発言の一貫性をチェックしましょう</li>
              <li>投票で迷ったら、一番発言が少ない人も怪しいかも</li>
              <li>AIプレイヤーの発言にも注目してみましょう</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* ゲーム終了モーダル */}
      <Modal
        isOpen={showGameEndModal}
        onClose={() => {}}
        title="ゲーム終了"
        size="lg"
      >
        <div className="space-y-6">
          {gameResult && (
            <>
              <div className="text-center">
                <div className={`text-6xl mb-4 ${gameResult.winner === '村人チーム' ? 'text-blue-400' : 'text-red-400'}`}>
                  {gameResult.winner === '村人チーム' ? '勝利' : '敗北'}
                </div>
                <h2 className={`text-3xl font-bold mb-2 ${gameResult.winner === '村人チーム' ? 'text-blue-300' : 'text-red-300'}`}>
                  {gameResult.winner}の勝利！
                </h2>
                <p className="text-gray-300">
                  {gameResult.winner === '村人チーム'
                    ? '人狼を全員処刑することに成功しました！'
                    : '人狼が村を支配しました...'}
                </p>
              </div>

              <div className="bg-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">生存者</h3>
                <div className="grid grid-cols-1 gap-2">
                  {gameResult.survivors.map((player) => (
                    <div key={player.id} className="flex items-center space-x-3 p-2 bg-white/5 rounded">
                      <Avatar playerName={player.name} size="sm" />
                      <div className="flex-1">
                        <span className="text-white font-medium">{player.name}</span>
                        <span className="text-gray-400 text-sm ml-2">
                          ({player.role === 'villager' ? '村人' :
                            player.role === 'werewolf' ? '人狼' :
                            player.role === 'seer' ? '占い師' :
                            player.role === 'medium' ? '霊媒師' :
                            player.role === 'hunter' ? '狩人' :
                            player.role === 'madman' ? '狂人' : player.role})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">全プレイヤーの役職</h3>
                <div className="grid grid-cols-1 gap-2">
                  {gameState?.players?.map((player) => (
                    <div key={player.id} className={`flex items-center space-x-3 p-2 rounded ${player.isAlive ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
                      <Avatar playerName={player.name} size="sm" />
                      <div className="flex-1">
                        <span className={`font-medium ${player.isAlive ? 'text-green-300' : 'text-red-300'}`}>
                          {player.name}
                        </span>
                        <span className="text-gray-400 text-sm ml-2">
                          ({player.role === 'villager' ? '村人' :
                            player.role === 'werewolf' ? '人狼' :
                            player.role === 'seer' ? '占い師' :
                            player.role === 'medium' ? '霊媒師' :
                            player.role === 'hunter' ? '狩人' :
                            player.role === 'madman' ? '狂人' : player.role})
                        </span>
                        <span className={`text-xs ml-2 ${player.isAlive ? 'text-green-400' : 'text-red-400'}`}>
                          {player.isAlive ? '生存' : '死亡'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowGameEndModal(false)
                    // 観戦モードに移行（チャットは見れるが操作不可）
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors"
                >
                  📺 観戦を続ける
                </button>
                <button
                  onClick={() => {
                    window.location.href = '/'
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-4 rounded-md transition-colors"
                >
                  ホームに戻る
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}