/**
 * Game orchestration.
 *
 * Owns: mode state machine, the save object, the live world, the station
 * interior, the render pipeline, autosave, and every cross-system transition
 * (dock, undock, jump, death, mission completion). UI screens are driven through
 * callbacks so this module never touches DOM layout itself.
 */
import {
  GAME,
  HULLS,
  GOODS,
  SECURITY,
  FACTIONS,
  CONSUMABLES,
  ITEMS,
  PAL,
  SHIP_RANKS,
} from "./config.js";
import { generateSector, canJump, jumpWarpCost } from "./world/galaxy.js";
import { buildWorld, spawnEncounters, nearestHostile } from "./world/sector.js";
import { shipStats, installModule, changeHull, stationPrice, hullPrice, repairQuote, rankProgress } from "./customization/fitting.js";
import { tickWorld, beginInteract, cancelInteract } from "./systems/world-tick.js";
import { buildInterior } from "./station/layout.js";
import { createAvatar, stepAvatar, stepNpcs, probe, roomUnder } from "./station/avatar.js";
import { buy, sell, marketFor, cargoUsed, buyConsumable, applyRefuel, missileRestockCost, standingLabel } from "./systems/economy.js";
import { generateBoard, accept, abandon, advance, complete, acceptStory, storyCurrent } from "./systems/missions.js";
import { saveGame, loadGame, deleteSave, exportSave, importSave, freshGame } from "./core/save.js";
import { Effects } from "./render/fx.js";
import { audio } from "./core/audio.js";
import { clamp, fmt } from "./core/utils.js";
import { createEnemyShip } from "./entities/entities.js";

export class Game {
  constructor(deps) {
    this.ui = deps.ui;
    this.frame = deps.frame;
    this.input = deps.input;
    this.art = deps.art;
    this.render = deps.render; // { flight, station, map, hud, overlays }
    this.state = null;
    this.world = null;
    this.interior = null;
    this.avatar = null;
    this.mode = "title";
    this.screen = null;
    this.effects = new Effects();
    // Bridge for sim calls: effects.play(sfxName)
    this.effects.play = (name) => {
      if (this.audio) this.audio.play(name);
    };
    this.time = 0;
    this.acc = 0;
    this.lastSave = 0;
    this.banner = null;
    this.toast = null;
    this.travel = null;
    this.objective = "";
    this.screenData = {};
    this.saveFailures = 0;
    this.menuOpen = false;
    this.overlaySector = null;
    this.lastDockKey = null;
    this.assist = true;
    this.paused = false;
    this.stats = { fps: 60, frames: 0, fpsTime: 0 };
    this.tips = new Set();
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  boot() {
    const loaded = loadGame();
    this.hasSave = !!loaded.state;
    this.pendingState = loaded.state;
    this.mode = "title";
    this.ui.showTitle({
      hasSave: this.hasSave,
      migrated: loaded.migrated,
      onNew: () => this.startNew(),
      onContinue: () => this.continueGame(),
      onImport: (code) => this.importCode(code),
      onSettings: () => this.openScreen("settings"),
      onHelp: () => this.openScreen("help"),
    });
    audio.setActive(false);
  }

  startNew(seed) {
    this.state = freshGame(seed ?? Math.floor(Math.random() * 999983));
    this.state.seed = this.state.seed || 1;
    this.beginCampaign();
    this.toastMessage("Flight systems online. Welcome to the frontier.");
  }

  continueGame() {
    if (!this.pendingState) {
      this.startNew();
      return;
    }
    this.state = this.pendingState;
    this.beginCampaign(true);
    this.toastMessage("Save loaded. Systems nominal.");
  }

  beginCampaign(restored = false) {
    this.ui.hideTitle();
    this.syncStats();
    this.mode = "flight";
    this.screen = null;
    audio.init(this.state.settings);
    audio.setActive(true);
    this.enterSector(this.state.sector.q, this.state.sector.r, this.state.docked ? "station" : restored ? "station" : "home", true);
    if (this.state.docked) this.dock(true);
    this.save(true);
    this.updateDossier();
  }

  syncStats() {
    this.stats_sheet = shipStats(this.state.hull, this.state.fit);
  }

  get sheet() {
    return this.stats_sheet ?? (this.stats_sheet = shipStats(this.state.hull, this.state.fit));
  }

  /* ── Sector travel ─────────────────────────────────────────────────── */

  sectorInfo() {
    return generateSector(this.state.seed, this.state.sector.q, this.state.sector.r);
  }

  enterSector(q, r, arrival = "gate", silent = false) {
    const prevKey = this.state.sector ? `${this.state.sector.q},${this.state.sector.r}` : null;
    this.state.sector = { q, r };
    const sector = generateSector(this.state.seed, q, r);
    this.syncStats();
    this.world = buildWorld(this.state, sector, this.sheet, arrival);
    this.effects = new Effects({ shake: this.state.settings.shake });
    this.effects.enabled = true;
    this.art.playerBaked = this.art.playerShip(this.state.hull, this.state.fit);
    this.frame.follow(this.world.player.x, this.world.player.y);
    this.mode = "flight";
    if (!silent) {
      const sec = SECURITY[sector.security];
      this.showBanner(sector.name, `${sec.label} · ${FACTIONS[sector.faction]?.name ?? "Unclaimed"}`, sec.color, 4.2);
      audio.play("jump");
      this.effects.warpStreaks(this.frame.width / 2, this.frame.height / 2, this.frame.width, this.frame.height, 60);
    }
    // Arrival events: visited for missions, discovered chart entry.
    this.emit({ type: "visit", sector: sector.key });
    this.markVisited(sector);
    this.refreshObjective();
    this.updateDossier();
    if (prevKey && prevKey !== sector.key) this.state.jumps++;
    this.checkDockKey();
  }

  markVisited(sector) {
    const d = this.state.discovered[sector.key] ?? (this.state.discovered[sector.key] = { visited: false, scanned: [], cleared: [], looted: [] });
    d.visited = true;
  }

  jumpTo(q, r) {
    if (this.state.docked) {
      this.toastMessage("Undock before jumping.", "warn");
      return false;
    }
    const from = this.state.sector;
    const range = 1 + this.sheet.warpRange;
    if (!canJump(from, { q, r }, range)) {
      this.toastMessage("Sector out of jump range.", "warn");
      audio.play("error");
      return false;
    }
    const cost = jumpWarpCost(from, { q, r });
    if (this.state.warp < cost) {
      this.toastMessage(`Insufficient warp charge (${Math.round(this.state.warp)}/${cost}).`, "warn");
      audio.play("error");
      return false;
    }
    this.state.warp -= cost;
    this.save(true);
    this.closeScreen();
    this.enterSector(q, r, "gate");
    this.save(true);
    return true;
  }

  warpTo(q, r) {
    if (!this.sheet.warpRange) {
      this.toastMessage("No warp coil installed.", "warn");
      return false;
    }
    const from = this.state.sector;
    const range = 1 + this.sheet.warpRange;
    if (!canJump(from, { q, r }, range)) {
      this.toastMessage("Sector out of warp range.", "warn");
      return false;
    }
    const cost = Math.round(jumpWarpCost(from, { q, r }) * (1 - this.sheet.warpEff));
    if (this.state.warp < cost) {
      this.toastMessage(`Insufficient warp charge (${cost} needed).`, "warn");
      return false;
    }
    this.state.warp -= cost;
    this.closeScreen();
    this.enterSector(q, r, "warp");
    this.save(true);
    return true;
  }

  /* ── Docking / undocking ───────────────────────────────────────────── */

  checkDockKey() {
    const s = this.state.sector;
    this.lastDockKey = `${s.q},${s.r}`;
  }

  dock(silent = false) {
    const sector = this.world?.sector ?? this.sectorInfo();
    if (!sector.station) {
      this.toastMessage("No station in this sector.", "warn");
      return false;
    }
    this.state.docked = true;
    this.state.stationKey = sector.key;
    this.state.hp = Math.max(1, Math.round(this.world?.player.hp ?? this.state.hp));
    this.interior = buildInterior(sector.station);
    this.avatar = createAvatar(this.interior);
    this.mode = "station";
    this.screen = null;
    this.menuOpen = false;
    this.input.clear();
    this.frame.follow(this.avatar.x, this.avatar.y);
    if (!silent) audio.play("dock");
    const board = generateBoard(this.state, sector);
    this.currentBoard = board;
    this.state.boardEpoch = Math.max(this.state.boardEpoch, 1);
    // Clearance: pay fines for any contraband if the station scans you.
    this.contrabandCheck(sector);
    this.refreshObjective();
    this.updateDossier();
    this.save(true);
    this.ui.onDock?.(sector);
    return true;
  }

  undock() {
    const sector = this.world?.sector ?? this.sectorInfo();
    this.state.docked = false;
    this.mode = "flight";
    this.screen = null;
    this.menuOpen = false;
    this.input.clear();
    // Respawn the world near the station so undocking feels connected.
    const persisted = {
      position: { x: this.world.station.x + 30, y: this.world.station.y + 150 },
      cleared: this.state.discovered[sector.key]?.cleared ?? [],
    };
    this.enterSector(sector.q, sector.r, "station", true);
    this.state.hp = Math.max(1, this.world.player.hp);
    this.toastMessage(`Undocked from ${sector.station.name}.`);
    audio.play("undock");
    this.showBanner(sector.name, "Flight deck", SECURITY[sector.security].color, 2.2);
    this.save(true);
    return true;
  }

  contrabandCheck(sector) {
    if (!sector.station?.fine) return;
    let held = 0;
    for (const [id, qty] of Object.entries(this.state.cargo)) {
      const good = GOODS[id];
      if (!good) continue;
      if (good.legal === "contraband" || (good.legal === "restricted" && sector.security === "high")) held += qty;
    }
    if (held <= 0) return;
    if (this.state.rep[sector.faction] >= 40) {
      this.toastMessage("Customs waved you through. Standing has privileges.", "info");
      return;
    }
    const fine = held * 90;
    const actual = Math.min(this.state.credits, fine);
    this.state.credits -= actual;
    this.state.rep[sector.faction] = clamp(this.state.rep[sector.faction] - 4, -100, 100);
    this.toastMessage(`Customs scan: contraband seized, ${fmt(actual)} CR fine.`, "bad");
    audio.play("alarm");
    // Confiscate the illegal units.
    for (const id of Object.keys(this.state.cargo)) {
      const good = GOODS[id];
      if (good && (good.legal === "contraband" || (good.legal === "restricted" && sector.security === "high")))
        this.state.cargo[id] = 0;
    }
  }

  /* ── Interaction ───────────────────────────────────────────────────── */

  interact() {
    if (this.screen) {
      this.closeScreen();
      return;
    }
    if (this.mode === "flight") {
      beginInteract(this.world, this.effects);
      return;
    }
    if (this.mode === "station") {
      const target = probe(this.avatar, this.interior, 36);
      if (!target) {
        this.toastMessage("Nothing within reach.", "info");
        return;
      }
      if (target.kind === "exit") {
        this.undock();
        return;
      }
      if (target.kind === "npc") {
        audio.play("talk");
        this.openDialogue(target.npc);
        return;
      }
      audio.play("ui");
      this.openScreen(target.screen, { room: target });
    }
  }

  consume(id) {
    if ((this.state.consumables[id] ?? 0) <= 0) {
      this.toastMessage("None left.", "warn");
      audio.play("error");
      return;
    }
    const ship = this.world?.player;
    if (!ship) return;
    if (id === "patchKit") {
      if (ship.hp >= ship.hullMax) return this.toastMessage("Hull already intact.", "info");
      ship.hp = Math.min(ship.hullMax, ship.hp + ship.hullMax * 0.4);
      this.effects.floatText(ship.x, ship.y - 20, "+HULL", PAL.green);
    } else if (id === "shieldCell") {
      ship.shield = ship.shieldMax;
      this.effects.floatText(ship.x, ship.y - 20, "SHIELD UP", PAL.cyan);
    } else if (id === "fuelCanister") {
      if (this.state.warp >= 150) return this.toastMessage("Warp charge already full.", "info");
      this.state.warp = Math.min(150, this.state.warp + 40);
      this.effects.floatText(ship.x, ship.y - 20, "+WARP", PAL.blue);
    }
    this.state.consumables[id]--;
    audio.play("pickup");
    this.updateDossier();
  }

  openDialogue(npc) {
    const sector = this.world?.sector ?? this.sectorInfo();
    const lines = dialogueFor(npc, this.state, sector);
    this.openScreen("dialogue", { npc, lines });
  }

  /* ── Screens ───────────────────────────────────────────────────────── */

  openScreen(name, data = {}) {
    if (!name) return;
    this.screen = name;
    this.screenData = data;
    this.menuOpen = true;
    this.input.clear();
    cancelInteract(this.world);
    this.ui.showScreen(name, this.screenContext(name, data));
    audio.play("ui");
  }

  closeScreen() {
    if (!this.screen) return;
    this.screen = null;
    this.screenData = {};
    this.menuOpen = false;
    this.ui.hideScreen();
    audio.play("uiBack");
    this.updateDossier();
  }

  refreshScreen() {
    if (!this.screen) return;
    this.ui.showScreen(this.screen, this.screenContext(this.screen, this.screenData));
  }

  screenContext(name, data) {
    const state = this.state;
    const sector = this.world?.sector ?? this.sectorInfo();
    const sheet = this.sheet;
    const base = {
      state,
      sheet,
      sector,
      game: this,
      data,
      stats: rankProgress(state.xp),
      cargoUsed: cargoUsed(state),
    };
    switch (name) {
      case "fit":
        return { ...base, stations: true };
      case "market":
        return { ...base, market: marketFor(state, sector) };
      case "contracts":
        return { ...base, board: this.currentBoard ?? [], active: state.missions };
      case "hq":
        return { ...base, story: storyCurrent(state), active: state.missions };
      case "shipyard":
        return { ...base, hulls: HULLS, sheet };
      case "codex":
        return { ...base };
      case "map":
        return { ...base };
      default:
        return base;
    }
  }

  /* ── UI actions invoked by the DOM screens ─────────────────────────── */

  doInstall(slotKey, moduleId) {
    const price = moduleId ? stationPrice(this.state, moduleId, this.world?.sector ?? this.sectorInfo()) : 0;
    const result = installModule(this.state, slotKey, moduleId, this.sheet.brownout < 1 ? Math.round(price * 1.0) : price);
    if (!result.ok) {
      this.toastMessage(result.message, "warn");
      audio.play("error");
    } else {
      this.afterFitChange(result.message);
    }
    return result;
  }

  afterFitChange(message) {
    this.syncStats();
    if (this.world?.player) {
      this.world.stats = this.sheet;
      this.world.player.hullMax = this.sheet.hullPoints;
      this.world.player.shieldMax = this.sheet.shield;
      this.world.player.hp = Math.min(this.world.player.hp, this.sheet.hullPoints);
      this.world.player.shield = Math.min(this.world.player.shield, this.sheet.shield);
    }
    this.state.hp = this.world?.player.hp ?? this.state.hp;
    this.art.playerBaked = this.art.playerShip(this.state.hull, this.state.fit);
    this.save(true);
    this.toastMessage(message, "good");
    audio.play("ui");
    this.updateDossier();
    this.ui.refreshDossier?.();
    this.refreshScreen();
  }

  doRepair() {
    const sector = this.world?.sector ?? this.sectorInfo();
    const quote = repairQuote(this.state, this.sheet, sector);
    if (quote.missing <= 0) return this.toastMessage("Hull already intact.", "info");
    if (this.state.credits < quote.cost) return this.toastMessage("Insufficient credits for repairs.", "warn");
    this.state.credits -= quote.cost;
    this.state.hp = this.sheet.hullPoints;
    if (this.world?.player) this.world.player.hp = this.sheet.hullPoints;
    this.state.shield = this.sheet.shield;
    this.save(true);
    this.toastMessage(`Hull repaired for ${fmt(quote.cost)} CR.`, "good");
    audio.play("reward");
    this.ui.refreshDossier?.();
    this.refreshScreen();
  }

  doRefuel() {
    try {
      const q = applyRefuel(this.state, 100);
      this.toastMessage(`Warp cells topped up (${fmt(q.cost)} CR).`, "good");
      audio.play("reward");
    } catch (err) {
      this.toastMessage(err.message ?? "Refuel failed.", "warn");
    }
    this.save(true);
    this.ui.refreshDossier?.();
    this.refreshScreen();
  }

  doRestock() {
    const missing = Math.max(0, this.sheet.missileAmmo - this.state.missiles);
    if (missing <= 0) return this.toastMessage("Magazines full.", "info");
    const cost = missileRestockCost(missing);
    if (this.state.credits < cost) return this.toastMessage("Insufficient credits.", "warn");
    this.state.credits -= cost;
    this.state.missiles = this.sheet.missileAmmo;
    this.toastMessage(`Missiles restocked (${fmt(cost)} CR).`, "good");
    audio.play("reward");
    this.save(true);
    this.ui.refreshDossier?.();
    this.refreshScreen();
  }

  doBuyGood(id, qty) {
    const sector = this.world?.sector ?? this.sectorInfo();
    try {
      const r = buy(this.state, sector, id, qty, this.sheet.cargo);
      this.toastMessage(`Bought ${r.bought} ${GOODS[id].short} for ${fmt(r.spent)} CR.`, "good");
      audio.play("pickup");
    } catch (err) {
      this.toastMessage(err.message, "warn");
      audio.play("error");
    }
    this.save(true);
    this.ui.refreshDossier?.();
    this.refreshScreen();
  }

  doSellGood(id, qty) {
    const sector = this.world?.sector ?? this.sectorInfo();
    try {
      const r = sell(this.state, sector, id, qty);
      const fine = r.fine ? ` (illegal sale fine ${fmt(r.fine)} CR)` : "";
      this.toastMessage(`Sold for ${fmt(r.earned)} CR${fine}.`, fine ? "warn" : "good");
      audio.play("reward");
    } catch (err) {
      this.toastMessage(err.message, "warn");
      audio.play("error");
    }
    this.save(true);
    this.ui.refreshDossier?.();
    this.refreshScreen();
  }

  doBuyConsumable(id) {
    const item = CONSUMABLES[id];
    if (!item) return;
    try {
      buyConsumable(this.state, id, item.price);
      this.toastMessage(`${item.name} purchased.`, "good");
      audio.play("pickup");
    } catch (err) {
      this.toastMessage(err.message, "warn");
    }
    this.save(true);
    this.ui.refreshDossier?.();
    this.refreshScreen();
  }

  doAcceptMission(mission) {
    if (!mission) return;
    const result = accept(this.state, { ...mission }, this.sheet);
    if (!result.ok) {
      this.toastMessage(result.message, "warn");
      audio.play("error");
      return;
    }
    this.state.boardEpoch += 40;
    this.toastMessage(result.message, "good");
    audio.play("ui");
    this.save(true);
    this.refreshObjective();
    this.refreshScreen();
    this.ui.refreshDossier?.();
  }

  doAbandonMission(id) {
    const r = abandon(this.state, id);
    this.toastMessage(r.message, "info");
    this.save(true);
    this.refreshObjective();
    this.refreshScreen();
  }

  doCompleteMission(idOrMission) {
    const mission = typeof idOrMission === "string" ? this.state.missions.find((m) => m.id === idOrMission) : idOrMission;
    if (!mission) return;
    const canFinish = mission.goal
      ? (mission.progress ?? 0) >= (mission.goal.count ?? 1)
      : mission.goals
        ? mission.goals.every((g) => (mission.goalProgress?.[`${g.kind}:${g.target ?? ""}`] ?? 0) >= g.count)
        : false;
    if (!canFinish) {
      this.toastMessage("Contract requirements not met yet.", "warn");
      audio.play("error");
      return;
    }
    const result = complete(this.state, mission);
    if (!result.ok) return this.toastMessage(result.message, "warn");
    this.toastMessage(`Contract paid: +${fmt(result.credits)} CR, +${result.xp} XP.`, "good");
    audio.play("reward");
    if (result.rankUp) {
      setTimeout(() => {
        this.toastMessage(`Rank up: ${SHIP_RANKS[result.rankUp].name}.`, "good");
        audio.play("rankup");
      }, 400);
    }
    if (result.storyMessage) this.showStory(result.storyMessage);
    this.state.stats.missions++;
    this.save(true);
    this.refreshObjective();
    this.refreshScreen();
    this.ui.refreshDossier?.();
    if (this.state.story?.ending) this.openEnding();
  }

  doAcceptStory() {
    const r = acceptStory(this.state);
    this.toastMessage(r.message, r.ok ? "good" : "warn");
    if (r.ok) {
      audio.play("reward");
      this.refreshObjective();
    }
    this.save(true);
    this.refreshScreen();
    this.ui.refreshDossier?.();
  }

  doBuyHull(hullId) {
    const sector = this.world?.sector ?? this.sectorInfo();
    const price = hullPrice(hullId, sector);
    const result = changeHull(this.state, hullId, price);
    if (!result.ok) {
      this.toastMessage(result.message, "warn");
      audio.play("error");
      return;
    }
    this.state.hp = result.stats.hullPoints;
    this.state.shield = result.stats.shield;
    this.afterFitChange(result.message);
    audio.play("rankup");
    this.save(true);
    this.refreshScreen();
  }

  openMap() {
    this.openScreen("map");
  }

  showStory(text) {
    this.openScreen("story", { text });
  }

  openEnding() {
    this.mode = "ending";
    this.openScreen("ending", { text: this.state.story });
  }

  /* ── Save / load / import ──────────────────────────────────────────── */

  save(force = false) {
    if (!this.state) return false;
    if (!force && this.time - this.lastSave < 2) return false;
    this.persistRuntime();
    const ok = saveGame(this.state);
    this.lastSave = this.time;
    if (!ok) {
      this.saveFailures++;
      if (this.saveFailures === 1) this.toastMessage("Save unavailable — storage blocked. Progress kept in memory.", "warn");
    } else this.saveFailures = 0;
    this.ui.setSaveStatus?.(ok);
    return ok;
  }

  persistRuntime() {
    if (this.world) {
      this.state.hp = Math.max(1, Math.round(this.world.player.hp));
      this.state.shield = Math.round(this.world.player.shield);
      this.state.heat = Math.round(this.world.player.heat);
    }
    this.state.playSeconds = Math.round(this.time);
  }

  deleteAndRestart() {
    deleteSave();
    this.pendingState = null;
    this.state = null;
    this.mode = "title";
    this.screen = null;
    this.ui.hideScreen();
    this.ui.setSaveStatus?.(true);
    this.boot();
  }

  exportCode() {
    this.persistRuntime();
    return exportSave(this.state);
  }

  importCode(code) {
    const result = importSave(code);
    if (!result.state) {
      this.toastMessage(result.error ?? "Import failed.", "warn");
      return false;
    }
    this.state = result.state;
    this.ui.hideTitle();
    this.beginCampaign(true);
    this.toastMessage("Campaign imported.", "good");
    return true;
  }

  /* ── Story / objective helpers ─────────────────────────────────────── */

  updateDossier() {
    if (!this.state) return;
    this.ui.updateDossier?.(this.dossier());
  }

  dossier() {
    const state = this.state;
    const sector = this.world?.sector ?? this.sectorInfo();
    const active = state.missions.filter((m) => !m.done);
    const tracked = active.find((m) => m.type === "story") ?? active[0] ?? null;
    return {
      state,
      sector,
      sheet: this.sheet,
      active,
      tracked,
      objective: tracked ? objectiveText(tracked) : null,
      rank: rankProgress(state.xp),
      standing: state.rep,
      mode: this.mode,
      docked: state.docked,
      station: sector.station,
      cargoUsed: cargoUsed(state),
      warp: state.warp,
      missiles: state.missiles,
    };
  }

  refreshObjective() {
    const active = this.state.missions.filter((m) => !m.done);
    const tracked = active.find((m) => m.type === "story") ?? active[0];
    this.objective = tracked ? `◈ ${tracked.title}` : "";
  }

  /* ── Messages ──────────────────────────────────────────────────────── */

  toastMessage(text, tone = "info") {
    if (!text) return;
    this.toast = { text, tone, life: 4.2, max: 4.2 };
    this.ui.toast?.(text, tone);
    this.pushLog(text);
    if (tone === "warn" || tone === "bad") audio.play("error");
  }

  showBanner(title, subtitle, color, life = 3.4) {
    this.banner = { title, subtitle, color, life, max: life };
  }

  pushLog(text) {
    if (!this.state) return;
    this.state.log = this.state.log ?? [];
    this.state.log.push({ t: Math.round(this.time), text });
    if (this.state.log.length > 60) this.state.log.splice(0, this.state.log.length - 60);
  }

  /** Emit a mission event and process any completions. */
  emit(event) {
    const completed = advance(this.state, event);
    for (const m of completed) {
      if (m.type === "story") {
        this.toastMessage(`Story objective ready: ${m.title}.`, "good");
      } else {
        this.toastMessage(`Contract ready to hand in: ${m.title}.`, "good");
      }
    }
    this.refreshObjective();
    return completed;
  }

  handleCombatEvent(event) {
    if (event.type === "kill") {
      this.state.stats.kills = (this.state.stats.kills ?? 0) + 1;
      const enemies = this.world.enemies.filter((e) => !e.friendly);
      const key = this.world.sector.key;
      if (enemies.length === 0) {
        const d = this.state.discovered[key];
        if (d && !d.cleared.includes("hostiles")) d.cleared.push("hostiles");
        this.emit({ type: "patrol", sector: key });
      }
      this.emit({ type: "kill", enemy: event.enemy, sector: key, bounty: event.bounty, boss: event.boss });
      if (this.state.rep[event.faction] > -100 && event.faction === "uss") {
        this.state.rep.uss = clamp(this.state.rep.uss - 3, -100, 100);
      }
      if (event.faction === "uss" || event.faction === "helix") {
        this.state.rep[event.faction] = clamp(this.state.rep[event.faction] - 4, -100, 100);
        this.toastMessage("You attacked a faction vessel. Standing reduced.", "warn");
      }
    } else if (event.type === "friendlyFire") {
      this.toastMessage("Friendly fire! Standing reduced.", "warn");
    } else if (event.type === "playerDestroyed") {
      this.onDeath();
    } else if (event.type === "reinforcement") {
      spawnEncounters(this.world, Math.random, this.state.discovered[this.world.sector.key]);
      this.toastMessage("Corsair reinforcement inbound.", "warn");
    } else if (event.type === "escape") {
      this.toastMessage("A damaged raider escaped.", "info");
    }
  }

  onDeath() {
    if (this.mode !== "flight") return;
    const state = this.state;
    state.stats.deaths = (state.stats.deaths ?? 0) + 1;
    state.hp = this.sheet.hullPoints;
    state.shield = this.sheet.shield;
    // Cargo is lost; credits taxed.
    const tax = Math.floor(state.credits * 0.15);
    state.credits -= tax;
    state.cargo = {};
    state.missiles = Math.max(0, state.missiles - 1);
    this.mode = "gameover";
    audio.play("explode");
    this.effects.flashScreen(0.5, "#ff6b7a");
    this.ui.showGameOver?.({
      tax,
      onRecover: () => {
        this.mode = "flight";
        this.ui.hideScreen();
        this.enterSector(state.sector.q, state.sector.r, "home");
        this.toastMessage("Escape pod recovered. Cargo lost, ship repaired.", "warn");
        this.save(true);
      },
    });
    this.save(true);
  }

  /* ── Frame ──────────────────────────────────────────────────────────── */

  update(dt) {
    this.time += dt;
    this.stats.frames++;
    this.stats.fpsTime += dt;
    if (this.stats.fpsTime > 0.5) {
      this.stats.fps = Math.round(this.stats.frames / this.stats.fpsTime);
      this.stats.frames = 0;
      this.stats.fpsTime = 0;
      this.ui.setPerf?.(this.stats.fps);
    }
    if (this.banner) this.banner.life -= dt;
    if (this.toast) this.toast.life -= dt;

    // Input events run in every mode.
    for (const ev of this.input.drain()) this.handleInputEvent(ev);

    // Effects always animate (except when a modal is open on a station).
    this.effects.step(dt);

    // Auto-save.
    if (this.state && this.time - this.lastSave > GAME.autosaveSeconds) this.save();

    if (!this.state) return;

    if (this.screen) {
      audio.updateEngine({ moving: false, speed: 0, boosting: false, active: false });
      return; // simulation paused under modal screens
    }

    if (this.mode === "flight" && this.world) {
      this.stepFlight(dt);
    } else if (this.mode === "station" && this.interior) {
      this.stepStation(dt);
    }
  }

  stepFlight(dt) {
    const world = this.world;
    const input = this.input.poll(this.assist, this.frame);
    // Slow-motion after big explosions.
    const scale = this.effects.hitStop > 0 ? 0.25 : 1;
    const step = dt * scale;
    world.input.assist = this.assist;

    tickWorld(world, step, input, this.effects);
    this.frame.follow(world.player.x, world.player.y);

    // Engine trails.
    const st = world.stats;
    if (world.player.moving || world.player.boosting) {
      const hull = HULLS[this.state.hull];
      for (const m of hull.mounts.e ?? []) {
        const ox = Math.cos(world.player.angle + Math.PI / 2) * m.x * hull.art.size;
        const oy = Math.sin(world.player.angle + Math.PI / 2) * m.x * hull.art.size;
        const bx = world.player.x + ox - Math.cos(world.player.angle) * hull.art.size * 0.5;
        const by = world.player.y + oy - Math.sin(world.player.angle) * hull.art.size * 0.5;
        this.effects.engineTrail(bx, by, world.player.vx, world.player.vy, world.player.boosting ? PAL.amber : PAL.cyan, world.player.boosting ? 2 : 1);
      }
    }

    // Warp trickle: faster inside nebulae with a scoop.
    const inNebula = world.nebulas.some((n) => Math.hypot(n.x - world.player.x, n.y - world.player.y) < n.radius);
    let regen = st.scoop > 0 && inNebula ? st.scoop * 3 : GAME.warpRegen * 0.05;
    if (st.scoop > 0 && inNebula) regen = st.scoop * 2.6;
    this.state.warp = Math.min(150, this.state.warp + regen * step * 0.5);
    this.state.heat = world.player.heat;
    this.state.missiles = this.state.missiles ?? 0;

    // Ship-kill and pickup events.
    for (const ev of world.events) this.handleCombatEvent(ev);
    if (world.events.length) world.events.length = 0;

    // Interaction results produced by the hold mechanic.
    this.drainWorldEvents();

    // Auto-target: keep a live hostile locked if the current target dies.
    if (!world.target || world.target.dead) world.target = nearestHostile(world) ?? world.station;

    audio.updateEngine({
      moving: world.player.moving,
      speed: Math.hypot(world.player.vx, world.player.vy),
      boosting: world.player.boosting,
      active: true,
      brownout: st.brownout,
    });
  }

  drainWorldEvents() {
    const world = this.world;
    const events = world.events;
    for (const ev of events) {
      if (ev.type === "interact") this.resolveInteract(ev.action, ev.entity);
      else if (ev.type === "interactFail") this.toastMessage("No contact in range.", "info");
      else if (ev.type === "noMissiles") this.toastMessage("Out of missiles.", "warn");
      else if (ev.type === "noLauncher") this.toastMessage("No missile launcher fitted.", "warn");
      else if (ev.type === "loot" && ev.id === "relicCore") this.emit({ type: "collect", id: "relicCore" });
    }
    world.events = [];
  }

  resolveInteract(action, entity) {
    if (action === "dock") {
      this.dock();
      return;
    }
    if (action === "gate") {
      if (entity.silent) {
        this.checkSilentGate();
        return;
      }
      this.openMap();
      return;
    }
    if (action === "salvage") {
      this.salvageWreck(entity);
      return;
    }
    if (action === "scan") {
      this.scanSignal(entity);
      return;
    }
    if (action === "talk") {
      this.openDialogue(entity);
      return;
    }
    if (action === "mine") {
      this.handMine(entity);
    }
  }

  salvageWreck(wreck) {
    if (wreck.salvaged) return;
    wreck.salvaged = true;
    let gained = [];
    for (const item of Object.values(wreck.loot ?? {})) gained.push(item);
    // Loot record: {id: qty}
    const loot = wreck.loot ?? {};
    for (const [id, qty] of Object.entries(loot)) {
      const free = this.sheet.cargo - cargoUsed(this.state);
      if (free <= 0) {
        this.toastMessage("Cargo full — salvage left adrift.", "warn");
        break;
      }
      const take = Math.min(qty, free);
      this.state.cargo[id] = (this.state.cargo[id] ?? 0) + take;
      this.effects.floatText(wreck.x, wreck.y - 20, `+${take} ${(GOODS[id]?.short ?? ITEMS[id]?.name ?? id).toString().slice(0, 8)}`, PAL.cyan);
    }
    const d = this.state.discovered[this.world.sector.key];
    if (d && !d.looted.includes(wreck.id)) d.looted.push(wreck.id);
    this.emit({ type: "salvage", sector: this.world.sector.key, id: wreck.id });
    if (wreck.story === "blackbox") {
      // Black box is used by the story; grant it as a flag.
      this.state.flags.blackBox = true;
      this.emit({ type: "salvage", sector: this.world.sector.key, item: "blackBox" });
      this.showBanner("BLACK BOX RECOVERED", "Corsair traffic cipher in hand", PAL.gold, 3);
    }
    if (loot.relicCore) this.emit({ type: "collect", id: "relicCore" });
    audio.play("pickup");
    this.toastMessage(gained.length ? "Salvage recovered." : "Nothing left in the hull.", "good");
    this.save(true);
  }

  scanSignal(signal) {
    if (signal.scanned) return;
    signal.scanned = true;
    const d = this.state.discovered[this.world.sector.key];
    if (d && !d.scanned.includes(signal.id)) d.scanned.push(signal.id);
    audio.play("scan");
    this.effects.burst(signal.x, signal.y, PAL.lilac, 18, 120);
    const type = signal.signalType;
    let message = "Anomaly catalogued.";
    if (signal.story === "beacon") {
      message = "Beacon decoded: it is broadcasting your registry, and a countdown.";
      this.state.flags.beaconDecoded = true;
    } else if (type === "cache") {
      const credits = 160 + Math.floor(Math.random() * 260);
      this.state.credits += credits;
      message = `A supply cache! +${fmt(credits)} CR.`;
    } else if (type === "derelict") {
      this.state.cargo.scrap = (this.state.cargo.scrap ?? 0) + 2;
      message = "Derelict transponder. Salvage beacon marked: +2 salvage alloy.";
    } else if (type === "relic") {
      this.state.cargo.relicCore = (this.state.cargo.relicCore ?? 0) + 1;
      message = "A relic core, warm to the touch. +1 relic core.";
      this.emit({ type: "collect", id: "relicCore" });
    } else if (type === "trap") {
      message = "It was a lure. Corsairs are dropping out of the dark.";
      const angle = Math.random() * Math.PI * 2;
      for (let i = 0; i < 2; i++) {
        const e = spawnAmbush(this.world, "corsair", this.world.player.x + Math.cos(angle + i) * 520, this.world.player.y + Math.sin(angle + i) * 520);
      }
      audio.play("alarm");
    } else {
      const credits = 90 + Math.floor(Math.random() * 120);
      this.state.credits += credits;
      message = `Survey data sold automatically: +${fmt(credits)} CR.`;
    }
    this.emit({ type: "scan", sector: this.world.sector.key, id: signal.id });
    this.toastMessage(message, "good");
    this.save(true);
  }

  handMine(rock) {
    const n = Math.round(rock.ore * (1 + this.sheet.mining));
    for (let i = 0; i < n; i++) {
      const free = this.sheet.cargo - cargoUsed(this.state);
      if (free <= 0) {
        this.toastMessage("Cargo hold full.", "warn");
        break;
      }
      this.state.cargo[rock.yields] = (this.state.cargo[rock.yields] ?? 0) + 1;
    }
    rock.dead = true;
    audio.play("rock");
    this.effects.burst(rock.x, rock.y, PAL.ember, 14);
    this.effects.floatText(rock.x, rock.y - 20, `+${n} ORE`, PAL.amber);
    this.emit({ type: "asteroid", sector: this.world.sector.key });
    this.toastMessage(`Hand-mined ${n} ${GOODS[rock.yields]?.name ?? "ore"}.`, "good");
    this.save(true);
  }

  checkSilentGate() {
    const hasCipher = this.state.story?.completed?.includes("story5") || this.state.flags.cipher;
    const cores = this.state.cargo.relicCore ?? 0;
    if (hasCipher && cores >= 3) {
      this.state.flags.gateOpened = true;
      this.state.cargo.relicCore = 0;
      this.showBanner("THE SILENT GATE OPENS", "Something on the other side has been waiting", PAL.purple, 5);
      audio.play("jump");
      this.emit({ type: "gate", sector: this.world.sector.key });
      const m = this.state.missions.find((x) => x.story === "story7");
      if (m) {
        // Remove the visit goal; the sentinel still must die.
        this.emit({ type: "visit", sector: this.world.sector.key });
      }
      this.state.flags.sentinelReleased = true;
      const vey = this.world.enemies.find((e) => e.defId === "warlord" && !e.dead);
      if (vey) vey.aggro = 1;
      if (!this.world.enemies.some((e) => e.defId === "sentinel" && !e.dead))
        spawnAmbush(this.world, "sentinel", 0, -900);
      this.state.flags.finalFight = true;
      this.save(true);
    } else {
      const parts = [];
      if (!hasCipher) parts.push("cipher");
      if (cores < 3) parts.push(`${3 - cores} more relic core${3 - cores === 1 ? "" : "s"}`);
      this.toastMessage(`The gate will not open. Missing: ${parts.join(", ")}.`, "warn");
      audio.play("error");
    }
  }

  stepStation(dt) {
    const input = this.input.poll(this.assist, this.frame);
    stepAvatar(this.avatar, this.interior, input, dt);
    stepNpcs(this.interior, dt);
    this.frame.follow(this.avatar.x, this.avatar.y - 20);
    this.stationTarget = probe(this.avatar, this.interior, 36);
    const room = roomUnder(this.interior, this.avatar.x, this.avatar.y);
    this.currentRoom = room;
    audio.updateEngine({ moving: false, speed: 0, boosting: false, active: false });
  }

  /* ── Input event handling ──────────────────────────────────────────── */

  handleInputEvent(ev) {
    switch (ev.type) {
      case "interact":
        if (this.mode === "flight" || this.mode === "station") this.interact();
        break;
      case "map":
        if (this.mode === "flight" && !this.screen) this.openMap();
        else if (this.screen === "map") this.closeScreen();
        break;
      case "target":
        this.cycleTarget();
        break;
      case "assist":
        this.assist = !this.assist;
        this.toastMessage(this.assist ? "Flight assist engaged." : "Drift mode — flight assist off.", "info");
        break;
      case "escape":
        if (this.screen) this.closeScreen();
        else if (this.mode === "flight" || this.mode === "station") this.openScreen("pause");
        break;
      case "pause":
        if (this.mode !== "title") this.openScreen(this.screen === "pause" ? null : "pause");
        break;
      case "screen":
        if (ev.screen === "map") this.openMap();
        else if (this.mode !== "title") this.openScreen(ev.screen);
        break;
      case "consumable":
        if (this.mode === "flight") this.consume(ev.id);
        break;
      case "pointerDown":
        if (this.mode === "flight" && this.screen) this.closeScreen();
        break;
      case "cancel":
        cancelInteract(this.world);
        break;
      default:
        break;
    }
  }

  cycleTarget() {
    if (this.mode !== "flight" || !this.world) return;
    const candidates = [
      ...this.world.enemies.filter((e) => !e.dead && !e.friendly),
      ...this.world.npcs,
      ...this.world.signals.filter((s) => !s.scanned),
      ...this.world.wrecks.filter((w) => !w.salvaged),
      ...this.world.gates,
      this.world.station,
    ].filter(Boolean);
    if (!candidates.length) return;
    const idx = candidates.indexOf(this.world.target);
    this.world.target = candidates[(idx + 1) % candidates.length];
    audio.play("ui");
    this.toastMessage(`Target: ${this.world.target.name}.`, "info");
  }

  /* ── Rendering ─────────────────────────────────────────────────────── */

  render(dt) {
    const frame = this.frame;
    const ctx = frame.begin();
    if (this.mode === "title" || !this.state) {
      this.render.title?.(ctx, frame, this.art, this.time);
      frame.present();
      return;
    }
    if (this.screen === "map") {
      this.render.map?.(ctx, frame, this.state, {
        cursor: this.mapCursor ?? { q: this.state.sector.q, r: this.state.sector.r },
        cursorSector: this.mapCursorSector,
        sectors: this.mapSectorList,
        range: 1 + this.sheet.warpRange,
        routeTo: this.mapCursor,
      });
      frame.present();
      return;
    }
    if (this.mode === "flight" && this.world) {
      this.render.flight(ctx, frame, this.world, this.effects, this.art, {
        dt,
        tint: this.render.sectorTint?.(this.world.sector),
        showLabels: true,
        banner: this.banner,
        prompt: this.banner ? null : this.promptFor(),
        playerBaked: this.art.playerBaked,
      });
      this.render.hud?.(ctx, frame, this.world, this);
      this.render.overlays?.(ctx, frame, this.effects, {
        critical: this.world.player.hp < this.world.player.hullMax * 0.25,
        scanlines: this.state.settings.scanlines,
      });
    } else if ((this.mode === "station" || this.mode === "flight") && this.interior) {
      this.render.station(ctx, frame, this.interior, this.avatar, this.art, {
        time: this.time,
        roomName: this.currentRoom && !this.currentRoom.hidden ? this.currentRoom.name : "",
        target: this.stationTarget,
        banner: this.banner,
        prompt: this.stationTarget ? { text: `[E] ${this.stationTarget.label}` } : { text: "[E] Nothing in reach" },
      });
      this.render.overlays?.(ctx, frame, this.effects, { scanlines: this.state.settings.scanlines });
    } else {
      ctx.fillStyle = "#05080f";
      ctx.fillRect(0, 0, frame.width, frame.height);
    }
    frame.present();
  }

  promptFor() {
    const world = this.world;
    if (!world) return null;
    if (world.holdTarget) return { text: "HOLDING…", color: PAL.amber };
    const f = this.toast && this.toast.life > 0 ? null : null;
    return null;
  }

  /* ── Map helpers used by UI screens ───────────────────────────────── */

  setMapCursor(q, r) {
    this.mapCursor = { q, r };
    const s = generateSector(this.state.seed, q, r);
    s.visited = !!this.state.discovered[s.key]?.visited;
    this.mapCursorSector = s;
    this.ui.updateMapDetail?.(s, this);
  }

  /** Called by the UI to render the DOM map (accessible, crisp text). */
  mapData() {
    const from = this.state.sector;
    const range = 1 + this.sheet.warpRange;
    const sectors = [];
    const radius = 4;
    for (let dq = -radius; dq <= radius; dq++) {
      const r1 = Math.max(-radius, -dq - radius);
      const r2 = Math.min(radius, -dq + radius);
      for (let dr = r1; dr <= r2; dr++) {
        const s = generateSector(this.state.seed, from.q + dq, from.r + dr);
        s.visited = !!this.state.discovered[s.key]?.visited;
        s.canJump = canJump(from, s, range);
        s.cost = jumpWarpCost(from, s);
        s.distance = Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr) >> 1;
        sectors.push(s);
      }
    }
    return sectors;
  }
}

/* ── Module-level helpers ─────────────────────────────────────────────── */

function spawnAmbush(world, id, x, y) {
  const e = createEnemyShip(id, x, y, {});
  e.loot = [{ id: "scrap", qty: 1 + Math.floor(Math.random() * 2) }];
  e.aggro = 1;
  world.enemies.push(e);
  return e;
}

export function dialogueFor(npc, state, sector) {
  const name = npc.name ?? "Dockworker";
  const faction = FACTIONS[npc.faction] ?? FACTIONS.indie;
  const lines = [];
  if (npc.dialogue === "cartographer") {
    lines.push(
      { speaker: "Last Cartographer", text: "You are late. Everyone is late, out here. Do you have the cores?" },
      { speaker: name, text: "The Silent Gate eats cores and pilots alike. Three of them, one cipher, and the courage to stand in the beam." },
      { speaker: name, text: "Vey wants the gate for the Corsairs. You want it for the frontier. I want it closed. Take this either way." },
    );
    if (!state.flags.cipher) {
      lines.push({
        speaker: name,
        text: "Here — the cipher. Do not lose it to a stray missile.",
        action: { type: "flag", flag: "cipher", toast: "Cipher acquired. The Silent Gate can be opened." },
      });
      lines.push({ speaker: name, text: "Bring three relic cores to the Silent Gate at Quill Drift's outer rim. Fly safe. Fly first." });
    } else {
      lines.push({ speaker: name, text: "You have the cipher. The gate is at the deep ring. Do not let Vey beat you to the beam." });
    }
  } else if (npc.type === "broker") {
    lines.push(
      { speaker: name, text: "You want prices? The exchange terminal behind me moves more stock in a shift than you'll move in a month." },
      { speaker: name, text: "Buy low where they dig, sell high where they eat. The rim always pays better — if you live to collect." },
      { speaker: name, text: `Bloom is going for ${Math.round(120 + Math.random() * 60)} a unit in anarchy space. Just saying.` },
    );
  } else if (npc.type === "officer") {
    lines.push(
      { speaker: `Lt. ${name}`, text: "This is United Systems space. Keep your transponder on, your cargo legal, and we will get along." },
      { speaker: `Lt. ${name}`, text: `Standing: ${standingLabel(state.rep.uss)}. ${state.rep.uss >= 50 ? "You are welcome on my deck." : "Do not give me a reason."}` },
    );
  } else if (npc.type === "mechanic") {
    lines.push(
      { speaker: name, text: "Your heat sinks are singing. Fit a cryo sink and you can hold the trigger longer, but the power bill will bite." },
      { speaker: name, text: "Power draw over capacity browns you out. Better to fly one good gun than three that stutter." },
    );
  } else if (npc.type === "pilot") {
    lines.push(
      { speaker: name, text: sector.security === "high" ? "Safe lanes here. Don't get comfortable — the rim is one jump away." : "Watch the dark between the rocks. Corsairs like the shadow side of the belt." },
      { speaker: name, text: "If you see a repeating signal out past Cinder Reach... do not let it see you first." },
    );
  } else {
    lines.push(
      { speaker: name, text: npc.chatter ?? "Keep your hull patched and your cargo insured. Or don't. It's the frontier." },
    );
  }
  return lines;
}
