'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StemPlayer } from '@/lib/audio';
import { createHalftone, type LoadingVisual } from '@/lib/halftone';

export function Halftone({
  index,
  engine,
  loading,
}: {
  loading?: LoadingVisual;
  index: number;
  engine: RefObject<StemPlayer | null>;
}) {
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const renderer = createHalftone(element, index);
    if (!renderer) {
      queueMicrotask(() => setFallback(true));
      return;
    }
    let frame = 0,
      last = 0,
      loadingTime = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (
        document.hidden ||
        now - last < (reduced.matches ? 160 : loadingRef.current ? 50 : 33)
      )
        return;
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (loadingRef.current && !reduced.matches) loadingTime += elapsed;
      else loadingTime = 0;
      const player = engine.current;
      renderer.draw(
        reduced.matches || loadingRef.current
          ? null
          : (player?.readVisual(index) ?? null),
        reduced.matches ? 0 : (player?.position ?? 0),
        loadingRef.current ? undefined : player?.identities[index],
        loadingRef.current,
        loadingTime,
      );
    };
    frame = requestAnimationFrame(draw);
    const lost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      setFallback(true);
    };
    element.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('webglcontextlost', lost);
      renderer.dispose();
    };
  }, [engine, index]);
  return fallback ? (
    <span
      className={`halftone-fallback ${loading ? 'loading-fallback' : ''}`}
      aria-hidden="true"
    />
  ) : (
    <canvas className="halftone" ref={canvas} aria-hidden="true" />
  );
}
