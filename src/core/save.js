import { hulls, modules, starter } from "../customization/modules.js";
export const fresh = () => ({
  version: 1,
  q: 0,
  r: 0,
  x: 0,
  y: 0,
  credits: 1250,
  fit: { ...starter },
  ship: "wayfarer",
  owned: [],
  cargo: { ore: 0, scrap: 0, meds: 0 },
  rep: {},
  visited: ["0,0"],
  resolved: {},
  clock: 0,
  market: {},
  quest: null,
  hired: false,
  docked: false,
  assist: true,
  hp: null,
});
export function restore(storage) {
  try {
    const x = JSON.parse(
      (storage ?? globalThis.localStorage).getItem("hexspace-v1"),
    );
    if (!x || x.version !== 1) return fresh();
    const d = fresh();
    for (const k of ["q", "r", "credits", "clock"])
      if (
        Number.isSafeInteger(x[k]) &&
        Math.abs(x[k]) < 1e8 &&
        (k === "q" || k === "r" || x[k] >= 0)
      )
        d[k] = x[k];
    for (const k of ["x", "y"])
      if (Number.isFinite(x[k])) d[k] = Math.max(-900, Math.min(900, x[k]));
    for (const k of ["docked", "assist", "hired"])
      if (typeof x[k] === "boolean") d[k] = x[k];
    if (Object.hasOwn(hulls, x.ship)) d.ship = x.ship;
    for (const k of Object.keys(starter))
      if (Object.hasOwn(modules, x.fit?.[k]) && modules[x.fit[k]][1] === k)
        d.fit[k] = x.fit[k];
    for (const k of Object.keys(d.cargo))
      if (
        Number.isSafeInteger(x.cargo?.[k]) &&
        x.cargo[k] >= 0 &&
        x.cargo[k] <= 56
      )
        d.cargo[k] = x.cargo[k];
    for (const k of ["owned", "visited"])
      if (Array.isArray(x[k])) d[k] = x[k].filter((v) => typeof v === "string");
    for (const k of ["rep", "resolved", "market"])
      if (x[k] && typeof x[k] === "object" && !Array.isArray(x[k])) d[k] = x[k];
    if (
      ["ore", "raider", "meds"].includes(x.quest?.type) &&
      typeof x.quest.done === "boolean"
    )
      d.quest = x.quest;
    if (Number.isFinite(x.hp) && x.hp > 0) d.hp = x.hp;
    return d;
  } catch {
    return fresh();
  }
}
export function persist(d, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      "hexspace-v1",
      JSON.stringify(d),
    );
    return true;
  } catch {
    return false;
  }
}
