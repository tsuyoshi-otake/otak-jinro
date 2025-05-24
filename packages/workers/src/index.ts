import { GameRoom } from './gameRoom';
import { Env, ExecutionContext } from './types';
import { generateRoomId } from './utils';

export { GameRoom };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
}