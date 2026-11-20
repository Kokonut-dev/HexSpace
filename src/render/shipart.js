/**
 * Procedural pixel art.
 *
 * Ships, stations, asteroids, avatars and station props are drawn at boot from
 * geometric descriptions — no image assets, no loading screen, and every hull
 * visually reflects its installed modules (guns grow from hardpoints, drives
 * glow brighter, cargo pods bulge).
 *
 * Each hull is baked into 32 rotated headings at a pixel scale, then the
 * renderer picks the nearest heading. Rotation at draw time would smear pixels,
 * so baking is both faster and sharper.
 */
import { HULLS, PAL, MODULES, FACTIONS } from "../config.js";
import { mulberry32, seeded } from "../core/utils.js";

export const HEADINGS = 32;
const SCALE = 2; // sprite pixel size in framebuffer pixels

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

/* ── Ship construction ---------------------------------------------------- */

const HULL_TONES = {
  kestrel: { light: "#d9ecff", mid: "#8cb4d8", dark: "#3d5f80", deep: "#22384f", accent: "#55e6d5" },
  wayfarer: { light: "#e6e0d2", mid: "#b9a98a", dark: "#6d5d45", deep: "#3a3226", accent: "#ffc46b" },
  sabre: { light: "#e2e8ff", mid: "#93a3d8", dark: "#465380", deep: "#262d4f", accent: "#8dffa8" },
  aegis: { light: "#dfe4ea", mid: "#9aa7b8", dark: "#4f5c70", deep: "#2b3542", accent: "#5aa9ff" },
  leviathan: { light: "#e8d9c6", mid: "#b6977a", dark: "#6b5340", deep: "#3a2c22", accent: "#ff9052" },
};

function hullPolygon(hull, detail = 1) {
  const a = hull.art;
  // Nose at (0,-1); width span is a.span.
  const s = a.span;
  const pts = [
    { x: 0, y: -1.02 },
    { x: 0.16 * s, y: -0.66 },
    { x: 0.3 * s, y: -0.28 },
    { x: 0.46 * s, y: 0.12 },
    { x: 0.42 * s, y: 0.62 },
    { x: 0.26 * s, y: 0.94 },
    { x: 0, y: 1.0 },
    { x: -0.26 * s, y: 0.94 },
    { x: -0.42 * s, y: 0.62 },
    { x: -0.46 * s, y: 0.12 },
    { x: -0.3 * s, y: -0.28 },
    { x: -0.16 * s, y: -0.66 },
  ];
  if (a.wing === "delta") {
    return [
      { x: 0, y: -1.05 },
      { x: 0.5 * s, y: 0.2 },
      { x: 0.62 * s, y: 0.86 },
      { x: 0.24 * s, y: 0.72 },
      { x: 0, y: 1.0 },
      { x: -0.24 * s, y: 0.72 },
      { x: -0.62 * s, y: 0.86 },
      { x: -0.5 * s, y: 0.2 },
    ];
  }
  if (a.wing === "hammer") {
    return [
      { x: 0, y: -1.02 },
      { x: 0.2 * s, y: -0.7 },
      { x: 0.62 * s, y: -0.36 },
      { x: 0.78 * s, y: 0.3 },
      { x: 0.62 * s, y: 0.86 },
      { x: 0.2 * s, y: 0.98 },
      { x: -0.2 * s, y: 0.98 },
      { x: -0.62 * s, y: 0.86 },
      { x: -0.78 * s, y: 0.3 },
      { x: -0.62 * s, y: -0.36 },
      { x: -0.2 * s, y: -0.7 },
    ];
  }
  if (a.wing === "fortress") {
    return [
      { x: 0, y: -1.0 },
      { x: 0.34 * s, y: -0.78 },
      { x: 0.72 * s, y: -0.5 },
      { x: 0.86 * s, y: 0.15 },
      { x: 0.7 * s, y: 0.72 },
      { x: 0.34 * s, y: 0.96 },
      { x: -0.34 * s, y: 0.96 },
      { x: -0.7 * s, y: 0.72 },
      { x: -0.86 * s, y: 0.15 },
      { x: -0.72 * s, y: -0.5 },
      { x: -0.34 * s, y: -0.78 },
    ];
  }
  if (a.wing === "box") {
    return [
      { x: 0, y: -1.0 },
      { x: 0.26 * s, y: -0.78 },
      { x: 0.62 * s, y: -0.5 },
      { x: 0.7 * s, y: 0.06 },
      { x: 0.62 * s, y: 0.76 },
      { x: 0.3 * s, y: 0.98 },
      { x: -0.3 * s, y: 0.98 },
      { x: -0.62 * s, y: 0.76 },
      { x: -0.7 * s, y: 0.06 },
      { x: -0.62 * s, y: -0.5 },
      { x: -0.26 * s, y: -0.78 },
    ];
  }
  return pts;
}

/** Draw a ship polygon at a given heading into a context, centre cx,cy. */
function drawHullShape(ctx, hull, cx, cy, size, angle, tones, opts = {}) {
  const poly = hullPolygon(hull);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const scale = size / 2;
  const px = (p) => ({ x: Math.round((p.x * scale) / SCALE) * SCALE, y: Math.round((p.y * scale) / SCALE) * SCALE });
  const mapped = poly.map(px);

  // Engine glow behind the hull.
  if (!opts.bakeOnly) {
    for (const e of hull.mounts.e ?? []) {
      const ex = (e.x * scale), ey = (e.y * scale);
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, size * 0.34);
      g.addColorStop(0, opts.engineColor ?? tones.accent);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g;
      ctx.fillRect(ex - size * 0.34, ey - size * 0.34, size * 0.68, size * 0.68);
      ctx.globalAlpha = 1;
    }
  }

  // Wings behind the fuselage.
  const wingTone = tones.dark;
  for (const side of [-1, 1]) {
    const wing = [
      { x: 0.2 * side * hull.art.span, y: -0.1 },
      { x: 0.72 * side * hull.art.span, y: 0.44 },
      { x: 0.6 * side * hull.art.span, y: 0.74 },
      { x: 0.22 * side * hull.art.span, y: 0.5 },
    ].map(px);
    ctx.beginPath();
    ctx.moveTo(wing[0].x, wing[0].y);
    for (let i = 1; i < wing.length; i++) ctx.lineTo(wing[i].x, wing[i].y);
    ctx.closePath();
    ctx.fillStyle = wingTone;
    ctx.fill();
    ctx.strokeStyle = tones.deep;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Main hull.
  ctx.beginPath();
  ctx.moveTo(mapped[0].x, mapped[0].y);
  for (let i = 1; i < mapped.length; i++) ctx.lineTo(mapped[i].x, mapped[i].y);
  ctx.closePath();
  ctx.fillStyle = tones.mid;
  ctx.fill();
  ctx.strokeStyle = tones.deep;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Nose highlight wedge.
  ctx.beginPath();
  ctx.moveTo(mapped[0].x, mapped[0].y);
  ctx.lineTo(mapped[1].x, mapped[1].y);
  ctx.lineTo(0, -0.2 * scale);
  ctx.closePath();
  ctx.fillStyle = tones.light;
  ctx.fill();

  // Central spine / armour band.
  ctx.fillStyle = tones.dark;
  ctx.fillRect(-1 * SCALE, -0.5 * scale, 2 * SCALE, 1.3 * scale);

  // Cockpit canopy.
  if (hull.art.canopy) {
    const cw = 2.2 * SCALE;
    const ch = 3 * SCALE;
    const cyy = -0.42 * scale;
    ctx.fillStyle = opts.canopyColor ?? "#7fe9ff";
    ctx.fillRect(-cw / 2, cyy, cw, ch);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(-cw / 2, cyy, 1, ch);
  }

  // Hull plating: paired wing panels, access vents and bright nav lamps make
  // each silhouette read clearly at gameplay scale instead of as a flat blob.
  for (const side of [-1, 1]) {
    const panelX = side * hull.art.span * scale * 0.34;
    ctx.fillStyle = tones.light;
    ctx.fillRect(panelX - SCALE / 2, -0.04 * scale, SCALE, 0.34 * scale);
    ctx.fillStyle = tones.dark;
    ctx.fillRect(panelX - SCALE, 0.28 * scale, 2 * SCALE, SCALE);
    ctx.fillStyle = tones.accent;
    ctx.fillRect(side * hull.art.span * scale * 0.58 - SCALE / 2, 0.42 * scale, SCALE, SCALE);
  }
  ctx.fillStyle = tones.light;
  ctx.fillRect(-SCALE / 2, -0.78 * scale, SCALE, SCALE);
  ctx.fillStyle = tones.deep;
  ctx.fillRect(-SCALE, 0.66 * scale, 2 * SCALE, SCALE);

  // Engines: nacelles glow at the stern.
  const nacelles = hull.art.nacelles ?? 1;
  for (let i = 0; i < nacelles; i++) {
    const offset = nacelles === 1 ? 0 : (i - (nacelles - 1) / 2) * 0.34 * hull.art.span;
    const ex = offset * scale;
    const ey = 0.84 * scale;
    const nw = Math.max(2 * SCALE, Math.round(size * 0.06 / SCALE) * SCALE);
    ctx.fillStyle = tones.deep;
    ctx.fillRect(ex - nw / 2, ey - 2 * SCALE, nw, 4 * SCALE);
    ctx.fillStyle = opts.engineColor ?? tones.accent;
    ctx.fillRect(ex - nw / 2 + 1, ey + 1 * SCALE, Math.max(1, nw - 2), 1 * SCALE);
  }
  ctx.restore();
}

/** Module silhouettes drawn on top of the hull at mount points. */
function drawModules(ctx, hull, cx, cy, size, angle, fit, tones) {
  const scale = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const mountWorld = (m) => ({
    x: Math.round(((m.x * scale * 0.9) / SCALE)) * SCALE,
    y: Math.round(((m.y * scale * 0.95) / SCALE)) * SCALE,
  });
  const slots = [];
  for (const [prefix, count] of Object.entries(hull.slots))
    for (let i = 0; i < count; i++) slots.push({ key: `${prefix}${i + 1}`, prefix, mount: hull.mounts[prefix]?.[i] ?? { x: 0, y: 0 } });
  for (const s of slots) {
    const id = fit[s.key];
    if (!id || !MODULES[id]) continue;
    const mod = MODULES[id];
    const p = mountWorld(s.mount);
    if (mod.slot === "weapon") {
      const len = { kinetic: 7, energy: 6, plasma: 8, mining: 6, launcher: 5, ion: 5, kineticHeavy: 9 }[mod.weapon.kind] ?? 6;
      const w = mod.weapon.kind === "plasma" ? 3 : 2;
      ctx.fillStyle = tones.deep;
      ctx.fillRect(p.x - (w * SCALE) / 2, p.y - len * SCALE * 0.6, w * SCALE, len * SCALE * 0.6);
      ctx.fillStyle = mod.weapon.color;
      ctx.fillRect(p.x - SCALE / 2, p.y - len * SCALE * 0.6, SCALE, SCALE);
      ctx.fillStyle = tones.mid;
      ctx.fillRect(p.x - SCALE, p.y - SCALE, 2 * SCALE, 2 * SCALE);
    } else if (mod.slot === "defense" && mod.id === "deflector") {
      ctx.strokeStyle = mod.stats.shield ? "#7fe9ff" : tones.dark;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 5 * SCALE, 3 * SCALE, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (mod.slot === "utility" && mod.id === "cargoPod") {
      ctx.fillStyle = "#4a5a48";
      ctx.fillRect(p.x - 2 * SCALE, p.y - 2 * SCALE, 4 * SCALE, 4 * SCALE);
      ctx.fillStyle = tones.light;
      ctx.fillRect(p.x - 2 * SCALE, p.y - 2 * SCALE, 4 * SCALE, SCALE);
    } else if (mod.slot === "engine") {
      ctx.fillStyle = tones.accent;
      ctx.fillRect(p.x - SCALE, p.y, 2 * SCALE, SCALE);
    } else if (mod.slot === "utility") {
      ctx.fillStyle = tones.dark;
      ctx.fillRect(p.x - SCALE * 1.5, p.y - SCALE, 3 * SCALE, 2 * SCALE);
      ctx.fillStyle = tones.accent;
      ctx.fillRect(p.x - SCALE * 0.5, p.y - SCALE * 0.5, SCALE, SCALE);
    }
  }
  ctx.restore();
}

/** Render one ship heading to a canvas. */
function renderShipCanvas(hull, size, angle, fit, opts = {}) {
  const pad = Math.ceil(size * 0.9);
  const dim = Math.ceil(size * 1.35) + pad * 2;
  const { c, ctx } = canvas(dim, dim);
  const tones = opts.tones ?? HULL_TONES[hull.id] ?? HULL_TONES.kestrel;
  const cx = dim / 2,
    cy = dim / 2;
  ctx.save();
  drawHullShape(ctx, hull, cx, cy, size, angle, tones, { ...opts, engineColor: opts.engineColor ?? tones.accent });
  drawModules(ctx, hull, cx, cy, size, angle, fit, tones);
  ctx.restore();
  // Add a subtle outline pass for readability against busy backgrounds.
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(4,8,16,0.10)";
  ctx.fillRect(0, 0, dim, dim);
  ctx.globalCompositeOperation = "source-over";
  return c;
}

/**
 * Bake 32 headings for a hull+fit. Cached by hull+fit signature.
 * Returns { frames: [canvas], size, dim, drawScale } so high-density sprites
 * can be displayed at the same logical footprint.
 */
export function bakeShip(hullId, fit, opts = {}) {
  const hull = HULLS[hullId] ?? HULLS.kestrel;
  const size = Math.round(hull.art.size * (opts.scale ?? SCALE));
  const frames = [];
  for (let i = 0; i < HEADINGS; i++) {
    const angle = (i / HEADINGS) * Math.PI * 2;
    frames.push(renderShipCanvas(hull, size, angle + Math.PI / 2, fit, opts));
  }
  return { frames, size, dim: frames[0].width, hullId, drawScale: (opts.scale ?? SCALE) / SCALE };
}

/** Pick a baked heading for an arbitrary angle. */
export function headingIndex(angle) {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((a / (Math.PI * 2)) * HEADINGS) % HEADINGS;
}

export function drawBaked(ctx, baked, angle, x, y) {
  const frame = baked.frames[headingIndex(angle)];
  const half = frame.width / 2;
  ctx.drawImage(frame, Math.round(x - half), Math.round(y - half));
}

/* ── Stations ------------------------------------------------------------- */

export function bakeStation(station, size = 1) {
  const rng = seeded(station.name.length, station.tech * 13, station.economy.length);
  const factions = FACTIONS[station.faction] ?? FACTIONS.indie;
  const dim = Math.ceil(260 * size);
  const { c, ctx } = canvas(dim, dim);
  const cx = dim / 2;
  const cy = dim / 2;
  const R = 92 * size;
  // Outer ring.
  ctx.strokeStyle = "#2b3d52";
  ctx.lineWidth = Math.max(2, Math.round(12 * size));
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#41586f";
  ctx.lineWidth = Math.max(1, Math.round(3 * size));
  ctx.beginPath();
  ctx.arc(cx, cy, R + 3, 0, Math.PI * 2);
  ctx.stroke();
  // Habitat blocks along the ring.
  const blocks = 8 + Math.round(station.tech * 2);
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    const bx = cx + Math.cos(a) * R;
    const by = cy + Math.sin(a) * R;
    const bw = 10 * size + rng() * 8;
    const bh = 6 * size + rng() * 6;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(a);
    ctx.fillStyle = "#37485c";
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = "#5b738c";
    ctx.fillRect(-bw / 2, -bh / 2, bw, Math.max(1, bh * 0.3));
    if (rng() < 0.6) {
      ctx.fillStyle = factions.color;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(-bw / 2 + 1, -1, bw - 2, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  // Spokes.
  ctx.strokeStyle = "#31465c";
  ctx.lineWidth = Math.max(2, Math.round(5 * size));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.32, cy + Math.sin(a) * R * 0.32);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  // Central spindle.
  const coreR = 30 * size;
  ctx.fillStyle = "#3b4f66";
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5d7794";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Core lit windows.
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * coreR * 0.8;
    ctx.fillStyle = rng() < 0.5 ? "#7fe9ff" : "#ffd88a";
    ctx.globalAlpha = 0.5 + rng() * 0.4;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 2);
  }
  ctx.globalAlpha = 1;
  // Spire.
  ctx.fillStyle = "#243447";
  ctx.fillRect(cx - 4 * size, cy - R - 20 * size, 8 * size, 26 * size);
  ctx.fillStyle = factions.color;
  ctx.fillRect(cx - 1, cy - R - 20 * size, 2, 3);
  return { canvas: c, size: dim, factionColor: factions.color };
}

/* ── Asteroids ------------------------------------------------------------ */

export function bakeAsteroid(seed, radius) {
  const rng = mulberry32(seed);
  const dim = Math.ceil(radius * 2.6);
  const { c, ctx } = canvas(dim, dim);
  const cx = dim / 2,
    cy = dim / 2;
  const n = 8 + Math.floor(rng() * 4);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (0.74 + rng() * 0.26);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = "#3b3a44";
  ctx.fill();
  ctx.strokeStyle = "#6b6a78";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Craters.
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * radius * 0.7;
    const s = 1 + rng() * (radius * 0.2);
    ctx.fillStyle = rng() < 0.5 ? "#2b2a34" : "#4a4954";
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), Math.round(s), Math.round(s * 0.7));
  }
  // Ore glints.
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * radius * 0.8;
    ctx.fillStyle = rng() < 0.6 ? "#ffb877" : "#8fe8ff";
    ctx.globalAlpha = 0.8;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 1);
  }
  ctx.globalAlpha = 1;
  // Top-left rim light.
  ctx.strokeStyle = "rgba(200,220,255,0.18)";
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < cx && p.y < cy) {
      ctx.moveTo(p.x, p.y);
      const q = pts[(i + 1) % pts.length];
      ctx.lineTo(q.x, q.y);
    }
  }
  ctx.stroke();
  return c;
}

/* ── Wrecks, gates, signals ---------------------------------------------- */

export function bakeWreck(seed, size = 70) {
  const rng = mulberry32(seed);
  const dim = Math.ceil(size * 1.6);
  const { c, ctx } = canvas(dim, dim);
  const cx = dim / 2;
  const cy = dim / 2;
  // A broken freighter: main hull, snapped spine, drifting plates.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rng() * Math.PI * 2);
  ctx.fillStyle = "#2f343f";
  ctx.fillRect(-size * 0.42, -size * 0.16, size * 0.7, size * 0.3);
  ctx.fillStyle = "#3d4452";
  ctx.fillRect(-size * 0.2, -size * 0.28, size * 0.34, size * 0.5);
  ctx.fillStyle = "#252a33";
  ctx.fillRect(size * 0.1, -size * 0.05, size * 0.4, size * 0.14);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#474f5d" : "#1d222a";
    ctx.fillRect(
      (rng() - 0.5) * size,
      (rng() - 0.5) * size,
      2 + rng() * 6,
      2 + rng() * 5,
    );
  }
  // Flickering hazard lights.
  ctx.fillStyle = "#ff8b7a";
  ctx.fillRect(-size * 0.1, -size * 0.3, 2, 2);
  ctx.fillStyle = "#ffb46b";
  ctx.fillRect(size * 0.06, size * 0.02, 1, 1);
  ctx.restore();
  return c;
}

export function bakeGate(silent = false) {
  const dim = 150;
  const { c, ctx } = canvas(dim, dim);
  const cx = dim / 2,
    cy = dim / 2;
  const color = silent ? PAL.purple : PAL.cyan;
  ctx.save();
  ctx.translate(cx, cy);
  // Two pylon arms.
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#2c3a4d";
    ctx.beginPath();
    ctx.moveTo(s * 12, -52);
    ctx.lineTo(s * 40, -20);
    ctx.lineTo(s * 40, 34);
    ctx.lineTo(s * 16, 52);
    ctx.lineTo(s * 12, 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#4a5f78";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(s * 26 - 1, -14, 2, 44);
    ctx.globalAlpha = 1;
  }
  // Singularity ring.
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
  g.addColorStop(0, silent ? "#f2e6ff" : "#c8fff6");
  g.addColorStop(0.35, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = g;
  ctx.fillRect(cx - 36, cy - 36, 72, 72);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 16, 30, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  return c;
}

export function bakeSignal() {
  const dim = 60;
  const { c, ctx } = canvas(dim, dim);
  const cx = dim / 2,
    cy = dim / 2;
  for (const [r, a] of [[10, 0.9], [18, 0.55], [26, 0.3]]) {
    ctx.strokeStyle = PAL.lilac;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
  return c;
}

/* ── Avatar & props ------------------------------------------------------- */

const SUIT = ["#4d6d86", "#6f9ab8", "#eef7ff", "#283b4e", "#55e6d5"];

export function bakeAvatar() {
  const dim = 24;
  const frames = [];
  const dirs = ["down", "side", "up"];
  for (const dir of dirs) {
    const walkFrames = [];
    for (let f = 0; f < 4; f++) {
      const { c, ctx } = canvas(dim, dim);
      const bob = f === 1 || f === 3 ? 0 : 0;
      ctx.save();
      ctx.translate(dim / 2, dim / 2 + 2);
      // Legs.
      const legSwing = f % 2 === 0 ? 1 : -1;
      ctx.fillStyle = SUIT[3];
      if (dir === "side") {
        ctx.fillRect(-3, 4, 2, 5 + (f === 1 ? 1 : 0));
        ctx.fillRect(1, 4, 2, 5 + (f === 3 ? 1 : 0));
      } else {
        ctx.fillRect(-3, 4, 2, 5 + (legSwing > 0 ? 1 : 0));
        ctx.fillRect(1, 4, 2, 5 + (legSwing < 0 ? 1 : 0));
      }
      // Torso.
      ctx.fillStyle = SUIT[0];
      ctx.fillRect(-4, -3 + bob, 8, 8);
      ctx.fillStyle = SUIT[1];
      ctx.fillRect(-4, -3 + bob, 3, 8);
      // Chest light.
      ctx.fillStyle = SUIT[4];
      ctx.fillRect(-1, 0 + bob, 2, 2);
      // Backpack for up view.
      if (dir === "up") {
        ctx.fillStyle = "#2a3d4f";
        ctx.fillRect(-3, -2 + bob, 6, 5);
      }
      // Helmet.
      ctx.fillStyle = SUIT[2];
      ctx.fillRect(-3, -9 + bob, 6, 6);
      ctx.fillStyle = SUIT[1];
      ctx.fillRect(-3, -9 + bob, 6, 2);
      if (dir === "down") {
        ctx.fillStyle = "#1c2b3a";
        ctx.fillRect(-2, -6 + bob, 4, 1);
      } else if (dir === "side") {
        ctx.fillStyle = "#1c2b3a";
        ctx.fillRect(0, -6 + bob, 2, 1);
        ctx.fillStyle = "#2b3f52";
        ctx.fillRect(-4, -7 + bob, 2, 5);
      }
      // Arms.
      ctx.fillStyle = SUIT[0];
      ctx.fillRect(-6, -2 + bob, 2, 5);
      ctx.fillRect(4, -2 + bob, 2, 5);
      ctx.restore();
      walkFrames.push(c);
    }
    frames.push(walkFrames);
  }
  return { frames, dirs, size: dim };
}

export function bakeProp(kind, w = 40, h = 30) {
  const dim = Math.ceil(Math.max(w, h) * 1.8);
  const { c, ctx } = canvas(dim, dim);
  const cx = dim / 2,
    cy = dim / 2;
  ctx.save();
  ctx.translate(cx, cy);
  const box = (x, y, bw, bh, fill, top) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
    if (top) {
      ctx.fillStyle = top;
      ctx.fillRect(x - bw / 2, y - bh / 2 - 4, bw, 4);
      ctx.fillRect(x - bw / 2, y - bh / 2 - 4, 2, bh + 4);
    }
  };
  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };
  switch (kind) {
    case "crate":
      box(0, 0, w, h, "#4a4436", "#6b624c");
      ctx.fillStyle = "#2c2820";
      ctx.fillRect(-w / 2 + 3, -2, w - 6, 2);
      break;
    case "bar":
      box(0, 0, w, h, "#3a2a3f", "#5a3f5e");
      glow(0, -h / 2 - 6, 18, "#ffb0ff");
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = ["#7fe9ff", "#ffc46b", "#b18cff"][(i + 2) % 3];
        ctx.fillRect(i * 8 - 1, -h / 2 - 8, 2, 4);
      }
      break;
    case "table":
      box(0, 0, w, h, "#3d3a36", "#5a554c");
      ctx.fillStyle = "#1f1d1a";
      ctx.fillRect(-4, 4, 8, 4);
      break;
    case "marketStall":
      box(0, 0, w, h, "#3a352a", "#5c5442");
      ctx.fillStyle = "#2a2a33";
      ctx.fillRect(-w / 2, -h / 2 - 22, w, 12);
      ctx.fillStyle = "#ffc46b";
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-w / 2, -h / 2 - 22, w, 2);
      ctx.globalAlpha = 1;
      break;
    case "kiosk":
      box(0, 0, w, h, "#333a44", "#4e5765");
      glow(0, -h / 2 - 4, 14, "#7fe9ff");
      break;
    case "cradle":
      box(0, 0, w, h, "#2a3442", "#3d4c61");
      ctx.fillStyle = "#1a2230";
      ctx.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
      break;
    case "gantry":
      box(0, 0, w, h, "#2e3644", "#4b5666");
      ctx.strokeStyle = "#5c6b80";
      for (let i = -w / 2 + 10; i < w / 2; i += 16) {
        ctx.beginPath();
        ctx.moveTo(i, -h / 2);
        ctx.lineTo(i + 10, h / 2);
        ctx.stroke();
      }
      break;
    case "toolrack":
      box(0, 0, w, h, "#3a3f46", "#575d66");
      ctx.fillStyle = "#ff9052";
      ctx.fillRect(-w / 2 + 4, -4, 3, 8);
      ctx.fillRect(0, -4, 3, 8);
      break;
    case "desk":
      box(0, 0, w, h, "#303848", "#47536b");
      glow(0, -h / 2 - 4, 20, "#8fb0ff");
      break;
    case "chair":
      box(0, 0, w, h, "#2f363f", "#4a525d");
      break;
    case "hullCradle":
      box(0, 0, w, h, "#29303b", "#3f4a59");
      ctx.strokeStyle = "#78c8ff";
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
      ctx.globalAlpha = 1;
      break;
    case "medBed":
      box(0, 0, w, h, "#3b3f4c", "#5d6373");
      ctx.fillStyle = "#ffa0bd";
      ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, 3);
      break;
    case "medCabinet":
      box(0, 0, w, h, "#3f4450", "#626978");
      ctx.fillStyle = "#ffa0bd";
      ctx.fillRect(-2, -h / 2 + 6, 4, h - 12);
      break;
    case "counter":
      box(0, 0, w, h, "#3a2b30", "#5b4249");
      glow(0, -h / 2 - 6, 16, "#ff8098");
      break;
    case "juke":
      box(0, 0, w, h, "#2d2a3c", "#4a4460");
      glow(0, 0, 14, "#d7a1ff");
      break;
    case "console":
      box(0, 0, w, h, "#2c333d", "#46505d");
      glow(0, -h / 2 - 4, 12, "#7fe9ff");
      break;
    default:
      box(0, 0, w, h, "#343a44", "#4f5763");
  }
  ctx.restore();
  return c;
}

/** Ship icon used in the fitting screen (top-down, no rotation). */
export function bakeShipIcon(hullId, fit, px = 3) {
  const hull = HULLS[hullId] ?? HULLS.kestrel;
  const size = Math.round(hull.art.size * px * 0.9);
  return renderShipCanvas(hull, size, Math.PI / 2, fit);
}

/** Favicon-ish logo mark: a hex with a ship inside. */
export function bakeLogo() {
  const { c, ctx } = canvas(32, 32);
  const cx = 16,
    cy = 16;
  ctx.strokeStyle = PAL.cyan;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * 13;
    const y = cy + Math.sin(a) * 13;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = PAL.white;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx + 5, cy + 6);
  ctx.lineTo(cx, cy + 3);
  ctx.lineTo(cx - 5, cy + 6);
  ctx.closePath();
  ctx.fill();
  return c;
}
