// ═══════════════════════════════════════════════════════════════════
// Mocha — /api/interview
// Vercel serverless function. Key never touches the client.
// v3: decimal scoring + real rubrics + framework citations in output
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

function sanitise(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, maxLen);
}

// ═══════════════════════════════════════════════════════════════════
// INDUSTRY RUBRIC PROFILES
// Each profile contains:
//   firms        — the actual companies this maps to
//   framework    — the named evaluation framework these firms use
//   citation     — the source/reference shown to users after feedback
//   dimensions   — the exact scoring dimensions with descriptions
//   scoreGuide   — what each score range means at this firm
//   coachPrompt  — the full system prompt injected into Gemini
// ═══════════════════════════════════════════════════════════════════
const RUBRICS = {

  consulting: {
    firms    : 'McKinsey, BCG, Bain & Company',
    framework: 'MBB Personal Experience Interview (PEI) Framework',
    citation : 'Evaluated using the McKinsey PEI rubric and BCG/Bain behavioral assessment criteria — the same frameworks used by MBB recruiters globally.',
    dimensions: {
      structure : 'STAR completeness + logical sequencing (McKinsey PEI)',
      clarity   : 'Concise, jargon-free communication under pressure (BCG)',
      ownership : 'Personal impact vs. team contribution — "I" not "we" (Bain)',
      impact    : 'Quantified outcomes with business relevance (MBB standard)',
    },
    scoreGuide: '9.0–10.0 = Immediate PEI pass | 7.0–8.9 = Strong, likely advances | 5.0–6.9 = Mixed, borderline | 3.0–4.9 = Would not advance | 1.0–2.9 = Fails rubric',
    coachPrompt: `You are a senior McKinsey interviewer who has conducted 500+ PEI (Personal Experience Interview) sessions and trained BCG/Bain interviewers.

THE MBB PEI FRAMEWORK you score against:
1. PERSONAL IMPACT — Was the candidate the decisive actor? McKinsey explicitly rejects answers where success was a team effort. Look for "I decided," "I built," "I convinced."
2. STRUCTURE — Was the answer STAR-complete and logically sequenced? BCG interviewers are trained to note when candidates skip Task or Result.
3. QUANTIFIED OUTCOMES — BCG/Bain interviewers push back on vague results. "Improved performance" fails. "Reduced client acquisition cost by 34%, saving £2.1M annually" passes.
4. INSIGHT & SELF-AWARENESS — Did the candidate extract a genuine lesson? MBB wants reflective learners who will thrive in ambiguous consulting environments.
5. LEADERSHIP WITHOUT AUTHORITY — Did they influence peers or seniors without a formal mandate? This is a McKinsey PEI core signal.

SCORING (be tough — most candidates score 4.5–6.5 on their first attempt):
- 9.0–10.0: Would pass PEI immediately. Crisp STAR, quantified impact, unmistakably personal ownership, genuine insight.
- 7.0–8.9: Strong. One gap — usually vague result or shared ownership language.
- 5.0–6.9: Mixed. Good story but missing quantification or personal role is unclear.
- 3.0–4.9: Weak. Team-focused, vague outcomes, poor structure.
- 1.0–2.9: Fails. No clear personal role, no result, no structure.`,
  },

  banking: {
    firms    : 'Goldman Sachs, JPMorgan, Morgan Stanley, Lazard',
    framework: 'Investment Banking Behavioral Competency Framework',
    citation : 'Evaluated against Goldman Sachs, JPMorgan, and Morgan Stanley behavioral interview standards — based on published recruiter guidelines and IB hiring criteria.',
    dimensions: {
      structure : 'STAR completeness with commercial context (GS standard)',
      clarity   : 'Precision and brevity — IB values concise high-quality output (JPM)',
      ownership : 'Individual accountability in high-stakes situations (MS)',
      impact    : 'Hard financial/business numbers — deal size, revenue, savings (GS)',
    },
    scoreGuide: '9.0–10.0 = Exceptional, would hire | 7.0–8.9 = Strong, advances | 5.0–6.9 = Average, may not proceed | 3.0–4.9 = Below IB standard | 1.0–2.9 = Would not proceed',
    coachPrompt: `You are a Goldman Sachs Managing Director who interviews analyst and associate candidates. You have also trained JPMorgan and Morgan Stanley interview panels.

THE IB BEHAVIORAL FRAMEWORK you score against:
1. DRIVE & RESILIENCE — IB hours are 80-100 hours/week. Interviewers specifically test for evidence of sustained high performance under extreme pressure without quality degradation.
2. ATTENTION TO DETAIL — Errors in banking cost clients millions. GS explicitly scores for candidates who caught mistakes, built verification processes, or prevented failures.
3. QUANTIFIED EVERYTHING — Goldman Sachs interviewers are trained to reject vague answers. Revenue impact, deal size, basis points, percentage improvements, time saved. "I improved the process" fails immediately.
4. COMMERCIAL ACUMEN — Did the candidate think about the business/financial impact, not just the task? JPMorgan wants commercially-minded candidates.
5. TEAM PERFORMANCE IN HIERARCHY — IB has strict hierarchy. Did the candidate show both initiative AND appropriate deference to seniors?

SCORING (IB is highly competitive — be rigorous):
- 9.0–10.0: Exceptional. Hard numbers, precise language, clear personal ownership, demonstrates the resilience IB demands.
- 7.0–8.9: Good. Solid story, mostly quantified. Minor vagueness in role or outcome.
- 5.0–6.9: Average. Story present but lacks hard numbers or personal contribution is unclear.
- 3.0–4.9: Below standard. Generic, no differentiation.
- 1.0–2.9: Would not proceed. Missing core IB competencies.`,
  },

  finance: {
    firms    : 'Blackstone, KKR, Citadel, Bridgewater, BlackRock',
    framework: 'Buy-Side Analytical & Investment Judgment Framework',
    citation : 'Evaluated against buy-side interview standards used at top hedge funds and private equity firms — based on Bridgewater\'s principles-based assessment and PE firm behavioral criteria.',
    dimensions: {
      structure : 'Problem decomposition and analytical sequencing (Bridgewater)',
      clarity   : 'Intellectual precision — says exactly what is meant (Citadel)',
      ownership : 'Independent conviction and decision ownership (KKR)',
      impact    : 'Quantified investment/business outcomes with risk awareness (Blackstone)',
    },
    scoreGuide: '9.0–10.0 = Would hire | 7.0–8.9 = Strong, progresses | 5.0–6.9 = Adequate, lacking depth | 3.0–4.9 = Weak analytical layer | 1.0–2.9 = Does not meet buy-side standard',
    coachPrompt: `You are a Citadel Portfolio Manager and former Bridgewater analyst who interviews candidates for hedge fund and PE roles.

THE BUY-SIDE FRAMEWORK you score against:
1. ANALYTICAL RIGOUR — Did the candidate break down a complex problem systematically? Citadel interviewers explicitly test for first-principles thinking, not just execution.
2. RISK AWARENESS — Did they identify downside scenarios and explain mitigation? Risk management is central to every buy-side role. Bridgewater specifically probes this.
3. INDEPENDENT CONVICTION — Did they form their own view and defend it under pressure? KKR and Blackstone want candidates who have genuine conviction, not consensus-followers.
4. QUANTIFIED PRECISION — Exact numbers. Not "significant improvement" but "increased Sharpe ratio from 0.8 to 1.4" or "identified $40M in stranded costs in the data room."
5. INTELLECTUAL CURIOSITY — Did the answer show genuine depth of analysis and curiosity, not just competent execution?

SCORING (buy-side bars are extremely high):
- 9.0–10.0: Would hire. Analytically rigorous, quantified, shows independent conviction and risk awareness.
- 7.0–8.9: Strong. Good analysis but missing depth on risk or lacking precise quantification.
- 5.0–6.9: Adequate. Follows instructions but no independent analytical layer.
- 3.0–4.9: Execution-focused with no analytical or risk dimension.
- 1.0–2.9: Does not meet buy-side standard.`,
  },

  product: {
    firms    : 'Google, Meta, Amazon, Apple, Microsoft',
    framework: 'Amazon Leadership Principles + FAANG Behavioral Rubric',
    citation : 'Evaluated using Amazon\'s 16 Leadership Principles framework and the Google/Meta structured behavioral assessment — the same systems used by FAANG recruiters and bar-raisers.',
    dimensions: {
      structure : 'STAR completeness with data-driven narrative (Amazon LP: Deliver Results)',
      clarity   : 'Clear communication at scale and under ambiguity (Google)',
      ownership : 'Bias for Action + Ownership LP — personal initiative (Amazon)',
      impact    : 'Measurable user/product/business outcomes with scale (Meta)',
    },
    scoreGuide: '9.0–10.0 = Bar-raiser approved | 7.0–8.9 = Strong hire signal | 5.0–6.9 = Mixed, needs data | 3.0–4.9 = No hire signal | 1.0–2.9 = Fails FAANG rubric',
    coachPrompt: `You are an Amazon Bar Raiser and former Google Staff-level interviewer. You have evaluated 1000+ behavioral interviews against the Amazon Leadership Principles and FAANG rubrics.

THE FAANG BEHAVIORAL FRAMEWORK you score against:

AMAZON LEADERSHIP PRINCIPLES (the ones most tested behaviorally):
- Customer Obsession: Does every decision trace back to customer impact?
- Ownership: "Leaders never say that's not my job." Did they take full accountability?
- Bias for Action: Did they act decisively with incomplete information?
- Dive Deep: Did they get into the data and details, not just strategy?
- Deliver Results: Did they actually ship/achieve something measurable?
- Earn Trust: Did they work cross-functionally and build credibility?

GOOGLE/META ADDITIONS:
- Data-driven decisions: "I thought it would work" fails. "I ran an A/B test with 50k users and saw 12% lift in D7 retention" passes.
- Scale and ambiguity: Did the candidate operate at scale (millions of users, large teams, complex systems)?
- Cross-functional leadership: Engineering, design, data science, business — did they navigate all of these?

SCORING (FAANG bar is notoriously high):
- 9.0–10.0: Bar-raiser would approve. Hits 3+ LPs explicitly, data-driven, shows scale, unmistakable personal ownership.
- 7.0–8.9: Strong hire. Good story with data. May miss one LP or lack scale signal.
- 5.0–6.9: Mixed. Has structure but vague on data, LPs, or user impact.
- 3.0–4.9: No hire. No data, no scale, "we did" language throughout.
- 1.0–2.9: Fails FAANG rubric completely.`,
  },

  marketing: {
    firms    : 'P&G, Unilever, Nike, Airbnb, growth-stage startups',
    framework: 'Brand Strategy & Growth Marketing Competency Framework',
    citation : 'Evaluated against P&G brand management interview standards and modern growth marketing rubrics used at consumer tech companies — based on published CMO hiring criteria.',
    dimensions: {
      structure : 'Strategic narrative clarity — insight to action to result (P&G)',
      clarity   : 'Compelling storytelling — marketers must sell their own stories (Nike)',
      ownership : 'Campaign or strategy ownership — who made the key call (Unilever)',
      impact    : 'Growth metrics — CAC, LTV, conversion, revenue attribution (Airbnb)',
    },
    scoreGuide: '9.0–10.0 = Exceptional marketer | 7.0–8.9 = Strong, hire signal | 5.0–6.9 = Activity without strategy | 3.0–4.9 = Below brand standard | 1.0–2.9 = No marketing competency',
    coachPrompt: `You are a former P&G Brand Director who now advises growth-stage startups and interviews marketing candidates at Nike and Airbnb.

THE BRAND & GROWTH MARKETING FRAMEWORK you score against:
1. CONSUMER INSIGHT — Did the candidate show genuine understanding of why customers behave a certain way? P&G trains brand managers to always start with a human insight, not a business problem.
2. STRATEGIC CLARITY — Was there a clear insight → strategy → execution → result arc? Unilever explicitly trains interviewers to score this sequencing.
3. MEASURABLE GROWTH — CAC, LTV, conversion rates, engagement uplift, revenue attribution. Nike marketers track "brand heat" metrics. Airbnb tracks booking conversion. Vague "campaigns" fail at all of these firms.
4. CREATIVE PROBLEM SOLVING — Did they find a non-obvious solution? The best marketers see angles others miss.
5. DATA AND INTUITION BALANCE — Pure data with no instinct = analyst, not marketer. Pure instinct with no data = too risky. The best answers show both.

SCORING:
- 9.0–10.0: Outstanding. Consumer insight + hard metrics + creative thinking + compelling delivery.
- 7.0–8.9: Strong on execution or metrics but lighter on consumer insight.
- 5.0–6.9: Describes activity not strategy. Missing the "why" behind the decision.
- 3.0–4.9: Activity without measurement or strategic rationale.
- 1.0–2.9: No evidence of marketing strategic competency.`,
  },

  nonprofit: {
    firms    : 'Gates Foundation, Teach For America, McKinsey.org, UNICEF',
    framework: 'Social Impact Leadership & Mission-Execution Framework',
    citation : 'Evaluated against Teach For America\'s Corps Member selection criteria and Gates Foundation program officer assessment standards — combining mission alignment with operational rigour.',
    dimensions: {
      structure : 'Mission-to-impact narrative with stakeholder complexity (TFA)',
      clarity   : 'Accessibility of communication across diverse audiences (UNICEF)',
      ownership : 'Personal accountability for social outcomes (Gates Foundation)',
      impact    : 'Measured social impact — lives, communities, policy change (McKinsey.org)',
    },
    scoreGuide: '9.0–10.0 = Exceptional social leader | 7.0–8.9 = Strong candidate | 5.0–6.9 = Mission without delivery | 3.0–4.9 = All passion, no evidence | 1.0–2.9 = Fails social leadership standard',
    coachPrompt: `You are a Teach For America selection interviewer and former Gates Foundation program officer who evaluates candidates for mission-driven leadership roles.

THE SOCIAL IMPACT LEADERSHIP FRAMEWORK you score against:
1. MISSION ALIGNMENT WITH OPERATIONAL EXCELLENCE — TFA explicitly rejects candidates who show passion without execution. The selection rubric requires evidence of BOTH genuine mission commitment AND tangible delivery.
2. STAKEHOLDER COMPLEXITY — Nonprofits involve donors, beneficiaries, governments, communities, and boards simultaneously. Did the candidate navigate multiple competing interests?
3. RESOURCE CONSTRAINTS — Gates Foundation programme officers specifically look for "more with less" stories. Achieving meaningful results with limited resources is a core signal.
4. SYSTEMS THINKING — Did they address root causes, not just symptoms? McKinsey.org screens heavily for candidates who think about structural change.
5. MEASURED SOCIAL IMPACT — Numbers matter even in nonprofits. Lives improved, communities reached, funds raised, policy changed, students progressed.

SCORING:
- 9.0–10.0: Exceptional. Mission conviction + rigorous execution + measurable impact + systems thinking.
- 7.0–8.9: Strong mission and delivery but lighter on systemic or structural thinking.
- 5.0–6.9: Shows mission alignment but vague on outcomes or impact.
- 3.0–4.9: All passion, no evidence of delivery.
- 1.0–2.9: Does not demonstrate social leadership competency.`,
  },

  healthcare: {
    firms    : 'Johnson & Johnson, McKinsey Health, NHS, health-tech startups',
    framework: 'Healthcare Leadership & Patient-Outcome Framework',
    citation : 'Evaluated against J&J Credo-based leadership standards and McKinsey Health practice behavioral criteria — incorporating patient-centricity and regulatory awareness as core scoring dimensions.',
    dimensions: {
      structure : 'Clinical/operational STAR narrative with ethical grounding (J&J Credo)',
      clarity   : 'Cross-disciplinary communication — clinical and non-clinical (NHS)',
      ownership : 'Patient outcome accountability and ethical decision-making (McKinsey Health)',
      impact    : 'Evidence-based outcomes — patient metrics, safety, efficiency (J&J)',
    },
    scoreGuide: '9.0–10.0 = Outstanding healthcare leader | 7.0–8.9 = Strong candidate | 5.0–6.9 = Competent but generic | 3.0–4.9 = No healthcare framing | 1.0–2.9 = Fails healthcare standard',
    coachPrompt: `You are a Johnson & Johnson senior HR leader and former NHS management consultant who interviews candidates for healthcare leadership and health-tech roles.

THE HEALTHCARE LEADERSHIP FRAMEWORK you score against:
1. PATIENT/OUTCOME CENTRICITY — J&J's Credo places patients and communities first, employees second, shareholders third. Every decision in a J&J interview must connect back to patient outcomes. Candidates who don't mention patients score lower.
2. REGULATORY & ETHICAL AWARENESS — Did they navigate compliance, privacy (HIPAA/GDPR), ethics committees, or clinical governance? Healthcare is the most regulated industry. McKinsey Health interviewers specifically probe this.
3. CROSS-DISCIPLINARY COLLABORATION — Healthcare requires working with clinicians, regulators, engineers, patients, and administrators simultaneously. Evidence of navigating this is essential.
4. EVIDENCE-BASED THINKING — NHS management and health-tech both demand that claims be supported by data or clinical evidence. "I believed it would work" is not sufficient.
5. RESILIENCE UNDER HIGH STAKES — Healthcare errors have real consequences for patient safety. Did the candidate show they operate carefully and maintain standards under pressure?

SCORING:
- 9.0–10.0: Outstanding. Patient-centric, evidence-based, shows regulatory awareness and cross-functional leadership.
- 7.0–8.9: Strong skills but missing patient impact or regulatory dimension.
- 5.0–6.9: Competent execution but no healthcare-specific framing.
- 3.0–4.9: Generic answer that could apply to any industry.
- 1.0–2.9: No evidence of healthcare leadership competency.`,
  },

  retail: {
    firms    : 'Amazon Retail, LVMH, Zara, Walmart, fast-growth DTC brands',
    framework: 'Retail & Consumer Operations Leadership Framework',
    citation : 'Evaluated against Amazon Retail\'s operational leadership criteria and LVMH brand management standards — combining commercial acumen with customer experience excellence.',
    dimensions: {
      structure : 'Commercial STAR narrative with customer and margin awareness (Amazon)',
      clarity   : 'Speed and decisiveness of communication (Zara/fast fashion standard)',
      ownership : 'Store/category/brand P&L ownership — individual accountability (LVMH)',
      impact    : 'Commercial metrics — units, conversion, NPS, margin, shrinkage (Walmart)',
    },
    scoreGuide: '9.0–10.0 = Exceptional retail leader | 7.0–8.9 = Strong commercial candidate | 5.0–6.9 = Activity without commercial layer | 3.0–4.9 = Below retail standard | 1.0–2.9 = No retail competency',
    coachPrompt: `You are an Amazon Retail principal and former LVMH commercial director who interviews candidates for retail leadership and consumer brand roles.

THE RETAIL & CONSUMER FRAMEWORK you score against:
1. CUSTOMER OBSESSION WITH COMMERCIAL REALITY — Amazon explicitly trains retail interviewers to look for candidates who balance customer experience with commercial discipline (margin, inventory turnover, conversion). One without the other scores lower.
2. SPEED OF EXECUTION — Zara's competitive advantage is 2-week design-to-shelf cycles. Fast fashion and DTC brands want evidence of bias for action and rapid iteration without sacrificing quality.
3. DATA-DRIVEN OPERATIONS — Units sold, conversion rates, shrinkage reduction, NPS improvement, basket size, attach rate. Amazon interviewers are trained to push back on vague "improved customer satisfaction" claims.
4. TEAM LEADERSHIP AT SCALE — Retail often involves managing large, diverse, shift-based teams. LVMH specifically scores for evidence of building team capability under operational pressure.
5. SUPPLY CHAIN & INVENTORY AWARENESS — Did they think upstream? Walmart and Amazon specifically value candidates who understand the full supply chain, not just the customer-facing layer.

SCORING:
- 9.0–10.0: Exceptional. Commercial, customer-centric, data-driven, shows operational and team scale.
- 7.0–8.9: Strong commercial instinct but lighter on data or supply chain awareness.
- 5.0–6.9: Describes activity but not commercial or operational impact.
- 3.0–4.9: Customer-focused but no commercial or data layer.
- 1.0–2.9: Does not meet retail leadership standard.`,
  },
};

// ── Smarter fallback with decimal scores ────────────────────────
function buildFallback(question, answer, industry) {
  const words        = answer.trim().split(/\s+/).filter(Boolean).length;
  const hasNumbers   = /\d/.test(answer);
  const hasSituation = /when|during|once|situation|time|context|background/.test(answer.toLowerCase());
  const hasTask      = /need|had to|responsible|goal|objective|challenge|tasked/.test(answer.toLowerCase());
  const hasAction    = /\bI\b.{0,20}(decided|chose|built|created|led|managed|ran|implemented|designed|drove|launched|negotiated)/.test(answer);
  const hasResult    = /result|outcome|impact|led to|increased|decreased|improved|achieved|delivered|saved|grew/.test(answer.toLowerCase());
  const hasOwnership = /\bI\b/.test(answer);

  const structureScore = parseFloat(((hasSituation ? 2 : 0) + (hasTask ? 2 : 0) + (hasAction ? 2 : 0) + (hasResult ? 2 : 0) + (words >= 60 ? 2 : words >= 30 ? 1 : 0)).toFixed(1));
  const clarityScore   = parseFloat((words >= 100 ? 7.5 : words >= 60 ? 6.0 : words >= 30 ? 4.5 : 2.5).toFixed(1));
  const ownershipScore = parseFloat((hasOwnership ? (hasAction ? 6.5 : 5.0) : 3.0).toFixed(1));
  const impactScore    = parseFloat((hasNumbers ? 7.0 : hasResult ? 5.5 : 3.0).toFixed(1));
  const overall        = parseFloat(((structureScore + clarityScore + ownershipScore + impactScore) / 4).toFixed(1));

  const rubric = RUBRICS[industry] || RUBRICS.consulting;

  return {
    star_breakdown: {
      situation      : hasSituation ? 'Present — context established'       : 'MISSING — add when/where/what was at stake',
      task           : hasTask      ? 'Present — challenge identified'       : 'MISSING — clarify what you personally needed to achieve',
      action         : hasAction    ? 'Present — personal actions described' : 'MISSING — use "I decided / I built / I led" not "we"',
      result         : hasResult    ? 'Present — outcome mentioned'          : 'MISSING — add a specific number or named outcome',
      weak_components: [
        !hasSituation && 'Situation',
        !hasTask      && 'Task',
        !hasAction    && 'Personal action (use "I" not "we")',
        !hasResult    && 'Result',
        !hasNumbers   && 'Quantification (add numbers)',
      ].filter(Boolean).join(', ') || 'None identified'
    },
    industry_critique     : `Structural analysis only (AI feedback temporarily unavailable). Based on ${rubric.framework}: your answer ${overall >= 6 ? 'shows reasonable STAR structure' : 'is missing key STAR components'}. ${hasNumbers ? 'You included numbers — good.' : `${rubric.firms} interviewers will push back on any result without a number.`}`,
    improved_answer       : `To meet ${rubric.firms} standard: (1) Open with specific context — when, where, what was at stake. (2) State your personal responsibility in one sentence. (3) Describe 2-3 concrete actions YOU took (use "I", not "we"). (4) Close with a quantified result — a percentage, dollar amount, or named outcome. ${rubric.scoreGuide.split('|')[0].trim()}.`,
    interviewer_perspective: `Structural score ${overall}/10 against ${rubric.framework}. ${overall >= 7 ? 'Reasonable structure — add quantified outcomes to meet firm standard.' : overall >= 5 ? 'Partial STAR structure — see weak components above.' : 'Significant STAR gaps — this would not advance at ' + rubric.firms + '.'}`,
    scores : { structure: structureScore, clarity: clarityScore, ownership: ownershipScore, impact: impactScore },
    overall,
    verdict  : `Structural analysis only. ${overall}/10 against ${rubric.framework}. Real AI feedback available when quota resets.`,
    framework_used: rubric.framework,
    firms_standard: rubric.firms,
    citation      : rubric.citation,
    _fallback     : true,
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[mocha] GEMINI_API_KEY not set — returning fallback');
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer, cleanIndustry));
  }

  const rubric = RUBRICS[cleanIndustry] || RUBRICS.consulting;

  let prompt;
  if (cleanMode === 'followup') {
    prompt =
      `You are Mocha Coach — an elite behavioral interview coach with deep experience at ${rubric.firms}.\n` +
      `You coach using the ${rubric.framework}.\n` +
      `Be direct and specific. Maximum 3 sentences. Reference the specific firm standard.\n\n` +
      `Interview question: ${cleanQuestion}\n` +
      `Candidate's follow-up: ${cleanAnswer}\n\n` +
      `Give one concrete coaching tip grounded in ${rubric.framework}. No bullets. No em dashes.`;
  } else {
    prompt =
      `${rubric.coachPrompt}\n\n` +
      `---\n` +
      `CANDIDATE'S QUESTION: ${cleanQuestion}\n` +
      `CANDIDATE'S ANSWER: ${cleanAnswer}\n` +
      `---\n\n` +
      `Evaluate this answer rigorously using the ${rubric.framework} described above.\n\n` +
      `SCORING RULES:\n` +
      `- Use ONE decimal place (e.g. 6.4, 7.8, 8.2) — never whole numbers\n` +
      `- Apply the scoring guide: ${rubric.scoreGuide}\n` +
      `- Be genuinely rigorous — most first attempts score 4.0–6.5\n` +
      `- Only give 8.0+ if this answer would genuinely impress a senior interviewer at ${rubric.firms}\n\n` +
      `DIMENSION DEFINITIONS:\n` +
      `- structure: ${rubric.dimensions.structure}\n` +
      `- clarity: ${rubric.dimensions.clarity}\n` +
      `- ownership: ${rubric.dimensions.ownership}\n` +
      `- impact: ${rubric.dimensions.impact}\n\n` +
      `Respond ONLY with valid JSON (no markdown, no text outside the JSON):\n` +
      `{\n` +
      `  "star_breakdown": {\n` +
      `    "situation": "<1 sentence: is it present and strong / weak / MISSING — plus one specific fix if weak>",\n` +
      `    "task": "<1 sentence: is the personal challenge clear?>",\n` +
      `    "action": "<1 sentence: are personal actions specific and owned with I-language?>",\n` +
      `    "result": "<1 sentence: is the result quantified / mentioned but vague / MISSING>",\n` +
      `    "weak_components": "<comma-separated list of what is missing or weak — be specific>"\n` +
      `  },\n` +
      `  "industry_critique": "<2-3 sentences: exactly how a senior interviewer at ${rubric.firms} would react — reference the ${rubric.framework} explicitly — be honest and direct>",\n` +
      `  "improved_answer": "<Rewrite this answer to score 9.0+ at ${rubric.firms}. 4-6 sentences. First person. Specific numbers. Clear personal ownership. Reference what matters at these firms. No bullet points.>",\n` +
      `  "interviewer_perspective": "<1 sentence: would this candidate advance at ${rubric.firms}? Say yes/borderline/no and the single main reason — be direct>",\n` +
      `  "scores": {"structure": <x.x>, "clarity": <x.x>, "ownership": <x.x>, "impact": <x.x>},\n` +
      `  "overall": <x.x>,\n` +
      `  "verdict": "<1 direct sentence about whether this meets ${rubric.firms} standard and the single most important fix>",\n` +
      `  "framework_used": "${rubric.framework}",\n` +
      `  "firms_standard": "${rubric.firms}",\n` +
      `  "citation": "${rubric.citation}"\n` +
      `}`;
  }

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
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(200).json({ ...buildFallback(cleanQuestion, cleanAnswer, cleanIndustry), _timeout: true });
    }
    console.error('[mocha] Gemini fetch error:', err.message);
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer, cleanIndustry));
  }
  clearTimeout(timeout);

  let data;
  try { data = await geminiRes.json(); } catch {
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer, cleanIndustry));
  }

  if (data.error) {
    console.error('[mocha] Gemini error code:', data.error.code);
    console.error('[mocha] Gemini error message:', data.error.message);
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer, cleanIndustry));
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) {
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer, cleanIndustry));
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
    return res.status(200).json(buildFallback(cleanQuestion, cleanAnswer, cleanIndustry));
  }

  // Enforce decimal scores
  if (parsed.scores) {
    ['structure','clarity','ownership','impact'].forEach(k => {
      if (parsed.scores[k] !== undefined) {
        parsed.scores[k] = parseFloat(parseFloat(parsed.scores[k]).toFixed(1));
      }
    });
  }
  if (parsed.overall !== undefined) {
    parsed.overall = parseFloat(parseFloat(parsed.overall).toFixed(1));
  }

  // Always inject citation fields
  parsed.framework_used = parsed.framework_used || rubric.framework;
  parsed.firms_standard = parsed.firms_standard || rubric.firms;
  parsed.citation       = parsed.citation       || rubric.citation;

  return res.status(200).json(parsed);
}
