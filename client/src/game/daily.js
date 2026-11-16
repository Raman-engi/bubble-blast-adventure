import { levelFor } from './levels';
import { addCoins, addItems } from './economy';

/* Daily challenge: one deterministic puzzle per UTC date.
   The formula mirrors server/src/index.js (dailyFor) so offline play matches. */
export const todayKey = () => new Date().toISOString().slice(0, 10);

const BOOSTERS = ['fire', 'lightning', 'rainbow', 'bomb'];
const STORE = 'bubble-blast-daily-v1';

export function dailyFor(day = todayKey()) {
  const seed = [...day].reduce((t, ch, i) => t + ch.charCodeAt(0) * (i + 3), 0);
  const level = 20 + (seed % 80);
  const shots = 20 + (seed % 6);

  return {
    date: day,
    level,
    shots,
    objective: levelFor(level).objective,
    reward: { coins: 500, booster: BOOSTERS[seed % 4], quantity: 1 },
  };
}

/* Level config used when playing the daily (shot budget comes from the daily). */
export const dailyConfig = day => {
  const d = dailyFor(day);
  return { ...levelFor(d.level), shots: d.shots };
};

export function readDailyLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}

/* Guest/offline completion: coins + booster + streak, once per day. */
export function completeDailyLocal(score, stars) {
  const day = todayKey();
  const saved = readDailyLocal();
  const daily = dailyFor(day);
  const best = Math.max(Number(saved.best?.[day]?.score || 0), score);
  const next = { ...saved, best: { [day]: { score: best, stars } } };

  if (saved.lastDate === day) {
    localStorage.setItem(STORE, JSON.stringify(next));
    return { alreadyClaimed: true, streak: saved.streak || 1 };
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = saved.lastDate === yesterday ? (saved.streak || 0) + 1 : 1;
  const coins = daily.reward.coins + Math.min(10, streak) * 20;

  addCoins(coins);
  addItems({ [daily.reward.booster]: 1 });
  localStorage.setItem(STORE, JSON.stringify({ ...next, lastDate: day, streak }));

  return { streak, reward: { coins, booster: daily.reward.booster } };
}
