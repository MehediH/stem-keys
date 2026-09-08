'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StemPlayer } from '@/lib/audio';
import { createHalftone } from '@/lib/halftone';

export function Halftone({
  index,
  engine,
}: {
  index: number;
  engine: RefObject<StemPlayer | null>;
}) {
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
      last = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || now - last < (reduced.matches ? 160 : 33)) return;
      last = now;
      const player = engine.current;
      renderer.draw(
        reduced.matches ? null : (player?.readVisual(index) ?? null),
        reduced.matches ? 0 : (player?.position ?? 0),
        player?.identities[index],
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
    <span className="halftone-fallback" aria-hidden="true" />
  ) : (
    <canvas className="halftone" ref={canvas} aria-hidden="true" />
  );
}
