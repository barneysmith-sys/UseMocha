# Mocha

The homepage is the adaptive interview: a living alpine field, then a round that follows the answer you just gave. The practice app that grades a single answer stays at `/app`. Sign-in still lands on `/dashboard.html`.

The visual system is a living alpine field: a particle reconstruction of the cobalt mountain studies, drawn with WebGL, with snowfall and a small cursor response. Under it, an interview selector walks from career track to a full adaptive interview.

## Run

From the repository root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint   # tsc --noEmit
npm test
npm run build
```

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` — the same key `/api/speak` already uses. On Vercel that key is the project environment variable. The key stays on the server. Speech uses the Charon voice and tries `gemini-3.8-flash-tts`, then `gemini-3.8-flash-lite-tts`, then the earlier preview models. Send `{ "text" }` or `{ "question" }`. Without the key, the round still runs in text, and the browser can transcribe when speech recognition is available. Do not point this key at a production database, and do not commit it.

## What you can do

- Move the cursor across the hero. Nearby particles ease aside and settle back. Snow takes a little wind. This is active for a fine pointer only.
- The first screen is the animated mountain field. **Start practicing** moves to **What interview are you preparing for?**
- Open a track. Set interview type, difficulty, duration (15, 30, or 45 minutes), and voice or text. **Continue** opens setup, then **Enter interview room**.
- Arrow keys, Enter, and Escape work in the search. ⌘K focuses it.
- The round has five stages: introduction, experience, a role-specific case, pressure, and a close. The interviewer does not score you until the debrief.
- Type at any time. **Begin** tries Gemini Live audio first, then Gemini speech plus the browser’s microphone. If neither is available, the same interview continues on screen. There is no stand-in audio.
- The same tracks are listed again under Career pathways. **Practice this track** returns to the chooser.
- The product preview plays an illustrative consulting round. The step buttons scrub it.

Query flags:

- `?landscape=static` draws the same particle field on a 2D canvas. Use it to review the WebGL fallback.
- A browser with WebGL disabled takes that fallback on its own.
- `prefers-reduced-motion: reduce` skips the assembly, the snowfall, and the cursor displacement. The mountains stay, still.

## Animation architecture

The mountains are not an image stretched behind the page. `scripts/bake-terrain.py` reads the reference banner once, drops the painted wordmark, and writes `public/terrain/alpine.bin`. Each record is a particle: position in the frame, size, opacity, circle or square, ridgeline weight, depth, and a seed.

At runtime:

1. `MountainScene` loads the field, lowers the count on small screens, and mounts a React Three Fiber canvas.
2. `MountainParticles` is one `THREE.Points` object and a shader. The vertex shader places the field in the view, runs a slow ridgeline wave, plays the entrance, and adds a spring-smoothed cursor offset. The fragment shader draws a circle or a square.
3. `SnowfallSystem` is two more point clouds, one behind the ridges and one in front. Flakes wrap, drift, and stretch slightly with their speed. Wind is the cursor’s recent velocity, decaying back to a calm ambient.
4. A shared mutable object (`lib/landscape.ts`) carries the cursor, focus, and a one-shot pulse when a track is chosen. The render loop reads it, so pointer movement does not re-render React.
5. Interface motion uses Framer Motion springs. `MotionConfig reducedMotion="user"` follows the system setting.

The canvas is transparent. The cobalt (`#0053FD`, sampled from the reference) is CSS, so the blue stays exact.

If the canvas cannot be created, `FallbackLandscape` draws the same field in 2D. That path is a fallback, not the primary scene.

## Performance

- Particles are GPU points, not React nodes. A desktop hero is about 25,000. Narrow screens keep roughly half, preferring crests and squares.
- Device pixel ratio is capped at 1.5.
- The hero and the closing scene pause their frames when they are off screen or the tab is hidden.
- Antialiasing is off. Point edges are antialiased in the fragment shader.
- The closing scene is quieter: fewer particles, slower time, no snow, no cursor.

## Interview engine

`lib/interview` runs in the browser and does not need a model. After each answer it updates memory (what was stated, what was only inferred, what is still unknown) and chooses one action: probe, ask for evidence, challenge an assumption, clarify, introduce the case, advance, or close. A controller rejects early endings, repeated questions, praise, and scores. Follow-ups are capped.

Gemini is used only as a voice. `/api/voice/speak` is the same Charon text-to-speech path Mocha already uses, starting with `gemini-3.8-flash-tts`. `/api/voice/live` mints a short-lived token for Gemini Live (`gemini-3.8-live`) so the browser can stream audio without receiving the API key. The live tool is blocking, so the model waits and speaks the director's line instead of inventing the interview. If that connection fails, the screen keeps the director's line. The live site's grader (`/api/interview`) calls `gemini-3.8-flash` at a low thinking level, without temperature or topP overrides, and falls back to `gemini-2.5-flash` when the current model is unavailable.

## What is live

- `/` is this landing and the adaptive interview.
- `/app` is the practice room that grades one answer. `/api/interview` and `/api/speak` are the same handlers the practice room already calls.
- Sign-in returns through `/api/callback`, which still forwards tokens to `/?at=`. That request finishes on the dashboard.

## Product notes

The landing copy is grounded in how Mocha works today: a spoken behavioral round, a line-level mark, an adaptive follow-up, and a role-specific reading of Structure, Clarity, Ownership, and Impact. The interview room is the next step: a full round whose next question depends on the previous answer. Firm names describe the interview the rubric is patterned on. They are not partnerships, and the prototype does not claim licensed case or interview content.

Case numbers are fixed in `lib/interview/scenarios.ts`. The interviewer reveals them one at a time and does not invent a second set. The case key appears only in the debrief.
