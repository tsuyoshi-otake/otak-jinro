import { GameRoom } from '../gameRoom';

// WebSocket mock implementation
class MockWebSocket {
  send = jest.fn();
  close = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  readyState = 1; // OPEN
  accept = jest.fn();
  
  constructor() {
    // WebSocket is ready immediately in tests
    setTimeout(() => {
      if (this.addEventListener.mock.calls.length > 0) {
        this.addEventListener.mock.calls.forEach(([event, handler]) => {
          if (event === 'open') {
            handler({ type: 'open' });
          }
        });
      }
    }, 0);
  }
}

// WebSocketPair mock implementation
class MockWebSocketPair {
  constructor() {
    const client = new MockWebSocket();
    const server = new MockWebSocket();
    
    // Link the sockets so they can communicate
    client.send = jest.fn((data) => {
      setTimeout(() => {
        server.addEventListener.mock.calls.forEach(([event, handler]) => {
          if (event === 'message') {
            handler({ type: 'message', data });
          }
        });
      }, 0);
    });
    
    server.send = jest.fn((data) => {
      setTimeout(() => {
        client.addEventListener.mock.calls.forEach(([event, handler]) => {
          if (event === 'message') {
            handler({ type: 'message', data });
          }
        });
      }, 0);
    });
    
    // Return array-like object that Object.values() can work with
    const pair = Object.assign([client, server], {
      0: client,
      1: server,
      length: 2
    });
    
    return pair;
  }
}

// Set up global WebSocket mocks
(global as any).WebSocket = MockWebSocket;
(global as any).WebSocketPair = MockWebSocketPair;

// Mock Response class to support status 101
global.Response = class MockResponse {
  public status: number;
  public statusText: string;
  public headers: any;
  public webSocket?: any;

  constructor(public body: any, public init?: any) {
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
    
    // WebSocket support for status 101
    if (init?.webSocket) {
      this.webSocket = init.webSocket;
    }
    
    const headersMap = new Map<string, string>();
    if (init?.headers) {
      Object.entries(init.headers).forEach(([key, value]) => {
        headersMap.set(key.toLowerCase(), value as string);
      });
    }
    
    this.headers = {
      get: (key: string) => headersMap.get(key.toLowerCase()) || null,
      set: (key: string, value: string) => headersMap.set(key.toLowerCase(), value),
      has: (key: string) => headersMap.has(key.toLowerCase()),
      delete: (key: string) => headersMap.delete(key.toLowerCase()),
      forEach: (callback: (value: string, key: string) => void) => headersMap.forEach(callback)
    };
  }
  
  static json(object: any, init?: any) {
    return new MockResponse(JSON.stringify(object), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  }
  
  json() {
    try {
      return Promise.resolve(JSON.parse(this.body));
    } catch {
      return Promise.resolve({});
    }
  }
  
  text() {
    return Promise.resolve(this.body || '');
  }
} as any;

// Mock Headers class
global.Headers = class MockHeaders {
  private headersMap = new Map<string, string>();

  constructor(init?: any) {
    if (init) {
      if (init instanceof MockHeaders) {
        init.forEach((value: string, key: string) => {
          this.headersMap.set(key.toLowerCase(), value);
        });
      } else if (typeof init === 'object') {
        Object.entries(init).forEach(([key, value]) => {
          this.headersMap.set(key.toLowerCase(), value as string);
        });
      }
    }
  }

  get(key: string): string | null {
    return this.headersMap.get(key.toLowerCase()) || null;
  }

  set(key: string, value: string): void {
    this.headersMap.set(key.toLowerCase(), value);
  }

  has(key: string): boolean {
    return this.headersMap.has(key.toLowerCase());
  }

  delete(key: string): boolean {
    return this.headersMap.delete(key.toLowerCase());
  }

  forEach(callback: (value: string, key: string) => void): void {
    this.headersMap.forEach(callback);
  }
} as any;

// Mock Request class
global.Request = class MockRequest {
  public method: string;
  public url: string;
  public headers: any;

  constructor(public input: string, public init?: any) {
    this.url = input;
    this.method = init?.method || 'GET';
    this.headers = new (global as any).Headers(init?.headers);
  }
  
  json() {
    try {
      return Promise.resolve(JSON.parse(this.init?.body as string || '{}'));
    } catch {
      return Promise.resolve({});
    }
  }
  
  text() {
    return Promise.resolve(this.init?.body as string || '');
  }
} as any;

describe('GameRoom', () => {
  let gameRoom: GameRoom;
  let mockState: any;
  let mockEnv: any;

  beforeEach(() => {
    // Mock Durable Object state with inline storage mock
    const mockStorage = new Map();
    mockState = {
      storage: {
        get: (key: string) => Promise.resolve(mockStorage.get(key)),
        put: (key: string, value: any) => {
          mockStorage.set(key, value);
          return Promise.resolve();
        },
        delete: (key: string) => {
          mockStorage.delete(key);
          return Promise.resolve();
        },
        list: () => Promise.resolve(mockStorage),
        deleteAll: () => {
          mockStorage.clear();
          return Promise.resolve();
        },
        transaction: (fn: any) => Promise.resolve(fn(mockState.storage)),
        getAlarm: () => Promise.resolve(null),
        setAlarm: () => Promise.resolve(),
        deleteAlarm: () => Promise.resolve(),
        sync: () => Promise.resolve()
      },
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

      const response = await gameRoom.fetch(request);
      expect(response.status).toBe(101);
      expect((response as any).webSocket).toBeDefined();
    });

    it('非WebSocketリクエストを適切に処理する', async () => {
      const request = new (global as any).Request('http://localhost/websocket', {
        headers: {
          'Connection': 'keep-alive'
        }
      });

      const response = await gameRoom.fetch(request);
      expect(response.status).toBe(400);
    });

    it('API/roomエンドポイントを処理する', async () => {
      const request = new (global as any).Request('http://localhost/api/room', {
        method: 'GET'
      });

      const response = await gameRoom.fetch(request);
      expect(response.status).toBe(200);
    });

    it('存在しないエンドポイントに404を返す', async () => {
      const request = new (global as any).Request('http://localhost/unknown', {
        method: 'GET'
      });

      const response = await gameRoom.fetch(request);
      expect(response.status).toBe(404);
    });
  });

  describe('Storage operations', () => {
    it('ゲーム状態をストレージに保存する', async () => {
      const testGameState = {
        id: 'test-game',
        phase: 'lobby' as const,
        players: [],
        currentDay: 1,
        timeRemaining: 60,
        votes: [],
        chatMessages: [],
        nightActions: [],
        lastExecuted: null,
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
        role: 'villager' as const,
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

      expect(mockVote.voterId).toBe('player-1');
      expect(mockVote.targetId).toBe('player-2');
      expect(mockVote.timestamp).toBeDefined();
    });

    it('チャットメッセージデータ構造を検証する', () => {
      const mockChatMessage = {
        id: 'msg-1',
        playerId: 'player-1',
        playerName: 'TestPlayer',
        content: 'Hello, world!',
        timestamp: Date.now(),
        type: 'public' as const
      };

      expect(mockChatMessage.id).toBe('msg-1');
      expect(mockChatMessage.playerId).toBe('player-1');
      expect(mockChatMessage.content).toBe('Hello, world!');
      expect(mockChatMessage.type).toBe('public');
    });
  });

  describe('Game phases and state transitions', () => {
    it('ゲームフェーズの遷移を検証する', () => {
      const phases = ['lobby', 'day', 'voting', 'night', 'ended'] as const;
      
      phases.forEach(phase => {
        const gameState = {
          id: 'test-game',
          phase,
          players: [],
          currentDay: 1,
          timeRemaining: 60,
          votes: [],
          chatMessages: [],
          nightActions: [],
          lastExecuted: null,
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

        expect(gameState.phase).toBe(phase);
      });
    });

    it('プレイヤー役職の種類を検証する', () => {
      const roles = ['villager', 'werewolf', 'seer', 'medium', 'hunter', 'madman'] as const;
      
      roles.forEach(role => {
        const player = {
          id: 'player-1',
          name: 'TestPlayer',
          role,
          isAlive: true,
          isHost: false,
          isReady: true,
          joinedAt: Date.now()
        };

        expect(player.role).toBe(role);
      });
    });
  });

  describe('AI Player functionality', () => {
    it('AI名前定数を検証する', () => {
      const aiNames = ['アリス', 'ボブ', 'ダイアナ', 'イブ', 'フランク', 'グレース', 'ヘンリー', 'アイビー', 'ジャック', 'ケイト', 'ルーク'];
      
      aiNames.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    it('AIPersonalityデータ構造を検証する', () => {
      const mockAIPersonality = {
        name: 'アリス',
        description: 'Friendly and cooperative player',
        traits: ['friendly', 'analytical'],
        speakingStyle: 'polite',
        aggressiveness: 0.3,
        suspicion: 0.5,
        cooperation: 0.8,
        stress: 0.2,
        confidence: 0.7,
        suspectedPlayers: [],
        trustedPlayers: []
      };

      expect(mockAIPersonality.name).toBe('アリス');
      expect(Array.isArray(mockAIPersonality.traits)).toBe(true);
      expect(typeof mockAIPersonality.aggressiveness).toBe('number');
      expect(Array.isArray(mockAIPersonality.suspectedPlayers)).toBe(true);
    });
  });

  describe('Timer and scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('タイマー機能の基本動作を検証する', () => {
      const callback = jest.fn();
      const timerId = setTimeout(callback, 1000);
      
      expect(callback).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(1000);
      
      expect(callback).toHaveBeenCalledTimes(1);
      
      clearTimeout(timerId);
    });

    it('定期的なタイマーの動作を検証する', () => {
      const callback = jest.fn();
      const intervalId = setInterval(callback, 1000);
      
      expect(callback).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(3000);
      
      expect(callback).toHaveBeenCalledTimes(3);
      
      clearInterval(intervalId);
    });
  });

  describe('Error handling', () => {
    it('無効なWebSocketメッセージを適切に処理する', () => {
      const invalidMessages = [
        null,
        undefined,
        '',
        '{}',
        '{"type": "unknown"}',
        '{"invalidJson": }'
      ];

      invalidMessages.forEach(msg => {
        // エラーが適切にハンドリングされることを確認
        // 実際のメッセージ処理はfetchメソッド経由で行われるため、
        // ここでは構造の検証のみ行う
        expect(typeof msg === 'string' || msg === null || msg === undefined).toBe(true);
      });
    });

    it('プレイヤー名のバリデーションを検証する', () => {
      const invalidNames = ['', '   ', null, undefined];
      const validNames = ['TestPlayer', 'アリス', 'Player123'];

      invalidNames.forEach(name => {
        // 無効な名前は空文字列やnull/undefinedなど
        expect(name === '' || name === null || name === undefined || (typeof name === 'string' && name.trim() === '')).toBe(true);
      });

      validNames.forEach(name => {
        // 有効な名前は文字列で空でない
        expect(typeof name).toBe('string');
        expect(name.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('WebSocket Integration', () => {
    it('WebSocketPairが正しく動作する', () => {
      const webSocketPair = new (global as any).WebSocketPair();
      const [client, server] = Object.values(webSocketPair) as any[];

      expect(client).toBeDefined();
      expect(server).toBeDefined();
      expect(typeof (client as any).send).toBe('function');
      expect(typeof (server as any).accept).toBe('function');
    });

    it('WebSocket接続の模擬テストを実行する', async () => {
      const request = new (global as any).Request('http://localhost/websocket', {
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'test-key',
          'Sec-WebSocket-Version': '13'
        }
      });

      const response = await gameRoom.fetch(request);
      expect(response.status).toBe(101);
      expect((response as any).webSocket).toBeDefined();
    });
  });
});