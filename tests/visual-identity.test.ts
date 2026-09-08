import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fingerprintAudio,
  createVisualIdentity,
} from '../lib/visual-identity.ts';

const tone = (frequency: number) =>
  Float32Array.from(
    { length: 44100 },
    (_, i) => Math.sin((i * frequency * 2 * Math.PI) / 44100) * 0.2,
  );

test('audio identity is repeatable, varies across songs and gives four distinct forms', () => {
  const low = tone(110),
    high = tone(3100);
  const first = fingerprintAudio(low, low),
    second = fingerprintAudio(high, high);
  assert.equal(first, fingerprintAudio(low.slice(), low.slice()));
  assert.notEqual(first, second);
  const identities = [0, 1, 2, 3].map((i) =>
    createVisualIdentity(first, i, low, low),
  );
  assert.equal(new Set(identities.map((i) => i.form)).size, 4);
  assert.deepEqual(
    identities[0],
    createVisualIdentity(first, 0, low.slice(), low.slice()),
  );
  assert.notDeepEqual(
    identities[0].seed,
    createVisualIdentity(second, 0, low, low).seed,
  );
});

test('stem texture and stereo width shape the identity without changing its seed', () => {
  const low = tone(110),
    high = tone(3100);
  const bass = createVisualIdentity(123, 0, low, low);
  const bright = createVisualIdentity(
    123,
    0,
    high,
    high.map((v) => -v),
  );
  assert.deepEqual(bass.seed, bright.seed);
  assert.ok(bright.character[0] > bass.character[0]);
  assert.ok(bright.character[2] > bass.character[2]);
  const silence = createVisualIdentity(
    0,
    0,
    new Float32Array(32),
    new Float32Array(32),
  );
  assert.deepEqual(silence.character, [0, 0, 0]);
});
