// ═══════════════════════════════════════════════════════════════════
// Mocha — /api/interview  v8 — clean direct API, no gateway
// Vercel Pro: 60s max. We target 55s with one retry on timeout.
// Root fix v4→v5: timeout raised 25s→50s (was killing Gemini 2.5 Flash
// which routinely takes 20-40s for full grading responses).
// ═══════════════════════════════════════════════════════════════════

import { createHash } from 'crypto';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── Vercel KV (optional) ─────────────────────────────────────────
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const USE_KV   = !!(KV_URL && KV_TOKEN);
const _memStore = new Map();

async function kvGet(key) {
  if (!USE_KV) return _memStore.get(key) ?? null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const j = await r.json();
    return j.result ?? null;
  } catch { return null; }
}

async function kvSet(key, value, exSeconds) {
  if (!USE_KV) { _memStore.set(key, value); return; }
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(String(value))}?ex=${exSeconds}`, {
      method : 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
  } catch { _memStore.set(key, value); }
}

// ── Rate limiter ─────────────────────────────────────────────────
const IP_DAILY_LIMIT = 25;
const DAY_SECONDS    = 86400;

async function checkRateLimit(ip) {
  const key   = `rl:${ip}:${new Date().toISOString().slice(0, 10)}`;
  const raw   = await kvGet(key);
  const count = parseInt(raw || '0', 10);
  if (count >= IP_DAILY_LIMIT) return false;
  await kvSet(key, count + 1, DAY_SECONDS);
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────
function sanitise(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, maxLen);
}

function sha256(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function requestId() {
  return `mch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function log(level, rid, data) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, rid, ...data }));
}

function estimateTokens(str) {
  return Math.ceil((str || '').length / 4);
}

// ═══════════════════════════════════════════════════════════════════
// RUBRIC PROFILES  v5 (unchanged from v4 — rubrics are solid)
// ═══════════════════════════════════════════════════════════════════
const RUBRICS = {
  consulting: {
    firms    : 'McKinsey, BCG, Bain & Company',
    framework: 'MBB PEI Framework — Personal Impact, Entrepreneurial Drive, Inclusive Leadership',
    shortName: 'MBB PEI',
    citation : 'Scored on McKinsey PEI dimensions: Personal Impact, Entrepreneurial Drive, Inclusive Leadership — the three published MBB evaluation axes.',
    scoreGuide: '9–10 = Immediate PEI pass | 7–8.9 = Strong, likely advances | 5–6.9 = Borderline | 3–4.9 = Would not advance | 1–2.9 = Fails',
    dimensions: {
      structure : 'STAR completeness + logical sequencing (BCG trains interviewers to flag missing Task or Result)',
      clarity   : 'Concise, jargon-free under pressure — BCG values precision over length',
      ownership : 'Personal Impact axis: "I" not "we" — McKinsey explicitly rejects shared-ownership answers',
      impact    : 'Quantified outcomes — BCG/Bain interviewers push back on every vague result',
    },
    coachPrompt: `You are a senior McKinsey PEI interviewer, 600+ sessions. You also train BCG and Bain panels.

MBB PEI — THREE EVALUATION AXES (score each before aggregating):
1. PERSONAL IMPACT — Candidate was the decisive actor. "We" language = immediate deduction. Look for: "I decided / I built / I convinced." Influencing without authority is a McKinsey top signal.
2. ENTREPRENEURIAL DRIVE — Initiative beyond role. Pushed through ambiguity. Created something. Didn't wait to be told.
3. INCLUSIVE LEADERSHIP — Brought others along. Built consensus. Considered stakeholder perspectives. Didn't just execute alone.

STAR COMPLETENESS (BCG axis):
- Missing Task = -1.5 on structure. Missing Result = -2.0. Both missing = structural fail.
- Quantified result required for 7.0+. "Improved performance" = 0 impact points.

SCORE CALIBRATION — be a real McKinsey interviewer, not a supportive coach:
9.0–10.0: Passes PEI today. All three PEI axes hit. Quantified. Unmistakably personal. Genuine insight.
7.0–8.9: Strong. One fixable gap — usually vague result or mild "we" language.
5.0–6.9: Mixed. Story present, personal role unclear or unquantified.
3.0–4.9: Weak. Team-focused, vague, poor structure.
1.0–2.9: Fails. No personal role, no result, no structure.`,
  },
  banking: {
    firms    : 'Goldman Sachs, JPMorgan, Morgan Stanley, Lazard',
    framework: 'IB Competency Model — Technical Judgment, Client Orientation, Execution Under Pressure, Integrity',
    shortName: 'IB Behavioral',
    citation : 'Scored on Goldman Sachs / JPMorgan competency model: Technical Judgment, Client Orientation, Execution Under Pressure, Integrity Signals.',
    scoreGuide: '9–10 = Exceptional, offer-level | 7–8.9 = Strong, advances | 5–6.9 = Average, borderline | 3–4.9 = Below IB standard | 1–2.9 = Would not proceed',
    dimensions: {
      structure : 'STAR with commercial context — GS interviewers dock points for missing deal/business frame',
      clarity   : 'Precision and brevity — JPM values concise high-quality output under time pressure',
      ownership : 'Individual accountability at high stakes — MS scores for personal decisions under pressure',
      impact    : 'Hard numbers — deal size, revenue, savings, basis points. GS rejects vague results reflexively',
    },
    coachPrompt: `You are a Goldman Sachs MD, 400+ analyst/associate interviews. You train JPMorgan and Morgan Stanley panels.

GS/JPM COMPETENCY MODEL — four axes:
1. TECHNICAL JUDGMENT — Sound analytical decisions. Financial/commercial reasoning present.
2. CLIENT ORIENTATION — Every action traced to client or stakeholder outcome.
3. EXECUTION UNDER PRESSURE — 80-100hr weeks. Evidence of sustained high performance.
4. INTEGRITY SIGNALS — Flagged an error, pushed back on a wrong call, maintained standards when costly.

HARD RULES:
- No hard number = maximum 5.0 on impact.
- "We" without "I did specifically" = -1.0 on ownership.
- Missing commercial context = -1.0 on structure.

CALIBRATION:
9.0–10.0: Exceptional. All four competencies hit. Hard numbers. Precise language.
7.0–8.9: Good. Solid story, mostly quantified. Minor vagueness.
5.0–6.9: Average. Story present but lacks numbers or personal contribution unclear.
3.0–4.9: Below standard. Generic.
1.0–2.9: Would not proceed.`,
  },
  product: {
    firms    : 'Google, Meta, Amazon, Apple, Microsoft',
    framework: 'Amazon 16 Leadership Principles + FAANG Bar-Raiser Rubric',
    shortName: 'Amazon LPs / FAANG',
    citation : "Scored against Amazon's 16 Leadership Principles by name. Each answer is mapped to the LPs it demonstrates or misses.",
    scoreGuide: '9–10 = Bar-raiser approved | 7–8.9 = Strong hire | 5–6.9 = Mixed, needs data | 3–4.9 = No hire | 1–2.9 = Fails FAANG rubric',
    dimensions: {
      structure : 'STAR with data-driven narrative — Amazon LP: Deliver Results requires measurable output',
      clarity   : 'Clear communication at scale and under ambiguity — Google values precision for complex systems',
      ownership : 'Bias for Action + Ownership LP — "Leaders never say that\'s not my job"',
      impact    : 'Measurable user/product/business outcomes with scale signal — Meta scores DAU/MAU/revenue impact',
    },
    coachPrompt: `You are an Amazon Bar Raiser and former Google Staff interviewer. 1,000+ behavioral interviews evaluated.

AMAZON LEADERSHIP PRINCIPLES most tested behaviorally:
- Customer Obsession: Every decision traces to customer impact.
- Ownership: Full accountability. No blame-shifting.
- Bias for Action: Acted decisively with incomplete information.
- Dive Deep: Got into data and details.
- Deliver Results: Actually shipped/achieved something measurable.
- Earn Trust: Built credibility with skeptical stakeholders.
- Have Backbone; Disagree and Commit: Pushed back, then committed.
- Invent and Simplify: Found a simpler or novel solution.

GOOGLE/META ADDITIONS:
- Data-driven: "I ran an A/B test with 50k users, saw 12% lift in D7 retention" = full credit.
- Scale signal: Millions of users, large teams, complex systems.
- XFN navigation: Crossed engineering, design, data science, legal, business.

IN YOUR RESPONSE: explicitly name which LPs the answer demonstrates AND which are missing.

CALIBRATION:
9.0–10.0: Bar-raiser approves. Hits 3+ LPs by name. Data-driven. Scale present.
7.0–8.9: Strong hire. Good story with data. May miss one LP or lack scale.
5.0–6.9: Mixed. Has structure but vague data or LPs unclear.
3.0–4.9: No hire. No data, no scale.
1.0–2.9: Fails FAANG rubric.`,
  },
  finance: {
    firms    : 'Blackstone, KKR, Sequoia, Citadel, Bridgewater',
    framework: 'PE/HF Evaluation Rubric — Investment Thesis, Risk ID, Data-Driven Conviction',
    shortName: 'PE / Buy-Side',
    citation : 'Scored on Sequoia/KKR case interview rubric: Investment Thesis Clarity, Risk Identification, Data-Driven Conviction.',
    scoreGuide: '9–10 = Would hire | 7–8.9 = Strong, progresses | 5–6.9 = Adequate, lacks depth | 3–4.9 = Weak analytical layer | 1–2.9 = Does not meet buy-side standard',
    dimensions: {
      structure : 'Investment thesis clarity — clear hypothesis → evidence → conviction',
      clarity   : 'Intellectual precision — says exactly what is meant, no hedging',
      ownership : 'Independent conviction — formed own view, defended it under pressure',
      impact    : 'Quantified with risk awareness — upside AND downside identified',
    },
    coachPrompt: `You are a Citadel Portfolio Manager and former Bridgewater analyst.

SEQUOIA/KKR PE RUBRIC:
1. INVESTMENT THESIS CLARITY — Clear, differentiated hypothesis. Not "I thought it was a good opportunity." Consensus thinking scores 3.0–4.9.
2. RISK IDENTIFICATION — Did they name the bear case? No risk awareness = maximum 5.5.
3. DATA-DRIVEN CONVICTION — IRR, MOIC, Sharpe ratio, basis points, market size, LTV/CAC. "Significant improvement" fails instantly.

CALIBRATION (buy-side bar is extremely high):
9.0–10.0: Would hire. All three PE axes hit, quantified, conviction AND risk awareness.
7.0–8.9: Strong. Good analysis, missing risk depth or precise numbers.
5.0–6.9: Adequate, no independent analytical layer.
3.0–4.9: Execution-focused, no analytical or risk dimension.
1.0–2.9: Does not meet buy-side standard.`,
  },
  marketing: {
    firms    : 'P&G, Unilever, Nike, Airbnb, growth-stage startups',
    framework: 'Brand Strategy & Growth Marketing Framework — Consumer Insight, Strategic Arc, Measurable Growth',
    shortName: 'Brand & Growth',
    citation : 'Scored on P&G brand management framework and Airbnb growth marketing rubric: Consumer Insight, Strategic Clarity, Measurable Growth.',
    scoreGuide: '9–10 = Exceptional marketer | 7–8.9 = Strong, hire signal | 5–6.9 = Activity without strategy | 3–4.9 = Below brand standard | 1–2.9 = No marketing competency',
    dimensions: {
      structure : 'Strategic arc — insight → strategy → execution → result (P&G brand management framework)',
      clarity   : 'Compelling storytelling — marketers must sell their own stories',
      ownership : 'Campaign/strategy ownership — who made the key creative or strategic call',
      impact    : 'Growth metrics — CAC, LTV, conversion, revenue attribution, brand lift',
    },
    coachPrompt: `You are a former P&G Brand Director. You advise growth startups and interview marketing candidates at Nike and Airbnb.

P&G/AIRBNB MARKETING FRAMEWORK:
1. CONSUMER INSIGHT — Start with a human truth. No insight = maximum 6.0 on structure.
2. STRATEGIC ARC — insight → clear strategy → execution → measurable result. Jumping to tactics without strategy = structural deduction.
3. MEASURABLE GROWTH — CAC, LTV, conversion rates, NPS, engagement uplift, revenue attribution. Vague "campaigns" fail.
4. CREATIVE PROBLEM SOLVING — Non-obvious solution.
5. DATA + INTUITION BALANCE — Pure data = analyst. Pure instinct = too risky. Best answers show both.

CALIBRATION:
9.0–10.0: Consumer insight + hard metrics + creative thinking + compelling delivery.
7.0–8.9: Strong execution or metrics, lighter on consumer insight.
5.0–6.9: Activity not strategy.
3.0–4.9: Activity without measurement.
1.0–2.9: No strategic marketing competency.`,
  },
  nonprofit: {
    firms    : 'Gates Foundation, Teach For America, McKinsey.org, UNICEF',
    framework: 'Social Impact Leadership Framework — Mission + Execution, Stakeholder Complexity, Measured Impact',
    shortName: 'Social Impact',
    citation : "Scored on Teach For America's Corps Member selection rubric and Gates Foundation program officer criteria.",
    scoreGuide: '9–10 = Exceptional social leader | 7–8.9 = Strong | 5–6.9 = Mission without delivery | 3–4.9 = Passion without evidence | 1–2.9 = Fails',
    dimensions: {
      structure : 'Mission-to-impact narrative with stakeholder complexity',
      clarity   : 'Accessible communication across diverse audiences',
      ownership : 'Personal accountability for social outcomes',
      impact    : 'Measured social impact — lives, communities, policy changed, funds raised',
    },
    coachPrompt: `You are a TFA selection interviewer and former Gates Foundation program officer.

TFA/GATES FRAMEWORK:
1. MISSION + EXECUTION BALANCE — TFA rejects passion without delivery. BOTH conviction AND results required. "I care deeply" without evidence = 3.0–4.9.
2. STAKEHOLDER COMPLEXITY — Donors, beneficiaries, governments, communities, boards simultaneously.
3. RESOURCE CONSTRAINTS — Gates looks for "more with less."
4. SYSTEMS THINKING — Root causes, not symptoms. Policy change > individual outcomes.
5. MEASURED SOCIAL IMPACT — Lives improved, students progressed, funds raised, policy changed.

CALIBRATION:
9.0–10.0: Mission conviction + rigorous execution + measurable impact + systems thinking.
7.0–8.9: Strong mission and delivery, lighter on systemic thinking.
5.0–6.9: Mission alignment but vague on outcomes.
3.0–4.9: All passion, no evidence.
1.0–2.9: Does not demonstrate social leadership.`,
  },
  healthcare: {
    firms    : 'Johnson & Johnson, McKinsey Health, NHS, health-tech startups',
    framework: 'Healthcare Leadership Framework — Patient Centricity, Evidence-Based, Regulatory Awareness',
    shortName: 'Healthcare',
    citation : "Scored on J&J Credo-based leadership standards and McKinsey Health practice criteria.",
    scoreGuide: '9–10 = Outstanding healthcare leader | 7–8.9 = Strong | 5–6.9 = Competent but generic | 3–4.9 = No healthcare framing | 1–2.9 = Fails',
    dimensions: {
      structure : 'Clinical/operational STAR with ethical grounding',
      clarity   : 'Cross-disciplinary communication — clinical and non-clinical audiences',
      ownership : 'Patient outcome accountability and ethical decision-making',
      impact    : 'Evidence-based outcomes — patient metrics, safety events, efficiency gains',
    },
    coachPrompt: `You are a J&J senior HR leader and former NHS management consultant.

J&J/McKINSEY HEALTH FRAMEWORK:
1. PATIENT CENTRICITY — J&J Credo: patients first. Every decision must connect to patient outcomes.
2. REGULATORY & ETHICAL AWARENESS — HIPAA, GDPR, ethics committees, clinical governance. Missing = -1.0 on ownership.
3. CROSS-DISCIPLINARY COLLABORATION — Clinicians, regulators, engineers, patients, administrators simultaneously.
4. EVIDENCE-BASED THINKING — Claims must be supported by data or clinical evidence.
5. RESILIENCE UNDER HIGH STAKES — Healthcare errors have real consequences.

CALIBRATION:
9.0–10.0: Patient-centric, evidence-based, regulatory awareness, cross-functional.
7.0–8.9: Strong skills, missing patient impact or regulatory dimension.
5.0–6.9: Competent execution, no healthcare-specific framing.
3.0–4.9: Generic — could apply to any industry.
1.0–2.9: No healthcare leadership competency.`,
  },
  retail: {
    firms    : 'Amazon Retail, LVMH, Zara, Walmart, fast-growth DTC',
    framework: 'Retail & Consumer Operations Framework — Commercial Acumen, Customer Obsession, Data-Driven Ops',
    shortName: 'Retail & DTC',
    citation : "Scored on Amazon Retail's operational leadership criteria and LVMH brand management standards.",
    scoreGuide: '9–10 = Exceptional | 7–8.9 = Strong commercial | 5–6.9 = Activity without commercial layer | 3–4.9 = Below standard | 1–2.9 = No competency',
    dimensions: {
      structure : 'Commercial STAR with customer + margin awareness',
      clarity   : 'Speed and decisiveness',
      ownership : 'P&L or category ownership — individual accountability',
      impact    : 'Commercial metrics — conversion, NPS, margin, shrinkage, units',
    },
    coachPrompt: `You are an Amazon Retail principal and former LVMH commercial director.

RETAIL/DTC FRAMEWORK:
1. CUSTOMER OBSESSION + COMMERCIAL REALITY — Balance customer experience WITH commercial discipline (margin, inventory turns, conversion).
2. SPEED OF EXECUTION — Bias for action + rapid iteration without sacrificing quality.
3. DATA-DRIVEN OPS — Units, conversion, shrinkage, NPS, basket size, attach rate.
4. TEAM LEADERSHIP AT SCALE — Large, diverse, shift-based teams.
5. SUPPLY CHAIN AWARENESS — Walmart/Amazon value candidates who see the full supply chain.

CALIBRATION:
9.0–10.0: Commercial, customer-centric, data-driven, operational and team scale.
7.0–8.9: Strong commercial instinct, lighter on data or supply chain.
5.0–6.9: Describes activity, not commercial impact.
3.0–4.9: Customer-focused but no commercial/data layer.
1.0–2.9: Does not meet retail standard.`,
  },
};

RUBRICS.general = RUBRICS.retail;

// ═══════════════════════════════════════════════════════════════════
// SMART FALLBACK — runs when Gemini unavailable or answer too short
// ═══════════════════════════════════════════════════════════════════
function buildFallback(question, answer, industry, rid) {
  const words        = answer.trim().split(/\s+/).filter(Boolean).length;
  const hasNumbers   = /\d/.test(answer);
  const hasSituation = /when|during|once|situation|time|context|background/i.test(answer);
  const hasTask      = /need|had to|responsible|goal|objective|challenge|tasked/i.test(answer);
  const hasAction    = /\bI\b.{0,25}(decided|chose|built|created|led|managed|ran|implemented|designed|drove|launched|negotiated|presented|recommended|persuaded|reduced|increased|hired|closed|pitched|wrote|shipped)/i.test(answer);
  const hasResult    = /result|outcome|impact|led to|increased|decreased|improved|achieved|delivered|saved|grew|reduced|reached|hit|exceeded|raised/i.test(answer);
  const hasInsight   = /learned|realized|realised|takeaway|lesson|retrospect|would have|next time|in future/i.test(answer);
  const hasOwnership = /\bI\b/.test(answer);

  const sScore = parseFloat(((hasSituation?2.2:0)+(hasTask?2.2:0)+(hasAction?2.2:0)+(hasResult?2.2:0)+(words>=80?1.2:words>=50?0.8:words>=30?0.4:0)).toFixed(1));
  const cScore = parseFloat((words>=120?7.8:words>=80?6.5:words>=50?5.2:words>=30?3.8:2.0).toFixed(1));
  const oScore = parseFloat((!hasOwnership?2.5:hasAction?(hasInsight?7.2:6.3):5.0).toFixed(1));
  const iScore = parseFloat((hasNumbers?7.2:hasResult?5.5:3.0).toFixed(1));
  const overall = parseFloat(Math.min(((sScore+cScore+oScore+iScore)/4), 9.6).toFixed(1));
  const rubric  = RUBRICS[industry] || RUBRICS.consulting;
  const share_line = `I scored ${overall}/10 on a ${rubric.shortName} question. ${!hasNumbers ? 'Adding hard numbers is my next fix.' : !hasAction ? 'Ownership language is my gap.' : 'Working on it with Mocha.'} usemocha.app`;

  return {
    _fallback     : true,
    _rid          : rid,
    overall,
    verdict       : `${overall}/10 against ${rubric.shortName}. ${hasNumbers ? 'Numbers present — good foundation.' : 'Add one hard number to lift this score significantly.'}`,
    interviewer_verdict: overall >= 7.5 ? 'Would advance to next round' : overall >= 5.5 ? 'On the fence' : 'Would not advance',
    share_line,
    scores        : { structure: Math.min(sScore,10), clarity: Math.min(cScore,10), ownership: Math.min(oScore,10), impact: Math.min(iScore,10) },
    star_breakdown: {
      situation: hasSituation ? 'Present — add when/where for stronger context.' : 'MISSING — open with: "In [month/year] at [company], we faced [specific challenge]."',
      task      : hasTask      ? 'Present — make your personal responsibility explicit in one sentence.' : 'MISSING — add: "My specific responsibility was to [personal goal]."',
      action    : hasAction    ? 'Present — add one more concrete step you took personally.' : 'MISSING — use "I decided / I built / I led" not "we."',
      result    : hasResult    ? (hasNumbers ? 'Strong — quantified outcome present.' : 'Present but vague — add a specific %, $ amount, or named metric.') : 'MISSING — close with: "This resulted in [X]% improvement / $[Y] saved / [Z] people impacted."',
      weak_components: [!hasSituation&&'Situation context', !hasTask&&'Personal responsibility', !hasAction&&'I-language actions', !hasResult&&'Quantified result', !hasNumbers&&'Hard numbers', !hasInsight&&'Reflection sentence'].filter(Boolean).join(', ') || 'Structure is solid — focus on quantification.',
    },
    industry_critique      : `${rubric.framework}: your answer ${overall>=6.5?'shows solid STAR structure':'is missing key STAR components'}. ${hasNumbers?'Quantified result present — good.': rubric.firms+' interviewers push back on every vague result. Add one hard number.'}`,
    improved_answer        : `To meet ${rubric.firms} standard: Open with "[Month/Year], [Company/context], [Situation]." State your personal responsibility. Describe 2-3 concrete actions YOU took. Close with a quantified result. End with one genuine reflection.`,
    interviewer_perspective: `Structural score ${overall}/10 against ${rubric.shortName}. ${overall>=7.5?'Solid — quantify the result and this advances.':overall>=5.5?'Partial structure — address weak components above.':'Significant gaps — would not advance at '+rubric.firms+' in current form.'}`,
    framework_used: rubric.framework,
    firms_standard: rubric.firms,
    citation      : rubric.citation,
  };
}

function buildLite(question, answer, industry, rid) {
  const fb = buildFallback(question, answer, industry, rid);
  return { ...fb, _lite: true };
}

// ═══════════════════════════════════════════════════════════════════
// GEMINI CALL — with retry on first timeout
// KEY FIX: timeout raised from 25s → 50s.
// Gemini 2.5 Flash grading responses regularly take 20–40s.
// The old 25s timeout was silently killing real AI responses
// and returning fallback every time, making it look like it worked
// (200 status) but giving structural-only scores.
// ═══════════════════════════════════════════════════════════════════
async function callGemini(prompt, rid, attempt = 1) {
  const controller = new AbortController();
  // 50s — leaves 10s buffer within Vercel Pro 60s limit
  const timeout = setTimeout(() => controller.abort(), 50000);

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method : 'POST',
      signal : controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        contents        : [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature    : 0.40,
          maxOutputTokens: 8000,
          topP           : 0.8,
        },
        // thinkingConfig removed — not supported by gemini-2.5-flash
      }),
    });
    clearTimeout(timeout);
    return { res, timedOut: false };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      log('warn', rid, { event: 'gemini_timeout', attempt });
      // One retry on timeout — Gemini 2.5 Flash cold starts can be slow
      if (attempt === 1) {
        log('info', rid, { event: 'retry', attempt: 2 });
        return callGemini(prompt, rid, 2);
      }
      return { res: null, timedOut: true };
    }
    log('error', rid, { event: 'gemini_fetch_error', message: err.message });
    return { res: null, timedOut: false, networkError: true };
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  const rid = requestId();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Request-Id', rid);

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', _rid: rid });
    return;
  }

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    log('warn', rid, { event: 'rate_limited', ip_prefix: ip.slice(0, 8) });
    return res.status(429).json({ error: 'Daily limit reached. Come back tomorrow.', _rid: rid });
  }

  // Parse body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.', _rid: rid });
  }

  const { question, answer, industry, mode } = body || {};
  const cleanQuestion = sanitise(question, 350);
  const cleanAnswer   = sanitise(answer,   1000);
  const cleanIndustry = sanitise(industry, 40);
  const cleanMode     = sanitise(mode,     20);

  if (!cleanQuestion || !cleanAnswer) {
    return res.status(400).json({ error: 'question and answer are required.', _rid: rid });
  }

  const wordCount = cleanAnswer.trim().split(/\s+/).filter(Boolean).length;

  log('info', rid, { event: 'request', industry: cleanIndustry, mode: cleanMode || 'grade', words: wordCount, kv: USE_KV });

  // Lite mode — under 50 words
  if (wordCount < 50 && cleanMode !== 'followup') {
    log('info', rid, { event: 'lite_mode', words: wordCount });
    return res.status(200).json(buildLite(cleanQuestion, cleanAnswer, cleanIndustry, rid));
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log('warn', rid, { event: 'no_api_key' });
    return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid), _rid: rid });
  }

  const rubric = RUBRICS[cleanIndustry] || RUBRICS.consulting;

  // ── Build prompt ────────────────────────────────────────────────
  let prompt;

  if (cleanMode === 'followup') {
    prompt = [
      `You are Mocha Coach — elite behavioral interview coach trained on ${rubric.firms} standards.`,
      `Framework: ${rubric.framework}. Be direct, specific, warm. 2-3 sentences max. No bullets.`,
      `Reference the firm standard by name.`,
      ``,
      `Question: ${cleanQuestion}`,
      `Follow-up: ${cleanAnswer}`,
      ``,
      `ONE concrete coaching tip starting with what they should do (not what they did wrong).`,
    ].join('\n');

  } else {
    let trackExtra = '';
    if (cleanIndustry === 'product' || cleanIndustry === 'tech') {
      trackExtra = `\nIn the industry_critique field, explicitly name which Amazon Leadership Principles this answer demonstrates and which are missing.\n`;
    } else if (cleanIndustry === 'consulting') {
      trackExtra = `\nIn the industry_critique field, score each MBB PEI axis separately: Personal Impact (x/10), Entrepreneurial Drive (x/10), Inclusive Leadership (x/10), then aggregate.\n`;
    } else if (cleanIndustry === 'banking') {
      trackExtra = `\nIn the industry_critique field, note evidence (or absence) for each IB competency: Technical Judgment, Client Orientation, Execution Under Pressure, Integrity Signals.\n`;
    } else if (cleanIndustry === 'finance') {
      trackExtra = `\nIn the industry_critique field, score each PE axis: Investment Thesis Clarity (x/10), Risk Identification (x/10), Data-Driven Conviction (x/10).\n`;
    }

    prompt = [
      rubric.coachPrompt,
      trackExtra,
      `---`,
      `QUESTION: ${cleanQuestion}`,
      `ANSWER (${wordCount} words): ${cleanAnswer}`,
      `---`,
      ``,
      `Score rigorously. Dimensions:`,
      `structure: ${rubric.dimensions.structure}`,
      `clarity: ${rubric.dimensions.clarity}`,
      `ownership: ${rubric.dimensions.ownership}`,
      `impact: ${rubric.dimensions.impact}`,
      ``,
      `Rules: ALWAYS use exactly ONE decimal place (6.4 not 6, 7.0 not 7). Be a rigorous ${rubric.firms} interviewer — most first attempts score 4.5–6.5. 8.0+ only if genuinely impressive. Calibration: ${rubric.scoreGuide}. RICHNESS: Every text field must be substantive and specific — name the exact framework dimension, quote the firm's standard, give concrete examples. A terse response is a bad response. The user is paying for expert coaching.`,
      `CRITICAL: The improved_answer field must be the ACTUAL REWRITTEN ANSWER written as if you are the candidate speaking — real prose, first person, no placeholders like [Company] or [Month/Year], no instructions, no template language. If their answer is short or weak, INVENT realistic but plausible specifics (a company type, a number, a role) to write a complete, compelling answer. 5-7 fluent sentences. Start with "During my..." or "In [Year]..." — actual words a candidate would say out loud in an interview. This is the most important field.`,
      ``,
      `LENGTH REQUIREMENT: Every text field must be substantive. verdict = minimum 4 sentences. industry_critique = minimum 4 sentences. improved_answer = minimum 150 words. star_breakdown fields = specific coaching sentences not just labels. Short responses are wrong responses.`,
      `Respond ONLY with valid JSON, no markdown fences — but make every string field LONG and SPECIFIC:
{"star_breakdown":{"situation":"<present/MISSING — if present: rate strength (strong/weak), name what context was given, then give the exact sentence they should add to strengthen it; if MISSING: write the exact opening sentence they should use>","task":"<clear/unclear/MISSING — state whether their specific responsibility was explicit, then write the exact sentence they should add to clarify their personal ownership>","action":"<I-language present/absent — exact actions taken + what specific I-statement to add or strengthen>","result":"<quantified/vague/MISSING — specific number or outcome present? + exact improvement or example result to add>","weak_components":"<comma-separated list of the 1-3 weakest STAR components>","strengths":"<comma-separated list of 2-4 genuine strengths — specific, e.g. 'Quantified result', 'Strong I-language', 'Clear situation', 'Commercial insight'>"},"industry_critique":"<4+ sentences grading against ${rubric.framework}: What was strong? Which dimension cost most points and why? What do 9.0+ answers at ${rubric.firms} always include? Give one specific coaching instruction starting with a verb.>","improved_answer":"REWRITE_PLACEHOLDER","interviewer_perspective":"<1 sentence — yes/borderline/no at ${rubric.firms} + main reason>","interviewer_verdict":"<'Would advance to next round' OR 'On the fence' OR 'Would not advance'>","scores":{"structure":x.x,"clarity":x.x,"ownership":x.x,"impact":x.x},"overall":x.x,"verdict":"<4+ sentences: Does this meet ${rubric.firms} standard? Name the exact gap. Give the specific fix with example wording. What do top ${rubric.firms} answers always include that this missed?>","share_line":"<one punchy sentence the user can share — score + gap + mocha — e.g. 'I scored 7.8/10 on a McKinsey PEI question. Ownership was my gap. Fixing it with Mocha.'>","next_question":"<one follow-up the interviewer asks based on answer gaps>","framework_used":"${rubric.framework}","firms_standard":"${rubric.firms}","citation":"${rubric.citation}"}`,
    ].join('\n');
  }

  const estInputTokens = estimateTokens(prompt);
  log('info', rid, { event: 'gemini_call', est_input_tokens: estInputTokens });

  // ── Call Gemini with retry ───────────────────────────────────────
  const { res: geminiRes, timedOut, networkError } = await callGemini(prompt, rid);

  if (timedOut || networkError || !geminiRes) {
    return res.status(200).json({
      ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid),
      _timeout: timedOut,
      _rid: rid,
    });
  }

  let data;
  try {
    data = await geminiRes.json();
  } catch {
    log('error', rid, { event: 'json_parse_error' });
    return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid), _rid: rid });
  }

  if (data.error) {
    const code = data.error.code || 0;
    const msg  = data.error.message || '';
    log('warn', rid, { event: 'gemini_error', code, msg: msg.slice(0, 200) });
    const isQuota = code === 429 || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    return res.status(200).json({
      ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid),
      _quota_hit: isQuota,
      _rid: rid,
    });
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) {
    log('warn', rid, { event: 'empty_response' });
    return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid), _rid: rid });
  }

  if (cleanMode === 'followup') {
    log('info', rid, { event: 'done_followup' });
    return res.status(200).json({ reply: rawText.trim(), _rid: rid });
  }

  // ── Parse JSON ───────────────────────────────────────────────────
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  let parsed;
  // Robust JSON parse — handles newlines and special chars in string values
  function robustParse(str) {
    // First try direct parse
    try { return JSON.parse(str); } catch {}
    // Normalize newlines inside strings: replace literal newlines within JSON strings
    try {
      const normalized = str.replace(/:\s*"((?:[^"\\]|\\[\s\S])*?)"/gs, (m, inner) => {
        return ': "' + inner.replace(/\n/g, '\\n').replace(/\r/g, '') + '"';
      });
      return JSON.parse(normalized);
    } catch {}
    // Extract outermost {} and try
    const match = str.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch {}
    // Last resort: truncate to last known-good key
    const keys = [',"overall"', ',"verdict"', ',"scores"'];
    for (const key of keys) {
      const pos = match[0].lastIndexOf(key);
      if (pos > 0) {
        try { return JSON.parse(match[0].slice(0, pos) + '}'); } catch {}
      }
    }
    return null;
  }
  parsed = robustParse(cleaned);

  if (!parsed) {
    log('warn', rid, { event: 'json_extract_failed', raw_head: rawText.slice(0, 100) });
    return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid), _rid: rid });
  }

  // ── Sanitise scores ──────────────────────────────────────────────
  if (parsed.scores) {
    ['structure', 'clarity', 'ownership', 'impact'].forEach(k => {
      if (parsed.scores[k] !== undefined) {
        parsed.scores[k] = Math.min(10, Math.max(1, parseFloat(parseFloat(parsed.scores[k]).toFixed(1))));
      }
    });
  }
  if (parsed.overall !== undefined) {
    parsed.overall = Math.min(10, Math.max(1, parseFloat(parseFloat(parsed.overall).toFixed(1))));
  }

  // Overall must not drift >1.5 from dimension average
  if (parsed.scores && parsed.overall) {
    const { structure = 5, clarity = 5, ownership = 5, impact = 5 } = parsed.scores;
    const dimAvg = parseFloat(((structure + clarity + ownership + impact) / 4).toFixed(1));
    if (Math.abs(parsed.overall - dimAvg) > 1.5) {
      parsed.overall = parseFloat(((parsed.overall + dimAvg) / 2).toFixed(1));
    }
  }

  // Normalise interviewer_verdict
  const validVerdicts = ['Would advance to next round', 'On the fence', 'Would not advance'];
  if (!validVerdicts.includes(parsed.interviewer_verdict)) {
    const score = parsed.overall || 0;
    parsed.interviewer_verdict = score >= 7.5 ? 'Would advance to next round' : score >= 5.5 ? 'On the fence' : 'Would not advance';
  }

  if (!parsed.share_line) {
    const score = parsed.overall || 0;
    parsed.share_line = `I scored ${score}/10 on a ${rubric.shortName} question with Mocha. usemocha.app`;
  }

  parsed.framework_used = parsed.framework_used || rubric.framework;
  parsed.firms_standard = parsed.firms_standard || rubric.firms;
  parsed.citation       = parsed.citation       || rubric.citation;
  parsed._rid           = rid;

  const outputTokens = data.usageMetadata?.candidatesTokenCount || estimateTokens(rawText);
  const inputTokens  = data.usageMetadata?.promptTokenCount     || estInputTokens;
  log('info', rid, { event: 'done', score: parsed.overall, verdict: parsed.interviewer_verdict, input_tokens: inputTokens, output_tokens: outputTokens });

  // ── Separate rewrite call — simple, isolated, no JSON ──────────
  try {
    const rwPrompt = 'You are a ' + rubric.shortName + ' interviewer. The candidate answered this question:\n\nQUESTION: ' + cleanQuestion + '\n\nCANDIDATE ANSWER: ' + cleanAnswer + '\n\nRewrite their answer as a model ' + rubric.firms + ' response. Write it in first person as if you are the candidate speaking in an interview. Use their details where possible; invent realistic specifics where missing. Write 5-6 complete sentences: situation with specific context, your personal responsibility, 2-3 concrete actions using I-language, a quantified result, one reflection. No brackets. No instructions. Just the answer starting with During my or In my role. Minimum 100 words.';

    const rwBody = JSON.stringify({
      contents: [{ parts: [{ text: rwPrompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
    });

    const rwController = new AbortController();
    const rwTimeout = setTimeout(() => rwController.abort(), 25000);
    const rwEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY;
    const rwRes = await fetch(rwEndpoint,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: rwBody, signal: rwController.signal }
    );
    clearTimeout(rwTimeout);
    if (rwRes.ok) {
      const rwData = await rwRes.json();
      const rwText = (rwData.candidates && rwData.candidates[0] && rwData.candidates[0].content && rwData.candidates[0].content.parts && rwData.candidates[0].content.parts[0] && rwData.candidates[0].content.parts[0].text) ? rwData.candidates[0].content.parts[0].text.trim() : '';
      if (rwText && rwText.length > 50) {
        parsed.improved_answer = rwText;
      }
    }
  } catch (e) {
    // rewrite failed silently
  }

  return res.status(200).json(parsed);
}
