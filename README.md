# HexSpace

A single-player browser space RPG. Fly the Wayfarer, salvage a signal, dock at Meridian Outpost, and turn local contracts into better equipment before jumping to the frontier.

## Play locally

Run `npm start` (Python 3 required) and visit `http://localhost:8000`. No package install or build is necessary to play. `npm test` runs the simulation and save tests with Node.js 22. Libraries are vendored for offline use after serving the files; their licenses are in `vendor/`.

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
3. Open the URL reported by Pages. The game uses relative paths and requires no server, secrets, build, or base-URL changes.

See [the system blueprint](docs/BLUEPRINT.md) for design references, state transitions and data contracts. Frontier ownership and security can shift as the action clock advances, and completing contracts or clearing raiders influences local control. Contract boards rotate, ion nebulae slow cooling, and a recruited fleet can escort, focus your selected target, or hold fire. Inactive purchased hulls can be sold at a shipyard.

The **Argosy** command cruiser is the late-game hull: more armor, cargo space, built-in reactor headroom and cooling, at the cost of extra mass. Desktop WebGL enables the bloom pass; touch devices use Canvas to keep rendering costs low. Add `?canvas=1` to force the fallback on desktop.

The repository’s [GitHub Pages site](https://kokonut-dev.github.io/HexSpace/) deploys from the root of `main`. Branch changes do not replace that build until they reach `main`.

The Wayfarer, Vanguard, and Argosy can field one, two, and three mercenaries respectively. Hire an interceptor, long-range gunship, or shield tender from the cantina; downsizing keeps extra pilots on reserve. Add `?perf=1` to show measured FPS and 95th-percentile frame time; combine with `&canvas=1` for renderer comparisons.
