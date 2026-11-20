/**
 * Canvas framebuffer decoration: scanlines and vignette.
 *
 * These used to be CSS overlays, but a CSS repeating-gradient cannot share the
 * game's low-res pixel grid, so it looked like a filter on top of the art rather
 * than part of it. Drawing them into the framebuffer after the HUD keeps the CRT
 * effect honest at any window size. The DOM keeps only the containment frame.
 */
export function drawCrt(ctx, width, height) {
  // Scanlines: one dark row every three pixels.
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#02040a";
  for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
  ctx.restore();

  // Vignette.
  const g = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.34,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(2,4,10,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

/** Soft chromatic edge used on the title screen only. */
export function drawTitleEdge(ctx, width, height, time) {
  ctx.save();
  ctx.globalAlpha = 0.08 + Math.sin(time * 0.7) * 0.02;
  ctx.fillStyle = "#55e6d5";
  ctx.fillRect(0, 0, width, 1);
  ctx.fillRect(0, height - 1, width, 1);
  ctx.restore();
}
