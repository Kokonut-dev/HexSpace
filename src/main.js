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
} from "./config.js";
import { freshGame } from "./core/save.js";
import { buildWorld } from "./world/sector.js";
import { shipStats } from "./customization/fitting.js";
import { tickWorld } from "./systems/world-tick.js";
import { Input } from "./core/input.js";
import { AudioEngine, audio } from "./core/audio.js";
import { PixelFrame } from "./render/frame.js";
import { Art } from "./render/spritecache.js";
import { Game } from "./game.js";
import { UI } from "./ui/ui.js";
import { h } from "./ui/dom.js";
import { drawCrt, drawTitleEdge } from "./ui/canvasfx.js";

// Entry point
document.addEventListener("DOMContentLoaded", () => {
  // 1. Canvas & Frame
  const canvas = document.getElementById("hex-canvas");
  if (!canvas) {
    console.error("Canvas #hex-canvas not found");
    return;
  }
  const frame = new PixelFrame(canvas);

  // 2. Art cache
  const art = new Art();
  art.init();

  // 3. Input
  const input = new Input(canvas);

  // 4. Audio
  const audioEngine = new AudioEngine();
  audio.init = (settings) => audioEngine.init(settings);
  audio.setSound = (id, val) => audioEngine.setSound(id, val);
  audio.setVolume = (v) => audioEngine.setVolume(v);
  audio.setActive = (v) => audioEngine.setActive(v);
  audio.updateEngine = (opts) => audioEngine.updateEngine(opts);
  audio.play = (name) => audioEngine.play(name);

  // 5. UI
  const ui = new UI();
  ui.mount(document.getElementById("ui-root"));

  // 6. Render pipeline
  const render = {
    title: (ctx, frame, art, time) => {
      ctx.fillStyle = GAME.PAL.void;
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.fillStyle = GAME.PAL.white;
      ctx.font = "28px monospace";
      ctx.textAlign = "center";
      ctx.fillText("HEXSPACE", frame.width / 2, frame.height / 2 - 40);
      ctx.font = "14px monospace";
      ctx.fillText("FRONTIER OPERATIONS", frame.width / 2, frame.height / 2);
      drawTitleEdge(ctx, frame.width, frame.height, time);
    },
    flight: (ctx, frame, world, effects, art, opts) => {
      // Called from Game.render
    },
    station: (ctx, frame, interior, avatar, art, opts) => {
      // Called from Game.render
    },
    hud: (ctx, frame, world, game) => {
      // Called from Game.render
    },
    overlays: (ctx, frame, effects, opts) => {
      // Called from Game.render
      if (opts.scanlines) drawCrt(ctx, frame.width, frame.height);
    },
    map: (ctx, frame, state, opts) => {
      // Called from Game.render
    },
    sectorTint: (sector) => {
      const sec = GAME.SECURITY[sector.security];
      return sec ? sec.color : GAME.PAL.void;
    },
  };

  // 7. Game Orchestrator
  const game = new Game({
    ui,
    frame,
    input,
    art,
    render,
  });

  // 8. Loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Cap dt to prevent physics explosion on tab resume
    const step = Math.min(dt, GAME.maxCatchUp);

    game.update(step);
    game.render(step);

    requestAnimationFrame(loop);
  }

  // Boot
  game.boot();
  requestAnimationFrame(loop);

  // Resize handling
  window.addEventListener("resize", () => {
    frame.resize();
    ui.resize();
  });
});
