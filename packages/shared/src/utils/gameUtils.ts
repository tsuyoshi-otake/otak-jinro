import { Player, PlayerRole, GameState, Vote } from '../types/game.js';

/**
 * Assign roles to players
 */
export function assignRoles(players: Player[], customRoles?: PlayerRole[]): Player[] {
  const playerCount = players.length;
  
  // Default role assignment logic
  const roles: PlayerRole[] = customRoles || getDefaultRoles(playerCount);
  
  if (roles.length !== playerCount) {
    throw new Error(`Role count (${roles.length}) does not match player count (${playerCount})`);
  }
  
  // Shuffle roles
  const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);
  
  return players.map((player, index) => ({
    ...player,
    role: shuffledRoles[index]
  }));
}

/**
 * Get default role distribution based on player count
 */
function getDefaultRoles(playerCount: number): PlayerRole[] {
  const roles: PlayerRole[] = [];
  
  if (playerCount < 4) {
    throw new Error('Minimum 4 players required');
  }
  
  // Essential roles that must always appear
  roles.push('werewolf');  // 必ず人狼1人
  roles.push('seer');      // 必ず占い師1人
  
  // Add additional werewolves based on player count (about 1/3 total)
  const targetWerewolfCount = Math.max(1, Math.floor(playerCount / 3));
  const additionalWerewolves = targetWerewolfCount - 1; // -1 because we already added 1
  
  for (let i = 0; i < additionalWerewolves; i++) {
    roles.push('werewolf');
  }
  
  // Add other special roles based on player count
  if (playerCount >= 5) roles.push('medium');    // 霊媒師
  if (playerCount >= 6) roles.push('hunter');    // 狩人
  if (playerCount >= 7) roles.push('madman');    // 狂人
  
  // Fill remaining with villagers
  const remainingCount = playerCount - roles.length;
  for (let i = 0; i < remainingCount; i++) {
    roles.push('villager');
  }
  
  return roles;
}

/**
 * Check win condition
 */
export function checkWinCondition(players: Player[]): 'villagers' | 'werewolves' | null {
  const alivePlayers = players.filter(p => p.isAlive);
  const aliveWerewolves = alivePlayers.filter(p => p.role === 'werewolf');
  const aliveVillagers = alivePlayers.filter(p =>
    p.role !== 'werewolf' && p.role !== 'madman'
  );
  
  console.log('Win condition check:', {
    total: alivePlayers.length,
    werewolves: aliveWerewolves.length,
    villagers: aliveVillagers.length,
    players: alivePlayers.map(p => ({ name: p.name, role: p.role, alive: p.isAlive }))
  });
  
  // All werewolves eliminated → Villagers win
  if (aliveWerewolves.length === 0) {
    console.log('Villagers win: No werewolves left');
    return 'villagers';
  }
  
  // Werewolves >= Villagers → Werewolves win
  if (aliveWerewolves.length >= aliveVillagers.length) {
    console.log('Werewolves win: Equal or more werewolves than villagers');
    return 'werewolves';
  }
  
  console.log('Game continues');
  return null; // Game continues
}

/**
 * Count voting results
 */
export function countVotes(votes: Vote[]): { targetId: string; count: number }[] {
  const voteCount = new Map<string, number>();
  
  votes.forEach(vote => {
    const current = voteCount.get(vote.targetId) || 0;
    voteCount.set(vote.targetId, current + 1);
  });
  
  return Array.from(voteCount.entries())
    .map(([targetId, count]) => ({ targetId, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get execution target (random selection in case of tie)
 */
export function getExecutionTarget(votes: Vote[]): string | null {
  const voteCounts = countVotes(votes);
  
  if (voteCounts.length === 0) {
    return null;
  }
  
  const maxVotes = voteCounts[0].count;
  const topCandidates = voteCounts.filter(v => v.count === maxVotes);
  
  // Random selection in case of tie
  const randomIndex = Math.floor(Math.random() * topCandidates.length);
  return topCandidates[randomIndex].targetId;
}

/**
 * Check if player can perform specific action
 */
export function canPlayerAct(player: Player, gameState: GameState, action: string): boolean {
  if (!player.isAlive) return false;
  
  switch (action) {
    case 'vote':
      return gameState.phase === 'voting';
    
    case 'seer_ability':
      return player.role === 'seer' && gameState.phase === 'night';
    
    case 'medium_ability':
      return player.role === 'medium' && gameState.phase === 'night';
    
    case 'hunter_ability':
      return player.role === 'hunter' && gameState.phase === 'night';
    
    case 'werewolf_attack':
      return player.role === 'werewolf' && gameState.phase === 'night';
    
    default:
      return false;
  }
}

/**
 * Generate random room ID
 */
export function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate player name
 */
export function validatePlayerName(name: string): boolean {
  return name.length >= 2 && name.length <= 20 && /^[a-zA-Z0-9あ-んア-ヶー一-龯\s]+$/.test(name);
}

/**
 * Get team members
 */
export function getTeamMembers(players: Player[], team: 'villagers' | 'werewolves'): Player[] {
  if (team === 'werewolves') {
    return players.filter(p => p.role === 'werewolf' || p.role === 'madman');
  } else {
    return players.filter(p => p.role !== 'werewolf' && p.role !== 'madman');
  }
}