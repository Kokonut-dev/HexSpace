# HexSpace — Architecture

HexSpace is a root-served, client-only browser game. The live app has no runtime package dependencies, API calls, backend, build step, or remotely hosted fonts/assets. It runs from `index.html` on GitHub Pages and uses relative ES-module and CSS paths.

## Stack

| Concern | Implementation |
|---|---|
| Rendering | Canvas2D pixel framebuffer, fixed 270 px height, nearest-neighbour upscale |
| Simulation | Modular ES modules with plain state objects and fixed 60 Hz updates |
| Audio | Procedural Web Audio synthesis; initialized after a user gesture |
| UI | DOM/CSS menus and HUD around the game canvas; touch controls included |
| Persistence | Versioned, validated localStorage save, export/import checksum |
| Content | Seeded hex sectors, station layouts, encounters, markets, jobs and story |

The core remains dependency-free. Phaser/Howler were removed after the low-resolution custom renderer and small synthesized-audio layer became a better fit for the self-contained Pages target.

## Module map

```text
index.html                    root document and relative entry point
.nojekyll                     keep GitHub Pages from transforming static files
css/style.css                 responsive theme, chrome, touch and modal styling
docs/GAME-DESIGN.md           design and gameplay reference
docs/GITHUB-PAGES.md          deployment and save-origin guidance
src/config.js                 balance, content and palette data
src/core/utils.js             math, seeded PRNG, formatting and DOM helpers
src/core/save.js              save schema, validation, migration, import/export
src/core/input.js             keyboard, pointer and touch intent
src/core/audio.js             synthesized music bed, engine and SFX
src/world/hex.js              axial hex math and projection
src/world/galaxy.js           deterministic sectors, routes and travel rules
src/world/sector.js           runtime encounter/POI construction
src/entities/entities.js      entity factories
src/customization/fitting.js  hull/module fitting and derived ship stats
src/systems/flight.js         Newtonian thrust, assist and bounds
src/systems/combat.js         weapons, damage, loot and projectiles
src/systems/ai.js             enemy and wingmate behavior
src/systems/economy.js        persistent market stock, trade, cargo and refuel
src/systems/missions.js       jobs, progression, story objectives and rewards
src/station/layout.js         seeded rooms, props, collision and walkable spawn
src/station/avatar.js         on-foot movement and interactable probing
src/render/frame.js           low-resolution framebuffer and camera
src/render/shipart.js         procedural sprite baking
src/render/spritecache.js     generated art caches and draw helpers
src/render/flight.js          flight scene
src/render/stationview.js     2.5D station interior
src/render/mapview.js         hex galaxy map
src/render/hud.js             canvas HUD and post effects
src/ui/dom.js                 safe DOM builder primitives
src/ui/ui.js                  chrome, market, map, fitting, missions and menus
src/ui/canvasfx.js            title edge decoration
src/game.js                   orchestration, transitions, persistence and actions
src/main.js                   composition root, rendering wiring and fixed-step loop
test/game.test.js             Node regression tests
```

## Runtime flow

`main.js` creates UI chrome first, then the framebuffer, art/input services and game. The UI receives its Game reference after both are constructed so the DOM event handlers can resolve the game without a construction cycle. The animation loop caps long tab-resume gaps, advances simulation in 1/60-second ticks, and renders once per browser frame.

```text
input.poll → flight physics / combat / AI / missions → effects → render
                 └─ station mode: avatar collision + interaction probe
```

Opening a modal pauses the simulation while UI events, effects and autosave continue. Map overlays are drawn from deterministic sector data; the player must undock before travel.

## 2.5D and pixel contracts

- `PixelFrame` fixes framebuffer height at 270 and clamps width to configured bounds. Camera positions snap to pixels.
- Ship images are procedurally baked at scale 2 for 32 headings; fitting changes invalidate the player's cached bake.
- Station decks are 960×600. Wall faces extrude 22 px; actors/props sort on foot-Y; room signs and light pools complete the depth cues.
- Avatar speed is 132 px/s with axis-separated wall sliding. Station generation relocates an obstructed preferred spawn to a nearby walkable point with open movement exits.
- CRT scanlines, vignette and damage/warp effects render into the framebuffer so their pixel grid remains aligned at every viewport size.

## Persistence and economy

A save is validated field-by-field on load; unsupported hulls/modules and malformed values are sanitized. Market records are stored under axial sector keys so stock changes survive leaving and revisiting a port. Transaction functions validate commodity, quantity, stock, credits and cargo capacity before mutation. `pagehide`, hidden-tab transitions, autosave intervals and key progression actions request saves; storage errors surface in the UI rather than crashing the game. Export/import gives users a portable save between browser origins.

## Verification

Run `npm test` with Node.js 22. The suite covers deterministic generation, flight/simulation, fitting, missions, market persistence and transaction accounting, refuelling, station walkability/avatar movement, and save round trips. The `.scratch/smoke1.mjs`, `smoke2.mjs`, and `smoke3.mjs` scripts provide additional end-to-end logic, simulation, and station-render checks. `find src test -name '*.js' -print0 | xargs -0 -n1 node --check` checks source syntax.

A real browser visual pass is still recommended before release; headless-browser installation was not available in the build environment. The DOM integration can be module-loaded and the market screen builder exercised with the repository's Node DOM stub, but that does not replace browser QA.
