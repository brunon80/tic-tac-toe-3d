# Tic Tac Toe 3D

A three-dimensional take on tic-tac-toe: a 3x3 board standing in mid-air, extruded X and O
pieces, four CPU difficulty levels and a theme system that recolours both the interface and the
3D scene.

Built with React 19, plain three.js (no react-three-fiber) and TypeScript.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts Vite with hot reload |
| `npm run build` | Type-checks, then builds into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run typecheck` | TypeScript checks only |
| `npm run test` | Runs the rules/AI/theme test suite |
| `npm run test:watch` | Tests on repeat |

Requires a browser with WebGL 2. If WebGL is missing the page explains why instead of showing a
blank board.

## Playing

* **Click or tap a square** to place your mark. A ghost piece shows where you are about to play;
  on touch screens the tap itself stands in for the preview.
* **Drag** to orbit the camera, **mouse wheel** or **pinch** to zoom. On a touch screen one finger
  drags rotate and two fingers pinch-zoom; a tap still plays the square you touched. The camera is
  clamped so the board never ends up behind you.
* **Keys**: <kbd>1</kbd>-<kbd>9</kbd> play the matching square, <kbd>U</kbd> undo, <kbd>N</kbd>
  new round, <kbd>T</kbd> next theme, <kbd>C</kbd> reset the camera, <kbd>F</kbd> fullscreen,
  <kbd>S</kbd> settings.
* The CPU takes its turn automatically after a short "thinking" pause. With auto-advance on, the
  next round starts a few seconds after a round ends.

### Settings modal and fullscreen

* Every game control lives in one **Settings** modal — the gear icon in the header or <kbd>S</kbd>
  opens it. The other header buttons are icon-only with hover tooltips: undo, reset camera and
  fullscreen (only **New round** keeps its word). A small sidebar inside the dialog picks the section:
  **Match** (players, difficulty, CPU mark,
  opening mark, auto-advance, the score card and round actions), **Appearance** (theme presets,
  shuffle/reset, custom colours, board design, cell guides) and **Motion & sound** (animation
  level, camera mode, bloom glow, sound). Close it with the ✕ button, by clicking next to the
  card, or with <kbd>Esc</kbd>.
* **Fullscreen** mode (the header button or <kbd>F</kbd>) hides the header, status bar and
  footer: only the board and a thin strip holding the status line, the score and New / Undo /
  Settings / Exit actions remain. It also asks the browser to fill the whole screen. The modal
  still works on top of the fullscreen board — <kbd>Esc</kbd> closes the modal first and leaves
  fullscreen on the next press.

### Board designs

* The **Board design** picker (Settings → Appearance) swaps the 3D architecture live, with four
  built-in looks: **Classic** (the framed slate with cell discs), **Carved** (a monolith slab
  with the nine cells cut out as wells), **Floating** (rounded plates hovering over a pedestal,
  gently bobbing with a soft grid-coloured halo each) and **Neon** (glowing lattice rails
  holding frosted glass cells; the rails warm to the win colour on a victory). Pieces, the
  winning beam and the hover/touch targets survive the swap — pick a design mid-round and keep
  playing. The choice is saved with the other settings.

### Match settings

* **vs CPU** or **2 players** on the same device.
* **Difficulty**: Easy (mostly random), Medium (takes wins, blocks the obvious), Hard (five plies
  deep, rarely slips) and Unbeatable (full search, best you can get is a draw).
* **CPU mark**: CPU X, CPU O or a coin flip that swaps sides every round.
* **Opening mark**: X, O, or alternate each round.
* **Undo** rolls back to the position where it was your turn again.

## Themes

Eight colour schemes (Neon Violet, Arctic, Amber Dusk, Emerald Groves, Graphite, Rose Marble,
Cyber Lime, Ocean Deep) change the board frame, tiles, pieces, grid lines, lights, bloom and the
whole DOM palette together. "Shuffle colours" re-rolls the X/O/grid hues while keeping the scheme,
and nine colour pickers override any preset on top of it. Scene colours ease between values, so
switching a theme animates instead of snapping.

## How it is built

```
src/
  game/       rules, minimax AI, game & settings state, localStorage save
  three/      scene, board meshes, camera rig, animation helpers
  components/ Board3D, FocusBar, Icons, ScoreCard, SettingsModal
  hooks/      media queries, WebAudio blips
  theme/      colour math, presets, UI tokens
  App.tsx     assembles the play area and the settings modal
  styles.css  everything, driven by CSS custom properties from the active theme
tests/        rules, AI and theme tests (vitest)
```

* **Game logic** lives in `src/game/` and has no dependency on three.js or React, so it can be —
  and is — tested on its own.
* **AI** (`src/game/ai.ts`) is negamax with alpha-beta pruning and a per-difficulty profile:
  search depth plus a "blunder" chance. Forced wins and blocks are always played, so a blunder
  roll cannot throw away a game that is already decided.
* **Rendering** (`src/three/`) is a `SceneController` that owns the renderer, the post-processing
  composer (bloom + ACES tonemapping + output pass), an environment map for the metal pieces, a
  gradient sky, a soft ground shadow and the camera rig. `Board3D.tsx` keeps it mounted and feeds
  it React state; pointer raycasting turns clicks into board indices.
* **Themes** (`src/theme/`) produce one `ThemePalette` that drives both the scene and, through
  `uiTokens()`, the CSS variables the DOM uses.
* Settings, theme and score are saved to `localStorage` under `tic-tac-toe-3d:v1`.

## Notes

* Motion is optional: reduced-motion settings and the system preference are respected, and the
  camera intro, piece drops and winning beam are skipped when it is on.
* Sound is generated in the Web Audio API — no audio files.
* Tests: `npm run test` covers the rules, the eight winning lines, tactics and the claim that the
  Unbeatable level cannot lose.
