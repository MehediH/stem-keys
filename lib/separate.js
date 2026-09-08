import {
  prepareModelInput,
  standaloneMask,
  standaloneIspec,
} from 'demucs-web/processor';
import { CONSTANTS } from 'demucs-web';
const {
  TRAINING_SAMPLES: size,
  MODEL_SPEC_BINS: bins,
  MODEL_SPEC_FRAMES: frames,
  TRACKS,
} = CONSTANTS;

// Shared by the browser worker and the real-model smoke test.
/** @param {(p: {completed: number, total: number, progress: number}) => void} onProgress */
export async function separateAudio(
  ort,
  session,
  left,
  right,
  onProgress = () => {},
) {
  if (!left.length || left.length !== right.length)
    throw new Error('Invalid stereo audio.');
  const length = left.length;
  const stride = Math.floor(size * 0.75);
  const segments = Math.ceil(length / stride);
  const tracks = TRACKS.map(() => ({
    left: new Float32Array(length),
    right: new Float32Array(length),
  }));
  const weights = new Float32Array(length);
  let mean = 0,
    variance = 0;
  for (let i = 0; i < length; i++) mean += (left[i] + right[i]) / 2;
  mean /= length;
  for (let i = 0; i < length; i++)
    variance += ((left[i] + right[i]) / 2 - mean) ** 2;
  const std = Math.max(Math.sqrt(variance / Math.max(1, length - 1)), 1e-5);
  for (let start = 0, segment = 0; start < length; start += stride, segment++) {
    const count = Math.min(size, length - start);
    const l = new Float32Array(size),
      r = new Float32Array(size);
    for (let i = 0; i < count; i++) {
      l[i] = (left[start + i] - mean) / std;
      r[i] = (right[start + i] - mean) / std;
    }
    const input = prepareModelInput(l, r);
    const wave = new ort.Tensor('float32', input.waveform, [1, 2, size]);
    const spec = new ort.Tensor('float32', input.magSpec, [1, 4, bins, frames]);
    let result;
    try {
      result = await session.run({
        [session.inputNames[0]]: wave,
        [session.inputNames[1]]: spec,
      });
      const tensors = Object.values(result);
      const time = tensors.find((t) => t.dims.length === 4 && t.dims[2] === 2);
      const frequency = tensors.find(
        (t) => t.dims.length === 5 && t.dims[2] === 4,
      );
      if (!time || !frequency)
        throw new Error('The separation model returned an unexpected output.');
      const spectra = standaloneMask(frequency.data);
      const sampleCount = time.dims[3];
      for (let track = 0; track < 4; track++) {
        const f = standaloneIspec(spectra[track], size);
        for (let i = 0; i < count; i++) {
          // Nonzero endpoints preserve short clips and the first/last samples.
          const weight = Math.min(i + 1, size - i, size / 2) / (size / 2);
          const lv =
            (time.data[track * 2 * sampleCount + i] + f.left[i]) * std +
            mean / 4;
          const rv =
            (time.data[(track * 2 + 1) * sampleCount + i] + f.right[i]) * std +
            mean / 4;
          if (!Number.isFinite(lv) || !Number.isFinite(rv))
            throw new Error(
              'Separation produced invalid audio. Please try again.',
            );
          tracks[track].left[start + i] += lv * weight;
          tracks[track].right[start + i] += rv * weight;
          if (track === 0) weights[start + i] += weight;
        }
      }
    } finally {
      wave.dispose();
      spec.dispose();
      if (result) for (const tensor of Object.values(result)) tensor.dispose();
    }
    onProgress({
      completed: segment + 1,
      total: segments,
      progress: (segment + 1) / segments,
    });
  }
  for (const track of tracks)
    for (let i = 0; i < length; i++) {
      track.left[i] /= weights[i];
      track.right[i] /= weights[i];
    }
  return Object.fromEntries(TRACKS.map((name, i) => [name, tracks[i]]));
}
