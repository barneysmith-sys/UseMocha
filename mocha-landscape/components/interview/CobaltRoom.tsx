"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { X } from "lucide-react";

const MountainScene = dynamic(
  () => import("@/components/mountain/MountainScene").then((mod) => mod.MountainScene),
  { ssr: false },
);

type Props = {
  kicker: string;
  stageLabel: string;
  filled: number;
  elapsed: string;
  total: string;
  onExit: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function CobaltRoom({ kicker, stageLabel, filled, elapsed, total, onExit, children, footer }: Props) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-cobalt text-white">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46vh] opacity-90 [mask-image:linear-gradient(to_bottom,transparent,black_72%)]">
        <MountainScene variant="quiet" className="h-full w-full" />
      </div>
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-[18px] sm:px-7">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[15px] tracking-[0.32em]">mocha</span>
          <i className="hidden h-4 w-px bg-white/30 sm:block" />
          <span className="text-[13px] text-white/90">{kicker}</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="grid w-[240px] grid-cols-5 gap-1" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <i key={index} className={`h-0.5 ${index < filled ? "bg-white" : "bg-white/30"}`} />
            ))}
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/85">{stageLabel}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[13px]">
            {elapsed} <span className="text-white/70">/ {total}</span>
          </span>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/30 px-3.5 text-[13px] font-medium text-white hover:bg-white/10"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.5} />
            Exit
          </button>
        </div>
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-[22vh] text-center">{children}</main>
      {footer ? <footer className="relative z-10 flex justify-center px-6 pb-8 pt-5">{footer}</footer> : null}
    </div>
  );
}
