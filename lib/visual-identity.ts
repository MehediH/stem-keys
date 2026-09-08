export type VisualIdentity = {
  form: number;
  seed: [number, number, number, number];
  character: [number, number, number];
};

// Fingerprint decoded audio, so filenames and playback controls do not affect the art.
export function fingerprintAudio(left: Float32Array, right: Float32Array) {
  let hash = left.length >>> 0;
  const count = Math.min(left.length, 8192);
  for (let i = 0; i < count; i++) {
    const at = Math.floor((i * left.length) / count);
    for (const sample of [left[at], right[at]]) {
      hash = Math.imul(hash ^ Math.round(sample * 32767), 16777619) >>> 0;
    }
  }
  return hash;
}

function random(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createVisualIdentity(
  song: number,
  index: number,
  left: Float32Array,
  right: Float32Array,
): VisualIdentity {
  const songRandom = random(song);
  const forms = [0, 1, 2, 3];
  for (let i = forms.length - 1; i > 0; i--) {
    const j = Math.floor(songRandom() * (i + 1));
    [forms[i], forms[j]] = [forms[j], forms[i]];
  }
  const stemRandom = random(song ^ Math.imul(index + 1, 2654435761));
  const seed: VisualIdentity['seed'] = [
    stemRandom(),
    stemRandom(),
    stemRandom(),
    stemRandom(),
  ];
  // Short windows across the entire stem capture texture, dynamics and stereo width.
  let energy = 0,
    difference = 0,
    side = 0,
    total = 0;
  const levels: number[] = [];
  const width = Math.min(512, left.length);
  for (let block = 0; block < 48; block++) {
    const start = Math.floor((block / 47) * (left.length - width));
    let blockEnergy = 0;
    for (let i = start; i < start + width; i++) {
      const l = left[i],
        r = right[i];
      blockEnergy += l * l + r * r;
      side += (l - r) ** 2;
      if (i > start)
        difference += (l - left[i - 1]) ** 2 + (r - right[i - 1]) ** 2;
      total++;
    }
    energy += blockEnergy;
    levels.push(Math.sqrt(blockEnergy / Math.max(1, width * 2)));
  }
  const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  const deviation = Math.sqrt(
    levels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / levels.length,
  );
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return {
    form: forms[index],
    seed,
    character:
      energy > 1e-10 && total > 0
        ? [
            clamp(Math.sqrt(difference / energy) * 2),
            clamp(deviation / Math.max(mean, 1e-8)),
            clamp(Math.sqrt(side / energy)),
          ]
        : [0, 0, 0],
  };
}
