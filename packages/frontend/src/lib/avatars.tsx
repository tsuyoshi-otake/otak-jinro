import React from 'react'

// アバターのパターン
const avatarPatterns = [
  // パターン1: シンプルな顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <circle cx="35" cy="40" r="5" fill="#333" />
      <circle cx="65" cy="40" r="5" fill="#333" />
      <path d="M 35 65 Q 50 75 65 65" stroke="#333" strokeWidth="3" fill="none" />
    </svg>
  ),
  
  // パターン2: 眼鏡をかけた顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <circle cx="35" cy="40" r="12" fill="none" stroke="#333" strokeWidth="2" />
      <circle cx="65" cy="40" r="12" fill="none" stroke="#333" strokeWidth="2" />
      <line x1="47" y1="40" x2="53" y2="40" stroke="#333" strokeWidth="2" />
      <circle cx="35" cy="40" r="3" fill="#333" />
      <circle cx="65" cy="40" r="3" fill="#333" />
      <path d="M 35 65 Q 50 70 65 65" stroke="#333" strokeWidth="3" fill="none" />
    </svg>
  ),
  
  // パターン3: 笑顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <path d="M 30 35 Q 35 30 40 35" stroke="#333" strokeWidth="3" fill="none" />
      <path d="M 60 35 Q 65 30 70 35" stroke="#333" strokeWidth="3" fill="none" />
      <path d="M 30 60 Q 50 80 70 60" stroke="#333" strokeWidth="3" fill="none" />
    </svg>
  ),
  
  // パターン4: クールな顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <rect x="25" y="38" width="20" height="4" fill="#333" />
      <rect x="55" y="38" width="20" height="4" fill="#333" />
      <line x1="35" y1="65" x2="65" y2="65" stroke="#333" strokeWidth="3" />
    </svg>
  ),
  
  // パターン5: 驚いた顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <circle cx="35" cy="40" r="8" fill="#fff" stroke="#333" strokeWidth="2" />
      <circle cx="65" cy="40" r="8" fill="#fff" stroke="#333" strokeWidth="2" />
      <circle cx="35" cy="40" r="4" fill="#333" />
      <circle cx="65" cy="40" r="4" fill="#333" />
      <ellipse cx="50" cy="65" rx="15" ry="10" fill="#333" />
    </svg>
  ),
  
  // パターン6: ウインクする顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <path d="M 25 40 Q 35 35 45 40" stroke="#333" strokeWidth="3" fill="none" />
      <circle cx="65" cy="40" r="5" fill="#333" />
      <path d="M 35 65 Q 50 75 65 65" stroke="#333" strokeWidth="3" fill="none" />
    </svg>
  ),
  
  // パターン7: 髭のある顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <circle cx="35" cy="40" r="5" fill="#333" />
      <circle cx="65" cy="40" r="5" fill="#333" />
      <path d="M 35 65 Q 50 70 65 65" stroke="#333" strokeWidth="3" fill="none" />
      <path d="M 30 55 Q 50 60 70 55" stroke="#333" strokeWidth="2" fill="none" />
    </svg>
  ),
  
  // パターン8: 帽子をかぶった顔
  (color: string) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="45" fill={color} />
      <rect x="20" y="15" width="60" height="25" fill="#444" rx="5" />
      <rect x="15" y="35" width="70" height="5" fill="#333" />
      <circle cx="35" cy="50" r="4" fill="#333" />
      <circle cx="65" cy="50" r="4" fill="#333" />
      <path d="M 35 70 Q 50 75 65 70" stroke="#333" strokeWidth="3" fill="none" />
    </svg>
  )
]

// 色のパレット
const colorPalette = [
  '#FFB6C1', // ライトピンク
  '#87CEEB', // スカイブルー
  '#98FB98', // ペールグリーン
  '#DDA0DD', // プラム
  '#F0E68C', // カーキ
  '#FFE4B5', // モカシン
  '#B0E0E6', // パウダーブルー
  '#F5DEB3', // ウィート
  '#D8BFD8', // シスル
  '#FFDAB9', // ピーチパフ
]

// システム専用アバター
const systemAvatar = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full">
    <circle cx="50" cy="50" r="45" fill="#6B7280" />
    <rect x="30" y="25" width="40" height="30" fill="#374151" rx="5" />
    <rect x="35" y="30" width="30" height="20" fill="#9CA3AF" rx="2" />
    <circle cx="40" cy="40" r="2" fill="#10B981" />
    <circle cx="50" cy="40" r="2" fill="#F59E0B" />
    <circle cx="60" cy="40" r="2" fill="#EF4444" />
    <rect x="35" y="45" width="30" height="2" fill="#6B7280" />
    <rect x="35" y="48" width="20" height="2" fill="#6B7280" />
    <rect x="25" y="65" width="50" height="8" fill="#374151" rx="4" />
    <rect x="30" y="67" width="40" height="4" fill="#9CA3AF" rx="2" />
  </svg>
)

// プレイヤー名からアバターを生成
export function generateAvatar(playerName: string): React.ReactNode {
  // Systemの場合は専用アバターを返す
  if (playerName === 'System') {
    return systemAvatar()
  }
  
  // 名前からハッシュ値を生成
  let hash = 0
  for (let i = 0; i < playerName.length; i++) {
    hash = ((hash << 5) - hash) + playerName.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  
  // ハッシュ値を使ってパターンと色を選択
  const patternIndex = Math.abs(hash) % avatarPatterns.length
  const colorIndex = Math.abs(hash >> 8) % colorPalette.length
  
  const pattern = avatarPatterns[patternIndex]
  const color = colorPalette[colorIndex]
  
  return pattern(color)
}

// アバターコンポーネント
interface AvatarProps {
  playerName: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ playerName, size = 'md', className = '' }: AvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  }
  
  return (
    <div className={`${sizeClasses[size]} ${className} rounded-full overflow-hidden bg-white/10`}>
      {generateAvatar(playerName)}
    </div>
  )
}