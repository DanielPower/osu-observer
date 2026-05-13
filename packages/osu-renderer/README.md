# osu-renderer

A TypeScript library for simulating and rendering osu!standard replays in the browser using PixiJS.

## Install

```bash
pnpm add osu-renderer
```

### Peer Dependencies

- `pixi.js` ^8.0.0

## Quick Start

```ts
import { simulateScore, createRenderer, updateSkinTextures } from "osu-renderer";

// 1. Simulate the replay against the beatmap
const simulation = simulateScore(replay, beatmap);

// 2. Load skin textures (provide a URL or data URL for each texture)
await updateSkinTextures({
  cursor: "/media/skins/default/cursor.png",
  hitcircle: "/media/skins/default/hitcircle.png",
  hitcircleoverlay: "/media/skins/default/hitcircleoverlay.png",
  approachcircle: "/media/skins/default/approachcircle.png",
  "spinner-bottom": "/media/skins/default/spinner-bottom.png",
  "spinner-middle": "/media/skins/default/spinner-middle.png",
  "spinner-top": "/media/skins/default/spinner-top.png",
  "spinner-approachcircle": "/media/skins/default/spinner-approachcircle.png",
  sliderb: "/media/skins/default/sliderb.png",
  sliderfollowcircle: "/media/skins/default/sliderfollowcircle.png",
  reversearrow: "/media/skins/default/reversearrow.png",
  sliderscorepoint: "/media/skins/default/sliderscorepoint.png",
  sliderstartcircle: "/media/skins/default/sliderstartcircle.png",
  sliderstartcircleoverlay: "/media/skins/default/sliderstartcircleoverlay.png",
  sliderendcircle: "/media/skins/default/sliderendcircle.png",
  sliderendcircleoverlay: "/media/skins/default/sliderendcircleoverlay.png",
  hit0: "/media/skins/default/hit0.png",
  hit50: "/media/skins/default/hit50.png",
  hit100: "/media/skins/default/hit100.png",
  hit300: "/media/skins/default/hit300.png",
});

// 3. Create the renderer
const renderer = await createRenderer({
  beatmap,
  simulation,
  replay, // optional — enables cursor and debug overlay
  width: 1280,
  height: 720,
  mediaPath: "/media",
});

// 4. Mount the canvas
document.body.appendChild(renderer.canvas);

// 5. Drive playback in your animation loop
function animate(time: number) {
  renderer.update(time); // time in ms matching the beatmap timeline
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// 6. Clean up when done
renderer.destroy();
```

## API

### Simulation

#### `simulateScore(replay, beatmap)`

Processes replay frames against a beatmap and produces per-frame score state and resolved hit objects.

```ts
function simulateScore(replay: Replay, beatmap: StandardBeatmap): Simulation;
```

| Parameter | Type                                           | Description            |
| --------- | ---------------------------------------------- | ---------------------- |
| `replay`  | `Replay` (from `osu-classes`)                  | The replay to simulate |
| `beatmap` | `StandardBeatmap` (from `osu-standard-stable`) | The parsed beatmap     |

Returns a `Simulation`:

```ts
type Simulation = {
  hitObjects: HitObject[]; // Resolved hit objects with results
  frames: SimulatedFrame[]; // Per-frame game state
};
```

#### `SimulatedFrame`

Each frame captures the full game state at a point in time:

```ts
type SimulatedFrame = {
  x: number; // Cursor X
  y: number; // Cursor Y
  time: number; // Timestamp (ms)
  score: number; // Cumulative score
  combo: number; // Current combo
  great: number; // 300 count
  good: number; // 100 count
  okay: number; // 50 count
  miss: number; // Miss count
  accuracy: number; // 0–1
  actions: Set<StandardAction>; // Buttons held this frame
  angle?: number; // Cursor angle (spinner)
  currentSpinnerRotation?: number; // Active spinner rotation (radians)
  activeSliderProgress?: number; // Active slider progress (0–1 per span)
};
```

#### `HitObject`

```ts
type HitObject = {
  x: number;
  y: number;
  time: number; // Start time (ms)
  resultTime: number; // Time the result was determined
  result: HitResult; // Great / Ok / Meh / Miss
  type: HitType; // Bitmask — circle, slider, spinner
  endTime?: number; // End time for sliders and spinners
  totalRotation?: number; // Total rotation for spinners (radians)
  slider?: SliderData; // Slider path and timing data
};
```

#### `SliderData`

```ts
type SliderData = {
  path: Coordinate[]; // Calculated path points
  repeats: number;
  duration: number; // Total duration (ms)
  velocity: number;
  tickPositions: { position: Coordinate; time: number }[];
  repeatPositions: { position: Coordinate; time: number }[];
  endPosition: Coordinate;
};
```

#### `Coordinate`

```ts
type Coordinate = { x: number; y: number };
```

#### `isInside(cx, cy, hx, hy, hr)`

Circle-point collision check. Returns `true` if the cursor at `(cx, cy)` is inside the hit object at `(hx, hy)` with radius `hr`.

```ts
function isInside(cx: number, cy: number, hx: number, hy: number, hr: number): boolean;
```

---

### Renderer

#### `createRenderer(config)`

Creates a PixiJS-backed renderer that draws the beatmap, hit objects, and cursor.

```ts
function createRenderer(config: {
  beatmap: StandardBeatmap;
  simulation: Simulation;
  replay?: Replay; // Pass to enable cursor rendering and debug overlay
  width: number;
  height: number;
  mediaPath: string; // Root path for skin and beatmap assets
}): Promise<Renderer>;
```

Returns a `Renderer`:

```ts
type Renderer = {
  app: Application; // The underlying PixiJS Application
  canvas: HTMLCanvasElement; // The canvas element to mount
  update: (time: number) => void; // Advance to a point in time (ms)
  destroy: () => void; // Tear down the renderer and free resources
  setBackgroundDim: (dim: number) => void; // 0 = full brightness, 1 = fully dimmed
};
```

The renderer expects skin textures to be loaded before creation — call `updateSkinTextures` first.

---

### Skin / Textures

#### `updateSkinTextures(urls)`

Loads skin textures from the provided URLs and updates the shared texture references used by the renderer. Each value can be any URL or data URL.

```ts
function updateSkinTextures(urls: SkinTextureUrls): Promise<void>;
```

#### `SkinTextureUrls`

```ts
type SkinTextureUrls = Record<keyof typeof textures, string>;
```

#### `textures`

The shared texture object containing all skin texture references. These are populated by `updateSkinTextures` and consumed by the renderer internally. You can also use them directly if building custom rendering on top of this library.

Keys: `cursor`, `hitcircle`, `hitcircleoverlay`, `approachcircle`, `spinner-bottom`, `spinner-middle`, `spinner-top`, `spinner-approachcircle`, `sliderb`, `sliderfollowcircle`, `reversearrow`, `sliderscorepoint`, `sliderstartcircle`, `sliderstartcircleoverlay`, `sliderendcircle`, `sliderendcircleoverlay`, `hit0`, `hit50`, `hit100`, `hit300`

---

### Math Utilities

#### `calcPreempt(AR)`

Returns the approach duration in milliseconds for a given Approach Rate. This is how long before a hit object's time it becomes visible.

```ts
function calcPreempt(AR: number): number;
// AR 0 → 1800ms, AR 5 → 1200ms, AR 10 → 450ms
```

#### `calcFade(AR)`

Returns the fade-in duration in milliseconds for a given Approach Rate. Matches osu!lazer: capped at 400ms and only scaled down when the preempt drops below 450ms (e.g. AR > 10 via DT).

```ts
function calcFade(AR: number): number;
// AR 0..10 → 400ms (scales down for AR > 10)
```

#### `calcAlpha(time, ar, hitObject)`

Returns the current opacity (0–1) of a hit object based on the current time and Approach Rate.

```ts
function calcAlpha(time: number, ar: number, hitObject: HitObject): number;
```

#### `calcObjectRadius(CS)`

Returns the hit circle radius in osu! pixels for a given Circle Size.

```ts
function calcObjectRadius(CS: number): number;
```

#### `calcCursorSize(CS)`

Returns the cursor scale factor for a given Circle Size.

```ts
function calcCursorSize(CS: number): number;
```

#### `lerp2D(t0, x0, y0, t1, x1, y1, t)`

Linearly interpolates between two 2D points over time. Used internally for smooth cursor movement between replay frames.

```ts
function lerp2D(
  t0: number,
  x0: number,
  y0: number,
  t1: number,
  x1: number,
  y1: number,
  t: number,
): { x: number; y: number };
```
