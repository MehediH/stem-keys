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
  solo: null as number | null,
});
export type Mix = ReturnType<typeof initialMix>;
export function audible(mix: Mix, i: number) {
  return mix.solo === null ? mix.enabled[i] : mix.solo === i;
}
export function timeLabel(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function waveform(samples: Float32Array) {
  const peaks = Array.from({ length: 100 }, (_, bin) => {
    let peak = 0;
    const start = Math.floor((bin * samples.length) / 100),
      end = Math.floor(((bin + 1) * samples.length) / 100);
    for (let i = start; i < end; i++)
      peak = Math.max(peak, Math.abs(samples[i]));
    return peak;
  });
  const max = Math.max(0.001, ...peaks);
  return peaks
    .map(
      (p, i) =>
        `M${i * 2 + 1},${40 - (p / max) * 36}v${Math.max(1, (p / max) * 72)}`,
    )
    .join(' ');
}

export class StemPlayer {
  context: AudioContext;
  private buffers: AudioBuffer[];
  private gains: GainNode[];
  private sources: AudioBufferSourceNode[] = [];
  private offset = 0;
  private startedAt = 0;
  private revision = 0;
  playing = false;
  duration: number;
  constructor(context: AudioContext, stems: StemAudio) {
    this.context = context;
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
    this.gains = this.buffers.map(() => {
      const gain = context.createGain();
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
      source.connect(this.gains[i]);
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
  dispose() {
    this.pause();
    for (const gain of this.gains) gain.disconnect();
    this.buffers = [];
    void this.context.close();
  }
}
