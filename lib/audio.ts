import {
  createVisualIdentity,
  type VisualIdentity,
} from './visual-identity.ts';
export const STEMS = [
  { id: 'vocals', label: 'Vocals' },
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'other', label: 'Other' },
] as const;
export type StemId = (typeof STEMS)[number]['id'];
export type StemAudio = Record<
  StemId,
  { left: Float32Array; right: Float32Array }
>;
export const SAMPLE_RATE = 44100;
export const initialMix = () => ({
  enabled: [true, true, true, true],
  volumes: [100, 100, 100, 100],
  group: null as number[] | null,
});
export type Mix = ReturnType<typeof initialMix>;
export function audible(mix: Mix, i: number) {
  return mix.group === null ? mix.enabled[i] : mix.group.includes(i);
}
export function toggleGroup(mix: Mix, index: number): Mix {
  const selected = mix.group ?? [];
  const group = selected.includes(index)
    ? selected.filter((i) => i !== index)
    : [...selected, index];
  return { ...mix, group: group.length ? group : null };
}
export function toggleChannel(mix: Mix, index: number): Mix {
  return {
    ...mix,
    group: null,
    enabled: mix.enabled.map((_, i) =>
      i === index ? !audible(mix, i) : audible(mix, i),
    ),
  };
}
export type AudioVisual = { texture: Uint8Array<ArrayBuffer>; power: number };

export class StemPlayer {
  context: AudioContext;
  private buffers: AudioBuffer[];
  private gains: GainNode[];
  private analysers: AnalyserNode[];
  private visuals: AudioVisual[];
  readonly identities: VisualIdentity[];
  private frequency = new Uint8Array(1024);
  private wave = new Float32Array(2048);
  private sources: AudioBufferSourceNode[] = [];
  private offset = 0;
  private startedAt = 0;
  private revision = 0;
  playing = false;
  duration: number;
  constructor(context: AudioContext, stems: StemAudio, songFingerprint = 0) {
    this.context = context;
    this.identities = STEMS.map(({ id }, index) =>
      createVisualIdentity(
        songFingerprint,
        index,
        stems[id].left,
        stems[id].right,
      ),
    );
    this.buffers = STEMS.map(({ id }) => {
      const data = stems[id];
      const buffer = context.createBuffer(2, data.left.length, SAMPLE_RATE);
      buffer.copyToChannel(data.left as Float32Array<ArrayBuffer>, 0);
      buffer.copyToChannel(data.right as Float32Array<ArrayBuffer>, 1);
      return buffer;
    });
    this.duration = this.buffers[0].duration;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    limiter.connect(context.destination);
    this.analysers = this.buffers.map(() => {
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -80;
      analyser.maxDecibels = -15;
      return analyser;
    });
    this.visuals = this.buffers.map(() => {
      const texture = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) {
        texture[i * 4 + 1] = 128;
        texture[i * 4 + 3] = 255;
      }
      return { texture, power: 0 };
    });
    this.gains = this.buffers.map((_, i) => {
      const gain = context.createGain();
      // Analyse the raw stem so muting changes brightness, not its motion.
      this.analysers[i].connect(gain);
      gain.connect(limiter);
      return gain;
    });
  }
  get position() {
    return this.playing
      ? Math.min(
          this.duration,
          this.offset + Math.max(0, this.context.currentTime - this.startedAt),
        )
      : this.offset;
  }
  async play() {
    if (this.playing) return;
    const revision = ++this.revision;
    await this.context.resume();
    if (revision !== this.revision) return;
    if (this.offset >= this.duration) this.offset = 0;
    this.startedAt = this.context.currentTime + 0.025;
    this.sources = this.buffers.map((buffer, i) => {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.analysers[i]);
      source.start(this.startedAt, this.offset);
      return source;
    });
    this.playing = true;
  }
  pause() {
    this.revision++;
    this.offset = this.position;
    this.playing = false;
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources = [];
  }
  async seek(position: number) {
    const resume = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(this.duration, position));
    if (resume && this.offset < this.duration) await this.play();
  }
  setMix(mix: Mix) {
    this.gains.forEach((gain, i) =>
      gain.gain.setTargetAtTime(
        audible(mix, i) ? mix.volumes[i] / 100 : 0,
        this.context.currentTime,
        0.012,
      ),
    );
  }
  readVisual(index: number) {
    const visual = this.visuals[index];
    if (!this.playing) return visual;
    const analyser = this.analysers[index];
    analyser.getByteFrequencyData(this.frequency);
    analyser.getFloatTimeDomainData(this.wave);
    let sum = 0;
    for (const value of this.wave) sum += value * value;
    const rms = Math.sqrt(sum / this.wave.length);
    // Lift quiet stems without flattening louder ones or amplifying silence.
    visual.power = 1 - Math.exp(-Math.max(0, rms - 0.0005) * 16);
    const waveGain = Math.min(8, 0.4 / Math.max(0.05, rms));
    for (let i = 0; i < 256; i++) {
      // Logarithmic bins preserve the low-end detail that linear FFT plots lose.
      const hz = 25 * Math.pow(16000 / 25, i / 255);
      const bin = Math.min(
        1023,
        Math.round((hz * 2048) / this.context.sampleRate),
      );
      visual.texture[i * 4] = this.frequency[bin];
      visual.texture[i * 4 + 1] = Math.round(
        (Math.max(-1, Math.min(1, this.wave[i * 8] * waveGain)) + 1) * 127.5,
      );
    }
    return visual;
  }
  dispose() {
    this.pause();
    for (const gain of this.gains) gain.disconnect();
    for (const analyser of this.analysers) analyser.disconnect();
    this.buffers = [];
    void this.context.close();
  }
}
