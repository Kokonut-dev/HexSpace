import { rng } from "../world/galaxy.js";

const random = rng(73),
  dust = Array.from({ length: 180 }, () => [random(), random(), random()]);
const cols = {
  station: 0x65e5db,
  ore: 0xf1b57b,
  signal: 0xb09bff,
  wreck: 0xb09bff,
  raider: 0xff7985,
};
function texture(scene, key, w, h, rows, palette) {
  const t = scene.textures.createCanvas(key, w, h),
    c = t.context;
  rows.forEach((row, y) =>
    [...row].forEach((v, x) => {
      if (palette[v]) {
        c.fillStyle = palette[v];
        c.fillRect(x, y, 1, 1);
      }
    }),
  );
  t.refresh();
}
export function setup(scene) {
  texture(
    scene,
    "ship",
    19,
    19,
    [
      ".........W.........",
      ".........W.........",
      "........WLW........",
      "........WLW........",
      ".......DWCWD.......",
      ".......DWCWD.......",
      "......DWWCWWD......",
      "...D..DWCBCWD..D...",
      "...D.DWWCBCWWD.D...",
      "..DDDDWWCBCWWDDDD..",
      "..DLDWWWCBCWWW DLD..".replace(" ", ""),
      ".DDLWWWDCCCDWWWLDD.",
      ".DWLWWDDWWWD DWWLWD.".replace(" ", ""),
      "DDWWDDDWWWWWDDDWWDD",
      "DDWDDDDDWWWDDDDDWDD",
      "..D...DDBBBDD...D..",
      "......DCLLCD.......",
      ".......CLLC........",
      "........LL.........",
    ],
    { W: "#d9eaff", D: "#42617d", L: "#8efbff", C: "#2aa7ba", B: "#123a60" },
  );
  texture(
    scene,
    "pilot",
    8,
    11,
    [
      "..HHHH..",
      ".HWWWHH.",
      ".HWCWHH.",
      "..HHHH..",
      ".DCCCCD.",
      "DDCCCCDD",
      "..CCCC..",
      "..DDDD..",
      "..D..D..",
      ".DD..DD.",
      ".DD..DD.",
    ],
    { H: "#b7d0ed", W: "#effaff", C: "#69e4da", D: "#365773" },
  );
  scene.g = scene.add.graphics();
  scene.sprites = new Map();
  scene.labels = new Map();
}
function sprite(sc, id, key, x, y, scale, rot, tint) {
  let s = sc.sprites.get(id);
  if (!s) {
    s = sc.add.image(x, y, key).setDepth(2);
    sc.sprites.set(id, s);
  }
  s.setVisible(true).setPosition(x, y).setScale(scale).setRotation(rot);
  if (tint) s.setTint(tint);
  else s.clearTint();
}
function text(sc, id, value, x, y, color = "#d9eafa") {
  let t = sc.labels.get(id);
  if (!t) {
    t = sc.add
      .text(x, y, value, {
        fontFamily: "monospace",
        fontSize: "10px",
        color,
        backgroundColor: "#0a1424",
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(3);
    sc.labels.set(id, t);
  }
  t.setVisible(true).setPosition(x, y).setText(value).setColor(color);
}
function rock(g, x, y, s, seed) {
  const rnd = rng(seed),
    pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      r = s * (0.76 + rnd() * 0.26);
    pts.push({
      x: x + Math.round(Math.cos(a) * r),
      y: y + Math.round(Math.sin(a) * r),
    });
  }
  g.fillStyle(0x20273e).fillPoints(pts, true);
  g.lineStyle(1, 0x53617a).strokePoints(pts, true);
  for (let i = 0; i < 5; i++) {
    const dx = (rnd() - 0.5) * s,
      dy = (rnd() - 0.5) * s;
    g.fillStyle(i % 2 ? 0x374058 : 0x151e32).fillRect(
      Math.round(x + dx),
      Math.round(y + dy),
      Math.max(2, s * 0.24),
      Math.max(2, s * 0.14),
    );
  }
}
export function metrics(sc) {
  const w = sc.scale.width,
    h = sc.scale.height;
  return { w, h, z: Math.min(1.12, w / 645, h / 435), cx: w / 2, cy: h / 2 };
}
export function render(sc, a, t) {
  const { w, h, z, cx, cy } = metrics(sc),
    g = sc.g,
    p = a.p;
  g.clear();
  for (const v of sc.sprites.values()) v.setVisible(false);
  for (const v of sc.labels.values()) v.setVisible(false);
  if (a.d.docked) {
    const X = (x) => Math.round(cx + x * z),
      Y = (y) => Math.round(cy + y * z);
    g.fillStyle(0x080e1b).fillRect(0, 0, w, h);
    g.fillStyle(0x202d43).fillRect(X(-205), Y(-158), 410 * z, 316 * z);
    g.fillStyle(0x111c30).fillRect(X(-198), Y(-151), 396 * z, 302 * z);
    for (let x = -192; x < 198; x += 16)
      for (let y = -145; y < 151; y += 16) {
        g.fillStyle((x + y) % 32 === 0 ? 0x1a263b : 0x162238).fillRect(
          X(x),
          Y(y),
          15 * z,
          15 * z,
        );
      }
    for (const r of a.rooms) {
      if (r.id !== "exit") {
        g.fillStyle(r.color, 0.12).fillRect(
          X(r.x - 62),
          Y(r.y - 49),
          124 * z,
          98 * z,
        );
        g.lineStyle(1, r.color, 0.45).strokeRect(
          X(r.x - 62),
          Y(r.y - 49),
          124 * z,
          98 * z,
        );
        sprite(
          sc,
          r.id + "npc",
          "pilot",
          X(r.x + 18),
          Y(r.y + 15),
          1.5 * z,
          0,
          r.color,
        );
      }
      text(sc, r.id, r.name, X(r.x), Y(r.y - 12));
    }
    // Offset each prop shadow away from the moving suit lamp. Layered
    // low-opacity rings keep lighting visible in the Canvas fallback.
    const lampX = X(a.avatar.x),
      lampY = Y(a.avatar.y);
    for (let level = 4; level > 0; level--)
      g.fillStyle(0x72eddf, 0.022).fillCircle(lampX, lampY, level * 16 * z);
    for (const o of a.props) {
      const dx = o.x - a.avatar.x,
        dy = o.y - a.avatar.y;
      const length = Math.hypot(dx, dy) || 1;
      const sx = (dx / length) * 13,
        sy = (dy / length) * 13;
      g.fillStyle(0x030611, 0.56).fillPoints(
        [
          { x: X(o.x - 9), y: Y(o.y + 5) },
          { x: X(o.x + 9), y: Y(o.y + 5) },
          { x: X(o.x + 9 + sx), y: Y(o.y + 5 + sy) },
          { x: X(o.x - 9 + sx), y: Y(o.y + 5 + sy) },
        ],
        true,
      );
      g.fillStyle([0x605177, 0x3c6570, 0x6a584c][o.kind]).fillRect(
        X(o.x - 9),
        Y(o.y - 6),
        18 * z,
        12 * z,
      );
    }
    sprite(sc, "avatar", "pilot", X(a.avatar.x), Y(a.avatar.y), 2.3 * z, 0);
    return;
  }
  const X = (x) => Math.round(cx + (x - p.x) * z),
    Y = (y) => Math.round(cy + (y - p.y) * z);
  if (a.cloud) {
    const cloud = a.cloud;
    for (let layer = 0; layer < 6; layer++)
      g.fillStyle(0xa773e4, 0.043).fillCircle(
        X(cloud.x),
        Y(cloud.y),
        (cloud.radius - layer * 11) * z,
      );
    g.lineStyle(1, 0xa773e4, 0.27).strokeCircle(
      X(cloud.x),
      Y(cloud.y),
      cloud.radius * z,
    );
    text(
      sc,
      "nebula",
      "ION NEBULA · COOLING REDUCED",
      X(cloud.x),
      Y(cloud.y + cloud.radius),
    );
  }
  for (const [u, v, m] of dust) {
    const x = (((u * w - p.x * (0.03 + m * 0.13)) % w) + w) % w,
      y = (((v * h - p.y * (0.03 + m * 0.13)) % h) + h) % h;
    g.fillStyle(m > 0.88 ? 0x9ecfff : 0x607ca9, 0.19 + m * 0.48).fillRect(
      Math.round(x),
      Math.round(y),
      m > 0.88 ? 2 : 1,
      m > 0.88 ? 2 : 1,
    );
  }
  g.lineStyle(1, 0x58749c, 0.12);
  for (let i = -4; i < 5; i++) {
    const x = X(Math.floor(p.x / 96) * 96 + i * 96),
      y = Y(Math.floor(p.y / 96) * 96 + i * 96);
    g.lineBetween(x, 0, x, h);
    g.lineBetween(0, y, w, y);
  }
  for (const o of a.objects) {
    if (o.dead) continue;
    const x = X(o.x),
      y = Y(o.y),
      c = cols[o.type];
    if (x < -80 || x > w + 80 || y < -60 || y > h + 65) continue;
    if (a.target === o.id) {
      g.lineStyle(1, c, 0.19).lineBetween(cx, cy, x, y);
      g.lineStyle(1, c, 0.72).strokeCircle(x, y, 29 * z);
    }
    if (o.type === "station") {
      g.fillStyle(c, 0.08).fillCircle(x, y, 48 * z);
      g.lineStyle(1, c, 0.35).strokeCircle(x, y, 38 * z);
      g.fillStyle(0x39576b).fillRect(x - 31 * z, y - 7 * z, 62 * z, 14 * z);
      g.fillStyle(0x243b52).fillRect(x - 14 * z, y - 23 * z, 28 * z, 46 * z);
      g.lineStyle(2, 0x8aafcb).strokeRect(
        x - 12 * z,
        y - 19 * z,
        24 * z,
        38 * z,
      );
      for (let i = -1; i <= 1; i++)
        g.fillStyle(i === 0 ? c : 0x6599ad).fillRect(
          x + i * 19 * z - 4 * z,
          y - 3 * z,
          8 * z,
          6 * z,
        );
    } else if (o.type === "ore") {
      [
        [0, 0, 20],
        [-27, 12, 10],
        [19, -18, 10],
        [28, 8, 7],
        [-19, -18, 7],
        [-41, -7, 4],
        [41, 19, 6],
      ].forEach(([dx, dy, s], i) =>
        rock(g, x + dx * z, y + dy * z, s * z, i + 30),
      );
    } else if (o.type === "raider") {
      sprite(
        sc,
        o.id,
        "ship",
        x,
        y,
        1.65 * z,
        Math.atan2(p.y - o.y, p.x - o.x) + Math.PI / 2,
        0xff7785,
      );
      g.fillStyle(c, 0.08).fillCircle(x, y, 24 * z);
    } else {
      g.fillStyle(c, 0.1).fillCircle(x, y, 28 * z);
      g.lineStyle(1, c, 0.48).strokeCircle(
        x,
        y,
        (17 + Math.sin(t * 0.003) * 4) * z,
      );
      g.lineStyle(1, c, 0.24).strokeCircle(x, y, 28 * z);
      g.fillStyle(c).fillRect(x - 2, y - 2, 4, 4);
    }
    text(sc, o.id, o.name, x, y + 40 * z, o.color);
  }
  for (const b of a.particles) {
    g.fillStyle(b.color, b.life / b.max).fillRect(
      X(b.x),
      Y(b.y),
      b.size,
      b.size,
    );
  }
  for (const b of a.bullets) {
    g.lineStyle(2, b.enemy ? 0xff7581 : 0x8dfff5, 0.95).lineBetween(
      X(b.x),
      Y(b.y),
      X(b.x - b.vx * 0.024),
      Y(b.y - b.vy * 0.024),
    );
  }
  if (a.d.hired && a.d.wingOrder !== "hold") {
    const side = Math.sin(t * 0.002) * 5;
    sprite(
      sc,
      "wingmate",
      "ship",
      cx - (42 + side) * z,
      cy + 30 * z,
      1.35 * z,
      p.angle + Math.PI / 2,
      0xc4ffa9,
    );
  }
  const scale =
    a.d.ship === "argosy" ? 3.15 : a.d.ship === "vanguard" ? 2.55 : 2.2;
  if (a.d.ship === "argosy")
    for (const sign of [-1, 1]) {
      const ox = -Math.sin(p.angle) * 21 * z * sign,
        oy = Math.cos(p.angle) * 21 * z * sign;
      sprite(
        sc,
        "pod" + sign,
        "ship",
        cx + ox,
        cy + oy,
        1.24 * z,
        p.angle + Math.PI / 2,
        0xa5d9ff,
      );
    }
  g.fillStyle(0x56dcff, 0.08).fillCircle(cx, cy, 31 * z);
  g.lineStyle(1, 0x70f0e5, 0.34).strokeCircle(cx, cy, 33 * z);
  sprite(
    sc,
    "player",
    "ship",
    cx,
    cy,
    scale * z,
    p.angle + Math.PI / 2,
    a.d.fit.weapon === "plasma" ? 0xe3aaff : null,
  );
  if (a.d.fit.weapon !== "cannon" || a.d.fit.engine !== "ion") {
    const side = a.d.fit.engine !== "ion" ? 14 : 9;
    for (const sign of [-1, 1]) {
      const xx = cx - Math.sin(p.angle) * side * sign * z,
        yy = cy + Math.cos(p.angle) * side * sign * z;
      g.fillStyle(a.d.fit.engine !== "ion" ? 0x77dcff : 0xc9aeff).fillRect(
        xx - 2,
        yy - 2,
        4,
        4,
      );
    }
  }
}
