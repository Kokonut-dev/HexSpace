/**
 * Station interior renderer.
 *
 * 2.5D approach: floors are drawn flat with per-room checkering and decals,
 * wall faces are extruded as vertical strips on the far (top) edge of each
 * room, and everything that stands on the deck sorts by its foot Y so the
 * player, NPCs and props occlude each other correctly. Light pools and glowing
 * signage are composited additively on top.
 */
import { text, rect, glowCircle } from "./frame.js";
import { clamp } from "../core/utils.js";
import { PAL } from "../config.js";

const WALL_H = 22;

export function drawStation(ctx, frame, interior, avatar, art, opts = {}) {
  const w = frame.width;
  const h = frame.height;
  const cam = frame.camera;
  const t = opts.time ?? 0;

  // Backdrop: station hull interior darkness.
  ctx.fillStyle = "#070c14";
  ctx.fillRect(0, 0, w, h);
  drawBackWash(ctx, w, h, interior, t);

  const toScreen = (x, y) => ({ x: Math.round(x - cam.x + w / 2), y: Math.round(y - cam.y + h / 2) });

  // ── Floors ────────────────────────────────────────────────────────────
  for (const r of interior.rooms) {
    const s = toScreen(r.x, r.y);
    if (s.x + r.w < 0 || s.x > w || s.y + r.h < 0 || s.y > h) continue;
    const [cr, cg, cb] = r.color;
    const base = r.hidden ? "#0d1520" : `rgb(${Math.round(cr * 0.18 + 6)},${Math.round(cg * 0.2 + 10)},${Math.round(cb * 0.22 + 18)})`;
    ctx.fillStyle = base;
    ctx.fillRect(s.x, s.y, r.w, r.h);
    // Tile checker.
    const step = 16;
    for (let y = 0; y < r.h; y += step) {
      for (let x = 0; x < r.w; x += step) {
        if (((x / step) | 0) % 2 === ((y / step) | 0) % 2) {
          ctx.fillStyle = "rgba(255,255,255,0.018)";
          ctx.fillRect(s.x + x, s.y + y, step, step);
        }
      }
    }
    // Room-tinted floor glow and border trim.
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.22)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, r.w - 1, r.h - 1);
    const g = ctx.createRadialGradient(s.x + r.w / 2, s.y + r.h / 2, 8, s.x + r.w / 2, s.y + r.h / 2, r.w * 0.55);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},0.10)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, r.w, r.h);
    // Door thresholds on each open side.
    drawDoors(ctx, r, s);
  }

  // ── Corridors ─────────────────────────────────────────────────────────
  for (const c of interior.corridors) {
    const s = toScreen(c.x, c.y);
    ctx.fillStyle = "#0e1722";
    ctx.fillRect(s.x, s.y, c.w, c.h);
    ctx.strokeStyle = "rgba(90,130,160,0.18)";
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, c.w - 1, c.h - 1);
    // Floor strips.
    if (c.dir === "h") {
      for (let x = 0; x < c.w; x += 12) {
        ctx.fillStyle = "rgba(120,180,220,0.08)";
        ctx.fillRect(s.x + x + 5, s.y + c.h / 2 - 5, 2, 10);
      }
    } else {
      for (let y = 0; y < c.h; y += 12) {
        ctx.fillStyle = "rgba(120,180,220,0.08)";
        ctx.fillRect(s.x + c.w / 2 - 5, s.y + y + 5, 10, 2);
      }
    }
  }

  // ── Wall faces (extruded) ─────────────────────────────────────────────
  for (const r of interior.rooms) {
    const s = toScreen(r.x, r.y);
    if (s.y + r.h < 0 || s.y > h + 40 || s.x + r.w < 0 || s.x > w) continue;
    drawWallFaces(ctx, r, s, interior);
  }

  // ── Room signage ──────────────────────────────────────────────────────
  for (const r of interior.rooms) {
    if (r.hidden) continue;
    const s = toScreen(r.x, r.y);
    if (s.x + r.w < 0 || s.x > w || s.y + r.h < 0 || s.y > h) continue;
    sign(ctx, r, s, t);
  }

  // ── Depth-sorted actors and props ─────────────────────────────────────
  const drawables = [];
  for (const p of interior.props) {
    const s = toScreen(p.x, p.y);
    if (s.x < -90 || s.x > w + 90 || s.y < -90 || s.y > h + 90) continue;
    drawables.push({ sortY: p.y + (p.h ?? 0) / 2, draw: () => drawProp(ctx, p, s, art) });
  }
  for (const n of interior.npcs) {
    const s = toScreen(n.x, n.y);
    if (s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) continue;
    drawables.push({
      sortY: n.y,
      draw: () => {
        drawActor(ctx, art, s.x, s.y, n.facing, n.moving ? (t * 7) % 4 : 0, n.color, false);
        text(ctx, n.name, s.x, s.y - 26, { size: 6, align: "center", color: n.color, shadow: "#02060c", alpha: 0.9 });
      },
    });
  }
  {
    const s = toScreen(avatar.x, avatar.y);
    drawables.push({
      sortY: avatar.y,
      draw: () => {
        glowCircle(ctx, s.x, s.y - 8, 16, PAL.cyan, 0.16);
        drawActor(ctx, art, s.x, s.y, avatar.facing, avatar.moving ? avatar.walk % 4 : 0, null, true);
      },
    });
  }
  drawables.sort((a, b) => a.sortY - b.sortY);
  for (const d of drawables) d.draw();

  // ── Light pools & ambient life ────────────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const r of interior.rooms) {
    if (r.hidden) continue;
    const s = toScreen(r.x + r.w / 2, r.y + r.h / 2);
    const [cr, cg, cb] = r.color;
    glowCircle(ctx, s.x, s.y, r.w * 0.4, `rgba(${cr},${cg},${cb},0.28)`, 0.22);
  }
  for (const p of interior.props) {
    if (p.kind === "hologram" || p.kind === "emblem" || p.kind === "shipModel") {
      const s = toScreen(p.x, p.y);
      const pulse = 0.5 + Math.sin(t * 2 + p.x) * 0.5;
      glowCircle(ctx, s.x, s.y - 10, 22, PAL.cyan, 0.12 + pulse * 0.08);
    }
  }
  ctx.restore();

  // ── Interaction highlight + prompt ────────────────────────────────────
  const target = opts.target;
  if (target) {
    const s = toScreen(target.x, target.y);
    const pulse = (t * 1.4) % 1;
    ctx.strokeStyle = `rgba(85,230,213,${0.7 - pulse * 0.5})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 12 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(85,230,213,0.9)";
    ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
  }

  // ── Minimal canvas HUD: room name, deck label ─────────────────────────
  if (opts.roomName) {
    text(ctx, opts.roomName.toUpperCase(), 8, 8, { size: 8, color: PAL.cyan, shadow: "#02060c" });
    text(ctx, `DECK ${opts.deck ?? "A"} · ${interior.station.name.toUpperCase()}`, 8, 19, { size: 6, color: PAL.muted, shadow: "#02060c" });
  }

  if (opts.banner) drawBanner(ctx, opts.banner, w, h);
  if (opts.prompt) drawPrompt(ctx, opts.prompt, w, h);
}

function drawBackWash(ctx, w, h, interior, t) {
  // Slow scan of light across the back wall for depth.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(20,38,58,0.9)");
  g.addColorStop(0.6, "rgba(8,14,24,0.95)");
  g.addColorStop(1, "rgba(4,7,12,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawDoors(ctx, r, s) {
  const doorW = 64;
  const gap = (len, at) => at;
  if (r.doors.top) {
    ctx.fillStyle = "#0a121c";
    ctx.fillRect(s.x + r.w / 2 - doorW / 2, s.y - 6, doorW, 12);
  }
  if (r.doors.bottom) {
    ctx.fillStyle = "#0a121c";
    ctx.fillRect(s.x + r.w / 2 - doorW / 2, s.y + r.h - 6, doorW, 12);
  }
  if (r.doors.left) {
    ctx.fillStyle = "#0a121c";
    ctx.fillRect(s.x - 6, s.y + r.h / 2 - doorW / 2, 12, doorW);
  }
  if (r.doors.right) {
    ctx.fillStyle = "#0a121c";
    ctx.fillRect(s.x + r.w - 6, s.y + r.h / 2 - doorW / 2, 12, doorW);
  }
}

function drawWallFaces(ctx, r, s, interior) {
  const [cr, cg, cb] = r.color;
  // North wall face: the top wall extruded upward, with lit windows.
  const faceH = WALL_H;
  const top = s.y - faceH;
  ctx.fillStyle = r.hidden ? "#121b26" : `rgb(${Math.round(cr * 0.22 + 12)},${Math.round(cg * 0.24 + 16)},${Math.round(cb * 0.26 + 22)})`;
  ctx.fillRect(s.x, top, r.w, faceH);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(s.x, top, r.w, 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(s.x, s.y - 3, r.w, 3);
  if (r.hidden) return;
  // Panels and windows along the wall.
  for (let x = 6; x < r.w - 10; x += 26) {
    ctx.fillStyle = "rgba(120,200,230,0.14)";
    ctx.fillRect(s.x + x, top + 6, 14, 5);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(s.x + x, top + 6, 14, 1);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(s.x + x + 0.5, top + 6.5, 13, 4);
  }
  // Vertical seams.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let x = 0; x < r.w; x += 52) ctx.fillRect(s.x + x, top, 1, faceH);
}

function sign(ctx, r, s, t) {
  if (r.id.startsWith("link")) return;
  const cx = s.x + r.w / 2;
  const y = s.y + 12;
  const pulse = 0.6 + Math.sin(t * 1.5 + r.x) * 0.15;
  const [cr, cg, cb] = r.color;
  ctx.save();
  ctx.font = '7px "Courier New", monospace';
  ctx.textAlign = "center";
  const label = r.name.toUpperCase();
  const width = ctx.measureText(label).width + 18;
  ctx.fillStyle = `rgba(${Math.round(cr * 0.16)},${Math.round(cg * 0.16)},${Math.round(cb * 0.18)},0.9)`;
  ctx.fillRect(cx - width / 2, y - 2, width, 12);
  ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.5 * pulse + 0.2})`;
  ctx.strokeRect(cx - width / 2 + 0.5, y - 1.5, width - 1, 11);
  ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
  ctx.fillText(label, cx, y + 6);
  ctx.restore();
}

function drawProp(ctx, p, s, art) {
  const img = art.prop(p.kind, p.w, p.h);
  const x = s.x - img.width / 2;
  const y = s.y - img.height / 2 + (p.h ?? 0) / 2;
  // Soft contact shadow.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + (p.h ?? 0) / 2 + 2, (p.w ?? 20) / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, Math.round(x), Math.round(y));
  if (p.holo) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.1;
    ctx.fillStyle = p.kind === "emblem" ? "#8fa8ff" : "#55e6d5";
    for (let i = 0; i < 3; i++) {
      const yy = s.y - 22 - i * 7 + ((t * 8) % 7);
      ctx.fillRect(s.x - 12 + i * 2, yy, 24 - i * 4, 1);
    }
    ctx.restore();
  }
}

function drawActor(ctx, art, x, y, facing, frame, color, isPlayer) {
  const dirIndex = 0; // down-facing baseline
  const frames = art.avatar.frames[0];
  const idx = Math.floor(frame) % 4;
  const img = frames[idx];
  // Contact shadow.
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y + 9, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (facing < 0) {
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -img.width / 2, -img.height + 8);
  } else {
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height + 8));
  }
  ctx.restore();
  if (isPlayer) {
    ctx.strokeStyle = "rgba(85,230,213,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 9, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 1, y - 16, 2, 2);
  }
}

function drawBanner(ctx, banner, w, h) {
  const t = clamp(banner.life / banner.max, 0, 1);
  const alpha = t > 0.86 ? (1 - t) / 0.14 : Math.min(1, t / 0.2);
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  const y = h * 0.26;
  ctx.fillStyle = "rgba(4,8,16,0.65)";
  ctx.fillRect(0, y - 20, w, 46);
  text(ctx, banner.title, w / 2, y - 12, { size: 11, align: "center", color: banner.color ?? PAL.cyan, shadow: "#02060c" });
  if (banner.subtitle) text(ctx, banner.subtitle, w / 2, y + 4, { size: 6, align: "center", color: PAL.mist });
  ctx.restore();
}

function drawPrompt(ctx, prompt, w, h) {
  ctx.save();
  ctx.font = '7px "Courier New", monospace';
  const width = ctx.measureText(prompt.text).width + 22;
  ctx.fillStyle = "rgba(6,12,22,0.92)";
  ctx.fillRect(w / 2 - width / 2, h - 42, width, 16);
  ctx.strokeStyle = "rgba(85,230,213,0.45)";
  ctx.strokeRect(w / 2 - width / 2 + 0.5, h - 41.5, width - 1, 15);
  text(ctx, prompt.text, w / 2, h - 37, { size: 7, align: "center", color: PAL.cyan });
  ctx.restore();
}

/** Which direction the avatar should face given a draw frame. */
export function avatarFrame(avatar) {
  return Math.floor(avatar.walk) % 4;
}
