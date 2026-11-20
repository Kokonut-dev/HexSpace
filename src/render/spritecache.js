/**
 * Sprite cache: lazy baking plus draw helpers. All art is generated once and
 * reused; the cache key determines repaint only when a fitted loadout or hull
 * actually changes.
 */
import {
  bakeShip,
  bakeStation,
  bakeAsteroid,
  bakeWreck,
  bakeGate,
  bakeSignal,
  bakeAvatar,
  bakeProp,
  bakeShipIcon,
  headingIndex,
  HEADINGS,
} from "./shipart.js";
import { HULLS, ENEMIES } from "../config.js";

export class Art {
  constructor() {
    this.ships = {}; // enemy art by hull id
    this.stations = {};
    this.enemyBaked = {};
    this.asteroids = new Map();
    this.wrecks = new Map();
    this.gates = {};
    this.signals = {};
    this.playerBaked = null;
    this.playerKey = "";
    this.avatar = null;
    this.props = new Map();
    this.icons = new Map();
    this.starfield = null;
  }

  init() {
    for (const id of Object.keys(HULLS)) this.ships[id] = bakeShip(id, HULLS[id].starter, { scale: 4 });
    for (const id of Object.keys(ENEMIES)) {
      const def = ENEMIES[id];
      const hull = HULLS[def.art] ?? HULLS.sabre;
      this.enemyBaked[id] = bakeShip(hull.id, hull.starter, {
        scale: 4,
        tones: def.friendly
          ? undefined
          : {
              light: lighten(def.color, 0.4),
              mid: def.color,
              dark: shade(def.color, -0.4),
              deep: "#1a1018",
              accent: def.color,
            },
        engineColor: def.friendly ? "#7fe9ff" : "#ffb08a",
        canopyColor: def.friendly ? "#7fe9ff" : "#ff5050",
      });
    }
    for (const econ of ["trade", "agri", "mining", "industry", "tech", "luxury", "clinic", "frontier", "pirate", "gate"]) {
      this.stations[econ] = bakeStation({ name: econ, tech: 3, economy: econ, faction: "uss" });
    }
    this.gates = { normal: bakeGate(false), silent: bakeGate(true) };
    this.signals = { normal: bakeSignal() };
    this.avatar = bakeAvatar();
    return this;
  }

  /** Rebake the player's ship when the hull or fitting changes. */
  playerShip(hullId, fit) {
    const key = `${hullId}|${Object.entries(fit).sort().map(([k, v]) => `${k}:${v}`).join(",")}`;
    if (key !== this.playerKey) {
      this.playerKey = key;
      this.playerBaked = bakeShip(hullId, fit, { scale: 4 });
      this.playerKey = key;
    }
    return this.playerBaked;
  }

  icon(hullId, fit) {
    const key = `${hullId}|${Object.entries(fit).map(([k, v]) => `${k}:${v}`).join(",")}`;
    if (!this.icons.has(key)) this.icons.set(key, bakeShipIcon(hullId, fit, 3));
    return this.icons.get(key);
  }

  asteroid(seed, radius) {
    const key = `${seed}:${Math.round(radius)}`;
    if (!this.asteroids.has(key)) {
      if (this.asteroids.size > 160) this.asteroids.delete(this.asteroids.keys().next().value);
      this.asteroids.set(key, bakeAsteroid(seed, radius));
    }
    return this.asteroids.get(key);
  }

  wreck(seed) {
    if (!this.wrecks.has(seed)) this.wrecks.set(seed, bakeWreck(seed));
    return this.wrecks.get(seed);
  }

  prop(kind, w, h) {
    const key = `${kind}:${Math.round(w ?? 0)}:${Math.round(h ?? 0)}`;
    if (!this.props.has(key)) this.props.set(key, bakeProp(kind, w, h));
    return this.props.get(key);
  }
}

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amount);
  const g = Math.min(255, ((n >> 8) & 255) + 255 * amount);
  const b = Math.min(255, (n & 255) + 255 * amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = 1 + amount;
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f));
  const b = Math.max(0, Math.min(255, (n & 255) * f));
  return `#${((1 << 24) | ((r | 0) << 16) | ((g | 0) << 8) | (b | 0)).toString(16).slice(1)}`;
}

export function drawBaked(ctx, baked, angle, x, y) {
  if (!baked) return;
  const frame = baked.frames[headingIndex(angle)];
  const drawScale = baked.drawScale ?? 1;
  const width = frame.width / drawScale;
  const height = frame.height / drawScale;
  ctx.drawImage(frame, Math.round(x - width / 2), Math.round(y - height / 2), width, height);
}

export function shipHeading(angle) {
  return headingIndex(angle);
}

export function drawBakedStation(ctx, baked, x, y) {
  ctx.drawImage(baked.canvas, Math.round(x), Math.round(y));
}

export function drawAsteroidCached(ctx, art, seed, radius, x, y, rotation = 0) {
  const img = art.asteroid(seed, radius);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (rotation) ctx.rotate(rotation);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

export function drawWreckCached(ctx, art, seed, x, y, alpha = 1) {
  const img = art.wreck(seed);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y);
  ctx.globalAlpha = 1;
}

export function drawGateCached(ctx, art, silent, x, y) {
  ctx.drawImage(silent ? art.gates.silent : art.gates.normal, x, y);
}

export function drawSignalCached(ctx, art, x, y, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(art.signals.normal, x, y);
  ctx.globalAlpha = 1;
}

/**
 * Engine flames are drawn in world space behind the hull at the hull's engine
 * mounts so throttle, boost and brownout are all legible in the art itself.
 */
export function drawEngineFlames(ctx, ship, baked, x, y, stats, time) {
  const hull = HULLS[ship.hull] ?? HULLS.kestrel;
  const size = hull.art.size;
  const power = ship.boosting ? 1.6 : ship.moving ? 1 : 0.45;
  const flicker = 0.75 + Math.sin(time * 30) * 0.25;
  const brown = stats.brownout < 1 ? 0.5 : 1;
  for (const m of hull.mounts.e ?? []) {
    const ox = Math.cos(ship.angle + Math.PI / 2) * m.x * size * 1.1;
    const oy = Math.sin(ship.angle + Math.PI / 2) * m.x * size * 1.1;
    const bx = x + ox + Math.cos(ship.angle) * size * 0.55;
    const by = y + oy + Math.sin(ship.angle) * size * 0.55;
    const len = (3 + power * 6) * flicker * brown;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ship.angle);
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, "rgba(235,255,255,0.95)");
    g.addColorStop(0.4, "rgba(120,240,255,0.75)");
    g.addColorStop(1, "rgba(60,120,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -1.6);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export { headingIndex, HEADINGS };
