# Mocha landscape prototype

An isolated design prototype for a future Mocha landing page. It does not modify the existing application, its routes, environment, or deployment.

The visual system is a living alpine field: a particle reconstruction of the cobalt mountain studies, drawn with WebGL, with snowfall and a small cursor response. Under it, an interview selector walks from career track to session preview. Nothing here starts a real interview.

## Run

From this directory:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint   # tsc --noEmit
npm run build
```

The existing Mocha site is untouched. Do not install these dependencies at the repository root.

## What you can do

- Move the cursor across the hero. Nearby particles ease aside and settle back. Snow takes a little wind. This is active for a fine pointer only.
- Open **What interview are you preparing for?** Click, type, or use the arrow keys, Enter, and Escape.
- Choose a track, then an interview, then **Start practicing**. The last step is a labeled prototype stop. It does not call Mocha’s API.
- The same tracks are listed again under Career pathways. **Practice this track** returns to the hero selector.
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

## What could move into Mocha later

Candidates, after a separate decision to integrate:

- `MountainScene`, `MountainParticles`, `SnowfallSystem`, and the terrain field, as a hero background.
- The career selector pattern (`CareerSearch`, `CareerTrackSelector`, `InterviewSetupPreview`) as the way a round is chosen. The track list should be reconciled with the live directory before that happens. This prototype’s eight paths are a concept set (consulting, banking, product, software, marketing, data, strategy, general behavioral). The live app’s directory is the source of truth for what a round actually contains.
- The product-preview structure: question, marked line, adaptive follow-up, and the four scores Mocha already uses — Structure, Clarity, Ownership, Impact.

Do not copy this prototype over `index.html` or point its final button at `/api/interview`. The session action is intentionally a dead end.

## Product notes

Copy is grounded in how Mocha works today: a spoken behavioral round, a line-level mark, an adaptive follow-up, and a role-specific reading of the same four dimensions. Firm names describe the interview the rubric is patterned on. They are not partnerships, and the prototype does not claim licensed case or interview content.
