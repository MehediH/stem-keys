import { youtubeVideoUrl } from './youtube.ts';

type Importer = { fetch(request: Request): Promise<Response> };
export type YoutubeEnv = {
  YOUTUBE_IMPORTER?: Importer;
  IMPORT_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
};

export async function importYoutube(
  request: Request,
  env: YoutubeEnv,
): Promise<Response> {
  const fail = (message: string, status: number) =>
    Response.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    return fail('Open the player to import a song.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    return fail('Send a YouTube link.', 415);
  // Read a bounded body even when Content-Length is missing or dishonest.
  const reader = request.body?.getReader();
  if (!reader) return fail('Paste a YouTube Music or YouTube song link.', 400);
  let body = '';
  let length = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        return fail('That link is too long.', 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const payload = JSON.parse(body);
    const url =
      typeof payload?.url === 'string' ? youtubeVideoUrl(payload.url) : null;
    if (!url)
      return fail('Paste a link to one YouTube Music or YouTube song.', 400);
    if (!env.YOUTUBE_IMPORTER)
      return fail(
        'YouTube import is not available yet. Upload an audio file instead.',
        503,
      );
    if (
      env.IMPORT_LIMITER &&
      !(
        await env.IMPORT_LIMITER.limit({
          key: request.headers.get('CF-Connecting-IP') ?? 'local',
        })
      ).success
    )
      return fail('Too many imports. Wait a minute and try again.', 429);
    return await env.YOUTUBE_IMPORTER.fetch(
      new Request('https://importer/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: request.signal,
      }),
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      return fail('Paste a valid YouTube link.', 400);
    return fail(
      'YouTube import failed. Try again or upload an audio file.',
      502,
    );
  } finally {
    reader.releaseLock();
  }
}
