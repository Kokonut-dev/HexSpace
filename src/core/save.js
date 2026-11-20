/**
 * Save system: a validated, versioned snapshot in localStorage with export and
 * import. Nothing here trusts its input — a corrupted or hand-edited save is
 * repaired field by field rather than crashing the game.
 */
import {
  GAME,
  GOODS,
  HULLS,
  MODULES,
  SHIP_RANKS,
  CONSUMABLES,
} from "../config.js";
import { clamp, checksum, toB64, fromB64 } from "./utils.js";

const SAVE_VERSION = 2;
const REPUTATION_FACTIONS = ["uss", "helix", "corsair", "indie"];
const MISSION_TYPES = [
  "bounty", "delivery", "survey", "salvage", "patrol", "smuggle", "story",
];

export function freshGame(seed = Math.floor(Math.random() * 1e9)) {
  const hull = HULLS[GAME.startHull];
  const fit = { ...hull.starter };
  return {
    version: SAVE_VERSION,
    seed,
    createdAt: Date.now(),
    playSeconds: 0,
    credits: GAME.startCredits,
    hull: GAME.startHull,
    fit,
    hp: hull.hull,
    shield: 0,
    heat: 0,
    warp: 100,
    missiles: 0,
    cargo: {},
    consumables: { fuelCanister: 1, shieldCell: 1, patchKit: 1 },
    xp: 0,
    rank: 0,
    rep: { uss: 8, helix: 0, corsair: -10, indie: 0 },
    ownedModules: Object.values(fit).filter(Boolean),
    ownedHulls: [GAME.startHull],
    missions: [],
    story: { current: "story1", completed: [], act: 0, ending: false },
    market: {},
    discovered: { "0,0": { visited: true, scanned: [], cleared: [], looted: [] } },
    sector: { q: 0, r: 0 },
    docked: false,
    stationKey: null,
    jumps: 0,
    boardEpoch: 0,
    clock: 0,
    settings: { sound: true, volume: 0.6, scanlines: true, shake: true },
    stats: { kills: 0, missions: 0, trades: 0, jumps: 0, oreMined: 0, creditsEarned: 0, deaths: 0 },
    log: [
      { t: 0, text: "Kestrel powered up at Meridian Outpost. Contract board live." },
    ],
    flags: {},
  };
}

/** Legacy prototype saves (v1) are migrated, not discarded. */
export function migrateLegacy(raw) {
  if (!raw || typeof raw !== "object") return null;
  const state = freshGame();
  const mapHull = { wayfarer: "wayfarer", vanguard: "aegis" };
  if (HULLS[raw.ship]) state.hull = raw.ship;
  else if (mapHull[raw.ship]) state.hull = mapHull[raw.ship];
  if (Number.isFinite(raw.credits) && raw.credits >= 0) state.credits = Math.floor(raw.credits);
  state.sector = {
    q: clamp(Math.round(raw.q ?? 0), -40, 40),
    r: clamp(Math.round(raw.r ?? 0), -40, 40),
  };
  state.docked = !!raw.docked;
  if (raw.cargo && typeof raw.cargo === "object") {
    for (const [id, n] of Object.entries(raw.cargo))
      if (GOODS[id] && Number.isFinite(n) && n > 0) state.cargo[id] = Math.min(999, Math.floor(n));
  }
  const fit = {};
  const slotMap = { weapon: ["w1"], defense: ["d1"], engine: ["e1"], reactor: ["r1"], utility: ["u1"] };
  const moduleMap = {
    cannon: "autocannon", laser: "pulseLaser", plasma: "plasmaCaster", mining: "miningLaser",
    shield: "shieldGen", armor: "armorPlate", point: "pdTurret", ion: "ionDrive",
    vector: "vectorDrive", cell: "compactFusion", fusion: "tokamak", rack: "cargoPod",
    cooler: "heatsink", warp: "warpDrive",
  };
  if (raw.fit && typeof raw.fit === "object")
    for (const [slot, id] of Object.entries(raw.fit)) {
      const mapped = moduleMap[id] ?? id;
      if (MODULES[mapped] && slotMap[slot])
        fit[slotMap[slot][0]] = mapped;
    }
  if (raw.hired) state.flags.legacyWingman = true;
  state.ownedModules = [...new Set([...state.ownedModules, ...Object.values(fit).filter(Boolean)])];
  state.ownedHulls = [...new Set([...state.ownedHulls, state.hull])];
  state.log = [{ t: 0, text: "Legacy log recovered. Systems re-fitted to current spec." }];
  return state;
}

function num(value, fallback, lo = -Infinity, hi = Infinity) {
  return Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
}

function strList(value, max = 200) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === "string" && v.length < 80))].slice(0, max);
}

function sanitizeFit(hullId, fit) {
  const hull = HULLS[hullId] ?? HULLS.kestrel;
  const out = {};
  const validSlots = new Set();
  for (const [prefix, count] of Object.entries(hull.slots))
    for (let i = 0; i < count; i++) validSlots.add(`${prefix}${i + 1}`);
  for (const key of validSlots) {
    const id = fit?.[key];
    if (typeof id === "string" && MODULES[id]) {
      const mod = MODULES[id];
      const prefix = key[0];
      const expected = { w: "weapon", d: "defense", e: "engine", u: "utility", r: "reactor" }[prefix];
      if (mod.slot === expected) out[key] = id;
    }
    if (!(key in out)) out[key] = null;
  }
  // Always guarantee a reactor.
  if (!out.r1) out.r1 = "compactFusion";
  return out;
}

function sanitizeMission(m) {
  if (!m || typeof m !== "object" || !MISSION_TYPES.includes(m.type)) return null;
  if (typeof m.id !== "string" || typeof m.title !== "string") return null;
  return {
    ...m,
    id: m.id.slice(0, 40),
    title: String(m.title).slice(0, 120),
    brief: String(m.brief ?? "").slice(0, 600),
    reward: num(m.reward, 0, 0, 1e6),
    xp: num(m.xp, 0, 0, 1e5),
    progress: num(m.progress, 0, 0, 999),
    done: false,
    accepted: true,
    goals: Array.isArray(m.goals) ? m.goals.slice(0, 8) : undefined,
    goalProgress: m.goalProgress && typeof m.goalProgress === "object" ? m.goalProgress : {},
    target: m.target && Number.isFinite(m.target.q) ? m.target : null,
    cargo: m.cargo && GOODS[m.cargo.id] ? { id: m.cargo.id, qty: clamp(m.cargo.qty | 0, 0, 99) } : undefined,
  };
}

export function sanitize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const state = freshGame();

  if (Number.isFinite(raw.seed)) state.seed = Math.abs(Math.floor(raw.seed)) % 1e9;
  state.credits = num(raw.credits, state.credits, 0, 1e9);
  state.xp = num(raw.xp, 0, 0, 1e7);
  state.rank = num(raw.rank, 0, 0, SHIP_RANKS.length - 1);
  state.playSeconds = num(raw.playSeconds, 0, 0, 1e8);
  state.clock = num(raw.clock, 0, 0, 1e9);
  state.jumps = num(raw.jumps, 0, 0, 1e6);
  state.boardEpoch = num(raw.boardEpoch, 0, 0, 1e6);

  const hullId = HULLS[raw.hull] ? raw.hull : "kestrel";
  state.hull = hullId;
  state.fit = sanitizeFit(hullId, raw.fit);
  state.ownedModules = strList(
    [...(raw.ownedModules ?? []), ...Object.values(state.fit).filter(Boolean)].filter((id) => MODULES[id]),
  );
  state.ownedHulls = strList(
    [...(raw.ownedHulls ?? []), hullId].filter((id) => HULLS[id]),
  );
  if (!state.ownedHulls.includes(hullId)) state.ownedHulls.push(hullId);

  const hull = HULLS[hullId];
  state.hp = num(raw.hp, hull.hull, 1, 10000);
  state.warp = num(raw.warp, 100, 0, 200);
  state.missiles = num(raw.missiles, 0, 0, 99);
  state.sector = {
    q: clamp(Math.round(num(raw.sector?.q, 0)), -60, 60),
    r: clamp(Math.round(num(raw.sector?.r, 0)), -60, 60),
  };
  state.docked = !!raw.docked;
  state.stationKey = typeof raw.stationKey === "string" ? raw.stationKey : null;

  if (raw.cargo && typeof raw.cargo === "object") {
    for (const [id, n] of Object.entries(raw.cargo)) {
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
      if (!GOODS[id] && id !== "relicCore") continue;
      state.cargo[id] = clamp(Math.floor(n), 0, 999);
    }
  }
  if (raw.consumables && typeof raw.consumables === "object")
    for (const id of Object.keys(CONSUMABLES))
      state.consumables[id] = clamp(Math.floor(num(raw.consumables[id], 0)), 0, 99);

  if (raw.rep && typeof raw.rep === "object")
    for (const f of REPUTATION_FACTIONS)
      state.rep[f] = clamp(num(raw.rep[f], state.rep[f], -100, 100), -100, 100);

  if (raw.story && typeof raw.story === "object") {
    state.story = {
      current: typeof raw.story.current === "string" ? raw.story.current : null,
      completed: strList(raw.story.completed ?? [], 32),
      act: clamp(Math.floor(num(raw.story.act, 0)), 0, 3),
      ending: !!raw.story.ending,
    };
  }

  if (raw.missions && Array.isArray(raw.missions)) state.missions = raw.missions.map(sanitizeMission).filter(Boolean).slice(0, 6);

  if (raw.market && typeof raw.market === "object") {
    for (const [key, record] of Object.entries(raw.market).slice(0, 400)) {
      if (!record || typeof record !== "object") continue;
      const stock = {};
      for (const id of Object.keys(GOODS)) stock[id] = clamp(Math.floor(num(record.stock?.[id], 30)), 0, 999);
      state.market[key] = { stock, drift: num(record.drift, 0), priceMul: {}, sells: {}, visits: 0 };
    }
  }

  if (raw.discovered && typeof raw.discovered === "object") {
    state.discovered = {};
    for (const [key, d] of Object.entries(raw.discovered).slice(0, 600)) {
      state.discovered[key] = {
        visited: !!d?.visited,
        scanned: strList(d?.scanned ?? [], 60),
        cleared: strList(d?.cleared ?? [], 60),
        looted: strList(d?.looted ?? [], 60),
      };
    }
  }

  if (raw.settings && typeof raw.settings === "object") {
    state.settings = {
      sound: raw.settings.sound !== false,
      volume: clamp(num(raw.settings.volume, 0.6), 0, 1),
      scanlines: raw.settings.scanlines !== false,
      shake: raw.settings.shake !== false,
    };
  }

  if (raw.stats && typeof raw.stats === "object")
    for (const k of Object.keys(state.stats))
      state.stats[k] = Math.max(0, Math.floor(num(raw.stats[k], 0)));

  if (raw.flags && typeof raw.flags === "object") {
    for (const [k, v] of Object.entries(raw.flags).slice(0, 60))
      if (typeof k === "string" && k.length < 60 && (typeof v === "boolean" || typeof v === "number" || typeof v === "string")) state.flags[k] = v;
  }

  if (Array.isArray(raw.log))
    state.log = raw.log
      .filter((l) => l && typeof l.text === "string")
      .slice(-40)
      .map((l) => ({ t: num(l.t, 0), text: String(l.text).slice(0, 220) }));

  return state;
}

/** Read the save. Returns {state, migrated} or null when none/invalid. */
export function loadGame(storage = safeStorage()) {
  if (!storage) return { state: null, error: "Storage unavailable." };
  let text = null;
  try {
    text = storage.getItem(GAME.saveKey);
  } catch {
    return { state: null, error: "Storage read failed." };
  }
  if (!text) {
    // Attempt legacy migration.
    try {
      const legacy = storage.getItem(GAME.legacySaveKey);
      if (legacy) {
        const migrated = migrateLegacy(JSON.parse(legacy));
        if (migrated) return { state: migrated, migrated: true };
      }
    } catch {
      /* ignore corrupt legacy */
    }
    return { state: null };
  }
  try {
    const raw = JSON.parse(text);
    const state = sanitize(raw);
    if (!state) return { state: null, error: "Save data unreadable." };
    return { state };
  } catch {
    return { state: null, error: "Save data corrupted." };
  }
}

export function saveGame(state, storage = safeStorage()) {
  if (!storage) return false;
  try {
    const payload = { ...state, version: SAVE_VERSION, savedAt: Date.now() };
    storage.setItem(GAME.saveKey, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave(storage = safeStorage()) {
  try {
    storage.removeItem(GAME.saveKey);
    return true;
  } catch {
    return false;
  }
}

export function hasSave(storage = safeStorage()) {
  try {
    return !!storage?.getItem(GAME.saveKey);
  } catch {
    return false;
  }
}

/** Export as HXSP1.<checksum>.<base64> — compact and tamper-evident enough. */
export function exportSave(state) {
  const json = JSON.stringify({ ...state, savedAt: Date.now() });
  return `HXSP1.${checksum(json)}.${toB64(json)}`;
}

export function importSave(code) {
  if (typeof code !== "string") return { state: null, error: "No code provided." };
  const trimmed = code.trim();
  if (!trimmed.startsWith("HXSP1.")) return { state: null, error: "Not a HexSpace export code." };
  const parts = trimmed.split(".");
  if (parts.length !== 3) return { state: null, error: "Code is incomplete." };
  try {
    const json = fromB64(parts[2]);
    if (checksum(json) !== parts[1]) return { state: null, error: "Checksum mismatch — the code is damaged." };
    const state = sanitize(JSON.parse(json));
    if (!state) return { state: null, error: "Code did not contain a valid campaign." };
    return { state };
  } catch {
    return { state: null, error: "Could not decode the code." };
  }
}

function safeStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__hexspace_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
