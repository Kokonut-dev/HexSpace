export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const range = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function thrust(p, x, y, dt, stats, assist) {
  const n = Math.hypot(x, y) || 1,
    a = (stats.thrust * 52) / stats.mass;
  p.vx += (x / n) * a * dt;
  p.vy += (y / n) * a * dt;
  const drag = Math.exp(-(assist ? (x || y ? 0.7 : 4) : 0.045) * dt);
  p.vx *= drag;
  p.vy *= drag;
  const speed = Math.hypot(p.vx, p.vy),
    cap = (stats.thrust * 1.65 * 52) / stats.mass;
  if (speed > cap) {
    p.vx *= cap / speed;
    p.vy *= cap / speed;
  }
  p.x = clamp(p.x + p.vx * dt, -900, 900);
  p.y = clamp(p.y + p.vy * dt, -900, 900);
  if (Math.abs(p.x) === 900) p.vx = 0;
  if (Math.abs(p.y) === 900) p.vy = 0;
}
