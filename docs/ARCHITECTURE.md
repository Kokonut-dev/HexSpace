# HexSpace — Architecture

Zero-build static ES modules. No runtime dependencies, no network calls, no backend.
Everything below runs from the repository root on GitHub Pages.

## 1. Stack decision

| Layer      | Choice                                            | Why                                                                   |
| ---------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Rendering  | Hand-written Canvas2D pixel pipeline               | Deterministic 480×270 framebuffer, no 1.2 MB engine, Node-testable draw code, lossless nearest-neighbour upscale |
| Audio      | WebAudio synthesis (`core/audio.js`)               | Zero audio assets, instant load, engine hum and score react to play state |
| Simulation | Pure ES modules over plain state objects           | Unit-testable without DOM or GPU                                      |
| UI         | DOM + CSS over the canvas                          | Crisp text, native accessibility, touch targets, no font raster cost  |
| Storage    | `localStorage` with schema validation + migration  | Simple, synchronous, survives tabs; export/import as base64           |

Phaser/Howler were evaluated and removed: the fixed low-resolution framebuffer makes a
general engine's scene graph redundant, and a dependency-free renderer keeps load
instant and every draw path testable in Node.

## 2. Module map

```
index.html                  canvas + HUD skeleton + screen root
css/style.css               shell, HUD, modal screens, responsive + touch
src/config.js               all tunables: factions, goods, hulls, modules, enemies, balance
src/core/utils.js           math, seeded RNG, formatting, DOM helpers
src/core/save.js            schema validation, migration, export/import
src/core/audio.js           WebAudio synthesis: score, ambience, SFX bus
src/core/input.js           keyboard/pointer/touch -> abstract intent
src/world/hex.js            axial hex math, layout, picking
src/world/galaxy.js         seeded sectors, factions, POIs, travel rules
src/world/sector.js         runtime world construction for one sector
src/entities/entities.js    factories: ships, rocks, wrecks, pickups, projectiles
src/customization/fitting.js  slots, aggregate stats, install/buy, repairs
src/customization/shipart.js  procedural sprite generation (ships, stations, avatars)
src/systems/flight.js       thrust, assist, drag, bounds, afterburner
src/systems/combat.js       firing, projectiles, missiles, damage, loot
src/systems/ai.js           enemy/friendly ship behaviour
src/systems/economy.js      prices, stock, buy/sell, market drift
src/systems/missions.js     job generation, acceptance, progress, rewards, story
src/station/layout.js       seeded interior layout, collision, interaction zones
src/station/avatar.js       on-foot movement, animation clock, interactables
src/station/art.js          floor/wall pre-render, props, depth-sorted draw
src/render/frame.js         framebuffer, resize, letterbox-free aspect, CRT overlay
src/render/fx.js            particles, floaters, shake, flashes, warp streaks
src/render/starfield.js     parallax stars, nebulae, planets
src/render/flight.js        flight-scene draw
src/render/station.js       station-scene draw
src/render/map.js           galaxy map draw
src/ui/hud.js               DOM HUD bindings
src/ui/screens.js           title, map, fitting, market, contracts, dialogue, settings…
src/game.js                 mode state machine, tick, transitions, autosave, wiring
src/main.js                 boot, resize, global error surface
test/*.test.js              node:test suites (logic + headless simulation)
```

## 3. State machine

```
        ┌──────────┐  new/continue   ┌────────────┐
        │  TITLE   │────────────────►│   FLIGHT   │◄───────────┐
        └──────────┘                 └─────┬──────┘            │
             ▲                             │ near station + E  │ undock (airlock)
             │ hull lost                   ▼                   │
        ┌────┴─────┐  tow/restart   ┌────────────┐             │
        │ GAME OVER│◄───────────────│  DOCKING   │             │
        └──────────┘                └─────┬──────┘             │
                                          ▼                    │
                                    ┌────────────┐             │
                                    │  STATION   │─────────────┘
                                    └─────┬──────┘
   overlays (pause simulation): GALAXY MAP, FITTING, MARKET, CONTRACTS, DIALOGUE,
   SHIPYARD, CLINIC, SETTINGS, HELP, CODEX, STORY, ENDING
```

`game.mode` holds the base mode (`title|flight|station|gameover|ending`), `game.screen`
holds an optional overlay. Esc always closes overlays; the map is accessible in flight
(and when docked for planning, but jumping requires undocking).

## 4. Tick pipeline (fixed 60 Hz accumulator)

```
input.poll()
  ├─ overlay screen? → drain UI events, render, return
  └─ flight:
       flight.stepPlayer()      aim, thrust, drag, afterburner, bounds
       combat.stepFire()        heat, cooldown, spawn projectiles/missiles
       ai.step()                friendly/hostile steering, shooting
       combat.stepProjectiles() collisions, shield/hull, hits, destruction
       combat.stepPickups()      tractor range, collection, objective events
       mission progress events  kills, scans, dockings, deliveries
       fx.step()                particles, floaters, shake decay, slow-mo timer
       render.flight()          world + HUD-anchored canvas elements
     station:
       avatar.step()            walk, collision, animation
       interaction probe        nearest terminal/NPC prompt
       render.station()         floor, depth-sorted entities, lights, player
```

Simulation is deterministic given (state, input, dt); randomness uses a per-session
seeded PRNG (`state.seed` counters) so replays and tests are stable.

## 5. Data contracts

```ts
// Ship (persisted)
{ hull: 'kestrel', fit: { w1: 'autocannon'|null, e1: 'ionDrive', … },
  hp: 90, shieldMax: 55, heat: 12, warp: 100, name: 'Wayfarer', paint: 0 }

// Stat sheet (derived, never persisted)
{ mass, power, draw, thrust, shield, hull, cool, cargo, sensor,
  jumpRange, jumpCostMod, weapons: [{ slot, def, cooldown, heat }],
  secondary: {...}|null, repair, scoop, targeting, ecm }

// Sector (deterministic from q,r,seed)
{ q, r, key, name, depth, security: 'high'|'low'|'anarchy'|'deep',
  faction: 'uss'|'helix'|'corsair'|'indie', economy: 'trade'|…,
  techLevel, wealth, danger, station|null, pois: [...], tradeBias: { id: ±% } }

// Mission
{ id, type: 'bounty'|'delivery'|'survey'|'salvage'|'patrol'|'smuggle'|'story',
  issuer, faction, from, target: { q, r }, reward, rep, rank,
  cargo?: { id, qty }, progress, goal, title, brief, story? }

// Save (version 2)
{ version, seed, credits, ship, cargo, ownedModules, ownedHulls,
  rep, rank, story, pos, docked, missions, boardEpoch, market,
  discovered: { 'q,r': { visited, scanned: [], cleared: [], looted: [] } },
  stats, settings, log }
```

`discovered` is the only per-sector mutable world record; runtime entities are rebuilt
from the sector seed on entry, then filtered by `cleared`/`looted` so consequences stick.

## 6. Rendering rules

- World units = framebuffer pixels. Camera has integer translation; sprites are
  pre-rendered at native scale and rotated in 32 baked headings (no runtime rotation
  blur) unless the source is a simple primitive.
- Draw order: parallax background → nebula → far bodies → pickups/wrecks → asteroids →
  ships → projectiles → particles → foreground lights → canvas HUD cues.
- Additive lighting uses `globalCompositeOperation = 'lighter'` with pre-rendered
  radial glow sprites; capped per frame for mobile cost.
- Station interiors render floors/walls from a pre-rendered canvas, then sort props,
  NPCs and the player by `y + feet`, draw wall faces, decals and light pools last.
- The framebuffer is resized on window resize (height fixed at 270, width =
  `round(270 * aspect)` clamped 400–720) and CSS-scaled with `image-rendering: pixelated`.

## 7. Persistence & anti-corruption

- All loaded values are clamped/type-checked; unknown modules/hulls are dropped.
- Version 1 saves (previous prototype) migrate into the new schema with default
  mappings rather than being discarded.
- Writes are debounced (2 s) and forced on dock, jump, purchase, mission completion
  and `pagehide`. Storage exceptions fall back to an in-memory save and surface a
  status pill; the game never crashes on quota errors.
- Export/import uses base64 JSON with a checksum, so pilots can move a campaign
  between devices without a backend.

## 8. Testing

`npm test` runs headless Node suites over the pure layers:

- hex math, galaxy determinism, faction/security derivation
- fitting aggregation, power brownout, slot validation, cost/ownership
- economy price monotonicity, stock limits, contraband rules
- combat damage resolution, heat lock, missile lifecycle
- mission generation/accept/progress/complete/fail
- save round-trip, malformed input, v1 migration, export/import
- station collision and interaction zones
- 10 000-tick headless flight simulation asserting finite state, bounded entities,
  projectile/particle reclamation

The render layer is deliberately side-effect-thin and takes a `ctx`, allowing a
recording mock in tests if draw calls are ever in question.
