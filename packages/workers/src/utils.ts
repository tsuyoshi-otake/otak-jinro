/**
 * ランダムなルームIDを生成
 */
export function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * プレイヤー名のバリデーション
 */
export function validatePlayerName(name: string): boolean {
  return name.length >= 2 && name.length <= 20 && /^[a-zA-Z0-9あ-んア-ン一-龯\s]+$/.test(name);
}

/**
 * ルームIDのバリデーション
 */
export function validateRoomId(roomId: string): boolean {
  return /^[A-Z0-9]{6}$/.test(roomId);
}

/**
 * APIレスポンスを作成
 */
export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string,
  status: number = 200
): Response {
  return new Response(JSON.stringify({
    success,
    data,
    error,
    timestamp: Date.now()
  }), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * CORSヘッダーを追加
 */
export function addCorsHeaders(response: Response, corsOrigin: string = '*'): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', corsOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}