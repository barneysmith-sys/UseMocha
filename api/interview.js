// ═══════════════════════════════════════════════════════════════════
// Mocha — /api/interview
// Vercel Edge-compatible serverless function.
// ALL AI traffic goes through here. Key never touches the client.
// ═══════════════════════════════════════════════════════════════════

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ── Rate-limit store ─────────────────────────────────────────────
const ipWindowMs   = 24 * 60 * 60 * 1000;
const ipDailyLimit = 20;
const ipStore      = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  let rec = ipStore.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + ipWindowMs };
    ipStore.set(ip, rec);
  }
  if (rec.count >= ipDailyLimit) return false;
  rec.count++;
  return true;
}

// ── Input validation ─────────────────────────────────────────────
function sanitise(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, maxLen);
}

// ── Deterministic fallback — zero AI cost ────────────────────────
function buildFallback(question, answer) {
  const words        = answer.trim().split(/\s+/).filter(Boolean).length;
  const hasNumbers   = /\d/.test(answer);
  const hasSituation = /when|during|once|situation|time/.test(answer.toLowerCase());
  const hasResult    = /result|outcome|impact|led to|increased|decreased|improved/.test(answer.toLowerCase());

  const structureScore = hasSituation ? 6 : 4;
  const clarityScore   = words >= 80 ? 7 : words >= 40 ? 5 : 3;
  const ownershipScore = /I |my |me /.test(answer) ? 6 : 4;
  const impactScore    = hasNumbers ? 7 : hasResult ? 5 : 3;
  const overall        = Math.round((structureScore + clarityScore + ownershipScore + impactScore) / 4);

  return {
    star_breakdown: {
      situation      : hasSituation ? 'Present — context provided' : 'MISSING',
      task           : 'Unable to assess — manual review recommended',
      action         : words >= 40  ? 'Actions described'          : 'MISSING',
      result         : hasResult    ? 'Outcome mentioned'          : 'MISSING',
      weak_components: [
        !hasSituation && 'Situation',
        !hasResult    && 'Result',
        !hasNumbers   && 'Quantification',
      ].filter(Boolean).join(', ') || 'None identified'
    },
    industry_critique     : 'AI feedback is temporarily unavailable. Review your answer for STAR structure and quantified outcomes.',
    improved_answer       : 'Ensure your answer covers: a specific Situation, your Task, concrete Actions you took, and a measurable Result.',
    interviewer_perspective: 'Automated assessment unavailable — please retry shortly.',
    scores : { structure: structureScore, clarity: clarityScore, ownership: ownershipScore, impact: impactScore },
    overall,
    verdict  : 'Automated feedback temporarily unavailable. Your answer has been recorded.',
    _fallback: true,
  };
}

// ── Main handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Daily limit reached. Please try again tomorrow.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const { question, answer, industry, mode } = body || {};
  const cleanQuestion = sanitise(question, 300);
  const cleanAnswer   = sanitise(answer,   900);
  const cleanIndustry = sanitise(industry, 40);
  const cleanMode     = sanitise(mode,     20);

  if (!cleanQuestion || !cleanAnswer) {
    return res.status(400).json({ error: 'Question and answer are required.' });
  }

  // ── API key guard ────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[mocha] GEMINI_API_KEY not set — returning fallback');
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer));
  }

  // ── Build prompt ─────────────────────────────────────────────────
  const industryMap = {
    consulting : 'consulting — demand structure, personal ownership, quantified impact.',
    banking    : 'finance — demand precision, hard numbers, risk awareness.',
    marketing  : 'general — demand leadership, ownership, adaptive thinking.',
    product    : 'tech — demand clear problem-solving and measurable impact.',
    retail     : 'general — demand leadership, ownership, adaptive thinking.',
    nonprofit  : 'general — demand leadership, ownership, adaptive thinking.',
    healthcare : 'general — demand leadership, ownership, adaptive thinking.',
    finance    : 'finance — demand precision, hard numbers, risk awareness.',
  };
  const industryStd = industryMap[cleanIndustry] || 'general — demand leadership, ownership, adaptive thinking.';

  let prompt;
  if (cleanMode === 'followup') {
    prompt =
      `Mocha Coach — elite behavioral interview coach. Be direct, 2-3 sentences max.\n\n` +
      `Question: ${cleanQuestion}\n` +
      `Candidate follow-up: ${cleanAnswer}\n\n` +
      `Give one concrete, actionable tip. No bullets. No em dashes.`;
  } else {
    prompt =
      `You are a behavioral interview scoring system used by top companies.\n` +
      `Evaluate this answer using STAR + hiring rubrics. Be concise.\n\n` +
      `Industry: ${industryStd}\n` +
      `Question: ${cleanQuestion}\n` +
      `Answer: ${cleanAnswer}\n\n` +
      `Respond ONLY with valid JSON, no markdown:\n` +
      `{"star_breakdown":{"situation":"<present or MISSING>","task":"<clear or MISSING>","action":"<specific actions or MISSING>","result":"<quantified result or MISSING>","weak_components":"<missing parts>"},` +
      `"industry_critique":"<2 sentences: signal to interviewer, key gap with fix>",` +
      `"improved_answer":"<4-5 sentence elite STAR rewrite, prose only, quantify impact>",` +
      `"interviewer_perspective":"<1 sentence: advance or not and why>",` +
      `"scores":{"structure":<1-10>,"clarity":<1-10>,"ownership":<1-10>,"impact":<1-10>},` +
      `"overall":<1-10>,"verdict":"<one direct sentence about this candidate>"}`;
  }

  // ── Call Gemini ──────────────────────────────────────────────────
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 18000);

  let geminiRes;
  try {
    geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method : 'POST',
      signal : controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        contents        : [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer), _timeout: true });
    }
    console.error('[mocha] Gemini fetch error:', err.message);
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer));
  }
  clearTimeout(timeout);

  let data;
  try { data = await geminiRes.json(); } catch {
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer));
  }

  // ── Log the FULL error so we can see it in Vercel logs ───────────
  if (data.error) {
    console.error('[mocha] Gemini error code:', data.error.code);
    console.error('[mocha] Gemini error message:', data.error.message);
    console.error('[mocha] Gemini error status:', data.error.status);
    console.error('[mocha] API key starts with:', apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET');

    // Return fallback instead of erroring — user still gets a score
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer));
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) {
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer));
  }

  if (cleanMode === 'followup') {
    return res.status(200).json({ reply: rawText.trim() });
  }

  const cleaned = rawText.replace(/```json|```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try { parsed = match ? JSON.parse(match[0]) : null; } catch { parsed = null; }
  }

  if (!parsed) {
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer));
  }

  return res.status(200).json(parsed);
}
