import assert from "node:assert/strict";
import test from "node:test";
import { GEMINI_CURRENT, GEMINI_PREVIOUS, callGemini, generationConfigFor, visibleModelText } from "../api/interview.js";

test("current grader skips sampling overrides and reads the answer past thoughts", () => {
  const current = generationConfigFor(GEMINI_CURRENT, { json: true, maxOutputTokens: 8000, rewrite: false });
  assert.equal(current.thinkingConfig.thinkingLevel, "low");
  assert.equal(current.responseMimeType, "application/json");
  assert.equal("temperature" in current, false);
  assert.equal("topP" in current, false);

  const previous = generationConfigFor(GEMINI_PREVIOUS, { json: true, maxOutputTokens: 8000, rewrite: false });
  assert.equal(previous.temperature, 0.4);
  assert.equal(previous.topP, 0.8);
  assert.equal(GEMINI_CURRENT, "gemini-3.8-flash");

  const text = visibleModelText({
    candidates: [{
      content: {
        parts: [
          { thought: true, text: "plan the score" },
          { text: '{"overall":6.4}' },
        ],
      },
    }],
  });
  assert.equal(text, '{"overall":6.4}');
});

test("a thought-only response is not treated as the grade", () => {
  assert.equal(visibleModelText({
    candidates: [{ content: { parts: [{ thought: true, text: "still thinking" }] } }],
  }), "");
});

test("a missing current model falls back without sampling overrides", async () => {
  const original = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    const model = String(url).includes(GEMINI_PREVIOUS) ? GEMINI_PREVIOUS : GEMINI_CURRENT;
    bodies.push({ model, body: JSON.parse(init.body) });
    if (model === GEMINI_CURRENT) {
      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "During my first year I rebuilt the weekly review." }] } }],
    }), { status: 200 });
  };
  try {
    const result = await callGemini("rewrite this", "rid-1", { rewrite: true, timeoutMs: 1000 });
    assert.equal(result.model, GEMINI_PREVIOUS);
    assert.equal(result.res.ok, true);
    assert.equal(bodies[0].body.generationConfig.thinkingConfig.thinkingLevel, "low");
    assert.equal("temperature" in bodies[0].body.generationConfig, false);
    assert.equal(bodies[1].body.generationConfig.temperature, 0.7);
  } finally {
    globalThis.fetch = original;
  }
});
