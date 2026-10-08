"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { MochaLockup } from "@/components/MochaLockup";
import { findOption, findTrack, tracks, type CareerTrack, type InterviewOption } from "@/lib/careers";
import { closeSession, openSession, submitAnswer, type Session } from "@/lib/interview";
import { CobaltRoom } from "./CobaltRoom";
import { GeminiLive } from "./geminiLive";
import { listenForAnswer, RoomAudio, speechRecognitionAvailable, watchForSpeech } from "./roomAudio";

type Phase = "ready" | "live" | "debrief";
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
  const detail = [params.get("role"), params.get("company")].filter(Boolean).join(" · ");
  if (!track || !option) return <Missing />;
  return <Room track={track} option={option} minutes={minutes} preferred={preferred} format={format} detail={detail} />;
}

function Room({
  track,
  option,
  minutes,
  preferred,
  format,
  detail,
}: {
  track: CareerTrack;
  option: InterviewOption;
  minutes: number;
  preferred: "voice" | "text";
  format: string;
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
  const [mode, setModeState] = useState<Mode>("text");
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<RoomAudio | null>(null);
  const liveRef = useRef<GeminiLive | null>(null);
  const listenRef = useRef<{ stop: () => void; finish: () => void } | null>(null);
  const modeRef = useRef<Mode>("text");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const beginRef = useRef<(kind: "voice" | "text") => void>(() => {});
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
        const next = applyTurn(text);
        if (next) void speak(next);
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

  async function speak(text: string) {
    if (modeRef.current === "live" && liveRef.current) {
      liveRef.current.say(text);
      return;
    }
    const audio = audioRef.current;
    if (!audio || modeRef.current === "text") {
      setStatus("listening");
      return;
    }
    setStatus("speaking");
    const gate = await watchForSpeech(audio.context, () => {});
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const began = gate.speaking;
      gate.close();
      if (response.status === 503) {
        setNotice("Spoken voice needs a Gemini key in this prototype. The questions stay on screen.");
        beginListening();
        return;
      }
      if (!response.ok) throw new Error("speak failed");
      if (began) {
        beginListening();
        return;
      }
      const duration = await audio.playResponse(await response.arrayBuffer());
      window.setTimeout(() => beginListening(), Math.max(400, duration * 1000));
    } catch {
      gate.close();
      setNotice("The voice didn't come through. The line is on screen.");
      beginListening();
    }
  }

  async function begin(kind: "voice" | "text") {
    const context = new AudioContext();
    void context.resume();
    const audio = new RoomAudio(context);
    audioRef.current = audio;
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
    setPhase("live");
    setNow(Date.now());
    if (kind === "text") {
      setMode("text");
      setStatus("listening");
      window.setTimeout(() => fieldRef.current?.focus(), 50);
      return;
    }
    setStatus("connecting");
    try {
      const response = await fetch("/api/voice/live", { method: "POST" });
      const data = (await response.json()) as { available?: boolean; websocketUrl?: string };
      if (data.available && data.websocketUrl) {
        const live = new GeminiLive(audio, {
          onInterim: setCaption,
          onLevel: setLevel,
          onStatus: setStatus,
          onFallback: (reason) => {
            setNotice(`${reason} You can keep going by typing.`);
            setMode(speechRecognitionAvailable() ? "speech" : "text");
            liveRef.current = null;
            if (modeRef.current === "speech") beginListening();
          },
          onCandidate: (transcript, reply) => {
            const next = applyTurn(transcript);
            if (next) reply(next);
          },
        });
        await live.connect(data.websocketUrl);
        liveRef.current = live;
        setMode("live");
        live.offer(opened.decision.say);
        return;
      }
    } catch {
      setNotice("Live voice didn't connect. Questions will be read aloud if speech is configured, and you can type at any time.");
    }
    setMode(speechRecognitionAvailable() ? "speech" : "text");
    if (modeRef.current === "text") {
      setNotice("This browser has no speech recognition. Type your answers. Nothing about the interview changes.");
      setStatus("listening");
      return;
    }
    void speak(opened.decision.say);
  }

  function submitDraft(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || phase !== "live") return;
    listenRef.current?.stop();
    listenRef.current = null;
    audioRef.current?.stop();
    liveRef.current?.interrupt();
    setDraft("");
    const next = applyTurn(text);
    if (!next) return;
    if (modeRef.current === "live") liveRef.current?.say(next);
    else if (modeRef.current === "speech") void speak(next);
  }

  function onMic() {
    if (status === "speaking" || status === "connecting") {
      audioRef.current?.stop();
      liveRef.current?.interrupt();
      if (modeRef.current === "speech") beginListening();
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
    return <Debrief session={session} track={track} option={option} minutes={minutes} />;
  }

  const elapsedMs = session && now ? Math.max(0, now - session.startedAtMs) : 0;
  const stage = session?.stage ?? "introduction";
  const index = Math.max(0, stageIndex(stage));

  return (
    <CobaltRoom
      kicker={kicker}
      stageLabel={`${String(index + 1).padStart(2, "0")} / 05 · ${STAGE_LABEL[stage]}`}
      filled={index + 1}
      elapsed={formatClock(elapsedMs)}
      total={totalLabel}
      onExit={() => {
        stopVoice();
        window.location.assign("/");
      }}
      footer={
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
      }
    >
      <p className="max-w-[22em] text-[clamp(26px,3vw,34px)] font-light leading-snug tracking-[-0.015em]" aria-live="polite">
        {line}
      </p>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-white/70">
        {status === "speaking" ? "Speaking" : status === "connecting" ? "Connecting" : "Listening"}
        {mode === "live" ? ` · ${Math.round(level * 100)}` : null}
      </p>
      {heard ? <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-white/75">{heard}</p> : null}
      {caption ? <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-white/80">{caption}</p> : null}
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
}: {
  session: Session;
  track: CareerTrack;
  option: InterviewOption;
  minutes: number;
}) {
  const debrief = session.debrief;
  if (!debrief) return null;
  return (
    <Shell>
      <p className="text-[11px] uppercase tracking-[0.18em] text-cobalt">After the interview</p>
      <h1 className="mt-3 max-w-[18ch] text-[2.2rem] font-medium leading-[1.05] tracking-[-0.04em]">What the conversation supports.</h1>
      <p className="mt-4 max-w-[54ch] text-[15.5px] leading-relaxed text-ink/80">{debrief.summary}</p>
      <div className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2">
        {debrief.dimensions.map((item) => (
          <article key={item.key} className="bg-paper p-4">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-cobalt">{item.label}</h2>
              <p className="font-mono text-[13px] tabular-nums text-ink">{item.score} / 5</p>
            </header>
            <p className="mt-3 text-[14px] leading-relaxed text-ink">{item.note}</p>
            {item.evidence[0] ? <q className="mt-3 block text-[13px] leading-relaxed text-muted">{item.evidence[0]}</q> : null}
          </article>
        ))}
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <Memory title="Stated" items={debrief.stated} empty="No candidate statements were kept." />
        <Memory title="Inferred" items={debrief.inferred} empty="Nothing was inferred." />
        <Memory title="Unknown" items={debrief.unknown} empty="No open gaps were flagged." />
      </div>
      {debrief.contradictions.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted">Contradictions</h2>
          <ul className="mt-2 space-y-2 text-[14px] leading-relaxed text-ink">
            {debrief.contradictions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {debrief.caseKey ? (
        <p className="mt-8 max-w-[62ch] border-l border-cobalt pl-3 text-[13.5px] leading-relaxed text-muted">
          <span className="text-ink">Case key, not said during the interview. </span>
          {debrief.caseKey}
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
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function stageIndex(stage: string) {
  return ["introduction", "experience", "challenge", "pressure", "closing"].indexOf(stage);
}
