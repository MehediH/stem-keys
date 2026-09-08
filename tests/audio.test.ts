import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  StemPlayer,
  initialMix,
  STEMS,
  toggleGroup,
  toggleChannel,
  audible,
} from '../lib/audio.ts';

function fixture(resume = async () => {}) {
  const starts: { at: number; offset: number }[] = [],
    levels: number[] = [];
  const analyserFrames: { frequency: number; amplitude: number }[] = [];
  const context = {
    currentTime: 12,
    sampleRate: 44100,
    createAnalyser: () => {
      const frame = {
        frequency: (analyserFrames.length + 1) * 40,
        amplitude: (analyserFrames.length + 1) * 0.02,
      };
      analyserFrames.push(frame);
      return {
        connect() {},
        disconnect() {},
        getByteFrequencyData(a: Uint8Array) {
          a.fill(frame.frequency);
        },
        getFloatTimeDomainData(a: Float32Array) {
          a.fill(frame.amplitude);
        },
      };
    },
    destination: {},
    resume,
    close: async () => {},
    createBuffer: (_channels: number, count: number, rate: number) => ({
      duration: count / rate,
      copyToChannel() {},
    }),
    createDynamicsCompressor: () => ({
      threshold: {},
      knee: {},
      ratio: {},
      attack: {},
      release: {},
      connect() {},
    }),
    createGain: () => {
      const index = levels.length;
      levels.push(1);
      return {
        connect() {},
        disconnect() {},
        gain: {
          setTargetAtTime: (value: number) => {
            levels[index] = value;
          },
        },
      };
    },
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      start: (at: number, offset: number) => starts.push({ at, offset }),
      stop() {},
    }),
  };
  const stems = Object.fromEntries(
    STEMS.map((s) => [
      s.id,
      { left: new Float32Array(441000), right: new Float32Array(441000) },
    ]),
  );
  return {
    context,
    analyserFrames,
    starts,
    levels,
    player: new StemPlayer(context as unknown as AudioContext, stems as never),
  };
}

test('all stems share one audio clock through pause, seek, and resume', async () => {
  const f = fixture();
  await f.player.play();
  assert.equal(f.starts.length, 4);
  assert.ok(f.starts.every((s) => s.at === 12.025 && s.offset === 0));
  f.context.currentTime = 15.025;
  f.player.pause();
  assert.ok(Math.abs(f.player.position - 3) < 1e-6);
  f.context.currentTime = 25;
  assert.ok(Math.abs(f.player.position - 3) < 1e-6);
  await f.player.play();
  await f.player.seek(7);
  assert.equal(f.player.playing, true);
  assert.ok(
    f.starts
      .slice(-4)
      .every((s) => s.offset === 7 && s.at === f.starts.at(-1)!.at),
  );
  await f.player.seek(100);
  assert.equal(f.player.position, 10);
  assert.equal(f.player.playing, false);
  await f.player.play();
  assert.equal(f.player.position, 0);
  f.player.dispose();
});

test('a selected group overrides mutes and preserves per-stem volume', () => {
  const f = fixture();
  const mix = initialMix();
  mix.enabled[0] = false;
  mix.volumes[1] = 35;
  f.player.setMix(mix);
  assert.deepEqual(f.levels, [0, 0.35, 1, 1]);
  f.player.setMix({ ...mix, group: [0] });
  assert.deepEqual(f.levels, [1, 0, 0, 0]);
  f.player.setMix(mix);
  assert.deepEqual(f.levels, [0, 0.35, 1, 1]);
  f.player.dispose();
});

test('cancelled audio resume cannot start stale sources', async () => {
  let resolve!: () => void;
  const f = fixture(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const pending = f.player.play();
  f.player.pause();
  resolve();
  await pending;
  assert.equal(f.player.playing, false);
  assert.equal(f.starts.length, 0);
  f.player.dispose();
});

test('visuals read separate stem signals and freeze while paused', async () => {
  const f = fixture();
  await f.player.play();
  const first = f.player.readVisual(0),
    second = f.player.readVisual(1);
  assert.equal(first.texture[0], 40);
  assert.equal(second.texture[0], 80);
  assert.ok(second.power > first.power);
  assert.notEqual(first.texture, second.texture);
  f.player.pause();
  f.analyserFrames[0].frequency = 0;
  f.analyserFrames[0].amplitude = 0;
  assert.equal(f.player.readVisual(0).texture[0], 40);
  await f.player.play();
  assert.equal(f.player.readVisual(0).texture[0], 0);
  assert.equal(f.player.readVisual(0).power, 0);
  f.player.dispose();
});

test('Shift 1, 2, 3 builds an additive group and repeat presses remove members', () => {
  let mix = initialMix();
  mix = toggleGroup(mix, 0);
  mix = toggleGroup(mix, 1);
  mix = toggleGroup(mix, 2);
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => audible(mix, i)),
    [true, true, true, false],
  );
  mix = toggleGroup(mix, 1);
  assert.deepEqual(mix.group, [0, 2]);
  mix = toggleChannel(mix, 3);
  assert.equal(mix.group, null);
  assert.deepEqual(mix.enabled, [true, false, true, true]);
});

test('leaving the last selected stem restores the previous mix', () => {
  const original = { ...initialMix(), enabled: [false, true, false, true] };
  const restored = toggleGroup(toggleGroup(original, 0), 0);
  assert.deepEqual(restored, original);
});
