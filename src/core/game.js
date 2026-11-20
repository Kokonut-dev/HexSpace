import { fresh, restore, persist } from "./save.js";
import { sector, points, key, distance } from "../world/galaxy.js";
import { hulls, modules, stats } from "../customization/modules.js";
import { cargoCount, jobs } from "../systems/economy.js";
import { clamp, range, thrust } from "../systems/flight.js";
import { interior, rooms, walk } from "../station/interior.js";
import { cue } from "./audio.js";
export class Game {
  constructor(notify) {
    this.notify = notify;
    this.d = restore();
    this.p = {
      x: this.d.x,
      y: this.d.y,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      heat: 0,
    };
    this.fit = stats(this.d.fit, this.d.ship);
    if (this.fit.draw > this.fit.power) {
      this.d.fit = fresh().fit;
      this.fit = stats(this.d.fit, this.d.ship);
    }
    this.p.hp = Math.min(this.d.hp ?? this.fit.hull, this.fit.hull);
    this.p.shield = this.fit.shield;
    this.avatar = { x: 0, y: 95 };
    this.target = "station";
    this.load();
  }
  load() {
    this.s = sector(this.d.q, this.d.r);
    this.objects = points(this.s);
    for (const o of this.objects)
      o.dead = !!this.d.resolved[`${key(this.s)}/${o.id}`];
    this.props = interior(this.s.richness);
    this.bullets = [];
    this.particles = [];
    this.shot = 0;
    this.enemyShot = 0;
    this.lastHit = 0;
    this.trail = 0;
  }
  save() {
    Object.assign(this.d, {
      x: this.p.x,
      y: this.p.y,
      hp: Math.ceil(this.p.hp),
    });
    return persist(this.d);
  }
  nearest() {
    return rooms.find((r) => range(r, this.avatar) < 46);
  }
  prompt() {
    if (this.d.docked) {
      const r = this.nearest();
      return r ? `[E] ${r.id === "exit" ? "Undock" : r.name}` : "";
    }
    const o = this.objects.find(
      (o) => !o.dead && o.type !== "raider" && range(o, this.p) < 65,
    );
    return o
      ? `[E] ${o.type === "station" ? "Dock at " + o.name : o.type === "ore" ? "Mine ferrite" : o.type === "wreck" ? "Salvage wreck" : "Scan signal"}`
      : "";
  }
  resolve(o) {
    o.dead = true;
    this.d.resolved[`${key(this.s)}/${o.id}`] = true;
    this.d.clock++;
  }
  loot(id, n) {
    const earned = Math.max(
      0,
      Math.min(n, this.fit.cargo - cargoCount(this.d)),
    );
    this.d.cargo[id] += earned;
    return earned;
  }
  interact() {
    if (this.d.docked) {
      const room = this.nearest();
      if (!room) return this.notify("Walk up to a service terminal.");
      if (room.id !== "exit") return room.id;
      this.d.docked = false;
      this.p.vx = this.p.vy = 0;
      this.p.y += 48;
      this.notify("Undocking complete.");
      cue("dock");
      this.save();
      return;
    }
    const o = this.objects.find(
      (o) => !o.dead && o.type !== "raider" && range(o, this.p) < 65,
    );
    if (!o) return this.notify("No contact in interaction range.");
    if (o.type === "station") {
      this.d.docked = true;
      this.avatar = { x: 0, y: 97 };
      this.p.x = o.x;
      this.p.y = o.y;
      this.p.heat = 0;
      this.p.shield = this.fit.shield;
      this.d.clock++;
      this.notify(`Docked at ${o.name}.`);
      cue("dock");
    } else if (o.type === "ore" || o.type === "wreck") {
      const id = o.type === "ore" ? "ore" : "scrap",
        n = this.loot(id, o.type === "ore" ? 3 + this.fit.mining : 4);
      if (n) {
        this.resolve(o);
        this.notify(
          `Recovered ${n} ${id === "ore" ? "ferrite ore" : "salvage alloy"}.`,
        );
      } else this.notify("Cargo hold full.");
    } else {
      this.resolve(o);
      if (this.s.depth % 3 === 1) {
        this.d.credits += 140;
        this.notify("Distress beacon decoded. Rescue payout: 140 CR.");
      } else if (this.s.depth % 3 === 0 && this.s.depth) {
        this.objects.push({
          id: "ambush",
          type: "raider",
          name: "Ambush Raider",
          color: "#ff7985",
          x: o.x + 115,
          y: o.y,
          hp: 82,
        });
        this.notify("Pirate ambush detected!");
      } else {
        this.d.credits += 95;
        this.notify("Anomaly catalogued. Survey payout: 95 CR.");
      }
    }
    this.save();
  }
  jump(next) {
    const n = distance(next, this.s);
    if (this.d.docked || n < 1 || n > 1 + this.fit.warp) return false;
    Object.assign(this.d, { q: next.q, r: next.r, clock: this.d.clock + 1 });
    Object.assign(this.p, { x: 0, y: 0, vx: 0, vy: 0 });
    if (!this.d.visited.includes(key(next))) this.d.visited.push(key(next));
    this.target = "station";
    this.load();
    this.notify(`Jump complete: ${this.s.name}.`);
    cue("jump");
    this.save();
    return true;
  }
  equip(id, slot) {
    if (!this.d.docked) return "Dock to change equipment.";
    if (id !== null && modules[id]?.[1] !== slot) return "Invalid hardpoint.";
    const fit = { ...this.d.fit, [slot]: id },
      st = stats(fit, this.d.ship),
      cost = id && !this.d.owned.includes(id) ? modules[id][2] : 0;
    if (st.draw > st.power) return "Reactor capacity exceeded.";
    if (cargoCount(this.d) > st.cargo) return "Unload cargo first.";
    if (cost > this.d.credits) return "Insufficient credits.";
    this.d.credits -= cost;
    if (id && !this.d.owned.includes(id)) this.d.owned.push(id);
    this.d.fit = fit;
    this.refit(st);
    return "Hardpoint updated.";
  }
  refit(st) {
    this.fit = st;
    this.p.hp = Math.min(this.p.hp, st.hull);
    this.p.shield = st.shield;
    this.save();
  }
  claim() {
    const q = this.d.quest;
    if (!q) return "No contract to turn in.";
    const required = q.type === "ore" ? 3 : q.type === "meds" ? 2 : 0;
    if (
      (required &&
        (this.d.cargo[q.type] < required ||
          (q.type === "meds" && q.origin === key(this.s)))) ||
      (!required && !q.done)
    )
      return "Contract requirements not met.";
    if (required) this.d.cargo[q.type] -= required;
    this.d.credits += jobs[q.type][2];
    this.d.rep[this.s.faction] = (Number(this.d.rep[this.s.faction]) || 0) + 5;
    this.d.quest = null;
    this.d.clock++;
    this.save();
    return "Contract paid. Faction reputation +5.";
  }
  burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        v = 30 + Math.random() * 95,
        max = 0.22 + Math.random() * 0.38;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        max,
        life: max,
        color,
        size: 2 + Math.floor(Math.random() * 3),
      });
    }
  }
  update(dt, input) {
    const { x, y, aim, fire } = input,
      p = this.p;
    if (this.d.docked) {
      const n = Math.hypot(x, y) || 1;
      walk(this.avatar, (x / n) * 143 * dt, (y / n) * 143 * dt, this.props);
      return;
    }
    thrust(p, x, y, dt, this.fit, this.d.assist);
    if (aim) p.angle = Math.atan2(aim.y, aim.x);
    else if (x || y) p.angle = Math.atan2(y, x);
    this.trail -= dt;
    if (this.trail <= 0) {
      this.trail = 0.035;
      const max = x || y ? 0.45 : 0.25;
      this.particles.push({
        x: p.x - Math.cos(p.angle) * 15,
        y: p.y - Math.sin(p.angle) * 15,
        vx: -Math.cos(p.angle) * 34,
        vy: -Math.sin(p.angle) * 34,
        life: max,
        max,
        color: 0x64ccff,
        size: x || y ? 3 : 2,
      });
    }
    this.shot -= dt;
    this.enemyShot -= dt;
    this.lastHit += dt;
    p.heat = clamp(p.heat - this.fit.cooling * dt, 0, 100);
    if (this.lastHit > 3)
      p.shield = Math.min(this.fit.shield, p.shield + dt * 11);
    if (fire && this.shot <= 0 && p.heat + this.fit.heat <= 100) {
      const a = p.angle,
        c = Math.cos(a),
        s = Math.sin(a);
      this.bullets.push({
        x: p.x + c * 17,
        y: p.y + s * 17,
        vx: c * 445,
        vy: s * 445,
        life: 1.1,
      });
      this.shot = 0.27;
      p.heat += this.fit.heat;
      cue("shot");
    }
    for (const o of this.objects) {
      if (o.dead || o.type !== "raider") continue;
      const r = range(o, p);
      if (r < 350 && r > 90) {
        const v = (33 + this.s.depth) * dt;
        o.x += ((p.x - o.x) / r) * v;
        o.y += ((p.y - o.y) / r) * v;
      }
      if (r < 235 && this.enemyShot <= 0) {
        const a = Math.atan2(p.y - o.y, p.x - o.x);
        this.bullets.push({
          x: o.x,
          y: o.y,
          vx: Math.cos(a) * 245,
          vy: Math.sin(a) * 245,
          life: 1.3,
          enemy: true,
        });
        this.enemyShot = 1.65;
        if (this.d.hired && r < 190) {
          o.hp -= 9;
          if (o.hp <= 0) this.destroy(o);
        }
      }
    }
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (b.enemy) {
        if (range(p, b) < 13) {
          const hit = (15 + Math.min(15, this.s.depth)) * (1 - this.fit.guard);
          p.hp -= Math.max(0, hit - p.shield);
          p.shield = Math.max(0, p.shield - hit);
          this.lastHit = 0;
          b.life = 0;
          cue("hit");
          this.burst(p.x, p.y, 0x76bdff, 5);
        }
      } else
        for (const o of this.objects) {
          if (o.dead || !o.hp || range(o, b) > (o.type === "ore" ? 22 : 15))
            continue;
          o.hp -= this.fit.damage * (o.type === "ore" ? this.fit.mining : 1);
          b.life = 0;
          this.burst(b.x, b.y, 0xf2ac79, 5);
          if (o.hp <= 0) this.destroy(o);
          break;
        }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const b of this.particles) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    this.particles = this.particles.filter((b) => b.life > 0).slice(-180);
    if (p.hp <= 0) {
      this.d.credits = Math.floor(this.d.credits * 0.75);
      Object.assign(p, {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        hp: this.fit.hull,
        shield: this.fit.shield,
        heat: 0,
      });
      this.load();
      this.save();
      this.notify("Emergency recovery complete. Lost 25% of credits.");
    }
  }
  destroy(o) {
    this.resolve(o);
    this.burst(o.x, o.y, o.type === "ore" ? 0xe8a46d : 0xff7385);
    if (o.type === "ore") {
      this.notify(
        `Asteroid broken. Recovered ${this.loot("ore", 4)} ferrite ore.`,
      );
    } else {
      this.d.credits += 120;
      this.loot("scrap", 2);
      if (this.d.quest?.type === "raider") this.d.quest.done = true;
      this.notify("Raider eliminated. Bounty: 120 CR.");
    }
    this.save();
  }
  purchaseHull(id) {
    const h = hulls[id];
    if (!h || !this.d.docked) return "Dock to change hulls.";
    const cost = this.d.owned.includes(id) ? 0 : h.price,
      st = stats(this.d.fit, id);
    if (cargoCount(this.d) > st.cargo) return "Unload cargo first.";
    if (this.d.credits < cost) return "Insufficient credits.";
    this.d.credits -= cost;
    if (!this.d.owned.includes(id)) this.d.owned.push(id);
    this.d.ship = id;
    this.p.hp = st.hull;
    this.refit(st);
    return `${h.name} commissioned.`;
  }
}
