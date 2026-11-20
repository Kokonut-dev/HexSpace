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
  const thrust = fit.stats?.thrust || 190;
  const turn = fit.stats?.turn || 3.4;
  const mass = fit.mass || 18;
  
  // Assist logic
  const assist = input.assist;
  const brake = input.brake || (assist && input.x === 0 && input.y === 0);
  
  // Acceleration
  const ax = (input.x || 0) * thrust * dt;
  const ay = (input.y || 0) * thrust * dt;
  
  // Apply brake
  const brakeFactor = brake ? 0.8 : 1.0;
  player.vx = (player.vx || 0) * brakeFactor + ax;
  player.vy = (player.vy || 0) * brakeFactor + ay;
  
  // Position
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  
  // Rotation/Heading
  if (input.aim && (input.aim.x !== 0 || input.aim.y !== 0)) {
    const targetAngle = Math.atan2(input.aim.y, input.aim.x);
    const diff = targetAngle - player.angle;
    const maxTurn = turn * dt;
    player.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
  }
  
  // Boost
  if (input.boost && fit.stats?.boost) {
    player.vx *= 1.5;
    player.vy *= 1.5;
  }
  
  // Apply bounds
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
