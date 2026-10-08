"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Mic } from "lucide-react";
import { findOption, findTrack } from "@/lib/careers";
import { DIFFICULTY_NOTE, isDifficulty, selectionFromSearch, setupQuery, type Difficulty } from "@/lib/chooser";
import { stageBudgetMs } from "@/lib/interview/time";
import type { StageId } from "@/lib/interview/types";

const MountainScene = dynamic(
  () => import("@/components/mountain/MountainScene").then((mod) => mod.MountainScene),
  { ssr: false },
);

const STAGE_COPY: { id: StageId; label: string }[] = [
  { id: "introduction", label: "Introduction" },
  { id: "experience", label: "Experience exploration" },
  { id: "challenge", label: "Role-specific challenge" },
  { id: "pressure", label: "Pressure testing" },
  { id: "closing", label: "Closing" },
];

export function SetupScreen() {
  const params = useSearchParams();
  const selection = useMemo(() => selectionFromSearch(new URLSearchParams(params.toString())), [params]);
  const track = findTrack(selection?.trackId ?? null);
  const option = findOption(selection?.trackId ?? null, selection?.optionId ?? null);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");

  if (!selection || !track || !option) {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <div className="mx-auto max-w-xl px-6 py-24">
          <h1 className="text-[32px] font-normal tracking-[-0.025em]">Choose an interview first.</h1>
          <a href="/#practice" className="mt-6 inline-flex text-[14px] text-blue">
            Back to tracks
          </a>
        </div>
      </main>
    );
  }

  const difficulty: Difficulty = isDifficulty(selection.difficulty) ? selection.difficulty : "Challenging";
  const back = `/?${setupQuery(selection).toString()}#practice`;
  const enter = `/interview?${setupQuery(selection, { role, company }).toString()}`;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <nav className="flex items-center justify-between gap-4 px-6 py-5 sm:px-8">
        <a href="/" className="wordmark text-[16px] text-ink">
          mocha
        </a>
      </nav>
      <main className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start gap-12 px-6 pb-12 sm:px-8">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-7">
          <a href={back} className="inline-flex items-center gap-1.5 text-[13px] text-quiet no-underline hover:text-ink">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.5} />
            All tracks
          </a>
          <div className="flex flex-col gap-2.5">
            <span className="cap">Interview setup</span>
            <h1 className="text-[36px] font-normal leading-[44px] tracking-[-0.025em]">{selection.format} interview</h1>
            <p className="max-w-[520px] text-[15px] leading-6 text-quiet">
              A realistic {selection.minutes}-minute conversation. Mocha won’t give feedback until the end, just like a real interviewer.
            </p>
          </div>
          <div className="border-t border-line">
            <Row label="Track" back={back}>
              {track.name}
            </Row>
            <Row label="Interview" back={back}>
              {selection.format}
            </Row>
            <Row label="Difficulty" back={back}>
              {difficulty} <span className="text-muted">· {DIFFICULTY_NOTE[difficulty]}</span>
            </Row>
            <Row label="Duration" back={back}>
              {selection.minutes} minutes · 5 stages
            </Row>
            <Row label="Respond by" back={back}>
              {selection.mode}{" "}
              <span className="text-muted">
                · {selection.mode === "Voice" ? "typing available any time" : "voice available any time"}
              </span>
            </Row>
          </div>
          <div className="flex flex-col gap-3.5">
            <span className="cap">Optional context</span>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Target role
                <input
                  className="h-11 rounded-lg border border-line-strong bg-white px-3 text-[14px] font-normal text-ink outline-none placeholder:text-muted focus-visible:border-blue"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Company
                <input
                  className="h-11 rounded-lg border border-line-strong bg-white px-3 text-[14px] font-normal text-ink outline-none placeholder:text-muted focus-visible:border-blue"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Leave blank for a general interview"
                />
              </label>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              Shown on the room header. The interviewer still follows this track, not a private resume.
            </p>
          </div>
        </section>

        <aside className="flex min-h-[560px] w-full max-w-[440px] flex-[1_1_400px] flex-col overflow-hidden rounded-[14px] bg-cobalt text-white">
          <div className="relative h-[260px]">
            <MountainScene variant="hero" className="h-full w-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-cobalt" />
          </div>
          <div className="flex flex-col gap-5 px-7 pb-7">
            <MicCheck />
            <div>
              <span className="block pb-2 font-mono text-[11px] tracking-[0.08em] text-white/85">WHAT TO EXPECT</span>
              {STAGE_COPY.map((stage, index) => (
                <div
                  key={stage.id}
                  className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2.5 border-t border-white/15 py-2.5 text-[14px]"
                >
                  <span className="font-mono text-[12px] text-white/80">{String(index + 1).padStart(2, "0")}</span>
                  <span>{stage.label}</span>
                  <span className="font-mono text-[12px] text-white/85">{minutesLabel(selection.minutes, stage.id)}</span>
                </div>
              ))}
            </div>
            <a
              href={enter}
              className="flex h-[52px] items-center justify-center gap-2 rounded-[10px] bg-white text-[15px] font-medium text-cobalt hover:bg-ice"
            >
              Enter interview room
              <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
            </a>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Row({ label, back, children }: { label: string; back: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 border-b border-line py-4 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:gap-4">
      <span className="cap">{label}</span>
      <span className="text-[15px]">{children}</span>
      <a href={back} className="h-8 rounded-md px-2.5 text-[13px] font-medium leading-8 text-blue hover:bg-blue-soft">
        Change
      </a>
    </div>
  );
}

function minutesLabel(durationMin: number, stage: StageId) {
  const minutes = Math.max(1, Math.round(stageBudgetMs(durationMin, stage) / 60_000));
  return `${minutes} min`;
}

function MicCheck() {
  const [state, setState] = useState<"idle" | "checking" | "ok" | "quiet" | "denied">("idle");

  async function check() {
    setState("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      analyser.getByteTimeDomainData(data);
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
      const peak = data.reduce((max, value) => Math.max(max, Math.abs(value - 128)), 0);
      setState(peak > 4 ? "ok" : "quiet");
    } catch {
      setState("denied");
    }
  }

  const label =
    state === "ok" ? "Sounds good" : state === "quiet" ? "No signal yet" : state === "denied" ? "Microphone blocked" : state === "checking" ? "Listening" : "Check";

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[11px] tracking-[0.08em] text-white/85">MICROPHONE CHECK</span>
      <div className="flex items-center gap-3 rounded-[10px] bg-[#07102B]/30 px-3.5 py-3">
        <Mic aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.5} />
        <span className="flex h-[22px] flex-1 items-end gap-[3px]" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i
              key={index}
              className={`w-[3px] rounded-full bg-white/80 ${state === "checking" || state === "ok" ? "animate-pulse" : ""}`}
              style={{ height: `${6 + ((index * 17) % 14)}px`, animationDelay: `${index * 40}ms` }}
            />
          ))}
        </span>
        <button type="button" onClick={() => void check()} className="text-[13px] text-white">
          {label}
        </button>
      </div>
    </div>
  );
}
