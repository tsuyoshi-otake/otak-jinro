import {
  GameState,
  Player,
  WebSocketMessage,
  GamePhase,
  Vote,
  ChatMessage,
  assignRoles,
  checkWinCondition,
  getExecutionTarget,
  canPlayerAct,
  GAME_CONSTANTS,
  ERROR_MESSAGES
} from '../../shared/src/index';

import { DurableObject, DurableObjectState, Env, CloudflareWebSocket } from './types';
import { createOpenAIService, OpenAIService } from './openai';

// AI名前の定数
const AI_NAMES = ['アリス', 'ボブ', 'チャーリー', 'ダイアナ', 'イブ', 'フランク', 'グレース', 'ヘンリー', 'アイビー', 'ジャック', 'ケイト', 'ルーク'];

// AIプレイヤーかどうかを判定する関数
const isAIPlayer = (playerName: string) => AI_NAMES.includes(playerName);

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private gameState: GameState | null = null;
  private websockets: Map<string, CloudflareWebSocket> = new Map();
  private timers: Map<string, any> = new Map();
  private openAIService: OpenAIService | null = null;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.openAIService = createOpenAIService(env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/websocket') {
      return this.handleWebSocket(request);
    }
    
    if (url.pathname === '/api/room') {
      return this.handleRoomAPI(request);
    }
    
    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const [client, server] = Object.values(new WebSocketPair()) as [CloudflareWebSocket, CloudflareWebSocket];
    
    server.accept();
    
    const playerId = crypto.randomUUID();
    this.websockets.set(playerId, server);
    
    server.addEventListener('message', async (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data as string);
        console.log('Received WebSocket message:', JSON.stringify(message));
        await this.handleWebSocketMessage(playerId, message);
      } catch (error) {
        console.error('WebSocket message error:', error);
        console.error('Raw message data:', event.data);
        this.sendToPlayer(playerId, {
          type: 'error',
          message: 'Invalid message format: ' + (error instanceof Error ? error.message : 'Unknown error')
        });
      }
    });
    
    server.addEventListener('close', () => {
      this.websockets.delete(playerId);
      if (this.gameState) {
        this.removePlayer(playerId);
      }
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client
    } as ResponseInit & { webSocket: CloudflareWebSocket });
  }

  private createPlayer(playerId: string, playerName: string, isAI: boolean = false): Player {
    // プレイヤー名が空の場合はエラーを投げる
    if (!playerName || playerName.trim() === '') {
      throw new Error('Player name is required');
    }
    
    return {
      id: playerId,
      name: playerName.trim(),
      role: 'villager',
      isAlive: true,
      isHost: this.gameState?.players?.length === 0 || false,
      isReady: isAI,
      avatar: '',
      joinedAt: Date.now()
    };
  }

  private async handleRoomAPI(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'GET') {
      return Response.json({
        success: true,
        data: this.gameState,
        timestamp: Date.now()
      });
    }
    
    // Handle kick player
    if (url.pathname.endsWith('/kick') && request.method === 'POST') {
      return await this.handleKickPlayerAPI(request);
    }
    
    if (request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const playerId = crypto.randomUUID();
        
        // プレイヤー名の検証
        if (!body.playerName || body.playerName.trim() === '') {
          return Response.json({
            success: false,
            error: 'プレイヤー名が必要です',
            timestamp: Date.now()
          }, { status: 400 });
        }
        
        // Initialize game state if not exists
        if (!this.gameState) {
          this.gameState = {
            id: crypto.randomUUID(),
            phase: 'lobby',
            players: [],
            currentDay: 0,
            timeRemaining: 0,
            votes: [],
            chatMessages: [],
            gameSettings: {
              maxPlayers: GAME_CONSTANTS.MAX_PLAYERS,
              dayDuration: 300,
              nightDuration: 120,
              votingDuration: 60,
              enableVoiceChat: false,
              enableSpectators: true,
              customRoles: []
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
        }
        
        // 同じ名前のプレイヤーが既に存在するかチェック
        const existingPlayer = this.gameState.players.find(p => p.name === body.playerName.trim());
        if (existingPlayer) {
          return Response.json({
            success: false,
            error: 'この名前のプレイヤーは既に存在します',
            timestamp: Date.now()
          }, { status: 400 });
        }
        
        // Add player to game
        const newPlayer = this.createPlayer(playerId, body.playerName, body.isAI);
        this.gameState.players.push(newPlayer);
        this.gameState.updatedAt = Date.now();
        
        // Broadcast update to all connected players
        this.broadcastGameState();
        
        return Response.json({
          success: true,
          data: { playerId, player: newPlayer },
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error in room API POST:', error);
        return Response.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to join room',
          timestamp: Date.now()
        }, { status: 400 });
      }
    }
    
    return new Response('Method not allowed', { status: 405 });
  }

  private async handleWebSocketMessage(playerId: string, message: WebSocketMessage) {
    switch (message.type) {
      case 'join_room':
        await this.handleJoinRoom(playerId, message);
        break;
      case 'leave_room':
        await this.handleLeaveRoom(playerId);
        break;
      case 'start_game':
        await this.handleStartGame(playerId);
        break;
      case 'vote':
        await this.handleVote(playerId, message);
        break;
      case 'chat':
        await this.handleChat(playerId, message);
        break;
      case 'use_ability':
        await this.handleUseAbility(playerId, message);
        break;
      case 'add_ai_player':
        await this.handleAddAIPlayer(playerId);
        break;
      case 'kick_player':
        await this.handleKickPlayer(playerId, message);
        break;
    }
  }

  private async handleJoinRoom(playerId: string, message: any) {
    try {
      if (!this.gameState) {
        // 新しいルーム作成
        this.gameState = {
          id: message.roomId,
          phase: 'lobby',
          players: [],
          currentDay: 0,
          timeRemaining: 0,
          votes: [],
          chatMessages: [],
          gameSettings: {
            maxPlayers: GAME_CONSTANTS.MAX_PLAYERS,
            dayDuration: GAME_CONSTANTS.DEFAULT_DAY_DURATION,
            nightDuration: GAME_CONSTANTS.DEFAULT_NIGHT_DURATION,
            votingDuration: GAME_CONSTANTS.DEFAULT_VOTING_DURATION,
            enableVoiceChat: false,
            enableSpectators: true,
            customRoles: []
          },
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }

      if (this.gameState.phase !== 'lobby') {
        this.sendToPlayer(playerId, {
          type: 'error',
          message: ERROR_MESSAGES.GAME_ALREADY_STARTED
        });
        return;
      }

      if (this.gameState.players.length >= this.gameState.gameSettings.maxPlayers) {
        this.sendToPlayer(playerId, {
          type: 'error',
          message: ERROR_MESSAGES.ROOM_FULL
        });
        return;
      }

      console.log('handleJoinRoom - message:', JSON.stringify(message));
      console.log('handleJoinRoom - player name:', message.player?.name);
      
      // プレイヤー名の検証
      const playerName = message.player?.name;
      if (!playerName || playerName.trim() === '') {
        this.sendToPlayer(playerId, {
          type: 'error',
          message: 'プレイヤー名が必要です'
        });
        return;
      }
      
      // Check if player already exists by name (not by WebSocket playerId)
      const existingPlayerIndex = this.gameState.players.findIndex(p =>
        p.name === playerName.trim()
      );
      
      if (existingPlayerIndex !== -1) {
        // Update existing player's WebSocket ID
        this.gameState.players[existingPlayerIndex].id = playerId;
        console.log('Updated existing player WebSocket ID:', playerId);
      } else {
        // Create new player using common function
        const player = this.createPlayer(playerId, playerName, false);
        console.log('Created player:', JSON.stringify(player));
        this.gameState.players.push(player);
      }
      
      this.gameState.updatedAt = Date.now();

      await this.saveGameState();
      this.broadcastGameState();
      
      // Get the current player for the broadcast
      const currentPlayer = this.gameState.players.find(p => p.id === playerId);
      if (currentPlayer) {
        this.broadcastToAll({
          type: 'player_joined',
          player: currentPlayer
        });
      }
    } catch (error) {
      console.error('Error in handleJoinRoom:', error);
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'ルーム参加に失敗しました'
      });
    }
  }

  private async handleLeaveRoom(playerId: string) {
    if (!this.gameState) return;
    
    this.removePlayer(playerId);
  }

  private async handleStartGame(playerId: string) {
    if (!this.gameState) return;
    
    const player = this.gameState.players.find((p: Player) => p.id === playerId);
    if (!player?.isHost) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: ERROR_MESSAGES.NOT_HOST
      });
      return;
    }

    if (this.gameState.players.length < GAME_CONSTANTS.MIN_PLAYERS) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: ERROR_MESSAGES.INSUFFICIENT_PLAYERS
      });
      return;
    }

    // 役職配布
    const customRoles = this.gameState.gameSettings.customRoles.length > 0
      ? this.gameState.gameSettings.customRoles
      : undefined;
    this.gameState.players = assignRoles(this.gameState.players, customRoles);
    this.gameState.phase = 'day';
    this.gameState.currentDay = 1;
    this.gameState.timeRemaining = this.gameState.gameSettings.dayDuration;
    this.gameState.updatedAt = Date.now();

    await this.saveGameState();
    this.broadcastGameState();
    this.startPhaseTimer();
    
    // AI自動発言システムを開始
    this.scheduleAIMessages();
  }

  private async handleVote(playerId: string, message: any) {
    if (!this.gameState || this.gameState.phase !== 'voting') {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: ERROR_MESSAGES.VOTING_NOT_ALLOWED
      });
      return;
    }

    const player = this.gameState.players.find((p: Player) => p.id === playerId);
    if (!player?.isAlive) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: ERROR_MESSAGES.INVALID_ACTION
      });
      return;
    }

    // 既存の投票を削除
    this.gameState.votes = this.gameState.votes.filter((v: Vote) => v.voterId !== playerId);
    
    // 新しい投票を追加
    const vote: Vote = {
      voterId: playerId,
      targetId: message.vote.targetId,
      timestamp: Date.now()
    };
    
    this.gameState.votes.push(vote);
    this.gameState.updatedAt = Date.now();

    await this.saveGameState();
    this.broadcastGameState();
  }

  private async handleChat(playerId: string, message: any) {
    if (!this.gameState) return;

    let actualPlayer: Player | undefined;
    let playerName: string;
    let actualPlayerId: string = playerId;
    
    // AIメッセージの場合は、AIプレイヤーを探す
    if (message.isAI && message.aiPlayerId) {
      actualPlayer = this.gameState.players.find((p: Player) => p.id === message.aiPlayerId);
      if (!actualPlayer) {
        console.error('AI player not found:', message.aiPlayerId);
        return;
      }
      playerName = actualPlayer.name;
      actualPlayerId = actualPlayer.id;
    } else {
      // 通常のプレイヤーメッセージ
      actualPlayer = this.gameState.players.find((p: Player) => p.id === playerId);
      if (!actualPlayer) return;
      playerName = actualPlayer.name;
    }

    const chatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      playerId: actualPlayerId,
      playerName,
      content: message.message.content,
      timestamp: Date.now(),
      type: message.message.type
    };

    this.gameState.chatMessages.push(chatMessage);
    this.gameState.updatedAt = Date.now();

    await this.saveGameState();
    this.broadcastGameState();
    
    // AIプレイヤーが文脈に応じて反応
    this.triggerAIResponse(chatMessage);
  }

  private async handleUseAbility(playerId: string, message: any) {
    if (!this.gameState) return;

    const player = this.gameState.players.find((p: Player) => p.id === playerId);
    
    if (!player) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: ERROR_MESSAGES.ABILITY_NOT_AVAILABLE
      });
      return;
    }
    
    // 能力使用可能かチェック
    let canAct = false;
    if (player.isAlive && this.gameState.phase === 'night') {
      switch (player.role) {
        case 'werewolf':
          canAct = true; // 人狼は夜に襲撃可能
          break;
        case 'seer':
          canAct = true; // 占い師は夜に占い可能
          break;
        case 'hunter':
          canAct = true; // 狩人は夜に護衛可能
          break;
        case 'medium':
          canAct = true; // 霊媒師は夜に能力使用可能
          break;
        default:
          canAct = false;
      }
    }
    
    if (!canAct) {
      console.log(`Ability not available for player ${player.name} (${player.role}) in phase ${this.gameState.phase}`);
      this.sendToPlayer(playerId, {
        type: 'error',
        message: ERROR_MESSAGES.ABILITY_NOT_AVAILABLE
      });
      return;
    }

    // 能力の実行ロジック
    const targetId = message.targetId;
    const ability = message.ability;
    
    switch (player.role) {
      case 'werewolf':
        if (ability === 'attack' && this.gameState.phase === 'night') {
          // 人狼の襲撃
          const target = this.gameState.players.find(p => p.id === targetId);
          if (target && target.isAlive && target.role !== 'werewolf') {
            // 襲撃対象を記録（実際の処理は夜フェーズ終了時）
            this.gameState.nightActions = this.gameState.nightActions || [];
            this.gameState.nightActions.push({
              type: 'attack',
              actorId: playerId,
              targetId: targetId,
              timestamp: Date.now()
            });
            
            this.sendToPlayer(playerId, {
              type: 'ability_used',
              message: `${target.name}を襲撃対象に選びました`
            });
          }
        }
        break;
        
      case 'seer':
        if (ability === 'divine' && this.gameState.phase === 'night') {
          // 占い師の占い
          const target = this.gameState.players.find(p => p.id === targetId);
          if (target && target.isAlive) {
            const isWerewolf = target.role === 'werewolf';
            this.sendToPlayer(playerId, {
              type: 'divine_result',
              message: `${target.name}は${isWerewolf ? '人狼' : '人狼ではありません'}`
            });
          }
        }
        break;
        
      case 'hunter':
        if (ability === 'guard' && this.gameState.phase === 'night') {
          // 狩人の護衛
          const target = this.gameState.players.find(p => p.id === targetId);
          if (target && target.isAlive) {
            this.gameState.nightActions = this.gameState.nightActions || [];
            this.gameState.nightActions.push({
              type: 'guard',
              actorId: playerId,
              targetId: targetId,
              timestamp: Date.now()
            });
            
            this.sendToPlayer(playerId, {
              type: 'ability_used',
              message: `${target.name}を護衛しました`
            });
          }
        }
        break;
        
      case 'medium':
        if (ability === 'divine' && this.gameState.phase === 'night') {
          // 霊媒師の霊視（前日の処刑者について）
          if (this.gameState.lastExecuted) {
            const executed = this.gameState.lastExecuted;
            const isWerewolf = executed.role === 'werewolf';
            this.sendToPlayer(playerId, {
              type: 'medium_result',
              message: `${executed.name}は${isWerewolf ? '人狼' : '人狼ではありませんでした'}`
            });
          } else {
            this.sendToPlayer(playerId, {
              type: 'medium_result',
              message: '昨日は処刑者がいませんでした'
            });
          }
        }
        break;
    }
    
    this.gameState.updatedAt = Date.now();
    await this.saveGameState();
    this.broadcastGameState();
  }

  private removePlayer(playerId: string) {
    if (!this.gameState) return;

    this.gameState.players = this.gameState.players.filter((p: Player) => p.id !== playerId);
    this.websockets.delete(playerId);

    if (this.gameState.players.length === 0) {
      // 全員退出した場合、ゲーム状態をクリア
      this.gameState = null;
      return;
    }

    // ホストが退出した場合、新しいホストを選出
    if (!this.gameState.players.some((p: Player) => p.isHost)) {
      this.gameState.players[0].isHost = true;
    }

    this.gameState.updatedAt = Date.now();
    this.saveGameState();
    this.broadcastToAll({
      type: 'player_left',
      playerId
    });
  }

  private startPhaseTimer() {
    if (!this.gameState) return;

    let duration: number;
    switch (this.gameState.phase) {
      case 'day':
        duration = this.gameState.gameSettings.dayDuration;
        break;
      case 'voting':
        duration = this.gameState.gameSettings.votingDuration;
        break;
      case 'night':
        duration = this.gameState.gameSettings.nightDuration;
        break;
      default:
        return; // ロビーやendedフェーズではタイマーを設定しない
    }

    console.log(`⏰ [タイマー設定] ${this.gameState.phase}フェーズ: ${duration}秒`);

    const timerId = setTimeout(() => {
      this.nextPhase();
    }, duration * 1000);

    this.timers.set('phase', timerId);

    // AI自動行動を実行（投票・夜間能力）
    if (this.gameState.phase === 'voting' || this.gameState.phase === 'night') {
      // 少し遅延してからAI行動を開始
      setTimeout(() => {
        this.handleAIActions();
      }, 2000); // 2秒後
    }
  }

  private async nextPhase() {
    if (!this.gameState) return;

    switch (this.gameState.phase) {
      case 'day':
        this.gameState.phase = 'voting';
        this.gameState.timeRemaining = this.gameState.gameSettings.votingDuration;
        console.log(`[フェーズ変更] 昼 → 投票フェーズ開始 (${this.gameState.timeRemaining}秒)`);
        // AIプレイヤーの自動投票を開始
        this.scheduleAIVoting();
        break;
      case 'voting':
        await this.processVoting();
        this.gameState.phase = 'night';
        this.gameState.timeRemaining = this.gameState.gameSettings.nightDuration;
        console.log(`[フェーズ変更] 投票 → 夜フェーズ開始 (${this.gameState.timeRemaining}秒)`);
        // AIプレイヤーの自動能力使用を開始
        this.scheduleAINightActions();
        break;
      case 'night':
        await this.processNight();
        this.gameState.phase = 'day';
        this.gameState.currentDay++;
        this.gameState.timeRemaining = this.gameState.gameSettings.dayDuration;
        console.log(`[フェーズ変更] 夜 → 昼フェーズ開始 (${this.gameState.currentDay}日目, ${this.gameState.timeRemaining}秒)`);
        break;
    }

    const winner = checkWinCondition(this.gameState.players);
    if (winner) {
      this.gameState.phase = 'ended';
      
      // ゲーム終了ログ
      console.log(`[ゲーム終了] ${winner}チームの勝利！`);
      
      // 勝利メッセージをチャットに追加
      const winMessage = {
        id: crypto.randomUUID(),
        playerId: 'system',
        playerName: 'System',
        content: `🎉 ゲーム終了！ ${winner}チームの勝利です！`,
        timestamp: Date.now(),
        type: 'system' as const
      };
      this.gameState.chatMessages.push(winMessage);
      
      // 全プレイヤーの役職を公開
      const roleRevealMessage = {
        id: crypto.randomUUID(),
        playerId: 'system',
        playerName: 'System',
        content: `📋 役職公開: ${this.gameState.players.map(p =>
          `${p.name}(${p.role === 'villager' ? '村人' :
            p.role === 'werewolf' ? '人狼' :
            p.role === 'seer' ? '占い師' :
            p.role === 'medium' ? '霊媒師' :
            p.role === 'hunter' ? '狩人' :
            p.role === 'madman' ? '狂人' : p.role})`
        ).join(', ')}`,
        timestamp: Date.now(),
        type: 'system' as const
      };
      this.gameState.chatMessages.push(roleRevealMessage);
    }

    this.gameState.updatedAt = Date.now();
    await this.saveGameState();
    this.broadcastGameState();

    if (this.gameState.phase !== 'ended') {
      this.startPhaseTimer();
    }
  }

  private async processVoting() {
    if (!this.gameState) return;

    console.log('Processing voting phase...');
    console.log('Current votes:', this.gameState.votes);
    
    const executionTarget = getExecutionTarget(this.gameState.votes);
    console.log('Execution target:', executionTarget);
    
    if (executionTarget) {
      const player = this.gameState.players.find((p: Player) => p.id === executionTarget);
      if (player) {
        console.log(`Executing player: ${player.name} (${player.role})`);
        player.isAlive = false;
        
        // 霊媒師用に処刑者を記録
        this.gameState.lastExecuted = player;
        
        // 処刑メッセージをチャットに追加
        const executionMessage = {
          id: crypto.randomUUID(),
          playerId: 'system',
          playerName: 'System',
          content: `${player.name}が処刑されました。`,
          timestamp: Date.now(),
          type: 'system' as const
        };
        this.gameState.chatMessages.push(executionMessage);
      }
    } else {
      // 処刑者がいない場合はクリア
      this.gameState.lastExecuted = null;
      console.log('No execution target (tie or no votes)');
      // 同票の場合のメッセージ
      const tieMessage = {
        id: crypto.randomUUID(),
        playerId: 'system',
        playerName: 'System',
        content: '投票が同数のため、誰も処刑されませんでした。',
        timestamp: Date.now(),
        type: 'system' as const
      };
      this.gameState.chatMessages.push(tieMessage);
    }

    this.gameState.votes = [];
    console.log('Voting processing complete');
  }

  private async processNight() {
    if (!this.gameState || !this.gameState.nightActions) return;
    
    // 夜間アクションを処理
    const attacks = this.gameState.nightActions.filter(action => action.type === 'attack');
    const guards = this.gameState.nightActions.filter(action => action.type === 'guard');
    
    // 襲撃処理
    if (attacks.length > 0) {
      // 最新の襲撃を採用（複数の人狼がいる場合）
      const latestAttack = attacks[attacks.length - 1];
      const victim = this.gameState.players.find(p => p.id === latestAttack.targetId);
      
      if (victim && victim.isAlive) {
        // 護衛チェック
        const isProtected = guards.some(guard => guard.targetId === latestAttack.targetId);
        
        if (!isProtected) {
          // 襲撃成功
          victim.isAlive = false;
          
          // 死亡メッセージ
          const deathMessage: ChatMessage = {
            id: `death-${Date.now()}`,
            playerId: 'system',
            playerName: 'システム',
            content: `${victim.name}が人狼に襲撃されました。`,
            timestamp: Date.now(),
            type: 'system'
          };
          this.gameState.chatMessages.push(deathMessage);
          
          // 霊媒師に結果を通知（次の夜に）
          this.gameState.lastExecuted = victim;
        } else {
          // 護衛成功
          const protectionMessage: ChatMessage = {
            id: `protection-${Date.now()}`,
            playerId: 'system',
            playerName: 'システム',
            content: `昨夜は平和でした。`,
            timestamp: Date.now(),
            type: 'system'
          };
          this.gameState.chatMessages.push(protectionMessage);
        }
      }
    } else {
      // 襲撃なしの場合
      const noAttackMessage: ChatMessage = {
        id: `no-attack-${Date.now()}`,
        playerId: 'system',
        playerName: 'システム',
        content: `昨夜は平和でした。`,
        timestamp: Date.now(),
        type: 'system'
      };
      this.gameState.chatMessages.push(noAttackMessage);
    }
    
    // 夜間アクションをクリア
    this.gameState.nightActions = [];
    
    // 霊媒師の能力処理（前日の処刑者について）
    if (this.gameState.lastExecuted) {
      const mediums = this.gameState.players.filter(p =>
        p.role === 'medium' && p.isAlive
      );
      
      const executed = this.gameState.lastExecuted;
      mediums.forEach(medium => {
        const isWerewolf = executed.role === 'werewolf';
        this.sendToPlayer(medium.id, {
          type: 'medium_result',
          message: `${executed.name}は${isWerewolf ? '人狼' : '人狼ではありませんでした'}`
        });
      });
    }
  }

  private sendToPlayer(playerId: string, message: WebSocketMessage) {
    const ws = this.websockets.get(playerId);
    if (ws) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToAll(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    for (const ws of this.websockets.values()) {
      ws.send(messageStr);
    }
  }

  private broadcastGameState() {
    if (!this.gameState) return;
    
    this.broadcastToAll({
      type: 'game_state_update',
      gameState: this.gameState
    });
  }

  private async saveGameState() {
    if (this.gameState) {
      await this.state.storage.put('gameState', this.gameState);
    }
  }

  private async loadGameState() {
    const saved = await this.state.storage.get('gameState');
    if (saved) {
      this.gameState = saved as GameState;
    }
  }

  private async handleKickPlayerAPI(request: Request): Promise<Response> {
    try {
      const body = await request.json() as any;
      const playerId = body.playerId;
      
      if (!this.gameState) {
        return Response.json({
          success: false,
          error: 'Room not found',
          timestamp: Date.now()
        }, { status: 404 });
      }
      
      // Find the player to kick
      const playerToKick = this.gameState.players.find(p => p.id === playerId);
      if (!playerToKick) {
        return Response.json({
          success: false,
          error: 'Player not found',
          timestamp: Date.now()
        }, { status: 404 });
      }
      
      // Remove the player
      this.removePlayer(playerId);
      
      return Response.json({
        success: true,
        message: `Player ${playerToKick.name} has been kicked`,
        timestamp: Date.now()
      });
      
    } catch (error) {
      return Response.json({
        success: false,
        error: 'Failed to kick player',
        timestamp: Date.now()
      }, { status: 400 });
    }
  }
  
  private startAIChat() {
    if (!this.gameState) return;
    
    // AIプレイヤーのみ抽出
    const aiPlayers = this.gameState.players.filter(p => isAIPlayer(p.name) && p.isAlive);
    
    if (aiPlayers.length === 0) return;
    
    // 各AIプレイヤーに対してランダムな間隔でチャットを送信
    aiPlayers.forEach(aiPlayer => {
      this.scheduleAIChat(aiPlayer);
    });
  }
  
  private scheduleAIChat(aiPlayer: Player) {
    if (!this.gameState || this.gameState.phase === 'ended') return;
    
    // 15-45秒のランダムな間隔（より頻繁に）
    const delay = Math.floor(Math.random() * 30000) + 15000;
    
    setTimeout(() => {
      if (!this.gameState || this.gameState.phase === 'ended' || !aiPlayer.isAlive) return;
      
      const message = this.generateAIMessage(aiPlayer);
      
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        playerId: aiPlayer.id,
        playerName: aiPlayer.name,
        content: message,
        timestamp: Date.now(),
        type: 'public'
      };
      
      this.gameState.chatMessages.push(chatMessage);
      this.gameState.updatedAt = Date.now();
      
      console.log(`[AI自発会話] ${aiPlayer.name}: ${message}`);
      
      this.saveGameState();
      this.broadcastGameState();
      
      // AI発言に対して他のAIが反応する可能性
      this.triggerAIResponse(chatMessage);
      
      // 次のメッセージをスケジュール
      this.scheduleAIChat(aiPlayer);
    }, delay);
  }
  
  private generateAIMessage(aiPlayer: Player, context?: ChatMessage): string {
    const phase = this.gameState?.phase;
    const role = aiPlayer.role;
    
    // 文脈に応じた返答
    if (context) {
      const content = context.content.toLowerCase();
      const speaker = context.playerName;
      const isTargeted = content.includes(aiPlayer.name.toLowerCase()) ||
                        content.includes('ai-') ||
                        content.includes('全員') ||
                        content.includes('みんな');
      
      // 他のAIの発言に対する反応パターンを追加
      if (isAIPlayer(speaker) && speaker !== aiPlayer.name) {
        // AI同士の会話を促進
        if (content.includes('人狼') || content.includes('怪しい')) {
          return this.getAIToAIResponse(aiPlayer, speaker, 'suspicion');
        }
        if (content.includes('信じ') || content.includes('味方')) {
          return this.getAIToAIResponse(aiPlayer, speaker, 'trust');
        }
        if (content.includes('どう思') || content.includes('意見')) {
          return this.getAIToAIResponse(aiPlayer, speaker, 'opinion');
        }
        // 一般的な同意・反対
        return this.getAIToAIResponse(aiPlayer, speaker, 'general');
      }
      
      if (isTargeted) {
        // 疑われている場合の反応
        if (content.includes('人狼') || content.includes('怪しい') || content.includes('疑')) {
          if (role === 'werewolf') {
            return this.getDefensiveMessage(aiPlayer.name);
          } else {
            return this.getInnocentMessage();
          }
        }
        
        // 信頼を求められた場合
        if (content.includes('信じ') || content.includes('味方')) {
          return this.getTrustMessage(role);
        }
        
        // 意見を求められた場合
        if (content.includes('どう思') || content.includes('意見')) {
          return this.getOpinionMessage(phase || 'day');
        }
      }
    }
    
    // 戦略的で具体的なメッセージパターン
    const alivePlayers = this.gameState?.players.filter(p => p.isAlive && p.id !== aiPlayer.id) || [];
    const suspiciousPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)]?.name || 'someone';
    
    const messages: { [key: string]: string[] } = {
      day_villager: (this.gameState?.currentDay || 1) === 1 ? [
        `${suspiciousPlayer}の発言が気になる。どう思う？`,
        `${suspiciousPlayer}は人狼の可能性が高い。直感だが怪しい。`,
        `${suspiciousPlayer}の反応が不自然だった。詳しく説明してほしい。`,
        `みんなで協力して人狼を見つけよう。${suspiciousPlayer}が怪しいと思う。`,
        `${suspiciousPlayer}の言動に違和感がある。みんなはどう思う？`
      ] : [
        `${suspiciousPlayer}の昨日の投票行動が気になる。理由を聞きたい。`,
        `${suspiciousPlayer}は人狼の可能性が高い。発言に矛盾がある。`,
        `昨夜の襲撃パターンから、${suspiciousPlayer}が怪しいと推理している。`,
        `${suspiciousPlayer}の反応が不自然だった。詳しく説明してほしい。`,
        `投票の流れを見ると、${suspiciousPlayer}が誘導している可能性がある。`
      ],
      day_werewolf: (this.gameState?.currentDay || 1) === 1 ? [
        `${suspiciousPlayer}の推理は鋭すぎる。占い師かもしれない。`,
        `村人として、${suspiciousPlayer}の発言に違和感を覚える。`,
        `${suspiciousPlayer}が人狼の可能性を疑っている。証拠はないが。`,
        `${suspiciousPlayer}の言動が気になる。慎重に見極めたい。`,
        `${suspiciousPlayer}の発言パターンが怪しいと感じる。`
      ] : [
        `${suspiciousPlayer}の推理は鋭すぎる。占い師かもしれない。`,
        `村人として、${suspiciousPlayer}の発言に違和感を覚える。`,
        `${suspiciousPlayer}が人狼の可能性を疑っている。証拠はないが。`,
        `昨夜の襲撃を避けられた${suspiciousPlayer}が怪しい。`,
        `${suspiciousPlayer}の投票パターンが一貫していない。要注意だ。`
      ],
      day_seer: (this.gameState?.currentDay || 1) === 1 ? [
        `占い結果を公開する。${suspiciousPlayer}は${Math.random() < 0.3 ? '人狼' : '村人'}だった。`,
        `${suspiciousPlayer}を占った理由は、発言が気になったから。`,
        `占い師として断言する。${suspiciousPlayer}は信用できない。`,
        `重要な情報がある。${suspiciousPlayer}の正体について話したい。`
      ] : [
        `占い結果を公開する。${suspiciousPlayer}は${Math.random() < 0.3 ? '人狼' : '村人'}だった。`,
        `${suspiciousPlayer}を占った理由は、発言の矛盾が気になったから。`,
        `占い師として断言する。${suspiciousPlayer}は信用できない。`,
        `重要な情報がある。${suspiciousPlayer}の正体について話したい。`
      ],
      voting_all: (this.gameState?.currentDay || 1) === 1 ? [
        `${suspiciousPlayer}に投票する。理由は今日の発言パターンだ。`,
        `証拠は少ないが、${suspiciousPlayer}が最も怪しいと判断する。`,
        `消去法で考えると、${suspiciousPlayer}が人狼の可能性が高い。`,
        `${suspiciousPlayer}の弁明を聞いてから最終判断したい。`
      ] : [
        `${suspiciousPlayer}に投票する。理由は昨日からの行動パターンだ。`,
        `証拠は少ないが、${suspiciousPlayer}が最も怪しいと判断する。`,
        `消去法で考えると、${suspiciousPlayer}が人狼の可能性が高い。`,
        `${suspiciousPlayer}の弁明を聞いてから最終判断したい。`
      ],
      night_all: [
        '明日は重要な議論になりそうだ。',
        '今夜の襲撃で状況が変わるかもしれない。',
        '人狼の次の手を予想している。',
        '朝になったら新しい情報を整理しよう。'
      ]
    };
    
    let messageKey = `${phase}_${role}`;
    if (!messages[messageKey]) {
      messageKey = `${phase}_all`;
    }
    
    const availableMessages = messages[messageKey] || messages.day_villager;
    return availableMessages[Math.floor(Math.random() * availableMessages.length)];
  }
  
  private getAIToAIResponse(aiPlayer: Player, speaker: string, responseType: string): string {
    const role = aiPlayer.role;
    const alivePlayers = this.gameState?.players.filter(p => p.isAlive && p.id !== aiPlayer.id) || [];
    const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)]?.name || 'someone';
    
    const responses: { [key: string]: string[] } = {
      suspicion: [
        `${speaker}の推理に同感だ。私も同じ疑いを持っていた。`,
        `${speaker}の指摘は的確だが、証拠が不十分では？`,
        `${speaker}、その根拠をもう少し詳しく説明してほしい。`,
        `${speaker}の視点は興味深いが、${randomTarget}の方が怪しくないか？`,
        `${speaker}の推理は鋭い。一緒に真相を追求しよう。`
      ],
      trust: [
        `${speaker}を信じたいが、この状況では慎重になるべきだ。`,
        `${speaker}の言葉は説得力があるが、裏付けが欲しい。`,
        `${speaker}、君の提案は理にかなっている。`,
        `${speaker}と協力して人狼を見つけ出そう。`,
        `${speaker}の判断を信頼したいが、他の可能性も考慮すべきだ。`
      ],
      opinion: [
        `${speaker}の分析は鋭い。私の考えと一致している。`,
        `${speaker}、その観点は見落としていた。重要な指摘だ。`,
        `${speaker}の質問に答えよう。私は${randomTarget}が最も怪しいと思う。`,
        `${speaker}と同じ結論に達した。証拠を整理しよう。`,
        `${speaker}の推理を聞いて、新たな疑問が浮かんだ。`
      ],
      general: [
        `${speaker}の発言で状況が整理できた。`,
        `${speaker}、君の論理は筋が通っている。`,
        `${speaker}の意見を参考に、戦略を練り直そう。`,
        `${speaker}と議論することで真実に近づけそうだ。`,
        `${speaker}の視点から見ると、また違った景色が見える。`
      ]
    };
    
    // 人狼の場合はより戦略的で慎重な返答
    if (role === 'werewolf') {
      const werewolfResponses: { [key: string]: string[] } = {
        suspicion: [
          `${speaker}の推理は興味深いが、急ぎすぎではないか？`,
          `${speaker}、その疑いは理解できるが証拠が薄い。`,
          `${speaker}の指摘は的確だが、${randomTarget}の方が怪しいと思う。`,
          `${speaker}、君の推理に一理あるが慎重に検討したい。`
        ],
        trust: [
          `${speaker}を信頼したいが、この状況では全員疑うべきだ。`,
          `${speaker}の誠実さは感じるが、油断は禁物だ。`,
          `${speaker}、君の提案は村人らしい考えだね。`
        ],
        opinion: [
          `${speaker}の質問は重要だ。私の見解を述べよう。`,
          `${speaker}、君の分析は参考になるが別の可能性もある。`,
          `${speaker}の推理を聞いて、${randomTarget}への疑いが深まった。`
        ],
        general: [
          `${speaker}の発言は村人の視点として貴重だ。`,
          `${speaker}、君の意見を聞いて考えが整理できた。`,
          `${speaker}との議論で新たな手がかりが見えてきた。`
        ]
      };
      
      const werewolfOptions = werewolfResponses[responseType] || werewolfResponses.general;
      return werewolfOptions[Math.floor(Math.random() * werewolfOptions.length)];
    }
    
    const options = responses[responseType] || responses.general;
    return options[Math.floor(Math.random() * options.length)];
  }
  
  private getDefensiveMessage(playerName: string): string {
    const messages = [
      'えっ、私が人狼？違うよ！',
      '疑われるのは悲しいな...',
      'なぜ私を疑うの？',
      '私は村人側だよ、信じて！',
      '誤解だよ、私は無実だ'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  private getInnocentMessage(): string {
    const messages = [
      '私は村人だから安心して',
      '疑われても仕方ないけど、私は違うよ',
      '私を調べてもらっても構わない',
      '村のために頑張ってるのに...',
      '信じてもらえると嬉しいな'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  private getTrustMessage(role: string): string {
    if (role === 'werewolf') {
      const messages = [
        'もちろん信じてもらえるよね？',
        '私は味方だよ、一緒に頑張ろう',
        '疑うより協力しよう！',
        '信頼関係が大事だよね'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    } else {
      const messages = [
        '私を信じてくれてありがとう',
        '一緒に人狼を見つけよう',
        '協力して村を守ろう',
        '信頼してくれて嬉しい'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    }
  }
  
  private getOpinionMessage(phase: string): string {
    const messages: { [key: string]: string[] } = {
      day: [
        'まだ情報が少ないから難しいね',
        '慎重に観察していこう',
        'みんなの発言に注目してる',
        '怪しい動きがないか見てるよ'
      ],
      voting: [
        '難しい選択だけど、よく考えよう',
        '間違えたくないから慎重に',
        '今までの発言を思い出してる',
        '正しい選択をしたいね'
      ],
      night: [
        '夜は怖いね...',
        '朝が来るのを待とう',
        '何か起きないといいけど',
        '静かに待つしかない'
      ]
    };
    
    const phaseMessages = messages[phase] || messages.day;
    return phaseMessages[Math.floor(Math.random() * phaseMessages.length)];
  }
  
  private triggerAIResponse(message: ChatMessage) {
    if (!this.gameState || this.gameState.phase === 'ended') return;
    
    // AIプレイヤーのみ抽出（発言者以外）
    const aiPlayers = this.gameState.players.filter(p =>
      isAIPlayer(p.name) &&
      p.isAlive &&
      p.id !== message.playerId
    );
    
    if (aiPlayers.length === 0) return;
    
    // 戦略的な内容かどうかで反応確率を調整
    const content = message.content.toLowerCase();
    const isStrategicContent = content.includes('人狼') || content.includes('怪しい') ||
                              content.includes('疑') || content.includes('投票') ||
                              content.includes('占い') || content.includes('襲撃') ||
                              content.includes('処刑') || content.includes('証拠');
    
    const isAIMessage = isAIPlayer(message.playerName);
    let baseReactionChance = 0.25; // 基本確率を下げる
    
    if (isStrategicContent) {
      baseReactionChance = isAIMessage ? 0.5 : 0.7; // 戦略的内容には高確率で反応
    } else {
      baseReactionChance = isAIMessage ? 0.15 : 0.3; // 一般的内容には低確率
    }
    
    // 最大2人のAIが反応（会話の過密化を防ぐ）
    const maxResponders = Math.min(2, aiPlayers.length);
    const shuffledAIs = [...aiPlayers].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < maxResponders; i++) {
      const aiPlayer = shuffledAIs[i];
      const reactionChance = baseReactionChance * (1 - i * 0.4);
      
      if (Math.random() < reactionChance) {
        // 3-10秒後に返答（戦略的内容は早く、一般的内容は遅く）
        const baseDelay = isStrategicContent ? 3000 : 6000;
        const delay = Math.floor(Math.random() * 4000) + baseDelay + (i * 4000);
        
        setTimeout(() => {
          if (!this.gameState || this.gameState.phase === 'ended' || !aiPlayer.isAlive) return;
          
          const responseMessage = this.generateAIMessage(aiPlayer, message);
          
          const chatMessage: ChatMessage = {
            id: crypto.randomUUID(),
            playerId: aiPlayer.id,
            playerName: aiPlayer.name,
            content: responseMessage,
            timestamp: Date.now(),
            type: 'public'
          };
          
          this.gameState.chatMessages.push(chatMessage);
          this.gameState.updatedAt = Date.now();
          
          console.log(`[AI戦略会話] ${aiPlayer.name}が${message.playerName}に反応: ${responseMessage}`);
          
          this.saveGameState();
          this.broadcastGameState();
          
          // 戦略的内容の場合のみ連鎖反応を許可（確率を下げる）
          if (isStrategicContent && Math.random() < 0.2) {
            this.triggerAIResponse(chatMessage);
          }
        }, delay);
      }
    }
  }

  private scheduleAIVoting() {
    if (!this.gameState) return;

    // AIプレイヤーを取得
    const aiPlayers = this.gameState.players.filter(p =>
      isAIPlayer(p.name) && p.isAlive
    );

    if (aiPlayers.length === 0) {
      console.log(`🤖 [AI投票] 生存AIプレイヤーなし - 投票スケジュールなし`);
      return;
    }

    console.log(`🤖 [AI投票] ${aiPlayers.length}人のAIプレイヤーの投票をスケジュール: ${aiPlayers.map(p => p.name).join(', ')}`);

    // 投票可能な対象を取得（生存している他のプレイヤー）
    const votingTargets = this.gameState.players.filter(p =>
      p.isAlive
    );

    if (votingTargets.length === 0) return;

    // 各AIプレイヤーに対して投票をスケジュール
    aiPlayers.forEach((aiPlayer, index) => {
      // 5-15秒後にランダムに投票
      const delay = 5000 + Math.random() * 10000 + (index * 2000);
      
      setTimeout(() => {
        if (!this.gameState || this.gameState.phase !== 'voting') return;
        
        // まだ投票していない場合のみ投票
        const hasVoted = this.gameState.votes.some(vote => vote.voterId === aiPlayer.id);
        if (hasVoted) return;

        // ランダムに投票対象を選択（人狼の場合は村人を優先）
        let target;
        let voteReason = '';
        
        // 自分以外の投票対象を取得
        const availableTargets = votingTargets.filter(p => p.id !== aiPlayer.id);
        
        if (availableTargets.length === 0) return;
        
        if (aiPlayer.role === 'werewolf') {
          // 人狼は村人を優先的に投票
          const villagers = availableTargets.filter(p => p.role !== 'werewolf');
          if (villagers.length > 0) {
            target = villagers[Math.floor(Math.random() * villagers.length)];
            voteReason = `人狼として村人${target.name}を排除するため投票`;
          } else {
            target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
            voteReason = `人狼として適当に${target.name}に投票（村人が見つからない）`;
          }
        } else {
          // 村人チームはランダムに投票
          target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
          const suspicionReasons = [
            '発言が少なく怪しい',
            '論理的でない発言をしている',
            '他の人を疑う発言が多い',
            '投票行動が不自然',
            '直感的に怪しい',
            '消去法で残った'
          ];
          const reason = suspicionReasons[Math.floor(Math.random() * suspicionReasons.length)];
          voteReason = `${aiPlayer.role === 'seer' ? '占い師' : aiPlayer.role === 'hunter' ? '狩人' : aiPlayer.role === 'medium' ? '霊媒師' : '村人'}として${target.name}が${reason}ため投票`;
        }

        if (target) {
          // 投票を実行
          const vote = {
            voterId: aiPlayer.id,
            targetId: target.id,
            timestamp: Date.now()
          };
          
          this.gameState.votes.push(vote);
          
          // 投票メッセージをチャットに追加
          const voteMessage = {
            id: crypto.randomUUID(),
            playerId: aiPlayer.id,
            playerName: aiPlayer.name,
            content: `${target.name}に投票しました。`,
            timestamp: Date.now(),
            type: 'public' as const
          };
          this.gameState.chatMessages.push(voteMessage);
          
          // デバッグログ出力（開発環境のみ）
          console.log(`[AI投票] ${aiPlayer.name} (${aiPlayer.role}) → ${target.name}`);
          console.log(`[投票理由] ${voteReason}`);
          console.log(`[投票タイミング] ${Math.round(delay/1000)}秒後に投票実行`);
          
          this.gameState.updatedAt = Date.now();
          this.saveGameState();
          this.broadcastGameState();
        }
      }, delay);
    });
  }

  private scheduleAINightActions() {
    if (!this.gameState) return;

    // 夜に行動できるAIプレイヤーを取得
    const nightActors = this.gameState.players.filter(p =>
      isAIPlayer(p.name) &&
      p.isAlive &&
      (p.role === 'werewolf' || p.role === 'seer' || p.role === 'hunter' || p.role === 'medium')
    );

    if (nightActors.length === 0) {
      console.log(`[AI夜間行動] 行動可能なAIプレイヤーなし`);
      return;
    }

    console.log(`[AI夜間行動] ${nightActors.length}人のAIプレイヤーの夜間行動をスケジュール:`);
    nightActors.forEach(p => console.log(`  - ${p.name} (${p.role})`));

    nightActors.forEach((aiPlayer, index) => {
      // 3-10秒後にランダムに行動
      const delay = 3000 + Math.random() * 7000 + (index * 1500);
      
      setTimeout(() => {
        if (!this.gameState || this.gameState.phase !== 'night') return;
        
        // 既に行動済みかチェック
        const hasActed = this.gameState.nightActions?.some(action => action.actorId === aiPlayer.id);
        if (hasActed) return;

        let target;
        let actionType: 'attack' | 'guard' | 'divine' | undefined;
        let actionReason = '';

        switch (aiPlayer.role) {
          case 'werewolf':
            // 人狼は村人を襲撃
            const villagers = this.gameState.players.filter(p =>
              p.isAlive && p.role !== 'werewolf' && p.id !== aiPlayer.id
            );
            if (villagers.length > 0) {
              target = villagers[Math.floor(Math.random() * villagers.length)];
              actionType = 'attack';
              actionReason = `人狼として${target.name}を襲撃（村人を減らすため）`;
            }
            break;

          case 'seer':
            // 占い師は他のプレイヤーを占う
            const divineTargets = this.gameState.players.filter(p =>
              p.isAlive && p.id !== aiPlayer.id
            );
            if (divineTargets.length > 0) {
              target = divineTargets[Math.floor(Math.random() * divineTargets.length)];
              actionType = 'divine';
              actionReason = `占い師として${target.name}を占い（人狼かどうか確認）`;
            }
            break;

          case 'hunter':
            // 狩人は重要そうなプレイヤーを守る
            const guardTargets = this.gameState.players.filter(p =>
              p.isAlive && p.id !== aiPlayer.id
            );
            if (guardTargets.length > 0) {
              target = guardTargets[Math.floor(Math.random() * guardTargets.length)];
              actionType = 'guard';
              const guardReasons = [
                '重要そうなプレイヤーのため',
                '人狼に狙われそうなため',
                '占い師の可能性があるため',
                '発言が村人らしいため'
              ];
              const reason = guardReasons[Math.floor(Math.random() * guardReasons.length)];
              actionReason = `狩人として${target.name}を護衛（${reason}）`;
            }
            break;

          case 'medium':
            // 霊媒師は自動的に霊視（対象不要）
            if (this.gameState.lastExecuted) {
              actionType = 'divine';
              target = aiPlayer;
              actionReason = `霊媒師として${this.gameState.lastExecuted.name}の正体を霊視`;
            }
            break;
        }

        if (target && actionType) {
          // デバッグログ出力
          console.log(`[AI夜間行動] ${aiPlayer.name} (${aiPlayer.role}) → ${actionType} on ${target.name}`);
          console.log(`[行動理由] ${actionReason}`);
          console.log(`⏰ [行動タイミング] ${Math.round(delay/1000)}秒後に実行`);

          // 能力使用メッセージを送信
          this.handleUseAbility(aiPlayer.id, {
            type: 'use_ability',
            roomId: this.gameState.id,
            targetId: target.id,
            ability: actionType
          });
        }
      }, delay);
    });
  }

  /**
   * AIプレイヤーを追加
   */
  private async handleAddAIPlayer(playerId: string) {
    if (!this.gameState) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'ゲーム状態が見つかりません'
      });
      return;
    }

    // ホストのみがAIプレイヤーを追加可能
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player || !player.isHost) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'ホストのみがAIプレイヤーを追加できます'
      });
      return;
    }

    // ゲーム開始後は追加不可
    if (this.gameState.phase !== 'lobby') {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'ゲーム開始後はAIプレイヤーを追加できません'
      });
      return;
    }

    // AIプレイヤー数の制限チェック（8人まで）
    const currentAICount = this.gameState.players.filter(p => isAIPlayer(p.name)).length;
    if (currentAICount >= 8) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'AIプレイヤーは最大8人までです'
      });
      return;
    }

    // 最大プレイヤー数チェック
    if (this.gameState.players.length >= this.gameState.gameSettings.maxPlayers) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'プレイヤー数が上限に達しています'
      });
      return;
    }

    // 使用可能なAI名前を取得
    const usedNames = this.gameState.players.map(p => p.name);
    const availableNames = AI_NAMES.filter(name => !usedNames.includes(name));

    if (availableNames.length === 0) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'これ以上AIプレイヤーを追加できません'
      });
      return;
    }

    // ランダムにAI名前を選択
    const aiName = availableNames[Math.floor(Math.random() * availableNames.length)];
    const aiId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // AI個性を生成
    let aiPersonality;
    if (this.openAIService) {
      try {
        aiPersonality = await this.openAIService.generateAIPersonality(aiName);
      } catch (error) {
        console.error('AI個性生成エラー:', error);
        // フォールバック個性
        aiPersonality = {
          gender: 'neutral' as const,
          personality: 'analytical' as const,
          emotionalState: {
            happiness: 60,
            anger: 20,
            fear: 30,
            confidence: 70,
            suspicion: 40
          },
          traits: ['冷静', '協調的'],
          speechPattern: 'casual' as const,
          biases: {
            trustsEasily: false,
            quickToAccuse: false,
            followsLeader: true,
            independent: false
          }
        };
      }
    } else {
      // OpenAIサービスが利用できない場合のデフォルト個性
      aiPersonality = {
        gender: 'neutral' as const,
        personality: 'analytical' as const,
        emotionalState: {
          happiness: 60,
          anger: 20,
          fear: 30,
          confidence: 70,
          suspicion: 40
        },
        traits: ['冷静', '協調的'],
        speechPattern: 'casual' as const,
        biases: {
          trustsEasily: false,
          quickToAccuse: false,
          followsLeader: true,
          independent: false
        }
      };
    }

    // AIプレイヤーを作成
    const aiPlayer: Player = {
      id: aiId,
      name: aiName,
      role: 'villager', // 役職は後で割り当て
      isAlive: true,
      isHost: false,
      isReady: true,
      joinedAt: Date.now(),
      aiPersonality
    };

    // プレイヤーリストに追加
    this.gameState.players.push(aiPlayer);

    // ゲーム状態を保存
    await this.saveGameState();

    // 全プレイヤーにゲーム状態更新を送信
    this.broadcastToAll({
      type: 'game_state_update',
      gameState: this.gameState
    });

    // プレイヤー参加通知を送信
    this.broadcastToAll({
      type: 'player_joined',
      player: aiPlayer
    });

    console.log(`AIプレイヤー ${aiName} (${aiId}) がルーム ${this.gameState.id} に追加されました`);
  }

  /**
   * AI自動発言システム - 個別ランダムタイミング
   */
  private async scheduleAIMessages() {
    if (!this.gameState) {
      return;
    }

    console.log('🤖 [AI自動発言] システム開始 - 個別ランダムタイミング');

    const aiPlayers = this.gameState.players.filter(p =>
      p.isAlive && isAIPlayer(p.name)
    );

    // 各AIプレイヤーに個別のタイマーを設定
    aiPlayers.forEach((aiPlayer, index) => {
      this.scheduleIndividualAIMessage(aiPlayer, index);
    });
  }

  /**
   * 個別AIプレイヤーの発言スケジュール
   */
  private scheduleIndividualAIMessage(aiPlayer: Player, index: number) {
    // 20-40秒のランダム間隔 + 初期遅延でずらす
    const getRandomInterval = () => Math.floor(Math.random() * 20000) + 20000; // 20-40秒
    const initialDelay = index * 5000; // 各AIプレイヤーを5秒ずつずらす

    const scheduleNext = () => {
      const interval = getRandomInterval();
      const timerId = `ai_message_${aiPlayer.id}`;
      
      const timer = setTimeout(async () => {
        if (!this.gameState || this.gameState.phase === 'lobby' || this.gameState.phase === 'ended') {
          return;
        }

        // プレイヤーがまだ生きているかチェック
        const currentPlayer = this.gameState.players.find(p => p.id === aiPlayer.id);
        if (!currentPlayer || !currentPlayer.isAlive) {
          return;
        }

        try {
          let response: string | null = null;

          // OpenAIサービスが利用可能な場合は使用
          if (this.openAIService) {
            try {
              response = await this.openAIService.determineAIResponse(this.gameState, currentPlayer);
              if (response) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('ja-JP', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });
                console.log(`🤖 [${timeStr}] OpenAI発言 ${currentPlayer.name}: ${response}`);
              }
            } catch (error) {
              console.error(`OpenAI発言生成エラー (${currentPlayer.name}):`, error);
              // フォールバックとして基本的なAI発言を使用
              response = this.generateBasicAIMessage(currentPlayer);
              if (response) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('ja-JP', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });
                console.log(`🤖 [${timeStr}] フォールバック発言 ${currentPlayer.name}: ${response}`);
              }
            }
          } else {
            // OpenAIサービスが利用できない場合は基本的なAI発言を使用
            response = this.generateBasicAIMessage(currentPlayer);
            if (response) {
              const now = new Date();
              const timeStr = now.toLocaleTimeString('ja-JP', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              });
              console.log(`🤖 [${timeStr}] 基本発言 ${currentPlayer.name}: ${response}`);
            }
          }
          
          if (response) {
            // AI発言を送信
            const now = new Date();
            const chatMessage: ChatMessage = {
              id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              playerId: currentPlayer.id,
              playerName: currentPlayer.name,
              content: response,
              timestamp: Date.now(),
              type: 'public'
            };

            this.gameState.chatMessages.push(chatMessage);
            
            // 感情状態を更新（OpenAIサービスが利用可能な場合のみ）
            if (this.openAIService && currentPlayer.aiPersonality) {
              try {
                currentPlayer.aiPersonality = this.openAIService.updateEmotionalState(currentPlayer, this.gameState);
              } catch (error) {
                console.error(`感情状態更新エラー (${currentPlayer.name}):`, error);
              }
            }

            // 最後のメッセージ時間を更新
            (currentPlayer as any).lastMessageTime = Date.now();

            await this.saveGameState();

            // チャットメッセージをブロードキャスト
            this.broadcastToAll({
              type: 'chat',
              roomId: this.gameState.id,
              message: chatMessage,
              isAI: true,
              aiPlayerId: currentPlayer.id
            });

            const timeStr = now.toLocaleTimeString('ja-JP', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            console.log(`🤖 [${timeStr}] AI発言送信 ${currentPlayer.name}: ${response}`);
          }
        } catch (error) {
          console.error(`AI発言生成エラー (${currentPlayer.name}):`, error);
        }

        // 次の発言をスケジュール
        scheduleNext();
      }, interval + (index === 0 ? initialDelay : 0));

      this.timers.set(timerId, timer);
    };

    // 初回スケジュール
    scheduleNext();
  }

  /**
   * 基本的なAI発言生成（OpenAIが利用できない場合のフォールバック）
   */
  private generateBasicAIMessage(aiPlayer: Player): string | null {
    if (!this.gameState) return null;

    // 30%の確率で発言
    if (Math.random() > 0.3) return null;

    const phase = this.gameState.phase;
    const role = aiPlayer.role;
    const currentDay = this.gameState.currentDay || 1;
    
    // 他のプレイヤーをランダムに選択
    const otherPlayers = this.gameState.players.filter(p => p.isAlive && p.id !== aiPlayer.id);
    const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)]?.name || 'someone';

    const messages: { [key: string]: string[] } = {
      day: [
        `${randomPlayer}の発言が気になるな。`,
        `今日は慎重に議論しよう。`,
        `${randomPlayer}はどう思う？`,
        `情報を整理してみよう。`,
        `${randomPlayer}の行動が怪しい気がする。`,
        `みんなで協力して真実を見つけよう。`,
        `${randomPlayer}の意見を聞きたい。`
      ],
      voting: [
        `${randomPlayer}に投票しようと思う。`,
        `難しい選択だが、${randomPlayer}が怪しい。`,
        `証拠は少ないが、${randomPlayer}に投票する。`,
        `消去法で考えると${randomPlayer}かな。`,
        `${randomPlayer}の弁明を聞きたい。`
      ],
      night: [
        `夜は静かだね...`,
        `明日はどうなるかな。`,
        `朝が来るのを待とう。`,
        `何も起きないといいけど。`
      ]
    };

    // 役職に応じた特別なメッセージ
    if (role === 'seer' && phase === 'day' && currentDay > 1) {
      const seerMessages = [
        `占い結果を報告する。${randomPlayer}は${Math.random() < 0.3 ? '人狼' : '村人'}だった。`,
        `重要な情報がある。${randomPlayer}について話したい。`,
        `占い師として断言する。${randomPlayer}は信用できる。`,
        `昨夜の占い結果について話そう。`
      ];
      return seerMessages[Math.floor(Math.random() * seerMessages.length)];
    }

    if (role === 'werewolf') {
      const werewolfMessages = [
        `${randomPlayer}の推理は鋭いね。`,
        `村人として、${randomPlayer}を信じたい。`,
        `${randomPlayer}の発言に同感だ。`,
        `慎重に判断しよう。`,
        `${randomPlayer}の意見は参考になる。`
      ];
      return werewolfMessages[Math.floor(Math.random() * werewolfMessages.length)];
    }

    const phaseMessages = messages[phase] || messages.day;
    return phaseMessages[Math.floor(Math.random() * phaseMessages.length)];
  }

  /**
   * AI自動投票・能力使用
   */
  private async handleAIActions() {
    if (!this.gameState) {
      return;
    }

    const aiPlayers = this.gameState.players.filter(p =>
      p.isAlive && isAIPlayer(p.name)
    );

    for (const aiPlayer of aiPlayers) {
      try {
        if (this.gameState.phase === 'voting') {
          // 投票フェーズでの自動投票
          const hasVoted = this.gameState.votes.some(v => v.voterId === aiPlayer.id);
          if (!hasVoted) {
            const alivePlayers = this.gameState.players.filter(p =>
              p.isAlive && p.id !== aiPlayer.id
            );
            
            if (alivePlayers.length > 0) {
              const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
              
              // 投票を実行
              await this.handleVote(aiPlayer.id, {
                type: 'vote',
                roomId: this.gameState.id,
                vote: {
                  voterId: aiPlayer.id,
                  targetId: target.id
                }
              });
            }
          }
        } else if (this.gameState.phase === 'night') {
          // 夜フェーズでの能力使用
          const nightActions = this.gameState.nightActions || [];
          
          if (aiPlayer.role === 'werewolf') {
            const hasActed = nightActions.some(a =>
              a.actorId === aiPlayer.id && a.type === 'attack'
            );
            
            if (!hasActed) {
              const targets = this.gameState.players.filter(p =>
                p.isAlive && p.id !== aiPlayer.id && p.role !== 'werewolf'
              );
              
              if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                
                await this.handleUseAbility(aiPlayer.id, {
                  type: 'use_ability',
                  roomId: this.gameState.id,
                  playerId: aiPlayer.id,
                  targetId: target.id
                });
              }
            }
          } else if (aiPlayer.role === 'seer') {
            const hasActed = nightActions.some(a =>
              a.actorId === aiPlayer.id && a.type === 'divine'
            );
            
            if (!hasActed) {
              const targets = this.gameState.players.filter(p =>
                p.isAlive && p.id !== aiPlayer.id
              );
              
              if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                
                await this.handleUseAbility(aiPlayer.id, {
                  type: 'use_ability',
                  roomId: this.gameState.id,
                  playerId: aiPlayer.id,
                  targetId: target.id
                });
              }
            }
          } else if (aiPlayer.role === 'hunter') {
            const hasActed = nightActions.some(a =>
              a.actorId === aiPlayer.id && a.type === 'guard'
            );
            
            if (!hasActed) {
              const targets = this.gameState.players.filter(p =>
                p.isAlive && p.id !== aiPlayer.id
              );
              
              if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                
                await this.handleUseAbility(aiPlayer.id, {
                  type: 'use_ability',
                  roomId: this.gameState.id,
                  playerId: aiPlayer.id,
                  targetId: target.id
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`AI行動エラー (${aiPlayer.name}):`, error);
      }
    }
  }

  /**
   * プレイヤーキック処理
   */
  private async handleKickPlayer(playerId: string, message: any) {
    if (!this.gameState) {
      console.error('ゲーム状態が存在しません');
      return;
    }

    // ホストかどうかチェック
    const kicker = this.gameState.players.find(p => p.id === playerId);
    if (!kicker || !kicker.isHost) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'ホストのみがプレイヤーをキックできます'
      });
      return;
    }

    // ゲーム中はキック不可
    if (this.gameState.phase !== 'lobby') {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'ゲーム中はプレイヤーをキックできません'
      });
      return;
    }

    const targetPlayerId = message.playerId;
    const targetPlayer = this.gameState.players.find(p => p.id === targetPlayerId);
    
    if (!targetPlayer) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'キック対象のプレイヤーが見つかりません'
      });
      return;
    }

    // ホスト自身はキックできない
    if (targetPlayer.isHost) {
      this.sendToPlayer(playerId, {
        type: 'error',
        message: 'ホストをキックすることはできません'
      });
      return;
    }

    // プレイヤーを削除
    this.gameState.players = this.gameState.players.filter(p => p.id !== targetPlayerId);

    // WebSocket接続を切断
    const targetWs = this.websockets.get(targetPlayerId);
    if (targetWs) {
      try {
        targetWs.close(1000, 'キックされました');
      } catch (error) {
        console.error('WebSocket切断エラー:', error);
      }
      this.websockets.delete(targetPlayerId);
    }

    await this.saveGameState();

    // 全プレイヤーに通知
    this.broadcastToAll({
      type: 'player_kicked',
      playerId: targetPlayerId,
      playerName: targetPlayer.name,
      kickedBy: kicker.name
    });

    this.broadcastToAll({
      type: 'game_state_update',
      gameState: this.gameState
    });

    console.log(`プレイヤー ${targetPlayer.name} (${targetPlayerId}) がホスト ${kicker.name} によってキックされました`);
  }
}