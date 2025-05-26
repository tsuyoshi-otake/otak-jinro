'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import RoomPage from './room/page'
export default function HomePage() {
  const searchParams = useSearchParams()
  const currentRoomId = searchParams.get('roomId')
  
  // すべてのhooksを先に定義
  const [roomId, setRoomId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  // URLパラメータにroomIdがある場合はルームページを表示
  if (currentRoomId) {
    return <RoomPage />
  }

  // コンポーネントマウント時に保存されたプレイヤー名を読み込み
  useEffect(() => {
    const savedPlayerName = localStorage.getItem('otak-jinro-player-name')
    if (savedPlayerName) {
      setPlayerName(savedPlayerName)
    }
  }, [])

  // プレイヤー名が変更されたときにlocalStorageに保存
  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name)
    if (name.trim()) {
      localStorage.setItem('otak-jinro-player-name', name.trim())
    } else {
      localStorage.removeItem('otak-jinro-player-name')
    }
  }

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      alert('プレイヤー名を入力してください')
      return
    }

    setIsLoading(true)
    try {
      const workersUrl = process.env.NEXT_PUBLIC_WORKERS_URL || 'https://otak-jinro-workers.systemexe-research-and-development.workers.dev'
      const response = await fetch(`${workersUrl}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerName: playerName,
          hostName: playerName,
          settings: {
            maxPlayers: 12,
            dayDuration: 300,
            nightDuration: 120,
            votingDuration: 60,
            enableVoiceChat: false,
            enableSpectators: true,
            customRoles: []
          }
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        const basePath = process.env.NODE_ENV === 'production' ? '/otak-jinro' : ''
        window.location.href = `${basePath}/?roomId=${result.data.roomId}&name=${encodeURIComponent(playerName)}`
      } else {
        alert('ルーム作成に失敗しました: ' + result.error)
      }
    } catch (error) {
      console.error('Error creating room:', error)
      alert('ルーム作成中にエラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomId.trim() || !playerName.trim()) {
      alert('ルームIDとプレイヤー名を入力してください')
      return
    }

    setIsLoading(true)
    try {
      const workersUrl = process.env.NEXT_PUBLIC_WORKERS_URL || 'https://otak-jinro-workers.systemexe-research-and-development.workers.dev'
      const response = await fetch(`${workersUrl}/api/rooms/${roomId.toUpperCase()}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerName: playerName
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        const basePath = process.env.NODE_ENV === 'production' ? '/otak-jinro' : ''
        window.location.href = `${basePath}/?roomId=${roomId.toUpperCase()}&name=${encodeURIComponent(playerName)}`
      } else {
        alert('ルーム参加に失敗しました: ' + result.error)
      }
    } catch (error) {
      console.error('Error joining room:', error)
      alert('ルーム参加中にエラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* ヘッダー */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">otak-jinro</h1>
          <p className="text-lg text-gray-300">
            リアルタイムオンライン人狼ゲーム
          </p>
        </div>

        {/* メインカード */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4 text-center">ゲームに参加</h2>
          <p className="text-sm text-gray-300 mb-6 text-center">
            新しいルームを作成するか、既存のルームに参加してください
          </p>

          <div className="space-y-4">
            {/* プレイヤー名入力 */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                プレイヤー名
              </label>
              <input
                type="text"
                placeholder="あなたの名前を入力"
                value={playerName}
                onChange={(e) => handlePlayerNameChange(e.target.value)}
                maxLength={20}
                className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </div>


            {/* ルーム作成 */}
            <button
              onClick={handleCreateRoom}
              disabled={isLoading || !playerName.trim()}
              className="w-full bg-white/10 hover:bg-white/20 disabled:bg-white/5 border border-white/20 hover:border-white/30 disabled:border-white/10 text-white disabled:text-gray-400 font-medium py-2 px-4 rounded-md transition-colors disabled:cursor-not-allowed"
            >
              {isLoading ? '作成中...' : 'ルームを作成'}
            </button>

            <div className="text-center text-gray-400">または</div>

            {/* ルーム参加 */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                ルームID
              </label>
              <input
                type="text"
                placeholder="6文字のルームID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                maxLength={6}
                disabled={!playerName.trim()}
                className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/50 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={isLoading || !playerName.trim() || !roomId.trim()}
              className="w-full bg-white/10 hover:bg-white/20 disabled:bg-white/5 border border-white/20 hover:border-white/30 disabled:border-white/10 text-white disabled:text-gray-400 font-medium py-2 px-4 rounded-md transition-colors disabled:cursor-not-allowed"
            >
              {isLoading ? '参加中...' : 'ルームに参加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}