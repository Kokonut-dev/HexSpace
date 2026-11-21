/**
 * Input: normalises keyboard, pointer and touch into two small state objects.
 *
 * `flight` is the analogue control state consumed by the simulation;
 * `events` is a per-frame queue of edge-triggered actions (interact, map,
 * fire pressed, consumable hotkeys) so nothing is missed between ticks.
 */

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
  KeyZ: [-1, 0],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.events = [];
    this.flight = {
      x: 0,
      y: 0,
      boost: false,
      brake: false,
      fire: false,
      secondary: false,
      aim: null,
      assist: true,
    };
    this.pointer = { x: 0.5, y: 0.5, down: false, secondaryDown: false, active: false, touch: false };
    this.touchMove = { x: 0, y: 0 };
    this.enabled = true;
    this.bind();
  }

  bind() {
    if (this._bound || !this.canvas) return;
    this._bound = true;
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    window.addEventListener("blur", () => this.clear());
    if (this.canvas) {
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
      this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
      this.canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
      this.canvas.addEventListener("pointerleave", () => {
        this.pointer.active = false;
        this.pointer.down = false;
        this.pointer.secondaryDown = false;
      });
    }
  }

  onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(code)) e.preventDefault();
    if (e.repeat) {
      if (code === "KeyE") return;
      this.keys.add(code);
      return;
    }
    this.keys.add(code);
    switch (code) {
      case "KeyE":
        this.events.push({ type: "interact" });
        break;
      case "KeyM":
        this.events.push({ type: "map" });
        break;
      case "KeyF":
        this.events.push({ type: "target" });
        break;
      case "Tab":
        this.events.push({ type: "target" });
        break;
      case "Escape":
        this.events.push({ type: "escape" });
        break;
      case "KeyH":
        this.events.push({ type: "consumable", id: "patchKit" });
        break;
      case "KeyJ":
        this.events.push({ type: "consumable", id: "shieldCell" });
        break;
      case "KeyK":
        this.events.push({ type: "consumable", id: "fuelCanister" });
        break;
      case "KeyT":
        this.events.push({ type: "assist" });
        break;
      case "KeyP":
        this.events.push({ type: "pause" });
        break;
      case "KeyC":
        this.events.push({ type: "screen", screen: "codex" });
        break;
      case "KeyF1":
        this.events.push({ type: "screen", screen: "help" });
        break;
      default:
        break;
    }
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  onPointerDown(e) {
    if (!this.enabled) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.updatePointer(e);
    this.pointer.active = true;
    if (e.button === 2) this.pointer.secondaryDown = true;
    else this.pointer.down = true;
    this.events.push({ type: "pointerDown", button: e.button, x: this.pointer.x, y: this.pointer.y });
  }

  onPointerMove(e) {
    this.updatePointer(e);
    this.pointer.touch = e.pointerType === "touch";
    // Aiming should work as soon as the mouse moves over the viewport; a
    // preliminary click should not be required to wake up the pointer.
    if (e.pointerType !== "touch") this.pointer.active = true;
  }

  onPointerUp(e) {
    if (e.button === 2) this.pointer.secondaryDown = false;
    else this.pointer.down = false;
    this.events.push({ type: "pointerUp", button: e.button });
  }

  updatePointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = (e.clientX - rect.left) / Math.max(1, rect.width);
    this.pointer.y = (e.clientY - rect.top) / Math.max(1, rect.height);
    this.pointer.lastClientX = e.clientX;
    this.pointer.lastClientY = e.clientY;
  }

  /** Virtual d-pad / touch buttons call this. */
  setTouchMove(x, y) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  clear() {
    this.keys.clear();
    this.pointer.down = false;
    this.pointer.secondaryDown = false;
    this.touchMove.x = 0;
    this.touchMove.y = 0;
  }

  /** Compute the current analogue flight input, merging keyboard and touch. */
  poll(assist, frame) {
    let x = this.touchMove.x;
    let y = this.touchMove.y;
    for (const code of this.keys) {
      const dir = MOVE_KEYS[code];
      if (dir) {
        x += dir[0];
        y += dir[1];
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.flight.x = x;
    this.flight.y = y;
    this.flight.boost = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    this.flight.brake = this.keys.has("KeyQ") || this.keys.has("KeyX") || this.keys.has("ControlLeft");
    this.flight.fire = this.keys.has("Space") || this.pointer.down;
    this.flight.secondary = this.pointer.secondaryDown;
    this.flight.assist = assist;
    if (frame) {
      const cx = this.pointer.x * frame.width;
      const cy = this.pointer.y * frame.height;
      if (this.pointer.active || this.pointer.touch) {
        this.flight.aim = { x: cx - frame.width / 2, y: cy - frame.height / 2 };
      } else {
        this.flight.aim = null;
      }
    }
    return this.flight;
  }

  /** Drain the event queue. */
  drain() {
    const events = this.events;
    this.events = [];
    return events;
  }
}