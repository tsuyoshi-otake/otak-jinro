// Cloudflare Pages Functions for Next.js
export default {
  async fetch(request, env, ctx) {
    // Next.js アプリケーションのルーティング
    const url = new URL(request.url);
    
    // API ルートの処理
    if (url.pathname.startsWith('/api/')) {
      // Workers API にプロキシ
      const workersUrl = 'https://otak-jinro-workers.systemexe-research-and-development.workers.dev' + url.pathname + url.search;
      return fetch(workersUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    }
    
    // 静的ファイルを ASSETS から取得
    const response = await env.ASSETS.fetch(request);
    
    // CSSファイルの場合、Content-Typeヘッダーを明示的に設定
    if (url.pathname.endsWith('.css')) {
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers),
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
      return newResponse;
    }
    
    // その他の静的ファイルはそのまま返す
    return response;
  },
};