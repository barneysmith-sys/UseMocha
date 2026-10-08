import assert from "node:assert/strict";
import test from "node:test";
import { pcmToWav, sampleRateFromMime } from "../lib/voice/wav";

test("pcm becomes a 16-bit mono wav", () => {
  const pcm = new Uint8Array([0, 0, 255, 127]);
  const wav = pcmToWav(pcm, 24000);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(wav.length, 48);
});

test("sample rate comes from the gemini mime type", () => {
  assert.equal(sampleRateFromMime("audio/pcm;rate=24000"), 24000);
  assert.equal(sampleRateFromMime(""), 24000);
});
