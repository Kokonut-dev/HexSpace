import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/core/game.js";
import { sector, distance, points } from "../src/world/galaxy.js";
import { fresh, persist, restore } from "../src/core/save.js";
import { stats, starter } from "../src/customization/modules.js";
import { cargoCount, price, trade } from "../src/systems/economy.js";
import { thrust } from "../src/systems/flight.js";

test("sector generation is stable and bounds adjacent jumps", () => {
  assert.deepEqual(points(sector(-7, 8)), points(sector(-7, 8)));
  assert.equal(distance({ q: 1, r: -1 }), 1);
  assert.equal(distance({ q: 1, r: 1 }), 2);
  const g = new Game(() => {});
  assert.equal(g.jump(sector(1, 1)), false);
  assert.equal(g.jump(sector(1, 0)), true);
  assert.equal(g.s.q, 1);
});
test("flight assist brakes more strongly than unassisted flight", () => {
  const fit = stats(starter),
    a = { x: 0, y: 0, vx: 100, vy: 0 },
    b = { ...a };
  for (let i = 0; i < 60; i++) {
    thrust(a, 0, 0, 1 / 60, fit, true);
    thrust(b, 0, 0, 1 / 60, fit, false);
  }
  assert.ok(a.vx < b.vx / 10);
  assert.ok(b.x > a.x);
});
test("docking, fit capacity and contract payout", () => {
  const g = new Game(() => {});
  assert.match(g.equip("laser", "weapon"), /Dock/);
  Object.assign(g.p, { x: 193, y: -97 });
  g.interact();
  assert.equal(g.d.docked, true);
  assert.match(g.equip("plasma", "weapon"), /capacity/);
  assert.match(g.equip("fusion", "reactor"), /updated/);
  assert.match(g.equip("plasma", "weapon"), /updated/);
  g.d.quest = { type: "ore", done: false };
  g.d.cargo.ore = 3;
  assert.match(g.claim(), /paid/);
  assert.equal(g.d.cargo.ore, 0);
  assert.equal(g.d.rep["United Systems"], 5);
  g.interact();
  assert.equal(g.d.docked, false);
});
test("market changes local quotes and safely enforces empty/full cargo", () => {
  const d = fresh(),
    s = sector(0, 0),
    before = price(d, s, "ore");
  assert.equal(trade(d, s, "ore", false, 1), false);
  assert.equal(trade(d, s, "ore", true, 1), true);
  assert.ok(price(d, s, "ore") > before);
  assert.equal(cargoCount(d), 1);
  assert.equal(trade(d, s, "meds", true, 1), false);
  assert.equal(trade(d, s, "ore", false, 1), true);
});
test("save round trip and malformed storage fallback", () => {
  let value;
  const storage = {
    setItem(_k, v) {
      value = v;
    },
    getItem() {
      return value;
    },
  };
  const d = fresh();
  d.credits = 339;
  d.fit.engine = "vector";
  assert.equal(persist(d, storage), true);
  assert.deepEqual(restore(storage), d);
  value = "{";
  assert.deepEqual(restore(storage), fresh());
  assert.equal(
    persist(d, {
      setItem() {
        throw Error();
      },
    }),
    false,
  );
});
test("resolved contacts stay cleared when returning to a sector", () => {
  const g = new Game(() => {}),
    o = g.objects.find((o) => o.id === "ore");
  Object.assign(g.p, { x: o.x, y: o.y });
  g.interact();
  assert.equal(o.dead, true);
  assert.ok(g.d.cargo.ore > 0);
  g.jump(sector(1, 0));
  g.jump(sector(0, 0));
  assert.equal(g.objects.find((o) => o.id === "ore").dead, true);
});
test("firing heats the ship and can destroy an asteroid", () => {
  const g = new Game(() => {});
  const o = g.objects.find((o) => o.id === "ore");
  Object.assign(g.p, { x: o.x + 110, y: o.y });
  for (let i = 0; i < 45; i++)
    g.update(1 / 60, { x: 0, y: 0, aim: { x: -1, y: 0 }, fire: true });
  assert.ok(g.p.heat > 0);
  assert.equal(o.dead, true);
  assert.equal(g.d.cargo.ore, 4);
});

import { regionalState, support } from "../src/world/universe.js";
import { offers } from "../src/systems/economy.js";
test("player contributions can shift control of a frontier hex", () => {
  const d = fresh();
  const s = regionalState(d, 3, 0);
  assert.equal(s.faction, "Free Corsairs");
  assert.equal(s.security, "Anarchy");
  support(d, s, "United Systems", 12);
  assert.equal(regionalState(d, 3, 0).faction, "United Systems");
  assert.equal(regionalState(d, 3, 0).security, "Low");
});
test("contract board rotates and courier requires its assigned destination", () => {
  const game = new Game(() => {});
  const early = offers(game.d, game.s);
  game.d.clock = 6;
  assert.notDeepEqual(offers(game.d, game.s), early);
  game.d.quest = early.find((o) => o.type === "meds");
  game.d.cargo.meds = game.d.quest.quantity;
  assert.match(game.claim(), /not met/);
  const [q, r] = game.d.quest.destination.split(",").map(Number);
  assert.equal(game.jump(sector(q, r)), true);
  assert.match(game.claim(), /paid/);
  assert.equal(game.d.cargo.meds, 0);
});
test("an ion nebula slows cooling", () => {
  const game = new Game(() => {});
  game.jump(sector(1, 0));
  game.jump(sector(2, 0));
  Object.assign(game.p, { x: game.cloud.x, y: game.cloud.y, heat: 50 });
  game.update(0.1, { x: 0, y: 0 });
  assert.ok(game.p.heat > 49);
});

import { stationLayout } from "../src/station/interior.js";
import { conversation } from "../src/station/dialogue.js";
test("seeded station layouts preserve the airlock and every service", () => {
  const home = stationLayout(sector(0, 0));
  const frontier = stationLayout(sector(2, -1));
  assert.deepEqual(frontier, stationLayout(sector(2, -1)));
  assert.deepEqual(frontier.rooms.at(-1), home.rooms.at(-1));
  assert.notDeepEqual(frontier.rooms, home.rooms);
  assert.deepEqual(
    frontier.rooms.map((r) => r.id),
    ["fit", "cantina", "market", "hq", "exit"],
  );
});
test("dialogue responds to faction reputation and exposes the contract board", () => {
  const d = fresh(),
    s = sector(0, 0);
  const before = conversation(s, d);
  d.rep[s.faction] = 5;
  const after = conversation(s, d);
  assert.notEqual(before.welcome.text, after.welcome.text);
  assert.ok(after.welcome.choices.some(([, target]) => target === "board"));
});
test("command cruiser has reactor headroom and can be sold only while inactive", () => {
  const game = new Game(() => {});
  game.d.docked = true;
  game.d.credits = 5000;
  assert.match(game.purchaseHull("argosy"), /commissioned/);
  assert.equal(game.fit.power, 102);
  assert.match(game.sellHull("argosy"), /inactive/);
  game.purchaseHull("wayfarer");
  assert.match(game.sellHull("argosy"), /sold/);
  assert.equal(game.d.owned.includes("argosy"), false);
});
