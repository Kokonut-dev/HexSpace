# HexSpace — Game Design

> A single-player, browser-native space RPG: fly a fragile shuttle out of the core,
> take contracts, fit your hull in a hangar, walk the station decks, and push into
> hex sectors where nobody answers your distress call.

## 1. Research synthesis

What actually sustains a single-player open-world space game — and how HexSpace applies it:

| Reference         | What sustains engagement                                                        | HexSpace application                                                                    |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Starsector**    | Preparation is the game: fittings, crew, supplies, and retreat decisions matter. | Power draw, heat, mass and hardpoint layout compete for one budget. Loadouts change how you fly. |
| **Freelancer**    | Mouse flight plus landmarks makes an open map legible and immediately fun.       | Direct mouse aim, drift-flight toggle, a station and gate visible from spawn.            |
| **Escape Velocity** | Small jobs, price spreads and a bigger hull always one good run away.          | Hand-authored market biomes, delivery runs, escalating hull tiers, rank gates.           |
| **No Man's Sky**  | Discovery alternates with gathering; variety has to fight repetition.            | Every sector is seeded with a different mix of wrecks, signals, fields and hazards.      |
| **EVE Online**    | Security rating and geography give risk a price.                                 | High-sec → low-sec → anarchy → deep void; richer goods and worse company as you go out.  |
| **Everspace 2**   | Immediate combat feedback makes a build feel concrete.                           | Shield/hull split, hit flashes, screen shake, kill slow-mo, module-specific muzzle art.  |
| **Sunless Skies** | Ports and voices give travel emotional contrast.                                 | Walkable station decks, barkeeps with rumours, short local dialogue.                     |

Deliberate anti-patterns avoided: offline timers, daily chores, unavoidable damage,
inventory micromanagement, and procgen that erases hand-authored pacing (the story
chain is fixed; the surrounding galaxy is seeded).

## 2. The five pillars

1. **Frictionless agency** — Flight ⇄ dock ⇄ walk ⇄ market is one button and under a
   second. No loading, no menus between you and the next decision.
2. **Tactile build depth** — Every module is something you can see on the hull and feel
   in the physics: power draw browns you out, heat locks your guns, mass costs agility.
3. **Living frontier** — Seeded economies, faction standing, dynamic job boards,
   patrols, distress signals, ambushes and a sector map you slowly colour in.
4. **Atmosphere** — A 480×270 pixel framebuffer, seven-layer parallax, additive glows,
   scanlines, and a synth score generated at runtime (no audio files).
5. **Progression you can see** — Shuttle → corvette → frigate, each hull visibly
   larger, each jump reaching further, until the Silent Gate is in range.

## 3. Core loop

```
  accept contract ──► fly / fight / mine / scan ──► dock ──► sell, repair, refit
         ▲                                              │
         └────────── jump to a new hex ◄────────────────┘
```

Session shape: 3–6 minute sorties, 20–40 minute arcs, 6–10 hour completion path
(story chain + fleet-tier completion). Autosave means any browser tab close is safe.

## 4. Flight & combat

- **Controls** — mouse aim, WASD/arrows thrust, Shift afterburner, LMB/Space primary,
  RMB/F secondary (missiles), Q brake, E interact, Tab/F cycle target, M map, Esc menu.
- **Physics** — velocity integration with mass-scaled acceleration. Flight assist
  applies strong braking and speed cap; unassisted flight keeps momentum (drift).
  Afterburner dumps heat and doubles thrust for a short window.
- **Defences** — shield absorbs first, regenerates after 4 s without damage; hull does
  not regenerate (repair nanites excepted). Armor modules raise hull maxima.
- **Heat** — each weapon shot adds heat; radiators remove it continuously. At 100% the
  guns lock until heat drops below 40% (`OVERHEAT` HUD state).
- **Power** — if total draw exceeds reactor capacity, weapons and shields enter
  brownout (reduced output), shown in red everywhere. Over-fitting is allowed; it just
  flies badly.
- **Targeting** — lead indicator solved from projectile speed and target velocity;
  target lock shows hull/shield bars, distance and hostility.
- **Enemies** — scouts strafe at range, raiders orbit and close, gunships hold a line,
  enforcers snipe, the Warlord and Gatekeeper use missiles and heavy batteries.
  All ships flee below 20% hull unless the pilot is a boss.
- **Death** — hull loss triggers an escape-pod recovery at the nearest station:
  cargo lost, 15% credits docked, ship restored. No permadeath, real sting.

## 5. Galaxy & sectors

Axial hex grid, seeded but stable forever for a given campaign seed. Distance from
the core sets security, wealth, tech level and danger:

| Ring   | Security | Controlling powers        | Character                                 |
| ------ | -------- | ------------------------- | ----------------------------------------- |
| 0–1    | High     | United Systems            | Safe ports, tutorial-grade jobs, best prices for legal goods |
| 2–4    | Low      | USS / Helix Combine       | Contested, profitable, patrols are thin    |
| 5–8    | Anarchy  | Free Corsairs             | Warlord territory, contraband markets       |
| 9+     | Deep     | None                      | Rich anomalies, no stations, the story ends here |

Sector contents: station (type/economy/tech), 2–4 asteroid clusters, derelicts,
unknown signals, nebulae (sensor masking), planets, and a jump gate at the rim.
The **Silent Gate** and **The Maw** are hand-placed story sectors.

Travel: fly to the gate and jump, or install a **Warp Coil** to jump anywhere within
range. Jumps cost warp charge; charge refills at stations and trickles back in nebulae
or with a fuel scoop. Stranded pilots can call a tow for credits.

## 6. Economy

Ten commodities with different legal status. Prices derive from a station's economy
biome, security, wealth, faction standing, stock level, and recent player trades.
Buying raises the local price, selling lowers it, and stock is finite. Contraband
(Halcyon Bloom) sells high in anarchy and triggers fines in high-sec.

Job board per station: bounty, delivery, survey, salvage recovery, patrol sweep and
smuggling runs, gated by rank and standing. Up to four active contracts. Story
contracts appear at faction HQ and drive the four-act finale.

## 7. Stations (on foot)

Procedurally assembled interiors per station type — hangar, market, cantina, faction
HQ, clinic, shipyard — joined by corridors with props, signage, NPCs and animated
terminals. 2.5D: walls have visible faces, characters and props sort by floor depth,
lights pool on the deck. NPCs wander, idle and offer dialogue with hints and quests.

Interacting with a terminal opens the matching screen: fitting, market, contracts,
shipyard, faction office, clinic. Everything is reachable by walking; nothing is a
canvas menu you cannot see from the deck.

## 8. Presentation

- **Framebuffer** — fixed 480×270 logical pixels (width follows aspect), upscaled with
  nearest-neighbour; all world art is drawn into that buffer for true pixel cohesion.
- **Art** — procedural sprites for hulls, modules, stations, asteroids, avatars and
  tiles, generated at boot, plus pre-rendered 32-heading ship rotations.
- **FX** — engine plumes, muzzle flashes, shield ripples, debris, additive glows,
  parallax starfield with nebulae, screen shake, hit flash, kill slow-mo, warp streaks.
- **Audio** — WebAudio synthesis only: layered ambient score, engine hum tied to
  thrust, weapon, explosion, UI, dock and jump cues. Volume + mute persisted.
- **UI** — DOM HUD over the canvas (crisp text, accessible buttons) with a pixel
  radar; modal screens for map, fitting, market, contracts, dialogue and settings.

## 9. Onboarding

Cold open in high-sec: a starter contract in the log, the station and gate beacons
already on radar, and a two-line prompt. Tooltips explain power/heat/mass the first
time the fitting bay opens. No unskippable cutscene; the story arrives at the HQ.

## 10. Scope honesty

One solar system's worth of hand-tuned numbers, infinite-seeming seeded sectors,
two factions plus corsairs, five hulls, ~30 modules, ten goods, six job types and one
story chain. It is a complete, finishable game — not a fleet simulator or an MMO.
