/**
 * Parallax space backdrop: layered stars, drifting dust, nebula blobs and a
 * dim galactic band. Generated once per session and cached in offscreen
 * canvases, then scrolled by camera position for cheap, deep-feeling motion.
 */
import { seeded, mulberry32 } from "../core/utils.js";
import { PAL } from "../config.js";
import { glowCircle } from "./frame.js";

const LAYERS = [
  { count: 140, depth: 0.03, size: 1, alpha: 0.35 },
  { count: 100, depth: 0.07, size: 1, alpha: 0.5 },
  { count: 70, depth: 0.14, size: 2, alpha: 0.55 },
  { count: 34, depth: 0.24, size: 1, alpha: 0.8 },
];

export function createStarfield(seed = 1234) {
  const rng = seeded(seed, 3, 9);
  const layers = LAYERS.map((l, i) => ({
    ...l,
    stars: Array.from({ length: l.count }, () => ({
      x: rng() * 1100,
      y: rng() * 640,
      tw: rng() * Math.PI * 2,
      hue: rng(),
    })),
  }));
  const dust = Array.from({ length: 60 }, () => ({
    x: rng() * 900,
    y: rng() * 520,
    s: rng() * 0.5 + 0.2,
    depth: 0.4 + rng() * 0.5,
  }));
  const nebulas = Array.from({ length: 3 }, (_, i) => ({
    x: rng() * 2200,
    y: rng() * 1600,
    r: 180 + rng() * 220,
    color: ["#1b2a5e", "#3a1e54", "#123f45"][i],
    depth: 0.02 + i * 0.012,
  }));
  return { seed, layers, dust, nebulas, t: 0 };
}

export function drawStarfield(ctx, field, cam, w, h, dt, sectorTint) {
  field.t += dt;
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, w, h);

  // Nebula wash first (additive).
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const n of field.nebulas) {
    const x = ((n.x - cam.x * n.depth) % (w + n.r * 2)) - n.r;
    const y = ((n.y - cam.y * n.depth) % (h + n.r * 2)) - n.r;
    const g = ctx.createRadialGradient(x, y, 0, x, y, n.r);
    g.addColorStop(0, n.color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(x - n.r, y - n.r, n.r * 2, n.r * 2);
  }
  if (sectorTint) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, sectorTint);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  for (const layer of field.layers) {
    for (const s of layer.stars) {
      const x = ((s.x - cam.x * layer.depth) % 1100 + 1100) % 1100;
      const y = ((s.y - cam.y * layer.depth) % 640 + 640) % 640;
      if (x > w || y > h) continue;
      const twinkle = 0.72 + 0.28 * Math.sin(field.t * 1.6 + s.tw);
      const color = s.hue < 0.62 ? "#dff0ff" : s.hue < 0.84 ? "#ffe6c0" : "#ffc7d9";
      ctx.globalAlpha = layer.alpha * twinkle;
      ctx.fillStyle = color;
      const px = Math.round(x), py = Math.round(y);
      if (layer.size === 2) {
        ctx.fillRect(px, py, 2, 2);
        ctx.globalAlpha *= 0.4;
        ctx.fillRect(px - 1, py + 1, 4, 1);
      } else ctx.fillRect(px, py, 1, 1);
    }
  }
  ctx.globalAlpha = 1;

  // Foreground dust streaks give near-field speed cues.
  for (const d of field.dust) {
    const x = ((d.x - cam.x * d.depth * 0.5) % 960 + 960) % 960;
    const y = ((d.y - cam.y * d.depth * 0.5) % 600 + 600) % 600;
    if (x > w || y > h) continue;
    ctx.globalAlpha = 0.13 + d.s * 0.16;
    ctx.fillStyle = "#9fc6ff";
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Distant galaxy band drawn once into a cache for the map screen. */
export function drawGalaxyBand(ctx, w, h, seed = 8) {
  const rng = mulberry32(seed);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i++) {
    const x = rng() * w;
    const y = h * 0.32 + Math.sin(x / w * Math.PI) * h * 0.22 + (rng() - 0.5) * h * 0.2;
    glowCircle(ctx, x, y, 40 + rng() * 90, i % 3 ? "#17233f" : "#2a1f42", 0.10);
  }
  ctx.restore();
}
