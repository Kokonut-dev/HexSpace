/**
 * On-foot avatar: movement with wall sliding, walk animation clock, and the
 * nearest interactable probe. Runs in the same fixed-step tick as flight.
 */
import { canWalk, interactablesIn } from "./layout.js";

const SPEED = 132;

export function createAvatar(interior) {
  return {
    x: interior.spawn.x,
    y: interior.spawn.y,
    vx: 0,
    vy: 0,
    facing: 1,
    dir: "up",
    walk: 0,
    moving: false,
    radius: 8,
    speed: SPEED,
    sprite: 0,
  };
}

/** Move the avatar with axis-separated collision so walls slide instead of stick. */
export function stepAvatar(avatar, interior, input, dt) {
  let dx = (input.x ?? 0) * SPEED * dt;
  let dy = (input.y ?? 0) * SPEED * dt;
  avatar.moving = Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05;
  if (avatar.moving) {
    const len = Math.hypot(dx, dy) || 1;
    dx = (dx / len) * SPEED * dt;
    dy = (dy / len) * SPEED * dt;
    avatar.walk += dt * 9;
    if (Math.abs(input.x) > 0.1) avatar.facing = Math.sign(input.x);
    if (Math.abs(dy) > Math.abs(dx)) avatar.dir = dy > 0 ? "down" : "up";
    else avatar.dir = "side";
  } else {
    avatar.walk += dt * 2.2;
  }
  if (canWalk(interior, avatar.x + dx, avatar.y, avatar.radius)) avatar.x += dx;
  if (canWalk(interior, avatar.x, avatar.y + dy, avatar.radius)) avatar.y += dy;
  avatar.vx = dx / (dt || 1);
  avatar.vy = dy / (dt || 1);
  return avatar;
}

/** Nearest interactable within reach, sorted by distance. */
export function probe(avatar, interior, reach = 34) {
  let best = null;
  let bestD = reach;
  for (const it of interactablesIn(interior)) {
    const d = Math.hypot(it.x - avatar.x, it.y - avatar.y);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** Ambient NPC wandering: pick a nearby target, walk to it, pause. */
export function stepNpcs(interior, dt) {
  for (const n of interior.npcs) {
    n.wanderT -= dt;
    if (n.wanderT <= 0) {
      n.wanderT = 2 + Math.random() * 5;
      n.tx = n.x + (Math.random() - 0.5) * 70;
      n.ty = n.y + (Math.random() - 0.5) * 46;
    }
    if (n.tx != null) {
      const dx = n.tx - n.x,
        dy = n.ty - n.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const step = Math.min(d, 26 * dt);
        const nx = n.x + (dx / d) * step;
        const ny = n.y + (dy / d) * step;
        if (canWalk(interior, nx, ny, 7)) {
          n.x = nx;
          n.y = ny;
          n.facing = dx >= 0 ? 1 : -1;
          n.moving = true;
        } else {
          n.tx = n.x;
          n.ty = n.y;
          n.moving = false;
        }
      } else n.moving = false;
    }
  }
}

/** Where a lift/room label should appear in the HUD when standing in a room. */
export function roomUnder(interior, x, y) {
  return interior.rooms.find(
    (r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h,
  );
}
