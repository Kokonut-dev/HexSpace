# HexSpace

A single-player browser space RPG. Fly the Wayfarer, salvage a signal, dock at Meridian Outpost, and turn local contracts into better equipment before jumping to the frontier.

## Play locally

Run `npm start` (Python 3 required) and visit `http://localhost:8000`. No package install or build is necessary to play. `npm test` runs the simulation and save tests with Node.js 22. The game uses a dependency-free architecture (no external libraries like Phaser or Howler) and procedural pixel art generation.

| Input                      | Action                                     |
| -------------------------- | ------------------------------------------ |
| WASD or arrow keys         | Thrust or walk                             |
| Mouse                      | Aim                                        |
| Space or left mouse button | Fire                                       |
| E                          | Interact with a nearby contact or terminal |
| M                          | Galaxy chart                               |
| Escape                     | Close overlay                              |

On touch devices, use the direction buttons, tap the viewport to aim, then hold Fire. Select the music button to enable sound. Flight assist brakes the ship when you release thrust; disable it to coast. Dock before fitting equipment and undock before jumping. The airlock is at the bottom of the station. Progress autosaves in browser-local storage; saves do not sync across devices or origins.

## Deploy to GitHub Pages

1. Put the repository files on the branch you want to publish.
2. In repository **Settings → Pages**, select **Deploy from a branch**, choose that branch and **/ (root)**, and save.
3. Open the URL reported by Pages. The game uses relative paths and requires no server, secrets, build, or base-URL changes. Add a `.nojekyll` file in the root if needed to prevent Jekyll processing.

See [the architecture blueprint](docs/ARCHITECTURE.md) for design references, state transitions and data contracts. The game currently offers a compact progression loop with two playable hulls, one hired support wingmate, and seeded frontier sectors. It is not a fleet-command simulator; faction control is generated, not simulated continuously.

## Development & Architecture

- **Architecture**: Pure client-side HTML5/CSS3/JS (dependency-free, no-asset architecture). 2.5D pixel-art open-world space exploration/RPG.
- **Modules**: `src/{config,core,entities,systems,customization,station,world,ui}/`, `index.html`, `css/style.css`.
- **Tests**: Run `node --test test/game.test.js` (covers contracts, 2.5D interior/avatar, render stubs, economy, fitting, save/load/export, simulation tick).
- **Deployment**: GitHub Pages root deployment (relative paths, `.nojekyll`).

## Old Prototype

The previous Phaser 3 / PixiJS prototype and vendor dependencies (`vendor/`, `phaser/`, `howler/`) have been removed in favor of the new dependency-free architecture. See `docs/BLUEPRINT.md` (superseded) and `docs/ARCHITECTURE.md` (authoritative).
