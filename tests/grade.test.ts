import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyGrade, gradePrompt, parseGrade } from "../lib/interview/grade";
import { LIVE_SYSTEM } from "../lib/interview/livePrompt";
import { openSession, startClock } from "../lib/interview/director";
import type { Debrief } from "../lib/interview/types";

test("the live voice is told to stay silent and is not given a script to read aloud", () => {
  assert.match(LIVE_SYSTEM, /Stay completely silent/);
  assert.doesNotMatch(LIVE_SYSTEM, /SAY VERBATIM/);
  assert.doesNotMatch(LIVE_SYSTEM, /how it should act|system instruction|speaking voice/i);
  const spoken = readFileSync(new URL("../app/api/voice/speak/route.ts", import.meta.url), "utf8");
  const live = readFileSync(new URL("../components/interview/geminiLive.ts", import.meta.url), "utf8");
  assert.match(spoken, /parts: \[\{ text \}\]/);
  assert.doesNotMatch(spoken, /SAY VERBATIM|You are a senior interviewer|how it should act/);
  assert.doesNotMatch(live, /SAY VERBATIM|clientContent/);
});

test("the clock can start after the question, not when the room opens", () => {
  const opened = openSession({
    trackId: "product",
    optionId: "practice",
    durationMin: 30,
    nowMs: 1_000,
    sampleQuestion: "Tell me about a metric you moved.",
    trackName: "Product",
    optionName: "Practice",
  });
  const started = startClock(opened.state, 25_000);
  assert.equal(started.startedAtMs, 25_000);
  assert.equal(started.stageStartedAtMs, 25_000);
  assert.equal(opened.state.startedAtMs, 1_000);
});

test("a grade keeps only quotes that were actually said", () => {
  const transcript = "I decided to cut the pilot to two stores. The team increased retention by 20%.";
  const raw = JSON.stringify({
    summary: "The candidate named a personal cut and a team result. Revenue grew 40%.",
    dimensions: [
      { key: "structure", score: 6.4, note: "The cut comes before the result.", evidence: "I decided to cut the pilot" },
      { key: "clarity", score: 9.2, note: "Two stores is specific.", evidence: "two stores" },
      { key: "ownership", score: 9.1, note: "The result is the team's. They claimed a 90% gain.", evidence: "I personally drove the whole gain" },
      { key: "impact", score: 4.2, note: "A figure was stated.", evidence: "retention by 20%" },
    ],
  });
  const grade = parseGrade(raw, transcript);
  assert.ok(grade);
  assert.equal(grade?.summary, "The candidate named a personal cut and a team result.");
  assert.equal(grade?.dimensions[0].score, 6.4);
  assert.equal(grade?.dimensions[1].score, 9.2);
  assert.equal(grade?.dimensions[2].score, 6.9);
  assert.equal(grade?.dimensions[2].evidence, "");
  assert.equal(grade?.dimensions[2].note, "The result is the team's.");
  assert.match(grade?.dimensions[3].evidence ?? "", /20%/);
  const prompt = gradePrompt({
    trackName: "Product",
    optionName: "Product sense",
    turns: [{ id: "t1", role: "candidate", text: transcript, atMs: 0, stage: "experience" }],
  });
  assert.match(prompt, /Do not invent/);
  assert.ok(prompt.includes(transcript));

  const debrief: Debrief = {
    summary: "room",
    stated: [],
    inferred: [],
    unknown: [],
    contradictions: [],
    dimensions: [
      { key: "structure", label: "Structure", score: 3, evidence: [], note: "room" },
      { key: "clarity", label: "Clarity", score: 3, evidence: [], note: "room" },
      { key: "ownership", label: "Ownership", score: 3, evidence: [], note: "room" },
      { key: "impact", label: "Impact", score: 3, evidence: [], note: "room" },
    ],
  };
  const next = applyGrade(debrief, grade!);
  assert.equal(next.mark, "transcript");
  assert.equal(next.dimensions[0].score, 6.4);
  assert.equal(next.dimensions[1].score, 9.2);
  assert.equal(next.dimensions[2].score, 6.9);
  assert.equal(next.dimensions[2].evidence.length, 0);
});
