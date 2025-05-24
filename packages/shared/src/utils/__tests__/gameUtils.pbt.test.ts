import * as fc from 'fast-check';
import {
  assignRoles,
  checkWinCondition,
  countVotes,
  getExecutionTarget,
  generateRoomId,
  validatePlayerName,
  getTeamMembers
} from '../gameUtils';
import { Player, PlayerRole, Vote } from '../../types/game';

describe('gameUtils - Property-Based Tests', () => {
  // Arbitraries (データ生成器)
  const playerRoleArb = fc.constantFrom(
    'villager', 'werewolf', 'seer', 'medium', 'hunter', 'madman'
  ) as fc.Arbitrary<PlayerRole>;

  const playerArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 2, maxLength: 20 }),
    role: playerRoleArb,
    isAlive: fc.boolean(),
    isHost: fc.boolean(),
    isReady: fc.boolean(),
    joinedAt: fc.integer({ min: 0 })
  }) as fc.Arbitrary<Player>;

  const playersArb = (minLength: number = 4, maxLength: number = 12) =>
    fc.array(playerArb, { minLength, maxLength }).map(players =>
      players.map((p, i) => ({ ...p, id: `player-${i}`, name: `Player${i}` }))
    );

  const voteArb = fc.record({
    voterId: fc.string({ minLength: 1, maxLength: 10 }),
    targetId: fc.string({ minLength: 1, maxLength: 10 }),
    timestamp: fc.integer({ min: 0 })
  }) as fc.Arbitrary<Vote>;

  const votesArb = fc.array(voteArb, { maxLength: 20 });

  describe('assignRoles - PBT', () => {
    it('プロパティ: 割り当てられた役職の総数は常にプレイヤー数と等しい', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const result = assignRoles(players);
          return result.length === players.length;
        }
      ));
    });

    it('プロパティ: すべてのプレイヤーに役職が割り当てられる', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const result = assignRoles(players);
          return result.every(player => 
            ['villager', 'werewolf', 'seer', 'medium', 'hunter', 'madman'].includes(player.role)
          );
        }
      ));
    });

    it('プロパティ: 人狼の数は適切な範囲内である', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const result = assignRoles(players);
          const werewolfCount = result.filter(p => p.role === 'werewolf').length;
          const playerCount = players.length;
          
          // 人狼の数は1人以上、プレイヤー数の半分未満
          return werewolfCount >= 1 && werewolfCount < playerCount / 2;
        }
      ));
    });

    it('プロパティ: プレイヤーIDは保持される', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const result = assignRoles(players);
          const originalIds = new Set(players.map(p => p.id));
          const resultIds = new Set(result.map(p => p.id));
          
          return originalIds.size === resultIds.size && 
                 [...originalIds].every(id => resultIds.has(id));
        }
      ));
    });

    it('プロパティ: カスタム役職配分が正しく適用される', () => {
      fc.assert(fc.property(
        fc.integer({ min: 4, max: 12 }),
        (playerCount) => {
          const players = Array.from({ length: playerCount }, (_, i) => ({
            id: `player-${i}`,
            name: `Player${i}`,
            role: 'villager' as PlayerRole,
            isAlive: true,
            isHost: false,
            isReady: true,
            joinedAt: Date.now()
          }));

          const customRoles: PlayerRole[] = Array.from({ length: playerCount }, (_, i) => 
            i === 0 ? 'werewolf' : 'villager'
          );

          const result = assignRoles(players, customRoles);
          const werewolfCount = result.filter(p => p.role === 'werewolf').length;
          const villagerCount = result.filter(p => p.role === 'villager').length;

          return werewolfCount === 1 && villagerCount === playerCount - 1;
        }
      ));
    });
  });

  describe('checkWinCondition - PBT', () => {
    it('プロパティ: 人狼が全滅した場合、村人チームが勝利する', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          // 人狼を全て死亡させる
          const modifiedPlayers = players.map(p => ({
            ...p,
            isAlive: p.role !== 'werewolf'
          }));

          // 少なくとも1人の村人チームが生存している場合
          const villagerTeamAlive = modifiedPlayers.some(p => 
            p.isAlive && ['villager', 'seer', 'medium', 'hunter'].includes(p.role)
          );

          if (villagerTeamAlive) {
            const result = checkWinCondition(modifiedPlayers);
            return result === 'villagers';
          }
          return true; // 条件を満たさない場合はスキップ
        }
      ));
    });

    it('プロパティ: 人狼数が村人数以上の場合、人狼チームが勝利する', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const alivePlayers = players.filter(p => p.isAlive);
          const aliveWerewolves = alivePlayers.filter(p => p.role === 'werewolf');
          const aliveVillagers = alivePlayers.filter(p =>
            p.role !== 'werewolf' && p.role !== 'madman'
          );

          // 人狼チーム勝利条件: 人狼が存在し、人狼の数が村人数以上
          // 注意: 実装では狂人は勝利条件の計算に含まれない
          if (aliveWerewolves.length > 0 && aliveWerewolves.length >= aliveVillagers.length) {
            const result = checkWinCondition(players);
            return result === 'werewolves';
          }
          return true; // 条件を満たさない場合はスキップ
        }
      ));
    });

    it('プロパティ: 勝利条件を満たさない場合はnullを返す', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const alivePlayers = players.filter(p => p.isAlive);
          const aliveWerewolves = alivePlayers.filter(p => p.role === 'werewolf');
          const aliveVillagers = alivePlayers.filter(p =>
            p.role !== 'werewolf' && p.role !== 'madman'
          );

          // ゲームが継続中の条件: 人狼が存在し、人狼の数 < 村人数
          if (aliveWerewolves.length > 0 && aliveWerewolves.length < aliveVillagers.length) {
            const result = checkWinCondition(players);
            return result === null;
          }
          return true; // 条件を満たさない場合はスキップ
        }
      ));
    });
  });

  describe('countVotes - PBT', () => {
    it('プロパティ: 投票数の合計は元の投票配列の長さと等しい', () => {
      fc.assert(fc.property(
        votesArb,
        (votes) => {
          const result = countVotes(votes);
          const totalCount = result.reduce((sum, vote) => sum + vote.count, 0);
          return totalCount === votes.length;
        }
      ));
    });

    it('プロパティ: 各ターゲットの投票数は正の整数である', () => {
      fc.assert(fc.property(
        votesArb,
        (votes) => {
          const result = countVotes(votes);
          return result.every(vote => vote.count > 0 && Number.isInteger(vote.count));
        }
      ));
    });

    it('プロパティ: 結果は投票数の降順でソートされている', () => {
      fc.assert(fc.property(
        votesArb,
        (votes) => {
          const result = countVotes(votes);
          for (let i = 1; i < result.length; i++) {
            if (result[i - 1].count < result[i].count) {
              return false;
            }
          }
          return true;
        }
      ));
    });

    it('プロパティ: 重複するターゲットIDは存在しない', () => {
      fc.assert(fc.property(
        votesArb,
        (votes) => {
          const result = countVotes(votes);
          const targetIds = result.map(vote => vote.targetId);
          const uniqueTargetIds = new Set(targetIds);
          return targetIds.length === uniqueTargetIds.size;
        }
      ));
    });
  });

  describe('getExecutionTarget - PBT', () => {
    it('プロパティ: 返されるターゲットは投票に含まれるターゲットである', () => {
      fc.assert(fc.property(
        votesArb.filter(votes => votes.length > 0),
        (votes) => {
          const result = getExecutionTarget(votes);
          if (result === null) return true;
          
          const targetIds = new Set(votes.map(v => v.targetId));
          return targetIds.has(result);
        }
      ));
    });

    it('プロパティ: 空の投票配列の場合はnullを返す', () => {
      fc.assert(fc.property(
        fc.constant([] as Vote[]),
        (votes) => {
          const result = getExecutionTarget(votes);
          return result === null;
        }
      ));
    });

    it('プロパティ: 最多票のターゲットが返される（同票でない場合）', () => {
      fc.assert(fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 10 })
          .chain(targetIds => {
            // 明確な最多票を作るため、最初のターゲットに追加の票を与える
            const baseVotes: Vote[] = targetIds.map(targetId => ({
              voterId: `voter-${targetId}`,
              targetId,
              timestamp: Date.now()
            }));
            
            const extraVotes: Vote[] = Array.from({ length: 2 }, (_, i) => ({
              voterId: `extra-voter-${i}`,
              targetId: targetIds[0],
              timestamp: Date.now()
            }));
            
            return fc.constant([...baseVotes, ...extraVotes] as Vote[]);
          }),
        (votes) => {
          if (votes.length === 0) return true;
          
          const result = getExecutionTarget(votes);
          const voteCounts = countVotes(votes);
          const maxCount = Math.max(...voteCounts.map(v => v.count));
          const maxTargets = voteCounts.filter(v => v.count === maxCount);
          
          // 同票の場合は複数の候補がある
          if (maxTargets.length === 1) {
            return result === maxTargets[0].targetId;
          } else {
            return maxTargets.some(target => target.targetId === result);
          }
        }
      ));
    });
  });

  describe('generateRoomId - PBT', () => {
    it('プロパティ: 生成されるIDは常に6文字である', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1, max: 100 }),
        (_) => {
          const roomId = generateRoomId();
          return roomId.length === 6;
        }
      ));
    });

    it('プロパティ: 生成されるIDは英数字のみを含む', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1, max: 100 }),
        (_) => {
          const roomId = generateRoomId();
          return /^[A-Z0-9]+$/.test(roomId);
        }
      ));
    });

    it('プロパティ: 複数回実行して重複する確率は低い', () => {
      const ids = Array.from({ length: 100 }, () => generateRoomId());
      const uniqueIds = new Set(ids);
      // 100回実行して90%以上がユニークであることを期待
      expect(uniqueIds.size).toBeGreaterThan(90);
    });
  });

  describe('validatePlayerName - PBT', () => {
    it('プロパティ: 2-20文字の英数字・ひらがな・カタカナ・漢字・スペースは有効', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 2, maxLength: 20 })
          .filter(name => /^[a-zA-Z0-9ひらがなカタカナ漢字\s]+$/.test(name)),
        (name) => {
          return validatePlayerName(name) === true;
        }
      ));
    });

    it('プロパティ: 1文字以下または21文字以上の名前は無効', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.string({ maxLength: 1 }),
          fc.string({ minLength: 21, maxLength: 50 })
        ),
        (name) => {
          return validatePlayerName(name) === false;
        }
      ));
    });

    it('プロパティ: 特殊文字を含む名前は無効', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 2, maxLength: 20 })
          .filter(name => /[@#!$%^&*()+=\[\]{}|\\:";'<>?,./]/.test(name)),
        (name) => {
          return validatePlayerName(name) === false;
        }
      ));
    });
  });

  describe('getTeamMembers - PBT', () => {
    it('プロパティ: 村人チームには村人・占い師・霊媒師・狩人が含まれる', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const villagerTeam = getTeamMembers(players, 'villagers');
          return villagerTeam.every(player => 
            ['villager', 'seer', 'medium', 'hunter'].includes(player.role)
          );
        }
      ));
    });

    it('プロパティ: 人狼チームには人狼・狂人が含まれる', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const werewolfTeam = getTeamMembers(players, 'werewolves');
          return werewolfTeam.every(player => 
            ['werewolf', 'madman'].includes(player.role)
          );
        }
      ));
    });

    it('プロパティ: 両チームの合計はプレイヤー総数と等しい', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const villagerTeam = getTeamMembers(players, 'villagers');
          const werewolfTeam = getTeamMembers(players, 'werewolves');
          return villagerTeam.length + werewolfTeam.length === players.length;
        }
      ));
    });

    it('プロパティ: 両チームに重複するプレイヤーは存在しない', () => {
      fc.assert(fc.property(
        playersArb(4, 12),
        (players) => {
          const villagerTeam = getTeamMembers(players, 'villagers');
          const werewolfTeam = getTeamMembers(players, 'werewolves');
          
          const villagerIds = new Set(villagerTeam.map(p => p.id));
          const werewolfIds = new Set(werewolfTeam.map(p => p.id));
          
          // 交集合が空であることを確認
          const intersection = [...villagerIds].filter(id => werewolfIds.has(id));
          return intersection.length === 0;
        }
      ));
    });
  });
});