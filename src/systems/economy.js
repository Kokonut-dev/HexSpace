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
} from "../config.js";
import { hexDistance } from "../world/hex.js";
import { shipStats } from "../customization/fitting.js";

/**
 * Calculate market price at a sector for a good.
 * Bias from ECONOMY + sector security + base price.
 */
export function priceAt(state, sector, goodId) {
  const good = GOODS[goodId];
  if (!good) return 0;

  const econ = ECONOMIES[sector.economy] || {};
  const bias = econ.bias?.[goodId] || 0;
  const securityFactor = sector.security === "high" ? 0.9 : sector.security === "low" ? 1.1 : sector.security === "anarchy" ? 1.3 : 1.0;
  const stock = sector.market?.[goodId] || econ.stock?.[goodId] || 0;

  // Supply/demand curve
  const supplyFactor = 1 - (stock / 100);
  const price = good.base * (1 + bias) * securityFactor * (1 + supplyFactor * 0.4);
  return Math.round(price);
}

/**
 * Buy goods from a sector market.
 * Returns { ok, bought, cost, message }.
 */
export function buy(state, sector, goodId, amount, creditsAvailable) {
  const price = priceAt(state, sector, goodId);
  const total = price * amount;
  
  if (creditsAvailable < total) {
    return { ok: false, bought: 0, cost: 0, message: "Insufficient credits" };
  }

  const stock = sector.market?.[goodId] || 0;
  if (stock < amount) {
    return { ok: false, bought: 0, cost: 0, message: "Insufficient stock" };
  }

  const capacity = SHIP_RANKS.find(r => r.rank === state.rank)?.xp || shipStats(state.hull, state.fit).cargo || 14;
  const used = cargoUsed(state);
  const free = Math.max(0, capacity - used);
  if (free < amount) {
    return { ok: false, bought: 0, cost: 0, message: "Insufficient cargo capacity" };
  }

  // Execute
  sector.market[goodId] -= amount;
  state.credits -= total;
  state.cargo[goodId] = (state.cargo?.[goodId] || 0) + amount;

  return { ok: true, bought: amount, cost: total, message: `Bought ${amount} ${goodId}` };
}

/**
 * Sell goods to a sector market.
 * Returns { ok, sold, income, message }.
 */
export function sell(state, sector, goodId, amount) {
  const current = state.cargo?.[goodId] || 0;
  if (current < amount) {
    return { ok: false, sold: 0, income: 0, message: "Insufficient cargo" };
  }

  const price = priceAt(state, sector, goodId);
  const income = price * amount;

  // Execute
  state.cargo[goodId] -= amount;
  state.credits += income;
  sector.market[goodId] = (sector.market?.[goodId] || 0) + amount;

  return { ok: true, sold: amount, income, message: `Sold ${amount} ${goodId}` };
}

/**
 * Calculate cargo used in state.
 */
export function cargoUsed(state) {
  const cargo = state.cargo || {};
  return Object.values(cargo).reduce((sum, v) => sum + v, 0);
}

/**
 * Calculate cargo free in state.
 */
export function cargoFree(state, capacity) {
  const used = cargoUsed(state);
  return Math.max(0, capacity - used);
}

/**
 * Calculate cargo value in state.
 */
export function cargoValue(state, sector) {
  const cargo = state.cargo || {};
  return Object.entries(cargo).reduce((sum, [goodId, amount]) => {
    const price = priceAt(state, sector, goodId);
    return sum + price * amount;
  }, 0);
}

/**
 * Trade hint: best commodity to buy/sell.
 */
export function tradeHint(state, currentSector, targetSector, credits) {
  const goods = Object.keys(GOODS);
  let best = null;
  let maxProfit = 0;

  for (const goodId of goods) {
    const buyPrice = priceAt(state, currentSector, goodId);
    const sellPrice = priceAt(state, targetSector, goodId);
    const maxBuy = Math.floor(credits / buyPrice);
    const profit = (sellPrice - buyPrice) * maxBuy;
    if (profit > maxProfit) {
      maxProfit = profit;
      best = { goodId, buyPrice, sellPrice, profit, maxBuy };
    }
  }
  return best;
}

/**
 * Market for a sector.
 */
export function marketFor(state, sector) {
  const econ = ECONOMIES[sector.economy] || {};
  const stock = {};
  for (const [goodId, base] of Object.entries(GOODS)) {
    const bias = econ.bias?.[goodId] || 0;
    const qty = Math.max(0, Math.round((econ.stock?.[goodId] || 20) * (1 - bias * 2)));
    stock[goodId] = qty;
  }
  return { stock, economy: sector.economy, security: sector.security };
}

/**
 * Buy consumable from station.
 */
export function buyConsumable(state, id, price) {
  if (state.credits < price) throw new Error("Insufficient credits");
  state.credits -= price;
  state.consumables[id] = (state.consumables[id] || 0) + 1;
  return { ok: true };
}

/**
 * Refuel warp cells.
 */
export function applyRefuel(state, amount) {
  const cost = amount * 2; // 2 CR per unit
  if (state.credits < cost) throw new Error("Insufficient credits");
  state.credits -= cost;
  state.warp = Math.min(150, state.warp + amount);
  return { ok: true, cost };
}

/**
 * Missile restock cost.
 */
export function missileRestockCost(missing) {
  return missing * 5;
}

/**
 * Standing label.
 */
export function standingLabel(rep) {
  if (rep >= 50) return "Ally";
  if (rep >= 0) return "Friendly";
  if (rep >= -40) return "Neutral";
  if (rep >= -80) return "Hostile";
  return "Enemy";
}
