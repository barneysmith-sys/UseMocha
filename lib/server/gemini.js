// Shared Gemini client. Lives outside api/ so the grade route can call it
// without Vercel collapsing /api/grade onto the /api/interview function.

const GEMINI_CURRENT = "gemini-3.8-flash";
const GEMINI_PREVIOUS = "gemini-2.5-flash";

function log(level, rid, data) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, rid, ...data }));
}

function geminiEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
}

function generationConfigFor(model, { json, maxOutputTokens, rewrite }) {
  if (model === GEMINI_CURRENT) {
    const config = {
      maxOutputTokens,
      thinkingConfig: { thinkingLevel: "low" },
    };
    if (json) config.responseMimeType = "application/json";
    return config;
  }
  if (rewrite) return { temperature: 0.7, maxOutputTokens };
  return { temperature: 0.4, maxOutputTokens, topP: 0.8 };
}

function visibleModelText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => part && typeof part.text === "string" && part.thought !== true)
    .map((part) => part.text)
    .join("")
    .trim();
}

function modelUnavailable(status) {
  return status === 400 || status === 403 || status === 404 || status === 429;
}

async function postGemini(prompt, model, rid, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(geminiEndpoint(model), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: generationConfigFor(model, options),
      }),
    });
    clearTimeout(timeout);
    return { res, timedOut: false, model };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      log("warn", rid, { event: "gemini_timeout", attempt: options.attempt, model });
      return { res: null, timedOut: true, model };
    }
    log("error", rid, { event: "gemini_fetch_error", message: err.message, model });
    return { res: null, timedOut: false, networkError: true, model };
  }
}

async function callGemini(prompt, rid, options = {}) {
  const models = options.models || [GEMINI_CURRENT, GEMINI_PREVIOUS];
  const attempts = options.rewrite ? 1 : 2;
  const callOptions = {
    json: !!options.json,
    rewrite: !!options.rewrite,
    maxOutputTokens: options.maxOutputTokens || (options.rewrite ? 4000 : 8000),
    timeoutMs: options.timeoutMs || (options.rewrite ? 20000 : 50000),
  };
  let last = { res: null, timedOut: false, networkError: false, model: models[0] };

  for (const model of models) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      last = await postGemini(prompt, model, rid, { ...callOptions, attempt });
      if (last.timedOut) {
        if (attempt < attempts) {
          log("info", rid, { event: "retry", attempt: attempt + 1, model });
          continue;
        }
        break;
      }
      if (last.networkError || !last.res) break;
      if (last.res.ok) return last;
      if (model !== models[models.length - 1] && modelUnavailable(last.res.status)) {
        log("warn", rid, { event: "gemini_model_fallback", from: model, status: last.res.status });
        await last.res.arrayBuffer().catch(() => {});
        break;
      }
      return last;
    }
    if (last.timedOut || last.networkError) return last;
  }
  return last;
}

export { visibleModelText, generationConfigFor, callGemini, GEMINI_CURRENT, GEMINI_PREVIOUS };
