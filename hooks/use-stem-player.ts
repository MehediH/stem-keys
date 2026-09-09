'use client';
import { useEffect, useRef, useState } from 'react';
// oxlint-disable-next-line import/default -- Vite's ?worker transform exports this constructor.
import SeparationWorker from '../workers/separate.worker.ts?worker';
import { fingerprintAudio } from '@/lib/visual-identity';
import {
  toggleChannel,
  toggleGroup,
  initialMix,
  StemPlayer,
  type Mix,
  type StemAudio,
} from '@/lib/audio';

export function useStemPlayer() {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'processing' | 'ready' | 'error'
  >('idle');
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mix, setMixState] = useState(initialMix);
  const mixRef = useRef(mix);
  const engine = useRef<StemPlayer | null>(null);
  const worker = useRef<Worker | null>(null);
  const decodingContext = useRef<AudioContext | null>(null);
  const job = useRef(0);
  const lastFile = useRef<File | null>(null);
  const transportBusy = useRef(false);

  function setMix(next: Mix) {
    mixRef.current = next;
    engine.current?.setMix(next);
    setMixState(next);
  }
  function toggleStem(i: number) {
    if (engine.current) setMix(toggleChannel(mixRef.current, i));
  }
  function selectStem(i: number) {
    if (!engine.current) return;
    setMix(toggleGroup(mixRef.current, i));
    // Several Shift+number events can arrive while AudioContext.resume is pending.
    // Update the selection synchronously, and start the shared clock only once.
    if (!engine.current.playing && !transportBusy.current)
      void togglePlayback();
  }
  function volume(i: number, value: number) {
    if (engine.current)
      setMix({
        ...mixRef.current,
        volumes: mixRef.current.volumes.map((v, index) =>
          index === i ? Math.max(0, Math.min(100, value)) : v,
        ),
      });
  }
  function resetMix() {
    if (engine.current) setMix(initialMix());
  }
  async function togglePlayback() {
    const player = engine.current;
    if (!player || transportBusy.current) return;
    transportBusy.current = true;
    try {
      if (player.playing) player.pause();
      else await player.play();
      setPlaying(player.playing);
    } catch {
      setError('Audio could not start. Press play again.');
    } finally {
      transportBusy.current = false;
    }
  }
  async function seek(seconds: number) {
    if (!engine.current) return;
    try {
      await engine.current.seek(seconds);
      setPosition(engine.current.position);
    } catch {
      setError('Audio could not resume. Press play again.');
    }
  }
  function stopWork() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    if (decodingContext.current)
      void decodingContext.current.close().catch(() => {});
    decodingContext.current = null;
  }
  function cancel() {
    stopWork();
    setStatus('idle');
    setName('');
    setStage('');
    setError('');
    lastFile.current = null;
  }

  async function loadFile(file: File) {
    if (!file.size) {
      setError('That file is empty. Choose an MP3 with audio.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('Choose an audio file smaller than 100 MB.');
      return;
    }
    if (
      !file.type.startsWith('audio/') &&
      !/\.(mp3|wav|m4a|aac|ogg|flac|aiff|webm)$/i.test(file.name)
    ) {
      setError('Choose an MP3 or another audio file.');
      return;
    }
    stopWork();
    const currentJob = job.current;
    engine.current?.dispose();
    engine.current = null;
    lastFile.current = file;
    setName(file.name);
    setStatus('processing');
    setError('');
    setStage('Reading your audio');
    setProgress(null);
    setPlaying(false);
    setDuration(0);
    setPosition(0);
    setMix(initialMix());
    let phase: 'setup' | 'decode' | 'worker' = 'setup';
    try {
      const context = new AudioContext({ sampleRate: 44100 });
      decodingContext.current = context;
      phase = 'decode';
      const audio = await context.decodeAudioData(await file.arrayBuffer());
      if (job.current !== currentJob) return;
      if (audio.duration > 600)
        throw new Error(
          'Choose a song under 10 minutes for browser separation.',
        );
      if (audio.length < 4410)
        throw new Error('Choose an audio clip at least 0.1 seconds long.');
      const left = audio.getChannelData(0).slice();
      const right = audio
        .getChannelData(Math.min(1, audio.numberOfChannels - 1))
        .slice();
      const songFingerprint = fingerprintAudio(left, right);
      phase = 'worker';
      const task = new SeparationWorker();
      worker.current = task;
      const fail = (message: string) => {
        if (job.current !== currentJob) return;
        task.terminate();
        worker.current = null;
        void context.close().catch(() => {});
        decodingContext.current = null;
        setError(message);
        setStatus('error');
      };
      task.onerror = () =>
        fail(
          'The separation worker could not start. Check your connection and retry in desktop Chrome or Edge.',
        );
      task.onmessage = (
        event: MessageEvent<{
          type: string;
          stage?: string;
          progress?: number | null;
          message?: string;
          detail?: string;
          stems?: StemAudio;
        }>,
      ) => {
        if (job.current !== currentJob) return;
        const result = event.data;
        if (result.type === 'progress') {
          setStage(result.stage || 'Separating');
          setProgress(result.progress ?? null);
        }
        if (result.type === 'error') {
          console.error(
            'Stem separation failed',
            result.detail || result.message,
          );
          fail(result.message || 'Separation failed. Please retry.');
        }
        if (result.type === 'complete' && result.stems) {
          try {
            const player = new StemPlayer(
              context,
              result.stems,
              songFingerprint,
            );
            engine.current = player;
            decodingContext.current = null;
            setDuration(player.duration);
            player.setMix(mixRef.current);
            setStatus('ready');
            setStage('');
            setProgress(null);
            // Releasing the worker frees model and inference memory after every song.
            task.terminate();
            worker.current = null;
          } catch {
            fail(
              'There was not enough memory to load the stems. Try a shorter song.',
            );
          }
        }
      };
      task.postMessage({ left, right }, [left.buffer, right.buffer]);
    } catch (cause) {
      if (job.current !== currentJob) return;
      console.error(`Stem player ${phase} failed`, cause);
      stopWork();
      setStatus('error');
      setError(
        cause instanceof Error && cause.message.startsWith('Choose')
          ? cause.message
          : phase === 'worker'
            ? 'Your audio loaded, but the separation worker could not start. Please reload the page and try again.'
            : phase === 'setup'
              ? 'Audio could not start in this browser. Please reload the page and try again.'
              : 'This file could not be read as audio. Try another MP3.',
      );
    }
  }
  const actions = useRef({
    togglePlayback,
    toggleStem,
    selectStem,
    resetMix,
    seek,
  });
  useEffect(() => {
    actions.current = {
      togglePlayback,
      toggleStem,
      selectStem,
      resetMix,
      seek,
    };
  });
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[role="slider"]',
        )
      )
        return;
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (index >= 0) {
        e.preventDefault();
        if (e.shiftKey) actions.current.selectStem(index);
        else actions.current.toggleStem(index);
      } else if (
        e.code === 'Space' &&
        engine.current &&
        !target?.closest('[data-native-space],a')
      ) {
        e.preventDefault();
        void actions.current.togglePlayback();
      } else if (e.code === 'Digit0') {
        e.preventDefault();
        actions.current.resetMix();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        void actions.current.seek(0);
      }
    };
    window.addEventListener('keydown', keyboard);
    const timer = window.setInterval(() => {
      const player = engine.current;
      if (!player) return;
      if (player.playing && player.position >= player.duration) player.pause();
      setPosition(player.position);
      setPlaying(player.playing);
    }, 80);
    return () => {
      window.removeEventListener('keydown', keyboard);
      clearInterval(timer);
      stopWork();
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  return {
    name,
    status,
    stage,
    progress,
    error,
    duration,
    position,
    playing,
    engine,
    mix,
    loadFile,
    cancel,
    retry: () => {
      if (lastFile.current) void loadFile(lastFile.current);
    },
    toggleStem,
    selectStem,
    volume,
    resetMix,
    togglePlayback,
    seek,
  };
}
