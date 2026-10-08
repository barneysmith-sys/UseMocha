"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import {
  DEFAULT_SELECTION,
  selectionFromSearch,
  typesFor,
  type Difficulty,
  type DurationMin,
  type RespondMode,
  type Selection,
} from "@/lib/chooser";
import { landscape, triggerLandscapePulse } from "@/lib/landscape";

type Draft = Selection & {
  query: string;
  setQuery: (value: string) => void;
  toggleTrack: (id: string) => void;
  chooseType: (label: string, optionId: string) => void;
  setDifficulty: (value: Difficulty) => void;
  setMinutes: (value: DurationMin) => void;
  setMode: (value: RespondMode) => void;
  focusTrack: (id: string) => void;
  focusSearch: () => void;
  registerFocus: (fn: () => void) => void;
};

const DraftContext = createContext<Draft | null>(null);

export function InterviewDraftProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [query, setQuery] = useState("");
  const focus = useRef<() => void>(() => {});

  useEffect(() => {
    const next = selectionFromSearch(new URLSearchParams(window.location.search));
    if (next) setSelection(next);
  }, []);

  useEffect(() => {
    landscape.energyTarget = selection.trackId ? 0.65 : 0;
    landscape.focusTarget = selection.trackId ? 1 : 0;
  }, [selection.trackId]);

  const scrollToPractice = useCallback(
    (behavior?: ScrollBehavior) => {
      document.getElementById("practice")?.scrollIntoView({
        behavior: behavior ?? (reduced ? "auto" : "smooth"),
        block: "start",
      });
    },
    [reduced],
  );

  const openTrack = useCallback((id: string, collapsed: boolean) => {
    setSelection((current) => {
      if (collapsed) return current.trackId === id ? { ...current, trackId: id } : current;
      const types = typesFor(id);
      const keep = types.find((type) => type.label === current.format);
      const next = keep ?? types[0];
      if (!next) return current;
      return { ...current, trackId: id, optionId: next.optionId, format: next.label };
    });
    if (!collapsed) triggerLandscapePulse();
  }, []);

  const toggleTrack = useCallback((id: string) => {
    setSelection((current) => {
      if (current.trackId === id) return { ...current, trackId: "" as string };
      const types = typesFor(id);
      const keep = types.find((type) => type.label === current.format);
      const next = keep ?? types[0];
      if (!next) return current;
      return { ...current, trackId: id, optionId: next.optionId, format: next.label };
    });
    triggerLandscapePulse();
  }, []);

  const chooseType = useCallback((label: string, optionId: string) => {
    setSelection((current) => ({ ...current, format: label, optionId }));
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    setSelection((current) => ({ ...current, difficulty }));
  }, []);

  const setMinutes = useCallback((minutes: DurationMin) => {
    setSelection((current) => ({ ...current, minutes }));
  }, []);

  const setMode = useCallback((mode: RespondMode) => {
    setSelection((current) => ({ ...current, mode }));
  }, []);

  const focusTrack = useCallback(
    (id: string) => {
      openTrack(id, false);
      scrollToPractice();
      window.setTimeout(() => focus.current(), reduced ? 0 : 280);
    },
    [openTrack, reduced, scrollToPractice],
  );

  const focusSearch = useCallback(() => {
    scrollToPractice();
    window.setTimeout(() => focus.current(), reduced ? 0 : 80);
  }, [reduced, scrollToPractice]);

  const registerFocus = useCallback((fn: () => void) => {
    focus.current = fn;
  }, []);

  const value = useMemo<Draft>(
    () => ({
      ...selection,
      trackId: selection.trackId,
      query,
      setQuery,
      toggleTrack,
      chooseType,
      setDifficulty,
      setMinutes,
      setMode,
      focusTrack,
      focusSearch,
      registerFocus,
    }),
    [selection, query, toggleTrack, chooseType, setDifficulty, setMinutes, setMode, focusTrack, focusSearch, registerFocus],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useInterviewDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useInterviewDraft must be used within InterviewDraftProvider");
  return value;
}
