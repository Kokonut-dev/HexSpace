export const roster = {
  pilot: {
    name: "Kestrel",
    role: "Interceptor",
    cost: 320,
    damage: 9,
    period: 1.2,
    range: 215,
    color: 0xc4ffa9,
  },
  lancer: {
    name: "Mako",
    role: "Long-range gunship",
    cost: 710,
    damage: 18,
    period: 2.1,
    range: 335,
    color: 0xffba85,
  },
  aegis: {
    name: "Bulwark",
    role: "Shield support",
    cost: 540,
    damage: 0,
    period: 1.1,
    range: 0,
    color: 0x95bcff,
  },
};
export const fleetCapacity = (ship) =>
  ({ wayfarer: 1, vanguard: 2, argosy: 3 })[ship] ?? 1;
export const activeFleet = (d) => d.roster.slice(0, fleetCapacity(d.ship));
export function formation(p, index) {
  const side = (index % 2 ? 1 : -1) * (32 + Math.floor(index / 2) * 23),
    back = 36 + index * 5;
  return {
    x: p.x - Math.cos(p.angle) * back - Math.sin(p.angle) * side,
    y: p.y - Math.sin(p.angle) * back + Math.cos(p.angle) * side,
  };
}
export function hire(d, id) {
  const ship = Object.hasOwn(roster, id) && roster[id];
  if (
    !d.docked ||
    !ship ||
    d.roster.includes(id) ||
    d.roster.length >= fleetCapacity(d.ship) ||
    d.credits < ship.cost
  )
    return false;
  d.credits -= ship.cost;
  d.roster.push(id);
  return true;
}
