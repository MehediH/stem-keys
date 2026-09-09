import assert from 'node:assert/strict';
import test from 'node:test';
import { youtubeVideoUrl } from '../lib/youtube.ts';
import { importYoutube } from '../lib/youtube-import.ts';

const canonical = 'https://www.youtube.com/watch?v=GFe6xPYvoeY';
const origin = 'https://stem-keys.mehedih.workers.dev';
const request = (url: string, extraHeaders = {}) =>
  new Request(`${origin}/api/youtube`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({ url }),
  });

void test('song links canonicalize without playlist or tracking parameters; arbitrary destinations are rejected', () => {
  for (const url of [
    canonical,
    'https://youtu.be/GFe6xPYvoeY?is=tracking',
    'https://music.youtube.com/watch?v=GFe6xPYvoeY&list=playlist',
  ])
    assert.equal(youtubeVideoUrl(url), canonical);
  for (const url of [
    'https://youtube.com.evil.test/watch?v=GFe6xPYvoeY',
    'https://youtube.com@localhost/watch?v=GFe6xPYvoeY',
    'http://youtube.com/watch?v=GFe6xPYvoeY',
    'https://127.0.0.1/',
    'file:///etc/passwd',
    'https://music.youtube.com/playlist?list=123',
    'https://youtu.be/../../anything',
    'https://youtube.com:444/watch?v=GFe6xPYvoeY',
  ])
    assert.equal(youtubeVideoUrl(url), null);
});

void test('only a canonical URL is forwarded and audio is streamed unchanged', async () => {
  let sent: unknown;
  const response = await importYoutube(
    request('https://youtu.be/GFe6xPYvoeY?is=tracking'),
    {
      YOUTUBE_IMPORTER: {
        fetch: async (req) => {
          sent = await req.json();
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: {
              'Content-Type': 'audio/mpeg',
              'X-Audio-Title': 'A%20song',
            },
          });
        },
      },
    },
  );
  assert.deepEqual(sent, { url: canonical });
  assert.equal(response.headers.get('X-Audio-Title'), 'A%20song');
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );
});

void test('invalid, cross-origin, oversized and rate-limited requests never reach the importer', async () => {
  let calls = 0;
  const env = {
    YOUTUBE_IMPORTER: {
      fetch: async () => {
        calls++;
        return new Response();
      },
    },
  };
  assert.equal(
    (await importYoutube(request('https://localhost'), env)).status,
    400,
  );
  assert.equal(
    (
      await importYoutube(
        request(canonical, { Origin: 'https://elsewhere.test' }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await importYoutube(request('x'.repeat(5000)), env)).status,
    413,
  );
  assert.equal(
    (
      await importYoutube(request(canonical), {
        ...env,
        IMPORT_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
  assert.equal(calls, 0);
  assert.equal((await importYoutube(request(canonical), {})).status, 503);
});
