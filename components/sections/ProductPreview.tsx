"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

const STEPS = ["Question", "Answer", "Marked line", "Follow-up", "Score"] as const;

const SCORES = [
  { label: "Structure", value: 7.6 },
  { label: "Clarity", value: 8.1 },
  { label: "Ownership", value: 5.4 },
  { label: "Impact", value: 6.8 },
];

const PROGRESS = [5.4, 6.0, 5.8, 6.6, 7.2, 6.9];

export function ProductPreview() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (reduced) {
      setStep(4);
      setPlaying(false);
    }
  }, [reduced]);

  useEffect(() => {
    if (!playing || reduced) return;
    if (step >= 4) return;
    const timer = window.setTimeout(() => setStep((value) => Math.min(4, value + 1)), step === 0 ? 700 : 1100);
    return () => window.clearTimeout(timer);
  }, [playing, reduced, step]);

  const showAnswer = step >= 1;
  const showMark = step >= 2;
  const showFollow = step >= 3;
  const showScore = step >= 4;

  return (
    <section id="preview" data-surface="paper" className="border-t border-line bg-paper text-ink">
      <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid items-end gap-8 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] text-cobalt">Illustrative sample</p>
            <h2 className="mt-3 max-w-[14ch] text-[clamp(32px,4vw,52px)] font-medium leading-[1.02] tracking-[-0.04em]">
              A round, marked where it slipped.
            </h2>
          </div>
          <p className="max-w-[36ch] text-[16px] leading-relaxed text-muted">
            Mocha reads the answer you gave, marks the weakest line, and asks the follow-up that line earned. This consulting round is a demonstration, not a live session.
          </p>
        </div>

        <div className="mt-12 border border-ink/15 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
            <p className="text-[12px] uppercase tracking-[0.16em] text-muted">Consulting · McKinsey-style practice</p>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sample round">
              {STEPS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={step === index}
                  onClick={() => {
                    setPlaying(false);
                    setStep(index);
                  }}
                  className={`px-2 py-1 text-[12px] ${step === index ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
            <div className="min-h-[440px] border-b border-line px-4 py-6 sm:px-6 lg:border-b-0 lg:border-r">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Question</p>
              <p className="mt-2 max-w-[38ch] text-[22px] font-medium leading-snug tracking-[-0.03em]">
                Tell me about a time you influenced a stakeholder who had more information than you.
              </p>

              <div className={`mt-6 transition-opacity duration-500 ${showAnswer ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!showAnswer}>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Answer</p>
                <p className="mt-2 max-w-[62ch] text-[15.5px] leading-[1.65] text-ink/85">
                  Last spring I was staffing a pricing study. The director wanted another month of data before we recommended anything. I pulled the three stores that already matched the pilot, walked her through the margin gap, and{" "}
                  <mark className={showMark ? "bg-ice text-ink" : "bg-transparent text-inherit"}>we ended up aligning the team</mark>{" "}
                  on a two-week test. The test beat the control by four points of margin.
                </p>
                {showMark ? (
                  <p className="mt-2 text-[12.5px] uppercase tracking-[0.14em] text-cobalt">Marked line · ownership drops here</p>
                ) : null}
              </div>

              <div className={`mt-6 border-t border-line pt-5 transition-opacity duration-500 ${showFollow ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!showFollow}>
                <p className="text-[11px] uppercase tracking-[0.16em] text-cobalt">Follow-up</p>
                <p className="mt-2 max-w-[34ch] text-[20px] font-medium leading-snug tracking-[-0.03em]">
                  You said the team ended up aligned. Who disagreed, and what did you say to them?
                </p>
                <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-muted">
                  The story changes voice at the decision. Interviewers score ownership on that sentence, not on the margin figure that follows it.
                </p>
              </div>
            </div>

            <div className="px-4 py-6 sm:px-6" aria-live="polite">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Rubric · out of 10</p>
              <p className="mt-3 text-[40px] font-medium leading-none tracking-[-0.05em]">
                {showScore ? "6.9" : "—"}
                <span className="ml-1 text-[14px] font-normal tracking-normal text-muted">overall</span>
              </p>
              <ul className="mt-5 space-y-3">
                {SCORES.map((score) => (
                  <li key={score.label}>
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span>{score.label}</span>
                      <span className="tabular-nums text-muted">{showScore ? score.value.toFixed(1) : "—"}</span>
                    </div>
                    <div className="mt-1.5 h-px bg-line">
                      <div
                        className="h-px bg-cobalt transition-[width] duration-700 ease-out"
                        style={{ width: showScore ? `${score.value * 10}%` : "0%" }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className={`mt-5 text-[14px] leading-relaxed text-muted transition-opacity duration-500 ${showScore ? "opacity-100" : "opacity-0"}`}>
                Name the recommendation you made, and the person you convinced. Keep the four points of margin next to that decision.
              </p>

              <div className="mt-6 border-t border-line pt-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Six sessions · illustrative</p>
                <div className="mt-3 flex h-16 items-end gap-1.5" aria-hidden="true">
                  {PROGRESS.map((value, index) => (
                    <div key={index} className="flex-1 bg-ice" style={{ height: showScore ? `${Math.max(18, ((value - 4.2) / 4.2) * 100)}%` : "8%" }}>
                      <div className={`h-full ${index === PROGRESS.length - 1 ? "bg-cobalt" : "bg-cobalt/35"}`} />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">Session 3 dipped where ownership slipped again. The latest round is this sample.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
