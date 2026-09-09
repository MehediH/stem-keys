'use client';
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- The drop region has an equivalent keyboard-accessible Upload button. */
import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  X,
  LoaderCircle,
  AlertCircle,
  Link,
  ArrowRight,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { useStemPlayer } from '@/hooks/use-stem-player';
import { STEMS, audible } from '@/lib/audio';
import { registerPlayerTools } from '@/lib/webmcp';
import { Halftone } from '@/components/halftone';

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [link, setLink] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const player = useStemPlayer();
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });
  useEffect(() => registerPlayerTools(() => playerRef.current), []);
  const ready = player.status === 'ready',
    busy = player.status === 'processing';
  const needsUpload = !ready && !busy;
  const showSource = !busy && (needsUpload || sourceOpen);
  const loading = busy
    ? {
        progress: player.progress,
        phase: /Decoding stems|Separating|CPU separation/.test(player.stage)
          ? 2
          : /model|Preparing separation/.test(player.stage)
            ? 1
            : 0,
      }
    : undefined;
  return (
    <main className="blue-room">
      <h1 className="sr-only">Stem Keys</h1>
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
      <section
        className={`instrument ${dragging ? 'dragging' : ''}`}
        aria-label="Stem mixer"
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (!busy && file) void player.loadFile(file);
        }}
      >
        <div
          className={`visual-stage ${showSource ? 'awaiting-upload' : ''} ${busy ? 'is-processing' : ''}`}
        >
          <div className="stem-grid">
            {STEMS.map((stem, i) => {
              const on = audible(player.mix, i);
              return (
                <article
                  key={stem.id}
                  className={`stem ${ready && !on ? 'muted' : ''} ${ready && on ? 'audible' : ''} ${player.mix.group?.includes(i) ? 'selected' : ''}`}
                >
                  <button
                    className="stem-face"
                    disabled={!ready}
                    aria-label={`${on ? 'Mute' : 'Unmute'} ${stem.label}`}
                    aria-pressed={ready && on}
                    aria-keyshortcuts={String(i + 1)}
                    title={`${i + 1} · ${stem.label} · Shift + click to play together`}
                    onClick={(e) =>
                      e.shiftKey ? player.selectStem(i) : player.toggleStem(i)
                    }
                  >
                    <Halftone
                      index={i}
                      engine={player.engine}
                      loading={loading}
                    />
                    <span className="stem-hint" aria-hidden="true">
                      {i + 1} · {stem.label}
                    </span>
                  </button>
                  <div className="stem-controls">
                    <Slider
                      disabled={!ready}
                      min={0}
                      max={100}
                      step={1}
                      value={[player.mix.volumes[i]]}
                      onValueChange={(v) =>
                        player.volume(i, Array.isArray(v) ? v[0] : v)
                      }
                      aria-label={`${stem.label} volume`}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          {showSource && (
            <div className="upload-prompt">
              <button
                className="upload-song"
                data-native-space
                onClick={() => {
                  setSourceOpen(false);
                  input.current?.click();
                }}
              >
                <Upload size={22} strokeWidth={1.5} aria-hidden="true" />
                Upload a song
              </button>
              <p>{dragging ? 'Drop it here' : 'or drop an audio file here'}</p>
              <form
                className="youtube-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSourceOpen(false);
                  void player.loadYoutube(link);
                }}
              >
                <input
                  type="url"
                  required
                  maxLength={2048}
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="Paste a YouTube Music link"
                  aria-label="YouTube Music or YouTube song link"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="submit"
                  data-native-space
                  aria-label="Import YouTube song"
                  title="Import song"
                  disabled={!link.trim()}
                >
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              </form>
              {ready && (
                <button
                  className="icon-button dismiss-source"
                  data-native-space
                  aria-label="Close song import"
                  onClick={() => setSourceOpen(false)}
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}
          {busy && (
            <div className="upload-prompt">
              <output className="processing-status" aria-live="polite">
                <span>{player.stage}</span>
                {player.progress !== null && (
                  <strong>{Math.floor(player.progress)}%</strong>
                )}
              </output>
            </div>
          )}
        </div>
        <div className="transport">
          <button
            className="icon-button"
            data-native-space
            disabled={busy}
            aria-label="Upload audio"
            title="Upload audio · or drop an MP3 anywhere on the player"
            onClick={() => input.current?.click()}
          >
            <Upload size={20} strokeWidth={1.5} />
          </button>
          <button
            className="icon-button"
            data-native-space
            disabled={busy}
            aria-label="Import a YouTube link"
            title="Import a YouTube link"
            aria-expanded={showSource}
            onClick={() => setSourceOpen(!sourceOpen)}
          >
            <Link size={19} strokeWidth={1.5} />
          </button>
          <button
            className="icon-button"
            disabled={!ready}
            aria-label="Restart song"
            title="Restart · R"
            onClick={() => void player.seek(0)}
          >
            <SkipBack size={19} strokeWidth={1.5} />
          </button>
          {busy ? (
            <button
              className="play-button loading"
              onClick={player.cancel}
              aria-label="Cancel separation"
              title={player.stage}
            >
              <LoaderCircle className="spinner" size={25} strokeWidth={1.4} />
              <X className="cancel-icon" size={19} />
            </button>
          ) : (
            <button
              className="play-button"
              disabled={!ready}
              onClick={() => void player.togglePlayback()}
              aria-label={player.playing ? 'Pause' : 'Play'}
              aria-keyshortcuts="Space"
              title="Play / pause · Space"
            >
              {player.playing ? (
                <Pause size={23} fill="currentColor" strokeWidth={0} />
              ) : (
                <Play size={23} fill="currentColor" strokeWidth={0} />
              )}
            </button>
          )}
          <div className="timeline">
            {busy ? (
              <Progress value={player.progress} aria-label={player.stage} />
            ) : (
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
            )}
          </div>
          <button
            className="icon-button"
            disabled={!ready}
            aria-label="Reset mix"
            title="Reset mix · 0"
            onClick={player.resetMix}
          >
            <RotateCcw size={18} strokeWidth={1.5} />
          </button>
        </div>
        <span className="sr-only" aria-live="polite">
          {busy
            ? player.stage
            : ready
              ? `${player.name}. Ready.`
              : 'Upload an MP3 to begin. Keys 1 through 4 toggle stems, Shift plus multiple numbers selects and plays those stems together, and Space plays or pauses.'}
        </span>
        {player.error && (
          <div className="error-state">
            <details open>
              <summary aria-label="Show error" title={player.error}>
                <AlertCircle size={19} />
              </summary>
              <p role="alert">{player.error}</p>
            </details>
            {player.status === 'error' && (
              <button
                className="icon-button"
                aria-label="Try again"
                title="Try again"
                onClick={player.retry}
              >
                <RotateCcw size={18} />
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
