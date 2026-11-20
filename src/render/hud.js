/**
 * Canvas HUD: everything drawn inside the pixel framebuffer rather than as DOM
 * — radar, target readout, integrity bars, heat/power strips, missile pips and
 * the compass. Kept in the framebuffer so it shares the pixel grid and never
 * sharpens against the game art.
 */
import { text, rect, line, circle } from "./frame.js";
import { clamp, fmt, TAU } from "../core/utils.js";
import { PAL, GAME } from "../config.js";

export function drawHud(ctx, frame, world, game) {
  const w = frame.width;
  const h = frame.height;
  const p = world.player;
  const st = world.stats;

  // ── Radar (bottom-left) ────────────────────────────────────────────────
  const radarR = 34;
  const rx = 10 + radarR + 2;
  const ry = h - radarR - 12;
  circle(ctx, rx, ry, radarR, "rgba(5,12,20,0.72)", "rgba(85,230,213,0.28)");
  circle(ctx, rx, ry, radarR * 0.62, null, "rgba(85,230,213,0.12)");
  circle(ctx, rx, ry, radarR * 0.3, null, "rgba(85,230,213,0.12)");
  line(ctx, rx - radarR, ry, rx + radarR, ry, "rgba(85,230,213,0.10)");
  line(ctx, rx, ry - radarR, rx, ry + radarR, "rgba(85,230,213,0.10)");
  const sweep = (world.time * 1.4) % TAU;
  ctx.strokeStyle = "rgba(85,230,213,0.35)";
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + Math.cos(sweep) * radarR, ry + Math.sin(sweep) * radarR);
  ctx.stroke();

  const scale = radarR / GAME.radarRange;
  const blip = (x, y, color, size = 2, shape = "dot") => {
    const dx = (x - p.x) * scale;
    const dy = (y - p.y) * scale;
    if (Math.abs(dx) > radarR || Math.abs(dy) > radarR) return;
    ctx.fillStyle = color;
    if (shape === "diamond") {
      ctx.save();
      ctx.translate(rx + dx, ry + dy);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    } else ctx.fillRect(Math.round(rx + dx), Math.round(ry + dy), size, size);
  };
  if (world.station) blip(world.station.x, world.station.y, PAL.cyan, 5, "diamond");
  for (const g of world.gates) blip(g.x, g.y, g.silent ? PAL.purple : PAL.blue, 4, "diamond");
  for (const e of world.enemies) if (!e.dead) blip(e.x, e.y, e.friendly ? PAL.cyan : PAL.red, 3);
  for (const n of world.npcs) blip(n.x, n.y, PAL.lilac, 3);
  for (const s of world.signals) if (!s.scanned) blip(s.x, s.y, PAL.lilac, 2);
  for (const wr of world.wrecks) if (!wr.salvaged) blip(wr.x, wr.y, PAL.amber, 2);
  for (const pk of world.pickups) blip(pk.x, pk.y, PAL.gold, 1);
  // Player arrow.
  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(p.angle);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(-3, -3);
  ctx.lineTo(-3, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, "RADAR", rx, ry + radarR + 3, { size: 5, align: "center", color: "rgba(160,200,220,0.55)" });

  // ── Integrity panel (bottom-centre-left) ───────────────────────────────
  const bx = 84;
  const by = h - 44;
  const bw = 104;
  rect(ctx, bx - 5, by - 12, bw + 10, 46, "rgba(5,12,20,0.66)");
  ctx.strokeStyle = "rgba(85,230,213,0.15)";
  ctx.strokeRect(bx - 4.5, by - 11.5, bw + 9, 45);
  barLine(ctx, bx, by, bw, p.shield / Math.max(1, p.shieldMax), PAL.cyan, "SHIELD", `${Math.round((p.shield / Math.max(1, p.shieldMax)) * 100)}%`);
  barLine(ctx, bx, by + 10, bw, p.hp / Math.max(1, p.hullMax), p.hp / p.hullMax > 0.3 ? PAL.green : PAL.red, "HULL", `${Math.round(p.hp)}/${Math.round(p.hullMax)}`);
  barLine(ctx, bx, by + 20, bw, p.heat / 100, p.heat > 80 ? PAL.red : p.heat > 55 ? PAL.amber : PAL.blue, "HEAT", `${Math.round(p.heat)}%`);
  // Power draw strip.
  const powerRatio = clamp(st.draw / Math.max(1, st.power), 0, 1.4);
  rect(ctx, bx, by + 30, bw, 2, "rgba(255,255,255,0.08)");
  rect(ctx, bx, by + 30, bw * clamp(powerRatio, 0, 1), 2, powerRatio > 1 ? PAL.red : "#8fb4ff");
  text(ctx, `PWR ${Math.round(st.draw)}/${Math.round(st.power)}`, bx + bw, by + 29, { size: 5, align: "right", color: powerRatio > 1 ? PAL.red : "rgba(160,190,220,0.7)" });

  // Consumables / missiles.
  const pipY = h - 12;
  if (st.missileAmmo > 0) {
    for (let i = 0; i < st.missileAmmo; i++) {
      const filled = i < (world.state.missiles ?? 0);
      rect(ctx, bx + i * 6, pipY - 3, 4, 5, filled ? PAL.rose : "rgba(255,150,170,0.2)");
    }
    text(ctx, "MSL", bx + st.missileAmmo * 6 + 4, pipY - 3, { size: 5, color: "rgba(255,180,200,0.7)" });
  }
  const c = world.state.consumables ?? {};
  let cx = bx + 90;
  for (const [key, glyph, label] of [["fuelCanister", "◆", "K"], ["shieldCell", "◈", "J"], ["patchKit", "✚", "H"]]) {
    if ((c[key] ?? 0) <= 0) continue;
    rect(ctx, cx, pipY - 4, 9, 6, "rgba(10,20,32,0.9)");
    ctx.strokeStyle = "rgba(120,180,220,0.4)";
    ctx.strokeRect(cx + 0.5, pipY - 3.5, 8, 5);
    text(ctx, glyph, cx + 4.5, pipY - 3.5, { size: 4, align: "center", color: PAL.mist });
    text(ctx, String(c[key]), cx + 10, pipY - 4, { size: 5, color: "rgba(160,200,220,0.8)" });
    cx += 20;
  }

  // ── Target panel (top-right) ───────────────────────────────────────────
  const target = world.target;
  if (target && !target.dead) {
    const tw = 118;
    const tx = w - tw - 8;
    const ty = 8;
    rect(ctx, tx, ty, tw, 44, "rgba(5,12,20,0.72)");
    ctx.strokeStyle = target.friendly ? "rgba(85,230,213,0.4)" : "rgba(255,107,122,0.45)";
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 43);
    const color = target.friendly ? PAL.cyan : target.kind === "station" ? PAL.cyan : PAL.red;
    text(ctx, (target.name ?? "Contact").toUpperCase().slice(0, 18), tx + 5, ty + 4, { size: 6, color });
    if (target.kind === "enemy") {
      barLine(ctx, tx + 5, ty + 14, tw - 10, target.shield / Math.max(1, target.shieldMax), PAL.cyan, "SHD", "");
      barLine(ctx, tx + 5, ty + 24, tw - 10, target.hp / Math.max(1, target.hullMax), PAL.red, "HUL", "");
    } else if (target.kind === "station") {
      text(ctx, target.station.economy.toUpperCase(), tx + 5, ty + 15, { size: 5, color: PAL.muted });
      text(ctx, target.station.faction.toUpperCase(), tx + 5, ty + 23, { size: 5, color: PAL.muted });
    } else {
      text(ctx, target.kind.toUpperCase(), tx + 5, ty + 15, { size: 5, color: PAL.muted });
    }
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    text(ctx, `${(d / 100).toFixed(2)} km`, tx + tw - 5, ty + 33, { size: 5, align: "right", color: PAL.mist });
    if (target.def?.boss) text(ctx, "◆ PRIORITY", tx + 5, ty + 33, { size: 5, color: PAL.gold });
  }

  // ── Speed + throttle (bottom-right) ───────────────────────────────────
  const speed = Math.hypot(p.vx, p.vy);
  const sx = w - 62;
  const sy = h - 12;
  text(ctx, `${Math.round(speed)}`, w - 8, sy - 20, { size: 13, align: "right", color: p.boosting ? PAL.amber : PAL.white });
  text(ctx, "M/S", w - 8, sy - 8, { size: 5, align: "right", color: PAL.muted });
  // Thrust chevrons.
  for (let i = 0; i < 4; i++) {
    const active = p.moving ? i < 3 + (p.boosting ? 1 : 0) : i < 1;
    ctx.fillStyle = active ? (p.boosting ? PAL.amber : PAL.cyan) : "rgba(85,230,213,0.15)";
    ctx.beginPath();
    ctx.moveTo(sx + i * 7, sy - 4);
    ctx.lineTo(sx + i * 7 + 4, sy - 8);
    ctx.lineTo(sx + i * 7 + 8, sy - 4);
    ctx.closePath();
    ctx.fill();
  }
  // Flight assist indicator.
  const assist = world.input.assist !== false;
  text(ctx, assist ? "ASSIST ON" : "DRIFT", sx - 4, sy - 20, { size: 5, align: "right", color: assist ? "rgba(160,200,220,0.7)" : PAL.amber });

  // ── Heat warning ──────────────────────────────────────────────────────
  if (p.heat >= 100) {
    const blink = Math.sin(world.time * 10) > 0;
    if (blink) {
      rect(ctx, w / 2 - 30, 30, 60, 12, "rgba(60,8,14,0.85)");
      ctx.strokeStyle = PAL.red;
      ctx.strokeRect(w / 2 - 29.5, 30.5, 59, 11);
      text(ctx, "OVERHEAT", w / 2, 33, { size: 7, align: "center", color: PAL.red });
    }
  }
  if (st.brownout < 1) {
    text(ctx, "POWER BROWNOUT", w / 2, 44, { size: 6, align: "center", color: PAL.amber, shadow: "#02060c" });
  }

  // ── Warp charge (top-left under location chip) ────────────────────────
  rect(ctx, 8, 8, 72, 8, "rgba(5,12,20,0.7)");
  rect(ctx, 8, 8, 72 * clamp(world.state.warp / 100, 0, 1), 8, "rgba(90,169,255,0.55)");
  text(ctx, `WARP ${Math.round(world.state.warp)}%`, 12, 9.5, { size: 5, color: "#dff0ff" });

  // Objective ticker on the canvas bottom edge, mirroring the log.
  if (game?.objective) {
    const txt = game.objective;
    ctx.save();
    ctx.font = '6px "Courier New", monospace';
    const width = Math.min(w - 240, ctx.measureText(txt).width + 12);
    rect(ctx, w / 2 - width / 2, h - 13, width, 10, "rgba(5,12,20,0.7)");
    text(ctx, txt, w / 2, h - 11, { size: 6, align: "center", color: PAL.gold });
    ctx.restore();
  }
}

function barLine(ctx, x, y, w, ratio, color, label, value) {
  const r = clamp(ratio || 0, 0, 1);
  rect(ctx, x, y, w, 5, "rgba(255,255,255,0.06)");
  rect(ctx, x, y, w * r, 5, color);
  // Segment ticks.
  for (let i = 1; i < 10; i++) rect(ctx, x + (w / 10) * i, y, 1, 5, "rgba(4,8,14,0.55)");
  ctx.save();
  ctx.font = '5px "Courier New", monospace';
  ctx.fillStyle = "rgba(4,8,14,0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 2, y + 1);
  ctx.fillStyle = "rgba(230,245,255,0.9)";
  ctx.textAlign = "right";
  ctx.fillText(value, x + w - 2, y + 1);
  ctx.restore();
}

/** Full-screen vignette + scanlines + damage flash, applied after the HUD. */
export function drawOverlays(ctx, frame, effects, opts = {}) {
  const w = frame.width;
  const h = frame.height;
  // Damage flash.
  if (effects.flash > 0.01) {
    ctx.save();
    ctx.globalAlpha = clamp(effects.flash, 0, 0.55);
    ctx.fillStyle = effects.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // Low integrity warning border.
  if (opts.critical) {
    const pulse = 0.2 + Math.sin(performance.now() / 180) * 0.12;
    ctx.strokeStyle = `rgba(255,80,100,${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }
  if (opts.scanlines !== false) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "#02040a";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();
    // Vignette.
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(2,4,10,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  // Warp streaks.
  for (const s of effects.streaks) {
    const alpha = clamp(s.life / s.max, 0, 1);
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
