'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Upload,
  Play,
  Pause,
  Keyboard,
  ArrowUpRight,
  Mic2,
  Drum,
  Guitar,
  Waves,
  RotateCcw,
  X,
  LoaderCircle,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { useStemPlayer } from '@/hooks/use-stem-player';
import { STEMS, audible, timeLabel } from '@/lib/audio';
import { registerPlayerTools } from '@/lib/webmcp';
const icons = [Mic2, Drum, Guitar, Waves];

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const player = useStemPlayer();
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });
  const ready = player.status === 'ready',
    busy = player.status === 'processing';
  useEffect(() => registerPlayerTools(() => playerRef.current), []);
  return (
    <main className="studio">
      <header className="topbar">
        <div className="wordmark" aria-label="Stem Keys">
          <AudioLines size={26} /> stem<span>keys</span>
        </div>
        <span className="local-note">
          <i /> Audio stays on your device
        </span>
      </header>
      <section className="session-heading">
        <div>
          <p className="eyebrow">YOUR OWN FOUR-TRACK MIXER</p>
          <h1>
            Pull a song apart.
            <br />
            <span>Play it your way.</span>
          </h1>
        </div>
        <div className="session-number">
          01 <span>/ SESSION</span>
        </div>
      </section>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose audio file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void player.loadFile(file);
          e.target.value = '';
        }}
      />
      <button
        data-native-space
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (!busy && file) void player.loadFile(file);
        }}
      >
        <span className="upload-icon">
          {busy ? (
            <LoaderCircle className="spin" size={22} />
          ) : (
            <Upload size={22} />
          )}
        </span>
        <span>
          <strong>
            {busy
              ? player.name
              : ready
                ? 'Drop another song to start a new mix'
                : 'Drop an MP3 here'}
          </strong>
          <span className="upload-detail">
            {busy
              ? 'Keep this tab open while your song is separated'
              : 'or click to choose a song · up to 10 minutes / 100 MB'}
          </span>
        </span>
        <ArrowUpRight className="upload-arrow" size={22} />
      </button>
      {busy && (
        <div className="processing" aria-live="polite">
          <div>
            <span>{player.stage}</span>
            <span>
              {player.progress === null
                ? ''
                : `${Math.floor(player.progress)}%`}
              <button
                onClick={player.cancel}
                className="cancel-button"
                aria-label="Cancel separation"
              >
                <X size={16} /> Cancel
              </button>
            </span>
          </div>
          <Progress value={player.progress} aria-label={player.stage} />
        </div>
      )}
      {player.error && (
        <div className="error-box" role="alert">
          <span>{player.error}</span>
          {player.status === 'error' && (
            <button onClick={player.retry}>Try again</button>
          )}
        </div>
      )}
      <section className="console" aria-label="Stem mixer">
        <div className="transport">
          <button
            className="play-button"
            disabled={!ready}
            aria-label={player.playing ? 'Pause' : 'Play'}
            onClick={() => void player.togglePlayback()}
            aria-keyshortcuts="Space"
          >
            {player.playing ? (
              <Pause size={23} fill="currentColor" />
            ) : (
              <Play size={23} fill="currentColor" />
            )}
          </button>
          <div className="track-info">
            <strong>{player.name || 'No track loaded'}</strong>
            <span>
              {ready
                ? player.playing
                  ? 'Playing your mix'
                  : 'Ready when you are · press play'
                : busy
                  ? 'Preparing your four stems'
                  : 'Upload a song to start mixing'}
            </span>
          </div>
          <button
            className="restart-button"
            onClick={() => void player.seek(0)}
            disabled={!ready}
            aria-label="Restart song"
            title="Restart (R)"
          >
            <RotateCcw size={18} />
          </button>
          <span className="time">
            {timeLabel(player.position)}{' '}
            <span>/ {timeLabel(player.duration)}</span>
          </span>
        </div>
        <div className="seek">
          <Slider
            disabled={!ready}
            min={0}
            max={player.duration || 1}
            step={0.1}
            value={[scrub ?? player.position]}
            onValueChange={(v) => setScrub(Array.isArray(v) ? v[0] : v)}
            onValueCommitted={(v) => {
              void player.seek(Array.isArray(v) ? v[0] : v);
              setScrub(null);
            }}
            aria-label="Song position"
          />
        </div>
        <div className="stem-grid">
          {STEMS.map((stem, i) => {
            const Icon = icons[i];
            const on = audible(player.mix, i);
            return (
              <article key={stem.id} className={`stem-channel channel-${i}`}>
                <button
                  className={`stem-pad ${ready && !on ? 'muted' : ''}`}
                  disabled={!ready}
                  aria-label={`${on ? 'Mute' : 'Unmute'} ${stem.label}`}
                  aria-pressed={ready && on}
                  aria-keyshortcuts={String(i + 1)}
                  onClick={() => player.toggleStem(i)}
                >
                  <span className="pad-top">
                    <kbd>{i + 1}</kbd>
                    <span className="pad-state">
                      {!ready
                        ? 'WAITING'
                        : !on
                          ? 'MUTED'
                          : player.mix.volumes[i] === 0
                            ? 'LEVEL 0'
                            : 'ON'}
                    </span>
                  </span>
                  <span className="stem-symbol">
                    {player.paths[i] ? (
                      <svg
                        viewBox="0 0 200 80"
                        aria-hidden="true"
                        className="waveform"
                      >
                        <path
                          d={player.paths[i]}
                          stroke="currentColor"
                          strokeWidth="1.1"
                          fill="none"
                        />
                      </svg>
                    ) : (
                      <Icon size={54} strokeWidth={1.3} />
                    )}
                  </span>
                  <span className="pad-bottom">
                    <strong>{stem.label}</strong>
                    <span>0{i + 1}</span>
                  </span>
                </button>
                <div className="channel-controls">
                  <Slider
                    disabled={!ready}
                    value={[player.mix.volumes[i]]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) =>
                      player.volume(i, Array.isArray(v) ? v[0] : v)
                    }
                    aria-label={`${stem.label} volume`}
                  />
                  <span>{player.mix.volumes[i]}%</span>
                </div>
                <button
                  className="solo-button"
                  disabled={!ready}
                  aria-pressed={player.mix.solo === i}
                  aria-label={`Solo ${stem.label}`}
                  onClick={() => player.soloStem(i)}
                >
                  Solo <kbd>⇧ {i + 1}</kbd>
                </button>
              </article>
            );
          })}
        </div>
        <footer className="console-footer">
          <span>
            <Keyboard size={17} />
            <kbd>Space</kbd> play / pause
          </span>
          <span>
            <kbd>1–4</kbd> mute <kbd>⇧ 1–4</kbd> solo
          </span>
          <button
            disabled={!ready}
            className="reset-button"
            onClick={player.resetMix}
          >
            Reset mix <kbd>0</kbd>
          </button>
        </footer>
      </section>
      <p className="footnote">
        First use downloads a 172 MB model. Separation can take a few minutes.
        <br />
        Works best in desktop Chrome or Edge. Your audio is never uploaded.
      </p>
    </main>
  );
}
