/**
 * Ship AI.
 *
 * Each enemy archetype is a small behaviour function that writes steering and
 * firing intent. Behaviours are intentionally legible: a scout circles, a
 * raider closes, a gunship holds a line, an enforcer snipes from distance,
 * patrols ignore the player unless provoked, and the warlord cycles phases.
 */
import { clamp, angleDiff, dist, TAU } from "../core/utils.js";
import { steerToward, enemyAccel, enemySpeedCap, leadPoint } from "./flight.js";
import { createProjectile, createMissile } from "../entities/entities.js";
import { damagePlayer } from "./combat.js";
import { PAL } from "../config.js";

const AGGRO_TABLE = {
  scout: 0.55,
  raider: 1,
  gunship: 0.85,
  enforcer: 0.9,
  sentinel: 1.2,
  warlord: 1.15,
  patrol: 0.6,
  idle: 0,
};

export function stepEnemies(world, dt) {
  const player = world.player;
  for (const e of world.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt * 4);
    e.shield = Math.min(e.shieldMax, e.shield + (e.shieldMax > 0 ? 3.2 * dt : 0));
    e.fireTimer -= dt;
    e.missileTimer = (e.missileTimer ?? 8) - dt;
    e.stateTimer -= dt;
    if (e.disabled > 0) {
      e.disabled -= dt;
      e.vx *= Math.exp(-2 * dt);
      e.vy *= Math.exp(-2 * dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.angle += dt * 0.4;
      continue;
    }
    const behaviour = BEHAVIOURS[e.def.ai] ?? BEHAVIOURS.raider;
    const distToPlayer = dist(e.x, e.y, player.x, player.y);
    const playerAlive = player.hp > 0;
    const aggroRange = (e.friendly ? 0 : (e.def.sensor ?? 420) * 0.72);
    // Aggro check.
    if (!e.friendly && playerAlive && distToPlayer < aggroRange) {
      if (e.faction === "corsair" || e.faction === "null") e.aggro = Math.max(e.aggro, 0.25);
      if (world.playerAttackedFaction === e.faction) e.aggro = 1;
      if (e.aggro < 1) e.aggro = Math.min(1, e.aggro + dt * 0.6);
    }
    if (world.state.rep[e.faction] <= -60 && e.faction !== "indie") e.aggro = 1;
    behaviour(world, e, dt, { distToPlayer, playerAlive });
    // Flee at low hull (except bosses).
    if (!e.boss && !e.friendly && e.hp < e.hullMax * 0.22 && e.fleeing === false) {
      e.fleeing = true;
      if (Math.random() < 0.35) world.effects.floatText(e.x, e.y - 20, "FLEEING", PAL.amber);
    }
    if (e.fleeing) flee(world, e, dt);
    // Out-of-bounds correction.
    const r = Math.hypot(e.x, e.y);
    if (r > 2300) steerToward(e, 0, 0, enemyAccel(e.def) * 0.8, dt, enemySpeedCap(e.def));
  }
  world.enemies = world.enemies.filter((e) => !e.dead || e.deathTimer > 0);
}

function faceTarget(e, tx, ty, dt, turnScale = 4) {
  const desired = Math.atan2(ty - e.y, tx - e.x);
  const diff = angleDiff(e.angle, desired);
  e.angle += clamp(diff, -turnScale * dt, turnScale * dt);
}

function shoot(world, e, accuracy = 1) {
  if (e.fireTimer > 0) return;
  const ship = world.player;
  const speed = 470 + e.def.damage * 5;
  const lead = leadPoint(e.x, e.y, ship.x, ship.y, ship.vx, ship.vy, speed);
  const spread = (1 - accuracy) * 0.22 + 0.03;
  const a = Math.atan2(lead.y - e.y, lead.x - e.x) + (Math.random() - 0.5) * spread;
  e.fireTimer = e.def.rate * (0.85 + Math.random() * 0.3);
  world.projectiles.push(
    createProjectile({
      x: e.x + Math.cos(a) * 14,
      y: e.y + Math.sin(a) * 14,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage: e.def.damage,
      friendly: false,
      color: e.boss ? PAL.purple : PAL.rose,
      kind: "kinetic",
      life: 2.2,
      size: e.boss ? 3 : 2,
    }),
  );
  world.effects.muzzle(e.x, e.y, e.boss ? PAL.purple : PAL.rose, a);
  if (dist(e.x, e.y, world.player.x, world.player.y) < 800)
    world.effects.play(e.boss ? "bossShot" : "enemyShot");
}

function launchMissile(world, e) {
  if (!e.def.missiles || e.missileTimer > 0) return;
  e.missileTimer = 11 + Math.random() * 5;
  world.missiles.push(
    createMissile({
      x: e.x,
      y: e.y,
      angle: Math.atan2(world.player.y - e.y, world.player.x - e.x),
      targetId: null,
      damage: e.def.damage * 1.4,
      friendly: false,
    }),
  );
  world.effects.play("enemyMissile");
  world.effects.floatText(e.x, e.y - 22, "MISSILE", PAL.red);
}

const BEHAVIOURS = {
  /** Circles at mid range, taking pot-shots. */
  scout(world, e, dt, { distToPlayer }) {
    const ship = world.player;
    const orbit = 240;
    const side = e.id.length % 2 ? 1 : -1;
    if (e.aggro > 0 && ship.hp > 0) {
      const ang = Math.atan2(ship.y - e.y, ship.x - e.x) + side * 1.1;
      const tx = ship.x - Math.cos(ang) * orbit;
      const ty = ship.y - Math.sin(ang) * orbit;
      steerToward(e, tx, ty, enemyAccel(e.def), dt, enemySpeedCap(e.def));
      faceTarget(e, ship.x, ship.y, dt, 5);
      if (distToPlayer < e.def.range) shoot(world, e, 0.55);
    } else {
      wander(e, dt);
    }
  },
  raider(world, e, dt, { distToPlayer }) {
    const ship = world.player;
    if (e.aggro > 0 && ship.hp > 0) {
      const ideal = e.def.range * 0.62;
      const a = Math.atan2(ship.y - e.y, ship.x - e.x);
      const tx = ship.x - Math.cos(a) * ideal;
      const ty = ship.y - Math.sin(a) * ideal;
      steerToward(e, tx, ty, enemyAccel(e.def), dt, enemySpeedCap(e.def));
      faceTarget(e, ship.x, ship.y, dt, 5);
      if (distToPlayer < e.def.range) shoot(world, e, 0.7);
      if (distToPlayer < 340) launchMissile(world, e);
    } else wander(e, dt);
  },
  gunship(world, e, dt, { distToPlayer }) {
    const ship = world.player;
    if (e.aggro > 0 && ship.hp > 0) {
      // Holds a firing line and strafes laterally.
      const a = Math.atan2(e.y - ship.y, e.x - ship.x);
      const strafe = Math.sin(world.time * 0.5 + e.home.x) * 0.5;
      const tx = ship.x + Math.cos(a + strafe) * e.def.range * 0.9;
      const ty = ship.y + Math.sin(a + strafe) * e.def.range * 0.9;
      steerToward(e, tx, ty, enemyAccel(e.def) * 0.9, dt, enemySpeedCap(e.def));
      faceTarget(e, ship.x, ship.y, dt, 3.4);
      if (distToPlayer < e.def.range * 1.1) shoot(world, e, 0.66);
    } else wander(e, dt);
  },
  enforcer(world, e, dt, { distToPlayer }) {
    const ship = world.player;
    if (e.aggro > 0 && ship.hp > 0) {
      const ideal = 460;
      const a = Math.atan2(e.y - ship.y, e.x - ship.x);
      if (distToPlayer < ideal * 0.7 || distToPlayer > ideal * 1.2) {
        steerToward(e, ship.x - Math.cos(a) * ideal, ship.y - Math.sin(a) * ideal, enemyAccel(e.def), dt, enemySpeedCap(e.def));
      } else {
        const tang = a + Math.PI / 2;
        steerToward(e, e.x + Math.cos(tang) * 200, e.y + Math.sin(tang) * 200, enemyAccel(e.def) * 0.6, dt, enemySpeedCap(e.def) * 0.5);
      }
      faceTarget(e, ship.x, ship.y, dt, 3);
      if (distToPlayer < e.def.range) shoot(world, e, 0.8);
      if (distToPlayer < 600) launchMissile(world, e);
    } else wander(e, dt);
  },
  patrol(world, e, dt) {
    const ship = world.player;
    const hostile = world.enemies.find((o) => !o.dead && !o.friendly && dist(o.x, o.y, e.x, e.y) < 520);
    const pirateAggro = e.aggro >= 1;
    if (hostile) {
      const r = dist(e.x, e.y, hostile.x, hostile.y);
      if (r > 200) steerToward(e, hostile.x, hostile.y, enemyAccel(e.def), dt, enemySpeedCap(e.def));
      else {
        const a = Math.atan2(hostile.y - e.y, hostile.x - e.x);
        steerToward(e, e.x + Math.cos(a + 1.5) * 220, e.y + Math.sin(a + 1.5) * 220, enemyAccel(e.def), dt, enemySpeedCap(e.def));
      }
      faceTarget(e, hostile.x, hostile.y, dt, 4);
      if (r < e.def.range && e.fireTimer <= 0) fireAtEnemy(world, e, hostile);
    } else if (pirateAggro && ship.hp > 0 && world.state.rep[e.faction] < -40) {
      // Only hostile patrols engage the player.
      const r = dist(e.x, e.y, ship.x, ship.y);
      steerToward(e, ship.x, ship.y, enemyAccel(e.def), dt, enemySpeedCap(e.def));
      faceTarget(e, ship.x, ship.y, dt, 4);
      if (r < e.def.range) shoot(world, e, 0.7);
    } else {
      patrolRoute(world, e, dt);
    }
  },
  warlord(world, e, dt, { distToPlayer }) {
    const ship = world.player;
    e.phase = e.phase ?? 1;
    if (e.hp < e.hullMax * 0.55) e.phase = 2;
    if (e.hp < e.hullMax * 0.25) e.phase = 3;
    if (e.aggro <= 0) {
      // Broadcast a taunt before attacking.
      faceTarget(e, ship.x, ship.y, dt, 2);
      return;
    }
    const timer = world.time % 14;
    let tx = ship.x,
      ty = ship.y;
    if (e.phase === 1) {
      const a = Math.atan2(e.y - ship.y, e.x - ship.x);
      tx = ship.x + Math.cos(a) * 380;
      ty = ship.y + Math.sin(a) * 380;
      if (distToPlayer < 460) shoot(world, e, 0.55);
    } else if (e.phase === 2) {
      const a = Math.atan2(e.y - ship.y, e.x - ship.x) + Math.sin(world.time * 0.6) * 0.8;
      tx = ship.x + Math.cos(a) * 300;
      ty = ship.y + Math.sin(a) * 300;
      if (distToPlayer < 520) shoot(world, e, 0.6);
      if (timer > 6 && timer < 10) launchMissile(world, e);
    } else {
      // Desperate phase: ramping charges and broadside bursts.
      const charge = Math.sin(world.time * 2.2);
      const a = Math.atan2(ship.y - e.y, ship.x - e.x);
      tx = ship.x - Math.cos(a) * (320 + charge * 180);
      ty = ship.y - Math.sin(a) * (320 + charge * 180);
      if (distToPlayer < 600) shoot(world, e, 0.7);
      if (timer < 3) launchMissile(world, e);
    }
    steerToward(e, tx, ty, enemyAccel(e.def), dt, enemySpeedCap(e.def));
    faceTarget(e, ship.x, ship.y, dt, 2.6);
  },
  sentinel(world, e, dt, { distToPlayer }) {
    const ship = world.player;
    e.aggro = 1;
    const a = Math.atan2(ship.y - e.y, ship.x - e.x);
    steerToward(e, ship.x - Math.cos(a) * 420, ship.y - Math.sin(a) * 420, enemyAccel(e.def) * 0.9, dt, enemySpeedCap(e.def));
    faceTarget(e, ship.x, ship.y, dt, 2.2);
    if (distToPlayer < 560) shoot(world, e, 0.62);
    if (world.time % 9 < 0.4) launchMissile(world, e);
    e.shield = Math.min(e.shieldMax, e.shield + 9 * dt);
  },
  idle(world, e, dt) {
    e.angle += Math.sin(world.time * 0.3) * dt * 0.15;
  },
};

function fireAtEnemy(world, e, target) {
  const speed = 480;
  const lead = leadPoint(e.x, e.y, target.x, target.y, target.vx, target.vy, speed);
  const a = Math.atan2(lead.y - e.y, lead.x - e.x) + (Math.random() - 0.5) * 0.08;
  e.fireTimer = e.def.rate;
  world.projectiles.push(
    createProjectile({
      x: e.x + Math.cos(a) * 14,
      y: e.y + Math.sin(a) * 14,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage: target.hullMax ? e.def.damage * 2.4 : e.def.damage,
      friendly: true,
      color: e.def.color,
      kind: "kinetic",
      life: 2,
      size: 2,
      ownerId: e.id,
    }),
  );
  // Patrol fire damages pirates directly (projectiles only collide with the player or rocks).
  if (target.def && !target.friendly) {
    target.hp -= e.def.damage * 2.2;
    target.aggro = 1;
    target.flash = 1;
    if (target.hp <= 0) {
      target.dead = true;
      world.effects.explosion(target.x, target.y, PAL.ember, 14);
      world.events.push({ type: "kill", enemy: target.defId, faction: target.faction, bounty: 0, byPatrol: true, sector: world.sector.key });
    }
  }
}

function wander(e, dt) {
  const a = e.patrolAngle + Math.sin(e.stateTimer + e.home.y) * 0.4;
  const tx = e.home.x + Math.cos(a) * 180;
  const ty = e.home.y + Math.sin(a) * 180;
  steerToward(e, tx, ty, enemyAccel(e.def) * 0.35, dt, 40);
  e.patrolAngle += dt * 0.18;
}

function patrolRoute(world, e, dt) {
  e.routeT = (e.routeT ?? 0) + dt * 0.25;
  const tx = Math.cos(e.routeT + (e.escort ?? 0)) * 520;
  const ty = Math.sin(e.routeT + (e.escort ?? 0)) * 520;
  steerToward(e, tx, ty, enemyAccel(e.def) * 0.5, dt, 90);
  faceTarget(e, tx, ty, dt, 2.2);
}

function flee(world, e, dt) {
  const ship = world.player;
  const a = Math.atan2(e.y - ship.y, e.x - ship.x);
  const tx = e.x + Math.cos(a) * 500;
  const ty = e.y + Math.sin(a) * 500;
  steerToward(e, tx, ty, enemyAccel(e.def) * 1.2, dt, enemySpeedCap(e.def) * 1.2);
  faceTarget(e, tx, ty, dt, 3);
  if (Math.hypot(e.x, e.y) > 2250) {
    e.dead = true; // escaped the sector
    world.events.push({ type: "escape", enemy: e.defId, sector: world.sector.key });
  }
}

/** Friendly wingman escort behaviour, hired at cantinas. */
export function stepWingman(world, dt) {
  const w = world.wingman;
  if (!w || w.hp <= 0) return;
  const ship = world.player;
  w.flash = Math.max(0, w.flash - dt * 4);
  w.fireTimer -= dt;
  const enemy = world.enemies.find((e) => !e.dead && !e.friendly);
  const dToShip = dist(w.x, w.y, ship.x, ship.y);
  if (enemy) {
    const d = dist(w.x, w.y, enemy.x, enemy.y);
    steerToward(w, enemy.x, enemy.y, enemyAccel(w.def), dt, 240);
    w.angle = Math.atan2(enemy.y - w.y, enemy.x - w.x);
    if (d < 380 && w.fireTimer <= 0) {
      w.fireTimer = 0.5;
      const a = Math.atan2(enemy.y - w.y, enemy.x - w.x) + (Math.random() - 0.5) * 0.1;
      world.projectiles.push(
        createProjectile({
          x: w.x,
          y: w.y,
          vx: Math.cos(a) * 520,
          vy: Math.sin(a) * 520,
          damage: 9,
          friendly: true,
          color: PAL.cyan,
          kind: "energy",
          life: 1.6,
          size: 2,
        }),
      );
    }
  } else if (dToShip > 160) {
    steerToward(w, ship.x - 90, ship.y + 60, enemyAccel(w.def), dt, 320);
    w.angle = Math.atan2(ship.y - w.y, ship.x - w.x);
  } else {
    w.vx *= Math.exp(-dt * 2);
    w.vy *= Math.exp(-dt * 2);
    w.x += w.vx * dt;
    w.y += w.vy * dt;
  }
}
