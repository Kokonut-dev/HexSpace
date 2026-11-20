import { rng } from "../world/galaxy.js";
export const rooms = [
  { id: "fit", name: "HANGAR", x: -125, y: -77, color: 0x64e4df },
  { id: "cantina", name: "CANTINA", x: 125, y: -77, color: 0xd998ff },
  { id: "market", name: "MARKET", x: -125, y: 77, color: 0xf4bf7e },
  { id: "hq", name: "FACTION HQ", x: 125, y: 77, color: 0x98adff },
  { id: "exit", name: "AIRLOCK", x: 0, y: 139, color: 0x64e4df },
];
export function interior(seed) {
  const rand = rng(seed);
  return rooms
    .slice(0, 4)
    .flatMap((r) =>
      Array.from({ length: 3 }, (_, i) => ({
        x: r.x - 54 + i * 46,
        y: r.y + (r.y < 0 ? -37 : 35),
        kind: Math.floor(rand() * 3),
      })),
    );
}
export function walk(p, dx, dy, props) {
  const valid = (x, y) =>
    Math.abs(x) < 197 &&
    Math.abs(y) < 149 &&
    !props.some((o) => Math.abs(x - o.x) < 12 && Math.abs(y - o.y) < 10);
  if (valid(p.x + dx, p.y)) p.x += dx;
  if (valid(p.x, p.y + dy)) p.y += dy;
}
