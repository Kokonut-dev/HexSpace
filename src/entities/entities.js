/**
 * Entity factories and small entity helpers.
 *
 * Entities are plain objects (structs) with an `kind` discriminator. No class
 * hierarchy: every system pattern-matches on `kind`, which keeps the hot loops
 * monomorphic and the state trivially serialisable.
 */
import { ENEMIES, HULLS } from "../config.js";
import { mulberry32, rand, randInt, pick } from "../core/utils.js";

let counter = 0;
export function nextEntityId(prefix = "e") {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${counter}`;
}

export function resetEntityCounter() {
  counter = 0;
}

/** Player ship runtime (separate from persisted fitting). */
export function createPlayerShip(state, stats, x = 0, y = 0) {
  return {
    kind: "player",
    id: "player",
    name: "You",
    hull: state.hull,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hullMax: stats.hullPoints,
    hp: Math.min(state.hp, stats.hullPoints),
    shieldMax: stats.shield,
    shield: Math.min(state.shield ?? stats.shield, stats.shield),
    heat: state.heat ?? 0,
    radius: HULLS[state.hull].art.size * 0.34,
    lastHitAt: -99,
    disabled: 0,
    cooldowns: {},
    missileTimer: 0,
    thrustInput: 0,
    moving: false,
    boosting: false,
    drift: false,
    flash: 0,
    cloak: 0,
  };
}

export function createEnemyShip(defId, x, y, opts = {}) {
  const def = ENEMIES[defId];
  if (!def) throw new Error(`Unknown enemy ${defId}`);
  return {
    kind: "enemy",
    id: opts.id ?? nextEntityId("n"),
    defId,
    def,
    faction: def.faction,
    name: opts.name ?? def.name,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: Math.atan2(-y, -x) + Math.PI,
    hullMax: Math.round(def.hull * (opts.toughness ?? 1)),
    hp: Math.round(def.hull * (opts.toughness ?? 1)),
    shieldMax: Math.round((def.shield ?? 0) * (opts.toughness ?? 1)),
    shield: Math.round((def.shield ?? 0) * (opts.toughness ?? 1)),
    radius: (HULLS[def.art]?.art.size ?? 30) * 0.32,
    state: "idle",
    stateTimer: 0,
    fireTimer: rand(opts.rng ?? mulberry32(7), 0.4, 1.6),
    missileTimer: 6,
    aggro: 0,
    patrolAngle: rand(opts.rng ?? mulberry32(7), 0, Math.PI * 2),
    home: { x, y },
    loot: opts.loot ?? null,
    bounty: opts.bounty ?? def.bounty,
    boss: !!def.boss,
    friendly: !!def.friendly,
    escort: opts.escort ?? null,
    missionTag: opts.missionTag ?? null,
    disabled: 0,
    flash: 0,
    fleeing: false,
    dialogue: opts.dialogue ?? null,
  };
}

export function createAsteroid(x, y, seed, size = 1) {
  const rng = mulberry32(seed);
  const verts = [];
  const n = randInt(rng, 7, 10);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    verts.push({
      a: a + rand(rng, -0.09, 0.09),
      r: rand(rng, 0.72, 1.08),
    });
  }
  const radius = rand(rng, 14, 26) * size;
  return {
    kind: "asteroid",
    id: nextEntityId("a"),
    x,
    y,
    vx: rand(rng, -5, 5),
    vy: rand(rng, -5, 5),
    radius,
    verts,
    hp: Math.round(26 * size * size),
    hpMax: Math.round(26 * size * size),
    ore: size > 1.05 ? 2 : 1,
    seed,
    spin: rand(rng, -0.02, 0.02),
    rotation: rand(rng, 0, Math.PI * 2),
    flash: 0,
    yields: pick(rng, ["ore", "ore", "ore", "scrap"]),
  };
}

export function createWreck(x, y, seed, opts = {}) {
  const rng = mulberry32(seed);
  return {
    kind: "wreck",
    id: opts.id ?? nextEntityId("w"),
    name: opts.name ?? "Derelict",
    x,
    y,
    radius: 34,
    rotation: rand(rng, 0, Math.PI * 2),
    seed,
    salvaged: false,
    story: opts.story ?? null,
    loot: opts.loot ?? { scrap: randInt(rng, 2, 5) },
    scanRequired: opts.scanRequired ?? false,
  };
}

export function createSignal(x, y, seed, opts = {}) {
  const rng = mulberry32(seed);
  return {
    kind: "signal",
    id: opts.id ?? nextEntityId("s"),
    name: opts.name ?? "Unknown Signal",
    x,
    y,
    radius: 22,
    seed,
    phase: rand(rng, 0, Math.PI * 2),
    scanned: false,
    story: opts.story ?? null,
    signalType: opts.signalType ?? pick(rng, ["derelict", "cache", "anomaly", "trap", "relic"]),
    loot: opts.loot ?? null,
  };
}

export function createGate(x, y, opts = {}) {
  return {
    kind: "gate",
    id: opts.id ?? "gate",
    name: opts.name ?? "Jump Gate",
    x,
    y,
    radius: 46,
    angle: opts.angle ?? Math.atan2(-y, -x),
    silent: !!opts.silent,
    target: opts.target ?? null,
  };
}

export function createStationEntity(station, x = 0, y = -420) {
  return {
    kind: "station",
    id: "station",
    station,
    name: station.name,
    x,
    y,
    radius: 90,
    angle: 0.3,
    spin: 0.02,
  };
}

export function createPlanet(poi) {
  return { kind: "planet", id: poi.id, name: "Planet", x: poi.x, y: poi.y, radius: poi.radius, hue: poi.hue };
}

export function createNebula(poi) {
  return { kind: "nebula", id: poi.id, x: poi.x, y: poi.y, radius: poi.radius, seed: poi.radius | 0 };
}

export function createNpc(poi) {
  return {
    kind: "npc",
    id: poi.id,
    name: "Last Cartographer",
    x: poi.x,
    y: poi.y,
    radius: 26,
    dialogue: "cartographer",
    talked: false,
  };
}

export function createProjectile({ x, y, vx, vy, damage, friendly, color, kind, life = 1.6, size = 2, splash = 0, pierce = 0, antiMissile = false, ownerId = null }) {
  return {
    kind: "bullet",
    id: nextEntityId("b"),
    x,
    y,
    px: x,
    py: y,
    vx,
    vy,
    damage,
    friendly,
    color,
    shotType: kind,
    life,
    size,
    splash,
    pierce,
    antiMissile,
    ownerId,
    hit: [],
  };
}

export function createMissile({ x, y, angle, targetId, damage, friendly, ownerId }) {
  return {
    kind: "missile",
    id: nextEntityId("m"),
    x,
    y,
    vx: Math.cos(angle) * 260,
    vy: Math.sin(angle) * 260,
    angle,
    targetId,
    damage,
    friendly,
    ownerId,
    life: 6,
    hp: 6,
    flash: 0,
  };
}

export function createPickup({ x, y, id, qty, kind: pickupKind = "cargo" }) {
  return {
    kind: "pickup",
    id: nextEntityId("p"),
    cargoId: id,
    qty,
    pickupKind,
    x,
    y,
    vx: 0,
    vy: 0,
    life: 60,
    bob: Math.random() * Math.PI * 2,
  };
}

export function createDebris(x, y, color, count = 8, spread = 90) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * spread;
    out.push({
      kind: "debris",
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.9,
      max: 1,
      color,
      size: Math.random() < 0.3 ? 2 : 1,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 8,
    });
  }
  return out;
}

export function shipName(state) {
  const hull = HULLS[state.hull];
  return `HXS ${hull.name}`;
}

export function validHull(id) {
  return !!HULLS[id];
}
