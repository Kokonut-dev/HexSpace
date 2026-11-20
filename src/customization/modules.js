export const modules = {
  cannon: ["Kinetic Cannon", "weapon", 0, 4, 17, { damage: 21, heat: 12 }],
  laser: ["Pulse Laser", "weapon", 290, 3, 29, { damage: 29, heat: 20 }],
  plasma: ["Plasma Launcher", "weapon", 520, 8, 38, { damage: 52, heat: 31 }],
  mining: [
    "Mining Beam",
    "weapon",
    190,
    4,
    16,
    { damage: 13, heat: 8, mining: 4 },
  ],
  shield: ["Field Generator", "defense", 0, 5, 19, { shield: 65 }],
  armor: ["Armor Plating", "defense", 240, 14, 0, { hull: 170 }],
  point: ["Point Defense", "defense", 350, 7, 24, { shield: 45, guard: 0.5 }],
  ion: ["Ion Thruster", "engine", 0, 5, 14, { thrust: 165 }],
  vector: ["Vector Thruster", "engine", 380, 7, 24, { thrust: 245 }],
  cell: ["Compact Reactor", "reactor", 0, 5, 0, { power: 70 }],
  fusion: ["Fusion Reactor", "reactor", 440, 12, 0, { power: 120 }],
  rack: ["Cargo Expansion", "utility", 200, 8, 5, { cargo: 20 }],
  cooler: ["Cryo Cooler", "utility", 225, 5, 10, { cooling: 18 }],
  warp: ["Warp Engine", "utility", 580, 9, 19, { warp: 1 }],
};
export const hulls = {
  wayfarer: {
    name: "Wayfarer",
    label: "Light Explorer",
    price: 0,
    mass: 24,
    cargo: 20,
    hull: 100,
  },
  vanguard: {
    name: "Vanguard",
    label: "Frontier Corvette",
    price: 1350,
    mass: 30,
    cargo: 36,
    hull: 160,
  },
};
export const starter = {
  weapon: "cannon",
  defense: "shield",
  engine: "ion",
  reactor: "cell",
  utility: null,
};
export function stats(fit, hull = "wayfarer") {
  const base = hulls[hull],
    result = {
      mass: base.mass,
      draw: 0,
      power: 0,
      cooling: 11,
      hull: base.hull,
      shield: 0,
      cargo: base.cargo,
      damage: 0,
      thrust: 0,
      heat: 0,
      mining: 1,
      warp: 0,
      guard: 0,
    };
  for (const id of Object.values(fit)) {
    if (!id) continue;
    const [, , , mass, draw, mods] = modules[id];
    result.mass += mass;
    result.draw += draw;
    for (const [k, v] of Object.entries(mods))
      result[k] = k === "hull" ? Math.max(result.hull, v) : result[k] + v;
  }
  return result;
}
