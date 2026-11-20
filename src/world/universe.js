import { key, rng, sector } from "./galaxy.js";

export const factions = ["United Systems", "Free Corsairs", "Helix Combine"];
// Advance on gameplay actions, not on wall time. Derive remote sectors lazily.
export function regionalState(d, q, r) {
  const s = sector(q, r),
    epoch = Math.floor(d.clock / 12);
  const control = d.influence?.[key(s)] ?? {};
  const random = rng(
    Math.imul(q, 997) ^ Math.imul(r, 8713) ^ Math.imul(epoch, 193),
  );
  const powers = factions.map(
    (f) =>
      (f === s.faction ? 10 : 3) +
      (Number(control[f]) || 0) +
      (epoch ? Math.floor(random() * 12) : 0),
  );
  const lead = powers.indexOf(Math.max(...powers));
  const faction = s.depth ? factions[lead] : s.faction;
  const contested =
    s.depth > 0 && powers.filter((p) => p >= powers[lead] - 4).length > 1;
  const security = !s.depth
    ? "High"
    : faction === "Free Corsairs" && s.depth >= 3
      ? "Anarchy"
      : "Low";
  return { ...s, faction, security, contested, powers, epoch };
}
export function support(d, s, faction, amount) {
  const record = (d.influence[key(s)] ??= {});
  record[faction] = Math.min(18, (Number(record[faction]) || 0) + amount);
}
export function nebula(s) {
  if (s.depth < 2 || Math.abs(s.q - s.r) % 3 === 0) return null;
  return { x: 74 + 20 * (s.q % 4), y: 33 + 12 * (s.r % 4), radius: 92 };
}
