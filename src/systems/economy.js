import { ECONOMIES, GOODS } from "../config.js";
import { shipStats } from "../customization/fitting.js";

/**
 * Return the persistent local stock record for a sector. Markets are keyed by
 * axial coordinates in the save so stock survives leaving and revisiting.
 */
function ensureMarket(state, sector) {
  const key = sector.key ?? `${sector.q},${sector.r}`;
  state.market ??= {};
  let record = state.market[key];
  if (!record) {
    const economy = ECONOMIES[sector.economy] || {};
    const stock = {};
    for (const [id] of Object.entries(GOODS)) {
      stock[id] = Math.max(0, Math.round((economy.stock?.[id] || 20) * (1 - (economy.bias?.[id] || 0) * 2)));
    }
    record = state.market[key] = { stock: sector.market ?? stock, drift: 0, priceMul: {}, sells: {}, visits: 0 };
  }
  record.stock ??= {};
  sector.market = record.stock;
  return record;
}

/**
 * Calculate market price from economy bias, security, local supply and trade
 * direction. The buy/sell spread keeps arbitrage from the same market negative.
 */
export function priceAt(state, sector, goodId, side = "buy") {
  const good = GOODS[goodId];
  if (!good) return 0;
  const economy = ECONOMIES[sector.economy] || {};
  const bias = economy.bias?.[goodId] || 0;
  const securityFactor = sector.security === "high" ? 0.9 : sector.security === "low" ? 1.1 : sector.security === "anarchy" ? 1.3 : 1;
  const record = ensureMarket(state, sector);
  const stock = record.stock[goodId] ?? economy.stock?.[goodId] ?? 0;
  const supplyFactor = 1 - stock / 100;
  const spread = side === "sell" ? 0.92 : 1.08;
  return Math.max(1, Math.round(good.base * (1 + bias) * securityFactor * (1 + supplyFactor * 0.4) * spread));
}

/** Buy cargo; `capacity` is the ship's derived cargo limit. */
export function buy(state, sector, goodId, amount, capacity = shipStats(state.hull, state.fit).cargo) {
  const fail = (message) => ({ ok: false, bought: 0, cost: 0, spent: 0, message });
  if (!GOODS[goodId]) return fail("Unknown commodity");
  if (!Number.isInteger(amount) || amount <= 0) return fail("Choose a positive whole quantity");
  const record = ensureMarket(state, sector);
  const price = priceAt(state, sector, goodId, "buy");
  const total = price * amount;
  if (state.credits < total) return fail("Insufficient credits");
  if ((record.stock[goodId] ?? 0) < amount) return fail("Insufficient stock");
  if (Math.max(0, capacity - cargoUsed(state)) < amount) return fail("Insufficient cargo capacity");

  record.stock[goodId] -= amount;
  state.credits -= total;
  state.cargo[goodId] = (state.cargo[goodId] || 0) + amount;
  return { ok: true, bought: amount, cost: total, spent: total, message: `Bought ${amount} ${goodId}` };
}

/** Sell cargo back into local supply at the market's bid price. */
export function sell(state, sector, goodId, amount) {
  const fail = (message) => ({ ok: false, sold: 0, income: 0, earned: 0, fine: 0, message });
  if (!GOODS[goodId]) return fail("Unknown commodity");
  if (!Number.isInteger(amount) || amount <= 0) return fail("Choose a positive whole quantity");
  const current = state.cargo?.[goodId] || 0;
  if (current < amount) return fail("Insufficient cargo");
  const record = ensureMarket(state, sector);
  const income = priceAt(state, sector, goodId, "sell") * amount;
  state.cargo[goodId] -= amount;
  state.credits += income;
  record.stock[goodId] = Math.min(999, (record.stock[goodId] ?? 0) + amount);
  state.stats ??= {};
  state.stats.trades = (state.stats.trades || 0) + 1;
  state.stats.creditsEarned = (state.stats.creditsEarned || 0) + income;
  return { ok: true, sold: amount, income, earned: income, fine: 0, message: `Sold ${amount} ${goodId}` };
}

/** Legal-market display and sale availability for a commodity at a port. */
export function goodStatusFor(sector, goodId) {
  const legal = GOODS[goodId]?.legal ?? "legal";
  if (legal === "restricted") return sector.security === "high" ? "Restricted" : "Legal";
  if (legal === "contraband") return sector.security === "high" ? "Illegal" : "Contraband";
  return "Legal";
}

export function isIllegalHere(sector, goodId) {
  return goodStatusFor(sector, goodId) === "Illegal";
}

export function canSellHere(sector, goodId) {
  return !isIllegalHere(sector, goodId) && goodStatusFor(sector, goodId) !== "Restricted";
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
  const record = ensureMarket(state, sector);
  record.visits = (record.visits || 0) + 1;
  return { stock: record.stock, economy: sector.economy, security: sector.security };
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
export function refuelQuote(state, amount = 100) {
  const missing = Math.max(0, Math.min(amount, 150 - (state.warp || 0)));
  return { missing, cost: missing * 2 };
}

export function applyRefuel(state, amount = 100) {
  const quote = refuelQuote(state, amount);
  if (quote.missing <= 0) return { ok: false, cost: 0, missing: 0 };
  if (state.credits < quote.cost) throw new Error("Insufficient credits");
  state.credits -= quote.cost;
  state.warp = Math.min(150, (state.warp || 0) + quote.missing);
  return { ok: true, cost: quote.cost, missing: quote.missing };
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
