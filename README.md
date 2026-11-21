# HexSpace

A single-player browser space RPG. Fly the Wayfarer, salvage a signal, dock at Meridian Outpost, and turn local contracts into better equipment before jumping to the frontier.

## Play locally

Run `npm start` (Python 3 required) and visit `http://localhost:8000`. No package install or build is necessary to play. `npm test` runs the simulation and save tests with Node.js 22. The game uses a dependency-free architecture (no external libraries like Phaser or Howler) and procedural pixel art generation.

| Input                      | Action                                     |
| -------------------------- | ------------------------------------------ |
| W / Up, S / Down           | Thrust forward / reverse along the nose     |
| A / Left, D / Right        | Strafe relative to the ship                 |
| Mouse                      | Aim; the nose turns toward the pointer      |
| Shift                      | Afterburner                                 |
| Q or X                     | Brake                                       |
| Space or left mouse button | Fire                                        |
| E or left click            | Use the nearest terminal; click a nearby station to dock |
| M                          | Galaxy chart                                |
| Escape                     | Close overlay                               |

On touch devices, use the direction buttons, tap the viewport to aim, then hold Fire. Select the music button to enable sound. Flight assist brakes the ship when you release thrust; disable it to coast. Dock before fitting equipment and undock before jumping. The airlock is at the bottom of the station. Progress autosaves in browser-local storage; saves do not sync across devices or origins.

## Deploy to GitHub Pages

Follow the [GitHub Pages deployment guide](docs/GITHUB-PAGES.md). Publish the repository root; the checked-in `.nojekyll` and relative asset paths are ready for a project page without a build, backend, secrets, or package installation.

See [the architecture guide](docs/ARCHITECTURE.md) for module boundaries, state transitions and data contracts. The game currently offers a compact progression loop with two playable hulls, one hired support wingmate, and seeded frontier sectors. It is not a fleet-command simulator; faction control is generated, not simulated continuously.

## Development & Architecture

- **Architecture**: Pure client-side HTML5/CSS3/JavaScript, procedurally generated pixel art, 2.5D interiors, and no runtime package dependencies.
- **Tests**: Run `npm test` with Node.js 22. The suite covers simulation, fitting, missions, persistent economy/refuelling, station movement and saves. Additional smoke scripts live under `.scratch/`.
- **Deployment**: GitHub Pages root deployment; see [docs/GITHUB-PAGES.md](docs/GITHUB-PAGES.md).

## Old Prototype

The previous Phaser 3 / PixiJS prototype and vendor dependencies (`vendor/`, `phaser/`, `howler/`) have been removed in favor of the new dependency-free architecture. See `docs/BLUEPRINT.md` (superseded) and `docs/ARCHITECTURE.md` (authoritative).
