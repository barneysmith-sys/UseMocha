import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_MODEL, liveSetupMessage } from "../lib/interview/livePrompt";

test("live voice uses the current model and waits for the director line", () => {
  const setup = liveSetupMessage().setup;
  assert.equal(LIVE_MODEL, "gemini-3.8-live");
  assert.equal(setup.model, `models/${LIVE_MODEL}`);
  assert.equal(setup.generationConfig.responseModalities[0], "AUDIO");
  assert.equal("thinkingConfig" in setup.generationConfig, false);
  const declaration = setup.tools[0].functionDeclarations[0];
  assert.equal(declaration.name, "submit_candidate_turn");
  assert.equal(declaration.behavior, "BLOCKING");
});
