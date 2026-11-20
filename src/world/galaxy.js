export const distance = (a, b = { q: 0, r: 0 }) =>
  Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.q + a.r - b.q - b.r),
  );
export const key = ({ q, r }) => `${q},${r}`;
export function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function sector(q, r) {
  const depth = distance({ q, r }),
    random = rng(Math.imul(q, 73856093) ^ Math.imul(r, 19349663));
  const names = [
    "Vesper",
    "Cygnus",
    "Aster",
    "Helion",
    "Nacre",
    "Draco",
    "Peregrine",
    "Sable",
  ];
  const name = depth
    ? `${names[Math.floor(random() * names.length)]} ${q >= 0 ? "+" : ""}${q}/${r}`
    : "Kepler's Reach";
  return {
    q,
    r,
    depth,
    name,
    security: depth === 0 ? "High" : depth < 3 ? "Low" : "Anarchy",
    faction:
      depth === 0
        ? "United Systems"
        : depth % 2
          ? "Free Corsairs"
          : "Helix Combine",
    richness: Math.floor(random() * 45) + 30,
    station: depth
      ? `${names[Math.floor(random() * names.length)]} Relay`
      : "Meridian Outpost",
  };
}
export function points(s) {
  const random = rng(Math.imul(s.q, 104729) ^ Math.imul(s.r, 15485863));
  return [
    {
      id: "station",
      type: "station",
      name: s.station,
      x: 193,
      y: -97,
      color: "#65e5db",
      icon: "⬡",
    },
    {
      id: "ore",
      type: "ore",
      name: "Asteroid Belt",
      x: -212,
      y: -125,
      color: "#f1b57b",
      icon: "◆",
      hp: 42,
    },
    {
      id: "signal",
      type: s.depth % 3 === 2 ? "wreck" : "signal",
      name: s.depth % 3 === 2 ? "Derelict Freighter" : "Unknown Signal",
      x: -168,
      y: 140,
      color: "#b09bff",
      icon: "✧",
    },
    {
      id: "raider",
      type: "raider",
      name: "Corsair Scout",
      x: 247,
      y: 141,
      color: "#ff7985",
      icon: "▲",
      hp: 62,
    },
  ].map((o) =>
    s.depth
      ? {
          ...o,
          x: o.x + Math.round((random() - 0.5) * 116),
          y: o.y + Math.round((random() - 0.5) * 92),
        }
      : o,
  );
}
