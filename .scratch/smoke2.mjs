// Node harness: imports every src/ module and runs a headless buildWorld+tickWorld loop.
import './domstub.mjs';
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);

import '../src/config.js';
import '../src/core/utils.js';
import '../src/world/hex.js';
import '../src/world/galaxy.js';
import '../src/customization/fitting.js';
import '../src/systems/economy.js';
import '../src/systems/missions.js';
import '../src/core/save.js';
import '../src/entities/entities.js';
import '../src/systems/flight.js';
import '../src/systems/combat.js';
import '../src/systems/ai.js';
import '../src/world/sector.js';
import '../src/systems/world-tick.js';
import '../src/station/layout.js';
import '../src/station/avatar.js';
import '../src/render/frame.js';
import '../src/render/starfield.js';
import '../src/render/shipart.js';
import '../src/render/fx.js';
import '../src/render/spritecache.js';
import '../src/render/flight.js';
import '../src/render/stationview.js';
import '../src/render/hud.js';
import '../src/render/mapview.js';
import '../src/core/input.js';
import '../src/core/audio.js';
import '../src/game.js';
import '../src/ui/dom.js';
import '../src/ui/ui.js';
import '../src/ui/canvasfx.js';
import '../src/main.js';

import { buildWorld, spawnEncounters } from '../src/world/sector.js';
import { tickWorld } from '../src/systems/world-tick.js';
import { freshGame } from '../src/core/save.js';
import { generateSector, START_SECTOR, securityAt } from '../src/world/galaxy.js';
import { Input } from '../src/core/input.js';
import { Effects } from '../src/render/fx.js';
import { shipStats } from '../src/customization/fitting.js';

console.log("=== HexSpace Smoke Test 2 ===");
const state = freshGame();
const sector = generateSector(state.seed, START_SECTOR.q, START_SECTOR.r);
const stats = shipStats(state.hull, state.fit);
const sheet = state.sheet;
const input = new Input(null);
const effects = new Effects();

console.log("1. Building world...");
const world = buildWorld(state, sector, stats, "station");
console.log(`   Player at ${world.player.x},${world.player.y} · HP ${world.player.hp}`);
console.log(`   Station ${world.station?.name ?? "none"} · Enemies ${world.enemies.length}`);

console.log("2. Spawning encounters...");
spawnEncounters(world, sector, state);
console.log(`   Enemies after spawn ${world.enemies.length}`);

console.log("3. Ticking world (10 steps)...");
for (let i = 0; i < 10; i++) {
  tickWorld(world, 0.016, input, effects);
}
console.log(`   Player after tick ${world.player.x.toFixed(2)},${world.player.y.toFixed(2)} · HP ${world.player.hp}`);
console.log("=== Smoke Test 2 PASSED ===");
process.exit(0);
