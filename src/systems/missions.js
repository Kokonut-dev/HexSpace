/**
 * Contracts: procedural job boards and the four-act story chain.
 *
 * Missions are plain data in `state.missions`. Gameplay loops emit events
 * (`kill`, `scan`, `visit`, `dock`, `salvage`, `collect`, `talk`) and
 * `advance()` moves every matching goal forward. Rewards are paid exactly once.
 */
import { JOBS, GOODS, STORY, FACTIONS, ITEMS, HULLS } from "../config.js";
import { seeded, pick, clamp } from "../core/utils.js";
import { generateSector, relicSites } from "../world/galaxy.js";
import { hexDistance } from "../world/hex.js";

let missionCounter = 0;
function nextId(state) {
  missionCounter = (missionCounter + 1) % 100000;
  return `m${state.stats.missionSeed ?? 1}-${missionCounter}`;
}

/** Rank-scaled multipliers: later game jobs pay and demand more. */
function rankScale(rank) {
  return 1 + rank * 0.55;
}

function rewardFor(type, sector, rank, distance) {
  const base = JOBS[type].baseReward;
  const danger = 1 + sector.danger * 0.5;
  const dist = 1 + distance * 0.08;
  return Math.round((base * danger * dist * rankScale(rank)) / 5) * 5;
}

export function repFor(type, faction) {
  const base = JOBS[type]?.rep ?? { uss: 2 };
  const out = {};
  const primary = faction === "corsair" ? "corsair" : faction === "helix" ? "helix" : "uss";
  out[primary] = base[primary] ?? 3;
  for (const [f, v] of Object.entries(base)) if (!out[f]) out[f] = Math.round(v / 2);
  // Working for one power annoys its rival slightly.
  if (primary === "uss" && out.corsair == null) out.corsair = -1;
  if (primary === "helix" && out.corsair == null) out.corsair = -1;
  if (primary === "corsair") {
    out.uss = (out.uss ?? 0) - 2;
    out.helix = (out.helix ?? 0) - 1;
  }
  return out;
}

/** Candidate target sectors for jobs, preferring nearby, unvisited space. */
function pickTarget(state, sector, rng, maxRange = 4) {
  const options = [];
  for (let dq = -maxRange; dq <= maxRange; dq++) {
    for (let dr = -maxRange; dr <= maxRange; dr++) {
      const q = sector.q + dq,
        r = sector.r + dr;
      const dist = hexDistance(q, r, sector.q, sector.r);
      if (dist < 1 || dist > maxRange) continue;
      const s = generateSector(state.seed, q, r);
      let weight = 1;
      if (s.station) weight += 1.2;
      if (!s.visited) weight += 0.8;
      if (s.security === "anarchy") weight += 0.5;
      options.push({ s, weight });
    }
  }
  if (!options.length) return sector;
  const total = options.reduce((a, o) => a + o.weight, 0);
  let roll = rng() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) return o.s;
  }
  return options[0].s;
}

const BOUNTY_NAMES = ["Kess", "Morrow", "Vex", "Sable", "Grike", "Rask", "Tallow", "Nine", "Hollis", "Bane"];
const BOUNTY_SHIPS = ["Scavenger Pack", "Corsair Wing", "Pirate Captain", "Corsair Gunship"];

/**
 * Generate a mission board for a station. The epoch keeps a board stable while
 * the player is docked but refreshes it after travel.
 */
export function generateBoard(state, sector) {
  const epochKey = `${sector.key}@${Math.floor(state.boardEpoch / 180)}`;
  const rng = seeded(state.seed, sector.q * 13.7, sector.r * 5.9 + state.boardEpoch);
  const rank = state.rank ?? 0;
  const types = [];
  const weights = {
    bounty: 30 + (sector.danger ?? 0.3) * 30,
    delivery: 30,
    survey: 22,
    salvage: 18,
    patrol: sector.security === "high" ? 18 : 8,
    smuggle: sector.security === "anarchy" ? 26 : sector.security === "low" ? 10 : 2,
  };
  for (let i = 0; i < 3 + (rng() < 0.6 ? 1 : 0); i++) types.push(pickWeighted(rng, weights));
  if (!types.includes("bounty") && sector.security === "high") types.push("bounty");

  return types.map((type) => buildMission(state, sector, type, rng, rank, epochKey));
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let roll = rng() * total;
  for (const [k, w] of entries) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function buildMission(state, sector, type, rng, rank, boardKey) {
  const target = pickTarget(state, sector, rng, 2 + rank);
  const dist = hexDistance(sector.q, sector.r, target.q, target.r);
  const reward = rewardFor(type, sector, rank, dist);
  const job = JOBS[type];
  const faction = sector.faction === "indie" ? "uss" : sector.faction;
  const base = {
    id: nextId(state),
    type,
    boardKey,
    faction,
    from: { q: sector.q, r: sector.r, name: sector.name },
    target: { q: target.q, r: target.r, name: target.name },
    reward,
    rep: repFor(type, faction),
    xp: 18 + dist * 6 + rank * 8,
    rank,
    accepted: false,
    done: false,
    progress: 0,
    goal: 1,
  };

  const targetName = target.station?.name ?? target.name;

  switch (type) {
    case "bounty": {
      const name = `“${pick(rng, BOUNTY_NAMES)}”`;
      const ship = BOUNTY_SHIPS[Math.min(3, Math.floor(rank / 2) + Math.floor(rng() * 2))];
      return {
        ...base,
        title: `${job.label}: ${name}`,
        brief: `A ${ship} bearing the callsign ${name} has been raiding traffic near ${target.name}. Put it down and claim the bounty.`,
        goal: { kind: "kill", target: shipKindFor(rng, rank), count: 1 + (rank >= 3 && rng() < 0.5 ? 1 : 0), label: `Destroy the raider in ${target.name}` },
        bountyName: name,
      };
    }
    case "delivery": {
      const goodId = pick(rng, ["food", "meds", "tech", "luxury", "ore"]);
      const qty = 2 + (rank >= 2 ? 2 : 0);
      return {
        ...base,
        title: `${job.label}: ${GOODS[goodId].short} run to ${targetName}`,
        brief: `Haul ${qty} units of ${GOODS[goodId].name} to ${targetName} and hand it to the dockmaster. Cargo is loaded into your hold now.`,
        cargo: { id: goodId, qty },
        goal: { kind: "deliver", target: target.key, count: qty, label: `Deliver ${qty} ${GOODS[goodId].name} to ${targetName}` },
        deliverTo: target.key,
      };
    }
    case "survey": {
      return {
        ...base,
        title: `${job.label}: ${target.name} anomaly`,
        brief: `A pattern in the static near ${target.name} needs eyes on it. Scan any unknown signal in that sector and transmit the data.`,
        goal: { kind: "scan", target: target.key, count: 1, label: `Scan a signal in ${target.name}` },
      };
    }
    case "salvage": {
      const qty = 2 + Math.floor(rng() * 2);
      return {
        ...base,
        title: `${job.label}: ${qty} salvage to ${targetName}`,
        brief: `Cut ${qty} units of salvage alloy from a derelict and bring it to ${targetName}. Your hold must hold it all at once.`,
        goal: { kind: "deliver", target: target.key, count: qty, label: `Deliver ${qty} Salvage Alloy to ${targetName}` },
        deliverGood: "scrap",
        deliverTo: target.key,
      };
    }
    case "patrol": {
      return {
        ...base,
        title: `${job.label}: clear ${target.name}`,
        brief: `Corsair contacts are massing in ${target.name}. Destroy ${2 + Math.min(2, rank)} hostiles in that sector.`,
        goal: { kind: "patrol", target: target.key, count: 2 + Math.min(2, rank), label: `Destroy hostiles in ${target.name}` },
      };
    }
    case "smuggle":
    default: {
      const qty = 2 + Math.floor(rng() * 2);
      return {
        ...base,
        title: `${job.label}: bloom to ${target.name}`,
        brief: `Move ${qty} units of Halcyon Bloom to ${target.name}. Do not get scanned at a USS checkpoint. Cargo is loaded into your hold now.`,
        cargo: { id: "bloom", qty },
        goal: { kind: "deliver", target: target.key, count: qty, label: `Deliver ${qty} Bloom to ${targetName}` },
        deliverTo: target.key,
      };
    }
  }
}

function shipKindFor(rng, rank) {
  if (rank >= 3 && rng() < 0.5) return "enforcer";
  if (rank >= 1 && rng() < 0.6) return "gunship";
  return rng() < 0.5 ? "corsair" : "scavenger";
}

/** Accept a mission: validates rank, loads cargo, notifies mission tracking. */
export function accept(state, mission, stats) {
  if (state.missions.length >= 4) return { ok: false, message: "You already have four active contracts." };
  if (mission.cargo) {
    const used = Object.values(state.cargo).reduce((a, b) => a + b, 0);
    if (used + mission.cargo.qty > stats.cargo)
      return { ok: false, message: `Need ${mission.cargo.qty} free cargo units for the job load.` };
    state.cargo[mission.cargo.id] = (state.cargo[mission.cargo.id] ?? 0) + mission.cargo.qty;
    mission.cargoLoaded = true;
  }
  mission.accepted = true;
  mission.acceptedAt = state.jumps;
  state.missions.push(mission);
  return { ok: true, message: `${mission.title} accepted.` };
}

export function abandon(state, id) {
  const i = state.missions.findIndex((m) => m.id === id);
  if (i < 0) return { ok: false, message: "No such contract." };
  const m = state.missions[i];
  state.missions.splice(i, 1);
  // Job cargo stays in the hold as a parting gift (or a liability).
  return { ok: true, message: `${m.title} abandoned.` };
}

export function activeForSector(state, sectorKey) {
  return state.missions.filter(
    (m) => !m.done && (m.target?.q + "," + m.target?.r === sectorKey || m.goal?.target === sectorKey),
  );
}

function goalLabel(m) {
  if (m.goals) {
    const g =
      m.goals.find(
        (x) => (m.goalProgress?.[`${x.kind}:${x.target ?? ""}`] ?? 0) < (x.count ?? 1),
      ) ?? m.goals[m.goals.length - 1];
    return g?.label ?? "Objective complete";
  }
  if (!m.goal) return "Objective";
  const done = m.progress ?? 0;
  const count = m.goal.count ?? 1;
  return count > 1 && done < count ? `${m.goal.label} (${done}/${count})` : m.goal.label;
}

export function objectiveText(mission) {
  return goalLabel(mission);
}

/** Does this event advance this mission? Returns a list of completed missions. */
export function advance(state, event) {
  const completed = [];
  for (const m of state.missions) {
    if (m.done) continue;
    let changed = false;
    if (m.goals) {
      // Story missions: multiple sequential goals.
      m.goalProgress = m.goalProgress ?? {};
      for (const goal of m.goals) {
        const gk = `${goal.kind}:${goal.target ?? ""}`;
        if ((m.goalProgress[gk] ?? 0) >= goal.count) continue;
        if (matchesGoal(state, goal, event)) {
          m.goalProgress[gk] = (m.goalProgress[gk] ?? 0) + (event.count ?? 1);
          changed = true;
        }
        if (changed) break; // one goal step per event
      }
      const allDone = m.goals.every((g) => (m.goalProgress[`${g.kind}:${g.target ?? ""}`] ?? 0) >= g.count);
      if (allDone) completed.push(m);
    } else if (m.goal && matchesGoal(state, m.goal, event)) {
      m.progress = (m.progress ?? 0) + (event.count ?? 1);
      changed = true;
      if (m.progress >= (m.goal.count ?? 1)) completed.push(m);
    }
    if (changed) m.updatedAt = state.clock;
  }
  return completed;
}

function matchesGoal(state, goal, event) {
  switch (goal.kind) {
    case "kill":
      return event.type === "kill" && (!goal.target || event.enemy === goal.target || (goal.target === "bounty" && event.bounty));
    case "visit":
      return event.type === "visit" && event.sector === goal.target;
    case "scan":
      return event.type === "scan" && (!goal.target || event.sector === goal.target || goal.target === "signal");
    case "salvage":
      return event.type === "salvage";
    case "deliver":
      return event.type === "dock" && event.sector === goal.target;
    case "patrol":
      return event.type === "kill" && event.sector === goal.target;
    case "collect": {
      const have = state.cargo[goal.target] ?? 0;
      return have >= goal.count;
    }
    case "talk":
      return event.type === "talk" && (!goal.target || event.npc === goal.target);
    default:
      return false;
  }
}

/** Check delivery goals against actual cargo at dock time. */
export function checkDeliveries(state, sector, stats) {
  const completed = [];
  for (const m of state.missions) {
    if (m.done) continue;
    if (m.goal?.kind === "deliver" && m.goal.target === sector.key) {
      const good = m.deliverGood ?? m.cargo?.id;
      const need = m.goal.count;
      if ((state.cargo[good] ?? 0) >= need) {
        state.cargo[good] -= need;
        m.progress = need;
        completed.push(m);
      }
    }
  }
  return completed;
}

/**
 * Pay a completed mission. Handles rep, XP, rank-ups and story chaining.
 */
export function complete(state, mission) {
  if (mission.done) return { ok: false, message: "Already paid." };
  mission.done = true;
  state.credits += mission.reward ?? 0;
  state.xp += mission.xp ?? 0;
  const repChanges = [];
  for (const [faction, amount] of Object.entries(mission.rep ?? {})) {
    state.rep[faction] = clamp((state.rep[faction] ?? 0) + amount, -100, 100);
    repChanges.push({ faction, amount });
  }
  // Rivals react to your success.
  if (mission.faction === "uss") state.rep.corsair = clamp((state.rep.corsair ?? 0) - 1, -100, 100);
  if (mission.faction === "corsair") state.rep.uss = clamp((state.rep.uss ?? 0) - 1, -100, 100);

  const rankBefore = state.rank;
  state.rank = Math.max(state.rank, rankFromXp(state.xp));
  state.stats.missions = (state.stats.missions ?? 0) + 1;

  let storyMessage = null;
  if (mission.story) {
    storyMessage = advanceStory(state, mission.story);
  }
  state.missions = state.missions.filter((m) => m.id !== mission.id);
  return {
    ok: true,
    rankUp: state.rank > rankBefore ? state.rank : null,
    repChanges,
    storyMessage,
    credits: mission.reward,
    xp: mission.xp,
  };
}

export function rankFromXp(xp) {
  let rank = 0;
  for (const r of [0, 60, 220, 600, 1200]) if (xp >= r) rank = [0, 60, 220, 600, 1200].indexOf(r);
  return rank;
}

/* ── Story ----------------------------------------------------------------- */

export function storyCurrent(state) {
  return STORY.missions[state.story?.current] ?? null;
}

export function storyAvailable(state) {
  if (state.story?.ending) return null;
  const def = storyCurrent(state);
  if (!def) return null;
  if (state.missions.some((m) => m.story === def.id)) return null;
  return def;
}

/** Turn a story definition into a live mission object. */
export function acceptStory(state) {
  const def = storyCurrent(state);
  if (!def) return { ok: false, message: "No priority contract available." };
  if (state.missions.some((m) => m.story === def.id)) return { ok: false, message: "Already accepted." };
  if (state.missions.length >= 4) {
    // Priority missions may replace a normal contract slot.
    const normal = state.missions.find((m) => m.type !== "story");
    if (!normal) return { ok: false, message: "Abandon a contract first." };
    abandon(state, normal.id);
  }
  const m = {
    id: nextId(state),
    type: "story",
    story: def.id,
    title: def.title,
    brief: def.brief,
    faction: "uss",
    reward: def.reward,
    rep: def.rep,
    xp: 60 + (def.rank + 1) * 40,
    rank: def.rank,
    accepted: true,
    done: false,
    goals: def.goals.map((g) => ({ ...g, count: g.count ?? 1 })),
    goalProgress: {},
    target: def.goals.find((g) => g.kind === "visit")
      ? { q: def.goals.find((g) => g.kind === "visit").q, r: def.goals.find((g) => g.kind === "visit").r }
      : null,
  };
  state.missions.push(m);
  return { ok: true, message: `${def.title} accepted.`, mission: m };
}

/** Advance the story chain after completing a story mission. */
export function advanceStory(state, storyId) {
  const def = STORY.missions[storyId];
  state.story = state.story ?? { current: "story1", completed: [], act: 0, ending: false };
  if (!state.story.completed.includes(storyId)) state.story.completed.push(storyId);
  if (def?.next) {
    state.story.current = def.next;
    const act = STORY.acts.find((a) => a.mission === def.next);
    state.story.act = act ? STORY.acts.indexOf(act) : state.story.act;
    return act ? `${act.act}: ${act.title} — ${act.summary}` : def.title;
  }
  state.story.current = null;
  state.story.ending = true;
  return STORY.ending;
}

/** Build the story mission preview without accepting it. */
export function storyCardState(state) {
  const def = storyCurrent(state);
  if (!def) return null;
  const act = STORY.acts.find((a) => a.mission === def.id);
  return { def, act };
}

/* ── Relay for UI ---------------------------------------------------------- */

export function missionProgressText(state, m) {
  if (m.goals) {
    return m.goals
      .map((g) => {
        const got = m.goalProgress?.[`${g.kind}:${g.target ?? ""}`] ?? 0;
        const name = g.label.replace(/\(\d+\/\d+\)/, "").trim();
        return `${got >= g.count ? "✔" : "○"} ${name}${g.count > 1 ? ` ${got}/${g.count}` : ""}`;
      })
      .join("\n");
  }
  return goalLabel(m);
}

export function targetSectorName(mission) {
  if (!mission) return null;
  const t = mission.target;
  return t?.name ?? null;
}

export function factionsOf(mission) {
  return Object.keys(mission.rep ?? {}).filter((f) => FACTIONS[f]);
}

export function missionCargoList(m) {
  if (m.cargo) return [{ ...m.cargo, name: GOODS[m.cargo.id]?.name ?? ITEMS[m.cargo.id]?.name ?? m.cargo.id }];
  return [];
}

/** Relic find bookkeeping, called by the sector runtime on scan. */
export function relicSitesFor(state) {
  return relicSites(state.seed).map((s) => s.key);
}
