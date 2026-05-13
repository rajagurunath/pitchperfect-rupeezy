"use client";

// Aura visualizer — animated ring that pulses with the bot's voice.
//
// Driven by the bot audio MediaStreamTrack from Pipecat. We feed the track
// into a Web Audio AnalyserNode and read the frequency-bin data each frame,
// then draw a wobbly ring on a canvas. No third-party visualizer library —
// same idea as LiveKit's agents-ui-kit "aura", reproduced for Pipecat.

import { useEffect, useRef } from "react";
import { usePipecatClientMediaTrack } from "@pipecat-ai/client-react";

type Props = {
  /** Square render size in CSS pixels. */
  size?: number;
  /** Ring colour. Defaults to the admin accent. */
  color?: string;
  /** Background fill (transparent if omitted). */
  bg?: string;
};

export function AuraVisualizer({
  size = 280,
  color = "#5eead4",
  bg,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const track = usePipecatClientMediaTrack("audio", "bot");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Hi-DPI: render at devicePixelRatio for crisp lines on retina.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array | null = null;
    let rafId = 0;

    // Hook up the bot audio track to an analyser if we have one.
    if (track) {
      // The kit reuses the same track across reconnects; build a fresh
      // AudioContext per mount so it cleans up cleanly on unmount.
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    const cx = size / 2;
    const cy = size / 2;
    const baseRadius = size * 0.28;
    const ringCount = 4;
    let frame = 0;

    function draw() {
      if (!ctx) return;
      frame++;
      ctx.clearRect(0, 0, size, size);
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
      }

      // Pull current frequency intensity (0..1).
      let intensity = 0;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray as unknown as Uint8Array<ArrayBuffer>);
        // Focus on speech band (low-mid).
        const len = Math.min(64, dataArray.length);
        let sum = 0;
        for (let i = 0; i < len; i++) sum += dataArray[i];
        intensity = sum / (len * 255);
      }

      // Draw four concentric wobbly rings, each one larger and more
      // transparent, with a noise-driven radius modulation.
      for (let r = 0; r < ringCount; r++) {
        const layer = r / ringCount;
        const baseR = baseRadius * (1 + layer * 0.55);
        const wobble = 6 + intensity * 70 * (1 - layer * 0.4);
        ctx.beginPath();
        const steps = 96;
        for (let i = 0; i <= steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          const noise =
            Math.sin(angle * 3 + frame * 0.06 + r) * 0.5 +
            Math.cos(angle * 5 - frame * 0.04 + r * 1.7) * 0.5;
          const radius = baseR + noise * wobble;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const alpha = (1 - layer) * (0.25 + intensity * 0.55);
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth = 2 + (1 - layer) * 4;
        ctx.shadowColor = hexToRgba(color, alpha * 0.8);
        ctx.shadowBlur = 14 + intensity * 24;
        ctx.stroke();
      }

      rafId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(rafId);
      audioCtx?.close().catch(() => {});
    };
  }, [track, size, color, bg]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block" }}
    />
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(94, 234, 212, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
