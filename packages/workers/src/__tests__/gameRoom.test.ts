import { GameRoom } from '../gameRoom';
import { Player, GameState, Vote } from '@otak-jinro/shared';

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

  describe('HTTP API', () => {
    describe('POST /create', () => {
      it('新しいゲームルームを作成する', async () => {
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
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('roomId');
        expect(result.data).toHaveProperty('gameState');
      });

      it('無効なホスト名でエラーを返す', async () => {
        const requestBody = {
          hostName: 'a', // 短すぎる名前
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
        const result = await response.json();

        expect(response.status).toBe(400);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid player name');
      });
    });

    describe('POST /join', () => {
      beforeEach(async () => {
        // 事前にルームを作成
        const createRequest = new (global as any).Request('http://localhost/create', {
          method: 'POST',
          body: JSON.stringify({
            hostName: 'Host',
            settings: {
              maxPlayers: 8,
              dayDuration: 300,
              nightDuration: 120,
              votingDuration: 60,
              enableVoiceChat: false,
              enableSpectators: false,
              customRoles: []
            }
          }),
          headers: { 'Content-Type': 'application/json' }
        });
        await gameRoom.fetch(createRequest);
      });

      it('プレイヤーがルームに参加できる', async () => {
        const requestBody = {
          playerName: 'Player1'
        };

        const request = new (global as any).Request('http://localhost/join', {
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await gameRoom.fetch(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('playerId');
        expect(result.data).toHaveProperty('gameState');
      });

      it('無効なプレイヤー名でエラーを返す', async () => {
        const requestBody = {
          playerName: '' // 空の名前
        };

        const request = new (global as any).Request('http://localhost/join', {
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await gameRoom.fetch(request);
        const result = await response.json();

        expect(response.status).toBe(400);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid player name');
      });
    });

    describe('GET /state', () => {
      beforeEach(async () => {
        // 事前にルームを作成
        const createRequest = new (global as any).Request('http://localhost/create', {
          method: 'POST',
          body: JSON.stringify({
            hostName: 'Host',
            settings: {
              maxPlayers: 8,
              dayDuration: 300,
              nightDuration: 120,
              votingDuration: 60,
              enableVoiceChat: false,
              enableSpectators: false,
              customRoles: []
            }
          }),
          headers: { 'Content-Type': 'application/json' }
        });
        await gameRoom.fetch(createRequest);
      });

      it('ゲーム状態を取得できる', async () => {
        const request = new (global as any).Request('http://localhost/state', {
          method: 'GET'
        });

        const response = await gameRoom.fetch(request);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('phase');
        expect(result.data).toHaveProperty('players');
        expect(result.data.players).toHaveLength(1);
      });
    });
  });

  describe('WebSocket接続', () => {
    it('WebSocketアップグレードリクエストを処理する', async () => {
      const request = new (global as any).Request('http://localhost/ws', {
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'test-key',
          'Sec-WebSocket-Version': '13'
        }
      });

      const response = await gameRoom.fetch(request);

      expect(response.status).toBe(101);
    });
  });

  describe('プライベートメソッドのテスト（間接的）', () => {
    describe('createPlayer', () => {
      it('プレイヤー作成時に正しいデータ構造を持つ', async () => {
        const createRequest = new (global as any).Request('http://localhost/create', {
          method: 'POST',
          body: JSON.stringify({
            hostName: 'TestPlayer',
            settings: {
              maxPlayers: 8,
              dayDuration: 300,
              nightDuration: 120,
              votingDuration: 60,
              enableVoiceChat: false,
              enableSpectators: false,
              customRoles: []
            }
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await gameRoom.fetch(createRequest);
        const result = await response.json();

        const player = result.data.gameState.players[0];
        expect(player).toHaveProperty('id');
        expect(player).toHaveProperty('name');
        expect(player).toHaveProperty('isAlive');
        expect(player).toHaveProperty('isHost');
        expect(player).toHaveProperty('isReady');
        expect(player).toHaveProperty('joinedAt');
        expect(player.name).toBe('TestPlayer');
        expect(player.isHost).toBe(true);
        expect(player.isAlive).toBe(true);
      });
    });

    describe('ゲーム状態の管理', () => {
      it('ルーム作成時に初期状態が正しく設定される', async () => {
        const createRequest = new (global as any).Request('http://localhost/create', {
          method: 'POST',
          body: JSON.stringify({
            hostName: 'Host',
            settings: {
              maxPlayers: 6,
              dayDuration: 180,
              nightDuration: 90,
              votingDuration: 45,
              enableVoiceChat: true,
              enableSpectators: true,
              customRoles: ['werewolf', 'seer', 'villager', 'villager']
            }
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await gameRoom.fetch(createRequest);
        const result = await response.json();

        const gameState = result.data.gameState;
        expect(gameState.phase).toBe('lobby');
        expect(gameState.currentDay).toBe(1);
        expect(gameState.votes).toEqual([]);
        expect(gameState.chatMessages).toEqual([]);
        expect(gameState.gameSettings.maxPlayers).toBe(6);
        expect(gameState.gameSettings.dayDuration).toBe(180);
        expect(gameState.gameSettings.customRoles).toEqual(['werewolf', 'seer', 'villager', 'villager']);
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('無効なHTTPメソッドでエラーを返す', async () => {
      const request = new (global as any).Request('http://localhost/create', {
        method: 'DELETE'
      });

      const response = await gameRoom.fetch(request);

      expect(response.status).toBe(405);
    });

    it('無効なパスでエラーを返す', async () => {
      const request = new (global as any).Request('http://localhost/invalid-path', {
        method: 'GET'
      });

      const response = await gameRoom.fetch(request);

      expect(response.status).toBe(404);
    });

    it('不正なJSONでエラーを返す', async () => {
      const request = new (global as any).Request('http://localhost/create', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await gameRoom.fetch(request);

      expect(response.status).toBe(400);
    });
  });
});