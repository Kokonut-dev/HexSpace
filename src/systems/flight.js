import {
  GAME,
  PAL,
  FACTIONS,
  SECURITY,
  ECONOMIES,
  GOODS,
  HULLS,
  SHIP_RANKS,
  MODULES,
  CONSUMABLES,
  ENEMIES,
  ITEMS,
  NAMES,
  STORY,
  JOBS,
  CHATTER,
} from "../config.js";

/**
 * Step player physics and position.
 * @param {Object} player - player entity
 * @param {Object} fit - ship stats
 * @param {Object} input - {x,y,boost,brake,fire,secondary,aim:{x,y},assist}
 * @param {number} dt - delta time
 * @param {Object} world - world state
 */
export function stepPlayer(player, fit, input, dt, world) {
  const thrust = fit.thrust || 190;
  const turnRate = fit.turn || 3.4;
  const assist = input.assist !== false;
  const thrustX = input.x || 0;
  const thrustY = input.y || 0;
  const hasThrust = Math.hypot(thrustX, thrustY) > 0.001;
  const boosting = !!input.boost && !input.brake && hasThrust;
  player.moving = hasThrust;
  player.boosting = boosting;
  player.drift = !assist;
  player.thrustInput = hasThrust ? 1 : 0;

  // Mouse aim rotates the nose with the shortest angular path. Carry the aim
  // through the world tick so this is driven by live pointer movement.
  if (input.aim && (input.aim.x !== 0 || input.aim.y !== 0)) {
    const targetAngle = Math.atan2(input.aim.y, input.aim.x);
    const diff = ((targetAngle - player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const maxTurn = turnRate * dt;
    player.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    player.angle = ((player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  }

  // W/S thrust follows the ship's nose; A/D strafe relative to the hull. This
  // keeps visual heading, aiming and acceleration in the same coordinate frame.
  const forward = -thrustY;
  const right = thrustX;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  const rx = Math.cos(player.angle + Math.PI / 2);
  const ry = Math.sin(player.angle + Math.PI / 2);
  const thrustScale = boosting ? 1.65 : 1;
  const ax = (fx * forward + rx * right) * thrust * thrustScale;
  const ay = (fy * forward + ry * right) * thrust * thrustScale;

  const braking = !!input.brake || (assist && !hasThrust);
  const damping = braking ? Math.exp(-(input.brake ? 9 : 5) * dt) : 1;
  player.vx = (player.vx || 0) * damping + ax * dt;
  player.vy = (player.vy || 0) * damping + ay * dt;

  // Keep velocity bounded while preserving the extra boost envelope.
  const speed = Math.hypot(player.vx, player.vy);
  const speedCap = Math.max(120, (fit.speedCap || 520) * (boosting ? 1.18 : 1));
  if (speed > speedCap) {
    player.vx *= speedCap / speed;
    player.vy *= speedCap / speed;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  applyBounds(player, world);
}

/**
 * Apply world bounds to player.
 */
export function applyBounds(player, world) {
  const sectorSize = GAME.sectorSize;
  const half = sectorSize / 2;
  
  if (player.x < -half) player.x = -half;
  if (player.x > half) player.x = half;
  if (player.y < -half) player.y = -half;
  if (player.y > half) player.y = half;
  
  // Wrap or bounce logic can be added here
}

/**
 * Steer toward a point.
 */
export function steerToward(entity, targetX, targetY, speed, dt) {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    entity.vx = (dx / dist) * speed;
    entity.vy = (dy / dist) * speed;
    entity.angle = Math.atan2(dy, dx);
  }
}

/**
 * Lead point for intercept.
 */
export function leadPoint(target, shooter, speed, dt) {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const dist = Math.hypot(dx, dy);
  const time = dist / speed;
  return {
    x: target.x + (target.vx || 0) * time,
    y: target.y + (target.vy || 0) * time,
  };
}

/**
 * Enemy acceleration helper (used by AI system).
 */
export function enemyAccel(entity, targetX, targetY, speed, dt) {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    entity.vx += (dx / dist) * speed * dt;
    entity.vy += (dy / dist) * speed * dt;
  }
}

/**
 * Enemy speed cap helper (used by AI system).
 */
export function enemySpeedCap(entity, maxSpeed) {
  const speed = Math.hypot(entity.vx, entity.vy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    entity.vx *= scale;
    entity.vy *= scale;
  }
}
