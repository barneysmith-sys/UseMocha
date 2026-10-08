"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { tracks } from "@/lib/careers";
import { useInterviewDraft } from "@/components/search/InterviewDraft";
import { ProductPreview } from "./ProductPreview";

const MountainScene = dynamic(
  () => import("@/components/mountain/MountainScene").then((mod) => mod.MountainScene),
  { ssr: false },
);

const stages = [
  {
    index: "01",
    title: "Practice.",
    body: "Experience realistic interviews with adaptive follow-up questions.",
  },
  {
    index: "02",
    title: "Understand.",
    body: "Receive structured feedback against role-specific evaluation criteria.",
  },
  {
    index: "03",
    title: "Improve.",
    body: "Track your performance and identify where to focus next.",
  },
];

export function LandingPageSections() {
  return (
    <>
      <HowItWorks />
      <ProductPreview />
      <CareerPathways />
      <ClosingSection />
    </>
  );
}

function HowItWorks() {
  return (
    <section id="how" data-surface="paper" className="bg-paper text-ink">
      <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 sm:py-32">
        <p className="text-[12px] uppercase tracking-[0.18em] text-cobalt">How Mocha works</p>
        <h2 className="mt-3 max-w-[16ch] text-[clamp(32px,4vw,52px)] font-medium leading-[1.02] tracking-[-0.04em]">
          One round. Three things it has to do.
        </h2>
        <ol className="mt-14 border-t border-line">
          {stages.map((stage) => (
            <li key={stage.index} className="grid gap-3 border-b border-line py-7 sm:grid-cols-[88px_220px_1fr] sm:items-baseline sm:gap-8">
              <span className="text-[13px] tabular-nums tracking-[0.16em] text-cobalt">{stage.index}</span>
              <h3 className="text-[clamp(26px,3vw,36px)] font-medium tracking-[-0.035em]">{stage.title}</h3>
              <p className="max-w-[42ch] text-[16.5px] leading-relaxed text-muted">{stage.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CareerPathways() {
  const draft = useInterviewDraft();
  const [openId, setOpenId] = useState<string | null>("consulting");
  const reduced = useReducedMotion();

  return (
    <section id="pathways" data-surface="paper" className="border-t border-line bg-paper text-ink">
      <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid items-end gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] text-cobalt">Career pathways</p>
            <h2 className="mt-3 max-w-[16ch] text-[clamp(32px,4vw,52px)] font-medium leading-[1.02] tracking-[-0.04em]">
              The same standard. A different interview.
            </h2>
          </div>
          <p className="max-w-[40ch] text-[16px] leading-relaxed text-muted">
            Every track uses the hero selector. The rubric stays Structure, Clarity, Ownership, and Impact. What changes is the question, and the follow-up it deserves.
          </p>
        </div>

        <div className="mt-12 border-t border-line">
          {tracks.map((track) => {
            const open = openId === track.id;
            const Icon = track.icon;
            return (
              <div key={track.id} className="border-b border-line">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : track.id)}
                  className="flex w-full items-center gap-4 py-5 text-left"
                >
                  <Icon aria-hidden="true" strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0 text-cobalt" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[18px] font-medium tracking-[-0.02em]">{track.name}</span>
                    <span className="mt-0.5 block text-[13.5px] text-muted">{track.detail}</span>
                  </span>
                  <span className="text-[12px] uppercase tracking-[0.14em] text-muted">{open ? "Close" : "Open"}</span>
                </button>
                {open ? (
                  <div className="pb-6 sm:pl-[34px]">
                    <ul className="divide-y divide-line border-t border-line">
                      {track.options.map((option) => (
                        <li key={option.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                          <span>
                            <span className="block text-[15px]">{option.name}</span>
                            <span className="text-[12px] uppercase tracking-[0.14em] text-cobalt">{option.type}</span>
                          </span>
                          <span className="text-[13px] text-muted">{option.duration}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => draft.selectTrack(track.id, reduced ? "auto" : "smooth")}
                      className="mt-4 bg-ink px-4 py-3 text-[14px] font-medium text-white hover:bg-cobalt"
                    >
                      Practice this track
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ClosingSection() {
  const reduced = useReducedMotion();
  const draft = useInterviewDraft();

  return (
    <section id="close" data-surface="cobalt" className="relative min-h-[78svh] bg-cobalt text-white">
      <div className="pointer-events-none absolute inset-0">
        <MountainScene variant="quiet" className="h-full w-full" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-[78svh] max-w-[1200px] flex-col justify-between px-5 pb-8 pt-28 sm:px-8">
        <div>
          <h2 className="max-w-[12ch] text-[clamp(40px,6vw,76px)] font-medium leading-[0.96] tracking-[-0.045em]">
            Every interview is progress.
          </h2>
          <button
            type="button"
            onClick={() => {
              document.getElementById("top")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
              window.setTimeout(() => {
                draft.open();
                document.querySelector<HTMLInputElement>("#practice input")?.focus();
              }, reduced ? 0 : 450);
            }}
            className="mt-8 bg-white px-4 py-3 text-[14.5px] font-medium text-cobalt hover:bg-ice"
          >
            Start practicing
          </button>
        </div>
        <footer className="mt-20 flex flex-wrap items-end justify-between gap-4 border-t border-white/20 pt-5 text-[13px] text-white/75">
          <span className="wordmark text-[14px] text-white">mocha</span>
          <span>Design prototype</span>
          <a href="https://usemocha.app" className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
            usemocha.app
          </a>
        </footer>
      </div>
    </section>
  );
}
