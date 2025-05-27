// Game phases
export type GamePhase = 'lobby' | 'day' | 'night' | 'voting' | 'ended';

// Player roles
export type PlayerRole =
  | 'villager'    // Villager
  | 'werewolf'    // Werewolf
  | 'seer'        // Seer
  | 'medium'      // Medium
  | 'hunter'      // Hunter
  | 'madman';     // Madman

// AI personality and emotional state
export interface AIPersonality {
  gender: 'male' | 'female' | 'neutral';
  personality: 'aggressive' | 'cautious' | 'analytical' | 'emotional' | 'charismatic' | 'suspicious';
  emotionalState: {
    happiness: number;    // 0-100
    anger: number;        // 0-100
    fear: number;         // 0-100
    confidence: number;   // 0-100
    suspicion: number;    // 0-100
  };
  traits: string[];       // ['logical', 'impulsive', 'protective', etc.]
  speechPattern: 'formal' | 'casual' | 'dramatic' | 'quiet' | 'talkative';
  biases: {
    trustsEasily: boolean;
    quickToAccuse: boolean;
    followsLeader: boolean;
    independent: boolean;
  };
}

// Ability result interfaces
export interface SeerResult {
  day: number;
  target: string;
  result: string;
  timestamp: number;
}

export interface MediumResult {
  day: number;
  target: string;
  result: string;
  timestamp: number;
}

export interface VoteRound {
  day: number;
  votes: Vote[];
  executed?: string;
  timestamp: number;
}

// Player information
export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  isAlive: boolean;
  isHost: boolean;
  isReady: boolean;
  avatar?: string;
  joinedAt: number;
  aiPersonality?: AIPersonality;  // AI専用の個性データ
  seerResults?: SeerResult[];     // 占い師の占い結果履歴
  mediumResults?: MediumResult[]; // 霊媒師の霊視結果履歴
}

// Vote information
export interface Vote {
  voterId: string;
  targetId: string;
  timestamp: number;
}

// Night action
export interface NightAction {
  type: 'attack' | 'guard' | 'divine';
  actorId: string;
  targetId: string;
  timestamp: number;
}

// Chat message
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  timestamp: number;
  type: 'public' | 'werewolf' | 'system';
}

// Game state
export interface GameState {
  id: string;
  phase: GamePhase;
  players: Player[];
  currentDay: number;
  timeRemaining: number;
  votes: Vote[];
  chatMessages: ChatMessage[];
  nightActions?: NightAction[];
  lastExecuted?: Player | null;  // 前日の処刑者（霊媒師用）
  voteHistory?: VoteRound[];     // 投票履歴
  gameSettings: GameSettings;
  isPublic: boolean;             // 公開ルーム設定
  createdAt: number;
  updatedAt: number;
}

// Game settings
export interface GameSettings {
  maxPlayers: number;
  dayDuration: number;    // seconds
  nightDuration: number;  // seconds
  votingDuration: number; // seconds
  enableVoiceChat: boolean;
  enableSpectators: boolean;
  customRoles: PlayerRole[];
}

// Game result
export interface GameResult {
  winningTeam: 'villagers' | 'werewolves' | 'draw';
  survivors: Player[];
  gameStats: {
    totalDays: number;
    totalVotes: number;
    totalMessages: number;
    duration: number; // milliseconds
  };
}

// Public room info for listing
export interface PublicRoomInfo {
  id: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
  createdAt: number;
}

// WebSocket message types
export type WebSocketMessage =
  | { type: 'join_room'; roomId: string; player: Omit<Player, 'id' | 'role' | 'joinedAt'> }
  | { type: 'leave_room'; roomId: string; playerId: string }
  | { type: 'start_game'; roomId: string }
  | { type: 'vote'; roomId: string; vote: Omit<Vote, 'timestamp'> }
  | { type: 'chat'; roomId: string; message: Omit<ChatMessage, 'id' | 'timestamp'>; isAI?: boolean; aiPlayerId?: string }
  | { type: 'use_ability'; roomId: string; playerId: string; targetId?: string }
  | { type: 'add_ai_player'; roomId: string }
  | { type: 'kick_player'; roomId: string; playerId: string }
  | { type: 'toggle_public'; roomId: string; playerId: string }  // 公開/非公開切り替え
  | { type: 'join_random_room'; player: Omit<Player, 'id' | 'role' | 'joinedAt'> }  // ランダム参加
  | { type: 'player_kicked'; playerId: string; playerName: string; kickedBy: string }
  | { type: 'game_state_update'; gameState: GameState }
  | { type: 'player_joined'; player: Player }
  | { type: 'player_left'; playerId: string }
  | { type: 'ability_used'; message: string }
  | { type: 'room_visibility_changed'; isPublic: boolean }  // 公開設定変更通知
  | { type: 'divine_result'; message: string }
  | { type: 'medium_result'; message: string }
  | { type: 'vote_result'; message: string }
  | { type: 'execution_result'; message: string }
  | { type: 'phase_change'; phase: string; deathMessage?: string }
  | { type: 'system_message'; message: string; messageId: string }
  | { type: 'game_ended'; result: { winner: string; reason?: string } }
  | { type: 'error'; message: string };

// API response type
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

// Create room request
export interface CreateRoomRequest {
  hostName: string;
  settings: GameSettings;
}

// Join room request
export interface JoinRoomRequest {
  roomId: string;
  playerName: string;
}