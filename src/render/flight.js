/**
 * Flight-scene renderer. Draws the world into the pixel framebuffer in a
 * deliberate order: backdrop → nebula → planets → gates → wrecks/signals →
 * rocks → pickups → ships → projectiles → particles → overlays → canvas HUD.
 */
import { drawStarfield } from "./starfield.js";
import { drawBaked, drawBakedStation, drawAsteroidCached, drawWreckCached, drawGateCached, drawSignalCached, shipHeading, drawEngineFlames } from "./spritecache.js";
import { drawParticles, drawFloaters } from "./fx.js";
import { text, glowCircle, circle, line, rect } from "./frame.js";
import { clamp, dist } from "../core/utils.js";
import { PAL, GAME, FACTIONS, SECURITY } from "../config.js";

const radars = [];

export function drawFlight(ctx, frame, world, effects, art, opts = {}) {
  const w = frame.width;
  const h = frame.height;
  const cam = frame.camera;
  const toScreen = (x, y) => ({ x: Math.round(x - cam.x + w / 2), y: Math.round(y - cam.y + h / 2) });
  const dt = opts.dt ?? 0.016;

  drawStarfield(ctx, art.starfield, cam, w, h, dt, opts.tint);

  // Nebulae in the world add local tint and sensor noise.
  ctx.save();
  for (const n of world.nebulas) {
    const s = toScreen(n.x, n.y);
    if (s.x < -n.radius || s.x > w + n.radius || s.y < -n.radius || s.y > h + n.radius) continue;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, n.radius);
    g.addColorStop(0, "rgba(120,70,200,0.28)");
    g.addColorStop(0.55, "rgba(60,40,120,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(s.x - n.radius, s.y - n.radius, n.radius * 2, n.radius * 2);
  }
  ctx.restore();

  // Planets (drawn as low-res shaded discs with ring hints).
  for (const p of world.planets) {
    const s = toScreen(p.x, p.y);
    if (s.x < -p.radius * 2 || s.x > w + p.radius * 2 || s.y < -p.radius * 2 || s.y > h + p.radius * 2) continue;
    const g = ctx.createRadialGradient(s.x - p.radius * 0.3, s.y - p.radius * 0.35, p.radius * 0.1, s.x, s.y, p.radius);
    g.addColorStop(0, lighten(p.hue, 0.35));
    g.addColorStop(0.6, p.hue);
    g.addColorStop(1, "#05070d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,210,255,0.12)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.radius, -2.6, -1.2);
    ctx.stroke();
  }

  // Gates.
  for (const g of world.gates) {
    const s = toScreen(g.x, g.y);
    if (s.x < -100 || s.x > w + 100 || s.y < -100 || s.y > h + 100) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.sin(world.time * 0.4) * 0.06);
    drawGateCached(ctx, art, g.silent, -75, -75);
    ctx.restore();
    glowCircle(ctx, s.x, s.y, g.silent ? 70 : 46, g.silent ? PAL.purple : PAL.cyan, 0.35 + Math.sin(world.time * 2) * 0.08);
    if (opts.showLabels) label(ctx, g.name, s.x, s.y + 62, g.silent ? PAL.purple : PAL.cyan, world);
  }

  // Wrecks.
  for (const w0 of world.wrecks) {
    const s = toScreen(w0.x, w0.y);
    if (s.x < -80 || s.x > w + 80 || s.y < -80 || s.y > h + 80) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(w0.rotation);
    drawWreckCached(ctx, art, w0.seed, -60, -60, w0.salvaged ? 0.65 : 1);
    ctx.restore();
    if (!w0.salvaged) glowCircle(ctx, s.x, s.y, 40, PAL.amber, 0.10 + Math.sin(world.time * 3) * 0.04);
    if (opts.showLabels) label(ctx, w0.salvaged ? `${w0.name} (stripped)` : w0.name, s.x, s.y + 48, w0.salvaged ? PAL.muted : PAL.amber, world);
  }

  // Signals.
  for (const s0 of world.signals) {
    const s = toScreen(s0.x, s0.y);
    if (s.x < -60 || s.x > w + 60 || s.y < -60 || s.y > h + 60) continue;
    const pulse = 0.5 + Math.sin(world.time * 3 + s0.phase) * 0.5;
    glowCircle(ctx, s.x, s.y, 34 + pulse * 10, s0.story === "beacon" ? PAL.cyan : PAL.lilac, 0.16 + pulse * 0.12);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(world.time * 0.4);
    drawSignalCached(ctx, art, -30, -30, s0.scanned ? 0.4 : 1);
    ctx.restore();
    if (!s0.scanned) {
      circle(ctx, s.x, s.y, 20 + Math.sin(world.time * 2.2) * 3, null, s0.story === "beacon" ? PAL.cyan : PAL.lilac);
    }
    if (opts.showLabels) label(ctx, s0.scanned ? `${s0.name} (scanned)` : s0.name, s.x, s.y + 38, s0.scanned ? PAL.muted : PAL.lilac, world);
  }

  // NPCs.
  for (const n of world.npcs) {
    const s = toScreen(n.x, n.y);
    glowCircle(ctx, s.x, s.y, 34, PAL.lilac, 0.2);
    const baked = art.ships.wayfarer;
    drawBaked(ctx, baked, world.time * 0.05, s.x, s.y);
    if (opts.showLabels) label(ctx, n.name, s.x, s.y + 40, PAL.lilac, world);
  }

  // Station.
  if (world.station) {
    const st = world.station;
    const s = toScreen(st.x, st.y);
    const baked = art.stations[st.station.economy] ?? art.stations.trade;
    glowCircle(ctx, s.x, s.y, 120, FACTIONS[st.station.faction]?.color ?? PAL.cyan, 0.10);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(st.angle);
    drawBakedStation(ctx, baked, -baked.width / 2, -baked.height / 2);
    ctx.restore();
    // Docking ring marker when in range.
    const d = dist(st.x, st.y, world.player.x, world.player.y);
    if (d < GAME.dockRange + 200) {
      const alpha = clamp(1 - d / (GAME.dockRange + 200), 0, 1);
      circle(ctx, s.x, s.y, 60 + Math.sin(world.time * 2) * 3, null, `rgba(85,230,213,${0.15 + alpha * 0.35})`);
    }
    if (opts.showLabels) label(ctx, st.station.name, s.x, s.y + 104, PAL.cyan, world);
  }

  // Asteroids.
  for (const a of world.rocks) {
    if (a.dead) continue;
    const s = toScreen(a.x, a.y);
    if (s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) continue;
    drawAsteroidCached(ctx, art, a.seed, a.radius, s.x, s.y, a.rotation);
    if (a.flash > 0) {
      ctx.globalAlpha = a.flash * 0.5;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, a.radius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Pickups: pulsing cargo glyphs.
  for (const p of world.pickups) {
    const s = toScreen(p.x, p.y);
    const bob = Math.sin(p.bob) * 2;
    const color = p.pickupKind === "credits" ? PAL.gold : PAL.cyan;
    glowCircle(ctx, s.x, s.y + bob, 12, color, 0.35);
    rect(ctx, s.x - 3, s.y - 3 + bob, 6, 6, color);
    rect(ctx, s.x - 1, s.y - 1 + bob, 2, 2, "#04070d");
    if (p.pickupKind === "credits") text(ctx, "CR", s.x, s.y + 12 + bob, { size: 6, align: "center", color });
  }

  // Wingman.
  if (world.wingman && world.wingman.hp > 0) {
    const wm = world.wingman;
    const s = toScreen(wm.x, wm.y);
    drawBaked(ctx, art.shipsPatrol ?? art.ships.sabre, wm.angle, s.x, s.y);
    text(ctx, "TACK", s.x, s.y - 22, { size: 6, align: "center", color: PAL.cyan, shadow: "#02060c" });
  }

  // Enemies.
  for (const e of world.enemies) {
    if (e.dead) continue;
    const s = toScreen(e.x, e.y);
    if (s.x < -70 || s.x > w + 70 || s.y < -70 || s.y > h + 70) continue;
    const baked = art.enemyBaked[e.defId] ?? art.ships.sabre;
    if (e.flash > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      drawBaked(ctx, baked, e.angle, s.x, s.y);
      ctx.restore();
    }
    drawBaked(ctx, baked, e.angle, s.x, s.y);
    if (e.shield > 0) {
      ctx.strokeStyle = `rgba(120,220,255,${0.10 + (e.shield / Math.max(1, e.shieldMax)) * 0.16})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, e.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (world.target === e || world.target?.id === e.id) targetBrackets(ctx, s.x, s.y, e.radius + 8, e.friendly ? PAL.cyan : PAL.red);
    if (opts.showLabels) {
      label(ctx, e.name, s.x, s.y + e.radius + 12, e.friendly ? PAL.cyan : PAL.red, world, e.boss);
      if (e.hullMax > 120 || e.boss) bar(ctx, s.x - 18, s.y - e.radius - 12, 36, e.hp / e.hullMax, e.friendly ? PAL.cyan : PAL.red);
    }
  }

  // Player engine plumes and hull.
  const p = world.player;
  const ps = toScreen(p.x, p.y);
  const bakedPlayer = opts.playerBaked ?? art.playerBaked;
  drawEngineFlames(ctx, p, bakedPlayer, ps.x, ps.y, world.stats, world.time);
  const flicker = p.shield > 0 ? 0.16 + (p.shield / Math.max(1, p.shieldMax)) * 0.2 : 0;
  if (flicker > 0) glowCircle(ctx, ps.x, ps.y, p.radius + 16, PAL.cyan, flicker * 0.5);
  drawBaked(ctx, bakedPlayer, p.angle, ps.x, ps.y);
  if (p.disabled > 0) text(ctx, "DISABLED", ps.x, ps.y - 32, { size: 6, align: "center", color: PAL.red });

  // Projectiles.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of world.projectiles) {
    const s = toScreen(b.x, b.y);
    const t = toScreen(b.px, b.py);
    if (b.kind === "plasma" || b.kind === "plasmaOrb") {
      glowCircle(ctx, s.x, s.y, 8, b.color, 0.8);
      rect(ctx, s.x - 2, s.y - 2, 4, 4, "#f0e0ff");
    } else if (b.kind === "ion") {
      line(ctx, t.x, t.y, s.x, s.y, b.color, 2);
      glowCircle(ctx, s.x, s.y, 6, b.color, 0.5);
    } else {
      line(ctx, t.x, t.y, s.x, s.y, b.color, b.size >= 2 ? 2 : 1);
    }
  }
  for (const m of world.missiles) {
    const s = toScreen(m.x, m.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(m.angle);
    ctx.fillStyle = m.friendly ? "#ffe0e8" : "#ffb8a0";
    ctx.fillRect(-3, -1, 6, 2);
    ctx.fillStyle = m.friendly ? PAL.rose : PAL.ember;
    ctx.fillRect(-5, -1, 2, 2);
    ctx.restore();
    glowCircle(ctx, s.x, s.y, 10, m.friendly ? PAL.rose : PAL.ember, 0.5);
  }
  ctx.restore();

  // Debris.
  for (const d of world.debris) {
    const s = toScreen(d.x, d.y);
    ctx.globalAlpha = clamp(d.life, 0, 1);
    ctx.fillStyle = d.color;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), d.size, d.size);
  }
  ctx.globalAlpha = 1;

  // Particles and floaters.
  drawParticles(ctx, effects, toScreen);
  drawFloaters(ctx, effects, toScreen);

  // Sector ring boundary warning near the edge.
  drawArenaEdge(ctx, world, ps, w, h);

  // Canvas HUD: target reticle at screen edge, interaction prompts, off-screen
  // target arrow, area banner.
  drawTargetArrow(ctx, world, toScreen, w, h);
  drawInteraction(ctx, world, ps.x, ps.y, w, h);
  if (opts.banner) drawBanner(ctx, opts.banner, w, h);
  if (opts.prompt) drawPrompt(ctx, opts.prompt, w, h);
}

/* ── Helpers -------------------------------------------------------------- */

function lighten(hex, amount) {
  if (!hex || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amount);
  const g = Math.min(255, ((n >> 8) & 255) + 255 * amount);
  const b = Math.min(255, (n & 255) + 255 * amount);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function label(ctx, str, x, y, color, world, bold = false) {
  const d = Math.hypot(x - (world.player.x - world.player.x + x), 0);
  ctx.save();
  ctx.font = `${bold ? "bold " : ""}6px "Courier New", monospace`;
  const width = ctx.measureText(str).width + 8;
  ctx.fillStyle = "rgba(5,9,17,0.72)";
  ctx.fillRect(Math.round(x - width / 2), Math.round(y - 6), Math.round(width), 9);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(str, Math.round(x), Math.round(y - 5));
  ctx.restore();
}

function bar(ctx, x, y, w, ratio, color) {
  rect(ctx, x, y, w, 2, "rgba(4,8,16,0.8)");
  rect(ctx, x, y, Math.max(0, w * clamp(ratio, 0, 1)), 2, color);
}

function targetBrackets(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const s = r;
  const len = Math.max(4, r * 0.35);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y + dy * s - dy * len);
    ctx.lineTo(x + dx * s, y + dy * s);
    ctx.lineTo(x + dx * s - dx * len, y + dy * s);
    ctx.stroke();
  }
}

function drawArenaEdge(ctx, world, ps, w, h) {
  const d = Math.hypot(world.player.x, world.player.y);
  const R = GAME.sectorSize;
  if (d > R - 260) {
    const t = clamp((d - (R - 260)) / 260, 0, 1);
    ctx.strokeStyle = `rgba(255,120,120,${t * 0.25})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i += 4) {
      const a = (i / 60) * Math.PI * 2;
      const x = w / 2 + Math.cos(a) * (w * 0.7);
      const y = h / 2 + Math.sin(a) * (h * 0.7);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
      ctx.stroke();
    }
    text(ctx, "SECTOR BOUNDARY", w / 2, h - 52, { size: 7, align: "center", color: "#ff9aa5", alpha: t });
  }
}

function drawTargetArrow(ctx, world, toScreen, w, h) {
  let target = world.target;
  if (target?.dead) target = null;
  if (!target) return;
  const s = toScreen(target.x, target.y);
  const pad = 24;
  if (s.x > pad && s.x < w - pad && s.y > pad && s.y < h - pad) return;
  const cx = w / 2,
    cy = h / 2;
  const a = Math.atan2(s.y - cy, s.x - cx);
  const r = Math.min(w, h) / 2 - 18;
  const x = cx + Math.cos(a) * r;
  const y = cy + Math.sin(a) * r;
  const d = Math.hypot(target.x - world.player.x, target.y - world.player.y);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = target.friendly ? PAL.cyan : PAL.red;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, `${Math.round(d / 10) / 100}km`, x, y + 8, { size: 6, align: "center", color: PAL.mist, shadow: "#02060c" });
}

function drawInteraction(ctx, world, px, py, w, h) {
  const it = world.interact;
  if (!it) return;
  const s = { x: Math.round(it.entity.x - world.player.x + w / 2), y: Math.round(it.entity.y - world.player.y + h / 2) };
  const t = (world.time * 1.6) % 1;
  ctx.strokeStyle = `rgba(85,230,213,${0.6 - t * 0.45})`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 20 + t * 16, 0, Math.PI * 2);
  ctx.stroke();
  text(ctx, it.label.toUpperCase(), s.x, s.y - 32, { size: 6, align: "center", color: PAL.cyan, shadow: "#02060c" });
  if (world.holdTarget) {
    const ratio = clamp(world.holdProgress / world.holdTarget.hold, 0, 1);
    rect(ctx, s.x - 22, s.y + 26, 44, 3, "rgba(6,12,20,0.85)");
    rect(ctx, s.x - 22, s.y + 26, 44 * ratio, 3, PAL.cyan);
  }
}

function drawBanner(ctx, banner, w, h) {
  // banner: { title, subtitle, color, life, max }
  const t = clamp(banner.life / banner.max, 0, 1);
  const alpha = t > 0.82 ? (1 - t) / 0.18 : Math.min(1, t / 0.15);
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  const y = h * 0.32;
  const grad = ctx.createLinearGradient(0, y - 34, 0, y + 30);
  grad.addColorStop(0, "rgba(4,8,16,0)");
  grad.addColorStop(0.5, "rgba(4,8,16,0.75)");
  grad.addColorStop(1, "rgba(4,8,16,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y - 34, w, 64);
  ctx.fillStyle = banner.color ?? PAL.cyan;
  ctx.fillRect(w / 2 - 60, y - 20, 120, 1);
  text(ctx, banner.title, w / 2, y - 14, { size: 11, align: "center", color: banner.color ?? PAL.cyan, shadow: "#02060c" });
  if (banner.subtitle) text(ctx, banner.subtitle, w / 2, y + 2, { size: 6, align: "center", color: PAL.mist });
  ctx.restore();
}

function drawPrompt(ctx, prompt, w, h) {
  if (!prompt) return;
  ctx.save();
  ctx.font = '7px "Courier New", monospace';
  const width = ctx.measureText(prompt.text).width + 16;
  ctx.fillStyle = "rgba(6,12,22,0.9)";
  ctx.fillRect(w / 2 - width / 2, h - 44, width, 16);
  ctx.strokeStyle = "rgba(85,230,213,0.4)";
  ctx.strokeRect(w / 2 - width / 2 + 0.5, h - 43.5, width - 1, 15);
  text(ctx, prompt.text, w / 2, h - 39, { size: 7, align: "center", color: prompt.color ?? PAL.cyan });
  if (prompt.sub) text(ctx, prompt.sub, w / 2, h - 24, { size: 6, align: "center", color: PAL.muted });
  ctx.restore();
}

/** Faction/security tint for the starfield, used by the game loop. */
export function sectorTint(sector) {
  const f = FACTIONS[sector.faction];
  if (!f) return null;
  const alpha = sector.security === "anarchy" || sector.security === "deep" ? 0.10 : 0.05;
  return f.color + Math.round(alpha * 255).toString(16).padStart(2, "0");
}
