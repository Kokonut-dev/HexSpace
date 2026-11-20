export function createShipState(save) {
  return { x: save.x, y: save.y, vx: 0, vy: 0, angle: -Math.PI / 2, heat: 0 };
}
export const createPilot = () => ({ x: 0, y: 97 });
