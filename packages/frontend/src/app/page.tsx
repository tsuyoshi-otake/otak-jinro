'use client'

import { useState } from 'react'

export default function HomePage() {
  const [roomId, setRoomId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      alert('プレイヤー名を入力してください')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/rooms', {
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
        window.location.href = `/room/${result.data.roomId}?name=${encodeURIComponent(playerName)}`
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
      const response = await fetch(`/api/rooms/${roomId.toUpperCase()}/join`, {
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
        window.location.href = `/room/${roomId.toUpperCase()}?name=${encodeURIComponent(playerName)}`
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
      <div className="w-full max-w-md space-y-8">
        {/* ヘッダー */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">🌙 Otak Jinro ☀️</h1>
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
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* ルーム作成 */}
            <button 
              onClick={handleCreateRoom}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50"
            >
              {isLoading ? '作成中...' : '🏠 ルームを作成'}
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
                className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 uppercase"
              />
            </div>

            <button 
              onClick={handleJoinRoom}
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50"
            >
              {isLoading ? '参加中...' : '🚪 ルームに参加'}
            </button>
          </div>
        </div>

        {/* ゲーム説明 */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg shadow-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3 text-center">ゲームについて</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>
              <strong>人狼ゲーム</strong>は、村人チームと人狼チームに分かれて戦う推理ゲームです。
            </p>
            <div className="space-y-1">
              <p><strong>村人チーム:</strong> 人狼を全員処刑すれば勝利</p>
              <p><strong>人狼チーム:</strong> 村人と同数以下になれば勝利</p>
            </div>
            <p className="text-xs text-gray-400">
              最低4人から最大20人まで参加可能です
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}