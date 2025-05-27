import {
  assignRoles,
  checkWinCondition,
  countVotes,
  getExecutionTarget,
  canPlayerAct,
  generateRoomId,
  validatePlayerName,
  getTeamMembers
} from '../gameUtils';
import { Player, PlayerRole, GameState, Vote } from '../../types/game';

describe('gameUtils', () => {
  // テスト用のプレイヤーデータを作成するヘルパー関数
  const createPlayer = (id: string, name: string, role: PlayerRole = 'villager', isAlive: boolean = true): Player => ({
    id,
    name,
    role,
    isAlive,
    isHost: false,
    isReady: true,
    joinedAt: Date.now()
  });

  // テスト用のゲーム状態を作成するヘルパー関数
  const createGameState = (phase: GameState['phase'], players: Player[]): GameState => ({
    id: 'test-game',
    phase,
    players,
    currentDay: 1,
    timeRemaining: 60,
    votes: [],
    chatMessages: [],
    gameSettings: {
      maxPlayers: 8,
      dayDuration: 300,
      nightDuration: 120,
      votingDuration: 60,
      enableVoiceChat: false,
      enableSpectators: false,
      customRoles: []
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  describe('assignRoles', () => {
    it('4人プレイヤーに正しく役職を割り当てる', () => {
      const players = [
        createPlayer('1', 'Player1'),
        createPlayer('2', 'Player2'),
        createPlayer('3', 'Player3'),
        createPlayer('4', 'Player4')
      ];

      const result = assignRoles(players);

      expect(result).toHaveLength(4);
      expect(result.every(p => p.role)).toBe(true);
      
      // 4人の場合: 人狼1, 占い師1, 村人2
      const werewolves = result.filter(p => p.role === 'werewolf');
      const seers = result.filter(p => p.role === 'seer');
      const villagers = result.filter(p => p.role === 'villager');
      
      expect(werewolves).toHaveLength(1);
      expect(seers).toHaveLength(1);
      expect(villagers).toHaveLength(2);
    });

    it('8人プレイヤーに正しく役職を割り当てる', () => {
      const players = Array.from({ length: 8 }, (_, i) => 
        createPlayer(`${i + 1}`, `Player${i + 1}`)
      );

      const result = assignRoles(players);

      expect(result).toHaveLength(8);
      
      // 8人の場合: 人狼2, 占い師1, 霊媒師1, 狩人1, 狂人1, 村人2
      const werewolves = result.filter(p => p.role === 'werewolf');
      const seers = result.filter(p => p.role === 'seer');
      const mediums = result.filter(p => p.role === 'medium');
      const hunters = result.filter(p => p.role === 'hunter');
      const madmen = result.filter(p => p.role === 'madman');
      const villagers = result.filter(p => p.role === 'villager');
      
      expect(werewolves).toHaveLength(2);
      expect(seers).toHaveLength(1);
      expect(mediums).toHaveLength(1);
      expect(hunters).toHaveLength(1);
      expect(madmen).toHaveLength(1);
      expect(villagers).toHaveLength(2);
    });

    it('カスタム役職配分を使用する', () => {
      const players = Array.from({ length: 4 }, (_, i) => 
        createPlayer(`${i + 1}`, `Player${i + 1}`)
      );
      const customRoles: PlayerRole[] = ['werewolf', 'seer', 'villager', 'villager'];

      const result = assignRoles(players, customRoles);

      expect(result).toHaveLength(4);
      expect(result.filter(p => p.role === 'werewolf')).toHaveLength(1);
      expect(result.filter(p => p.role === 'seer')).toHaveLength(1);
      expect(result.filter(p => p.role === 'villager')).toHaveLength(2);
    });

    it('プレイヤー数と役職数が一致しない場合エラーを投げる', () => {
      const players = [createPlayer('1', 'Player1')];
      const customRoles: PlayerRole[] = ['werewolf', 'villager'];

      expect(() => assignRoles(players, customRoles)).toThrow(
        'Role count (2) does not match player count (1)'
      );
    });

    it('最小プレイヤー数未満の場合エラーを投げる', () => {
      const players = [
        createPlayer('1', 'Player1'),
        createPlayer('2', 'Player2'),
        createPlayer('3', 'Player3')
      ];

      expect(() => assignRoles(players)).toThrow('Minimum 4 players required');
    });
  });

  describe('checkWinCondition', () => {
    it('人狼が全滅した場合、村人チームの勝利を返す', () => {
      const players = [
        createPlayer('1', 'Player1', 'villager', true),
        createPlayer('2', 'Player2', 'seer', true),
        createPlayer('3', 'Player3', 'werewolf', false), // 死亡
        createPlayer('4', 'Player4', 'villager', true)
      ];

      const result = checkWinCondition(players);
      expect(result).toBe('villagers');
    });

    it('人狼数が村人数以上の場合、人狼チームの勝利を返す', () => {
      const players = [
        createPlayer('1', 'Player1', 'villager', false), // 死亡
        createPlayer('2', 'Player2', 'seer', false), // 死亡
        createPlayer('3', 'Player3', 'werewolf', true),
        createPlayer('4', 'Player4', 'werewolf', true)
      ];

      const result = checkWinCondition(players);
      expect(result).toBe('werewolves');
    });

    it('ゲームが継続中の場合、nullを返す', () => {
      const players = [
        createPlayer('1', 'Player1', 'villager', true),
        createPlayer('2', 'Player2', 'seer', true),
        createPlayer('3', 'Player3', 'werewolf', true),
        createPlayer('4', 'Player4', 'villager', true)
      ];

      const result = checkWinCondition(players);
      expect(result).toBeNull();
    });

    it('狂人は人狼チームとして扱われる', () => {
      const players = [
        createPlayer('1', 'Player1', 'villager', false), // 死亡
        createPlayer('2', 'Player2', 'seer', false), // 死亡
        createPlayer('3', 'Player3', 'werewolf', true),
        createPlayer('4', 'Player4', 'madman', true) // 狂人は人狼チーム
      ];

      const result = checkWinCondition(players);
      expect(result).toBe('werewolves');
    });
  });

  describe('countVotes', () => {
    it('投票を正しく集計する', () => {
      const votes: Vote[] = [
        { voterId: '1', targetId: 'target1', timestamp: Date.now() },
        { voterId: '2', targetId: 'target1', timestamp: Date.now() },
        { voterId: '3', targetId: 'target2', timestamp: Date.now() },
        { voterId: '4', targetId: 'target1', timestamp: Date.now() }
      ];

      const result = countVotes(votes);

      expect(result).toEqual([
        { targetId: 'target1', count: 3 },
        { targetId: 'target2', count: 1 }
      ]);
    });

    it('空の投票配列の場合、空配列を返す', () => {
      const result = countVotes([]);
      expect(result).toEqual([]);
    });
  });

  describe('getExecutionTarget', () => {
    it('最多票のターゲットを返す', () => {
      const votes: Vote[] = [
        { voterId: '1', targetId: 'target1', timestamp: Date.now() },
        { voterId: '2', targetId: 'target1', timestamp: Date.now() },
        { voterId: '3', targetId: 'target2', timestamp: Date.now() }
      ];

      const result = getExecutionTarget(votes);
      expect(result).toBe('target1');
    });

    it('同票の場合、いずれかのターゲットを返す', () => {
      const votes: Vote[] = [
        { voterId: '1', targetId: 'target1', timestamp: Date.now() },
        { voterId: '2', targetId: 'target2', timestamp: Date.now() }
      ];

      const result = getExecutionTarget(votes);
      expect(['target1', 'target2']).toContain(result);
    });

    it('投票がない場合、nullを返す', () => {
      const result = getExecutionTarget([]);
      expect(result).toBeNull();
    });
  });

  describe('canPlayerAct', () => {
    const gameState = createGameState('voting', []);

    it('生きているプレイヤーが投票フェーズで投票できる', () => {
      const player = createPlayer('1', 'Player1', 'villager', true);
      const result = canPlayerAct(player, gameState, 'vote');
      expect(result).toBe(true);
    });

    it('死んでいるプレイヤーは行動できない', () => {
      const player = createPlayer('1', 'Player1', 'villager', false);
      const result = canPlayerAct(player, gameState, 'vote');
      expect(result).toBe(false);
    });

    it('占い師が夜フェーズで占いを使用できる', () => {
      const player = createPlayer('1', 'Player1', 'seer', true);
      const nightGameState = createGameState('night', []);
      const result = canPlayerAct(player, nightGameState, 'seer_ability');
      expect(result).toBe(true);
    });

    it('村人は占いを使用できない', () => {
      const player = createPlayer('1', 'Player1', 'villager', true);
      const nightGameState = createGameState('night', []);
      const result = canPlayerAct(player, nightGameState, 'seer_ability');
      expect(result).toBe(false);
    });
  });

  describe('generateRoomId', () => {
    it('6文字のルームIDを生成する', () => {
      const roomId = generateRoomId();
      expect(roomId).toHaveLength(6);
      expect(/^[A-Z0-9]+$/.test(roomId)).toBe(true);
    });

    it('複数回実行して異なるIDを生成する', () => {
      const ids = Array.from({ length: 10 }, () => generateRoomId());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBeGreaterThan(1);
    });
  });

  describe('validatePlayerName', () => {
    it('有効な名前を受け入れる', () => {
      expect(validatePlayerName('太郎')).toBe(true);
      expect(validatePlayerName('Player1')).toBe(true);
      expect(validatePlayerName('プレイヤー')).toBe(true);
      expect(validatePlayerName('田中 太郎')).toBe(true);
    });

    it('短すぎる名前を拒否する', () => {
      expect(validatePlayerName('a')).toBe(false);
      expect(validatePlayerName('')).toBe(false);
    });

    it('長すぎる名前を拒否する', () => {
      const longName = 'a'.repeat(21);
      expect(validatePlayerName(longName)).toBe(false);
    });

    it('無効な文字を含む名前を拒否する', () => {
      expect(validatePlayerName('Player@')).toBe(false);
      expect(validatePlayerName('Player#1')).toBe(false);
      expect(validatePlayerName('Player!')).toBe(false);
    });
  });

  describe('getTeamMembers', () => {
    const players = [
      createPlayer('1', 'Player1', 'villager'),
      createPlayer('2', 'Player2', 'werewolf'),
      createPlayer('3', 'Player3', 'seer'),
      createPlayer('4', 'Player4', 'madman')
    ];

    it('村人チームのメンバーを正しく取得する', () => {
      const villagerTeam = getTeamMembers(players, 'villagers');
      expect(villagerTeam).toHaveLength(2);
      expect(villagerTeam.map(p => p.role)).toEqual(['villager', 'seer']);
    });

    it('人狼チームのメンバーを正しく取得する', () => {
      const werewolfTeam = getTeamMembers(players, 'werewolves');
      expect(werewolfTeam).toHaveLength(2);
      expect(werewolfTeam.map(p => p.role)).toEqual(['werewolf', 'madman']);
    });
  });
});