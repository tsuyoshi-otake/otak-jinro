
// Export type definitions
export * from './types/game';

// Export utility functions
export * from './utils/gameUtils';

// Constants definition
export const GAME_CONSTANTS = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 10,
  DEFAULT_DAY_DURATION: 90,     // 1.5 minutes (was 3)
  DEFAULT_NIGHT_DURATION: 30,   // 30 seconds (was 1 minute)
  DEFAULT_VOTING_DURATION: 30,  // 30 seconds (was 45 seconds)
  ROOM_ID_LENGTH: 6,
  MAX_CHAT_MESSAGE_LENGTH: 500,
  MAX_PLAYER_NAME_LENGTH: 20,
  MIN_PLAYER_NAME_LENGTH: 2,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  INVALID_PLAYER_NAME: 'Player name must be 2-20 characters',
  ROOM_NOT_FOUND: 'Room not found',
  ROOM_FULL: 'Room is full',
  GAME_ALREADY_STARTED: 'Game has already started',
  NOT_HOST: 'Only host can perform this action',
  PLAYER_NOT_FOUND: 'Player not found',
  INVALID_ACTION: 'Invalid action',
  GAME_NOT_STARTED: 'Game has not started',
  INSUFFICIENT_PLAYERS: 'Minimum 4 players required',
  ALREADY_VOTED: 'Already voted',
  VOTING_NOT_ALLOWED: 'Voting not allowed',
  ABILITY_NOT_AVAILABLE: 'Ability not available',
} as const;

// Role information
export const ROLE_INFO = {
  villager: {
    name: 'Villager',
    team: 'villagers',
    description: 'Find and eliminate werewolves to win',
    abilities: [],
  },
  werewolf: {
    name: 'Werewolf',
    team: 'werewolves',
    description: 'Attack villagers at night and hide your identity during the day',
    abilities: ['attack'],
  },
  seer: {
    name: 'Seer',
    team: 'villagers',
    description: 'Can divine one player each night to know if they are a werewolf',
    abilities: ['divine'],
  },
  medium: {
    name: 'Medium',
    team: 'villagers',
    description: 'Can know if an executed player was a werewolf',
    abilities: ['medium'],
  },
  hunter: {
    name: 'Hunter',
    team: 'villagers',
    description: 'Can protect one player from werewolf attacks each night',
    abilities: ['guard'],
  },
  madman: {
    name: 'Madman',
    team: 'werewolves',
    description: 'On the werewolf team but does not know who the werewolves are',
    abilities: [],
  },
} as const;