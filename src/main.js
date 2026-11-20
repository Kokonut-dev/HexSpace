import { GAME, PAL } from "./config.js";
import { Input } from "./core/input.js";
import { audio } from "./core/audio.js";
import { PixelFrame } from "./render/frame.js";
import { Art } from "./render/spritecache.js";
import { createStarfield } from "./render/starfield.js";
import { drawFlight, sectorTint } from "./render/flight.js";
import { drawStation } from "./render/stationview.js";
import { drawHud, drawOverlays } from "./render/hud.js";
import { drawGalaxyMap } from "./render/mapview.js";
import { Game } from "./game.js";
import { UI } from "./ui/ui.js";
import { drawTitleEdge } from "./ui/canvasfx.js";

// Entry point: all rendering, simulation, audio and persistence stay local to
// this document so the app can be served directly from a GitHub Pages root.
document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.getElementById("app");
  if (!appRoot) {
    console.error("HexSpace boot failed: #app root is missing.");
    return;
  }

  const ui = new UI(null, appRoot);
  const canvas = ui.els.canvas;
  const frame = new PixelFrame(canvas);
  const art = new Art().init();
  const input = new Input(canvas);

  let starfieldKey = "";
  const render = {
    title(ctx, view, _art, time) {
      ctx.fillStyle = PAL.void;
      ctx.fillRect(0, 0, view.width, view.height);
      ctx.fillStyle = PAL.white;
      ctx.font = "28px monospace";
      ctx.textAlign = "center";
      ctx.fillText(GAME.title, view.width / 2, view.height / 2 - 40);
      ctx.font = "14px monospace";
      ctx.fillText(GAME.subtitle, view.width / 2, view.height / 2);
      drawTitleEdge(ctx, view.width, view.height, time);
    },
    flight(ctx, view, world, effects, cache, opts) {
      const key = `${world.state.seed}:${world.sector.q},${world.sector.r}`;
      if (key !== starfieldKey) {
        cache.starfield = createStarfield((world.state.seed + world.sector.q * 7919 + world.sector.r * 104729) >>> 0);
        starfieldKey = key;
      }
      drawFlight(ctx, view, world, effects, cache, opts);
    },
    station: drawStation,
    hud: drawHud,
    overlays: drawOverlays,
    map: drawGalaxyMap,
    sectorTint,
  };

  const game = new Game({ ui, frame, input, art, render });
  ui.game = game;
  let lastTime = performance.now();
  let accumulator = 0;

  function loop(now) {
    const elapsed = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    // Fixed 60 Hz simulation with a bounded catch-up window after a suspended
    // tab. Rendering remains once per browser frame.
    accumulator += Math.min(elapsed, GAME.maxCatchUp);
    let steps = 0;
    while (accumulator >= GAME.tick && steps < 15) {
      game.update(GAME.tick);
      accumulator -= GAME.tick;
      steps++;
    }
    if (steps === 15 && accumulator >= GAME.tick) accumulator %= GAME.tick;
    game.render(elapsed);
    requestAnimationFrame(loop);
  }

  game.boot();
  requestAnimationFrame(loop);

  const resize = () => {
    frame.resize();
    ui.resize?.();
  };
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", () => game.save(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") game.save(true);
  });
});
