"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import { landscape, triggerLandscapePulse } from "@/lib/landscape";

export type DraftStep = "closed" | "tracks" | "options" | "preview" | "complete";

type Draft = {
  step: DraftStep;
  trackId: string | null;
  optionId: string | null;
  query: string;
  setQuery: (value: string) => void;
  open: () => void;
  close: () => void;
  selectTrack: (id: string, behavior?: ScrollBehavior) => void;
  selectOption: (id: string) => void;
  back: () => void;
  complete: () => void;
  registerFocus: (fn: () => void) => void;
};

const DraftContext = createContext<Draft | null>(null);

export function InterviewDraftProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState<DraftStep>("closed");
  const [trackId, setTrackId] = useState<string | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const focus = useRef<() => void>(() => {});

  const scrollToPractice = useCallback(
    (behavior?: ScrollBehavior) => {
      document.getElementById("practice")?.scrollIntoView({
        behavior: behavior ?? (reduced ? "auto" : "smooth"),
        block: "center",
      });
    },
    [reduced],
  );

  const open = useCallback(() => {
    setStep((current) => (current === "closed" ? (trackId && optionId ? "preview" : trackId ? "options" : "tracks") : current));
    landscape.focusTarget = 1;
  }, [optionId, trackId]);

  const close = useCallback(() => {
    setStep("closed");
    landscape.focusTarget = 0;
  }, []);

  const selectTrack = useCallback(
    (id: string, behavior?: ScrollBehavior) => {
      setTrackId(id);
      setOptionId(null);
      setQuery("");
      setStep("options");
      landscape.energyTarget = 1;
      landscape.focusTarget = 1;
      triggerLandscapePulse();
      if (behavior) {
        scrollToPractice(behavior);
        window.setTimeout(() => focus.current(), 280);
      }
    },
    [scrollToPractice],
  );

  const selectOption = useCallback((id: string) => {
    setOptionId(id);
    setQuery("");
    setStep("preview");
    triggerLandscapePulse();
  }, []);

  const back = useCallback(() => {
    setStep((current) => {
      if (current === "complete" || current === "preview") return "options";
      if (current === "options") return "tracks";
      return "closed";
    });
    setOptionId((current) => (step === "options" ? current : null));
    if (step === "options") {
      setTrackId(null);
      landscape.energyTarget = 0;
    }
    setQuery("");
  }, [step]);

  const complete = useCallback(() => setStep("complete"), []);

  const registerFocus = useCallback((fn: () => void) => {
    focus.current = fn;
  }, []);

  const value = useMemo<Draft>(
    () => ({
      step,
      trackId,
      optionId,
      query,
      setQuery,
      open,
      close,
      selectTrack,
      selectOption,
      back,
      complete,
      registerFocus,
    }),
    [step, trackId, optionId, query, open, close, selectTrack, selectOption, back, complete, registerFocus],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useInterviewDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useInterviewDraft must be used within InterviewDraftProvider");
  return value;
}
