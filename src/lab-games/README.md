# Kitchen Lab and Chemistry Lab

Two offline 3D science games for a five-year-old, built from one codebase. They run as single HTML files
on a locked-down Windows tablet (Edge in a kiosk), launched from the KidTablet home screen.

## Build and test
```
npm ci                # installs three.js r149, esbuild, the WebXR hand models
npm run build         # dist/kitchen-lab.html and dist/chemistry-lab.html
npm test              # node build for tests, then all six suites
```
`node build.mjs` builds Kitchen Lab, `node build.mjs chem` builds Chemistry Lab, `node build.mjs node`
builds `dist/game.node.js`, which the 3D test suite runs headlessly (WebGL stubbed).

## Where to look
The game logic is `src/sim.js` (about 100 KB) and `src/view.js` (about 120 KB): search them rather than reading them whole.

## Layout
| Path | What |
|---|---|
| `src/sim.js` | The simulation: pot/beaker liquids and layers, heat, objects and physics, reactions, recipes and experiments, basket inventory, areas. Plain JS, no DOM; the 5 simulation suites eval it directly. |
| `src/view.js` | Rendering (three.js), first-person hands, input, UI, labels, areas (counter, fridge, pantry, cabinets, oven), the lab look. |
| `src/models.js`, `src/colormap.js` | **Generated data, don't open them** (1.9 MB of embedded models, 350 KB of palette pixels). `build.mjs` rewrites `models.js` from `models/`. |
| `page.html` | Page shell, CSS, buttons. Chemistry Lab text swaps happen in `build.mjs`. |
| `models/` | CC0 Kenney GLB models (food kit, furniture kit). All share one palette image. |
| `build.mjs` | Bundles everything into one self-contained HTML file per game. |
| `tests/` | `render3d` (scene, hands, layout, z-fighting audit, labels, touch flows), `recipes` (every Kitchen Lab recipe end to end), `features`, `core`, `blender`, `chemistry` (every experiment end to end, plus control cases). |

## One codebase, two games
`build.mjs` defines `APP` ('kitchen' or 'chem'). `sim.js` reads it as `LAB`. The shared engine has all
the chemistry; each game differs only by what is stocked (`STORAGE`), its recipes/experiments (`RECIPES`,
`RECIPE_CATS`), names, and look (`LAB === 'chem'` branches in `view.js`: lab bench, hot plate, beaker,
lab glassware and containers). Changes to the engine affect both games: run the whole suite.

## Constraints that keep it working on her tablet
- **Fully self-contained and offline.** No fetch, no blob: or data: image URLs, no external files at runtime.
  The palette texture is decoded at build time into raw pixels and built as a DataTexture. Strict
  page policies (the kiosk, some viewers) block the other routes.
- **Touch first.** Pointer events; big targets; a slim area pill on the left, tools pill on the right,
  basket strip along the bottom. Layout tests check nothing important sits under them.
- **Kid safety rules in the game:** hot pot, blades, hot oven, lit burner and knife-on-hand give the
  "Ouch! Ouch! Ouch!" reaction (spoken with an offline Windows voice). Keep new dangers consistent.
- **No z-fighting:** `render3d` audits every pair of surfaces for coincident faces; offset new geometry.
- **Everything is tested in the real simulation:** recipes and experiments are completed with real
  pours, heat, stirring and tools, alongside control cases that must NOT trigger.

## Deploying
Copy `dist/kitchen-lab.html` / `dist/chemistry-lab.html` to the tablet setup package (`apps\`), then on the tablet:
`Add-KidLocalApp -Name 'Kitchen Lab' -Path .\kitchen-lab.html` (same for Chemistry Lab), or run `Install-KidApps.ps1`.
