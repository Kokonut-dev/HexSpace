/**
 * Small, dependency-free helpers shared by every layer.
 */

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a || 1);
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
/** Frame-rate independent exponential approach. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const approach = (a, b, step) =>
  a < b ? Math.min(a + step, b) : Math.max(a - step, b);

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax,
    dy = by - ay;
  return dx * dx + dy * dy;
};
export const norm = (x, y) => {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
};
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
export const angleDiff = (a, b) => wrapAngle(b - a);
export const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;

/** Hash a string to a uint32 seed. */
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG: tiny, fast, statistically fine for a game. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic RNG for a sector coordinate + salt. */
export function seeded(a, b, c) {
  return mulberry32((hash(`${a}:${b}:${c}`) ^ 0x9e3779b9) >>> 0);
}

export const rand = (rng, lo, hi) => lo + (typeof rng === 'function' ? rng() : (rng?.next?.() ?? Math.random())) * (hi - lo);
export const randInt = (rng, lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
export const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
export const chance = (rng, p) => rng() < p;
export function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function weighted(rng, entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Compact number formatting for the HUD: 12.4K, 1.2M. */
export function fmt(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1e5) return `${sign}${Math.round(a / 1e3)}K`;
  if (a >= 1e4) return `${sign}${(a / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}${a.toLocaleString("en-US")}`;
}

export function fmtCredits(n) {
  return `${(Math.round(Number(n) || 0)).toLocaleString("en-US")} CR`;
}

export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Clamp helper for vectors. */
export const len = (x, y) => Math.hypot(x, y);

export function pointInCircle(x, y, cx, cy, r) {
  return dist2(x, y, cx, cy) <= r * r;
}

/** Segment-circle intersection, used for projectile sweeping so fast shots don't tunnel. */
export function segmentCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist2(x1, y1, cx, cy) <= r * r;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return dist2(x1 + dx * t, y1 + dy * t, cx, cy) <= r * r;
}

/** DOM element helper: h('div', {class:'x'}, childNodes|string). */
export function h(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function")
        node.addEventListener(k.slice(2), v);
      else if (k === "dataset")
        for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  const list = Array.isArray(children) ? children : children ? [children] : [];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Debounce for resize handlers and save throttling. */
export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Base64 <-> UTF-8 JSON, for save export with unicode-safe round trip. */
export function toB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
export function fromB64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

/** A tiny checksum so imported saves can be sanity-checked. */
export function checksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}
