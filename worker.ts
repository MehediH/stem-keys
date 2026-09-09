import app from 'vinext/server/fetch-handler';
import { MODEL_URL, MODEL_BYTES } from './lib/model';
import { importYoutube, type YoutubeEnv } from './lib/youtube-import';

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown> & YoutubeEnv,
    ctx: unknown,
  ) {
    if (new URL(request.url).pathname === '/api/youtube')
      return importYoutube(request, env);
    if (new URL(request.url).pathname !== '/api/model')
      return app.fetch(request, env, ctx);
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    try {
      // Bypass the application framework for this large, fixed public download.
      // The native response stream passes through without clones or buffering.
      const upstream = await fetch(MODEL_URL, {
        method: request.method,
        cache: 'no-store',
        signal: request.signal,
      });
      if (!upstream.ok)
        return new Response('Model download unavailable. Please retry.', {
          status: 502,
        });
      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(MODEL_BYTES),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Model download unavailable. Please retry.', {
        status: 502,
      });
    }
  },
};
