/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/webgpu';
import { separateAudio } from '../lib/separate.js';
import type { StemAudio } from '../lib/audio';
import { MODEL_URL, MODEL_BYTES } from '../lib/model';
const send = (message: object) => self.postMessage(message);

async function modelBytes() {
  let cache: Cache | undefined;
  try {
    cache = await caches.open('stem-keys-model-v1');
    const cached = await cache.match(MODEL_URL);
    if (cached) {
      send({ type: 'progress', stage: 'Loading saved model', progress: null });
      return await cached.arrayBuffer();
    }
  } catch {
    /* Storage may be unavailable; separation still works. */
  }
  send({
    type: 'progress',
    stage: 'Downloading model · 172 MB, first use only',
    progress: 0,
  });
  // Cache the model bytes ourselves, not Hugging Face's expiring redirect.
  const response = await fetch(new URL('/api/model', self.location.origin), {
    cache: 'no-store',
  });
  if (!response.ok || !response.body)
    throw new Error(
      'Could not download the model. Check your connection and try again.',
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    send({
      type: 'progress',
      stage: `Downloading model · ${Math.round(received / 1048576)} / 172 MB`,
      progress: Math.min(100, (received / MODEL_BYTES) * 100),
    });
  }
  if (received !== MODEL_BYTES)
    throw new Error('The model download was incomplete. Please try again.');
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    await cache?.put(
      MODEL_URL,
      new Response(bytes, {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
  } catch {
    /* Quota failure must not prevent playback. */
  }
  return bytes.buffer;
}

self.onmessage = async (
  event: MessageEvent<{ left: Float32Array; right: Float32Array }>,
) => {
  let session: ort.InferenceSession | undefined;
  let gpuFailure = '';
  let phase = 'model download';
  try {
    // A single WASM thread works without cross-origin isolation, including private Sites.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/';
    const bytes = await modelBytes();
    phase = 'audio engine setup';
    send({
      type: 'progress',
      stage: 'Preparing separation · this can take a moment',
      progress: null,
    });
    let backend = 'CPU';
    try {
      const gpu = (
        self.navigator as WorkerNavigator & {
          gpu?: { requestAdapter(): Promise<unknown> };
        }
      ).gpu;
      if (gpu && (await gpu.requestAdapter())) {
        session = await ort.InferenceSession.create(bytes, {
          executionProviders: ['webgpu', 'wasm'],
          graphOptimizationLevel: 'basic',
        });
        backend = 'GPU';
      }
    } catch (error) {
      gpuFailure = error instanceof Error ? error.message : String(error);
    }
    if (!session)
      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'basic',
      });
    send({
      type: 'progress',
      stage: 'Decoding stems',
      progress: 0,
    });
    const report = ({
      completed,
      total,
      progress,
    }: {
      completed: number;
      total: number;
      progress: number;
    }) => {
      send({
        type: 'progress',
        stage: `Decoding stems · step ${completed} of ${total}`,
        progress: progress * 100,
      });
    };
    phase = 'stem separation';
    let result: StemAudio;
    try {
      result = (await separateAudio(
        ort,
        session,
        event.data.left,
        event.data.right,
        report,
      )) as StemAudio;
    } catch (error) {
      if (backend !== 'GPU') throw error;
      await session.release();
      backend = 'CPU';
      send({
        type: 'progress',
        stage: 'Switching to CPU separation · GPU unavailable',
        progress: null,
      });
      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'basic',
      });
      result = (await separateAudio(
        ort,
        session,
        event.data.left,
        event.data.right,
        report,
      )) as StemAudio;
    }
    const transfers = Object.values(result).flatMap((stem) => [
      stem.left.buffer,
      stem.right.buffer,
    ]) as ArrayBuffer[];
    self.postMessage({ type: 'complete', stems: result }, transfers);
  } catch (error) {
    console.error('Stem separation failed', error);
    send({
      type: 'error',
      detail: [
        phase,
        gpuFailure,
        error instanceof Error ? error.message : String(error),
      ]
        .filter(Boolean)
        .join(' | '),
      message:
        error instanceof Error &&
        /download|connection|invalid|incomplete/.test(error.message)
          ? error.message
          : 'Separation could not finish on this device. Try a shorter song in desktop Chrome or Edge, then retry.',
    });
  } finally {
    await session?.release();
  }
};
