/**
 * Seeded galaxy generation.
 *
 * A sector is a pure function of (seed, q, r): enter the same coordinates with
 * the same campaign seed and you get the same stations, rocks and signals.
 * Nothing here touches the DOM, so the whole galaxy is unit-testable.
 */
import {
  ECONOMIES,
  FACTIONS,
  NAMES,
  SECURITY,
  GOODS,
} from "../config.js";
import { seeded, pick, rand, randInt, chance, weighted, clamp } from "../core/utils.js";
import { hexDistance, hexNeighbors, hexRing } from "./hex.js";

/** Hand-placed story coordinates. Keep in sync with STORY goals in config.js. */
export const STORY_SECTORS = {
  "2,-1": { role: "beacon", name: "Cinder Reach", station: true },
  "5,1": { role: "maw", name: "The Maw", station: false },
  "-2,4": { role: "cartographer", name: "Quill Drift", station: false },
  "-1,12": { role: "silentgate", name: "Silent Gate", station: false },
};

export const START_SECTOR = { q: 0, r: 0 };

export function sectorKey(q, r) {
  return `${q},${r}`;
}

/** Security band from hex distance to the core. */
export function securityAt(depth) {
  if (depth <= 1) return "high";
  if (depth <= 3) return "low";
  if (depth <= 8) return "anarchy";
  return "deep";
}

/** Faction owner from depth and coordinate noise. */
export function factionAt(q, r, depth, rng) {
  if (depth === 0) return "uss";
  if (depth <= 1) return "uss";
  if (depth <= 3) return rng() < 0.58 ? "uss" : "helix";
  if (depth <= 5) {
    const roll = rng();
    return roll < 0.36 ? "helix" : roll < 0.62 ? "uss" : roll < 0.9 ? "corsair" : "indie";
  }
  if (depth <= 8) return rng() < 0.72 ? "corsair" : "indie";
  return "indie";
}

const ECON_BY_FACTION = {
  uss: [
    ["trade", 30],
    ["agri", 18],
    ["clinic", 12],
    ["tech", 16],
    ["luxury", 8],
    ["gate", 10],
    ["industry", 6],
  ],
  helix: [
    ["mining", 30],
    ["industry", 26],
    ["trade", 18],
    ["tech", 12],
    ["gate", 8],
    ["frontier", 6],
  ],
  corsair: [
    ["pirate", 62],
    ["frontier", 24],
    ["mining", 14],
  ],
  indie: [
    ["frontier", 52],
    ["mining", 18],
    ["agri", 12],
    ["gate", 18],
  ],
};

function economyFor(faction, rng) {
  return weighted(rng, ECON_BY_FACTION[faction] ?? ECON_BY_FACTION.indie);
}

function techLevelFor(faction, depth, rng) {
  const base = { uss: 3.2, helix: 3.0, corsair: 1.8, indie: 1.4 }[faction] ?? 1;
  return clamp(Math.round(base + rng() * 1.4 - depth * 0.12), 1, 5);
}

function stationServices(economy, faction) {
  const services = ["market", "cantina", "repair", "refuel"];
  if (["trade", "industry", "tech", "mining"].includes(economy)) services.push("shipyard");
  if (["trade", "clinic", "luxury", "gate"].includes(economy)) services.push("clinic");
  if (faction !== "indie") services.push("hq");
  if (economy === "pirate" || economy === "frontier") services.push("blackmarket");
  return services;
}

function makeStation(rng, depth, faction, economy, forcedName) {
  const name = forcedName ?? `${pick(rng, NAMES.prefix)} ${pick(rng, NAMES.stations)}`;
  const tech = techLevelFor(faction, depth, rng);
  return {
    id: "station",
    name,
    economy,
    faction,
    tech,
    size: clamp(0.55 + rng() * 0.45 + (depth === 0 ? 0.3 : 0), 0.5, 1.4),
    services: stationServices(economy, faction),
    fine: SECURITY[securityAt(depth)].fine,
    garrison: faction === "corsair" ? 2 : 1,
  };
}

/** Visible points of interest for a sector. */
export function sectorPOIs(q, r, depth, security, faction, rng, storyRole) {
  const pois = [];
  const angle = () => rng() * Math.PI * 2;
  const radius = (min, max) => rand(rng, min, max);

  // Asteroid clusters scale with richness and depth.
  const fieldCount = depth === 0 ? 2 : 1 + (rng() < 0.55 ? 1 : 0) + (depth > 4 && rng() < 0.4 ? 1 : 0);
  for (let i = 0; i < fieldCount; i++) {
    const a = angle(), d = radius(520, 980);
    pois.push({
      id: `field${i}`,
      kind: "field",
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      richness: clamp(0.55 + rng() * 0.6 + depth * 0.03, 0.4, 1.8),
      rocks: randInt(rng, 5, 11),
    });
  }

  // Derelicts — richer and more common deeper out.
  if (chance(rng, 0.28 + depth * 0.045)) {
    const a = angle(), d = radius(420, 1000);
    pois.push({ id: "wreck0", kind: "wreck", x: Math.cos(a) * d, y: Math.sin(a) * d });
  }
  if (depth >= 5 && chance(rng, 0.22)) {
    const a = angle(), d = radius(600, 1050);
    pois.push({ id: "wreck1", kind: "wreck", x: Math.cos(a) * d, y: Math.sin(a) * d });
  }

  // Unknown signals / anomalies.
  const signalCount = chance(rng, 0.42 + depth * 0.04) ? (chance(rng, 0.3) ? 2 : 1) : 0;
  for (let i = 0; i < signalCount; i++) {
    const a = angle(), d = radius(380, 1000);
    pois.push({ id: `signal${i}`, kind: "signal", x: Math.cos(a) * d, y: Math.sin(a) * d });
  }

  // Nebula: masks sensors and feeds fuel scoops.
  if (chance(rng, depth >= 6 ? 0.4 : 0.22)) {
    const a = angle(), d = radius(500, 1000);
    pois.push({
      id: "nebula0",
      kind: "nebula",
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      radius: rand(rng, 240, 420),
    });
  }

  // Planets as backdrop POIs.
  if (chance(rng, 0.5)) {
    const a = angle(), d = radius(700, 1150);
    pois.push({
      id: "planet0",
      kind: "planet",
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      radius: rand(rng, 90, 190),
      hue: pick(rng, ["#2b4b6e", "#4a3462", "#245b52", "#5b3a2e", "#3a3f6b"]),
    });
  }

  if (storyRole === "beacon") {
    pois.push({
      id: "beacon",
      kind: "signal",
      x: 340,
      y: -260,
      story: "beacon",
      forced: true,
    });
  }
  if (storyRole === "maw") {
    pois.push({ id: "mawWreck", kind: "wreck", x: 120, y: -380, story: "blackbox", forced: true });
  }
  if (storyRole === "cartographer") {
    pois.push({ id: "cartographer", kind: "npc", x: -260, y: 180, story: "cartographer", forced: true });
  }
  if (storyRole === "silentgate") {
    pois.push({ id: "silentGate", kind: "gate", x: 0, y: -300, story: "silentgate", forced: true });
  }

  // The jump gate every sector has (except the gate itself).
  if (storyRole !== "silentgate") {
    const a = rand(rng, 0, Math.PI * 2);
    pois.push({
      id: "gate",
      kind: "gate",
      x: Math.cos(a) * 880,
      y: Math.sin(a) * 880,
      rim: true,
    });
  }
  return pois;
}

/** All info needed to render the galaxy chart and to run a sector. */
export function generateSector(seed, q, r) {
  const depth = hexDistance(q, r, 0, 0);
  const rng = seeded(seed, q * 31.7, r * 17.3);
  const key = sectorKey(q, r);
  const story = STORY_SECTORS[key];
  const securityId = story?.role === "silentgate" ? "deep" : securityAt(depth);
  const security = SECURITY[securityId];
  let faction = story?.role === "silentgate" ? "indie" : factionAt(q, r, depth, rng);
  if (story?.role === "maw") faction = "corsair";
  if (story?.role === "beacon") faction = "uss";
  if (story?.role === "cartographer") faction = "indie";

  const name =
    story?.name ??
    (depth === 0
      ? "Kepler Reach"
      : `${pick(rng, NAMES.prefix)} ${pick(rng, NAMES.suffix)}`);

  const hasStation = story ? !!story.station : depth <= 8 && chance(rng, {
    high: 0.78,
    low: 0.6,
    anarchy: 0.4,
    deep: 0.06,
  }[securityId]);

  let economy = economyFor(faction, rng);
  if (securityId === "high") economy = weighted(rng, [["trade", 40], ["agri", 18], ["luxury", 14], ["clinic", 14], ["tech", 14]]);
  if (faction === "corsair" && securityId === "anarchy") economy = chance(rng, 0.7) ? "pirate" : "frontier";
  if (story?.role === "beacon") economy = "frontier";

  const station = hasStation
    ? makeStation(rng, depth, faction, economy, depth === 0 ? "Meridian Outpost" : undefined)
    : null;

  const pois = sectorPOIs(q, r, depth, securityId, faction, rng, story?.role);

  const wealth = clamp(
    0.35 + (faction === "uss" ? 0.24 : faction === "helix" ? 0.2 : 0.02) +
      (securityId === "high" ? 0.16 : securityId === "deep" ? -0.2 : 0) +
      rng() * 0.22 - depth * 0.012,
    0.15,
    1,
  );

  const danger = clamp(
    security.danger + depth * 0.035 + (faction === "corsair" ? 0.22 : 0) + rng() * 0.16,
    0,
    1.6,
  );

  // Local price bias combines the station's economy with a seeded wobble.
  const tradeBias = {};
  const econ = ECONOMIES[economy];
  for (const id of Object.keys(GOODS)) {
    tradeBias[id] = (econ.bias[id] ?? 0) + (rng() - 0.5) * 0.1;
  }

  const hostiles = clamp(
    Math.round(depth === 0 ? 0 : 1 + danger * 2.4 + rng() * 1.5),
    0,
    6,
  );
  const friendlies = security.patrols ? (chance(rng, 0.8) ? randInt(rng, 1, 2) : 0) : 0;

  return {
    q,
    r,
    key,
    seed,
    name,
    depth,
    security: securityId,
    securityLabel: security.label,
    securityColor: security.color,
    faction,
    economy,
    station,
    pois,
    wealth,
    danger,
    tech: station?.tech ?? clamp(2 + Math.round(rng() * 2) - (depth > 8 ? 1 : 0), 1, 5),
    tradeBias,
    hostiles,
    friendlies,
    storyRole: story?.role ?? null,
    visited: false,
  };
}

export function neighborsOf(q, r) {
  return hexNeighbors(q, r);
}

/** Every sector within `radius` of (q,r), used for map and route views. */
export function sectorsAround(seed, q, r, radius) {
  return hexSpiralCached(q, r, radius).map(({ q: sq, r: sr }) =>
    generateSector(seed, sq, sr),
  );
}

function hexSpiralCached(q, r, radius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      out.push({ q: q + dq, r: r + dr });
    }
  }
  return out;
}

/** Jump rules ------------------------------------------------------------ */

export function jumpRange(hull, fitting, hasWarpDrive) {
  return 1 + (hasWarpDrive ? fitting.warpRange : 0);
}

export function canJump(from, to, range) {
  const d = hexDistance(from.q, from.r, to.q, to.r);
  return d >= 1 && d <= range;
}

export function jumpWarpCost(from, to) {
  return Math.round(16 + hexDistance(from.q, from.r, to.q, to.r) * 6);
}

/**
 * Relic sites for the story: the first three anarchy sectors in rings 5–8
 * (scanned in a fixed order) are flagged, so every campaign has accessible
 * cores without hand-authoring coordinates.
 */
export function relicSites(seed) {
  const out = [];
  for (let ring = 5; ring <= 8 && out.length < 3; ring++) {
    for (const { q, r } of hexRing(0, 0, ring)) {
      const s = generateSector(seed, q, r);
      if (s.security === "anarchy" && s.faction !== "uss") out.push(s);
      if (out.length >= 3) break;
    }
  }
  return out;
}

/** Faction relations: -100..100. */
export function factionColor(id) {
  return FACTIONS[id]?.color ?? "#9fb2c9";
}
