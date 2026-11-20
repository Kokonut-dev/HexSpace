import { Game } from "./core/game.js";
import { setup, render } from "./core/render.js";
import { toggleAudio } from "./core/audio.js";
import { sector, distance, key } from "./world/galaxy.js";
import { stats, modules, hulls } from "./customization/modules.js";
import { cargoCount, goods, price, trade, jobs } from "./systems/economy.js";
import { range } from "./systems/flight.js";
const $ = (id) => document.getElementById(id),
  set = (id, value) => {
    const n = $(id);
    if (n.textContent !== String(value)) n.textContent = value;
  };
const log = [],
  keys = new Set();
let view = "flight",
  mapSelection,
  scene,
  aim = null,
  pointerFire = false,
  until = 0,
  notice = "",
  nextHUD = 0,
  nextSave = 0;
function notify(text) {
  notice = text;
  until = performance.now() + 3600;
  log.unshift(text);
  $("log").replaceChildren(
    ...log
      .slice(0, 3)
      .map((s) =>
        Object.assign(document.createElement("div"), { textContent: "› " + s }),
      ),
  );
}
const game = new Game(notify),
  { d, p } = game;
const save = () =>
  set("save-status", game.save() ? "LOCAL SAVE SYNCED" : "SAVE UNAVAILABLE");
notify(d.docked ? "Station link established." : "Flight systems online.");
function button(label, fn, disabled = false) {
  const el = document.createElement("button");
  el.className = "action";
  el.textContent = label;
  el.disabled = disabled;
  el.onclick = fn;
  return el;
}
function para(parent, text) {
  const el = document.createElement("p");
  el.textContent = text;
  parent.append(el);
  return el;
}
function row(parent, title, desc, ...buttons) {
  const el = document.createElement("div");
  el.className = "row";
  const label = document.createElement("span"),
    small = document.createElement("small");
  label.textContent = title;
  small.textContent = desc;
  label.append(small);
  el.append(label, ...buttons);
  parent.append(el);
}
function open(next) {
  if (next === view && next !== "flight") next = "flight";
  view = next;
  keys.clear();
  pointerFire = false;
  mapSelection = game.s;
  drawOverlay();
  if (view !== "flight") $("overlay").querySelector("button")?.focus();
}
function drawOverlay() {
  const panel = $("overlay");
  panel.hidden = view === "flight";
  for (const b of document.querySelectorAll("[data-view]")) {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-pressed", String(b.dataset.view === view));
  }
  panel.replaceChildren();
  if (panel.hidden) return;
  const names = {
      map: "GALAXY CHART",
      fit: "SHIP OUTFITTING",
      market: "COMMODITY EXCHANGE",
      cantina: "CANTINA / CONTRACT BOARD",
      hq: "FACTION HEADQUARTERS",
    },
    head = document.createElement("div"),
    h = document.createElement("h2");
  head.className = "overlay-head";
  h.textContent = names[view];
  head.append(
    h,
    button("Close ×", () => open("flight")),
  );
  panel.append(head);
  const rows = document.createElement("div");
  rows.className = "rows";
  const action = (label, fn, disabled) =>
    button(
      label,
      () => {
        const message = fn();
        if (message) notify(message);
        save();
        drawOverlay();
        hud();
      },
      disabled,
    );
  if (view === "map") {
    para(
      panel,
      d.docked
        ? "Undock before initiating a jump."
        : "Select a nearby hex to calculate a jump.",
    );
    const ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 460 320");
    svg.setAttribute("class", "hexmap");
    svg.setAttribute("aria-label", "Nearby sectors");
    for (let q = -2; q <= 2; q++)
      for (let r = -2; r <= 2; r++) {
        if (distance({ q, r }) > 2) continue;
        const s = sector(game.s.q + q, game.s.r + r),
          x = 230 + q * 64 + r * 32,
          y = 160 + r * 54,
          g = document.createElementNS(ns, "g"),
          poly = document.createElementNS(ns, "polygon"),
          txt = document.createElementNS(ns, "text");
        g.setAttribute(
          "class",
          `${!q && !r ? "current " : ""}${key(s) === key(mapSelection) ? "selected " : ""}${distance(s, game.s) > 1 + game.fit.warp ? "remote" : ""}`,
        );
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", s.name);
        poly.setAttribute(
          "points",
          Array.from({ length: 6 }, (_, i) => {
            const a = ((i * 60 + 30) * Math.PI) / 180;
            return `${x + Math.cos(a) * 35},${y + Math.sin(a) * 35}`;
          }).join(" "),
        );
        txt.setAttribute("x", x);
        txt.setAttribute("y", y + 3);
        txt.setAttribute("text-anchor", "middle");
        txt.textContent = !q && !r ? "YOU" : `${s.q},${s.r}`;
        const select = () => {
          mapSelection = s;
          drawOverlay();
          $("overlay").querySelector(".hexmap .selected")?.focus();
        };
        g.onclick = select;
        g.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select();
          }
        };
        g.append(poly, txt);
        svg.append(g);
      }
    panel.append(svg);
    const s = mapSelection,
      n = distance(s, game.s);
    row(
      rows,
      s.name,
      `${s.security} security · ${s.faction} · Resources ${s.richness}%`,
      button(
        "Initiate jump",
        () => {
          if (game.jump(s)) {
            open("flight");
            save();
            hud();
          }
        },
        d.docked || n === 0 || n > 1 + game.fit.warp,
      ),
    );
  } else if (view === "fit") {
    const st = game.fit;
    para(
      panel,
      `${st.draw}/${st.power} MW · ${st.mass} t · ${st.thrust} thrust · ${st.cooling}/s cooling · ${st.cargo} cargo. ${d.docked ? "Select a module to refit." : "Dock to purchase or install equipment."}`,
    );
    const schematic = document.createElement("div");
    schematic.className = "schematic";
    for (const [slot, id] of Object.entries(d.fit)) {
      const mount = document.createElement("div");
      mount.dataset.slot = slot;
      const icon = document.createElement("b");
      icon.textContent = {
        weapon: "✦",
        defense: "◈",
        engine: "▲",
        reactor: "⬡",
        utility: "◇",
      }[slot];
      const label = document.createElement("span");
      label.textContent = id ? modules[id][0] : "Empty utility";
      mount.append(icon, label);
      schematic.append(mount);
    }
    panel.append(schematic);
    for (const [id, h] of Object.entries(hulls))
      row(
        rows,
        h.name,
        `${h.label} · ${h.hull} hull · ${h.cargo} cargo`,
        action(
          d.ship === id
            ? "Active hull"
            : d.owned.includes(id) || !h.price
              ? "Switch"
              : `${h.price} CR`,
          () => game.purchaseHull(id),
          !d.docked || d.ship === id,
        ),
      );
    for (const [id, [name, slot, price, mass, draw, mods]] of Object.entries(
      modules,
    )) {
      const active = d.fit[slot] === id;
      const remove = active && slot === "utility";
      const projected = stats({ ...d.fit, [slot]: remove ? null : id }, d.ship);
      row(
        rows,
        name,
        `${slot} · ${mass} t · ${draw} MW · ${Object.entries(mods)
          .map(([k, v]) => `${v} ${k}`)
          .join(
            ", ",
          )}${projected.draw > projected.power ? " · Power overload" : ""}`,
        action(
          remove
            ? "Remove"
            : active
              ? "Installed"
              : d.owned.includes(id) || !price
                ? "Equip"
                : `${price} CR`,
          () => game.equip(remove ? null : id, slot),
          !d.docked || (active && !remove) || projected.draw > projected.power,
        ),
      );
    }
    row(
      rows,
      "Hull repairs",
      "Restore full integrity for 60 CR.",
      action(
        "Repair",
        () => {
          if (d.credits < 60) return "Insufficient credits.";
          d.credits -= 60;
          p.hp = st.hull;
          return "Hull restored.";
        },
        !d.docked || p.hp >= st.hull,
      ),
    );
  } else if (view === "market") {
    para(
      panel,
      `Available cargo: ${game.fit.cargo - cargoCount(d)} units. Local quotes respond to demand.`,
    );
    for (const [id, [name]] of Object.entries(goods)) {
      const cost = price(d, game.s, id);
      const go = (buy) =>
        trade(d, game.s, id, buy, game.fit.cargo)
          ? `${buy ? "Bought" : "Sold"} ${name}.`
          : "Trade unavailable.";
      row(
        rows,
        name,
        `${d.cargo[id]} in hold`,
        action(
          `Buy ${cost}`,
          () => go(true),
          d.credits < cost || cargoCount(d) >= game.fit.cargo,
        ),
        action(
          `Sell ${Math.floor(cost * 0.78)}`,
          () => go(false),
          !d.cargo[id],
        ),
      );
    }
  } else if (view === "cantina") {
    para(
      panel,
      "Dispatch officer: “Distress beacons are common along the border. Keep a cool reactor and an exit vector.”",
    );
    const board = Object.keys(jobs),
      rotation = (game.s.richness + d.clock) % board.length;
    for (const type of [
      ...board.slice(rotation),
      ...board.slice(0, rotation),
    ]) {
      const [name, desc, amount] = jobs[type];
      row(
        rows,
        name,
        `${desc} · ${amount} CR`,
        action(
          d.quest?.type === type ? "Accepted" : "Accept",
          () => {
            d.quest = { type, origin: key(game.s), done: false };
            return "Contract accepted.";
          },
          !!d.quest,
        ),
      );
    }
    row(
      rows,
      "Hire a wingmate",
      "A mercenary provides fire support in combat.",
      action(
        d.hired ? "Hired" : "Hire · 320 CR",
        () => {
          d.hired = true;
          d.credits -= 320;
          return "Mercenary enlisted.";
        },
        d.hired || d.credits < 320,
      ),
    );
  } else if (view === "hq") {
    para(panel, `${game.s.faction} reputation: ${d.rep[game.s.faction] ?? 0}.`);
    if (d.quest) {
      const [name, desc] = jobs[d.quest.type];
      row(
        rows,
        name,
        desc,
        action("Turn in", () => game.claim()),
      );
    } else
      para(panel, "No active contracts. Check the cantina for available work.");
  }
  panel.append(rows);
}
let contactSignature = "";
function hud() {
  const s = game.s,
    objs = game.objects.filter((o) => !o.dead);
  set("location", s.name);
  set("designation", s.depth ? `HEX ${s.q}, ${s.r}` : "SECTOR 01");
  set(
    "location-info",
    `${s.depth ? "Frontier corridor" : "Trade corridor"} · ${s.faction} territory`,
  );
  $("security").dataset.level = s.security.toLowerCase();
  $("security").lastChild.textContent = ` ${s.security.toUpperCase()} SECURITY`;
  set("credits", d.credits.toLocaleString());
  set("live-mode", d.docked ? "DOCKED / ON FOOT" : "LIVE FLIGHT");
  $("assist").disabled = d.docked;
  $("assist").setAttribute("aria-pressed", String(d.assist));
  $("assist").lastElementChild.textContent = d.assist ? "ON" : "OFF";
  set("coords", `X ${Math.round(p.x)}   Y ${Math.round(p.y)}`);
  set(
    "speed",
    d.docked ? "BERTH SECURE" : `${Math.round(Math.hypot(p.vx, p.vy))} M/S`,
  );
  set("cargo", `${cargoCount(d)} / ${game.fit.cargo}`);
  set("ship-name", hulls[d.ship].name);
  set("ship-class", hulls[d.ship].label.toUpperCase());
  for (const [id, v] of [
    ["shield", game.fit.shield ? (100 * p.shield) / game.fit.shield : 0],
    ["hull", (100 * p.hp) / game.fit.hull],
    ["heat", p.heat],
  ]) {
    $(id).value = v;
    set(`${id}-value`, `${Math.round(v)}%`);
  }
  const q = d.quest;
  set("quest-type", q ? "ACTIVE CONTRACT" : "FLIGHT DIRECTIVE");
  set(
    "quest-title",
    q ? jobs[q.type][0] : d.docked ? "Visit the cantina" : "Make port",
  );
  set(
    "quest-body",
    q
      ? jobs[q.type][1]
      : d.docked
        ? "Walk to a service terminal and press E."
        : `Approach ${s.station} and press E to dock.`,
  );
  $("track").disabled = d.docked;
  const sig = objs.map((o) => `${o.name}:${o.id}`).join("|");
  if (sig !== contactSignature) {
    contactSignature = sig;
    $("contacts").replaceChildren(
      ...objs.map((o) => {
        const b = button("", () => {
          game.target = o.id;
          notify(`Tracking ${o.name}.`);
          hud();
        });
        b.dataset.contact = o.id;
        b.className = "contact";
        const icon = document.createElement("b");
        icon.style.color = o.color;
        icon.textContent = o.icon ?? "▲";
        const t = document.createElement("span");
        t.textContent = o.name;
        b.append(icon, t, document.createElement("small"));
        return b;
      }),
    );
  }
  set("count", String(objs.length).padStart(2, "0"));
  for (const b of $("contacts").children) {
    const o = objs.find((o) => o.id === b.dataset.contact);
    b.classList.toggle("selected", o.id === game.target);
    b.setAttribute("aria-pressed", String(o.id === game.target));
    b.lastChild.textContent = `${(range(o, p) / 100).toFixed(1)} KM`;
  }
  const c = $("radar").getContext("2d");
  c.clearRect(0, 0, 200, 200);
  c.strokeStyle = "#284658";
  c.lineWidth = 1;
  for (const r of [23, 46, 69, 92]) {
    c.beginPath();
    c.arc(100, 100, r, 0, 7);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(8, 100);
  c.lineTo(192, 100);
  c.moveTo(100, 8);
  c.lineTo(100, 192);
  c.stroke();
  const a = performance.now() * 0.0012;
  c.strokeStyle = "#54cbbb70";
  c.beginPath();
  c.moveTo(100, 100);
  c.lineTo(100 + Math.cos(a) * 92, 100 + Math.sin(a) * 92);
  c.stroke();
  for (const o of objs) {
    const r = range(o, p),
      scale = Math.min(0.28, 86 / (r || 1)),
      x = 100 + (o.x - p.x) * scale,
      y = 100 + (o.y - p.y) * scale;
    c.fillStyle = o.color;
    c.fillRect(x - 2, y - 2, 5, 5);
    if (o.id === game.target) c.strokeRect(x - 5, y - 5, 11, 11);
  }
  c.fillStyle = "#ecffff";
  c.fillRect(98, 98, 4, 4);
}
function interact() {
  if (view !== "flight") return;
  const result = game.interact();
  if (result) open(result);
  save();
  hud();
}
for (const b of document.querySelectorAll("[data-view]")) {
  b.setAttribute("aria-label", b.textContent.trim());
  b.onclick = () => open(b.dataset.view);
}
$("assist").onclick = () => {
  d.assist = !d.assist;
  hud();
  save();
};
$("sound").onclick = () => {
  $("sound").setAttribute("aria-pressed", String(toggleAudio()));
};
$("track").onclick = () => {
  game.target =
    d.quest?.type === "raider" &&
    !d.quest.done &&
    !game.objects.find((o) => o.id === "raider")?.dead
      ? "raider"
      : d.quest?.type === "ore" &&
          d.cargo.ore < 3 &&
          !game.objects.find((o) => o.id === "ore")?.dead
        ? "ore"
        : "station";
  notify(
    `Tracking ${game.objects.find((o) => o.id === game.target)?.name ?? game.s.station}.`,
  );
  hud();
};
const kmap = { ArrowUp: "w", ArrowLeft: "a", ArrowDown: "s", ArrowRight: "d" };
window.addEventListener("keydown", (e) => {
  if (e.altKey || e.metaKey || e.ctrlKey) return;
  const k = kmap[e.key] ?? e.key.toLowerCase();
  if (k === "escape") {
    open("flight");
    return;
  }
  if (k === "m" && !e.repeat) {
    open("map");
    return;
  }
  if (
    view !== "flight" ||
    (e.target.closest?.("button") && (k === " " || k === "enter"))
  )
    return;
  if (!["w", "a", "s", "d", " ", "e"].includes(k)) return;
  e.preventDefault();
  keys.add(k);
  if (!e.repeat && k === "e") interact();
});
window.addEventListener("keyup", (e) =>
  keys.delete(kmap[e.key] ?? e.key.toLowerCase()),
);
window.addEventListener("blur", () => {
  keys.clear();
  pointerFire = false;
});
window.addEventListener("pagehide", save);
for (const b of document.querySelectorAll("[data-key]")) {
  const k = b.dataset.key;
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(k);
    if (k === "e") interact();
  };
  for (const n of ["onpointerup", "onpointercancel", "onlostpointercapture"])
    b[n] = () => keys.delete(k);
  b.onclick = (e) => {
    if (e.detail === 0 && k === "e") interact();
  };
}
const surface = $("game");
function pointer(e) {
  const r = surface.getBoundingClientRect();
  aim = {
    x: e.clientX - r.left - r.width / 2,
    y: e.clientY - r.top - r.height / 2,
  };
}
surface.onpointermove = pointer;
surface.onpointerdown = (e) => {
  if (e.button !== 0) return;
  document.activeElement?.blur();
  pointer(e);
  pointerFire = e.pointerType === "mouse";
  surface.setPointerCapture(e.pointerId);
};
surface.onpointerleave = () => {
  aim = null;
  pointerFire = false;
};
surface.onpointerup = surface.onpointercancel = () => {
  pointerFire = false;
};
new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "game",
  transparent: true,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: surface.clientWidth,
    height: surface.clientHeight,
  },
  input: { keyboard: false, mouse: false, touch: false },
  scene: {
    create() {
      scene = this;
      setup(this);
      render(this, game, 0);
    },
    update(t, ms) {
      if (view === "flight")
        game.update(Math.min(0.034, ms / 1000), {
          x: Number(keys.has("d")) - Number(keys.has("a")),
          y: Number(keys.has("s")) - Number(keys.has("w")),
          aim,
          fire: keys.has(" ") || pointerFire,
        });
      render(this, game, t);
      if (t >= nextHUD) {
        nextHUD = t + 110;
        hud();
        const text = performance.now() < until ? notice : game.prompt();
        $("toast").hidden = !text;
        set("toast", text);
      }
      if (t >= nextSave) {
        nextSave = t + 6500;
        save();
      }
    },
  },
});
new ResizeObserver(() => {
  if (
    scene &&
    (scene.scale.width !== surface.clientWidth ||
      scene.scale.height !== surface.clientHeight)
  )
    scene.scale.resize(surface.clientWidth, surface.clientHeight);
}).observe(surface);
hud();
