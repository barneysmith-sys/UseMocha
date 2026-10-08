"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Search } from "lucide-react";
import { tracks } from "@/lib/careers";
import {
  DIFFICULTIES,
  DURATIONS,
  RESPOND_MODES,
  setupQuery,
  splitMatch,
  TRACK_BLURB,
  trackMatches,
  typesFor,
  type Difficulty,
  type DurationMin,
  type RespondMode,
} from "@/lib/chooser";
import { useInterviewDraft } from "./InterviewDraft";

export function ChooseInterview() {
  const draft = useInterviewDraft();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const keyboard = useRef(false);

  const items = useMemo(
    () => tracks.filter((track) => trackMatches(track.id, track.name, draft.query)),
    [draft.query],
  );

  useEffect(() => {
    draft.registerFocus(() => inputRef.current?.focus());
  }, [draft]);

  useEffect(() => {
    setActiveIndex(0);
  }, [draft.query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!keyboard.current) return;
    const item = items[activeIndex];
    const node = item ? document.getElementById(`track-${item.id}`) : null;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.top < 88 || rect.bottom > window.innerHeight - 16) node.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      keyboard.current = true;
      setActiveIndex((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      keyboard.current = true;
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) draft.toggleTrack(item.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (draft.query) draft.setQuery("");
      else if (draft.trackId) draft.toggleTrack(draft.trackId);
    }
  }

  const activeId = items[activeIndex] ? `track-${items[activeIndex].id}` : undefined;
  const summary = draft.trackId
    ? [tracks.find((track) => track.id === draft.trackId)?.name, draft.format, draft.difficulty, `${draft.minutes} min`, draft.mode]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section id="practice" data-surface="paper" className="relative z-20 -mt-6 scroll-mt-24 rounded-t-[28px] bg-white text-ink shadow-[0_-24px_48px_-32px_rgba(0,20,80,0.45)]">
      <div className="mx-auto flex max-w-[720px] flex-col gap-7 px-5 pb-24 pt-14 sm:pt-16">
        <div className="flex flex-col gap-3">
          <span className="cap">New interview</span>
          <h2 className="text-balance text-[clamp(32px,4vw,40px)] font-normal leading-[1.15] tracking-[-0.025em]">
            What interview are you preparing for?
          </h2>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_24px_48px_-16px_rgba(11,18,32,0.16),0_0_0_1px_rgba(11,18,32,0.02)]">
          <label className="flex h-[60px] items-center gap-3 border-b border-line px-5">
            <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.5} />
            <span className="sr-only">Search career tracks</span>
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls="career-tracks"
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              placeholder="Search roles, e.g. product, banking, case"
              value={draft.query}
              onChange={(event) => draft.setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-muted"
            />
            <kbd className="hidden rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[11px] text-quiet sm:inline">⌘K</kbd>
          </label>

          <div id="career-tracks" role="listbox" aria-label="Career tracks" className="flex flex-col py-1.5">
            {items.length === 0 ? (
              <div className="flex flex-col gap-1.5 px-5 py-7">
                <b className="text-[14px] font-medium">No track matches “{draft.query.trim()}”</b>
                <span className="text-[13px] text-quiet">
                  Try a function, like “finance” or “design”. General Behavioral works for any role.
                </span>
              </div>
            ) : (
              items.map((track, index) => {
                const open = draft.trackId === track.id;
                const match = splitMatch(track.name, draft.query);
                const active = index === activeIndex;
                return (
                  <div key={track.id} className={open ? "bg-[#FBFCFE]" : undefined}>
                    <button
                      id={`track-${track.id}`}
                      type="button"
                      role="option"
                      aria-selected={active || open}
                      aria-expanded={open}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => draft.toggleTrack(track.id)}
                      className="flex min-h-14 w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-paper"
                    >
                      <span className="min-w-0 flex-1 sm:w-[220px] sm:flex-none">
                        <span className="block text-[15px] font-medium">
                          {match.pre}
                          {match.hit ? <span className="text-blue">{match.hit}</span> : null}
                          {match.post}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-muted sm:hidden">{TRACK_BLURB[track.id]}</span>
                      </span>
                      <span className="hidden min-w-0 flex-1 text-[13px] text-muted sm:block">{TRACK_BLURB[track.id]}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                        strokeWidth={1.5}
                      />
                    </button>
                    {open ? (
                      <div className="flex flex-col gap-4 px-5 pb-5">
                        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-3">
                          <Field label="Interview">
                            {typesFor(track.id).map((type) => (
                              <Chip
                                key={type.label}
                                on={draft.format === type.label}
                                onClick={() => draft.chooseType(type.label, type.optionId)}
                              >
                                {type.label}
                              </Chip>
                            ))}
                          </Field>
                          <Field label="Difficulty">
                            {DIFFICULTIES.map((item) => (
                              <Chip key={item} on={draft.difficulty === item} onClick={() => draft.setDifficulty(item)}>
                                {item}
                              </Chip>
                            ))}
                          </Field>
                          <Field label="Duration">
                            {DURATIONS.map((item) => (
                              <Chip key={item} on={draft.minutes === item} onClick={() => draft.setMinutes(item)}>
                                {item} min
                              </Chip>
                            ))}
                          </Field>
                          <Field label="Respond by">
                            {RESPOND_MODES.map((item) => (
                              <Chip key={item} on={draft.mode === item} onClick={() => draft.setMode(item)}>
                                {item}
                              </Chip>
                            ))}
                          </Field>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                          <span className="text-[13px] text-quiet">{summary}</span>
                          <a
                            href={`/setup?${setupQuery({
                              trackId: track.id,
                              optionId: draft.optionId,
                              format: draft.format,
                              difficulty: draft.difficulty,
                              minutes: draft.minutes,
                              mode: draft.mode,
                            }).toString()}`}
                            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue px-[18px] text-[14px] font-medium text-white hover:bg-[#0440C4]"
                          >
                            Continue
                            <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap gap-4 border-t border-line bg-paper px-5 py-2.5 text-[12px] text-muted">
            <Hint keys={["↑", "↓"]} label="navigate" />
            <Hint keys={["↵"]} label="select" />
            <Hint keys={["esc"]} label="clear" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="cap">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 rounded-lg border px-3.5 text-[14px] ${
        on ? "border-blue bg-blue-soft text-blue-deep" : "border-line-strong bg-white text-ink hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((key) => (
        <kbd key={key} className="rounded border border-line bg-white px-1.5 py-px font-mono text-[11px] text-quiet">
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}

export type { Difficulty, DurationMin, RespondMode };
