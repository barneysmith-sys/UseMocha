"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { findTrack } from "@/lib/careers";
import { landscape } from "@/lib/landscape";
import { motion as tokens } from "@/lib/tokens";
import { useInterviewDraft } from "@/components/search/InterviewDraft";

const MountainScene = dynamic(
  () => import("@/components/mountain/MountainScene").then((mod) => mod.MountainScene),
  { ssr: false },
);

const DEFAULT_LINE =
  "Practice with adaptive AI interviews, get role-specific feedback, and turn every answer into measurable improvement.";

export function HeroSection() {
  const reduced = useReducedMotion();
  const draft = useInterviewDraft();
  const track = findTrack(draft.trackId);
  const line = track ? track.line : DEFAULT_LINE;
  const last = useRef({ nx: 0, t: 0 });
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    setBooted(true);
  }, []);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => {
      landscape.finePointer = fine.matches;
    };
    apply();
    fine.addEventListener("change", apply);

    const onMove = (event: PointerEvent) => {
      if (!landscape.finePointer) return;
      const height = window.innerHeight;
      if (window.scrollY > height * 0.7 || event.clientY > height) {
        landscape.strengthTarget = 0;
        return;
      }
      const nx = (event.clientX / window.innerWidth) * 2 - 1;
      const ny = -((event.clientY / height) * 2 - 1);
      const now = performance.now();
      const dt = Math.max(16, now - last.current.t);
      landscape.windX = ((nx - last.current.nx) / dt) * 48;
      landscape.windAt = now;
      landscape.nx = nx;
      landscape.ny = ny;
      landscape.inside = true;
      landscape.strengthTarget = 1;
      last.current = { nx, t: now };
    };
    const onLeave = () => {
      landscape.strengthTarget = 0;
      landscape.inside = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      fine.removeEventListener("change", apply);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section id="top" data-surface="cobalt" className="relative min-h-[100svh] bg-cobalt text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[100svh]">
        <MountainScene className="h-full w-full" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1200px] flex-col px-5 pb-28 pt-28 sm:px-8 sm:pt-32">
        <div className="enter max-w-[760px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/75">Adaptive interview practice</p>
          <h1 className="mt-4 max-w-[12em] text-[clamp(44px,6.4vw,80px)] font-normal leading-[0.98] tracking-[-0.035em]">
            The interview that adapts to you.
          </h1>
          {booted ? (
            <AnimatePresence mode="wait">
              <motion.p
                key={line}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduced ? 0 : 0.35, ease: tokens.ease }}
                className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-white/80"
              >
                {line}
              </motion.p>
            </AnimatePresence>
          ) : (
            <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-white/80">{DEFAULT_LINE}</p>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#practice"
              onClick={(event) => {
                event.preventDefault();
                draft.focusSearch();
              }}
              className="rounded-lg bg-white px-4 py-3 text-[14.5px] font-medium text-cobalt hover:bg-ice"
            >
              Start practicing
            </a>
            <a href="#how" className="rounded-lg border border-white/40 px-4 py-3 text-[14.5px] font-medium text-white hover:bg-white/10">
              See how it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
