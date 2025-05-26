import React from 'react'

// 幾何学的アバターパターン（モノクロ）
const avatarPatterns = [
  // パターン1: 六角形ベース
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="50,5 85,25 85,75 50,95 15,75 15,25" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <polygon points="50,20 70,30 70,70 50,80 30,70 30,30" fill={`rgba(255,255,255,${0.05 + intensity * 0.15})`}/>
      <circle cx="50" cy="45" r="8" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`}/>
    </svg>
  ),
  
  // パターン2: 三角形モジュール
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="50,10 85,85 15,85" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <polygon points="50,25 70,70 30,70" fill={`rgba(255,255,255,${0.05 + intensity * 0.15})`}/>
      <polygon points="50,35 60,55 40,55" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`}/>
    </svg>
  ),
  
  // パターン3: 菱形パターン
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="50,10 85,50 50,90 15,50" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <polygon points="50,25 70,50 50,75 30,50" fill={`rgba(255,255,255,${0.05 + intensity * 0.15})`}/>
      <polygon points="50,35 60,50 50,65 40,50" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`}/>
    </svg>
  ),
  
  // パターン4: 円形分割
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="40" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <path d="M 50,10 A 40,40 0 0,1 90,50 L 50,50 Z" fill={`rgba(255,255,255,${0.15 + intensity * 0.25})`}/>
      <path d="M 50,50 A 40,40 0 0,1 10,50 L 50,50 Z" fill={`rgba(255,255,255,${0.05 + intensity * 0.15})`}/>
      <circle cx="50" cy="50" r="15" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`}/>
    </svg>
  ),
  
  // パターン5: 正方形回転
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="15" y="15" width="70" height="70" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2" transform="rotate(15 50 50)"/>
      <rect x="25" y="25" width="50" height="50" fill={`rgba(255,255,255,${0.05 + intensity * 0.15})`} transform="rotate(30 50 50)"/>
      <rect x="35" y="35" width="30" height="30" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`} transform="rotate(45 50 50)"/>
    </svg>
  ),
  
  // パターン6: 星形
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="50,5 60,35 90,35 68,55 78,85 50,65 22,85 32,55 10,35 40,35" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <polygon points="50,20 55,40 75,40 59,52 64,72 50,60 36,72 41,52 25,40 45,40" fill={`rgba(255,255,255,${0.05 + intensity * 0.15})`}/>
      <circle cx="50" cy="50" r="12" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`}/>
    </svg>
  ),
  
  // パターン7: 八角形
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="30,15 70,15 85,30 85,70 70,85 30,85 15,70 15,30" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <polygon points="35,25 65,25 75,35 75,65 65,75 35,75 25,65 25,35" fill={`rgba(255,255,255,${0.05 + intensity * 0.15})`}/>
      <polygon points="40,35 60,35 65,40 65,60 60,65 40,65 35,60 35,40" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`}/>
    </svg>
  ),
  
  // パターン8: 螺旋
  (intensity: number) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="40" fill={`rgba(255,255,255,${0.1 + intensity * 0.3})`} stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <path d="M 50,10 A 30,30 0 1,1 80,50 A 20,20 0 1,1 50,70 A 10,10 0 1,1 60,50" fill="none" stroke={`rgba(255,255,255,${0.5 + intensity * 0.3})`} strokeWidth="3"/>
      <circle cx="50" cy="50" r="8" fill={`rgba(255,255,255,${0.3 + intensity * 0.4})`}/>
    </svg>
  )
]

// モノクロ強度パレット（0.0-1.0）
const intensityPalette = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0
]

// システム専用アバター（モノクロ幾何学）
const systemAvatar = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full">
    <polygon points="50,10 80,25 80,75 50,90 20,75 20,25" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
    <rect x="35" y="30" width="30" height="20" fill="rgba(255,255,255,0.1)" rx="3"/>
    <circle cx="42" cy="40" r="3" fill="rgba(255,255,255,0.4)"/>
    <circle cx="58" cy="40" r="3" fill="rgba(255,255,255,0.4)"/>
    <rect x="40" y="55" width="20" height="3" fill="rgba(255,255,255,0.3)" rx="1"/>
    <rect x="35" y="65" width="30" height="8" fill="rgba(255,255,255,0.2)" rx="4"/>
    <polygon points="50,70 45,75 55,75" fill="rgba(255,255,255,0.3)"/>
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
  
  // ハッシュ値を使ってパターンと強度を選択
  const patternIndex = Math.abs(hash) % avatarPatterns.length
  const intensityIndex = Math.abs(hash >> 8) % intensityPalette.length
  
  const pattern = avatarPatterns[patternIndex]
  const intensity = intensityPalette[intensityIndex]
  
  return pattern(intensity)
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