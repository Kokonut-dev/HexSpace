import { key } from "../world/galaxy.js";
export const goods = {
  ore: ["Ferrite Ore", 38],
  scrap: ["Salvage Alloy", 64],
  meds: ["Medical Supplies", 105],
};
export const cargoCount = (d) =>
  Object.values(d.cargo).reduce((a, b) => a + b, 0);
export function price(d, s, id) {
  const pressure = Number(d.market[`${key(s)}/${id}`]) || 0;
  const riskMarkup = s.security === "Anarchy" ? 0.14 : s.contested ? 0.07 : 0;
  const regional =
    id === "ore"
      ? (55 - s.richness) * 0.008
      : id === "meds"
        ? s.depth
          ? 0.22
          : -0.2
        : 0;
  return Math.max(
    5,
    Math.round(
      goods[id][1] *
        (1 +
          regional +
          riskMarkup +
          Math.sin(d.clock * 0.37 + s.q * 2 + s.r) * 0.1 +
          pressure * 0.035),
    ),
  );
}
export function trade(d, s, id, buy, capacity) {
  if (!Object.hasOwn(goods, id)) return false;
  const cost = price(d, s, id),
    k = `${key(s)}/${id}`;
  if (buy ? d.credits < cost || cargoCount(d) >= capacity : d.cargo[id] < 1)
    return false;
  d.cargo[id] += buy ? 1 : -1;
  d.credits += buy ? -cost : Math.floor(cost * 0.78);
  d.market[k] = Math.max(
    -8,
    Math.min(8, (Number(d.market[k]) || 0) + (buy ? 1 : -1)),
  );
  d.clock++;
  return true;
}
export const jobs = {
  ore: ["Prospector’s Run", "Deliver 3 Ferrite Ore to a faction office.", 235],
  raider: [
    "Corsair Intercept",
    "Destroy a Corsair Scout and report to a faction office.",
    375,
  ],
  meds: [
    "Medical Courier",
    "Deliver 2 Medical Supplies to a station outside the issuing sector.",
    315,
  ],
};

// A shift publishes different quantities, destinations and payouts. Accepted jobs
// keep the original offer even as the board and regional prices change.
export function offers(d, s) {
  const shift = Math.floor(d.clock / 6),
    offset = Math.abs(s.q * 3 + s.r + shift);
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  const [dq, dr] = directions[offset % directions.length];
  const destination = key({ q: s.q + dq, r: s.r + dr });
  return ["ore", "raider", "meds"]
    .filter((type) => type !== "raider" || !d.resolved[`${destination}/raider`])
    .map((type) => {
      const quantity =
        type === "ore"
          ? 3 + (offset % 3)
          : type === "meds"
            ? 2 + (offset % 2)
            : 0;
      const target = type === "meds" || type === "raider" ? destination : null;
      const desc =
        type === "raider"
          ? `Eliminate a Corsair Scout in hex ${target}.`
          : `Deliver ${quantity} ${goods[type][0]} ${target ? `to hex ${target}` : "to a faction office"}.`;
      return {
        type,
        quantity,
        destination: target,
        origin: key(s),
        reward: jobs[type][2] + (offset % 5) * 25 + s.depth * 15,
        desc,
        done: false,
      };
    });
}
