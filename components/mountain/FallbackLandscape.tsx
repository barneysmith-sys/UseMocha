"use client";

import { useEffect, useRef } from "react";
import type { TerrainField } from "@/lib/terrain";

type Props = {
  field: TerrainField | null;
  quiet?: boolean;
  reduced: boolean;
};

/**
 * Static stipple used when WebGL is unavailable, or when ?landscape=static is set.
 * It draws the same particle field. It does not pretend to be the 3D scene.
 */
export function FallbackLandscape({ field, quiet = false, reduced }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !field) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let running = true;

    const draw = (time: number) => {
      if (!running) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      const ctx = context;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const aspect = field.sourceWidth / field.sourceHeight;
      const boost = width < 760 ? 1.28 : 1.02;
      const planeW = width * boost;
      const planeH = planeW / aspect;
      const left = (width - planeW) / 2;
      const top = height - planeH - height * 0.012;
      const drift = reduced ? 0 : Math.sin(time * 0.0004) * 3;

      const stride = width < 760 ? 2 : 1;
      for (let i = 0; i < field.count; i += stride) {
        const u = field.position[i * 3];
        const v = field.position[i * 3 + 1];
        const ridge = field.ridge[i];
        const alpha = field.alpha[i] * (quiet ? 0.9 : 1);
        const square = field.square[i] > 0.5;
        const px = left + u * planeW + drift * ridge;
        const py = top + v * planeH;
        const s = Math.max(1, field.size[i] * (width / field.sourceWidth));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffffff";
        if (square) {
          ctx.fillRect(px - s / 2, py - s / 2, s, s);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, s * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (!reduced && !quiet) {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 28; i++) {
          const sx = ((i * 97) % width) + Math.sin(time * 0.0002 + i) * 8;
          const sy = ((time * 0.012 * (0.4 + (i % 5) * 0.1) + i * 40) % (height + 20)) - 10;
          ctx.fillRect(sx, sy, 1.4, 1.4);
        }
      }
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };
  }, [field, quiet, reduced]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      aria-hidden="true"
    />
  );
}
