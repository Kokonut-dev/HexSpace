/**
 * Galaxy chart drawn into the framebuffer. A hex grid of sectors around the
 * player with security colours, faction pips, station dots, jump ranges, the
 * route preview, story markers and a legend. The chart is also usable as a DOM
 * view, so this renderer is deliberately self-contained.
 */
import { hexToPixel, hexDistance, hexSpiral, hexLine, hexPolygon } from "../world/hex.js";
import { generateSector, canJump } from "../world/galaxy.js";
import { text, rect } from "./frame.js";
import { PAL, FACTIONS, SECURITY } from "../config.js";

const HEX = 22;

export function drawGalaxyMap(ctx, frame, state, opts = {}) {
  const w = frame.width;
  const h = frame.height;
  const cur = opts.cursor ?? { q: state.sector.q, r: state.sector.r };
  const range = opts.range ?? 1;

  ctx.fillStyle = "#05080f";
  ctx.fillRect(0, 0, w, h);
  // Faint band + stars.
  drawMapBackdrop(ctx, w, h);

  const originX = w / 2 - (hexToPixel(cur.q, cur.r, HEX).x);
  const originY = h / 2 - (hexToPixel(cur.q, cur.r, HEX).y);

  // Which sectors are in range from the current one?
  const reachable = new Set();
  for (const { q, r } of hexSpiral(state.sector.q, state.sector.r, range)) reachable.add(`${q},${r}`);

  const sectors = opts.sectors ?? [];

  // Route preview.
  if (opts.routeTo) {
    const route = hexLine(state.sector.q, state.sector.r, opts.routeTo.q, opts.routeTo.r);
    for (const step of route) {
      const p = hexToPixel(step.q, step.r, HEX);
      text(ctx, "·", originX + p.x, originY + p.y, { size: 10, align: "center", color: PAL.cyan, alpha: 0.7 });
    }
  }

  for (const s of sectors) {
    const p = hexToPixel(s.q, s.r, HEX);
    const x = Math.round(originX + p.x);
    const y = Math.round(originY + p.y);
    if (x < -HEX * 2 || x > w + HEX * 2 || y < -HEX * 2 || y > h + HEX * 2) continue;
    const isCurrent = s.q === state.sector.q && s.r === state.sector.r;
    const isCursor = s.q === cur.q && s.r === cur.r;
    const isReachable = reachable.has(s.key);
    const known = s.visited || isCurrent;
    const sec = SECURITY[s.security];
    const faction = FACTIONS[s.faction];

    const points = hexPolygon(HEX - 1).split(" ").map((pair) => {
      const [px, py] = pair.split(",").map(Number);
      return { x: x + px, y: y + py };
    });

    // Fill: visited sectors show faction tint; unknown sectors are dim.
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const pt of points.slice(1)) ctx.lineTo(pt.x, pt.y);
    ctx.closePath();
    const fill = known
      ? hexWithAlpha(faction.color, 0.13 + s.wealth * 0.08)
      : s.depth <= 1
        ? "rgba(70,90,120,0.10)"
        : "rgba(40,50,70,0.06)";
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = isCurrent
      ? PAL.white
      : isCursor
        ? PAL.cyan
        : isReachable
          ? hexWithAlpha(sec.color, 0.65)
          : "rgba(90,110,140,0.22)";
    ctx.lineWidth = isCurrent || isCursor ? 1.6 : 1;
    ctx.stroke();

    // Sector marker.
    if (s.station) {
      ctx.fillStyle = PAL.cyan;
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.strokeStyle = "rgba(85,230,213,0.5)";
      ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
    }
    if (s.storyRole) {
      ctx.strokeStyle = PAL.purple;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, "◆", x, y - 10, { size: 6, align: "center", color: PAL.purple });
    }
    if (known) {
      // Danger pips for visited sectors.
      const pips = Math.round(s.danger * 3);
      for (let i = 0; i < pips; i++) {
        ctx.fillStyle = s.danger > 0.8 ? PAL.red : PAL.amber;
        ctx.fillRect(x - 6 + i * 3, y + 9, 2, 2);
      }
      text(ctx, s.name.toUpperCase(), x, y + 2, { size: 4.5, align: "center", color: "rgba(220,240,255,0.75)" });
    } else {
      text(ctx, `${s.q},${s.r}`, x, y + 2, { size: 4.5, align: "center", color: "rgba(150,170,200,0.45)" });
    }
    if (isCurrent) {
      text(ctx, "YOU", x, y - 14, { size: 5, align: "center", color: PAL.white });
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(x, y, HEX - 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Legend.
  drawLegend(ctx, w, h, state);
  // Cursor detail card.
  if (opts.cursorSector) drawDetail(ctx, w, h, state, opts.cursorSector, range);
}

function drawMapBackdrop(ctx, w, h) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, Math.max(w, h) * 0.7);
  g.addColorStop(0, "rgba(30,48,80,0.55)");
  g.addColorStop(0.6, "rgba(10,16,30,0.65)");
  g.addColorStop(1, "rgba(3,5,10,0.95)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
    ctx.fillStyle = "rgba(200,225,255,0.28)";
    ctx.fillRect(((x + 1) % 1) * w, ((y + 1) % 1) * h, 1, 1);
  }
}

function drawLegend(ctx, w, h, state) {
  const x = 8;
  const y = h - 52;
  rect(ctx, x, y, 128, 46, "rgba(5,10,18,0.78)");
  ctx.strokeStyle = "rgba(70,100,130,0.3)";
  ctx.strokeRect(x + 0.5, y + 0.5, 127, 45);
  const rows = [
    ["■ station", PAL.cyan],
    ["▲ hostiles", PAL.red],
    ["◆ story", PAL.purple],
    ["○ reachable", SECURITY.low.color],
  ];
  rows.forEach(([label, color], i) => {
    text(ctx, label, x + 6, y + 5 + i * 9, { size: 5, color });
  });
  text(ctx, `JUMP ${state.jumps}`, x + 80, y + 5, { size: 5, color: PAL.mist });
  text(ctx, `SEED ${String(state.seed).slice(0, 6)}`, x + 80, y + 14, { size: 5, color: "rgba(140,170,200,0.6)" });
}

function drawDetail(ctx, w, h, state, sector, range) {
  const width = 150;
  const x = w - width - 8;
  const y = 8;
  const height = 74;
  rect(ctx, x, y, width, height, "rgba(5,10,18,0.85)");
  const sec = SECURITY[sector.security];
  ctx.strokeStyle = hexWithAlpha(sec.color, 0.55);
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  text(ctx, sector.name.toUpperCase(), x + 6, y + 5, { size: 7, color: PAL.white });
  text(ctx, `${sec.label} · ${FACTIONS[sector.faction]?.short ?? "FREE"}`, x + 6, y + 15, { size: 5, color: sec.color });
  text(ctx, `${sector.economy.toUpperCase()} · TECH ${sector.tech}`, x + 6, y + 23, { size: 5, color: PAL.muted });
  const stationLine = sector.station ? `◉ ${sector.station.name}` : "◌ no station";
  text(ctx, stationLine, x + 6, y + 31, { size: 5, color: sector.station ? PAL.cyan : PAL.muted });
  const d = hexDistance(state.sector.q, state.sector.r, sector.q, sector.r);
  const reach = canJump({ q: state.sector.q, r: state.sector.r }, { q: sector.q, r: sector.r }, range);
  text(ctx, d === 0 ? "CURRENT SECTOR" : `DIST ${d} HEX${d > 1 ? "ES" : ""}`, x + 6, y + 41, { size: 5, color: PAL.mist });
  text(ctx, reach ? "◆ IN JUMP RANGE" : "× OUT OF RANGE", x + 6, y + 49, { size: 5, color: reach ? PAL.green : PAL.red });
  text(ctx, sector.visited ? "CHARTED" : "UNCHARTED", x + 6, y + 61, { size: 5, color: "rgba(140,170,200,0.6)" });
  text(ctx, `JUMP ${Math.round(16 + d * 6)} WARP`, x + width - 6, y + 61, { size: 5, align: "right", color: PAL.blue });
}

function hexWithAlpha(hex, alpha) {
  if (!hex || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Build the sector list around the player for the renderer / UI. */
export function mapSectors(state, radius = 5) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const r1 = Math.max(-radius, -dq - radius);
    const r2 = Math.min(radius, -dq + radius);
    for (let dr = r1; dr <= r2; dr++) {
      const s = generateSector(state.seed, state.sector.q + dq, state.sector.r + dr);
      s.visited = !!(state.discovered?.[s.key]?.visited);
      out.push(s);
    }
  }
  return out;
}

export function storySectorNext(state) {
  const m = state.missions?.find((x) => x.type === "story" && !x.done);
  if (!m) return null;
  const visit = m.goals?.find((g) => g.kind === "visit");
  if (visit) return { q: visit.q, r: visit.r };
  if (m.target) return { q: m.target.q, r: m.target.r };
  return null;
}

export { hexWithAlpha };
