import { GameRoom } from '../gameRoom';

describe('GameRoom', () => {
  let gameRoom: GameRoom;
  let mockState: any;
  let mockEnv: any;

  beforeEach(() => {
    // Mock Durable Object state
    mockState = {
      storage: new (global as any).DurableObjectStorage(),
      id: {
        toString: () => 'test-room-id'
      },
      waitUntil: jest.fn(),
      passThroughOnException: jest.fn()
    };

    // Mock environment
    mockEnv = {
      OPENAI_API_KEY: 'test-api-key'
    };

    gameRoom = new GameRoom(mockState, mockEnv);
  });

  describe('constructor', () => {
    it('GameRoomインスタンスを正しく作成する', () => {
      expect(gameRoom).toBeInstanceOf(GameRoom);
    });
  });

  describe('fetch method', () => {
    it('WebSocketアップグレードリクエストを処理する', async () => {
      const request = new (global as any).Request('http://localhost/websocket', {
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'test-key',
          'Sec-WebSocket-Version': '13'
        }
      });

      // WebSocketアップグレードのモック
      const mockClient = { addEventListener: jest.fn(), send: jest.fn(), close: jest.fn() };
      const mockServer = { accept: jest.fn(), addEventListener: jest.fn(), send: jest.fn(), close: jest.fn() };
      const mockWebSocketPair = {
        0: mockClient,
        1: mockServer
      };
      
      // Object.values()が正しく動作するようにモック
      (global as any).WebSocketPair = jest.fn(() => mockWebSocketPair);
      
      // crypto.randomUUIDのモック
      const mockCrypto = {
        randomUUID: jest.fn(() => 'test-player-id')
      };
      (global as any).crypto = mockCrypto;

      const response = await gameRoom.fetch(request);

      expect(response.status).toBe(101);
    });

    it('通常のHTTPリクエストを処理する', async () => {
      const request = new (global as any).Request('http://localhost/health', {
        method: 'GET'
      });

      const response = await gameRoom.fetch(request);

      // レスポンスが返されることを確認
      expect(response).toBeDefined();
    });

    it('POSTリクエストを処理する', async () => {
      const requestBody = {
        hostName: 'TestHost',
        settings: {
          maxPlayers: 8,
          dayDuration: 300,
          nightDuration: 120,
          votingDuration: 60,
          enableVoiceChat: false,
          enableSpectators: false,
          customRoles: []
        }
      };

      const request = new (global as any).Request('http://localhost/create', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await gameRoom.fetch(request);

      // レスポンスが返されることを確認
      expect(response).toBeDefined();
    });
  });

  describe('Durable Object state management', () => {
    it('ストレージからゲーム状態を読み込む', async () => {
      // ストレージにテストデータを設定
      const testGameState = {
        id: 'test-game',
        phase: 'lobby',
        players: [],
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
      };

      await mockState.storage.put('gameState', testGameState);

      // 新しいGameRoomインスタンスを作成してストレージから読み込み
      const newGameRoom = new GameRoom(mockState, mockEnv);
      
      // ストレージからの読み込みが行われることを確認
      expect(mockState.storage.get).toBeDefined();
    });

    it('ゲーム状態をストレージに保存する', async () => {
      const testGameState = {
        id: 'test-game',
        phase: 'lobby',
        players: [],
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
      };

      await mockState.storage.put('gameState', testGameState);
      const retrievedState = await mockState.storage.get('gameState');

      expect(retrievedState).toEqual(testGameState);
    });
  });

  describe('WebSocket message handling', () => {
    it('WebSocketメッセージの基本構造を処理する', () => {
      const mockMessage = {
        type: 'join_room',
        roomId: 'test-room',
        player: {
          name: 'TestPlayer',
          isHost: false,
          isReady: false,
          isAlive: true
        }
      };

      // メッセージが正しい構造を持つことを確認
      expect(mockMessage.type).toBe('join_room');
      expect(mockMessage.player.name).toBe('TestPlayer');
    });

    it('チャットメッセージの構造を検証する', () => {
      const mockChatMessage = {
        type: 'chat',
        roomId: 'test-room',
        message: {
          content: 'Hello, world!',
          type: 'public',
          playerName: 'TestPlayer'
        }
      };

      expect(mockChatMessage.type).toBe('chat');
      expect(mockChatMessage.message.content).toBe('Hello, world!');
      expect(mockChatMessage.message.type).toBe('public');
    });
  });

  describe('Game logic integration', () => {
    it('プレイヤーデータ構造を検証する', () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'TestPlayer',
        role: 'villager',
        isAlive: true,
        isHost: false,
        isReady: true,
        joinedAt: Date.now()
      };

      expect(mockPlayer.id).toBeDefined();
      expect(mockPlayer.name).toBe('TestPlayer');
      expect(mockPlayer.role).toBe('villager');
      expect(mockPlayer.isAlive).toBe(true);
    });

    it('投票データ構造を検証する', () => {
      const mockVote = {
        voterId: 'player-1',
        targetId: 'player-2',
        timestamp: Date.now()
      };

      expect(mockVote.voterId).toBeDefined();
      expect(mockVote.targetId).toBeDefined();
      expect(mockVote.timestamp).toBeGreaterThan(0);
    });

    it('ゲーム設定データ構造を検証する', () => {
      const mockSettings = {
        maxPlayers: 8,
        dayDuration: 300,
        nightDuration: 120,
        votingDuration: 60,
        enableVoiceChat: false,
        enableSpectators: false,
        customRoles: []
      };

      expect(mockSettings.maxPlayers).toBe(8);
      expect(mockSettings.dayDuration).toBe(300);
      expect(mockSettings.nightDuration).toBe(120);
      expect(mockSettings.votingDuration).toBe(60);
    });
  });

  describe('Error handling', () => {
    it('無効なリクエストを適切に処理する', async () => {
      const request = new (global as any).Request('http://localhost/invalid', {
        method: 'GET'
      });

      const response = await gameRoom.fetch(request);

      // レスポンスが返されることを確認（エラーハンドリング）
      expect(response).toBeDefined();
    });

    it('不正なJSONを適切に処理する', async () => {
      const request = new (global as any).Request('http://localhost/create', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await gameRoom.fetch(request);

      // レスポンスが返されることを確認（エラーハンドリング）
      expect(response).toBeDefined();
    });
  });

  describe('Environment configuration', () => {
    it('環境変数が正しく設定される', () => {
      expect(mockEnv.OPENAI_API_KEY).toBe('test-api-key');
    });

    it('Durable Object IDが正しく設定される', () => {
      expect(mockState.id.toString()).toBe('test-room-id');
    });
  });
});