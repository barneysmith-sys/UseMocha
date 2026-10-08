"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";
import { findOption, findTrack } from "@/lib/careers";
import { landscape } from "@/lib/landscape";
import { motion as tokens } from "@/lib/tokens";
import { CareerTrackSelector, filterOptions, filterTracks } from "./CareerTrackSelector";
import { InterviewSetupPreview } from "./InterviewSetupPreview";
import { useInterviewDraft } from "./InterviewDraft";

export function CareerSearch() {
  const draft = useInterviewDraft();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = draft.step === "options" ? "career-options" : "career-tracks";
  const [activeIndex, setActiveIndex] = useState(0);
  const open = draft.step !== "closed";
  const track = findTrack(draft.trackId);
  const option = findOption(draft.trackId, draft.optionId);

  const trackItems = useMemo(() => filterTracks(draft.query), [draft.query]);
  const optionItems = useMemo(() => filterOptions(draft.trackId, draft.query), [draft.trackId, draft.query]);
  const items = draft.step === "options" ? optionItems : trackItems;

  useEffect(() => {
    draft.registerFocus(() => inputRef.current?.focus());
  }, [draft]);

  useEffect(() => {
    setActiveIndex(0);
  }, [draft.query, draft.step, draft.trackId]);

  useEffect(() => {
    landscape.focusTarget = open ? 1 : 0;
  }, [open]);

  useEffect(() => {
    const node = document.getElementById(
      draft.step === "options" ? `option-${optionItems[activeIndex]?.id}` : `track-${trackItems[activeIndex]?.id}`,
    );
    const list = node?.closest("ul");
    if (!node || !list) return;
    const top = node.offsetTop;
    const bottom = top + node.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [activeIndex, draft.step, optionItems, trackItems]);

  function chooseActive() {
    if (draft.step === "tracks") {
      const item = trackItems[activeIndex];
      if (item) draft.selectTrack(item.id);
      return;
    }
    if (draft.step === "options") {
      const item = optionItems[activeIndex];
      if (item) draft.selectOption(item.id);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        draft.open();
        return;
      }
      if (draft.step === "tracks" || draft.step === "options") {
        setActiveIndex((index) => Math.min(items.length - 1, index + 1));
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (draft.step === "tracks" || draft.step === "options") {
        setActiveIndex((index) => Math.max(0, index - 1));
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!open) draft.open();
      else chooseActive();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (draft.step === "preview" || draft.step === "complete" || draft.step === "options") draft.back();
      else draft.close();
    } else if (event.key === "Backspace" && draft.query === "" && (draft.step === "options" || draft.step === "preview" || draft.step === "complete")) {
      draft.back();
    }
  }

  const activeId =
    draft.step === "tracks"
      ? trackItems[activeIndex]
        ? `track-${trackItems[activeIndex].id}`
        : undefined
      : draft.step === "options"
        ? optionItems[activeIndex]
          ? `option-${optionItems[activeIndex].id}`
          : undefined
        : undefined;

  const placeholder =
    draft.step === "options" && track
      ? `Search ${track.name.toLowerCase()} interviews`
      : "What interview are you preparing for?";

  const locked = draft.step === "preview" || draft.step === "complete";

  return (
    <div
      ref={rootRef}
      id="practice"
      className="relative mt-8 w-full max-w-[640px] scroll-mt-28"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) draft.close();
      }}
    >
      <div className={`bg-white text-ink shadow-[0_18px_50px_rgba(0,20,80,0.22)] ${open ? "rounded-[12px]" : "rounded-[12px]"}`}>
        <div className="flex items-center gap-2 px-3.5">
          {draft.step !== "closed" && draft.step !== "tracks" ? (
            <button
              type="button"
              aria-label="Back"
              onMouseDown={(event) => event.preventDefault()}
              onClick={draft.back}
              className="grid h-8 w-8 place-items-center text-muted hover:text-ink"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : (
            <Search aria-hidden="true" className="ml-1 h-4 w-4 text-muted" strokeWidth={1.5} />
          )}
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Interview search"
            placeholder={placeholder}
            value={locked && option ? option.name : draft.query}
            readOnly={locked}
            onChange={(event) => {
              if (locked) return;
              draft.setQuery(event.target.value);
              if (!open) draft.open();
            }}
            onFocus={() => {
              if (draft.step === "closed") draft.open();
            }}
            onKeyDown={onKeyDown}
            className="h-[58px] min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.015em] text-ink outline-none placeholder:text-muted"
          />
          {open ? (
            <kbd className="mr-1 hidden border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted sm:inline">Esc</kbd>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={listId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={tokens.spring}
              className="overflow-hidden border-t border-line"
            >
              {draft.step === "tracks" ? (
                <CareerTrackSelector
                  mode="tracks"
                  items={trackItems}
                  activeIndex={activeIndex}
                  onHover={setActiveIndex}
                  onSelect={(id) => draft.selectTrack(id)}
                />
              ) : null}
              {draft.step === "options" && track ? (
                <CareerTrackSelector
                  mode="options"
                  track={track}
                  items={optionItems}
                  activeIndex={activeIndex}
                  onHover={setActiveIndex}
                  onSelect={draft.selectOption}
                />
              ) : null}
              {(draft.step === "preview" || draft.step === "complete") && track && option ? (
                <InterviewSetupPreview track={track} option={option} onBack={draft.back} />
              ) : null}
              <div className="border-t border-line px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-muted">
                Practice prototype · runs in this browser
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
