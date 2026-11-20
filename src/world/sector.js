/**
 * Sector runtime: turn a generated sector into live entities.
 *
 * Deterministic layout (POI positions and rock fields come from the sector
 * seed), persistent consequences (`discovered` records what you already
 * scanned, looted and cleared), and encounter spawning scaled by danger.
 */
import { generateSector } from "./galaxy.js";
import { hexNeighbors } from "./hex.js";
import { createStationEntity, createWreck, createSignal, createGate, createPlanet, createNebula, createNpc, createEnemyShip, createPlayerShip, createAsteroid } from "../entities/entities.js";
import { seeded, rand, randInt, pick, clamp } from "../core/utils.js";
import { ENEMIES, GAME, PAL } from "../config.js";
import { spawnField } from "../systems/combat.js";
import { cargoUsed } from "../systems/economy.js";

const SPAWN_RADIUS = 2200;

function discovery(state, key) {
  state.discovered[key] = state.discovered[key] ?? { visited: false, scanned: [], cleared: [], looted: [] };
  const d = state.discovered[key];
  d.scanned = d.scanned ?? [];
  d.cleared = d.cleared ?? [];
  d.looted = d.looted ?? [];
  return d;
}

/**
 * Create the world for `sector` from a save state. `arrival` describes how the
 * player got here: 'station' (undock), 'gate' (through a gate), 'warp'.
 */
export function buildWorld(state, sector, stats, arrival = "gate") {
  const rng = seeded(state.seed, sector.q * 61.7, sector.r * 43.1);
  const disc = discovery(state, sector.key);
  disc.visited = true;

  const world = {
    state,
    sector,
    stats,
    time: 0,
    player: createPlayerShip(state, stats),
    enemies: [],
    rocks: [],
    wrecks: [],
    signals: [],
    gates: [],
    planets: [],
    nebulas: [],
    npcs: [],
    projectiles: [],
    missiles: [],
    pickups: [],
    debris: [],
    particles: [],
    events: [],
    target: null,
    aimAngle: -Math.PI / 2,
    input: { x: 0, y: 0, fire: false, boost: false, brake: false },
    wingman: null,
    station: null,
    interact: null,
    holdTarget: null,
    holdProgress: 0,
    playerAttackedFaction: null,
    shake: 0,
    worldTime: state.playSeconds ?? 0,
    story: sector.storyRole,
    cargoUsed: () => cargoUsed(state),
    nearestStation: null,
    ambush: null,
  };

  // ── Station ──────────────────────────────────────────────────────────────
  if (sector.station) {
    world.station = createStationEntity(sector.station, 0, -430);
    world.station.orbit = rng() * Math.PI * 2;
  }

  // ── POIs ────────────────────────────────────────────────────────────────
  for (const poi of sector.pois) {
    if (poi.kind === "field") {
      spawnField(world, poi);
    } else if (poi.kind === "wreck") {
      const looted = disc.looted.includes(poi.id);
      const w = createWreck(poi.x, poi.y, (poi.x * 13 + poi.y * 7) | 0, {
        id: poi.id,
        name: poi.story === "blackbox" ? "Sealed USS Hulk" : poi.id === "wreck1" ? "Breaker Hulk" : "Derelict Freighter",
        story: poi.story ?? null,
        loot: poi.story === "blackbox" ? { scrap: 3, relicCore: 1 } : { scrap: randInt(rng, 2, 6) },
      });
      w.salvaged = looted;
      world.wrecks.push(w);
    } else if (poi.kind === "signal") {
      const scanned = disc.scanned.includes(poi.id);
      const s = createSignal(poi.x, poi.y, (poi.x * 3 + poi.y * 19) | 0, {
        id: poi.id,
        name: poi.story === "beacon" ? "Repeating USS Beacon" : "Unknown Signal",
        story: poi.story ?? null,
        signalType: poi.story === "beacon" ? "beacon" : undefined,
      });
      s.scanned = scanned;
      world.signals.push(s);
    } else if (poi.kind === "gate") {
      world.gates.push(
        createGate(poi.x, poi.y, {
          name: sector.storyRole === "silentgate" ? "The Silent Gate" : "Lane Gate",
          silent: sector.storyRole === "silentgate",
          angle: Math.atan2(-poi.y, -poi.x) + Math.PI / 2,
        }),
      );
    } else if (poi.kind === "planet") {
      world.planets.push(createPlanet(poi));
    } else if (poi.kind === "nebula") {
      world.nebulas.push(createNebula(poi));
    } else if (poi.kind === "npc") {
      world.npcs.push(createNpc(poi));
    }
  }

  // Guarantee a gate if the sector has none (keeps the ring navigable).
  if (!world.gates.length && sector.storyRole !== "silentgate") {
    const a = rng() * Math.PI * 2;
    world.gates.push(createGate(Math.cos(a) * 900, Math.sin(a) * 900));
  }

  // ── Spawn point ──────────────────────────────────────────────────────────
  if (arrival === "station" && world.station) {
    world.player.x = world.station.x + 30;
    world.player.y = world.station.y + 150;
  } else if (arrival === "gate" && world.gates.length) {
    const g = world.gates[0];
    world.player.x = g.x + 60;
    world.player.y = g.y + 90;
  } else if (arrival === "warp") {
    world.player.x = (rng() - 0.5) * 300;
    world.player.y = 260 + rng() * 220;
  } else {
    world.player.x = 0;
    world.player.y = 260;
  }
  world.player.angle = -Math.PI / 2;

  // ── Encounters ──────────────────────────────────────────────────────────
  spawnEncounters(world, rng, disc);

  // Restore any target that still exists.
  world.target = nearestHostile(world) ?? world.station ?? null;
  return world;
}

export function spawnEncounters(world, rng, disc) {
  const { sector, state } = world;
  const hostileCount = sector.hostiles;

  const pickHostile = () => {
    const roll = rng();
    if (sector.depth >= 5) {
      if (roll < 0.28) return "enforcer";
      if (roll < 0.66) return "gunship";
      return "corsair";
    }
    if (sector.depth >= 2) {
      if (roll < 0.16) return "gunship";
      if (roll < 0.36) return "corsair";
      return "scavenger";
    }
    return roll < 0.5 ? "scavenger" : "corsair";
  };

  const spawnEnemyAt = (id, x, y, opts = {}) => {
    const e = createEnemyShip(id, x, y, { rng, ...opts });
    const def = ENEMIES[id];
    e.loot = [{ id: "scrap", qty: 1 + Math.floor(Math.random() * 2) }];
    if (Math.random() < 0.4) e.loot.push({ id: pick(rng, ["food", "meds", "tech"]), qty: 1 });
    if (id === "gunship" || id === "enforcer") e.loot.push({ id: "arms", qty: 1 });
    world.enemies.push(e);
    return e;
  };

  for (let i = 0; i < hostileCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (SPAWN_RADIUS - 200 - 620) + 620;
    spawnEnemyAt(pickHostile(), Math.cos(a) * r, Math.sin(a) * r, {
      toughness: 1 + sector.depth * 0.035,
    });
  }

  // Named bounty targets offered by the board: attach to matching missions.
  for (const m of state.missions) {
    if (m.goal?.kind === "kill" && !m.done && m.target?.q === sector.q && m.target?.r === sector.r) {
      const id = m.goal.target === "bounty" ? pickHostile() : m.goal.target;
      if (ENEMIES[id]) {
        const a = rng() * Math.PI * 2;
        const r = rand(rng, 620, 1200);
        const boss = spawnEnemyAt(id, Math.cos(a) * r, Math.sin(a) * r, {
          name: m.bountyName ? `Raider ${m.bountyName}` : undefined,
          missionTag: m.id,
          toughness: 1.15,
        });
        boss.escort = boss.escort ?? null;
        if (m.goal.count > 1) {
          const wing = spawnEnemyAt("corsair", Math.cos(a + 0.3) * r, Math.sin(a + 0.3) * r, { missionTag: m.id });
          wing.escort = boss.id;
        }
      }
    }
  }

  // Story encounters.
  if (sector.storyRole === "maw") {
    const vey = spawnEnemyAt("warlord", 0, -900, { name: "Warlord Vey" });
    vey.home = { x: 0, y: -900 };
    vey.aggro = 0;
    vey.dialogue = "vey";
  }
  if (sector.storyRole === "cartographer") {
    const a = rng() * Math.PI * 2;
    spawnEnemyAt("corsair", Math.cos(a) * 420, Math.sin(a) * 420, { name: "Corsair Pursuer" });
    spawnEnemyAt("gunship", Math.cos(a + 0.6) * 520, Math.sin(a + 0.6) * 520, { name: "Corsair Pursuer" });
  }
  if (sector.storyRole === "silentgate") {
    const vey = spawnEnemyAt("warlord", 0, -560, { name: "Warlord Vey", toughness: 1.1 });
    vey.aggro = 0;
    vey.dialogue = "veyFinal";
    vey.home = { x: 0, y: -560 };
    vey.finalBoss = true;
    spawnEnemyAt("enforcer", 160, -640, { name: "Vey's Honour Guard" });
    spawnEnemyAt("enforcer", -160, -640, { name: "Vey's Honour Guard" });
  }

  // Patrols keep the lanes feeling alive (and legal space dangerous for pirates).
  const patrol = sector.faction === "helix" ? "helixPatrol" : "patrol";
  for (let i = 0; i < sector.friendlies; i++)
    spawnEnemyAt(patrol, rand(rng, -600, 600), rand(rng, -600, 600), { escort: i });

  // Wingman.
  if (state.flags.wingman && !world.wingman) {
    world.wingman = createEnemyShip("patrol", world.player.x - 70, world.player.y + 50, {
      name: "Wingman “Tack”",
      toughness: 0.9,
    });
    world.wingman.friendly = true;
    world.wingman.def = { ...ENEMIES.patrol, damage: 9, rate: 0.45, sensor: 800, art: "sabre" };
    world.wingman.hullMax = 90;
    world.wingman.hp = 90;
  }

  // Escort mission ambush: high-value delivery often attracts pirates.
  const risky = state.missions.find(
    (m) => !m.done && m.type === "smuggle" && m.target?.q === sector.q && m.target?.r === sector.r,
  );
  if (risky && rng() < 0.75) {
    const a = rng() * Math.PI * 2;
    const e = spawnEnemyAt("gunship", Math.cos(a) * 700, Math.sin(a) * 700, { name: "Interception Team" });
    e.aggro = 1;
    world.ambush = "smuggle";
  }
}

export function nearestHostile(world) {
  let best = null,
    bestD = Infinity;
  for (const e of world.enemies) {
    if (e.dead || e.friendly) continue;
    const d = Math.hypot(e.x - world.player.x, e.y - world.player.y);
    if (d < bestD) (bestD = d), (best = e);
  }
  return best;
}

/** Radar contact should be visible? */
export function contactVisible(world, entity) {
  const range = world.stats.sensor;
  const d = Math.hypot(entity.x - world.player.x, entity.y - world.player.y);
  return d < range || entity.kind === "station" || entity.kind === "gate";
}

/** Candidate interactables with a prompt string and hold duration (0 = tap). */
export function interactables(world) {
  const p = world.player;
  const list = [];
  if (world.station) {
    const d = Math.hypot(world.station.x - p.x, world.station.y - p.y);
    if (d < GAME.dockRange + world.station.radius)
      list.push({ entity: world.station, label: `Dock at ${world.station.station.name}`, action: "dock", hold: 0, priority: 5 });
  }
  for (const g of world.gates) {
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d < GAME.gateRange + g.radius)
      list.push({ entity: g, label: g.silent ? "Approach the Silent Gate" : "Open jump plot", action: "gate", hold: 0, priority: 4 });
  }
  for (const w of world.wrecks) {
    if (w.salvaged) continue;
    const d = Math.hypot(w.x - p.x, w.y - p.y);
    if (d < GAME.interactRange + w.radius)
      list.push({ entity: w, label: w.story === "blackbox" ? "Crack the sealed hold" : "Salvage derelict", action: "salvage", hold: 1.1, priority: 3 });
  }
  for (const s of world.signals) {
    if (s.scanned) continue;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < GAME.interactRange + s.radius)
      list.push({ entity: s, label: "Scan anomaly", action: "scan", hold: 1.6, priority: 3 });
  }
  for (const n of world.npcs) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < GAME.interactRange + n.radius)
      list.push({ entity: n, label: `Hail ${n.name}`, action: "talk", hold: 0, priority: 4 });
  }
  for (const a of world.rocks) {
    if (a.dead) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < GAME.interactRange + a.radius)
      list.push({ entity: a, label: "Hand-mine asteroid", action: "mine", hold: 1.4, priority: 2 });
  }
  list.sort((a, b) => b.priority - a.priority);
  return list;
}

/** The one interaction shown in the HUD prompt. */
export function bestInteraction(world) {
  const list = interactables(world);
  return list[0] ?? null;
}

/** Regenerate rocks in a field (for tests / sector reloads). */
export function rocksForField(field, seedBase = 1) {
  const rng = seeded(seedBase, field.x, field.y);
  const count = Math.round(field.rocks * (0.7 + field.richness * 0.22));
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rng.rand()() * Math.PI * 2;
    const r = Math.pow(rng.rand()(), 0.7) * 190 * field.richness;
    out.push(createAsteroid(field.x + Math.cos(a) * r, field.y + Math.sin(a) * r, (field.x * 31 + i * 977) | 0, 0.8 + rng.rand()() * 0.6));
  }
  return out;
}

export { generateSector, hexNeighbors };
