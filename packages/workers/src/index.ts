import { GameRoom } from './gameRoom';
import { Env, ExecutionContext } from './types';
import { generateRoomId } from './utils';

export { GameRoom };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS設定 - GitHub Pages対応
    const allowedOrigins = [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://tsuyoshi-otake.github.io',
      env.CORS_ORIGIN
    ].filter(Boolean);
    
    const origin = request.headers.get('Origin');
    const corsOrigin = allowedOrigins.includes(origin || '') ? (origin || '*') : '*';
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };

    // プリフライトリクエスト
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ルーム作成API
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        return await handleCreateRoom(request, env, corsHeaders);
      }

      // ルーム参加API
      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/join') && request.method === 'POST') {
        const roomId = url.pathname.split('/')[3];
        return await handleJoinRoom(request, env, roomId, corsHeaders);
      }

      // プレイヤーキックAPI
      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/kick') && request.method === 'POST') {
        const roomId = url.pathname.split('/')[3];
        return await handleKickPlayer(request, env, roomId, corsHeaders);
      }

      // WebSocket接続
      if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/ws')) {
        const roomId = url.pathname.split('/')[3];
        return await handleWebSocket(request, env, roomId);
      }

      // 公開ルーム一覧取得
      if (url.pathname === '/api/rooms/public' && request.method === 'GET') {
        return await handleGetPublicRooms(request, env, corsHeaders);
      }

      // ランダム公開ルーム参加
      if (url.pathname === '/api/rooms/join-random' && request.method === 'POST') {
        return await handleJoinRandomRoom(request, env, corsHeaders);
      }

      // ルーム情報取得
      if (url.pathname.startsWith('/api/rooms/') && request.method === 'GET') {
        const roomId = url.pathname.split('/')[3];
        return await handleGetRoom(request, env, roomId, corsHeaders);
      }

      // ヘルスチェック
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ 
          status: 'ok', 
          timestamp: Date.now(),
          environment: env.ENVIRONMENT 
        }), {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }

      return new Response('Not Found', { 
        status: 404, 
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Internal Server Error',
        timestamp: Date.now()
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }
  },
};

async function handleCreateRoom(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as any;
    const roomId = generateRoomId();
    
    // Durable Objectインスタンスを取得
    const roomObjectId = env.GAME_ROOMS.idFromName(roomId);
    const roomObject = env.GAME_ROOMS.get(roomObjectId);
    
    // ルーム初期化
    const initRequest = new Request(`https://dummy.com/api/room`, {
      method: 'POST',
      body: JSON.stringify({
        roomId,
        hostName: body.hostName,
        settings: body.settings
      })
    });
    
    await roomObject.fetch(initRequest);
    
    return new Response(JSON.stringify({
      success: true,
      data: { roomId },
      timestamp: Date.now()
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to create room',
      timestamp: Date.now()
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}

async function handleJoinRoom(
  request: Request, 
  env: Env, 
  roomId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as any;
    
    const roomObjectId = env.GAME_ROOMS.idFromName(roomId);
    const roomObject = env.GAME_ROOMS.get(roomObjectId);
    
    const joinRequest = new Request(`https://dummy.com/api/room`, {
      method: 'POST',
      body: JSON.stringify({
        roomId,
        playerName: body.playerName,
        isAI: body.isAI || false,
        aiPersonality: body.aiPersonality
      })
    });
    
    const response = await roomObject.fetch(joinRequest);
    const result = await response.json();
    
    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to join room',
      timestamp: Date.now()
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}

async function handleWebSocket(
  request: Request, 
  env: Env, 
  roomId: string
): Promise<Response> {
  const roomObjectId = env.GAME_ROOMS.idFromName(roomId);
  const roomObject = env.GAME_ROOMS.get(roomObjectId);
  
  const wsRequest = new Request(`https://dummy.com/websocket?roomId=${roomId}`, {
    headers: request.headers
  });
  
  return await roomObject.fetch(wsRequest);
}

async function handleGetRoom(
  request: Request, 
  env: Env, 
  roomId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const roomObjectId = env.GAME_ROOMS.idFromName(roomId);
    const roomObject = env.GAME_ROOMS.get(roomObjectId);
    
    const getRoomRequest = new Request(`https://dummy.com/api/room`, {
      method: 'GET'
    });
    
    const response = await roomObject.fetch(getRoomRequest);
    const result = await response.json();
    
    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Room not found',
      timestamp: Date.now()
    }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}

async function handleKickPlayer(
  request: Request,
  env: Env,
  roomId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as any;
    const roomObjectId = env.GAME_ROOMS.idFromName(roomId);
    const roomObject = env.GAME_ROOMS.get(roomObjectId);
    
    const kickRequest = new Request(`https://dummy.com/api/room/kick`, {
      method: 'POST',
      body: JSON.stringify({
        playerId: body.playerId
      })
    });
    
    const response = await roomObject.fetch(kickRequest);
    const result = await response.json();
    
    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to kick player',
      timestamp: Date.now()
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
async function handleGetPublicRooms(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    // KVストレージから公開ルーム一覧を取得
    const publicRoomsData = await env.PUBLIC_ROOMS.list();
    const publicRooms = [];

    for (const key of publicRoomsData.keys) {
      try {
        const roomId = key.name;
        const roomObjectId = env.GAME_ROOMS.idFromName(roomId);
        const roomObject = env.GAME_ROOMS.get(roomObjectId);
        
        const getRoomRequest = new Request(`https://dummy.com/api/room`, {
          method: 'GET'
        });
        
        const response = await roomObject.fetch(getRoomRequest);
        if (response.ok) {
          const roomData = await response.json();
          
          // 公開ルームで、ロビー状態で、プレイヤー数が10人未満の場合のみ追加
          if (roomData.success && roomData.gameState?.isPublic && 
              roomData.gameState?.phase === 'lobby' && 
              roomData.gameState?.players?.length < 10) {
            publicRooms.push({
              roomId: roomId,
              playerCount: roomData.gameState.players.length,
              hostName: roomData.gameState.players.find((p: any) => p.isHost)?.name || 'Unknown',
              createdAt: roomData.gameState.createdAt || Date.now()
            });
          }
        }
      } catch (error) {
        // 個別のルーム取得エラーは無視して続行
        console.log(`Failed to get room ${key.name}:`, error);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      publicRooms: publicRooms.sort((a, b) => b.createdAt - a.createdAt), // 新しい順
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Failed to get public rooms:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to get public rooms',
      timestamp: Date.now()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

async function handleJoinRandomRoom(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as any;
    const playerName = body.playerName;

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Player name is required',
        timestamp: Date.now()
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // 公開ルーム一覧を取得
    const publicRoomsResponse = await handleGetPublicRooms(request, env, corsHeaders);
    const publicRoomsData = await publicRoomsResponse.json();

    if (!publicRoomsData.success || publicRoomsData.publicRooms.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No available public rooms',
        timestamp: Date.now()
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // ランダムに部屋を選択
    const randomIndex = Math.floor(Math.random() * publicRoomsData.publicRooms.length);
    const selectedRoom = publicRoomsData.publicRooms[randomIndex];

    // 選択された部屋に参加
    const joinRequest = new Request(`https://dummy.com/api/rooms/${selectedRoom.roomId}/join`, {
      method: 'POST',
      body: JSON.stringify({ playerName }),
      headers: { 'Content-Type': 'application/json' }
    });

    return await handleJoinRoom(joinRequest, env, selectedRoom.roomId, corsHeaders);

  } catch (error) {
    console.error('Failed to join random room:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to join random room',
      timestamp: Date.now()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
}