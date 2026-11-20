import assert from "node:assert/strict";
import { buildInterior } from "../src/station/layout.js";
import { createAvatar, stepAvatar } from "../src/station/avatar.js";
import { drawStation } from "../src/render/stationview.js";

console.log("=== HexSpace Smoke Test 3: Station Interior & Avatar ===");

const station = {
  id: "st-01",
  name: "Meridian Outpost",
  tech: "trade",
  economy: "trade",
  faction: "united",
  layout: "plan-a",
};
const interior = buildInterior(station);
const avatar = createAvatar(interior);
assert.equal(interior.rooms.length, 6, "station deck should contain six rooms");
assert.ok(interior.props.length > 0, "station should have interactable props");
console.log(`1. Built ${interior.rooms.length}-room ${interior.deck.w}x${interior.deck.h} station deck; clear spawn at (${avatar.x}, ${avatar.y}).`);

const start = { x: avatar.x, y: avatar.y };
const input = { x: 0, y: -1 };
for (let i = 0; i < 10; i++) stepAvatar(avatar, interior, input, 1 / 60);
assert.ok(avatar.moving, "avatar should be moving while input is held");
assert.ok(avatar.y < start.y, "avatar should move up the station deck");
assert.ok(Math.abs(avatar.y - start.y) <= 23, "avatar speed should remain close to 132 px/s");
console.log(`2. Avatar stepped 10 frames: (${start.x.toFixed(1)}, ${start.y.toFixed(1)}) → (${avatar.x.toFixed(1)}, ${avatar.y.toFixed(1)}).`);

// Minimal Canvas 2D mock: count operations while keeping the renderer's normal API.
let drawCalls = 0;
const gradient = { addColorStop() {} };
const ctx = new Proxy({
  fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, globalCompositeOperation: "source-over",
  font: "10px monospace", textAlign: "left", lineWidth: 1,
  measureText: (text) => ({ width: String(text).length * 4 }),
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  ellipse() {}, save() {}, restore() {}, beginPath() {}, closePath() {},
}, {
  get(target, key) {
    if (key in target) return target[key];
    return (...args) => { drawCalls++; };
  },
  set(target, key, value) { target[key] = value; return true; },
});
const frame = { width: 480, height: 270, camera: { x: avatar.x, y: avatar.y } };
const image = { width: 16, height: 24 };
const art = { avatar: { frames: [[image, image, image, image]] }, prop: () => image };
drawStation(ctx, frame, interior, avatar, art, { time: 0, roomName: "Clinic", deck: "A" });
assert.ok(drawCalls > 100, `renderer should draw the 2.5D interior (got ${drawCalls} draw calls)`);
console.log(`3. drawStation rendered the 2.5D interior (${drawCalls} canvas operations).`);

console.log("=== Smoke Test 3 PASSED ===");
