/**
 * Axial hex-grid mathematics (pointy-top layout, axial coordinates q,r).
 * Used by the galaxy generator and the SVG map renderer.
 */

export const HEX_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const hexKey = (q, r) => `${q},${r}`;

export function hexDistance(aq, ar, bq, br) {
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}

export function hexNeighbors(q, r) {
  return HEX_DIRS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexRing(q, r, radius) {
  if (radius <= 0) return [{ q, r }];
  const out = [];
  let cq = q + HEX_DIRS[4].q * radius;
  let cr = r + HEX_DIRS[4].r * radius;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      out.push({ q: cq, r: cr });
      cq += HEX_DIRS[i].q;
      cr += HEX_DIRS[i].r;
    }
  }
  return out;
}

export function hexSpiral(q, r, radius) {
  const out = [{ q, r }];
  for (let rad = 1; rad <= radius; rad++) out.push(...hexRing(q, r, rad));
  return out;
}

/** Pixel centre for a pointy-top hex of the given radius (flat width = sqrt(3)*size). */
export function hexToPixel(q, r, size) {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

export function pixelToHex(x, y, size) {
  const r = ((2 / 3) * y) / size;
  const q = (x / (Math.sqrt(3) * size) - r / 2);
  return hexRound(q, r);
}

export function hexRound(q, r) {
  let x = q,
    z = r,
    y = -x - z;
  let rx = Math.round(x),
    ry = Math.round(y),
    rz = Math.round(z);
  const dx = Math.abs(rx - x),
    dy = Math.abs(ry - y),
    dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

/** SVG polygon points for a pointy-top hex centred at 0,0. */
export function hexPolygon(size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(size * Math.cos(a)).toFixed(2)},${(size * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Line of hexes between two coordinates (for jump-route previews). */
export function hexLine(aq, ar, bq, br) {
  const n = hexDistance(aq, ar, bq, br);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    out.push(hexRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}
