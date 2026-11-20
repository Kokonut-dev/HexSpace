/**
 * Visual effects: particles, floating combat text, screen shake, flashes,
 * hit-stop, warp streaks and impact sparks.
 *
 * Effects are a presentation-only pool owned by the renderer. The simulation
 * never depends on them, so the whole layer can be disabled (reduced motion)
 * without touching game rules — and tests can run without a canvas.
 */
import { clamp, TAU } from "../core/utils.js";
import { PAL } from "../config.js";

export class Effects {
  constructor(opts = {}) {
    this.particles = [];
    this.floaters = [];
    this.shakeAmount = 0;
    this.shakeDecay = 4;
    this.flash = 0;
    this.flashColor = "#ffffff";
    this.hitStop = 0;
    this.streaks = [];
    this.enabled = opts.enabled !== false;
    this.shakeEnabled = opts.shake !== false;
    this.time = 0;
    this.budget = 900;
  }

  setOptions(settings) {
    this.enabled = settings.sound !== false ? this.enabled : this.enabled; // visual fx unaffected by audio
    this.shakeEnabled = settings.shake !== false;
    this.scanlines = settings.scanlines !== false;
  }

  step(dt) {
    this.time += dt;
    const drag = Math.exp(-2.2 * dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
      if (p.gravity) p.vy += p.gravity * dt;
    }
    if (this.particles.length > this.budget)
      this.particles.splice(0, this.particles.length - this.budget);
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= 18 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shakeAmount = Math.max(0, this.shakeAmount - this.shakeDecay * this.shakeAmount * dt - dt * 0.05);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.hitStop = Math.max(0, this.hitStop - dt);
    for (const s of this.streaks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.streaks = this.streaks.filter((s) => s.life > 0);
  }

  spawn(p) {
    if (!this.enabled) return;
    this.particles.push({ life: p.life ?? 0.5, max: p.life ?? 0.5, size: p.size ?? 1, ...p });
  }

  burst(x, y, color, n = 8, speed = 70, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random());
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        color,
        size: Math.random() < 0.25 ? 2 : 1,
        life: life * (0.6 + Math.random() * 0.7),
      });
    }
  }

  explosion(x, y, color, count = 14) {
    const n = Math.min(count, 26);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = 40 + Math.random() * 190;
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        color: i < n * 0.4 ? "#fff2c8" : color,
        size: Math.random() < 0.4 ? 2 : 1,
        life: 0.3 + Math.random() * 0.75,
      });
    }
    this.spawn({ x, y, vx: 0, vy: 0, color: "#ffe6b0", size: 3, life: 0.14, ring: true, radius: 4, grow: 130 });
  }

  muzzle(x, y, color, angle) {
    this.spawn({ x, y, vx: Math.cos(angle) * 30, vy: Math.sin(angle) * 30, color, size: 2, life: 0.1 });
    this.spawn({ x, y, vx: 0, vy: 0, color, size: 1, life: 0.08, ring: true, radius: 2, grow: 60 });
  }

  hitSpark(x, y, color) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU;
      this.spawn({ x, y, vx: Math.cos(a) * (40 + Math.random() * 90), vy: Math.sin(a) * (40 + Math.random() * 90), color: "#ffe9bf", size: 1, life: 0.14 + Math.random() * 0.16 });
    }
    this.spawn({ x, y, vx: 0, vy: 0, color, size: 1, life: 0.1, ring: true, radius: 3, grow: 80 });
  }

  shieldRipple(x, y, radius) {
    this.spawn({ x, y, vx: 0, vy: 0, color: PAL.cyan, size: 1, life: 0.3, ring: true, radius: radius * 0.7, grow: 90 });
  }

  missileTrail(x, y, color) {
    this.spawn({ x: x + (Math.random() - 0.5) * 3, y: y + (Math.random() - 0.5) * 3, vx: 0, vy: 0, color, size: 1, life: 0.35 });
  }

  engineTrail(x, y, vx, vy, color, power = 1) {
    this.spawn({
      x,
      y,
      vx: -vx * 0.15 + (Math.random() - 0.5) * 16,
      vy: -vy * 0.15 + (Math.random() - 0.5) * 16,
      color,
      size: power > 1 ? 2 : 1,
      life: 0.22 + Math.random() * 0.2,
    });
  }

  floatText(x, y, text, color = PAL.white) {
    this.floaters.push({ x, y, text, color, life: 1.1, max: 1.1 });
  }

  shake(amount) {
    if (!this.shakeEnabled) return;
    this.shakeAmount = Math.min(1.4, this.shakeAmount + amount);
  }

  flashScreen(amount, color = "#ffffff") {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  stop(seconds) {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  warpStreaks(cx, cy, w, h, count = 40) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = 30 + Math.random() * 60;
      const speed = 600 + Math.random() * 900;
      this.streaks.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.5 + Math.random() * 0.5,
        max: 1,
        color: Math.random() < 0.5 ? PAL.cyan : "#ffffff",
      });
    }
  }
}

/** Draw all world-space particles and floaters through the camera transform. */
export function drawParticles(ctx, effects, toScreen) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of effects.particles) {
    const s = toScreen(p.x, p.y);
    const alpha = clamp(p.life / p.max, 0, 1);
    if (p.ring) {
      const r = p.radius + (1 - p.life / p.max) * p.grow;
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, r), 0, TAU);
      ctx.stroke();
    } else {
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), p.size, p.size);
    }
  }
  ctx.restore();
}

export function drawFloaters(ctx, effects, toScreen, font = 6) {
  ctx.save();
  ctx.textAlign = "center";
  for (const f of effects.floaters) {
    const s = toScreen(f.x, f.y);
    const alpha = clamp(f.life / f.max, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#040a12";
    ctx.font = `${font}px "Courier New", monospace`;
    ctx.fillText(f.text, s.x + 1, s.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, s.x, s.y);
  }
  ctx.restore();
}
