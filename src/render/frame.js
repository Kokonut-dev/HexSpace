/**
 * Pixel framebuffer.
 *
 * World and UI geometry use a stable logical coordinate system, rasterized at
 * near display-pixel density before being blitted to the visible canvas. This
 * preserves layout while avoiding the large blocks of a fixed 270p output.
 */
import { GAME } from "../config.js";

export class PixelFrame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.buffer = document.createElement("canvas");
    this.bctx = this.buffer.getContext("2d", { alpha: false });
    this.width = 480;
    this.height = GAME.framebufferHeight;
    this.pixelRatio = GAME.framebufferDensity ?? 2;
    this.scale = 1;
    this.dpr = 1;
    this.camera = { x: 0, y: 0 };
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.height = GAME.framebufferHeight;
    const aspect = cssW / Math.max(1, cssH);
    this.width = Math.round(
      Math.max(
        GAME.framebufferWidthMin,
        Math.min(GAME.framebufferWidthMax, this.height * aspect),
      ),
    );
    this.scale = cssH / this.height;
    // Match the backing resolution to display pixels (up to 4x logical). The
    // previous fixed 270p raster expanded each logical pixel into a large block.
    this.pixelRatio = Math.max(
      GAME.framebufferDensity ?? 2,
      Math.min(4, this.scale * dpr),
    );
    this.buffer.width = Math.ceil(this.width * this.pixelRatio);
    this.buffer.height = Math.ceil(this.height * this.pixelRatio);
    this.bctx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingEnabled = false;
    // Browsers round canvas blits; keep the letterbox integer to avoid seams.
    this.offsetX = (cssW - this.width * this.scale) / 2;
    return this;
  }

  /** World camera centred on a point, snapped to whole pixels. */
  follow(x, y) {
    this.camera.x = Math.round(x);
    this.camera.y = Math.round(y);
    return this.camera;
  }

  worldToScreen(x, y) {
    return {
      x: Math.round(x - this.camera.x + this.width / 2),
      y: Math.round(y - this.camera.y + this.height / 2),
    };
  }

  screenToWorld(x, y) {
    return {
      x: x - this.width / 2 + this.camera.x,
      y: y - this.height / 2 + this.camera.y,
    };
  }

  begin() {
    const c = this.bctx;
    c.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    return c;
  }

  /** Blit the buffer to the visible canvas. */
  present() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#04060c";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(
      this.buffer,
      0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio,
      Math.round(this.offsetX * this.dpr),
      0,
      Math.round(this.width * this.scale * this.dpr),
      Math.round(this.height * this.scale * this.dpr),
    );
  }
}

/** Filled polygon helper used across ship and asteroid art. */
export function poly(ctx, pts, fill, stroke, lineWidth = 1) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function rect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function circle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Small pixel text drawn with the browser font at exact pixel sizes. */
export function text(ctx, str, x, y, opts = {}) {
  const { size = 7, color = "#dff4ff", align = "left", baseline = "top", font = "mono", shadow = null, alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${font === "mono" ? '"Courier New", ui-monospace, monospace' : '"Trebuchet MS", system-ui, sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
    ctx.fillStyle = color;
  }
  ctx.fillText(str, Math.round(x), Math.round(y));
  ctx.restore();
}

/** Word-wrap into lines that fit a pixel width. */
export function wrap(ctx, str, maxWidth, size = 7) {
  ctx.save();
  ctx.font = `${size}px "Courier New", ui-monospace, monospace`;
  const words = str.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines;
}

export function glowCircle(ctx, x, y, r, color, alpha = 0.5) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
