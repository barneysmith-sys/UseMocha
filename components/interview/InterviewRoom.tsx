"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { MochaLockup } from "@/components/MochaLockup";
import { findOption, findTrack, tracks, type CareerTrack, type InterviewOption } from "@/lib/careers";
import { closeSession, openSession, startClock, submitAnswer, type Session } from "@/lib/interview";
import type { Debrief } from "@/lib/interview/types";
import { CobaltRoom } from "./CobaltRoom";
import { GeminiLive } from "./geminiLive";
import { listenForAnswer, RoomAudio, speechRecognitionAvailable } from "./roomAudio";

type Phase = "ready" | "asking" | "live" | "debrief";
type Status = "connecting" | "speaking" | "listening";
type Mode = "text" | "speech" | "live";

const STAGE_LABEL: Record<Session["stage"], string> = {
  introduction: "Introduction",
  experience: "Experience",
  challenge: "Case",
  pressure: "Pressure",
  closing: "Close",
};

export function InterviewRoom() {
  const params = useSearchParams();
  const track = findTrack(params.get("track"));
  const option = findOption(params.get("track"), params.get("option"));
  const minutes = clampMinutes(params.get("minutes"));
  const preferred = params.get("mode") === "text" ? "text" : "voice";
  const format = params.get("format") || option?.type || "";
  const difficulty = params.get("difficulty") || "Challenging";
  const detail = [params.get("role"), params.get("company")].filter(Boolean).join(" · ");
  if (!track || !option) return <Missing />;
  return (
    <Room
      track={track}
      option={option}
      minutes={minutes}
      preferred={preferred}
      format={format}
      difficulty={difficulty}
      detail={detail}
    />
  );
}

function Room({
  track,
  option,
  minutes,
  preferred,
  format,
  difficulty,
  detail,
}: {
  track: CareerTrack;
  option: InterviewOption;
  minutes: number;
  preferred: "voice" | "text";
  format: string;
  difficulty: string;
  detail: string;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [session, setSession] = useState<Session | null>(null);
  const [line, setLine] = useState("");
  const [heard, setHeard] = useState("");
  const [caption, setCaption] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("listening");
  const [notice, setNotice] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [now, setNow] = useState(0);
  const [questionHeard, setQuestionHeard] = useState(false);
  const [mode, setModeState] = useState<Mode>("text");
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<RoomAudio | null>(null);
  const liveRef = useRef<GeminiLive | null>(null);
  const listenRef = useRef<{ stop: () => void; finish: () => void } | null>(null);
  const modeRef = useRef<Mode>("text");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const beginRef = useRef<(kind: "voice" | "text") => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const clockRef = useRef(false);
  const questionHeardRef = useRef(false);
  const voiceReadyRef = useRef<Promise<void>>(Promise.resolve());
  const preferredRef = useRef(preferred);
  preferredRef.current = preferred;

  useEffect(() => {
    return () => {
      listenRef.current?.stop();
      liveRef.current?.close();
      audioRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => {
      const current = sessionRef.current;
      const clock = Date.now();
      setNow(clock);
      if (!current || current.closed) return;
      if (clock - current.startedAtMs <= current.durationMin * 60_000 * 1.15) return;
      const result = closeSession(current, clock);
      sessionRef.current = result.state;
      setSession(result.state);
      setLine(result.decision.say);
      stopVoice();
      setPhase("debrief");
    }, 500);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      beginRef.current(preferredRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  useEffect(() => {
    if (phase !== "asking") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      if (!questionHeardRef.current) return;
      startRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  function setMode(next: Mode) {
    modeRef.current = next;
    setModeState(next);
  }

  function stopVoice() {
    listenRef.current?.stop();
    listenRef.current = null;
    liveRef.current?.close();
    liveRef.current = null;
    audioRef.current?.stop();
  }

  function applyTurn(text: string) {
    if (!clockRef.current) return null;
    const current = sessionRef.current;
    if (!current || current.closed) return null;
    const result = submitAnswer(current, text, Date.now());
    sessionRef.current = result.state;
    setSession(result.state);
    setLine(result.decision.say);
    setHeard(text);
    setCaption("");
    if (result.state.closed) {
      stopVoice();
      setPhase("debrief");
      return null;
    }
    return result.decision.say;
  }

  function beginListening() {
    if (modeRef.current !== "speech" || sessionRef.current?.closed) return;
    listenRef.current?.stop();
    setStatus("listening");
    const handle = listenForAnswer({
      onPartial: setCaption,
      onEnd: (text) => {
        listenRef.current = null;
        if (!clockRef.current) return;
        const next = applyTurn(text);
        if (next) void deliverFollowUp(next);
      },
      onError: (message) => {
        setNotice(message);
        setMode("text");
        setStatus("listening");
      },
    });
    listenRef.current = handle;
    if (!handle) {
      setMode("text");
      setNotice("This browser can't transcribe here. Type your answer — the interview is the same.");
    }
  }

  async function readAloud(text: string) {
    liveRef.current?.quiet();
    const audio = audioRef.current;
    if (!audio) return;
    if (clockRef.current) setStatus("speaking");
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (response.status === 503) {
        setNotice("The question is on screen. Spoken voice needs a Gemini key in this prototype.");
        return;
      }
      if (!response.ok) throw new Error("speak failed");
      const duration = await audio.playResponse(await response.arrayBuffer());
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(500, duration * 1000)));
    } catch {
      setNotice("The voice didn't come through. The question is on screen.");
    }
  }

  async function deliverFollowUp(text: string) {
    await readAloud(text);
    if (!clockRef.current || sessionRef.current?.closed) return;
    resumeListening();
  }

  function resumeListening() {
    if (!clockRef.current || sessionRef.current?.closed) return;
    if (modeRef.current === "live") {
      liveRef.current?.listen();
      setStatus("listening");
      return;
    }
    if (modeRef.current === "speech") {
      beginListening();
      return;
    }
    setStatus("listening");
    window.setTimeout(() => fieldRef.current?.focus(), 50);
  }

  async function connectVoice() {
    setStatus("connecting");
    try {
      const response = await fetch("/api/voice/live", { method: "POST" });
      const data = (await response.json()) as { available?: boolean; websocketUrl?: string };
      if (data.available && data.websocketUrl && audioRef.current) {
        const live = new GeminiLive(audioRef.current, {
          onInterim: (text) => {
            if (clockRef.current) setCaption(text);
          },
          onLevel: setLevel,
          onStatus: (next) => {
            if (clockRef.current) setStatus(next);
          },
          onFallback: (reason) => {
            setNotice(`${reason} You can keep going by typing.`);
            setMode(speechRecognitionAvailable() ? "speech" : "text");
            liveRef.current = null;
            if (clockRef.current && modeRef.current === "speech") beginListening();
          },
          onCandidate: (transcript, reply) => {
            if (!clockRef.current) {
              reply(transcript);
              return;
            }
            const next = applyTurn(transcript);
            reply(next ?? "");
            if (next) void deliverFollowUp(next);
          },
        });
        await live.connect(data.websocketUrl);
        live.quiet();
        liveRef.current = live;
        setMode("live");
        if (clockRef.current) live.listen();
        return;
      }
    } catch {
      setNotice("Live voice didn't connect. The question is read aloud, and you can type your answer.");
    }
    if (liveRef.current) return;
    const fallback = speechRecognitionAvailable() ? "speech" : "text";
    setMode(fallback);
    if (fallback === "text") {
      setNotice("This browser has no speech recognition. Type your answers. Nothing about the interview changes.");
    }
    if (clockRef.current && fallback === "speech") beginListening();
  }

  async function begin(kind: "voice" | "text") {
    clockRef.current = false;
    questionHeardRef.current = false;
    setQuestionHeard(false);
    setHeard("");
    setCaption("");
    setDraft("");
    setNotice(null);
    setLevel(0);
    const context = new AudioContext();
    void context.resume();
    audioRef.current = new RoomAudio(context);
    const opened = openSession({
      trackId: track.id,
      optionId: option.id,
      durationMin: minutes,
      nowMs: Date.now(),
      sampleQuestion: option.sampleQuestion,
      trackName: track.name,
      optionName: option.name,
    });
    sessionRef.current = opened.state;
    setSession(opened.state);
    setLine(opened.decision.say);
    setPhase("asking");
    setNow(0);
    setStatus("speaking");
    if (kind === "text") {
      setMode("text");
      voiceReadyRef.current = Promise.resolve();
    } else {
      voiceReadyRef.current = connectVoice();
    }
    await readAloud(opened.decision.say);
    if (!sessionRef.current || sessionRef.current.closed) return;
    questionHeardRef.current = true;
    setQuestionHeard(true);
  }

  async function startAnswering() {
    if (!questionHeardRef.current || clockRef.current) return;
    const current = sessionRef.current;
    if (!current || current.closed) return;
    const started = startClock(current, Date.now());
    sessionRef.current = started;
    setSession(started);
    clockRef.current = true;
    setNow(Date.now());
    setPhase("live");
    setStatus("listening");
    await voiceReadyRef.current;
    if (!clockRef.current || sessionRef.current?.closed) return;
    resumeListening();
  }

  function submitDraft(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !clockRef.current) return;
    listenRef.current?.stop();
    listenRef.current = null;
    audioRef.current?.stop();
    setDraft("");
    const next = applyTurn(text);
    if (!next) return;
    if (modeRef.current === "live") liveRef.current?.say(next);
    void deliverFollowUp(next);
  }

  function onMic() {
    if (!clockRef.current) return;
    if (status === "speaking" || status === "connecting") {
      audioRef.current?.stop();
      if (modeRef.current === "live") liveRef.current?.listen();
      else if (modeRef.current === "speech") beginListening();
      else setStatus("listening");
      return;
    }
    if (modeRef.current === "speech" && listenRef.current) {
      listenRef.current.finish();
      return;
    }
    if (speechRecognitionAvailable()) {
      setMode("speech");
      beginListening();
      return;
    }
    setNotice("The microphone isn't available in this browser. Type your answer.");
    fieldRef.current?.focus();
  }

  beginRef.current = begin;
  startRef.current = () => {
    void startAnswering();
  };
  const kicker = [track.name, format, detail].filter(Boolean).join(" · ");
  const totalLabel = `${minutes}:00`;

  if (phase === "ready") {
    return (
      <CobaltRoom
        kicker={kicker}
        stageLabel="00 / 05 · Not started"
        filled={0}
        elapsed="00:00"
        total={totalLabel}
        onExit={() => window.location.assign("/")}
        footer={
          <p className="max-w-md text-[13px] leading-relaxed text-white/75">
            Voice uses the microphone when you begin. If live audio isn’t configured, the round stays on screen. This prototype does not save anything to Mocha.
          </p>
        }
      >
        <div className="flex max-w-[640px] flex-col items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/85">Interviewer ready</span>
          <h1 className="text-[34px] font-light leading-[42px] tracking-[-0.015em]">Whenever you’re ready, we’ll begin.</h1>
          <p className="max-w-[46ch] text-[15px] leading-6 text-white/88">
            Five stages, about {minutes} minutes. Follow-ups depend on what you say, and feedback waits until the end.
          </p>
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => void begin(preferred)}
            className="inline-flex h-[52px] items-center gap-2.5 rounded-full bg-white px-6 text-[15px] font-medium text-cobalt hover:bg-ice"
          >
            {preferred === "text" ? "Begin by typing" : "Begin interview"}
            {preferred === "voice" ? (
              <kbd className="rounded border border-[#B6CBFF] px-1.5 font-mono text-[11px] text-blue-deep">Space</kbd>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => void begin(preferred === "text" ? "voice" : "text")}
            className="h-[52px] rounded-full border border-white/35 px-5 text-[15px] hover:bg-white/10"
          >
            {preferred === "text" ? "Use voice" : "Type instead"}
          </button>
        </div>
      </CobaltRoom>
    );
  }

  if (phase === "debrief" && session?.debrief) {
    return <Debrief session={session} track={track} option={option} minutes={minutes} difficulty={difficulty} />;
  }

  const asking = phase === "asking";
  const elapsedMs = !asking && session && now ? Math.max(0, now - session.startedAtMs) : 0;
  const stage = session?.stage ?? "introduction";
  const index = Math.max(0, stageIndex(stage));

  return (
    <CobaltRoom
      kicker={kicker}
      stageLabel={asking ? "00 / 05 · Question" : `${String(index + 1).padStart(2, "0")} / 05 · ${STAGE_LABEL[stage]}`}
      filled={asking ? 0 : index + 1}
      elapsed={asking ? "00:00" : formatClock(elapsedMs)}
      total={totalLabel}
      onExit={() => {
        stopVoice();
        window.location.assign("/");
      }}
      footer={
        asking ? (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              disabled={!questionHeard}
              onClick={() => void startAnswering()}
              className="inline-flex h-[52px] items-center gap-2.5 rounded-full bg-white px-6 text-[15px] font-medium text-cobalt hover:bg-ice disabled:cursor-default disabled:bg-white/70 disabled:text-cobalt/60"
            >
              {questionHeard ? "Begin my answer" : "Listening to the question"}
              {questionHeard ? (
                <kbd className="rounded border border-[#B6CBFF] px-1.5 font-mono text-[11px] text-blue-deep">Space</kbd>
              ) : null}
            </button>
            <p className="max-w-md text-center text-[13px] leading-relaxed text-white/75">
              The clock starts when you begin your answer.
            </p>
          </div>
        ) : (
        <form onSubmit={submitDraft} className="flex w-full max-w-3xl items-end gap-3">
          <button
            type="button"
            onClick={onMic}
            aria-pressed={status === "listening" && mode !== "text"}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-white/35 text-white hover:bg-white/10"
          >
            <span className="sr-only">
              {status === "speaking" ? "Interrupt" : status === "connecting" ? "Connecting" : "Microphone"}
            </span>
            <MicIcon />
          </button>
          <label className="block min-w-0 flex-1 text-left">
            <span className="sr-only">Type your answer</span>
            <textarea
              ref={fieldRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitDraft();
                }
              }}
              rows={2}
              placeholder="Or type. Enter sends."
              className="w-full resize-none rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/55"
            />
          </label>
          <button type="submit" className="h-11 rounded-full bg-white px-4 text-[14px] font-medium text-cobalt">
            Send
          </button>
        </form>
        )
      }
    >
      <p className="max-w-[22em] text-[clamp(26px,3vw,34px)] font-light leading-snug tracking-[-0.015em]" aria-live="polite">
        {line}
      </p>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-white/70">
        {asking
          ? questionHeard
            ? "Ready when you are"
            : "Reading the question"
          : status === "speaking"
            ? "Speaking"
            : status === "connecting"
              ? "Connecting"
              : "Listening"}
        {!asking && mode === "live" ? ` · ${Math.round(level * 100)}` : null}
      </p>
      {!asking && heard ? <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-white/75">{heard}</p> : null}
      {!asking && caption ? <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-white/80">{caption}</p> : null}
      {notice ? <p className="mt-4 max-w-[52ch] text-[13px] leading-relaxed text-white/70">{notice}</p> : null}
    </CobaltRoom>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function Debrief({
  session,
  track,
  option,
  minutes,
  difficulty,
}: {
  session: Session;
  track: CareerTrack;
  option: InterviewOption;
  minutes: number;
  difficulty: string;
}) {
  const initial = session.debrief;
  const [reading, setReading] = useState<Debrief | null>(initial);
  const [marking, setMarking] = useState(initial?.mark !== "transcript");
  const [markNote, setMarkNote] = useState<string | null>(null);

  useEffect(() => {
    const debrief = session.debrief;
    if (!debrief || debrief.mark === "transcript") {
      setMarking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackName: session.trackName,
            optionName: session.optionName,
            difficulty,
            turns: session.turns,
            debrief,
          }),
        });
        const data = (await response.json()) as { graded?: boolean; debrief?: Debrief };
        if (cancelled) return;
        if (data.graded && data.debrief?.mark === "transcript") {
          setReading(data.debrief);
          setMarkNote("Scored from the transcript.");
        } else {
          setMarkNote("The room reading stands. A transcript score did not come back.");
        }
      } catch {
        if (!cancelled) setMarkNote("The room reading stands. A transcript score did not come back.");
      } finally {
        if (!cancelled) setMarking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, difficulty]);

  if (!reading) return null;
  const scale = reading.mark === "transcript" ? 10 : 5;
  return (
    <Shell>
      <p className="text-[11px] uppercase tracking-[0.18em] text-cobalt">After the interview</p>
      <h1 className="mt-3 max-w-[18ch] text-[2.2rem] font-medium leading-[1.05] tracking-[-0.04em]">What the conversation supports.</h1>
      <p className="mt-4 max-w-[54ch] text-[15.5px] leading-relaxed text-ink/80">{reading.summary}</p>
      <p className="mt-3 text-[12px] uppercase tracking-[0.16em] text-muted">
        {marking ? "Scoring the transcript." : markNote}
      </p>
      <div className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2">
        {reading.dimensions.map((item) => (
          <article key={item.key} className="bg-paper p-4">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-cobalt">{item.label}</h2>
              <p className="font-mono text-[13px] tabular-nums text-ink">
                {scale === 10 ? item.score.toFixed(1) : item.score} / {scale}
              </p>
            </header>
            <p className="mt-3 text-[14px] leading-relaxed text-ink">{item.note}</p>
            {item.evidence[0] ? <q className="mt-3 block text-[13px] leading-relaxed text-muted">{item.evidence[0]}</q> : null}
          </article>
        ))}
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <Memory title="Stated" items={reading.stated} empty="No candidate statements were kept." />
        <Memory title="Inferred" items={reading.inferred} empty="Nothing was inferred." />
        <Memory title="Unknown" items={reading.unknown} empty="No open gaps were flagged." />
      </div>
      {reading.contradictions.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted">Contradictions</h2>
          <ul className="mt-2 space-y-2 text-[14px] leading-relaxed text-ink">
            {reading.contradictions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {reading.caseKey ? (
        <p className="mt-8 max-w-[62ch] border-l border-cobalt pl-3 text-[13.5px] leading-relaxed text-muted">
          <span className="text-ink">Case key, not said during the interview. </span>
          {reading.caseKey}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-4 text-[14px]">
        <button
          type="button"
          className="bg-ink px-4 py-2.5 font-medium text-white hover:bg-cobalt"
          onClick={() => window.location.assign(`/interview?track=${track.id}&option=${option.id}&minutes=${minutes}`)}
        >
          Practice again
        </button>
        <a className="py-2.5 text-muted underline decoration-cobalt/40 underline-offset-4" href="/#practice">
          Choose another interview
        </a>
      </div>
      <Transcript session={session} />
    </Shell>
  );
}

function Memory({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  const shown = items.slice(0, 4);
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted">{title}</h2>
      {shown.length === 0 ? <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{empty}</p> : null}
      <ul className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-ink">
        {shown.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function Transcript({ session }: { session: Session }) {
  return (
    <details className="mt-10 border-t border-line pt-4">
      <summary className="cursor-pointer text-[12px] uppercase tracking-[0.16em] text-muted">Transcript</summary>
      <ol className="mt-4 space-y-4">
        {session.turns.map((turn) => (
          <li key={turn.id}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{turn.role === "interviewer" ? "Interviewer" : "You"}</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-ink">{turn.text}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <MochaLockup tone="ink" />
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Prototype interview</p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-10">{children}</div>
    </main>
  );
}

function Missing() {
  return (
    <Shell>
      <h1 className="text-[2rem] font-medium tracking-[-0.04em]">Choose an interview.</h1>
      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        The round starts from a career and a format. Nothing here is connected to the live Mocha app.
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {tracks.map((track) => {
          const option = track.options[0];
          if (!option) return null;
          return (
            <li key={track.id}>
              <a className="flex items-baseline justify-between gap-4 py-3 hover:text-blue" href="/#practice">
                <span>{track.name}</span>
                <span className="text-[13px] text-muted">{option.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

function clampMinutes(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(45, Math.max(6, Math.round(parsed)));
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function stageIndex(stage: string) {
  return ["introduction", "experience", "challenge", "pressure", "closing"].indexOf(stage);
}
