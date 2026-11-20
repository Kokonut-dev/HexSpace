# HexSpace: system blueprint

## Design synthesis

Comparative design analysis of established mechanics, not new playtesting:

| Reference       | What sustains engagement                                                   | HexSpace application                                                           |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Starsector      | Fleet readiness, fittings and regional prices make preparation meaningful  | Power, mass, cooling and cargo compete for the same budget                     |
| Freelancer      | Mouse flight and recognizable landmarks make an open map legible           | Mouse aim, assist and one-button docking put navigation first                  |
| Escape Velocity | Small jobs and price differences turn each trip into a decision            | Combine cargo trading, contracts and opportunistic salvage                     |
| No Man’s Sky    | Discoveries alternate with gathering and upgrades; repetition needs relief | Give sectors distinct points of interest and alternate scan, travel and combat |
| EVE Online      | Security and geographic price differences put a price on risk              | Show security, ownership and prices explicitly; avoid offline grind            |
| Everspace 2     | Immediate combat feedback makes a ship build feel concrete                 | Module stats affect movement and firing, not just a rating                     |
| Sunless Skies   | Ports and rumors give stretches of travel emotional contrast               | Walkable stations and short local dialogue break up flight                     |

Loop: spot a signal → choose the risk → fly, fight or gather → dock → turn loot into a better fit → reach farther. Preserve agency through clear tooltips, short interactions and no offline penalties.

## Runtime and state

Static ES modules; Phaser supplies a pixelated Canvas renderer, Howler plays synthesized cues, and localStorage stores a versioned snapshot. Simulation and content rules live outside the renderer; DOM controls expose menus and touch actions. One frame update caps delta after a suspended tab. World generation is seeded per axial coordinate; economic time advances on player actions, not wall time.

```text
Boot → restore or new → Flight ← undock ← Station
                           ↕                ↕
                      Galaxy map       Services / fitting
                           ↓
                      Adjacent jump → Flight
Flight → hull loss → emergency recovery → Flight
```

## Data contracts

- **Ship**: hull class, installed slot-to-module mapping, hull/shield/heat, position/velocity, cargo quantities. Derived stats: draw, capacity, mass, thrust, cooling, cargo, damage.
- **Item**: stable commodity ID, display name, base price; cargo stores nonnegative integer counts.
- **Module**: stable ID, slot type, price, mass, draw, plus optional capacity, thrust, damage, shield, cooling and cargo modifiers.
- **Station**: sector-local coordinate, name, four service rooms and collision bounds; market quotes derive from sector stats and trade history.
- **Sector**: axial q/r, deterministic seed, security, faction, resource richness and generated POIs. Neighbor distance uses cube-coordinate distance.
- **Save**: version, current coordinates, credits, fittings, cargo, reputation, contract, visited sectors, resolved POIs and action clock. Transient input and particles are never serialized.

## Frontier simulation

Regions are evaluated on demand; crossing one does not start background simulation for the infinite grid. Every 12 actions the regional competition modifier advances to the next deterministic epoch. Mission payouts and raider defeats add persistent, capped influence in the current hex, and the chart marks closely matched territories as contested. Security and contested status feed station quotes alongside market pressure and local abundance. The home sector remains protected.

Every six actions, contract boards rotate their destinations, quantities, and payouts. Accepted offers store a copy so their terms do not change mid-flight. Bounties and courier runs point to a specific hex; the objective tracker highlights it on the map when in range. Some frontier hexes contain ion nebulae that cut cooling to 42% of normal, giving cooling modules a distinct use beyond weapon upgrades.

### Roadmap audit

| Step                     | Implemented                                                                                                                    | Remaining or not verified                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1. Blueprint             | Comparative game-design analysis, state flow and data contracts                                                                | No new playtesting study                             |
| 2. Browser shell         | Responsive Phaser Canvas, static paths, vendored dependencies                                                                  | Device-wide performance qualification                |
| 3. Flight                | Inertia, assist, mouse aim, weapon heat, particles, destructible ore, enemy AI                                                 | More varied combat encounters                        |
| 4. Fitting               | Typed hardpoints, fitting diagram, weight/power/heat/cargo checks, hull purchases and resale                                   | More hull silhouettes and hull-specific slot layouts |
| 5. Stations              | Walkable room layout, seeded props, collision, terminals and NPCs                                                              | Additional station themes and dialogue arcs          |
| 6. Universe              | Adjacent travel, market quotes, contestable frontier control, procedural contracts and events, recruitable squadron            | Squadron combat, not a strategic fleet simulator     |
| 7. Polish and deployment | Runtime sprites, synth audio, CRT treatment, light-driven shadows, WebGL bloom with Canvas fallback, autosave, deployable root | Physical-device frame-rate benchmarks                |

### Design trade-offs and acceptance criteria

- **Starsector / EVE Online:** regional price spreads create route planning only when the player can inspect both danger and reward. HexSpace uses bounded market pressure and visible security, without offline timers or other players controlling access.
- **Freelancer / Escape Velocity:** visible destinations and short station visits make the next action obvious. A sector should offer useful work even if the player ignores the current contract; refits must not require replaying a docking cutscene.
- **No Man’s Sky / Sunless Skies:** repeatable systems need recognizable local character. Station layouts, named contacts, rumors, distinct salvage events and hazards should contrast with the quiet of flight. Discovery alone is not a substitute for meaningful rewards.
- **Everspace 2:** equipment should change the feel of combat, not just the damage number. A build that runs hot inside a nebula should behave differently from one using efficient guns and extra cooling.

Release checks: reach every service from the airlock, finish a contract after reload, compare fitted and unfitted telemetry, make an adjacent jump, and inspect the hosted build from a project subpath without external requests. Measure physical-device frame time separately from simulated update rates.
