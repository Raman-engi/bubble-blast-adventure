/*
 * Player economy: coins + booster inventory.
 * One single place that reads/writes booster counts so the map, the shop and
 * the game can never disagree with each other.
 */

// New key: older builds wrongly saved 0 for Fire/Lightning/Rainbow forever.
const INVENTORY_KEY = 'bubble-blast-inventory-v2';
const COINS_KEY = 'bubble-blast-coins';
const DAILY_KEY = 'bubble-blast-daily-gift';

export const POWER_BOOSTERS = ['fire', 'lightning', 'rainbow', 'bomb'];
export const ALL_ITEMS = [...POWER_BOOSTERS, 'extraShot', 'shuffle'];

export const ITEM_META = {
  fire: { label: 'Fire', icon: '🔥', detail: 'Burns the whole colour cluster you hit' },
  lightning: { label: 'Lightning', icon: '⚡', detail: 'Zaps the entire row you hit' },
  rainbow: { label: 'Rainbow', icon: '🌈', detail: 'Matches with any colour group' },
  bomb: { label: 'Bomb', icon: '💣', detail: 'Blasts everything nearby' },
  extraShot: { label: '+3 Shots', icon: '➕', detail: 'Adds 3 extra shots' },
  shuffle: { label: 'Shuffle', icon: '🔀', detail: 'Rearranges the board colours' },
};

export const PRICES = {
  fire: 50,
  lightning: 60,
  rainbow: 70,
  bomb: 60,
  extraShot: 40,
  shuffle: 40,
};

export const STARTER_INVENTORY = {
  fire: 3,
  lightning: 3,
  rainbow: 3,
  bomb: 3,
  aimGuide: 3,
  extraShot: 2,
  shuffle: 2,
};

const STARTER_COINS = 150;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked (private mode). The game keeps working.
  }
}

function announce() {
  try {
    window.dispatchEvent(new Event('bb-economy'));
  } catch {
    // ignore
  }
}

export function getInventory() {
  const saved = read(INVENTORY_KEY);

  if (!saved) {
    write(INVENTORY_KEY, STARTER_INVENTORY);
    return { ...STARTER_INVENTORY };
  }

  return { ...STARTER_INVENTORY, ...saved };
}

export function setInventory(inventory) {
  write(INVENTORY_KEY, inventory);
  announce();
  return inventory;
}

export function getCoins() {
  const saved = read(COINS_KEY);

  if (saved === null) {
    write(COINS_KEY, STARTER_COINS);
    return STARTER_COINS;
  }

  return Math.max(0, Number(saved) || 0);
}

export function addCoins(amount) {
  const total = Math.max(0, getCoins() + Math.round(amount));
  write(COINS_KEY, total);
  announce();
  return total;
}

export function addItems(items = {}) {
  const inventory = getInventory();

  for (const [key, count] of Object.entries(items)) {
    inventory[key] = Math.max(0, (inventory[key] || 0) + count);
  }

  setInventory(inventory);
  return inventory;
}

/* Overwrite the local cache with the server's wallet (server is the source of truth). */
export function applyWallet(wallet) {
  if (!wallet) return;

  if (wallet.coins !== undefined) {
    write(COINS_KEY, Math.max(0, Number(wallet.coins) || 0));
  }

  if (wallet.boosterInventory) {
    write(INVENTORY_KEY, { ...STARTER_INVENTORY, ...wallet.boosterInventory });
  }

  announce();
}

export function buyItem(key) {
  const price = PRICES[key];

  if (!price) return { ok: false, reason: 'unknown' };

  const coins = getCoins();

  if (coins < price) return { ok: false, reason: 'coins', coins };

  write(COINS_KEY, coins - price);
  addItems({ [key]: 1 });

  return { ok: true, coins: coins - price };
}

/* Reward for finishing a level. Replays pay less so boosters cannot be farmed. */
export function grantLevelReward({ level, stars, score, firstClear }) {
  const coins = Math.round(
    (20 + stars * 12 + Math.min(40, Math.floor((score || 0) / 250))) *
      (firstClear ? 1 : 0.5)
  );

  const items = {};

  if (firstClear) {
    // One free booster every first clear, rotating through the power-ups.
    items[POWER_BOOSTERS[(level - 1) % POWER_BOOSTERS.length]] = 1;
  }

  if (stars >= 3) {
    items.rainbow = (items.rainbow || 0) + 1;
  }

  addCoins(coins);
  addItems(items);

  return { coins, items };
}

/* One free gift per calendar day */
export function claimDailyGift() {
  const today = new Date().toDateString();

  if (read(DAILY_KEY) === today) return null;

  write(DAILY_KEY, today);

  const items = { fire: 1, lightning: 1, rainbow: 1, bomb: 1 };
  const coins = 30;

  addItems(items);
  addCoins(coins);

  return { coins, items };
}
