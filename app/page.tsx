'use client';
import { useRef, useState } from 'react';
import { AudioLines, Upload, Play, Keyboard, ArrowUpRight } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
const stems = ['Vocals', 'Drums', 'Bass', 'Other'];
export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  return <main className="studio">
    <header className="topbar"><a href="/" className="wordmark"><AudioLines size={26} /> stem<span>keys</span></a><span className="local-note"><i /> Audio stays on your device</span></header>
    <section className="session-heading"><div><p className="eyebrow">YOUR OWN FOUR-TRACK MIXER</p><h1>Pull a song apart.<br /><span>Play it your way.</span></h1></div><div className="session-number">01 <span>/ SESSION</span></div></section>
    <input ref={input} type="file" accept="audio/*,.mp3" className="sr-only" onChange={e => setName(e.target.files?.[0]?.name || '')} />
    <button className="upload-zone" onClick={() => input.current?.click()}><span className="upload-icon"><Upload size={22} /></span><span><strong>{name || 'Drop an MP3 here'}</strong><span className="upload-detail">{name ? 'Preparing stem separation…' : 'or click to choose a song · up to 10 minutes'}</span></span><ArrowUpRight className="upload-arrow" size={22} /></button>
    <section className="console" aria-label="Stem mixer"><div className="transport"><button className="play-button" disabled aria-label="Play"><Play size={23} fill="currentColor" /></button><div className="track-info"><strong>{name || 'No track loaded'}</strong><span>Upload a song to start mixing</span></div><span className="time">0:00 <span>/ 0:00</span></span></div><div className="timeline"><span /></div>
      <div className="stem-grid">{stems.map((stem, i) => <article key={stem} className={`stem-channel channel-${i}`}><button className="stem-pad" disabled aria-label={`Toggle ${stem}`}><span className="pad-top"><kbd>{i + 1}</kbd><span className="pad-state">WAITING</span></span><div className="stem-symbol"><AudioLines size={58} strokeWidth={1.3} /></div><span className="pad-bottom"><strong>{stem}</strong><span>0{i + 1}</span></span></button><div className="channel-controls"><Slider disabled value={[100]} aria-label={`${stem} volume`} /><span>100%</span></div><button className="solo-button" disabled>Solo <kbd>⇧ {i + 1}</kbd></button></article>)}</div>
      <footer className="console-footer"><span><Keyboard size={17} /> Keys are your controls</span><span><kbd>Space</kbd> play / pause <kbd>1–4</kbd> toggle stems</span></footer>
    </section><p className="footnote">First use downloads the separation model. Processing can take a few minutes.</p>
  </main>;
}
