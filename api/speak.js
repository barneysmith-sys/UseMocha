// Mocha — /api/speak
// Reads the practice question in a calm interviewer voice (Gemini TTS).

import { createHash } from 'crypto';

const MODELS = [
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-flash-tts',
];

const VOICE = 'Charon';

function sanitise(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, maxLen);
}

function pcmToWav(pcm, sampleRate) {
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer;
}

function sampleRateFromMime(mime) {
  const m = String(mime || '').match(/rate=(\d+)/i);
  return m ? parseInt(m[1], 10) : 24000;
}

async function synthesize(apiKey, question, model) {
  const prompt = [
    'Read the interview question below exactly as written.',
    'You are a senior interviewer at a top firm, sitting across from the candidate.',
    'Calm, clear, unhurried. A short pause after the first sentence.',
    'No greeting, no extra words, no commentary.',
    '',
    question,
  ].join('\n');

  const contents = [{ parts: [{ text: prompt }] }];
  const speechConfig = {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: VOICE },
    },
  };
  const bodies = [
    {
      contents,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig,
      },
    },
    {
      contents,
      generationConfig: { responseModalities: ['AUDIO'] },
      speechConfig,
    },
  ];

  let lastErr = null;
  for (const body of bodies) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!res.ok) {
      lastErr = new Error(data?.error?.message || raw.slice(0, 240));
      lastErr.status = res.status;
      continue;
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!audioPart) {
      lastErr = new Error('No audio in TTS response');
      continue;
    }
    const mime = audioPart.inlineData.mimeType || '';
    const bytes = Buffer.from(audioPart.inlineData.data, 'base64');
    if (/wav|wave/i.test(mime)) return { buf: bytes, type: 'audio/wav' };
    if (/mpeg|mp3/i.test(mime)) return { buf: bytes, type: 'audio/mpeg' };
    return { buf: pcmToWav(bytes, sampleRateFromMime(mime)), type: 'audio/wav' };
  }
  throw lastErr || new Error('TTS failed');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Speech is not configured.' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }

  const question = sanitise(body.question, 400);
  if (!question) {
    res.status(400).json({ error: 'question is required.' });
    return;
  }

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const audio = await synthesize(apiKey, question, model);
      res.setHeader('Content-Type', audio.type);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Mocha-Voice', VOICE);
      res.setHeader('X-Mocha-Tts-Model', model);
      res.setHeader('X-Mocha-Hash', createHash('sha256').update(question).digest('hex').slice(0, 12));
      res.status(200).send(audio.buf);
      return;
    } catch (err) {
      lastErr = err;
      if (err.status && err.status !== 404) break;
    }
  }

  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    event: 'speak_failed',
    message: lastErr ? lastErr.message : 'unknown',
  }));
  res.status(502).json({ error: 'Could not speak the question.' });
}
