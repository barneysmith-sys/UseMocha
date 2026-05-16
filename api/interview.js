// ═══════════════════════════════════════════════════════════════════
// Mocha — /api/interview  v4
// Vercel serverless. Key never touches the client.
// Vercel Hobby: 10s max execution. Vercel Pro: 60s.
// We target 9s to stay safely under Hobby limit.
// ═══════════════════════════════════════════════════════════════════

import { createHash } from 'crypto';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── Vercel KV (optional) ─────────────────────────────────────────
// If KV_REST_API_URL + KV_REST_API_TOKEN env vars are present,
// rate limits persist across cold starts. Otherwise degrades to
// in-memory Map (resets on cold start — acceptable for free tier).
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const USE_KV   = !!(KV_URL && KV_TOKEN);

// In-memory fallback store
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
  const key = `rl:${ip}:${new Date().toISOString().slice(0, 10)}`; // resets at UTC midnight
  const raw = await kvGet(key);
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

function cacheKey(question, answer) {
  return sha256((question + '|' + answer).slice(0, 200));
}

function requestId() {
  return `mch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// Structured JSON logger — queryable in Vercel log drains
function log(level, rid, data) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, rid, ...data }));
}

function estimateTokens(str) {
  return Math.ceil((str || '').length / 4);
}

// ═══════════════════════════════════════════════════════════════════
// RUBRIC PROFILES  v4
// Each prompt is compressed for token efficiency while preserving
// all scoring signal. Filler removed; every sentence scores.
// ═══════════════════════════════════════════════════════════════════
const RUBRICS = {

  // ── 1. CONSULTING ───────────────────────────────────────────────
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
    // MBB PEI has 3 named dimensions scored separately before aggregation
    peiDimensions: {
      personal_impact      : 'Was the candidate the decisive actor? Led without formal authority? Directly caused the outcome?',
      entrepreneurial_drive: 'Did they show initiative beyond their role? Push through ambiguity? Create something new?',
      inclusive_leadership : 'Did they bring others along, build consensus, or consider stakeholder perspectives?',
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

  // ── 2. BANKING ──────────────────────────────────────────────────
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
    ibCompetencies: {
      technical_judgment    : 'Did they make sound analytical decisions? Show financial/commercial reasoning?',
      client_orientation    : 'Did they prioritise the client or stakeholder outcome, not just internal metrics?',
      execution_under_pressure: 'Evidence of sustained high performance under 80-100hr/week conditions?',
      integrity_signals     : 'Did they flag an error, push back on a wrong call, or maintain standards under pressure?',
    },
    coachPrompt: `You are a Goldman Sachs MD, 400+ analyst/associate interviews. You train JPMorgan and Morgan Stanley panels.

GS/JPM COMPETENCY MODEL — four axes:
1. TECHNICAL JUDGMENT — Sound analytical decisions. Financial/commercial reasoning present. "I ran the numbers and concluded..." scores. "I thought it seemed right" scores nothing.
2. CLIENT ORIENTATION — Every action traced to client or stakeholder outcome. IB is a client service business. Self-serving answers score lower.
3. EXECUTION UNDER PRESSURE — 80-100hr weeks. GS explicitly tests for sustained high performance without quality degradation. Vague "worked hard" = 0 points.
4. INTEGRITY SIGNALS — Flagged an error, pushed back on a wrong call, maintained standards when it was costly. This axis separates good analysts from great bankers.

HARD RULES:
- No hard number = maximum 5.0 on impact. Revenue, deal size, basis points, % improvement, time saved.
- "We" without "I did specifically" = -1.0 on ownership.
- Missing commercial context (what was the business/client implication?) = -1.0 on structure.

CALIBRATION:
9.0–10.0: Exceptional. All four competencies hit. Hard numbers. Precise language. Resilience demonstrated.
7.0–8.9: Good. Solid story, mostly quantified. Minor vagueness.
5.0–6.9: Average. Story present but lacks numbers or personal contribution unclear.
3.0–4.9: Below standard. Generic.
1.0–2.9: Would not proceed.`,
  },

  // ── 3. TECH / PM ────────────────────────────────────────────────
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
    // All 16 Amazon LPs — the feedback will flag which are hit/missed
    amazonLPs: [
      'Customer Obsession', 'Ownership', 'Invent and Simplify', 'Are Right, A Lot',
      'Learn and Be Curious', 'Hire and Develop the Best', 'Insist on the Highest Standards',
      'Think Big', 'Bias for Action', 'Frugality', 'Earn Trust', 'Dive Deep',
      'Have Backbone; Disagree and Commit', 'Deliver Results', 'Strive to be Earth\'s Best Employer',
      'Success and Scale Bring Broad Responsibility',
    ],
    coachPrompt: `You are an Amazon Bar Raiser and former Google Staff interviewer. 1,000+ behavioral interviews evaluated.

AMAZON 16 LEADERSHIP PRINCIPLES — the ones most tested behaviorally:
- Customer Obsession: Every decision traces to customer impact. "Users" or "customers" must appear.
- Ownership: "Never say that's not my job." Full accountability. No blame-shifting.
- Bias for Action: Acted decisively with incomplete information. Speed matters.
- Dive Deep: Got into data and details. Didn't just set strategy and walk away.
- Deliver Results: Actually shipped/achieved something measurable. Not "worked toward."
- Earn Trust: Worked cross-functionally. Built credibility with skeptical stakeholders.
- Have Backbone; Disagree and Commit: Pushed back, then committed once decided.
- Invent and Simplify: Found a simpler or novel solution.

GOOGLE/META ADDITIONS:
- Data-driven: "I thought it would work" = 0. "I ran an A/B test with 50k users, saw 12% lift in D7 retention" = full credit.
- Scale signal: Millions of users, large teams, complex systems. Small-scale answers score lower at Staff+ level.
- XFN navigation: Crossed engineering, design, data science, legal, business.

IN YOUR RESPONSE: explicitly name which LPs the answer demonstrates AND which are missing. This is the most useful feedback for Amazon candidates.

CALIBRATION:
9.0–10.0: Bar-raiser approves. Hits 3+ LPs by name. Data-driven. Scale present. Unmistakable ownership.
7.0–8.9: Strong hire. Good story with data. May miss one LP or lack scale.
5.0–6.9: Mixed. Has structure but vague data, LPs unclear, or user impact missing.
3.0–4.9: No hire. No data, no scale, "we did" throughout.
1.0–2.9: Fails FAANG rubric.`,
  },

  // ── 4. PRIVATE EQUITY ───────────────────────────────────────────
  finance: {
    firms    : 'Blackstone, KKR, Sequoia, Citadel, Bridgewater',
    framework: 'PE/HF Evaluation Rubric — Investment Thesis, Risk ID, Data-Driven Conviction',
    shortName: 'PE / Buy-Side',
    citation : 'Scored on Sequoia/KKR case interview rubric: Investment Thesis Clarity, Risk Identification, Data-Driven Conviction — the axes used in PE and HF behavioral screens.',
    scoreGuide: '9–10 = Would hire | 7–8.9 = Strong, progresses | 5–6.9 = Adequate, lacks depth | 3–4.9 = Weak analytical layer | 1–2.9 = Does not meet buy-side standard',
    dimensions: {
      structure : 'Investment thesis clarity — clear hypothesis → evidence → conviction (Sequoia/KKR rubric)',
      clarity   : 'Intellectual precision — says exactly what is meant, no hedging (Citadel standard)',
      ownership : 'Independent conviction — formed own view, defended it under pressure (KKR)',
      impact    : 'Quantified with risk awareness — upside AND downside identified (Blackstone)',
    },
    peAxes: {
      investment_thesis : 'Is there a clear hypothesis? Is it differentiated from consensus?',
      risk_identification: 'Did they identify the key risks and explain mitigation?',
      data_driven_conviction: 'Is the conviction backed by numbers, not instinct alone?',
    },
    coachPrompt: `You are a Citadel Portfolio Manager and former Bridgewater analyst. You interview PE and HF candidates.

SEQUOIA/KKR PE RUBRIC — three evaluation axes:
1. INVESTMENT THESIS CLARITY — Is there a clear, differentiated hypothesis? Not "I thought it was a good opportunity" but "The market was mispricing X because of Y, and I saw a 3x return path through Z." Consensus thinking scores 3.0–4.9.
2. RISK IDENTIFICATION — Did they name the bear case? Bridgewater interviewers specifically test whether candidates have stress-tested their thinking. "It could have gone wrong if..." scores points. No risk awareness = maximum 5.5.
3. DATA-DRIVEN CONVICTION — Numbers that matter: IRR, MOIC, Sharpe ratio, basis points, market size, churn rate, LTV/CAC. "Significant improvement" fails instantly. Independent conviction defended under pushback is the signal that separates hired from rejected.

ADDITIONAL AXES:
- First-principles thinking (Citadel): Did they decompose the problem, or just describe what happened?
- Intellectual curiosity: Genuine depth of analysis, not just execution.

CALIBRATION (buy-side bar is extremely high):
9.0–10.0: Would hire. Analytically rigorous, all three PE axes hit, quantified, shows conviction AND risk awareness.
7.0–8.9: Strong. Good analysis, missing risk depth or lacking precise numbers.
5.0–6.9: Adequate, no independent analytical layer.
3.0–4.9: Execution-focused, no analytical or risk dimension.
1.0–2.9: Does not meet buy-side standard.`,
  },

  // ── 5. MARKETING ────────────────────────────────────────────────
  marketing: {
    firms    : 'P&G, Unilever, Nike, Airbnb, growth-stage startups',
    framework: 'Brand Strategy & Growth Marketing Framework — Consumer Insight, Strategic Arc, Measurable Growth',
    shortName: 'Brand & Growth',
    citation : 'Scored on P&G brand management framework and Airbnb growth marketing rubric: Consumer Insight, Strategic Clarity, Measurable Growth, Data + Intuition Balance.',
    scoreGuide: '9–10 = Exceptional marketer | 7–8.9 = Strong, hire signal | 5–6.9 = Activity without strategy | 3–4.9 = Below brand standard | 1–2.9 = No marketing competency',
    dimensions: {
      structure : 'Strategic arc — insight → strategy → execution → result (P&G brand management framework)',
      clarity   : 'Compelling storytelling — marketers must sell their own stories (Nike brand voice)',
      ownership : 'Campaign/strategy ownership — who made the key creative or strategic call (Unilever)',
      impact    : 'Growth metrics — CAC, LTV, conversion, revenue attribution, brand lift (Airbnb standard)',
    },
    coachPrompt: `You are a former P&G Brand Director. You advise growth startups and interview marketing candidates at Nike and Airbnb.

P&G/AIRBNB MARKETING FRAMEWORK:
1. CONSUMER INSIGHT — P&G trains brand managers to start with a human truth, not a business problem. "Customers weren't buying because..." > "We needed to grow revenue." No insight = maximum 6.0 on structure.
2. STRATEGIC ARC — Unilever interviewers score: insight → clear strategy → execution → measurable result. Jumping straight to tactics without strategy = structural deduction.
3. MEASURABLE GROWTH — CAC, LTV, conversion rates, NPS, engagement uplift, revenue attribution. Nike tracks brand heat. Airbnb tracks booking conversion. Vague "campaigns" fail at all these firms.
4. CREATIVE PROBLEM SOLVING — Non-obvious solution. Best marketers see angles others miss.
5. DATA + INTUITION BALANCE — Pure data = analyst (not marketer). Pure instinct = too risky. Best answers show both.

VOICE NOTE: The improved_answer for this track should sound like a sharp brand director telling a story — vivid, confident, metrics-grounded, not corporate.

CALIBRATION:
9.0–10.0: Consumer insight + hard metrics + creative thinking + compelling delivery.
7.0–8.9: Strong execution or metrics, lighter on consumer insight.
5.0–6.9: Activity not strategy — missing the "why."
3.0–4.9: Activity without measurement or rationale.
1.0–2.9: No strategic marketing competency.`,
  },

  // ── 6. NONPROFIT / SOCIAL IMPACT ────────────────────────────────
  nonprofit: {
    firms    : 'Gates Foundation, Teach For America, McKinsey.org, UNICEF',
    framework: 'Social Impact Leadership Framework — Mission + Execution, Stakeholder Complexity, Measured Impact',
    shortName: 'Social Impact',
    citation : "Scored on Teach For America's Corps Member selection rubric and Gates Foundation program officer criteria: Mission-Execution Balance, Stakeholder Navigation, Measured Social Impact.",
    scoreGuide: '9–10 = Exceptional social leader | 7–8.9 = Strong | 5–6.9 = Mission without delivery | 3–4.9 = Passion without evidence | 1–2.9 = Fails',
    dimensions: {
      structure : 'Mission-to-impact narrative with stakeholder complexity (TFA selection rubric)',
      clarity   : 'Accessible communication across diverse audiences — clinicians, donors, communities (UNICEF)',
      ownership : 'Personal accountability for social outcomes — TFA explicitly rejects "our team did" answers',
      impact    : 'Measured social impact — lives, communities, policy changed, funds raised (Gates Foundation)',
    },
    coachPrompt: `You are a TFA selection interviewer and former Gates Foundation program officer.

TFA/GATES FRAMEWORK:
1. MISSION + EXECUTION BALANCE — TFA rejects passion without delivery. Selection rubric requires BOTH genuine commitment AND tangible results. "I care deeply" without evidence = 3.0–4.9.
2. STAKEHOLDER COMPLEXITY — Donors, beneficiaries, governments, communities, boards simultaneously. Evidence of navigating competing interests is essential.
3. RESOURCE CONSTRAINTS — Gates looks for "more with less." Meaningful results with limited resources is a core signal.
4. SYSTEMS THINKING — McKinsey.org screens for structural thinking. Root causes, not symptoms. Policy change > individual outcomes.
5. MEASURED SOCIAL IMPACT — Numbers matter even in nonprofits. Lives improved, students progressed, funds raised, policy changed, communities reached.

VOICE NOTE: The improved_answer should sound like a TFA corps member report — mission-driven but analytically rigorous, not purely emotional.

CALIBRATION:
9.0–10.0: Mission conviction + rigorous execution + measurable impact + systems thinking.
7.0–8.9: Strong mission and delivery, lighter on systemic thinking.
5.0–6.9: Mission alignment but vague on outcomes.
3.0–4.9: All passion, no evidence.
1.0–2.9: Does not demonstrate social leadership.`,
  },

  // ── 7. HEALTHCARE ───────────────────────────────────────────────
  healthcare: {
    firms    : 'Johnson & Johnson, McKinsey Health, NHS, health-tech startups',
    framework: 'Healthcare Leadership Framework — Patient Centricity, Evidence-Based, Regulatory Awareness',
    shortName: 'Healthcare',
    citation : "Scored on J&J Credo-based leadership standards and McKinsey Health practice criteria: Patient Centricity, Regulatory Awareness, Evidence-Based Decision-Making.",
    scoreGuide: '9–10 = Outstanding healthcare leader | 7–8.9 = Strong | 5–6.9 = Competent but generic | 3–4.9 = No healthcare framing | 1–2.9 = Fails',
    dimensions: {
      structure : 'Clinical/operational STAR with ethical grounding (J&J Credo places patients above shareholders)',
      clarity   : 'Cross-disciplinary communication — clinical and non-clinical audiences (NHS standard)',
      ownership : 'Patient outcome accountability and ethical decision-making (McKinsey Health)',
      impact    : 'Evidence-based outcomes — patient metrics, safety events, efficiency gains (J&J)',
    },
    coachPrompt: `You are a J&J senior HR leader and former NHS management consultant.

J&J/McKINSEY HEALTH FRAMEWORK:
1. PATIENT CENTRICITY — J&J Credo: patients first, employees second, shareholders third. Every decision must connect to patient outcomes. Candidates who don't mention patients or communities score lower on structure.
2. REGULATORY & ETHICAL AWARENESS — HIPAA, GDPR, ethics committees, clinical governance, clinical trials protocol. McKinsey Health interviewers specifically probe this. Missing = -1.0 on ownership.
3. CROSS-DISCIPLINARY COLLABORATION — Clinicians, regulators, engineers, patients, administrators simultaneously. Evidence required.
4. EVIDENCE-BASED THINKING — NHS and J&J: claims must be supported by data or clinical evidence. "I believed it would work" fails.
5. RESILIENCE UNDER HIGH STAKES — Healthcare errors have real consequences. Evidence of careful operation under pressure.

CALIBRATION:
9.0–10.0: Patient-centric, evidence-based, regulatory awareness, cross-functional.
7.0–8.9: Strong skills, missing patient impact or regulatory dimension.
5.0–6.9: Competent execution, no healthcare-specific framing.
3.0–4.9: Generic — could apply to any industry.
1.0–2.9: No healthcare leadership competency.`,
  },

  // ── 8. RETAIL / GENERAL (fallback) ──────────────────────────────
  retail: {
    firms    : 'Amazon Retail, LVMH, Zara, Walmart, fast-growth DTC',
    framework: 'Retail & Consumer Operations Framework — Commercial Acumen, Customer Obsession, Data-Driven Ops',
    shortName: 'Retail & DTC',
    citation : "Scored on Amazon Retail's operational leadership criteria and LVMH brand management standards.",
    scoreGuide: '9–10 = Exceptional | 7–8.9 = Strong commercial | 5–6.9 = Activity without commercial layer | 3–4.9 = Below standard | 1–2.9 = No competency',
    dimensions: {
      structure : 'Commercial STAR with customer + margin awareness (Amazon Retail standard)',
      clarity   : 'Speed and decisiveness (Zara: 2-week design-to-shelf is the benchmark)',
      ownership : 'P&L or category ownership — individual accountability (LVMH)',
      impact    : 'Commercial metrics — conversion, NPS, margin, shrinkage, units (Walmart)',
    },
    coachPrompt: `You are an Amazon Retail principal and former LVMH commercial director.

RETAIL/DTC FRAMEWORK:
1. CUSTOMER OBSESSION + COMMERCIAL REALITY — Amazon: balance customer experience WITH commercial discipline (margin, inventory turns, conversion). One without the other scores lower.
2. SPEED OF EXECUTION — Zara: 2-week design-to-shelf. Bias for action + rapid iteration without sacrificing quality.
3. DATA-DRIVEN OPS — Units, conversion, shrinkage, NPS, basket size, attach rate. Amazon pushes back on "improved customer satisfaction" with no number.
4. TEAM LEADERSHIP AT SCALE — Large, diverse, shift-based teams. LVMH scores for building team capability under pressure.
5. SUPPLY CHAIN AWARENESS — Thinking upstream. Walmart/Amazon value candidates who see the full supply chain, not just the customer-facing layer.

CALIBRATION:
9.0–10.0: Commercial, customer-centric, data-driven, operational and team scale.
7.0–8.9: Strong commercial instinct, lighter on data or supply chain.
5.0–6.9: Describes activity, not commercial impact.
3.0–4.9: Customer-focused but no commercial/data layer.
1.0–2.9: Does not meet retail standard.`,
  },
};

// ── General fallback for unrecognised tracks ─────────────────────
RUBRICS.general = RUBRICS.retail;

// ═══════════════════════════════════════════════════════════════════
// SMART FALLBACK — runs when Gemini unavailable or answer too short
// Returns genuinely useful coaching, not just an error message.
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

  const rubric = RUBRICS[industry] || RUBRICS.consulting;

  const share_line = `I scored ${overall}/10 on a ${rubric.shortName} question. ${!hasNumbers ? 'Adding hard numbers is my next fix.' : !hasAction ? 'Ownership language is my gap.' : 'Working on it with Mocha.'} usemocha.app`;

  return {
    _fallback     : true,
    _rid          : rid,
    overall,
    verdict       : `Structural analysis only. ${overall}/10 against ${rubric.shortName}. ${hasNumbers ? 'Numbers present — good foundation.' : 'Add one hard number to significantly lift this score.'} Full AI grading resumes when quota resets.`,
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
    industry_critique      : `Structural analysis only (AI temporarily unavailable). ${rubric.framework}: your answer ${overall>=6.5?'shows reasonable STAR structure':'is missing key STAR components'}. ${hasNumbers?'Numbers present — good.': rubric.firms+' interviewers push back on every vague result.'}${hasInsight?' Reflection element is a positive signal.':' Adding one insight sentence can lift score 0.5+ points.'}`,
    improved_answer        : `To meet ${rubric.firms} standard: Open with "[Month/Year], [Company/context], [Situation]." State your personal responsibility. Describe 2-3 concrete actions YOU took (first person). Close with a quantified result. End with one genuine reflection. (${rubric.scoreGuide.split('|')[0].trim()}.)`,
    interviewer_perspective: `Structural score ${overall}/10 against ${rubric.shortName}. ${overall>=7.5?'Solid — quantify the result and this advances.':overall>=5.5?'Partial structure — address weak components above.':'Significant gaps — would not advance at '+rubric.firms+' in current form.'}`,
    framework_used: rubric.framework,
    firms_standard: rubric.firms,
    citation      : rubric.citation,
  };
}

// ═══════════════════════════════════════════════════════════════════
// LITE MODE — answers under 50 words get a minimal response
// Saves ~60% of tokens. Returns overall + one improve point.
// ═══════════════════════════════════════════════════════════════════
function buildLite(question, answer, industry, rid) {
  const fb = buildFallback(question, answer, industry, rid);
  return {
    _lite         : true,
    _rid          : rid,
    overall       : fb.overall,
    verdict       : fb.verdict,
    interviewer_verdict: fb.interviewer_verdict,
    share_line    : fb.share_line,
    scores        : fb.scores,
    improve       : [`Your answer is under 50 words. ${!fb.star_breakdown.result.startsWith('Strong') ? 'Add a specific number for your result.' : 'Expand your action section with 2-3 concrete steps.'}`],
    star_breakdown: fb.star_breakdown,
    framework_used: fb.framework_used,
    firms_standard: fb.firms_standard,
    citation      : fb.citation,
    _fallback     : true,
  };
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

  // Lite mode — under 50 words, save tokens
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
    // Full grade prompt — every line earns its place
    // Track-specific preamble for LP/PEI axis flagging
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
      `Rules: ONE decimal (6.4 not 6). Calibration: ${rubric.scoreGuide}. Be tough — most first attempts score 4.5–6.5. 8.0+ only if a senior ${rubric.firms} interviewer is genuinely impressed.`,
      `The improved_answer MUST be written in first person as the candidate would say it — complete sentences, NOT bullet points. Voice/style: ${rubric.shortName}.`,
      ``,
      `Respond ONLY with valid JSON, no markdown fences:`,
      `{"star_breakdown":{"situation":"<present+strong/weak+fix/MISSING+fix>","task":"<clear/unclear+fix>","action":"<I-language present/absent+fix>","result":"<quantified/vague+fix/MISSING+fix>","weak_components":"<comma list>"},"industry_critique":"<2-3 sentences — name the framework — direct>","improved_answer":"<4-6 sentence rewrite at 9.0+ standard — first person — specific numbers — ${rubric.shortName} voice>","interviewer_perspective":"<1 sentence — yes/borderline/no at ${rubric.firms} + main reason>","interviewer_verdict":"<'Would advance to next round' OR 'On the fence' OR 'Would not advance'>","scores":{"structure":x.x,"clarity":x.x,"ownership":x.x,"impact":x.x},"overall":x.x,"verdict":"<1 sentence — meets standard? + single most important fix>","share_line":"<one punchy sentence the user can share — score + gap + mocha — e.g. 'I scored 7.8/10 on a McKinsey PEI question. Ownership was my gap. Fixing it with Mocha.'>","next_question":"<one follow-up the interviewer asks based on answer gaps>","framework_used":"${rubric.framework}","firms_standard":"${rubric.firms}","citation":"${rubric.citation}"}`,
    ].join('\n');
  }

  const estInputTokens = estimateTokens(prompt);
  log('info', rid, { event: 'gemini_call', est_input_tokens: estInputTokens, ck: cacheKey(cleanQuestion, cleanAnswer) });

  // ── Gemini call — 9s timeout (Vercel Hobby: 10s hard limit) ─────
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 25000);

  let geminiRes;
  try {
    geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method : 'POST',
      signal : controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        contents        : [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature    : 0.25,
          maxOutputTokens: 2000,
          topP           : 0.8,
        },
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      log('warn', rid, { event: 'timeout' });
      return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid), _timeout: true, _rid: rid });
    }
    log('error', rid, { event: 'fetch_error', message: err.message });
    return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid), _rid: rid });
  }
  clearTimeout(timeout);

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
    log('warn', rid, { event: 'gemini_error', code, msg: msg.slice(0, 120) });
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

  // ── Parse JSON from Gemini output ───────────────────────────────
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try { parsed = match ? JSON.parse(match[0]) : null; } catch { parsed = null; }
  }

  if (!parsed) {
    log('warn', rid, { event: 'json_extract_failed', raw_head: rawText.slice(0, 100) });
    return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry, rid), _rid: rid });
  }

  // ── Enforce decimal scores, clamp 1–10 ──────────────────────────
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

  // ── Sanity: overall must not drift >1.5 from dimension average ──
  if (parsed.scores && parsed.overall) {
    const { structure = 5, clarity = 5, ownership = 5, impact = 5 } = parsed.scores;
    const dimAvg = parseFloat(((structure + clarity + ownership + impact) / 4).toFixed(1));
    if (Math.abs(parsed.overall - dimAvg) > 1.5) {
      parsed.overall = parseFloat(((parsed.overall + dimAvg) / 2).toFixed(1));
    }
  }

  // ── Ensure interviewer_verdict is one of three valid values ─────
  const validVerdicts = ['Would advance to next round', 'On the fence', 'Would not advance'];
  if (!validVerdicts.includes(parsed.interviewer_verdict)) {
    const score = parsed.overall || 0;
    parsed.interviewer_verdict = score >= 7.5 ? 'Would advance to next round' : score >= 5.5 ? 'On the fence' : 'Would not advance';
  }

  // ── Ensure share_line exists ─────────────────────────────────────
  if (!parsed.share_line) {
    const score = parsed.overall || 0;
    parsed.share_line = `I scored ${score}/10 on a ${rubric.shortName} question with Mocha. usemocha.app`;
  }

  // ── Inject metadata ──────────────────────────────────────────────
  parsed.framework_used = parsed.framework_used || rubric.framework;
  parsed.firms_standard = parsed.firms_standard || rubric.firms;
  parsed.citation       = parsed.citation       || rubric.citation;
  parsed._rid           = rid;

  const outputTokens = data.usageMetadata?.candidatesTokenCount || estimateTokens(rawText);
  const inputTokens  = data.usageMetadata?.promptTokenCount     || estInputTokens;
  log('info', rid, { event: 'done', score: parsed.overall, verdict: parsed.interviewer_verdict, input_tokens: inputTokens, output_tokens: outputTokens });

  return res.status(200).json(parsed);
}
