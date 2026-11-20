/**
 * Per-frame world simulation, independent of rendering and DOM.
 *
 * `tickWorld(ctx)` is the single entry point used by the game loop and by the
 * headless test harness, so what the tests exercise is exactly what players run.
 */
import { stepPlayer, applyBounds } from "./flight.js";
import { fireMain, stepProjectiles, stepMissiles, stepPickups, fireMissile } from "./combat.js";
import { stepEnemies, stepWingman } from "./ai.js";
import { bestInteraction } from "../world/sector.js";
import { clamp } from "../core/utils.js";

export function tickWorld(world, dt, input, effects) {
  world.time += dt;
  world.worldTime += dt;
  world.input = input;
  world.player.fireCooldown = 0;

  if (input.aim) {
    world.aimAngle = Math.atan2(input.aim.y, input.aim.x);
    // Renderer needs the camera-relative aim for the reticle; stored upstream.
  }

  stepPlayer(
    world.player,
    world.stats,
    { x: input.x, y: input.y, boost: input.boost, brake: input.brake, aim: input.aim, assist: input.assist },
    dt,
    { aimAngle: world.aimAngle, assist: input.assist !== false, time: world.time },
  );
  applyBounds(world.player, dt);

  // Heat and shield regeneration.
  const p = world.player;
  p.heat = clamp(p.heat - world.stats.cool * dt, 0, 140);
  p.missileTimer = Math.max(0, p.missileTimer - dt);
  for (const slot of Object.keys(p.slotCooldowns ?? {})) {
    p.slotCooldowns[slot] = Math.max(0, p.slotCooldowns[slot] - dt);
  }
  if (world.time - p.lastHitAt > 4 && p.shield < p.shieldMax) {
    p.shield = Math.min(p.shieldMax, p.shield + world.stats.shieldRegen * dt);
  }
  if (world.stats.repair > 0 && p.hp < p.hullMax) {
    p.hp = Math.min(p.hullMax, p.hp + world.stats.repair * dt * 0.35);
  }

  if (input.fire) fireMain(world, dt);
  if (input.secondary) {
    const result = fireMissile(world);
    if (result === "empty") world.events.push({ type: "noMissiles" });
    else if (result === "none") world.events.push({ type: "noLauncher" });
  }

  stepEnemies(world, dt);
  stepWingman(world, dt);
  stepProjectiles(world, dt);
  stepMissiles(world, dt);

  // Pickups, debris, world lifetime.
  stepPickups(world, dt);
  for (const d of world.debris) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= Math.exp(-0.8 * dt);
    d.vy *= Math.exp(-0.8 * dt);
    d.life -= dt;
    d.rotation += d.spin * dt;
  }
  if (world.debris.length > 400) world.debris.splice(0, world.debris.length - 400);
  world.debris = world.debris.filter((d) => d.life > 0);

  // Asteroids drift slowly.
  for (const a of world.rocks) {
    if (a.dead) continue;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rotation += a.spin * dt;
    a.flash = Math.max(0, a.flash - dt * 5);
  }
  for (const e of world.enemies) e.deathTimer = (e.deathTimer ?? 0) - dt;

  // Stations rotate for life.
  if (world.station) world.station.angle += world.station.spin * dt;

  // Interaction target for the HUD and the hold-to-interact mechanic.
  world.interact = bestInteraction(world);
  if (world.holdTarget) {
    const still = world.interact && world.interact.entity === world.holdTarget;
    if (!still) {
      world.holdTarget = null;
      world.holdProgress = 0;
    } else {
      world.holdProgress += dt;
      if (world.holdProgress >= world.holdTarget.hold) {
        const target = world.holdTarget;
        world.holdTarget = null;
        world.holdProgress = 0;
        world.events.push({ type: "interact", action: target.action, entity: target.entity });
      }
    }
  }

  // Sensor sweep: which contacts are currently visible for radar/labels.
  world.sensorRange = world.stats.sensor;
  effects?.step(dt);
  return world;
}

/** Start a hold (or fire an instant interaction event) for the current target. */
export function beginInteract(world, effects) {
  const it = world.interact;
  if (!it) {
    world.events.push({ type: "interactFail" });
    return false;
  }
  if (it.hold <= 0) {
    world.events.push({ type: "interact", action: it.action, entity: it.entity });
    return true;
  }
  world.holdTarget = it;
  world.holdProgress = 0;
  return true;
}

export function cancelInteract(world) {
  world.holdTarget = null;
  world.holdProgress = 0;
}
