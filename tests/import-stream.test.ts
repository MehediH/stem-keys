import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readImportStream } from '../lib/import-stream.ts';

function response(events: object[]) {
  const data = new TextEncoder().encode(
    events.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split JSON and multibyte characters across network chunks.
        for (let i = 0; i < data.length; i += 7)
          controller.enqueue(data.slice(i, i + 7));
        controller.close();
      },
    }),
  );
}

void test('import stream exposes measured progress and assembles audio across chunk boundaries', async () => {
  const progress: (number | null)[] = [];
  const file = await readImportStream(
    response([
      { type: 'progress', stage: 'Importing from YouTube', progress: 45 },
      { type: 'progress', stage: 'Preparing audio', progress: null },
      { type: 'audio', title: 'Café', size: 4 },
      { type: 'chunk', data: 'AQI=' },
      { type: 'chunk', data: 'AwQ=' },
      { type: 'complete' },
    ]),
    (_stage, value) => progress.push(value),
  );
  assert.equal(file.name, 'Café.mp3');
  assert.deepEqual(
    new Uint8Array(await file.arrayBuffer()),
    new Uint8Array([1, 2, 3, 4]),
  );
  assert.deepEqual(progress, [45, null, 0, 50, 100]);
});

void test('failed or truncated imports never become playable files', async () => {
  await assert.rejects(
    readImportStream(
      response([{ type: 'error', error: 'Song unavailable' }]),
      () => {},
    ),
    /Song unavailable/,
  );
  await assert.rejects(
    readImportStream(
      response([
        { type: 'audio', title: 'Partial', size: 4 },
        { type: 'chunk', data: 'AQI=' },
        { type: 'complete' },
      ]),
      () => {},
    ),
    /interrupted/,
  );
});
