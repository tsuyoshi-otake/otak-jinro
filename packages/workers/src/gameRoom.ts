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

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private gameState: GameState | null = null;
  private websockets: Map<string, CloudflareWebSocket> = new Map();
  private timers: Map<string, any> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
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
              maxPlayers: 12,
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
    
    // AIプレイヤーのチャットを開始
    this.startAIChat();
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
    
    // AIプレイヤーが文脈に応じて反応（無効化 - フロントエンドでOpenAI APIを使用）
    // this.triggerAIResponse(chatMessage);
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

    const duration = this.gameState.phase === 'day' 
      ? this.gameState.gameSettings.dayDuration
      : this.gameState.gameSettings.nightDuration;

    const timerId = setTimeout(() => {
      this.nextPhase();
    }, duration * 1000);

    this.timers.set('phase', timerId);
  }

  private async nextPhase() {
    if (!this.gameState) return;

    switch (this.gameState.phase) {
      case 'day':
        this.gameState.phase = 'voting';
        this.gameState.timeRemaining = this.gameState.gameSettings.votingDuration;
        break;
      case 'voting':
        await this.processVoting();
        this.gameState.phase = 'night';
        this.gameState.timeRemaining = this.gameState.gameSettings.nightDuration;
        break;
      case 'night':
        await this.processNight();
        this.gameState.phase = 'day';
        this.gameState.currentDay++;
        this.gameState.timeRemaining = this.gameState.gameSettings.dayDuration;
        break;
    }

    const winner = checkWinCondition(this.gameState.players);
    if (winner) {
      this.gameState.phase = 'ended';
      // ゲーム終了処理
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
    const aiPlayers = this.gameState.players.filter(p => p.name.startsWith('AI-') && p.isAlive);
    
    if (aiPlayers.length === 0) return;
    
    // 各AIプレイヤーに対してランダムな間隔でチャットを送信
    aiPlayers.forEach(aiPlayer => {
      this.scheduleAIChat(aiPlayer);
    });
  }
  
  private scheduleAIChat(aiPlayer: Player) {
    if (!this.gameState || this.gameState.phase === 'ended') return;
    
    // 10-30秒のランダムな間隔
    const delay = Math.floor(Math.random() * 20000) + 10000;
    
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
      
      this.saveGameState();
      this.broadcastGameState();
      
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
      const isTargeted = content.includes(aiPlayer.name.toLowerCase()) ||
                        content.includes('ai-') ||
                        content.includes('全員') ||
                        content.includes('みんな');
      
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
    
    // フェーズと役職に応じたメッセージのパターン
    const messages: { [key: string]: string[] } = {
      day_villager: [
        '誰が人狼か分からないな...',
        'みんなで協力して人狼を見つけよう！',
        '怪しい人はいないかな？',
        '昨夜は何も起きなかったみたい',
        '誰を信じればいいんだろう'
      ],
      day_werewolf: [
        '私は村人だよ！',
        'みんなで人狼を探そう',
        '誰か怪しい人はいる？',
        '昨夜は怖かったな...',
        '村人として頑張るよ'
      ],
      day_seer: [
        '占い結果を共有すべきかな...',
        'みんなの意見を聞きたい',
        '慎重に行動しないと',
        '誰を占うべきか悩むな',
        '重要な情報があるかも'
      ],
      voting_all: [
        '投票の時間だ',
        '誰に投票しようかな',
        'よく考えて投票しよう',
        '間違えたくないな',
        '難しい選択だ...'
      ],
      night_all: [
        '夜が来た...',
        '静かな夜だ',
        '朝が待ち遠しい',
        '何か起きそうな予感',
        '無事に朝を迎えたい'
      ]
    };
    
    let messageKey = `${phase}_${role}`;
    if (!messages[messageKey]) {
      messageKey = `${phase}_all`;
    }
    
    const availableMessages = messages[messageKey] || messages.day_villager;
    return availableMessages[Math.floor(Math.random() * availableMessages.length)];
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
  
  private triggerAIResponse(humanMessage: ChatMessage) {
    if (!this.gameState || this.gameState.phase === 'ended') return;
    
    // AIプレイヤーのみ抽出
    const aiPlayers = this.gameState.players.filter(p =>
      p.name.startsWith('AI-') &&
      p.isAlive &&
      p.id !== humanMessage.playerId
    );
    
    if (aiPlayers.length === 0) return;
    
    // 20%の確率で反応
    if (Math.random() < 0.2) {
      const respondingAI = aiPlayers[Math.floor(Math.random() * aiPlayers.length)];
      
      // 1-3秒後に返答
      const delay = Math.floor(Math.random() * 2000) + 1000;
      
      setTimeout(() => {
        if (!this.gameState || this.gameState.phase === 'ended' || !respondingAI.isAlive) return;
        
        const message = this.generateAIMessage(respondingAI, humanMessage);
        
        const chatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: respondingAI.id,
          playerName: respondingAI.name,
          content: message,
          timestamp: Date.now(),
          type: 'public'
        };
        
        this.gameState.chatMessages.push(chatMessage);
        this.gameState.updatedAt = Date.now();
        
        this.saveGameState();
        this.broadcastGameState();
      }, delay);
    }
  }
}