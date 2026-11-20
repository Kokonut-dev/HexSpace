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
