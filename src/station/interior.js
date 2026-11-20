import { rng } from "../world/galaxy.js";
export const rooms = [
  { id: "fit", name: "HANGAR", x: -125, y: -77, color: 0x64e4df },
  { id: "cantina", name: "CANTINA", x: 125, y: -77, color: 0xd998ff },
  { id: "market", name: "MARKET", x: -125, y: 77, color: 0xf4bf7e },
  { id: "hq", name: "FACTION HQ", x: 125, y: 77, color: 0x98adff },
  { id: "exit", name: "AIRLOCK", x: 0, y: 139, color: 0x64e4df },
];
export function walk(p, dx, dy, props) {
  const valid = (x, y) =>
    Math.abs(x) < 197 &&
    Math.abs(y) < 149 &&
    !props.some((o) => Math.abs(x - o.x) < 12 && Math.abs(y - o.y) < 10);
  if (valid(p.x + dx, p.y)) p.x += dx;
  if (valid(p.x, p.y + dy)) p.y += dy;
}

// Keep the airlock and central concourse common across layouts. Permute service
// wings and vary their perimeter fixtures without blocking approaches.
export function stationLayout(sector) {
  const random = rng(Math.imul(sector.q, 631) ^ Math.imul(sector.r, 197));
  const positions = rooms.slice(0, 4).map(({ x, y }) => ({ x, y }));
  if (sector.depth)
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
  const terminals = rooms.map((room, i) => ({ ...room, ...positions[i] }));
  const props = terminals.slice(0, 4).flatMap((room) =>
    Array.from({ length: 2 + Math.floor(random() * 2) }, (_, i) => ({
      x: room.x - 49 + i * 43,
      y: room.y + Math.sign(room.y) * (32 + Math.floor(random() * 9)),
      kind: Math.floor(random() * 3),
    })),
  );
  return { rooms: terminals, props };
}
