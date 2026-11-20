/**
 * UI: DOM chrome (top bar, touch controls, toasts) plus every modal screen.
 *
 * The canvas owns the game world; the DOM owns text. Both read the same state.
 * Screens are plain builder functions returning elements, which makes them easy
 * to re-render after any state change and trivial to extend.
 */
import { h, button, row, stat, tag, bar, tabs, empty, kv, num, icon } from "./dom.js";
import {
  GOODS,
  FACTIONS,
  HULLS,
  MODULES,
  SHIP_RANKS,
  JOBS,
  STORY,
  CONSUMABLES,
  SECURITY,
  ECONOMIES,
  ITEMS,
  GAME,
} from "../config.js";
import { slotLayout, shipStats, canInstall, statDiff, STAT_LABEL, repairQuote, hullPrice, canBuyHull, rankOf, moduleById } from "../customization/fitting.js";
import { priceAt, marketFor, standingLabel, refuelQuote, goodStatusFor, canSellHere, cargoUsed } from "../systems/economy.js";
import { missionProgressText, storyCardState, rankFromXp } from "../systems/missions.js";
import { hexToPixel, hexPolygon, hexDistance, hexLine } from "../world/hex.js";
import { generateSector, jumpWarpCost, canJump } from "../world/galaxy.js";
import { fmt, fmtCredits, clamp } from "../core/utils.js";

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.els = {};
    this.screenStack = [];
    this.activeScreen = null;
    this.mapCursor = null;
    this.buildChrome();
  }

  /* ── Chrome ─────────────────────────────────────────────────────────── */

  buildChrome() {
    const root = this.root;
    root.replaceChildren();

    // Canvas stage.
    const stage = h("div", { class: "stage" }, [
      h("canvas", { id: "game-canvas", "aria-label": "Space flight and station viewport", role: "img" }),
    ]);
    this.els.stage = stage;
    const canvasEl = stage.querySelector("canvas") || document.createElement("canvas");
    stage.append(canvasEl);
    this.els.canvas = canvasEl;

    // Top bar.
    const top = h("header", { class: "topbar" }, [
      h("div", { class: "brand" }, [
        h("span", { class: "brand-mark" }, "⬡"),
        h("span", { class: "brand-text" }, [h("b", null, "HEX"), h("b", { class: "accent" }, "SPACE"), h("small", null, "FRONTIER OPERATIONS")]),
      ]),
      h("div", { class: "sector-chip", id: "sector-chip" }, [
        h("span", { class: "chip-sec", id: "chip-security" }, "HIGH"),
        h("div", null, [h("b", { id: "chip-name" }, "Kepler Reach"), h("small", { id: "chip-sub" }, "United Systems · Trade Hub")]),
      ]),
      h("div", { class: "topbar-spacer" }),
      h("div", { class: "wallet", id: "wallet" }, [
        h("span", { class: "wallet-label" }, "CREDITS"),
        h("b", { id: "credits" }, "1,250"),
      ]),
      h("div", { class: "rank-chip", id: "rank-chip" }, [
        h("small", null, "RANK"),
        h("b", { id: "rank" }, "Rookie"),
        h("div", { class: "rank-bar" }, [h("i", { id: "rank-fill" })]),
      ]),
      h("div", { class: "top-actions" }, [
        h("button", { class: "icon-btn", id: "btn-map", title: "Galaxy chart (M)", "aria-label": "Open galaxy chart" }, "⬡"),
        h("button", { class: "icon-btn", id: "btn-fit", title: "Ship fitting", "aria-label": "Open ship fitting" }, "⚙"),
        h("button", { class: "icon-btn", id: "btn-codex", title: "Codex (C)", "aria-label": "Open codex" }, "▤"),
        h("button", { class: "icon-btn", id: "btn-menu", title: "Menu (Esc)", "aria-label": "Open menu" }, "☰"),
      ]),
    ]);
    this.els.top = top;

    // Objective rail (left) and log (right) — visible in flight.
    const objective = h("aside", { class: "objective-rail", id: "objective-rail" }, [
      h("div", { class: "rail-head" }, [h("i"), " ACTIVE CONTRACT"]),
      h("h4", { id: "obj-title" }, "No contract"),
      h("p", { id: "obj-desc" }, "Dock at Meridian Outpost and check the contract board."),
      h("div", { class: "rail-foot" }, [
        h("span", { id: "obj-target" }, "—"),
        h("button", { id: "obj-track", class: "link" }, "TRACK"),
      ]),
    ]);
    const logRail = h("aside", { class: "log-rail", id: "log-rail" }, [
      h("div", { class: "rail-head" }, [h("i"), " COMMS LOG"]),
      h("div", { id: "log" }),
    ]);

    // Bottom dock bar: ship status, assist, map, fire.
    const dock = h("footer", { class: "dockbar" }, [
      h("div", { class: "dock-status" }, [
        h("div", { class: "ship-badge" }, [h("b", { id: "dock-hull" }, "Kestrel"), h("small", { id: "dock-class" }, "Survey Shuttle")]),
        h("div", { class: "mini-meters" }, [
          h("label", null, ["HULL", h("i", { class: "mini", id: "mini-hull" })]),
          h("label", null, ["SHLD", h("i", { class: "mini", id: "mini-shield" })]),
          h("label", null, ["HEAT", h("i", { class: "mini", id: "mini-heat" })]),
        ]),
      ]),
      h("div", { class: "dock-actions" }, [
        h("button", { class: "chip-btn", id: "btn-assist", "aria-pressed": "true" }, "ASSIST ON"),
        h("button", { class: "chip-btn", id: "btn-target" }, "TARGET"),
        h("button", { class: "chip-btn", id: "btn-dock-map" }, "CHART"),
        h("button", { class: "chip-btn primary", id: "btn-interact" }, "INTERACT"),
      ]),
    ]);

    // Touch controls.
    const touch = h("div", { class: "touch-controls", "aria-label": "Touch flight controls" }, [
      h("div", { class: "dpad" }, [
        h("button", { "data-touch": "up", "aria-label": "Thrust forward" }, "▲"),
        h("button", { "data-touch": "left", "aria-label": "Thrust left" }, "◀"),
        h("button", { "data-touch": "brake", "aria-label": "Brake" }, "■"),
        h("button", { "data-touch": "right", "aria-label": "Thrust right" }, "▶"),
        h("button", { "data-touch": "down", "aria-label": "Thrust back" }, "▼"),
      ]),
      h("div", { class: "touch-actions" }, [
        h("button", { "data-touch": "interact", "aria-label": "Interact" }, "E"),
        h("button", { "data-touch": "fire", class: "fire", "aria-label": "Fire" }, "FIRE"),
        h("button", { "data-touch": "boost", "aria-label": "Afterburner" }, "BOOST"),
      ]),
    ]);

    this.els.toastWrap = h("div", { class: "toast-wrap", "aria-live": "polite" });
    this.els.savePill = h("div", { class: "save-pill", id: "save-pill" }, "LOCAL SAVE READY");
    this.els.perf = h("div", { class: "perf-pill", id: "perf-pill" }, "60 FPS");
    this.els.screenRoot = h("div", { class: "screen-root", id: "screen-root", hidden: true });
    this.els.titleRoot = h("div", { class: "title-root", id: "title-root" });

    root.append(
      stage,
      top,
      objective,
      logRail,
      dock,
      touch,
      this.els.toastWrap,
      this.els.savePill,
      this.els.perf,
      this.els.screenRoot,
      this.els.titleRoot,
    );

    this.wireChrome();
  }

  wireChrome() {
    // UI chrome is built immediately before Game, so defer resolving game
    // methods until an event fires (the constructor cycle is intentional).
    const ui = this;
    const g = new Proxy({}, {
      get(_target, key) {
        const value = ui.game?.[key];
        return typeof value === "function" ? value.bind(ui.game) : value;
      },
      set(_target, key, value) {
        if (ui.game) ui.game[key] = value;
        return true;
      },
    });
    const q = (id) => document.getElementById(id);
    q("btn-map").onclick = () => (g.screen === "map" ? g.closeScreen() : g.openMap());
    q("btn-dock-map").onclick = () => (g.screen === "map" ? g.closeScreen() : g.openMap());
    q("btn-fit").onclick = () => {
      if (g.state?.docked) g.openScreen("fit");
      else g.toastMessage("Dock at a station to refit.", "info");
    };
    q("btn-codex").onclick = () => (g.screen === "codex" ? g.closeScreen() : g.openScreen("codex"));
    q("btn-menu").onclick = () => g.openScreen(g.screen === "pause" ? null : "pause");
    q("btn-assist").onclick = () => {
      g.assist = !g.assist;
      q("btn-assist").textContent = g.assist ? "ASSIST ON" : "DRIFT";
      q("btn-assist").setAttribute("aria-pressed", String(g.assist));
    };
    q("btn-target").onclick = () => g.cycleTarget();
    q("btn-interact").onclick = () => g.interact();
    q("obj-track").onclick = () => g.openMap();

    // Touch: continuous thrust via pointer state.
    const held = new Set();
    const updateTouch = () => {
      const x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const y = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
      g.input.setTouchMove(x, y);
      g.input.keys.delete("ShiftLeft");
      if (held.has("boost")) g.input.keys.add("ShiftLeft");
      if (held.has("fire")) g.input.pointer.down = true;
      else if (!g.input.pointer.touchDownConsumed) g.input.pointer.down = false;
    };
    for (const b of document.querySelectorAll("[data-touch]")) {
      const key = b.dataset.touch;
      const press = (e) => {
        e.preventDefault();
        if (key === "interact") {
          g.interact();
          return;
        }
        held.add(key);
        updateTouch();
        b.classList.add("active");
      };
      const release = () => {
        held.delete(key);
        updateTouch();
        b.classList.remove("active");
      };
      b.addEventListener("pointerdown", press);
      b.addEventListener("pointerup", release);
      b.addEventListener("pointercancel", release);
      b.addEventListener("pointerleave", release);
    }

    // Canvas pointer: aim + primary fire handled in Input; this just closes modals.
    if (this.els.canvas) this.els.canvas.addEventListener("pointerdown", () => {
      if (g.screen) g.closeScreen();
    });
  }

  /* ── Title ──────────────────────────────────────────────────────────── */

  showTitle(opts) {
    const g = this.game;
    const root = this.els.titleRoot;
    root.hidden = false;
    this.els.screenRoot.hidden = true;
    const btn = (label, fn, kind = "") => button(label, () => { g.audioUnlock?.(); fn(); }, { kind });
    root.replaceChildren(
      h("div", { class: "title-panel" }, [
        h("div", { class: "title-logo" }, [
          h("span", { class: "hex-mark" }, "⬡"),
          h("h1", null, [h("b", null, "HEX"), h("b", { class: "accent" }, "SPACE")]),
          h("p", null, "A single-player space RPG on the frontier of a quiet war."),
        ]),
        h("div", { class: "title-actions" }, [
          opts.hasSave ? btn("▸ CONTINUE CAMPAIGN", opts.onContinue, "primary big") : null,
          btn(opts.hasSave ? "◇ NEW CAMPAIGN" : "▸ BEGIN CAMPAIGN", opts.onNew, opts.hasSave ? "" : "primary big"),
          h("div", { class: "title-secondary" }, [
            btn("Import save", () => this.showImport(opts.onImport)),
            btn("Settings", opts.onSettings),
            btn("How to play", opts.onHelp),
          ]),
        ]),
        opts.migrated ? h("p", { class: "title-note" }, "Legacy save detected and migrated to the current build.") : null,
        h("div", { class: "title-foot" }, [
          h("span", null, "MOUSE AIM · WASD THRUST · E INTERACT · M CHART"),
          h("span", null, `BUILD ${GAME.version}.0 · OFFLINE · LOCAL SAVE`),
        ]),
      ]),
    );
  }

  showImport(onImport) {
    this.openModal({
      name: "import",
      title: "Import campaign",
      build: (body) => {
        const area = h("textarea", { class: "code-area", rows: 6, placeholder: "Paste an HXSP1.… export code" });
        body.append(
          h("p", null, "Paste an export code from another device. Nothing leaves this browser."),
          area,
          h("div", { class: "row-actions" }, [
            button("Import", () => {
              const ok = onImport(area.value.trim());
              if (ok !== false) this.closeModal();
            }, { kind: "primary" }),
            button("Cancel", () => this.closeModal()),
          ]),
        );
      },
    });
  }

  hideTitle() {
    this.els.titleRoot.hidden = true;
    this.els.titleRoot.replaceChildren();
  }

  /* ── Generic modal host (used by title-level screens) ───────────────── */

  openModal({ name, title, build, wide = false }) {
    this.els.screenRoot.hidden = false;
    this.els.titleRoot.hidden = true;
    this.activeScreen = name;
    const body = h("div", { class: "screen-body" });
    const panelEl = h("div", { class: `screen ${wide ? "wide" : ""}` }, [
      h("header", { class: "screen-head" }, [
        h("div", null, [h("small", null, "HEXSPACE // TERMINAL"), h("h2", null, title)]),
        button("CLOSE ×", () => this.closeModal(), { kind: "ghost" }),
      ]),
      body,
    ]);
    build(body, panelEl);
    this.els.screenRoot.replaceChildren(panelEl);
    const first = panelEl.querySelector("button, [tabindex]");
    first?.focus({ preventScroll: true });
  }

  closeModal() {
    this.els.screenRoot.hidden = true;
    this.els.screenRoot.replaceChildren();
    this.activeScreen = null;
    if (this.game.mode === "title") this.els.titleRoot.hidden = false;
  }

  /* ── Screens requested by the game ─────────────────────────────────── */

  showScreen(name, ctx) {
    const builder = SCREENS[name] ?? SCREENS.unknownFallback;
    this.activeScreen = name;
    this.currentCtx = ctx;
    this.els.titleRoot.hidden = true;
    this.els.screenRoot.hidden = false;
    const body = h("div", { class: "screen-body" });
    const panelEl = h("div", { class: `screen screen-${name} ${builder.wide ? "wide" : ""}`.trim() }, [
      h("header", { class: "screen-head" }, [
        h("div", null, [
          h("small", null, builder.kicker ?? "HEXSPACE // TERMINAL"),
          h("h2", null, typeof builder.title === "function" ? builder.title(ctx) : builder.title ?? name.toUpperCase()),
        ]),
        h("div", { class: "head-actions" }, builder.headActions?.(ctx, this) ?? []),
        button("CLOSE ×", () => this.game.closeScreen(), { kind: "ghost" }),
      ]),
      body,
    ]);
    const content = builder.build(ctx, this);
    body.append(content);
    this.els.screenRoot.replaceChildren(panelEl);
    const first = panelEl.querySelector("button:not([disabled]), [tabindex='0']");
    first?.focus({ preventScroll: true });
    panelEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.game.closeScreen();
    });
  }

  hideScreen() {
    this.els.screenRoot.hidden = true;
    this.els.screenRoot.replaceChildren();
    this.activeScreen = null;
  }

  rebuild() {
    if (this.game.screen) this.game.refreshScreen();
  }

  /* ── Toast / status ────────────────────────────────────────────────── */

  toast(text, tone = "info") {
    const el = h("div", { class: `toast ${tone}` }, text);
    this.els.toastWrap.append(el);
    setTimeout(() => el.classList.add("in"), 10);
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 400);
    }, 3600);
    while (this.els.toastWrap.children.length > 4) this.els.toastWrap.firstChild.remove();
  }

  setSaveStatus(ok) {
    this.els.savePill.textContent = ok ? "LOCAL SAVE SYNCED" : "SAVE BLOCKED";
    this.els.savePill.classList.toggle("bad", !ok);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.els.savePill.textContent = ok ? "LOCAL SAVE READY" : "SAVE BLOCKED";
    }, 2200);
  }

  setPerf(fps) {
    this.els.perf.textContent = `${fps} FPS`;
    this.els.perf.classList.toggle("warn", fps < 45);
  }

  /* ── HUD dossier ───────────────────────────────────────────────────── */

  updateDossier(d) {
    if (!d) return;
    const { state, sector, sheet, tracked, rank } = d;
    const $ = (id) => document.getElementById(id);
    $("credits").textContent = fmt(state.credits);
    $("chip-name").textContent = sector.name;
    $("chip-sub").textContent = `${FACTIONS[sector.faction]?.name ?? "Unclaimed"} · ${ECONOMIES[sector.economy]?.name ?? "Port"}`;
    const sec = SECURITY[sector.security];
    const chip = $("chip-security");
    chip.textContent = sec.label.split(" ")[0];
    chip.style.color = sec.color;
    chip.style.borderColor = sec.color + "66";
    $("rank").textContent = rank.label;
    $("rank-fill").style.width = `${Math.round(rank.ratio * 100)}%`;
    $("rank-chip").title = rank.next ? `${rank.nextName} at ${SHIP_RANKS[rank.next].xp} XP (${Math.round(state.xp)} XP)` : "Maximum rank";
    const hull = HULLS[state.hull];
    $("dock-hull").textContent = hull.name;
    $("dock-class").textContent = hull.label.toUpperCase();
    $("obj-title").textContent = tracked ? tracked.title : d.docked ? "Station liberty" : "Find work";
    $("obj-desc").textContent = tracked
      ? missionProgressText(state, tracked).replace(/^○ /, "")
      : d.docked
        ? "Walk to a terminal and press E. The cantina posts contracts; the hangar fits modules."
        : sector.station
          ? `Dock at ${sector.station.name} to trade, refit and hire.`
          : "This sector has no station. Scan signals and take what the dark offers.";
    $("obj-target").textContent = tracked?.target
      ? `${tracked.target.name} · ${hexDistance(state.sector.q, state.sector.r, tracked.target.q, tracked.target.r)} hex`
      : sector.station
        ? sector.station.name
        : `${sector.q},${sector.r}`;
    $("btn-assist").textContent = this.game.assist ? "ASSIST ON" : "DRIFT";
    $("btn-assist").setAttribute("aria-pressed", String(this.game.assist));
    // Mini meters (flight).
    const world = this.game.world;
    const mp = (id, ratio, color) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.width = `${Math.round(clamp(ratio, 0, 1) * 100)}%`;
      if (color) el.style.background = color;
    };
    if (world) {
      const p = world.player;
      mp("mini-hull", p.hp / Math.max(1, p.hullMax), p.hp / p.hullMax < 0.3 ? "#ff6b7a" : "#8dffa8");
      mp("mini-shield", p.shield / Math.max(1, p.shieldMax), "#55e6d5");
      mp("mini-heat", p.heat / 100, p.heat > 80 ? "#ff6b7a" : "#5aa9ff");
      $("btn-interact").textContent = world.interact ? (world.interact.hold > 0 ? "HOLD E" : "INTERACT") : "INTERACT";
      $("btn-interact").disabled = !world.interact;
    }
    // Log rail.
    const log = $("log");
    if (log) {
      const items = (state.log ?? []).slice(-6).reverse();
      log.replaceChildren(...items.map((l) => h("div", null, [h("b", null, "›"), ` ${l.text}`])));
    }
    this.els.stage?.classList.toggle("docked", !!d.docked);
  }

  showGameOver({ tax, onRecover }) {
    this.els.titleRoot.hidden = true;
    this.els.screenRoot.hidden = false;
    this.activeScreen = "gameover";
    const panelEl = h("div", { class: "screen screen-death" }, [
      h("div", { class: "death-inner" }, [
        h("small", null, "HULL INTEGRITY ZERO"),
        h("h2", null, "ESCAPE POD RECOVERED"),
        h("p", null, "Your ship broke apart. The pod pulled you back to the nearest safe port, but the hold is gone and the dockmaster took a recovery fee."),
        h("div", { class: "death-stats" }, [stat("Recovery fee", fmtCredits(tax), "bad"), stat("Cargo", "LOST", "bad"), stat("Hull", "REPAIRED", "good")]),
        h("div", { class: "row-actions" }, [button("▸ RECOVER AND FLY", onRecover, { kind: "primary big" })]),
      ]),
    ]);
    this.els.screenRoot.replaceChildren(panelEl);
    panelEl.querySelector("button")?.focus();
  }

  onDock() {
    /* Called by the game on docking; the HUD updates through the dossier. */
  }

  refreshDossier() {
    this.updateDossier(this.game.dossier());
  }
}

/* ── Screen builders ─────────────────────────────────────────────────── */

const $btn = (label, fn, opts) => button(label, fn, opts);

const SCREENS = {
  unknownFallback: {
    title: "TERMINAL",
    build: () => empty("This terminal is not responding."),
  },

  /* ── Galaxy chart ─────────────────────────────────────────────────── */
  map: {
    title: "GALAXY CHART",
    kicker: "NAVIGATION // JUMP PLOT",
    wide: true,
    build(ctx, ui) {
      const { state, sheet, sector } = ctx;
      const game = ui.game;
      if (!ui.mapCursor) ui.mapCursor = { q: state.sector.q, r: state.sector.r };
      const radius = 4;
      const sectors = [];
      for (let dq = -radius; dq <= radius; dq++) {
        const r1 = Math.max(-radius, -dq - radius);
        const r2 = Math.min(radius, -dq + radius);
        for (let dr = r1; dr <= r2; dr++) {
          const s = generateSector(state.seed, state.sector.q + dq, state.sector.r + dr);
          s.visited = !!state.discovered[s.key]?.visited || (s.q === state.sector.q && s.r === state.sector.r);
          s.cost = jumpWarpCost(state.sector, s);
          s.inRange = canJump(state.sector, s, 1 + sheet.warpRange);
          s.dist = hexDistance(state.sector.q, state.sector.r, s.q, s.r);
          sectors.push(s);
        }
      }
      const size = 30;
      const xs = sectors.map((s) => hexToPixel(s.q, s.r, size).x);
      const ys = sectors.map((s) => hexToPixel(s.q, s.r, size).y);
      const minX = Math.min(...xs) - size * 1.2;
      const maxX = Math.max(...xs) + size * 1.2;
      const minY = Math.min(...ys) - size * 1.2;
      const maxY = Math.max(...ys) + size * 1.2;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
      svg.setAttribute("class", "hexmap");
      svg.setAttribute("role", "group");
      svg.setAttribute("aria-label", "Galaxy hex chart");
      let selected = sectors.find((s) => s.q === ui.mapCursor.q && s.r === ui.mapCursor.r) ?? sectors.find((s) => s.dist === 0);
      ui.mapCursor = { q: selected.q, r: selected.r };

      const detail = h("div", { class: "map-detail" });
      const drawMap = () => {
        // Route line.
        for (const old of svg.querySelectorAll(".route")) old.remove();
        if (selected.dist > 0) {
          const route = hexLine(state.sector.q, state.sector.r, selected.q, selected.r);
          const routePts = route.map((hx) => hexToPixel(hx.q, hx.r, size));
          const poly = document.createElementNS(ns, "polyline");
          poly.setAttribute("points", routePts.map((p) => `${p.x},${p.y}`).join(" "));
          poly.setAttribute("class", "route");
          svg.append(poly);
        }
        for (const g of svg.querySelectorAll(".hex")) {
          const q = Number(g.dataset.q), r = Number(g.dataset.r);
          g.classList.toggle("selected", q === selected.q && r === selected.r);
        }
        drawDetail();
      };

      for (const s of sectors) {
        const p = hexToPixel(s.q, s.r, size);
        const g = document.createElementNS(ns, "g");
        g.setAttribute("class", `hex sec-${s.security}${s.dist === 0 ? " current" : ""}${s.inRange ? " reach" : ""}${s.visited ? " visited" : ""}${s.storyRole ? " story" : ""}`);
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.dataset.q = s.q;
        g.dataset.r = s.r;
        g.setAttribute("aria-label", `${s.name}, ${SECURITY[s.security].label}, ${FACTIONS[s.faction]?.name ?? "unclaimed"}${s.station ? `, station ${s.station.name}` : ""}`);
        const poly = document.createElementNS(ns, "polygon");
        poly.setAttribute("points", hexPolygon(size - 2));
        const label = document.createElementNS(ns, "text");
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("y", 3);
        label.textContent = s.dist === 0 ? "YOU" : s.visited ? s.name.split(" ")[0].toUpperCase() : `${s.q},${s.r}`;
        const sub = document.createElementNS(ns, "text");
        sub.setAttribute("text-anchor", "middle");
        sub.setAttribute("y", 13);
        sub.setAttribute("class", "sub");
        sub.textContent = s.visited ? `${s.station ? "◉" : "·"} ${s.dist ? s.dist + "H" : ""}` : "";
        g.append(poly, label, sub);
        if (s.station) {
          const dot = document.createElementNS(ns, "circle");
          dot.setAttribute("r", 2.4);
          dot.setAttribute("cx", -11);
          dot.setAttribute("cy", -11);
          dot.setAttribute("class", "station-dot");
          g.append(dot);
        }
        if (s.storyRole) {
          const mark = document.createElementNS(ns, "text");
          mark.setAttribute("text-anchor", "middle");
          mark.setAttribute("y", -12);
          mark.setAttribute("class", "story-mark");
          mark.textContent = "◆";
          g.append(mark);
        }
        const select = () => {
          selected = s;
          ui.mapCursor = { q: s.q, r: s.r };
          drawMap();
        };
        g.addEventListener("click", select);
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select();
          }
        });
        svg.append(g);
      }

      const drawDetail = () => {
        const sec = SECURITY[selected.security];
        const station = selected.station;
        const canGo = selected.inRange && !state.docked && state.warp >= selected.cost && selected.dist > 0;
        const warpOk = sheet.warpRange > 0 && selected.inRange && state.warp >= Math.round(selected.cost * (1 - sheet.warpEff)) && !state.docked && selected.dist > 0;
        detail.replaceChildren(
          h("div", { class: `detail-head sec-${selected.security}` }, [
            h("small", null, `${sec.label} · ${selected.dist === 0 ? "CURRENT" : `${selected.dist} HEX${selected.dist > 1 ? "ES" : ""}`}`),
            h("h3", null, selected.name),
            h("span", { class: "faction" }, FACTIONS[selected.faction]?.name ?? "Unclaimed"),
          ]),
          h("p", { class: "detail-desc" }, selected.visited ? describeSector(selected) : "Uncharted. Long-range scan cannot resolve the port, faction or hazards."),
          kv([
            ["Economy", selected.visited ? ECONOMIES[selected.economy]?.name ?? "—" : "unknown"],
            ["Tech level", selected.visited ? `T${selected.tech}` : "?"],
            ["Station", selected.visited ? station?.name ?? "none" : "unknown"],
            ["Danger", "▲".repeat(Math.max(1, Math.round(selected.visited ? selected.danger * 3 : 1)))],
            ["Warp cost", `${selected.cost}`],
          ]),
          h("div", { class: "detail-actions" }, [
            $btn(
              state.docked ? "UNDOCK TO JUMP" : selected.dist === 0 ? "CURRENT SECTOR" : `▸ JUMP (${selected.cost} WARP)`,
              () => {
                if (game.jumpTo(selected.q, selected.r)) ui.rebuild();
              },
              { kind: "primary", disabled: !canGo },
            ),
            sheet.warpRange > 0
              ? $btn(`◇ WARP COIL (${Math.round(selected.cost * (1 - sheet.warpEff))})`, () => {
                  if (game.warpTo(selected.q, selected.r)) ui.rebuild();
                }, { disabled: !warpOk })
              : null,
          ]),
          state.docked ? h("p", { class: "hint" }, "Undock from the hangar airlock to jump.") : null,
        );
      };

      const mapWrap = h("div", { class: "map-wrap" }, [svg]);
      const side = h("div", { class: "map-side" }, [
        h("div", { class: "map-legend" }, [
          tag("◉ station", "cyan"),
          tag("◆ story", "violet"),
          tag("▲ hostile", "red"),
          tag("○ in range", "green"),
        ]),
        detail,
        h("p", { class: "hint" }, `Jump range ${1 + sheet.warpRange} hex · Warp charge ${Math.round(state.warp)}% · Missiles ${state.missiles}/${sheet.missileAmmo}`),
      ]);
      drawDetail();
      drawMap();
      return h("div", { class: "map-grid" }, [mapWrap, side]);
    },
  },

  /* ── Fitting ──────────────────────────────────────────────────────── */
  fit: {
    title: "SHIP OUTFITTING",
    kicker: "HANGAR // HARDPOINT CONTROL",
    wide: true,
    build(ctx, ui) {
      const { state, sheet, sector } = ctx;
      const game = ui.game;
      const fits = slotLayout(state.hull);
      let activeSlot = fits[0];
      let slotType = "weapon";
      const listWrap = h("div", { class: "mod-list" });
      const statsWrap = h("div", { class: "fit-stats" });
      const schematic = h("div", { class: "schematic" });

      const render = () => {
        const preview = { ...state.fit };
        // Slot buttons.
        schematic.replaceChildren(
          ...fits.map((s) => {
            const mod = moduleById(preview[s.key]);
            const btn = h("button", {
              class: `mount ${s.type}${s.key === activeSlot.key ? " active" : ""}${mod ? " filled" : ""}`,
              type: "button",
              title: mod ? `${mod.name} — ${s.key}` : `${s.type} slot ${s.key} (empty)`,
              style: { left: `${50 + s.mount.x * 34}%`, top: `${46 + s.mount.y * 30}%` },
              onclick: () => {
                activeSlot = s;
                slotType = s.type;
                render();
              },
            }, [
              h("i", null, { weapon: "✦", defense: "◈", engine: "▲", utility: "▣", reactor: "⬡" }[s.type]),
              h("small", null, s.key.toUpperCase()),
            ]);
            return btn;
          }),
        );
        // Module list for the active slot.
        const type = activeSlot.type;
        const current = preview[activeSlot.key];
        const catalog = Object.values(MODULES).filter((m) => m.slot === type).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.price - b.price);
        listWrap.replaceChildren(
          h("div", { class: "list-head" }, [
            h("h4", null, `${type.toUpperCase()} MODULES`),
            h("small", null, `SLOT ${activeSlot.key.toUpperCase()} · ${MODULES[current]?.name ?? "EMPTY"}`),
          ]),
          ...catalog.map((m) => {
            const price = m.price === 0 ? 0 : stationPriceSafe(game, m.id, sector);
            const owned = state.ownedModules.includes(m.id);
            const nextFit = { ...state.fit, [activeSlot.key]: m.id };
            const nextStats = shipStats(state.hull, nextFit);
            const diff = statDiff(sheet, nextStats);
            const powerBad = nextStats.draw > nextStats.power;
            const active = current === m.id;
            const check = canInstall(state.hull, state.fit, activeSlot.key, m.id);
            const costLabel = active ? "INSTALLED" : owned ? "EQUIP" : `${fmt(price)} CR`;
            const disabled = !check.ok || state.credits < price && !owned;
            return h("div", { class: `mod ${active ? "installed" : ""}${powerBad ? " bad" : ""}` }, [
              h("div", { class: "mod-head" }, [
                h("b", null, m.name),
                h("span", { class: "tier" }, `T${m.tier ?? 1}`),
                h("span", { class: "price" }, costLabel),
              ]),
              h("p", null, m.desc),
              h("div", { class: "mod-stats" }, [
                ...diff.map((d) => tag(`${d.delta > 0 ? "+" : ""}${d.delta} ${STAT_LABEL[d.key] ?? d.key}`, d.delta > 0 ? "good" : "bad")),
                MODULES[m.id].weapon ? tag(`${MODULES[m.id].weapon.damage} dmg`, "amber") : null,
                powerBad ? tag("POWER OVERDRAW", "bad") : null,
              ]),
              h("div", { class: "mod-actions" }, [
                active
                  ? $btn("REMOVE", () => {
                      const r = game.doInstall(activeSlot.key, null);
                      if (r.ok) render();
                    }, { disabled: type === "reactor" })
                  : $btn(disabled ? "UNAVAILABLE" : costLabel, () => {
                      const r = game.doInstall(activeSlot.key, m.id);
                      if (r.ok) render();
                    }, { kind: "primary", disabled }),
              ]),
            ]);
          }),
          h("p", { class: "hint" }, "Power draw above reactor capacity causes brownout: slower recharge, wider spread, dimmer engines. Overdraw is allowed — it just flies badly."),
        );
        // Stat sheet.
        const deltas = [];
        statsWrap.replaceChildren(
          h("div", { class: "stat-grid" }, [
            stat("Hull", `${Math.round(sheet.hullPoints)}`),
            stat("Shield", `${Math.round(sheet.shield)}`, "cyan"),
            stat("Power", `${Math.round(sheet.draw)} / ${Math.round(sheet.power)}`, sheet.draw > sheet.power ? "bad" : ""),
            stat("Thrust", `${Math.round(sheet.thrust)}`),
            stat("Mass", `${Math.round(sheet.mass)} t`),
            stat("Cooling", `${sheet.cool.toFixed(0)}/s`),
            stat("Cargo", `${cargoUsed(state)} / ${sheet.cargo}`),
            stat("Sensor", `${Math.round(sheet.sensor)}`),
            stat("Turn", `${sheet.turn.toFixed(1)}`),
            stat("Warp", sheet.warpRange ? `+${sheet.warpRange} hex` : "—"),
            stat("Missiles", `${state.missiles} / ${sheet.missileAmmo}`),
            stat("Integrity", `${Math.round((state.hp / sheet.hullPoints) * 100)}%`, state.hp / sheet.hullPoints < 0.3 ? "bad" : ""),
          ]),
          sheet.brownout < 1 ? h("p", { class: "warn" }, "⚠ POWER BROWNOUT: reduce draw or fit a larger reactor.") : null,
          h("div", { class: "fit-tools" }, [
            $btn("REPAIR HULL", () => { game.doRepair(); render(); }, { disabled: state.hp >= sheet.hullPoints }),
            $btn("RESTOCK MISSILES", () => { game.doRestock(); render(); }, { disabled: state.missiles >= sheet.missileAmmo || !sheet.missileAmmo }),
          ]),
          h("p", { class: "hint" }, "Repairs and restocks are billed by the dockmaster. Module purchases unlock permanently across hulls."),
        );
      };
      render();
      return h("div", { class: "fit-grid" }, [
        h("div", { class: "fit-left" }, [
          h("div", { class: "ship-preview" }, [
            h("div", { class: "schematic-frame" }, [
              h("canvas", { class: "schematic-canvas", id: "fit-canvas", width: 260, height: 220 }),
              schematic,
            ]),
            h("div", { class: "hull-name" }, [h("b", null, HULLS[state.hull].name), h("span", null, HULLS[state.hull].label)]),
          ]),
          statsWrap,
        ]),
        listWrap,
      ]);
    },
    headActions(ctx, ui) {
      return [$btn("SHIPYARD", () => ui.game.openScreen("shipyard"), { kind: "ghost" })];
    },
  },

  /* ── Market ───────────────────────────────────────────────────────── */
  market: {
    title: "COMMODITY EXCHANGE",
    kicker: "LOCAL MARKET // LIVE QUOTES",
    wide: true,
    build(ctx, ui) {
      const { state, sheet, sector, market } = ctx;
      const game = ui.game;
      const cargoFree = sheet.cargo - cargoUsed(state);
      const rows = Object.values(GOODS).map((good) => {
        const id = Object.keys(GOODS).find((k) => GOODS[k] === good);
        const buyPrice = priceAt(state, sector, id, "buy");
        const sellPrice = priceAt(state, sector, id, "sell");
        const stock = market.stock[id] ?? 0;
        const held = state.cargo[id] ?? 0;
        const legal = goodStatusFor(sector, id);
        const sellable = canSellHere(sector, id);
        return h("div", { class: "trade-row" }, [
          h("div", { class: "trade-name" }, [
            h("i", { style: { background: good.color } }),
            h("div", null, [h("b", null, good.name), h("small", null, good.desc)]),
            tag(legal, legal === "Legal" ? "" : legal === "Restricted" ? "amber" : "red"),
          ]),
          h("div", { class: "trade-nums" }, [
            h("div", null, [h("small", null, "BUY"), h("b", null, fmt(buyPrice)), h("span", null, `CR · ${stock} left`)]),
            h("div", null, [h("small", null, "SELL"), h("b", null, fmt(sellPrice)), h("span", null, sellable ? "CR" : "refused")]),
            h("div", null, [h("small", null, "HOLD"), h("b", null, String(held)), h("span", null, "units")]),
          ]),
          h("div", { class: "trade-actions" }, [
            $btn("BUY 1", () => { game.doBuyGood(id, 1); ui.rebuild(); }, { disabled: state.credits < buyPrice || cargoFree <= 0 || stock < 1 }),
            $btn("BUY 5", () => { game.doBuyGood(id, 5); ui.rebuild(); }, { disabled: state.credits < buyPrice * 5 || cargoFree < 5 || stock < 5 }),
            $btn("SELL 1", () => { game.doSellGood(id, 1); ui.rebuild(); }, { disabled: !held || !sellable }),
            $btn("SELL ALL", () => { game.doSellGood(id, held); ui.rebuild(); }, { disabled: !held || !sellable }),
          ]),
        ]);
      });
      const refuel = refuelQuote(state, 100);
      return h("div", { class: "market-layout" }, [
        h("div", { class: "market-top" }, [
          stat("Credits", fmt(state.credits), "gold"),
          stat("Cargo", `${cargoUsed(state)} / ${sheet.cargo}`),
          stat("Dock", sector.station?.name ?? "—"),
          stat("Economy", ECONOMIES[sector.economy]?.name ?? "—", "cyan"),
        ]),
        h("div", { class: "trade-head" }, [
          h("span", null, "COMMODITY"),
          h("span", null, "QUOTES"),
          h("span", null, "ORDERS"),
        ]),
        h("div", { class: "trade-list" }, rows),
        h("div", { class: "market-foot" }, [
          h("div", null, [
            h("h4", null, "CHANDLERY"),
            ...Object.values(CONSUMABLES).map((item) =>
              row(item.name, `${item.desc} · ${fmt(item.price)} CR`, $btn("BUY", () => { game.doBuyConsumable(item.id); ui.rebuild(); }, { disabled: state.credits < item.price })),
            ),
          ]),
          h("div", null, [
            h("h4", null, "DOCK SERVICES"),
            row("Refuel warp cells", refuel.missing ? `${refuel.missing} units · ${fmt(refuel.cost)} CR` : "Tanks full", $btn("REFUEL", () => { game.doRefuel(); ui.rebuild(); }, { disabled: !refuel.missing || state.credits < refuel.cost })),
            row("Buying raises price", "Each purchase tightens local supply and the next unit costs more.", null),
          ]),
        ]),
      ]);
    },
  },

  /* ── Contracts ────────────────────────────────────────────────────── */
  contracts: {
    title: "CONTRACT BOARD",
    kicker: "CANTINA // WORK AVAILABLE",
    wide: true,
    build(ctx, ui) {
      const { state, sheet, board, active } = ctx;
      const game = ui.game;
      const available = (board ?? []).filter((m) => !active.some((a) => a.id === m.id));
      const activeCards = active.map((m) =>
        h("div", { class: "mission active" }, [
          h("div", { class: "mission-head" }, [
            h("span", { class: "mission-type" }, m.type === "story" ? "PRIORITY" : JOBS[m.type]?.label ?? m.type),
            h("h4", null, m.title),
            tag(`${fmt(m.reward)} CR`, "gold"),
          ]),
          h("p", null, m.brief),
          h("div", { class: "mission-progress" }, missionProgressText(state, m).split("\n").map((line) => h("div", null, line))),
          h("div", { class: "mission-meta" }, [
            h("span", null, `Target: ${m.target?.name ?? "—"}`),
            h("span", null, `Rep: ${Object.entries(m.rep ?? {}).map(([f, v]) => `${FACTIONS[f]?.short ?? f} ${v > 0 ? "+" : ""}${v}`).join(" ")}`),
            h("span", null, `XP ${m.xp}`),
          ]),
          h("div", { class: "row-actions" }, [
            isComplete(m) ? $btn("▸ HAND IN", () => { game.doCompleteMission(m.id); ui.rebuild(); }, { kind: "primary" }) : tag("IN PROGRESS", "quiet"),
            $btn("ABANDON", () => { game.doAbandonMission(m.id); ui.rebuild(); }, { kind: "ghost", disabled: m.type === "story" }),
            m.target ? $btn("CHART", () => { game.setMapCursor(m.target.q, m.target.r); game.openScreen("map"); }) : null,
          ]),
        ]),
      );
      const cards = available.map((m) =>
        h("div", { class: "mission" }, [
          h("div", { class: "mission-head" }, [
            h("span", { class: "mission-type" }, JOBS[m.type]?.label ?? m.type),
            h("h4", null, m.title),
            tag(`${fmt(m.reward)} CR`, "gold"),
          ]),
          h("p", null, m.brief),
          h("div", { class: "mission-meta" }, [
            h("span", null, `Route: ${m.from.name} → ${m.target.name}`),
            h("span", null, `Rep: ${Object.entries(m.rep ?? {}).map(([f, v]) => `${FACTIONS[f]?.short ?? f} ${v > 0 ? "+" : ""}${v}`).join(" ")}`),
            h("span", null, `Rank ${SHIP_RANKS[m.rank ?? 0]?.name ?? "—"}`),
          ]),
          m.cargo ? h("p", { class: "hint" }, `Job cargo: ${m.cargo.qty} × ${GOODS[m.cargo.id]?.name ?? ITEMS[m.cargo.id]?.name} loaded on accept.`) : null,
          h("div", { class: "row-actions" }, [
            $btn("▸ ACCEPT", () => { game.doAcceptMission(m); ui.rebuild(); }, { kind: "primary", disabled: active.length >= 4 }),
          ]),
        ]),
      );
      return h("div", { class: "contracts-layout" }, [
        h("div", { class: "contracts-head" }, [
          h("p", null, "The board refreshes as ships come and go. Up to four active contracts. Job cargo occupies your hold."),
          tag(`${active.length} / 4 ACTIVE`, active.length >= 4 ? "amber" : "quiet"),
        ]),
        h("div", { class: "contracts-cols" }, [
          h("div", null, [h("h4", { class: "col-title" }, "AVAILABLE WORK"), available.length ? cards : empty("The board is picked clean. Check back after a jump.")]),
          h("div", null, [h("h4", { class: "col-title" }, "ACTIVE CONTRACTS"), activeCards.length ? activeCards : empty("No contracts accepted.")]),
        ]),
      ]);
    },
  },

  /* ── Faction HQ ───────────────────────────────────────────────────── */
  hq: {
    title: "FACTION HEADQUARTERS",
    kicker: "LIAISON OFFICE // STANDING",
    wide: true,
    build(ctx, ui) {
      const { state, sector, story, active } = ctx;
      const game = ui.game;
      const card = storyCardState(state);
      const storyMission = active.find((m) => m.type === "story");
      const storyBlock = card
        ? h("div", { class: "story-card" }, [
            h("div", { class: "story-head" }, [tag(card.act?.act ?? "STORY", "violet"), h("h3", null, card.def.title)]),
            h("p", null, card.def.brief),
            h("ul", { class: "objective-list" }, card.def.goals.map((g) => h("li", null, g.label))),
            h("div", { class: "row-actions" }, [
              storyMission
                ? isComplete(storyMission)
                  ? $btn("▸ HAND IN PRIORITY CONTRACT", () => { game.doCompleteMission(storyMission.id); ui.rebuild(); }, { kind: "primary" })
                  : tag("IN PROGRESS — CHECK OBJECTIVES", "amber")
                : $btn("▸ ACCEPT PRIORITY CONTRACT", () => { game.doAcceptStory(); ui.rebuild(); }, { kind: "primary" }),
            ]),
          ])
        : state.story?.ending
          ? h("div", { class: "story-card" }, [h("h3", null, "The gate is open"), h("p", null, STORY.ending)])
          : empty("No priority contracts available at your standing.");

      const standing = Object.values(FACTIONS).map((f) => {
        const rep = state.rep[f.id] ?? 0;
        return h("div", { class: "standing-row" }, [
          h("div", { class: "standing-name" }, [h("i", { style: { background: f.color } }), h("b", null, f.name), h("small", null, f.motto)]),
          h("div", { class: "standing-meter" }, [
            bar((rep + 100) / 200, rep >= 50 ? "#4ade80" : rep >= 0 ? "#60a5fa" : rep >= -40 ? "#facc15" : rep >= -80 ? "#fb923c" : "#ef4444"),
            h("span", { style: { color: rep >= 50 ? "#4ade80" : rep >= 0 ? "#60a5fa" : rep >= -40 ? "#facc15" : rep >= -80 ? "#fb923c" : "#ef4444" } }, `${standingLabel(rep)} · ${rep > 0 ? "+" : ""}${Math.round(rep)}`),
          ]),
        ]);
      });

      return h("div", { class: "hq-layout" }, [
        h("div", null, [
          h("h4", { class: "col-title" }, "STANDING"),
          ...standing,
          h("p", { class: "hint" }, "Standing shifts prices, fines and dialogue. Working against a faction strengthens its rivals."),
        ]),
        h("div", null, [
          h("h4", { class: "col-title" }, "PRIORITY CONTRACT"),
          storyBlock,
          h("h4", { class: "col-title" }, "OTHER CONTRACTS"),
          active.filter((m) => m.type !== "story").length
            ? active.filter((m) => m.type !== "story").map((m) =>
                row(m.title, missionProgressText(state, m).replace(/\n/g, " · "), isComplete(m) ? $btn("HAND IN", () => { game.doCompleteMission(m.id); ui.rebuild(); }) : tag("ACTIVE", "quiet")),
              )
            : empty("No ordinary contracts to hand in here. The cantina posts them."),
        ]),
      ]);
    },
  },

  /* ── Shipyard ─────────────────────────────────────────────────────── */
  shipyard: {
    title: "SHIPYARD",
    kicker: "HULL CRIB // DRY DOCK",
    wide: true,
    build(ctx, ui) {
      const { state, sector, sheet } = ctx;
      const game = ui.game;
      const cards = Object.values(HULLS).map((hull) => {
        const owned = state.ownedHulls.includes(hull.id);
        const active = state.hull === hull.id;
        const check = canBuyHull(state, hull.id);
        const price = owned ? 0 : hullPrice(hull.id, sector);
        const stats = shipStats(hull.id, hull.starter);
        return h("div", { class: `hull-card ${active ? "active" : ""}` }, [
          h("div", { class: "hull-head" }, [
            h("div", null, [h("h4", null, hull.name), h("small", null, hull.label)]),
            active ? tag("IN SERVICE", "cyan") : owned ? tag("OWNED", "green") : tag(`${fmt(price)} CR`, "gold"),
          ]),
          h("p", null, hull.blurb),
          h("div", { class: "hull-stats" }, [
            tag(`${hull.slots.w}W ${hull.slots.d}D ${hull.slots.e}E ${hull.slots.u}U`, "quiet"),
            tag(`${hull.hull} hull`, ""),
            tag(`${hull.cargo} cargo`, ""),
            tag(`${hull.power} power`, ""),
            tag(`rank ${SHIP_RANKS[hull.rank].name}`, rankOf(state.xp) >= hull.rank ? "green" : "red"),
          ]),
          h("div", { class: "row-actions" }, [
            active
              ? tag("FLYING THIS HULL", "quiet")
              : $btn(owned ? "▸ SWITCH HULL" : `▸ BUY ${fmt(price)} CR`, () => { game.doBuyHull(hull.id); ui.rebuild(); }, {
                  kind: "primary",
                  disabled: !check.ok || (!owned && state.credits < price),
                }),
            !check.ok ? h("small", { class: "hint" }, check.reason) : null,
          ]),
        ]);
      });
      return h("div", { class: "shipyard-layout" }, [
        h("p", { class: "lead" }, "Hulls swap the entire hardpoint layout and reset the fitting to a factory loadout. Owned modules stay in your inventory."),
        h("div", { class: "hull-grid" }, cards),
        h("div", { class: "yard-tools" }, [
          row("Structural repair", `${Math.ceil(repairQuote(state, sheet, sector).cost)} CR`, $btn("REPAIR", () => { game.doRepair(); ui.rebuild(); }, { disabled: state.hp >= sheet.hullPoints })),
          row("Missile restock", "Refill all launcher magazines.", $btn("RESTOCK", () => { game.doRestock(); ui.rebuild(); }, { disabled: state.missiles >= sheet.missileAmmo || !sheet.missileAmmo })),
          row("Fitting bay", "Change modules without leaving the yard.", $btn("OPEN FITTING", () => game.openScreen("fit"))),
        ]),
      ]);
    },
  },

  /* ── Clinic / blackmarket ─────────────────────────────────────────── */
  clinic: {
    title: "MEDICAL BAY",
    kicker: "CLINIC // CREW HEALTH",
    build(ctx, ui) {
      const { state, sheet } = ctx;
      const game = ui.game;
      return h("div", { class: "clinic-layout" }, [
        h("p", null, "The medic scans your suit and does not comment on the burns. Treatment is not optional if you want to keep the licence."),
        row("Full hull patch", "Restore hull integrity to maximum.", $btn("TREAT", () => { game.doRepair(); ui.rebuild(); }, { disabled: state.hp >= sheet.hullPoints })),
        row("Stim kit", `${CONSUMABLES.patchKit.price} CR · restores hull in flight (H)`, $btn("BUY", () => { game.doBuyConsumable("patchKit"); ui.rebuild(); })),
        row("Shield cell", `${CONSUMABLES.shieldCell.price} CR · full shields instantly (J)`, $btn("BUY", () => { game.doBuyConsumable("shieldCell"); ui.rebuild(); })),
        h("p", { class: "hint" }, "Consumables are stored in your flight kit and shown in the HUD."),
      ]);
    },
  },

  blackmarket: {
    title: "THE BACKROOM",
    kicker: "NO REGISTRY // NO RECEIPTS",
    wide: true,
    build(ctx, ui) {
      const { state, sector } = ctx;
      const game = ui.game;
      const items = Object.values(GOODS).filter((g) => g.legal !== "legal");
      return h("div", { class: "blackmarket" }, [
        h("p", null, "A woman with a burned cheek sells you a look, not a greeting. Everything on the shelf is contraband somewhere."),
        ...items.map((g) => {
          const id = Object.keys(GOODS).find((k) => GOODS[k] === g);
          const price = priceAt(state, sector, id, "buy");
          return row(g.name, `${g.desc} · ${fmt(price)} CR · in hold: ${state.cargo[id] ?? 0}`, [
            $btn("BUY 1", () => { game.doBuyGood(id, 1); ui.rebuild(); }, { disabled: state.credits < price }),
            $btn("SELL 1", () => { game.doSellGood(id, 1); ui.rebuild(); }, { disabled: !(state.cargo[id] > 0) }),
            $btn("SELL ALL", () => { game.doSellGood(id, state.cargo[id] ?? 0); ui.rebuild(); }, { disabled: !(state.cargo[id] > 0) }),
          ]);
        }),
        h("h4", null, "OFF-BOOK MODULES"),
        ...Object.values(MODULES).filter((m) => m.price >= 2000).map((m) =>
          row(m.name, `${fmt(Math.round(m.price * 1.15))} CR · ${m.desc}`, $btn(state.ownedModules.includes(m.id) ? "OWNED" : "BUY", () => {
            game.state.credits = Math.max(0, game.state.credits);
            const price = Math.round(m.price * 1.15);
            if (state.credits < price) return game.toastMessage("Insufficient credits.", "warn");
            state.credits -= price;
            if (!state.ownedModules.includes(m.id)) state.ownedModules.push(m.id);
            game.toastMessage(`${m.name} acquired.`, "good");
            game.save(true);
            ui.rebuild();
          }, { disabled: state.ownedModules.includes(m.id) || state.credits < Math.round(m.price * 1.15) })),
        ),
      ]);
    },
  },

  /* ── Dialogue ─────────────────────────────────────────────────────── */
  dialogue: {
    title: "CHANNEL OPEN",
    kicker: "LOCAL COMMS",
    build(ctx, ui) {
      const { data } = ctx;
      const lines = data.lines ?? [];
      const game = ui.game;
      let index = 0;
      const log = h("div", { class: "dialogue-log" });
      const actions = h("div", { class: "row-actions" });
      const renderLine = () => {
        if (index >= lines.length) {
          actions.replaceChildren($btn("CLOSE CHANNEL", () => game.closeScreen(), { kind: "primary" }));
          return;
        }
        const line = lines[index];
        log.append(h("div", { class: "dlg-line" }, [h("b", null, line.speaker), h("p", null, line.text)]));
        log.scrollTop = log.scrollHeight;
        index++;
        const nextBtn = h("button", { class: "btn", type: "button" }, index >= lines.length ? "END" : "CONTINUE ▸");
        nextBtn.onclick = () => {
          if (line.action) applyDialogueAction(game, line.action);
          nextBtn.remove();
          renderLine();
        };
        actions.append(nextBtn);
        game.audioCue?.("talk");
      };
      renderLine();
      return h("div", { class: "dialogue" }, [
        h("div", { class: "dlg-portrait" }, [h("span", null, "☊")]),
        log,
        actions,
      ]);
    },
  },

  /* ── Story card ───────────────────────────────────────────────────── */
  story: {
    title: "PRIORITY TRANSMISSION",
    kicker: "USS COMMAND // ENCRYPTED",
    build(ctx, ui) {
      const text = ctx.data.text ?? "";
      return h("div", { class: "story-full" }, [
        h("div", { class: "story-rule" }),
        h("p", null, text),
        h("div", { class: "row-actions" }, [$btn("ACKNOWLEDGE", () => ui.game.closeScreen(), { kind: "primary" })]),
      ]);
    },
  },

  /* ── Pause / settings / help / codex / ending ─────────────────────── */
  pause: {
    title: "PAUSED",
    kicker: "SYSTEMS HOLD",
    build(ctx, ui) {
      const game = ui.game;
      return h("div", { class: "pause-menu" }, [
        h("div", { class: "menu-block" }, [
          $btn("▸ RESUME FLIGHT", () => game.closeScreen(), { kind: "primary big" }),
          $btn("GALAXY CHART", () => game.openScreen("map"), { kind: "big" }),
          $btn("SHIP FITTING", () => (game.state.docked ? game.openScreen("fit") : game.toastMessage("Dock to refit.", "info")), { kind: "big" }),
          $btn("CODEX & STATS", () => game.openScreen("codex"), { kind: "big" }),
          $btn("HOW TO PLAY", () => game.openScreen("help"), { kind: "big" }),
          $btn("SETTINGS & SAVE", () => game.openScreen("settings"), { kind: "big" }),
        ]),
        h("div", { class: "menu-side" }, [
          h("h4", null, "CAMPAIGN"),
          kv([
            ["Seed", String(game.state.seed)],
            ["Jumps", String(game.state.jumps)],
            ["Play time", `${Math.floor(game.time / 60)} min`],
            ["Kills", String(game.state.stats.kills ?? 0)],
            ["Contracts", String(game.state.stats.missions ?? 0)],
          ]),
        ]),
      ]);
    },
  },

  settings: {
    title: "SETTINGS",
    kicker: "SYSTEM CONFIGURATION",
    build(ctx, ui) {
      const game = ui.game;
      const state = game.state;
      const settings = state?.settings ?? game.globalSettings;
      let code = null;
      const set = (key, value) => {
        settings[key] = value;
        if (state) {
          state.settings[key] = value;
          game.save(true);
        }
        if (key === "sound") game.audioSetSound?.(value);
        if (key === "volume") game.audioSetVolume?.(value);
        if (key === "scanlines" || key === "shake") game.effects.setOptions(settings);
      };
      const volume = h("input", {
        type: "range", min: 0, max: 100, value: Math.round(settings.volume * 100), class: "slider",
        oninput: (e) => set("volume", Number(e.target.value) / 100),
      });
      return h("div", { class: "settings" }, [
        row("Sound", "Generative score, engine hum and effects. Requires a click to unlock audio.", $btn(settings.sound ? "ON" : "OFF", (e) => { set("sound", !settings.sound); e.target.textContent = settings.sound ? "ON" : "OFF"; })),
        h("div", { class: "row" }, [h("div", { class: "row-main" }, [h("div", { class: "row-title" }, "Volume"), h("div", { class: "row-desc" }, "Master gain.")]), h("div", { class: "row-actions" }, [volume])]),
        row("Scanlines & vignette", "CRT overlay on the viewport.", $btn(settings.scanlines ? "ON" : "OFF", (e) => { set("scanlines", !settings.scanlines); e.target.textContent = settings.scanlines ? "ON" : "OFF"; })),
        row("Screen shake", "Impact feedback and explosions.", $btn(settings.shake ? "ON" : "OFF", (e) => { set("shake", !settings.shake); e.target.textContent = settings.shake ? "ON" : "OFF"; })),
        h("h4", null, "SAVE DATA"),
        row("Autosave", "Progress saves locally every few seconds and on key actions.", tag("LOCAL ONLY", "quiet")),
        row("Export campaign", "Copy a portable code to move this save to another device.", $btn("EXPORT", () => {
          code?.remove();
          const area = h("textarea", { class: "code-area", rows: 4, readonly: true });
          area.value = game.exportCode();
          area.addEventListener("focus", () => area.select());
          code = h("div", null, [h("p", { class: "hint" }, "Select all and copy. The checksum catches damaged codes."), area]);
          document.querySelector(".settings")?.append(code);
          area.focus();
        })),
        row("Import campaign", "Replace the current campaign with an exported code.", $btn("IMPORT", () => {
          const value = prompt("Paste an HXSP1.… export code");
          if (value) game.importCode(value.trim());
        })),
        row("Restart campaign", "Deletes this save and returns to the title screen.", $btn("DELETE SAVE", () => {
          if (confirm("Delete the local campaign and return to the title screen? This cannot be undone.")) game.deleteAndRestart();
        }, { kind: "danger" })),
        h("p", { class: "hint" }, "HexSpace stores everything in this browser (localStorage). No account, no server, no telemetry."),
      ]);
    },
  },

  help: {
    title: "HOW TO PLAY",
    kicker: "PILOT BRIEFING",
    wide: true,
    build(ctx, ui) {
      return h("div", { class: "help" }, [
        h("div", { class: "help-col" }, [
          h("h4", null, "FLIGHT"),
          kv([
            ["Aim", "Mouse · ship follows"],
            ["Thrust", "W A S D / arrows"],
            ["Afterburner", "Shift (burns heat)"],
            ["Brake", "Q or X"],
            ["Fire primary", "Space / left click"],
            ["Fire missiles", "Right click"],
            ["Interact / dock", "E (hold on wrecks, scans, rocks)"],
          ]),
        ]),
        h("div", { class: "help-col" }, [
          h("h4", null, "SYSTEMS"),
          kv([
            ["Galaxy chart", "M"],
            ["Cycle target", "F / Tab"],
            ["Warp fuel", "K"],
            ["Shield cell", "J"],
            ["Hull patch", "H"],
            ["Menu", "Esc"],
            ["Codex", "C"],
          ]),
        ]),
        h("div", { class: "help-col" }, [
          h("h4", null, "SURVIVING THE FRONTIER"),
          h("ul", null, [
            h("li", null, "Warp charge is consumed by jumps. Refill at stations, or fit a fuel scoop and fly through nebulae."),
            h("li", null, "Power draw above reactor capacity browns you out. Fit a bigger reactor before a bigger gun."),
            h("li", null, "Heat at 100% locks your guns until it falls below 40%. Cooling modules and shorter bursts help."),
            h("li", null, "Dock under fire is not possible. Clear the space around the station first."),
            h("li", null, "Contraband is fined at high-security docks. Sell bloom in anarchy ports."),
            h("li", null, "On foot, press E at terminals and NPCs. The airlock at the hangar undocks you."),
          ]),
        ]),
        h("div", { class: "help-col" }, [
          h("h4", null, "TOUCH"),
          h("p", null, "Direction pad and FIRE/BOOST buttons appear on touch devices. Tap the viewport to aim. Interact button covers docking, scans and terminal use."),
          h("h4", null, "THE LOOP"),
          h("p", null, "Take contracts → fly, fight, mine and scan → dock → trade, repair, refit → jump outward. The story chain starts at the Kepler Reach HQ."),
        ]),
      ]);
    },
  },

  codex: {
    title: "CODEX",
    kicker: "SHIP'S LIBRARY",
    wide: true,
    build(ctx, ui) {
      const { state, sheet } = ctx;
      const game = ui.game;
      const tabsDef = [
        { id: "factions", label: "FACTIONS" },
        { id: "goods", label: "COMMODITIES" },
        { id: "hulls", label: "HULLS" },
        { id: "stats", label: "STATS" },
      ];
      let active = "factions";
      const body = h("div", { class: "codex-body" });
      let nav = null;
      const render = () => {
        if (active === "factions") {
          body.replaceChildren(
            ...Object.values(FACTIONS).map((f) =>
              h("div", { class: "codex-entry" }, [
                h("h4", null, [h("i", { style: { background: f.color } }), ` ${f.name}`]),
                h("p", null, f.desc),
                h("small", null, `Standing: ${standingLabel(state.rep[f.id] ?? 0)} (${Math.round(state.rep[f.id] ?? 0)}) · ${f.motto}`),
              ]),
            ),
          );
        } else if (active === "goods") {
          body.replaceChildren(
            ...Object.values(GOODS).map((g) =>
              h("div", { class: "codex-entry" }, [
                h("h4", null, [h("i", { style: { background: g.color } }), ` ${g.name}`]),
                h("p", null, g.desc),
                h("small", null, `Base ${g.base} CR · ${g.legal.toUpperCase()} · hold ${state.cargo[Object.keys(GOODS).find((k) => GOODS[k] === g)] ?? 0}`),
              ]),
            ),
          );
        } else if (active === "hulls") {
          body.replaceChildren(
            ...Object.values(HULLS).map((hull) =>
              h("div", { class: "codex-entry" }, [
                h("h4", null, `${hull.name} — ${hull.label}`),
                h("p", null, hull.blurb),
                h("small", null, `${hull.slots.w}W ${hull.slots.d}D ${hull.slots.e}E ${hull.slots.u}U · ${hull.hull} hull · ${hull.power} power · rank ${SHIP_RANKS[hull.rank].name}`),
              ]),
            ),
          );
        } else {
          const s = state.stats;
          body.replaceChildren(
            h("div", { class: "stat-grid" }, [
              stat("Kills", String(s.kills ?? 0)),
              stat("Contracts", String(s.missions ?? 0)),
              stat("Trades", String(s.trades ?? 0)),
              stat("Jumps", String(s.jumps ?? 0)),
              stat("Ore mined", String(s.oreMined ?? 0)),
              stat("Credits earned", fmt(s.creditsEarned ?? 0)),
              stat("Deaths", String(s.deaths ?? 0)),
              stat("XP", String(Math.round(state.xp))),
            ]),
            h("h4", null, "CURRENT BUILD"),
            kv([
              ["Hull", `${HULLS[state.hull].name} (${HULLS[state.hull].label})`],
              ["Power", `${Math.round(sheet.draw)} / ${Math.round(sheet.power)}`],
              ["Shield / Hull", `${Math.round(sheet.shield)} / ${Math.round(sheet.hullPoints)}`],
              ["Cargo", `${cargoUsed(state)} / ${sheet.cargo}`],
              ["Warp range", `${1 + sheet.warpRange} hex`],
              ["Rank", SHIP_RANKS[rankOf(state.xp)].name],
            ]),
            h("h4", null, "FLIGHT LOG"),
            h("div", { class: "log-full" }, (state.log ?? []).slice(-30).reverse().map((l) => h("div", null, [h("b", null, "›"), ` ${l.text}`]))),
          );
        }
      };
      const rerender = (id) => {
        active = id;
        const fresh = tabs(tabsDef, active, rerender);
        nav.replaceWith(fresh);
        nav = fresh;
        render();
      };
      nav = tabs(tabsDef, active, rerender);
      render();
      return h("div", { class: "codex" }, [nav, body]);
    },
  },

  ending: {
    title: "THE SILENT GATE",
    kicker: "EPILOGUE",
    wide: true,
    build(ctx, ui) {
      const state = ui.game.state;
      return h("div", { class: "ending" }, [
        h("div", { class: "ending-mark" }, "⬡"),
        h("p", null, STORY.ending),
        h("div", { class: "stat-grid" }, [
          stat("Jumps", String(state.jumps)),
          stat("Kills", String(state.stats.kills ?? 0)),
          stat("Contracts", String(state.stats.missions ?? 0)),
          stat("Credits", fmt(state.credits)),
          stat("Hull", HULLS[state.hull].name),
          stat("Rank", SHIP_RANKS[rankOf(state.xp)].name),
        ]),
        h("div", { class: "row-actions" }, [
          $btn("▸ KEEP FLYING", () => { ui.game.mode = "station"; ui.game.closeScreen(); }, { kind: "primary big" }),
          $btn("RETURN TO TITLE", () => ui.game.deleteAndRestart(), { kind: "big" }),
        ]),
      ]);
    },
  },
};

/* ── helpers ─────────────────────────────────────────────────────────── */

function isComplete(m) {
  if (m.goal) return (m.progress ?? 0) >= (m.goal.count ?? 1);
  if (m.goals) return m.goals.every((g) => (m.goalProgress?.[`${g.kind}:${g.target ?? ""}`] ?? 0) >= g.count);
  return false;
}

function stationPriceSafe(game, moduleId, sector) {
  try {
    return requireStationPrice(game, moduleId, sector);
  } catch {
    return MODULES[moduleId]?.price ?? 0;
  }
}

function requireStationPrice(game, moduleId, sector) {
  // Mirrors fitting.stationPrice without importing it twice in screens.
  const mod = MODULES[moduleId];
  if (!mod) return 0;
  const techDelta = (sector.tech ?? 2) - 3;
  const factionMod = sector.faction === "helix" ? 0.94 : sector.faction === "corsair" ? 1.12 : 1;
  const wealthMod = 1 + (sector.wealth - 0.5) * 0.2;
  return Math.max(20, Math.round((mod.price * (1 - techDelta * 0.05) * factionMod * wealthMod) / 5) * 5);
}

function describeSector(s) {
  const econ = ECONOMIES[s.economy]?.desc ?? "";
  const sec = SECURITY[s.security].desc;
  const patrol = s.friendlies ? "Patrol presence confirmed." : "No patrol presence.";
  return `${econ} ${sec} ${patrol}`;
}

function applyDialogueAction(game, action) {
  if (!action) return;
  if (action.type === "flag") {
    game.state.flags[action.flag] = true;
    if (action.toast) game.toastMessage(action.toast, "good");
    game.emit({ type: "talk", npc: "cartographer" });
    game.save(true);
  }
}
