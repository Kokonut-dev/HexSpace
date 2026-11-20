/**
 * Walkable station interiors.
 *
 * Interiors are assembled from room templates into a 3x2 grid per deck, with
 * corridors derived from adjacency — every station feels laid out rather than
 * generated twice, while different station types produce different room mixes.
 * Layouts are seeded per station so a given port is always the same port.
 */
import { seeded, rand, randInt, pick, shuffle, chance } from "../core/utils.js";

export const DECK = { w: 960, h: 600, tile: 24 };

const ROOM_W = 280;
const ROOM_H = 196;
const GAP_X = 52;
const GAP_Y = 44;
const ORIGIN_X = 56;
const ORIGIN_Y = 46;

/** Slot grid positions for up to 6 rooms (2 rows x 3 columns). */
export const SLOTS = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 2, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
  { col: 2, row: 1 },
];

const ROOM_TYPES = {
  dock: {
    id: "dock",
    name: "Arrival Hangar",
    screen: null,
    service: "dock",
    color: [70, 120, 150],
    icon: "▣",
    desc: "Your ship waits in the cradle. The airlock is at the dockside hatch.",
  },
  hangar: {
    id: "hangar",
    name: "Hangar",
    screen: "fit",
    service: "fit",
    color: [80, 200, 190],
    icon: "⚙",
    desc: "Cranes, coolant lines, and a fitting bay with your name on it.",
  },
  market: {
    id: "market",
    name: "Commodity Exchange",
    screen: "market",
    service: "market",
    color: [240, 180, 110],
    icon: "▤",
    desc: "Live prices from three sectors, updated the moment a hull docks.",
  },
  cantina: {
    id: "cantina",
    name: "Cantina",
    screen: "contracts",
    service: "cantina",
    color: [220, 150, 255],
    icon: "♨",
    desc: "Cheap light, expensive rumours, and a contract board that never empties.",
  },
  hq: {
    id: "hq",
    name: "Faction HQ",
    screen: "hq",
    service: "hq",
    color: [150, 175, 255],
    icon: "◈",
    desc: "Bureaucracy with a fleet behind it. Turn in contracts, take story work.",
  },
  shipyard: {
    id: "shipyard",
    name: "Shipyard",
    screen: "shipyard",
    service: "shipyard",
    color: [120, 200, 255],
    icon: "▰",
    desc: "Hulls for sale, repairs by the point of hull integrity, and a dry dock.",
  },
  clinic: {
    id: "clinic",
    name: "Clinic",
    screen: "clinic",
    service: "clinic",
    color: [255, 160, 190],
    icon: "✚",
    desc: "Patch kits, stim shots and a very expensive regeneration tank.",
  },
  blackmarket: {
    id: "blackmarket",
    name: "Backroom",
    screen: "blackmarket",
    service: "blackmarket",
    color: [255, 110, 130],
    icon: "☣",
    desc: "Unlisted stock at unlisted prices. No receipts, no returns.",
  },
};

/** Which rooms a station type supports, and how many of each. */
const STATION_PLANS = {
  trade: ["dock", "market", "cantina", "hangar", "hq", "shipyard", "clinic"],
  agri: ["dock", "market", "cantina", "hangar"],
  mining: ["dock", "market", "cantina", "hangar", "shipyard"],
  industry: ["dock", "market", "cantina", "hangar", "shipyard"],
  tech: ["dock", "market", "cantina", "hangar", "clinic", "shipyard"],
  luxury: ["dock", "market", "cantina", "hangar", "clinic"],
  clinic: ["dock", "market", "cantina", "clinic"],
  frontier: ["dock", "market", "cantina", "hangar"],
  pirate: ["dock", "market", "cantina", "hangar", "blackmarket"],
  gate: ["dock", "market", "cantina"],
};

export function planFor(station) {
  const plan = STATION_PLANS[station.economy] ?? STATION_PLANS.frontier;
  const rooms = [...plan];
  if (station.faction !== "indie" && !rooms.includes("hq")) rooms.push("hq");
  if (station.economy === "pirate" && !rooms.includes("blackmarket")) rooms.push("blackmarket");
  if (rooms.length > 6) rooms.length = 6;
  return rooms;
}

function slotPos(slotIndex) {
  const { col, row } = SLOTS[slotIndex];
  return {
    x: ORIGIN_X + col * (ROOM_W + GAP_X),
    y: ORIGIN_Y + row * (ROOM_H + GAP_Y),
    w: ROOM_W,
    h: ROOM_H,
    col,
    row,
  };
}

/** Collision rectangles: room interior walls (inset) plus corridor walls. */
function collisionFor(rooms, corridors) {
  const walls = [];
  for (const r of rooms) {
    // Four wall segments around the room, leaving door gaps.
    const doors = r.doors;
    const t = 10;
    const add = (x, y, w, h) => walls.push({ x, y, w, h });
    // top wall with door gap
    if (doors.top) {
      add(r.x, r.y, (r.w - 64) / 2, t);
      add(r.x + (r.w + 64) / 2, r.y, (r.w - 64) / 2, t);
    } else add(r.x, r.y, r.w, t);
    if (doors.bottom) {
      add(r.x, r.y + r.h - t, (r.w - 64) / 2, t);
      add(r.x + (r.w + 64) / 2, r.y + r.h - t, (r.w - 64) / 2, t);
    } else add(r.x, r.y + r.h - t, r.w, t);
    if (doors.left) {
      add(r.x, r.y, t, (r.h - 64) / 2);
      add(r.x, r.y + (r.h + 64) / 2, t, (r.h - 64) / 2);
    } else add(r.x, r.y, t, r.h);
    if (doors.right) {
      add(r.x + r.w - t, r.y, t, (r.h - 64) / 2);
      add(r.x + r.w - t, r.y + (r.h + 64) / 2, t, (r.h - 64) / 2);
    } else add(r.x + r.w - t, r.y, t, r.h);
  }
  for (const c of corridors) {
    // Corridor walls: two long strips on either side of the open channel.
    const t = 8;
    if (c.dir === "h") {
      walls.push({ x: c.x, y: c.y - t, w: c.w, h: t });
      walls.push({ x: c.x, y: c.y + c.h, w: c.w, h: t });
    } else {
      walls.push({ x: c.x - t, y: c.y, w: t, h: c.h });
      walls.push({ x: c.x + c.w, y: c.y, w: t, h: c.h });
    }
  }
  return walls;
}

function corridorBetween(a, b) {
  if (a.row === b.row) {
    const x = Math.min(a.x + a.w, b.x + b.w);
    const left = a.x < b.x ? a : b;
    const right = a.x < b.x ? b : a;
    return {
      dir: "h",
      x: left.x + left.w,
      y: Math.round(a.y + a.h / 2 - 34),
      w: right.x - (left.x + left.w),
      h: 68,
      connects: [left.id, right.id],
    };
  }
  const top = a.row < b.row ? a : b;
  const bottom = a.row < b.row ? b : a;
  return {
    dir: "v",
    x: Math.round(a.x + a.w / 2 - 34),
    y: top.y + top.h,
    w: 68,
    h: bottom.y - (top.y + top.h),
    connects: [top.id, bottom.id],
  };
}

/** Props placed inside a room; some are interactable (bar, board, terminal). */
function propsFor(type, r, rng) {
  const props = [];
  const add = (px, py, kind, extra = {}) => props.push({ x: px, y: py, kind, ...extra });
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  // Always: a terminal/signage node near the door side.
  switch (type) {
    case "dock":
      add(cx, cy + 20, "cradle", { solid: true, w: 150, h: 70 });
      add(cx - 90, r.y + 34, "crate", { solid: true, w: 26, h: 22 });
      add(cx + 96, r.y + 40, "crate", { solid: true, w: 26, h: 22 });
      add(cx, r.y + 28, "hologram", { holo: true });
      break;
    case "hangar":
      add(cx, cy, "gantry", { solid: true, w: 170, h: 70 });
      add(cx - 100, cy + 50, "toolrack", { solid: true, w: 40, h: 18 });
      add(cx + 100, cy + 50, "toolrack", { solid: true, w: 40, h: 18 });
      add(cx, cy - 62, "shipModel", { holo: true });
      break;
    case "market":
      for (let i = -1; i <= 1; i++) add(cx + i * 80, cy - 40, "marketStall", { solid: true, w: 62, h: 34, interact: "market" });
      add(cx, cy + 46, "kiosk", { solid: true, w: 50, h: 26, interact: "market" });
      for (let i = 0; i < 4; i++) add(r.x + 40 + rng() * (r.w - 80), r.y + 24 + rng() * 20, "crate", { solid: true, w: 18, h: 16 });
      break;
    case "cantina":
      add(cx, cy - 20, "bar", { solid: true, w: 140, h: 40, interact: "contracts" });
      for (let i = -1; i <= 1; i++) add(cx + i * 84, cy + 62, "table", { solid: true, w: 36, h: 30 });
      for (let i = -2; i <= 2; i++) add(cx + i * 42, cy - 52, "bottle", {});
      add(r.x + r.w - 40, cy - 20, "juke", { solid: true, w: 22, h: 30 });
      break;
    case "hq":
      add(cx, cy - 44, "desk", { solid: true, w: 150, h: 34, interact: "hq" });
      add(cx, cy + 62, "emblem", { holo: true });
      for (let i = 0; i < 3; i++) add(r.x + 50 + i * 84, cy + 18, "chair", { solid: true, w: 18, h: 14 });
      break;
    case "shipyard":
      add(cx, cy, "hullCradle", { solid: true, w: 190, h: 76, interact: "shipyard" });
      add(cx, cy - 66, "gantryOver", { holo: true });
      add(r.x + 44, cy + 52, "crate", { solid: true, w: 28, h: 24 });
      add(r.x + r.w - 44, cy + 52, "crate", { solid: true, w: 28, h: 24 });
      break;
    case "clinic":
      add(cx, cy - 40, "medBed", { solid: true, w: 60, h: 34, interact: "clinic" });
      add(cx + 88, cy - 40, "medBed", { solid: true, w: 60, h: 34 });
      add(cx, cy + 52, "medCabinet", { solid: true, w: 44, h: 24 });
      break;
    case "blackmarket":
      add(cx, cy - 26, "counter", { solid: true, w: 140, h: 36, interact: "blackmarket" });
      add(cx - 96, cy + 50, "crate", { solid: true, w: 30, h: 26 });
      add(cx + 92, cy + 46, "crate", { solid: true, w: 22, h: 20 });
      break;
    default:
      add(cx, cy, "console", { solid: true, w: 50, h: 28, interact: null });
  }
  return props;
}

function npcsFor(type, r, rng, faction) {
  const out = [];
  const names = ["dockhand", "broker", "pilot", "mechanic", "officer", "courier", "drifter"];
  const count = randInt(rng, 1, type === "cantina" ? 4 : 2);
  for (let i = 0; i < count; i++) {
    out.push({
      id: `npc-${type}-${i}`,
      type: pick(rng, names),
      x: r.x + 46 + rng() * (r.w - 92),
      y: r.y + 70 + rng() * (r.h - 130),
      facing: pick(rng, [0, 1, 2, 3]),
      wanderT: rand(rng, 0, 4),
      vx: 0,
      vy: 0,
      color: {
        dock: "#7fd8ff", hangar: "#5ee6d6", market: "#ffc46b", cantina: "#d7a1ff",
        hq: "#9fb3ff", shipyard: "#78c8ff", clinic: "#ffa0bd", blackmarket: "#ff8098",
      }[type] ?? "#a8bdd6",
      name: pick(rng, ["Rhea", "Mako", "Idris", "Toma", "Sable", "Jun", "Oren", "Mira", "Kal", "Ash", "Nova", "Dex"]),
      faction,
      chatter: pick(rng, CHATTER_LINES),
    });
  }
  return out;
}

const CHATTER_LINES = [
  "Freight rates are up. Corsairs took another convoy at the rim.",
  "Heard a Warband enforcer bought three cases of Bloom. Paid in cores.",
  "The Cartographers pay double for anything older than the gates.",
  "Don't fly the Maw without a warp coil. Trust me.",
  "Meridian is safe. It's the space between here and there that isn't.",
  "If your heat lock trips, stop shooting and run. The guns can wait.",
  "Someone's been echoing the old transit bands out past Cinder Reach.",
  "A hull is a promise to your crew. Keep it patched.",
  "Vey's ships have been seen running escort patterns. Escort for what?",
  "The Silent Gate is a story. A very expensive story.",
  "Bounty work pays better if you bring the transponder back.",
  "Helix will buy any metal you can carry. They won't ask where it came from.",
];

/**
 * Build the full interior for a station entity.
 * Returns { rooms, corridors, walls, props, npcs, spawn, deck }.
 */
export function buildInterior(station) {
  const rng = seeded(station.name.length * 131, station.economy.length * 17, station.tech * 7);
  const plan = planFor(station);
  const rooms = [];
  plan.forEach((type, i) => {
    const pos = slotPos(i);
    const def = ROOM_TYPES[type];
    rooms.push({
      id: type,
      slot: i,
      row: pos.row,
      col: pos.col,
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: pos.h,
      name: def.name,
      screen: def.screen,
      color: def.color,
      icon: def.icon,
      desc: def.desc,
      doors: { top: false, bottom: false, left: false, right: false },
    });
  });

  // Corridors join horizontal neighbours and vertical neighbours.
  const corridors = [];
  for (const room of rooms) {
    const right = rooms.find((r) => r.row === room.row && r.col === room.col + 1);
    if (right) {
      room.doors.right = true;
      right.doors.left = true;
      corridors.push(corridorBetween(room, right));
    }
    const below = rooms.find((r) => r.row === room.row + 1 && r.col === room.col);
    if (below) {
      room.doors.bottom = true;
      below.doors.top = true;
      corridors.push(corridorBetween(room, below));
    }
  }
  // Guarantee connectivity across the grid: join row 1 col 0 to row 1 col 1 etc.
  for (const row of [0, 1]) {
    const inRow = rooms.filter((r) => r.row === row).sort((a, b) => a.col - b.col);
    for (let i = 0; i + 1 < inRow.length; i++) {
      if (inRow[i + 1].col !== inRow[i].col + 1) {
        // Gap: stamp a small connector room so the corridor height works out.
        const a = inRow[i];
        const b = inRow[i + 1];
        const gapRoom = {
          id: `link-${row}-${i}`,
          slot: -1,
          row,
          col: a.col + 1,
          x: a.x + a.w + GAP_X,
          y: a.y,
          w: ROOM_W,
          h: ROOM_H,
          name: "Transit Corridor",
          screen: null,
          color: [70, 90, 115],
          icon: "→",
          desc: "A service corridor lined with conduit.",
          doors: { top: false, bottom: false, left: false, right: false },
          hidden: true,
        };
        a.doors.right = true;
        gapRoom.doors.left = true;
        gapRoom.doors.right = true;
        b.doors.left = true;
        corridors.push(corridorBetween(a, gapRoom));
        corridors.push(corridorBetween(gapRoom, b));
        rooms.push(gapRoom);
      }
    }
  }

  const props = [];
  const npcs = [];
  for (const r of rooms) {
    if (r.id.startsWith("link-")) continue;
    props.push(...propsFor(r.id, r, rng).map((p) => ({ ...p, room: r.id })));
    npcs.push(...npcsFor(r.id, r, rng, station.faction));
  }

  // Anchor point markers: where the player must stand to interact.
  for (const p of props) {
    if (!p.interact) continue;
    p.anchor = { x: p.x, y: p.y + (p.h ?? 24) / 2 + 22 };
  }

  const dockRoom = rooms.find((r) => r.id === "dock") ?? rooms[0];
  const spawn = { x: dockRoom.x + dockRoom.w / 2, y: dockRoom.y + dockRoom.h - 44 };
  const exit = { x: dockRoom.x + dockRoom.w / 2, y: dockRoom.y + 26, room: dockRoom.id };

  return {
    station,
    rooms,
    corridors,
    walls: collisionFor(rooms, corridors),
    props,
    npcs,
    spawn,
    exit,
    deck: { w: DECK.w, h: DECK.h },
    seedLabel: station.name,
  };
}

export function roomAt(interior, x, y) {
  return interior.rooms.find(
    (r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2,
  );
}

export function interactablesIn(interior) {
  const out = [];
  for (const p of interior.props) {
    if (!p.interact) continue;
    out.push({
      kind: "prop",
      id: p.room + ":" + p.kind + ":" + Math.round(p.x),
      x: p.anchor?.x ?? p.x,
      y: p.anchor?.y ?? p.y,
      label: labelForProp(p),
      screen: p.interact,
    });
  }
  for (const n of interior.npcs) {
    out.push({ kind: "npc", id: n.id, x: n.x, y: n.y, label: `Talk to ${n.name}`, npc: n });
  }
  out.push({ kind: "exit", id: "exit", x: interior.exit.x, y: interior.exit.y, label: "Undock — return to flight", screen: "undock" });
  return out;
}

function labelForProp(p) {
  switch (p.interact) {
    case "market":
      return p.kind === "marketStall" ? "Trade at the exchange" : "Check the exchange terminal";
    case "contracts":
      return "Read the contract board";
    case "hq":
      return "Speak with the faction liaison";
    case "shipyard":
      return "Review hulls in the cradle";
    case "clinic":
      return "Use the medical bay";
    case "blackmarket":
      return "Browse the backroom stock";
    default:
      return "Access terminal";
  }
}

/** Wall collision against the walkable deck, with rectangular walls. */
export function canWalk(interior, x, y, radius = 9) {
  if (x < interior.deck.w * 0 - 40 || y < -40) return false;
  if (x > DECK.w + 40 || y > DECK.h + 40) return false;
  // Inside at least one room or corridor?
  const insideRoom = interior.rooms.some(
    (r) => x > r.x + 8 && x < r.x + r.w - 8 && y > r.y + 8 && y < r.y + r.h - 8,
  );
  const insideCorridor = interior.corridors.some(
    (c) => x > c.x + 4 && x < c.x + c.w - 4 && y > c.y + 4 && y < c.y + c.h - 4,
  );
  if (!insideRoom && !insideCorridor) return false;
  for (const w of interior.walls) {
    if (
      x + radius > w.x &&
      x - radius < w.x + w.w &&
      y + radius > w.y &&
      y - radius < w.y + w.h
    )
      return false;
  }
  for (const p of interior.props) {
    if (!p.solid) continue;
    const hw = (p.w ?? 20) / 2 + radius;
    const hh = (p.h ?? 16) / 2 + radius;
    if (Math.abs(x - p.x) < hw && Math.abs(y - p.y) < hh) return false;
  }
  return true;
}

export { ROOM_TYPES, STATION_PLANS };
