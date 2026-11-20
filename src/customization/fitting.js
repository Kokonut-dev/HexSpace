/**
 * Ship fitting: slot layout, derived stat sheets, installation rules and the
 * outfitting economy. Pure functions over the save state so the UI and tests
 * share exactly one set of rules.
 */
import { HULLS, MODULES, SHIP_RANKS } from "../config.js";
import { clamp } from "../core/utils.js";

const SLOT_TYPES = {
  w: "weapon",
  d: "defense",
  e: "engine",
  u: "utility",
  r: "reactor",
};

export const SLOT_LABEL = {
  weapon: "Hardpoint",
  defense: "Defence",
  engine: "Drive",
  utility: "Systems",
  reactor: "Reactor",
};

/** Ordered slot descriptors for a hull, e.g. [{key:'w1', type:'weapon', mount:{...}}] */
export function slotLayout(hullId) {
  const hull = HULLS[hullId] ?? HULLS.kestrel;
  const out = [];
  for (const [prefix, count] of Object.entries(hull.slots)) {
    const mounts = hull.mounts[prefix] ?? [];
    for (let i = 0; i < count; i++) {
      out.push({
        key: `${prefix}${i + 1}`,
        type: SLOT_TYPES[prefix],
        index: i,
        mount: mounts[i] ?? { x: 0, y: 0 },
      });
    }
  }
  return out;
}

export function slotTypeOf(key) {
  return SLOT_TYPES[key[0]] ?? null;
}

export function hasWarpDrive(fit) {
  return Object.values(fit).some((id) => id === "warpDrive");
}

/**
 * Aggregate stat sheet. `fit` maps slot keys to module ids (or null).
 * `shield`/`hull` are maxima; runtime current values live on the ship.
 */
export function shipStats(hullId, fit) {
  const hull = HULLS[hullId] ?? HULLS.kestrel;
  const out = {
    hullId,
    hullName: hull.name,
    hullLabel: hull.label,
    mass: hull.mass,
    power: hull.power,
    draw: 0,
    thrust: 0,
    turn: hull.turn,
    shield: 0,
    shieldRegen: 6,
    hullPoints: hull.hull,
    cool: hull.cool,
    cargo: hull.cargo,
    sensor: hull.sensor,
    damageMult: 1,
    guard: 0,
    resist: 0,
    repair: 0,
    scoop: 0,
    ecm: 0,
    tractor: 0,
    scanSpeed: 1,
    warpRange: 0,
    warpEff: 0,
    missileAmmo: 0,
    mining: 0,
    weapons: [],
    secondary: null,
    reactor: "compactFusion",
    brownout: 1,
    agility: 0,
    speedCap: 0,
    slots: slotLayout(hullId),
    installed: 0,
    capacity: 0,
  };

  for (const slot of out.slots) {
    const id = fit[slot.key];
    if (!id || !MODULES[id]) continue;
    const mod = MODULES[id];
    if (mod.slot !== slot.type) continue;
    out.installed++;
    out.capacity++;
    out.mass += mod.mass;
    out.draw += mod.draw;
    if (mod.slot === "reactor") out.reactor = id;
    const s = mod.stats ?? {};
    out.power += s.power ?? 0;
    out.thrust += s.thrust ?? 0;
    out.turn += s.turn ?? 0;
    out.shield += s.shield ?? 0;
    out.shieldRegen += s.shieldRegen ?? 0;
    out.hullPoints += s.hull ?? 0;
    out.cool += s.cool ?? 0;
    out.cargo += s.cargo ?? 0;
    out.sensor += s.sensor ?? 0;
    out.guard += s.guard ?? 0;
    out.resist += s.resist ?? 0;
    out.repair += s.repair ?? 0;
    out.scoop += s.scoop ?? 0;
    out.ecm += s.ecm ?? 0;
    out.tractor += s.tractor ?? 0;
    out.scanSpeed += s.scanSpeed ?? 0;
    out.warpRange += s.warpRange ?? 0;
    out.warpEff += s.warpEff ?? 0;
    out.missileAmmo += s.missileAmmo ?? 0;
    out.mining += s.mining ?? 0;
    out.damageMult += s.targeting ?? 0;
    if (mod.weapon) {
      if (mod.weapon.kind === "launcher") {
        if (!out.secondary) out.secondary = { slot: slot.key, def: mod.weapon, mount: slot.mount };
      } else {
        out.weapons.push({ slot: slot.key, def: mod.weapon, mount: slot.mount, modId: id });
      }
    }
  }

  out.guard = clamp(out.guard, 0, 0.8);
  out.resist = clamp(out.resist, 0, 0.65);
  out.ecm = clamp(out.ecm, 0, 0.85);
  out.brownout = out.draw > out.power ? clamp(out.power / out.draw, 0.35, 1) : 1;
  out.agility = (140 + out.thrust) * 30 / Math.max(8, out.mass);
  out.speedCap = 120 + (out.thrust * 26) / Math.max(8, out.mass) * 3.4;
  out.shieldRegen = out.shield > 0 ? out.shieldRegen : 0;
  return out;
}

/** Human-readable comparison deltas between two stat sheets. */
export function statDiff(before, after) {
  const keys = ["mass", "power", "draw", "shield", "hullPoints", "cargo", "thrust", "cool", "sensor", "turn"];
  const out = [];
  for (const k of keys) {
    const d = Math.round((after[k] ?? 0) - (before[k] ?? 0));
    if (d !== 0) out.push({ key: k, delta: d });
  }
  return out;
}

export const STAT_LABEL = {
  mass: "Mass",
  power: "Power",
  draw: "Draw",
  shield: "Shield",
  hullPoints: "Hull",
  cargo: "Cargo",
  thrust: "Thrust",
  cool: "Cooling",
  sensor: "Sensor",
  turn: "Turn",
};

/** Rank gate for a hull purchase. */
export function rankOf(xp) {
  let rank = 0;
  for (const r of SHIP_RANKS) if (xp >= r.xp) rank = r.rank;
  return rank;
}

export function rankName(xp) {
  return SHIP_RANKS[rankOf(xp)]?.name ?? "Rookie";
}

export function rankProgress(xp) {
  const current = rankOf(xp);
  const next = SHIP_RANKS.find((r) => r.rank === current + 1);
  if (!next) return { current, next: null, ratio: 1, label: SHIP_RANKS[current].name };
  const base = SHIP_RANKS[current].xp;
  return {
    current,
    next: next.rank,
    ratio: clamp((xp - base) / (next.xp - base), 0, 1),
    label: SHIP_RANKS[current].name,
    nextName: next.name,
  };
}

/** Whether the player may install `moduleId` in `slotKey`, ignoring money. */
export function canInstall(hullId, fit, slotKey, moduleId) {
  const slot = slotLayout(hullId).find((s) => s.key === slotKey);
  if (!slot) return { ok: false, reason: "No such slot." };
  if (moduleId == null) return { ok: true, reason: "" };
  const mod = MODULES[moduleId];
  if (!mod) return { ok: false, reason: "Unknown module." };
  if (mod.slot !== slot.type) return { ok: false, reason: `${mod.name} does not fit a ${slot.type} slot.` };
  // Reactor must always stay installed.
  if (slot.type === "reactor" && !moduleId) return { ok: false, reason: "A hull cannot fly without a reactor." };
  return { ok: true, reason: "" };
}

/** Apply an installation to a copy of the fitting. */
export function applyFit(hullId, fit, slotKey, moduleId) {
  return { ...fit, [slotKey]: moduleId || null };
}

/**
 * Buy (if not owned) and install a module. Mutates state, returns a result.
 * `state` is the save object; `price` is the station-adjusted quote.
 */
export function installModule(state, slotKey, moduleId, price) {
  const check = canInstall(state.hull, state.fit, slotKey, moduleId);
  if (!check.ok) return { ok: false, message: check.reason };
  const own = !moduleId || state.ownedModules.includes(moduleId);
  const cost = own ? 0 : Math.max(0, price ?? MODULES[moduleId].price);
  if (cost > state.credits) return { ok: false, message: "Insufficient credits." };

  const nextFit = applyFit(state.hull, state.fit, slotKey, moduleId);
  const nextStats = shipStats(state.hull, nextFit);
  const cargoUsed = Object.values(state.cargo).reduce((a, b) => a + b, 0);
  if (cargoUsed > nextStats.cargo) return { ok: false, message: "Unload cargo before removing that pod." };

  state.credits -= cost;
  if (moduleId && !own) state.ownedModules.push(moduleId);
  state.fit = nextFit;
  return { ok: true, message: `${MODULES[moduleId]?.name ?? "Empty slot"} installed.`, cost };
}

/** Install the same module in two slots requires buying twice. */
export function uniqueCopyRequired(state, moduleId) {
  if (!moduleId) return 0;
  const installed = Object.values(state.fit).filter((id) => id === moduleId).length;
  const owned = state.ownedModules.filter((id) => id === moduleId).length + installed;
  return owned;
}

export function stationPrice(state, moduleId, sector) {
  const mod = MODULES[moduleId];
  if (!mod) return 0;
  const techDelta = (sector.tech ?? 2) - 3;
  const factionMod = sector.faction === "helix" ? 0.94 : sector.faction === "corsair" ? 1.12 : 1;
  const wealthMod = 1 + (sector.wealth - 0.5) * 0.2;
  return Math.max(20, Math.round(mod.price * (1 - techDelta * 0.05) * factionMod * wealthMod / 5) * 5);
}

export function hullPrice(hullId, sector) {
  const h = HULLS[hullId];
  if (!h) return 0;
  const mod = 0.92 + (sector?.tech ?? 2) * 0.03;
  return Math.round(h.price * mod / 50) * 50;
}

export function canBuyHull(state, hullId) {
  const hull = HULLS[hullId];
  if (!hull) return { ok: false, reason: "Unknown hull." };
  if (state.hull === hullId) return { ok: false, reason: "Already flying this hull." };
  if (state.ownedHulls.includes(hullId)) return { ok: true, reason: "" };
  if (rankOf(state.xp) < hull.rank)
    return { ok: false, reason: `Requires rank ${SHIP_RANKS[hull.rank].name}.` };
  return { ok: true, reason: "" };
}

/**
 * Switch or purchase a hull. Fitting is reset to the hull's starter loadout
 * (owned modules are retained in the inventory).
 */
export function changeHull(state, hullId, price) {
  const check = canBuyHull(state, hullId);
  if (!check.ok) return { ok: false, message: check.reason };
  const hull = HULLS[hullId];
  const owned = state.ownedHulls.includes(hullId);
  const cost = owned ? 0 : Math.max(0, price ?? hull.price);
  if (cost > state.credits) return { ok: false, message: "Insufficient credits." };

  const fit = {};
  for (const [slot, modId] of Object.entries(hull.starter)) {
    // Only keep starter modules the player owns or that are free.
    if (!modId) fit[slot] = null;
    else fit[slot] = state.ownedModules.includes(modId) || MODULES[modId].price === 0 ? modId : modId;
  }
  const stats = shipStats(hullId, fit);
  const cargoUsed = Object.values(state.cargo).reduce((a, b) => a + b, 0);
  if (cargoUsed > stats.cargo) return { ok: false, message: "That hull cannot hold your cargo." };

  state.credits -= cost;
  if (!owned) state.ownedHulls.push(hullId);
  for (const id of Object.values(fit)) if (id && !state.ownedModules.includes(id)) state.ownedModules.push(id);
  state.hull = hullId;
  state.fit = fit;
  return { ok: true, message: `${hull.name} commissioned.`, cost, stats };
}

/** Repair pricing scales with missing hull and station tech. */
export function repairQuote(state, stats, sector) {
  const missing = Math.max(0, stats.hullPoints - state.hp);
  const unit = 1.6 + (sector?.tech ?? 2) * 0.25;
  return { missing, cost: Math.ceil((missing * unit) / 5) * 5 };
}

export function moduleById(id) {
  return MODULES[id] ?? null;
}

export function modulesForSlot(slotType) {
  return Object.values(MODULES).filter((m) => m.slot === slotType);
}
