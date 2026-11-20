/**
 * Combat: weapon firing, projectile flight, damage resolution, missiles,
 * asteroids, salvage and pickups. All state mutations go through here so the
 * damage rules live in exactly one place.
 *
 * Collision is swept (segment vs circle) so high-velocity railgun rounds never
 * tunnel through a target.
 */
import { clamp, dist2, segmentCircle, TAU } from "../core/utils.js";
import {
  createProjectile,
  createMissile,
  createDebris,
  createPickup,
  createAsteroid,
} from "../entities/entities.js";
import { GAME, HULLS, PAL } from "../config.js";

const SHOT_LIFE = 2.2;

/* ── Player fire control ------------------------------------------------ */

export function fireMain(world, dt) {
  const ship = world.player;
  const stats = world.stats;
  ship.fireCooldown = Math.max(0, (ship.fireCooldown ?? 0) - dt);
  if (!world.input.fire || ship.disabled > 0) return null;
  if (ship.heat >= 100) return "overheat";
  if (ship.fireCooldown > 0) return null;
  const weapons = stats.weapons;
  if (!weapons.length) return "noweapon";
  // Fire the weapons whose individual cooldown has elapsed.
  ship.slotCooldowns = ship.slotCooldowns ?? {};
  let fired = false;
  let anyReady = false;
  for (const w of weapons) {
    const ready = (ship.slotCooldowns[w.slot] ?? 0) <= 0;
    if (!ready) continue;
    anyReady = true;
    const def = w.def;
    if (ship.heat + def.heat > 100) continue;
    // Aim: mouse direction from ship centre; mounts offset the origin.
    const spread = (def.spread ?? 0) * (1 - clamp(stats.damageMult - 1, 0, 0.5)) * (stats.brownout < 1 ? 1.6 : 1);
    const a = world.aimAngle + (Math.random() - 0.5) * spread * 2;
    const mx = ship.x + Math.cos(w.mount.y * Math.PI + ship.angle) * 0, // mount offset below
      my = ship.y;
    const ox = Math.cos(ship.angle + Math.PI / 2) * (w.mount.x * (HULLS[ship.hull].art.size * 0.5));
    const oy = Math.sin(ship.angle + Math.PI / 2) * (w.mount.x * (HULLS[ship.hull].art.size * 0.5));
    const speed = def.speed * (stats.brownout < 1 ? 0.85 : 1);
    world.projectiles.push(
      createProjectile({
        x: mx + ox + Math.cos(a) * 14,
        y: my + oy + Math.sin(a) * 14,
        vx: Math.cos(a) * speed + ship.vx * 0.3,
        vy: Math.sin(a) * speed + ship.vy * 0.3,
        damage: def.damage * (1 + (stats.damageMult - 1) * 0.5),
        friendly: true,
        color: def.color,
        kind: def.kind,
        life: SHOT_LIFE,
        size: def.kind === "plasma" ? 3 : def.kind === "kinetic" ? 1 : 2,
        splash: def.splash ?? 0,
        pierce: def.pierce ?? 0,
        antiMissile: !!def.antiMissile,
      }),
    );
    ship.heat = clamp(ship.heat + def.heat, 0, 140);
    ship.slotCooldowns[w.slot] = def.cooldown;
    world.effects.muzzle(ship.x + ox + Math.cos(a) * 16, ship.y + oy + Math.sin(a) * 16, def.color, a);
    fired = true;
    world.effects.play(def.sfx ?? "cannon");
  }
  return fired ? "fired" : anyReady ? "overheat" : null;
}

/* ── Missiles ------------------------------------------------------------ */

export function fireMissile(world) {
  const ship = world.player;
  const stats = world.stats;
  if (!stats.secondary) return "none";
  if (ship.disabled > 0) return null;
  if ((ship.missileTimer ?? 0) > 0) return null;
  if ((world.state.missiles ?? 0) <= 0) return "empty";
  const target = world.target && world.target.kind === "enemy" && !world.target.friendly ? world.target : null;
  world.state.missiles--;
  ship.missileTimer = GAME.missileReload;
  const a = world.aimAngle;
  world.missiles.push(
    createMissile({
      x: ship.x + Math.cos(a) * 16,
      y: ship.y + Math.sin(a) * 16,
      angle: a,
      targetId: target?.id ?? null,
      damage: 58 + (stats.power - 46) * 0.4,
      friendly: true,
    }),
  );
  world.effects.play("missile");
  world.effects.flashScreen(0.08);
  return "fired";
}

/** Step player + enemy missiles: homing, proximity fuses, countermeasures. */
export function stepMissiles(world, dt) {
  const ship = world.player;
  ship.missileTimer = Math.max(0, (ship.missileTimer ?? 0) - dt);
  for (const m of world.missiles) {
    m.life -= dt;
    m.flash = Math.max(0, m.flash - dt * 4);
    const target =
      (m.targetId && world.enemies.find((e) => e.id === m.targetId)) ||
      (m.friendly ? world.enemies.find((e) => !e.friendly && !e.dead) : null);
    if (target && !target.dead) {
      const desired = Math.atan2(target.y - m.y, target.x - m.x);
      let diff = desired - m.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const turn = 4.6 * (m.friendly ? 1 : 0.72) * dt;
      m.angle += clamp(diff, -turn, turn);
      m.speed = Math.min(520, (m.speed ?? 260) + 220 * dt);
    } else {
      m.speed = Math.min(460, (m.speed ?? 260) + 160 * dt);
    }
    m.vx = Math.cos(m.angle) * m.speed;
    m.vy = Math.sin(m.angle) * m.speed;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    world.effects.missileTrail(m.x, m.y, m.friendly ? PAL.rose : PAL.ember);

    // Collision against the opposing side.
    if (m.friendly) {
      for (const e of world.enemies) {
        if (e.dead || e.friendly) continue;
        if (dist2(m.x, m.y, e.x, e.y) < (e.radius + 6) ** 2) {
          damageEnemy(world, e, m.damage, { fromMissile: true });
          explode(world, m.x, m.y, PAL.rose, 16, 150);
          m.life = 0;
          break;
        }
      }
    } else {
      if (ship.hp > 0 && dist2(m.x, m.y, ship.x, ship.y) < (ship.radius + 6) ** 2) {
        const jitter = world.stats.ecm * 0.5;
        if (Math.random() > jitter) {
          damagePlayer(world, m.damage, { fromMissile: true });
          explode(world, m.x, m.y, PAL.ember, 14, 130);
        } else {
          world.effects.floatText(ship.x, ship.y - 20, "JAMMED", PAL.cyan);
        }
        m.life = 0;
      }
    }
    if (Math.hypot(m.x, m.y) > GAME.sectorSize * 1.15) m.life = 0;
  }
  world.missiles = world.missiles.filter((m) => m.life > 0);
}

/* ── Projectile stepping + damage ---------------------------------------- */

export function stepProjectiles(world, dt) {
  const ship = world.player;
  const survivors = [];
  for (const b of world.projectiles) {
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;

    if (b.antiMissile) {
      // Point-defence rounds home in on nearby hostile missiles.
      let best = null,
        bestD = 130 * 130;
      for (const m of world.missiles) {
        if (m.friendly) continue;
        const d = dist2(b.x, b.y, m.x, m.y);
        if (d < bestD) (bestD = d), (best = m);
      }
      if (best) {
        const a = Math.atan2(best.y - b.y, best.x - b.x);
        b.vx = Math.cos(a) * 560;
        b.vy = Math.sin(a) * 560;
      }
      for (const m of world.missiles) {
        if (m.friendly) continue;
        if (segmentCircle(b.px, b.py, b.x, b.y, m.x, m.y, 8)) {
          m.life = 0;
          b.life = 0;
          world.effects.burst(m.x, m.y, PAL.amber, 6);
          break;
        }
      }
      if (b.life <= 0) continue;
    }

    if (b.friendly) {
      let hitSomething = false;
      for (const e of world.enemies) {
        if (e.dead || e.friendly) continue;
        if (segmentCircle(b.px, b.py, b.x, b.y, e.x, e.y, e.radius + 3)) {
          damageEnemy(world, e, b.damage, { weapon: b.kind });
          world.effects.hitSpark(b.x, b.y, b.color);
          if (b.splash) splashDamage(world, b.x, b.y, b.splash, b.damage * 0.5, e.id);
          b.hit.push(e.id);
          if (b.pierce > b.hit.length) {
            // Railgun slug keeps going through up to `pierce` targets.
            continue;
          }
          b.life = 0;
          hitSomething = true;
          break;
        }
      }
      if (b.life <= 0) continue;
      // Asteroids can be shot (mining by gunfire, inefficiently).
      for (const a of world.rocks) {
        if (a.dead) continue;
        if (segmentCircle(b.px, b.py, b.x, b.y, a.x, a.y, a.radius * 0.95)) {
          a.hp -= b.damage * (b.kind === "mining" ? 2.4 : 1);
          a.flash = 1;
          world.effects.hitSpark(b.x, b.y, a.yields === "ore" ? PAL.ember : PAL.mist);
          if (a.hp <= 0) breakAsteroid(world, a);
          b.life = 0;
          hitSomething = true;
          break;
        }
      }
      if (hitSomething) continue;
    } else {
      if (ship.hp > 0 && ship.disabled <= 0 && segmentCircle(b.px, b.py, b.x, b.y, ship.x, ship.y, ship.radius + 2)) {
        damagePlayer(world, b.damage, { weapon: b.shotType });
        world.effects.hitSpark(b.x, b.y, b.color);
        continue;
      }
      for (const a of world.rocks) {
        if (!a.dead && segmentCircle(b.px, b.py, b.x, b.y, a.x, a.y, a.radius * 0.95)) {
          a.hp -= b.damage * 0.5;
          a.flash = 1;
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
    }

    // Out-of-bounds cull.
    if (Math.hypot(b.x, b.y) > GAME.sectorSize * 1.2) continue;
    survivors.push(b);
  }
  world.projectiles = survivors;
}

function splashDamage(world, x, y, radius, damage, skipId) {
  for (const e of world.enemies) {
    if (e.dead || e.friendly || e.id === skipId) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < radius) damageEnemy(world, e, damage * (1 - d / radius), { splash: true });
  }
  if (dist2(x, y, world.player.x, world.player.y) < radius * radius && world.player.hp > 0) {
    damagePlayer(world, damage * 0.25, { splash: true });
  }
}

/* ── Damage -------------------------------------------------------------- */

export function damageEnemy(world, enemy, amount, meta = {}) {
  if (enemy.dead) return;
  enemy.flash = 1;
  enemy.aggro = 1;
  if (enemy.friendly) {
    // Shooting friendlies is a crime.
    world.events.push({ type: "friendlyFire", enemy: enemy.defId, damage: amount });
  }
  let dmg = amount;
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, dmg);
    enemy.shield -= absorbed;
    dmg -= absorbed;
    if (meta.fromMissile) enemy.shield = Math.max(0, enemy.shield - amount * 0.2);
  }
  enemy.hp -= dmg;
  if (enemy.hp <= 0) killEnemy(world, enemy, meta);
}

export function damagePlayer(world, amount, meta = {}) {
  const ship = world.player;
  if (ship.hp <= 0) return;
  let dmg = amount * (1 - world.stats.resist);
  const guardCut = world.stats.guard * (meta.weapon === "kinetic" ? 0.5 : 0.2);
  dmg *= 1 - clamp(guardCut, 0, 0.6);
  if (ship.shield > 0) {
    const absorbed = Math.min(ship.shield, dmg);
    ship.shield -= absorbed;
    dmg -= absorbed;
    world.effects.shieldRipple(ship.x, ship.y, ship.radius);
  }
  if (dmg > 0) ship.hp -= dmg;
  ship.lastHitAt = world.time;
  world.effects.shake(clamp(dmg / 22, 0.06, 0.4));
  world.effects.flashScreen(clamp(dmg / 120, 0.02, 0.2));
  if (ship.hp <= 0) {
    ship.hp = 0;
    world.events.push({ type: "playerDestroyed" });
  }
}

export function killEnemy(world, enemy, meta = {}) {
  if (enemy.dead) return;
  enemy.dead = true;
  enemy.hp = 0;
  const color = enemy.boss ? PAL.gold : enemy.friendly ? PAL.cyan : PAL.ember;
  explode(world, enemy.x, enemy.y, color, enemy.boss ? 40 : 18, enemy.boss ? 260 : 160);
  world.effects.play(enemy.boss ? "bossDown" : "explode");
  world.effects.shake(enemy.boss ? 0.8 : 0.25);
  world.effects.hitStop(enemy.boss ? 0.35 : 0.05);
  // Loot drops.
  const loot = enemy.loot ?? [];
  for (const item of loot) world.pickups.push(createPickup({ x: enemy.x, y: enemy.y, id: item.id, qty: item.qty }));
  if (enemy.bounty > 0 && !enemy.friendly) {
    world.pickups.push(createPickup({ x: enemy.x + 8, y: enemy.y, id: "credits", qty: enemy.bounty, pickupKind: "credits" }));
  }
  if (enemy.boss) world.effects.floatText(enemy.x, enemy.y - 30, "TARGET DESTROYED", PAL.gold);
  world.events.push({
    type: "kill",
    enemy: enemy.defId,
    faction: enemy.faction,
    bounty: enemy.bounty,
    boss: enemy.boss,
    name: enemy.name,
    sector: world.sector.key,
  });
  // Reinforcements: killing a corsair in anarchy space may summon a wingman.
  if (!enemy.friendly && world.sector.security !== "high" && !enemy.boss && Math.random() < 0.18 && world.enemies.filter((e) => !e.dead && !e.friendly).length < 5) {
    world.events.push({ type: "reinforcement", enemy: "corsair" });
  }
}

/* ── Asteroid breaking and pickups --------------------------------------- */

export function breakAsteroid(world, rock) {
  if (rock.dead) return;
  rock.dead = true;
  const n = Math.round(rock.ore * (1 + world.stats.mining));
  for (let i = 0; i < n; i++)
    world.pickups.push(
      createPickup({
        x: rock.x + (Math.random() - 0.5) * 20,
        y: rock.y + (Math.random() - 0.5) * 20,
        id: rock.yields,
        qty: 1,
      }),
    );
  world.effects.burst(rock.x, rock.y, rock.yields === "ore" ? PAL.ember : PAL.mist, 14);
  world.effects.play("rock");
  world.events.push({ type: "asteroid", sector: world.sector.key, yields: rock.yields });
}

export function stepPickups(world, dt) {
  const ship = world.player;
  const range = GAME.tractorRange + world.stats.tractor;
  const out = [];
  for (const p of world.pickups) {
    p.life -= dt;
    p.bob += dt * 3;
    const d = Math.hypot(ship.x - p.x, ship.y - p.y);
    if (d < range) {
      const pull = clamp((1 - d / range) * 340, 80, 340);
      p.vx += ((ship.x - p.x) / (d || 1)) * pull * dt * 2.2;
      p.vy += ((ship.y - p.y) / (d || 1)) * pull * dt * 2.2;
    }
    const damp = Math.exp(-2.6 * dt);
    p.vx *= damp;
    p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (d < ship.radius + 12) {
      if (p.pickupKind === "credits") {
        world.state.credits += p.qty;
        world.state.stats.creditsEarned = (world.state.stats.creditsEarned ?? 0) + p.qty;
        world.effects.floatText(ship.x, ship.y - 18, `+${p.qty} CR`, PAL.gold);
      } else {
        const free = world.stats.cargo - world.cargoUsed();
        if (free <= 0) {
          world.effects.floatText(ship.x, ship.y - 18, "CARGO FULL", PAL.red);
          continue;
        }
        const take = Math.min(p.qty, free);
        world.state.cargo[p.cargoId] = (world.state.cargo[p.cargoId] ?? 0) + take;
        if (p.cargoId === "ore") world.state.stats.oreMined = (world.state.stats.oreMined ?? 0) + take;
        world.effects.floatText(ship.x, ship.y - 18, `+${take} ${p.cargoId.toUpperCase()}`, PAL.cyan);
        p.qty -= take;
        if (p.qty > 0) {
          p.life = 6;
          out.push(p);
        }
        world.events.push({ type: "loot", id: p.cargoId, qty: take, sector: world.sector.key });
        world.effects.play("pickup");
        continue;
      }
      world.effects.play("pickup");
      continue;
    }
    if (p.life <= 0) continue;
    out.push(p);
  }
  world.pickups = out;
}

/** Scatter rocks inside a field; used while loading a sector. */
export function spawnField(world, field) {
  const count = Math.round(field.rocks * (0.7 + field.richness * 0.22));
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const r = Math.pow(Math.random(), 0.7) * 190 * field.richness;
    out.push(createAsteroid(field.x + Math.cos(a) * r, field.y + Math.sin(a) * r, (field.x * 31 + i * 977) | 0, 0.8 + Math.random() * 0.6));
  }
  world.rocks.push(...out);
  return out;
}

export function explode(world, x, y, color, count, spread) {
  world.debris.push(...createDebris(x, y, color, count, spread));
  world.effects.burst(x, y, color, Math.round(count * 0.6));
  world.effects.explosion(x, y, color, count);
}
