
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import dns from 'node:dns';


if (process.env.NODE_ENV !== 'production') {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
}

const GAME_NAME = process.env.GAME_NAME || 'BUBBLE BLAST ADVENTURE';
const MAX_LEVEL = 120;
const MAX_BOMBS = 5;
const RECHARGE_MS = 24 * 60 * 60 * 1000;

const WORLD_NAMES = [
  'Bubble Bay', 'Coral Coast', 'Candy Canyon', 'Crystal Forest',
  'Cloud Kingdom', 'Lava Peaks', 'Mystic Marsh', 'Aurora Isles',
  'Dragon Ridge', 'Starfall Citadel', 'Moonlight Harbor', 'Eternal Galaxy'
];

const BOOSTER_KEYS = [
  'bomb', 'fire', 'lightning', 'rainbow',
  'aimGuide', 'extraShot', 'shuffle'
];

const app = express();

app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedOrigins = (
  process.env.CLIENT_ORIGIN || 'http://localhost:5173'
).split(',').map(value => value.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '30kb' }));

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

app.use('/api/games', rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

const inventorySchema = new mongoose.Schema({
  bomb: { type: Number, default: 2, min: 0, max: 99 },
  fire: { type: Number, default: 2, min: 0 },
  lightning: { type: Number, default: 2, min: 0 },
  rainbow: { type: Number, default: 2, min: 0 },
  aimGuide: { type: Number, default: 3, min: 0 },
  extraShot: { type: Number, default: 1, min: 0 },
  shuffle: { type: Number, default: 1, min: 0 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 40
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  currentLevel: {
    type: Number,
    default: 1,
    min: 1,
    max: MAX_LEVEL
  },
  totalScore: { type: Number, default: 0, min: 0 },
  totalStars: { type: Number, default: 0, min: 0 },
  completedLevels: { type: [Number], default: [] },
  levelStars: { type: mongoose.Schema.Types.Mixed, default: {} },
  bubblesPopped: { type: Number, default: 0 },
  rescuedObjects: { type: Number, default: 0 },
  bestCombo: { type: Number, default: 0 },
  boosterInventory: {
    type: inventorySchema,
    default: () => ({})
  },
  boosterNextRechargeAt: {
    type: Date,
    default: () => new Date(Date.now() + RECHARGE_MS)
  },
  coins: { type: Number, default: 150, min: 0 },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dailyBest: { type: mongoose.Schema.Types.Mixed, default: {} },
  walletSynced: { type: Boolean, default: false },
  dailyStreak: { type: Number, default: 0 },
  boosterUseCount: { type: Number, default: 0 },
  lastDailyDate: { type: String, default: '' }
}, { timestamps: true });

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  levelId: { type: Number, required: true },
  sessionToken: { type: String, unique: true },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  shotsUsed: Number,
  score: Number,
  stars: Number,
  bubblesPopped: Number,
  rescuedObjects: Number,
  bestCombo: Number,
  boostersUsed: { type: [String], default: [] },
  completed: Boolean,
  status: {
    type: String,
    enum: ['active', 'completed', 'rejected'],
    default: 'active'
  }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Session = mongoose.models.GameSession ||
  mongoose.model('GameSession', sessionSchema);

const customLevelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  difficulty: { type: String, default: 'Custom' },
  objective: { type: String, default: 'clear_all' },
  shots: { type: Number, default: 25, min: 5, max: 60 },
  colors: { type: Number, default: 4, min: 2, max: 6 },
  targetScore: { type: Number, default: 500, min: 0 },
  board: { type: [[mongoose.Schema.Types.Mixed]], default: [] },
  availableBoosters: { type: [String], default: [] },
  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

const CustomLevel = mongoose.models.CustomLevel ||
  mongoose.model('CustomLevel', customLevelSchema);

const sign = user => jwt.sign(
  { id: user.id },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

const publicUser = user => ({
  id: user.id,
  name: user.name,
  email: user.email
});

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) throw new Error('Missing token');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) throw new Error('User missing');

    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
  } catch {
    req.user = null;
  }

  next();
};

// Admins are chosen by email in the server .env (never in the client bundle).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);

const adminOnly = (req, res, next) =>
  ADMIN_EMAILS.includes(req.user?.email) ? next()
    : res.status(403).json({ message: 'Admin access required' });

async function applyBoosterRecharge(user) {
  const now = Date.now();

  if (!user.boosterNextRechargeAt) {
    user.boosterNextRechargeAt = new Date(now + RECHARGE_MS);
    await user.save();
  }

  const next = user.boosterNextRechargeAt.getTime();

  if (now >= next) {
    const elapsed = Math.floor((now - next) / RECHARGE_MS) + 1;
    const current = Number(user.boosterInventory?.bomb || 0);

    const added = Math.min(
      elapsed,
      Math.max(0, MAX_BOMBS - current)
    );

    if (added > 0) {
      user.boosterInventory.bomb = current + added;
      user.markModified('boosterInventory');
    }

    user.boosterNextRechargeAt = new Date(
      next + elapsed * RECHARGE_MS
    );

    await user.save();
  }

  return {
    boosterInventory: user.boosterInventory,
    boosterNextRechargeAt: user.boosterNextRechargeAt
  };
}

const difficultyFor = id =>
  id <= 5 ? 'Tutorial' :
  id <= 10 ? 'Beginner' :
  id <= 20 ? 'Easy' :
  id <= 30 ? 'Medium' :
  id <= 40 ? 'Hard' : 'Expert';

const levelMeta = id => ({
  id,
  world: Math.ceil(id / 10),
  worldName: WORLD_NAMES[Math.floor((id - 1) / 10)],
  difficulty: difficultyFor(id),
  unlockedBy: id === 1 ? null : id - 1
});

const ACHIEVEMENTS = [
  ['First Pop', 'Pop your first bubble', u => u.bubblesPopped >= 1],
  ['Bubble Beginner', 'Complete 5 levels', u => u.completedLevels.length >= 5],
  ['Perfect Aim', 'Earn 3 stars on a level',
    u => Object.values(u.levelStars || {}).some(v => v >= 3)],
  ['Combo Master', 'Reach a x10 combo', u => u.bestCombo >= 10],
  ['Bubble Hunter', 'Pop 1,000 bubbles', u => u.bubblesPopped >= 1000],
  ['Rescue Hero', 'Rescue 25 hidden hatchlings', u => u.rescuedObjects >= 25],
  ['Star Collector', 'Earn 50 stars', u => u.totalStars >= 50],
  ['Booster Expert', 'Use 25 boosters', u => u.boosterUseCount >= 25],
  ['Level Master', 'Complete 40 levels', u => u.completedLevels.length >= 40],
  ['Bubble Legend', 'Earn 100,000 points', u => u.totalScore >= 100000]
];

/* HEALTH */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    gameName: GAME_NAME,
    levelCount: MAX_LEVEL,
    apiVersion: '2.1'
  });
});

/* AUTH */
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;

    if (
      name.length < 2 ||
      name.length > 40 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        message: 'Enter a valid name, email and password (8–72 characters).'
      });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12)
    });

    res.status(201).json({
      token: sign(user),
      user: publicUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email });

    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await applyBoosterRecharge(user);

    res.json({
      token: sign(user),
      user: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json(publicUser(req.user));
});

app.post('/api/auth/logout', auth, (req, res) => {
  res.json({ ok: true });
});

/* LEVELS */
app.get('/api/levels', (req, res) => {
  res.json({
    levels: Array.from(
      { length: MAX_LEVEL },
      (_, index) => levelMeta(index + 1)
    )
  });
});

app.get('/api/levels/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1 || id > MAX_LEVEL) {
    return res.status(404).json({ message: 'Level not found' });
  }

  res.json(levelMeta(id));
});

/* PLAYER PROGRESS */
app.get('/api/player/progress', auth, async (req, res, next) => {
  try {
    const user = req.user;
    const recharge = await applyBoosterRecharge(user);

    res.json({
      currentLevel: user.currentLevel,
      totalScore: user.totalScore,
      totalStars: user.totalStars,
      completedLevels: user.completedLevels,
      levelStars: user.levelStars || {},
      bubblesPopped: user.bubblesPopped,
      rescuedObjects: user.rescuedObjects,
      bestCombo: user.bestCombo,
      boosterInventory: recharge.boosterInventory,
      boosterNextRechargeAt: recharge.boosterNextRechargeAt,
      dailyStreak: user.dailyStreak
    });
  } catch (error) {
    next(error);
  }
});

/* CONSUME ONE BOOSTER IMMEDIATELY */
app.post('/api/player/boosters/use', auth, async (req, res, next) => {
  try {
    const user = req.user;
    await applyBoosterRecharge(user);

    const key = String(req.body.key || '');

    if (!BOOSTER_KEYS.includes(key)) {
      return res.status(400).json({ message: 'Invalid booster' });
    }

    const inventory = user.boosterInventory || {};
    const available = Number(inventory[key] || 0);

    if (available < 1) {
      return res.status(409).json({
        message: `No ${key} boosters remaining`,
        boosterInventory: inventory
      });
    }

    inventory[key] = available - 1;
    user.boosterInventory = inventory;
    user.markModified('boosterInventory');
    user.boosterUseCount = (user.boosterUseCount || 0) + 1;

    await user.save();

    res.json({
      ok: true,
      boosterInventory: user.boosterInventory,
      boosterNextRechargeAt: user.boosterNextRechargeAt
    });
  } catch (error) {
    next(error);
  }
});

/* DAILY CHALLENGE: one deterministic puzzle per UTC date */
const todayKey = () => new Date().toISOString().slice(0, 10);

function dailyFor(day) {
  const seed = [...day].reduce((t, ch, i) => t + ch.charCodeAt(0) * (i + 3), 0);
  const objectives = ['clear_all', 'score', 'drop', 'rescue'];

  return {
    id: `daily-${day}`,
    date: day,
    level: 20 + (seed % 80),
    objective: objectives[seed % objectives.length],
    shots: 20 + (seed % 6),
    reward: { coins: 500, booster: POWER_BOOSTERS_DAILY[seed % 4], quantity: 1 }
  };
}
const POWER_BOOSTERS_DAILY = ['fire', 'lightning', 'rainbow', 'bomb'];

/* WALLET (coins + boosters) — the server is the source of truth.
   Prices and rewards are decided here, so a client cannot invent coins. */
const SHOP_PRICES = {
  fire: 50, lightning: 60, rainbow: 70, bomb: 60, extraShot: 40, shuffle: 40
};
const POWER_BOOSTERS = ['fire', 'lightning', 'rainbow', 'bomb'];
const MAX_ITEM = 99;
const MAX_COINS = 100000;

const walletOf = user => ({
  coins: user.coins ?? 150,
  boosterInventory: user.boosterInventory
});

const clampInt = (value, max) =>
  Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));

app.get('/api/player/wallet', auth, async (req, res, next) => {
  try {
    await applyBoosterRecharge(req.user);
    res.json(walletOf(req.user));
  } catch (error) { next(error); }
});

/* One-time import of a guest/offline save. After the first sync the server
   values win and later syncs only return what the server holds. */
app.post('/api/player/wallet/sync', auth, async (req, res, next) => {
  try {
    const user = req.user;

    if (!user.walletSynced) {
      const incoming = req.body.boosterInventory || {};
      const inventory = { ...(user.boosterInventory?.toObject?.() || user.boosterInventory || {}) };

      for (const key of BOOSTER_KEYS) {
        if (key in incoming) {
          inventory[key] = Math.max(
            Number(inventory[key] || 0),
            clampInt(incoming[key], 10)
          );
        }
      }

      user.boosterInventory = inventory;
      user.markModified('boosterInventory');
      user.coins = Math.max(user.coins ?? 0, clampInt(req.body.coins, 500));
      user.walletSynced = true;
      await user.save();
    }

    res.json(walletOf(user));
  } catch (error) { next(error); }
});

app.post('/api/player/wallet/buy', auth, async (req, res, next) => {
  try {
    const user = req.user;
    const key = String(req.body.key || '');
    const price = SHOP_PRICES[key];

    if (!price) return res.status(400).json({ message: 'Invalid item' });

    if ((user.coins ?? 0) < price) {
      return res.status(402).json({ message: 'Not enough coins', ...walletOf(user) });
    }

    const inventory = { ...(user.boosterInventory?.toObject?.() || user.boosterInventory || {}) };

    if ((inventory[key] || 0) >= MAX_ITEM) {
      return res.status(409).json({ message: 'Inventory full', ...walletOf(user) });
    }

    user.coins -= price;
    inventory[key] = (inventory[key] || 0) + 1;
    user.boosterInventory = inventory;
    user.markModified('boosterInventory');
    await user.save();

    res.json({ ok: true, ...walletOf(user) });
  } catch (error) { next(error); }
});

/* START GAME */
app.post('/api/games/start', auth, async (req, res, next) => {
  try {
    const levelId = Number(req.body.levelId);

    if (
      !Number.isInteger(levelId) ||
      levelId < 1 ||
      levelId > MAX_LEVEL ||
      (levelId > req.user.currentLevel &&
        !(req.body.daily && dailyFor(todayKey()).level === levelId))
    ) {
      return res.status(403).json({ message: 'Level is locked or invalid' });
    }

    const sessionToken = crypto.randomUUID();

    const session = await Session.create({
      userId: req.user.id,
      levelId,
      sessionToken
    });

    res.status(201).json({
      sessionId: session.id,
      sessionToken,
      level: levelMeta(levelId)
    });
  } catch (error) {
    next(error);
  }
});

/* COMPLETE GAME */
app.post('/api/games/complete', auth, async (req, res, next) => {
  try {
    const {
      sessionId,
      level,
      completed,
      score,
      shotsUsed,
      bubblesPopped,
      rescued = 0,
      bestCombo,
      stars,
      boostersUsed = []
    } = req.body;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ message: 'Invalid game session' });
    }

    const session = await Session.findOne({
      _id: sessionId,
      userId: req.user.id,
      status: 'active'
    });

    if (!session || session.levelId !== Number(level)) {
      return res.status(409).json({
        message: 'Session invalid, already submitted or not owned by this player'
      });
    }

    const nums = [
      score, shotsUsed, bubblesPopped, rescued, bestCombo, stars
    ];

    const elapsed = Date.now() - session.startedAt.getTime();

    const suspicious =
      typeof completed !== 'boolean' ||
      nums.some(value => !Number.isInteger(value) || value < 0) ||
      stars > 3 ||
      shotsUsed > 80 ||
      bubblesPopped > 1200 ||
      rescued > 100 ||
      score > 250000 ||
      bestCombo > 100 ||
      elapsed < 1200 ||
      elapsed > 12 * 60 * 60 * 1000 ||
      !Array.isArray(boostersUsed) ||
      boostersUsed.length > 30 ||
      boostersUsed.some(value => !BOOSTER_KEYS.includes(value));

    if (suspicious) {
      session.status = 'rejected';
      await session.save();

      return res.status(400).json({
        message: 'Game result failed basic anti-cheat checks'
      });
    }

    session.status = 'completed';

    Object.assign(session, {
      completed: !!completed,
      score,
      shotsUsed,
      bubblesPopped,
      rescuedObjects: rescued,
      bestCombo,
      stars,
      boostersUsed,
      completedAt: new Date()
    });

    await session.save();

    const user = req.user;

    // Boosters spent during the level are charged once, here (server-side),
    // never below zero. /player/boosters/use is a separate, immediate path.
    {
      const inventory = { ...(user.boosterInventory?.toObject?.() || user.boosterInventory || {}) };

      for (const key of boostersUsed) {
        inventory[key] = Math.max(0, Number(inventory[key] || 0) - 1);
      }

      user.boosterInventory = inventory;
      user.markModified('boosterInventory');
      user.boosterUseCount = (user.boosterUseCount || 0) + boostersUsed.length;
    }

    let firstClear = false;

    if (completed) {
      firstClear = !user.completedLevels.includes(Number(level));

      user.currentLevel = Math.min(
        MAX_LEVEL,
        Math.max(user.currentLevel, Number(level) + 1)
      );

      if (firstClear) {
        user.completedLevels.push(Number(level));
        user.totalScore += score;
        user.bubblesPopped += bubblesPopped;
        user.rescuedObjects += rescued;
      }

      const oldStars = Number(user.levelStars?.[level] || 0);

      if (stars > oldStars) {
        user.totalStars += stars - oldStars;
        user.levelStars = {
          ...(user.levelStars || {}),
          [level]: stars
        };
      }

      user.bestCombo = Math.max(user.bestCombo, bestCombo);
    }

    // Level reward is computed on the server (replays pay half, no farming).
    let reward = { coins: 0, items: {} };

    if (completed) {
      const coins = Math.round(
        (20 + stars * 12 + Math.min(40, Math.floor(score / 250))) * (firstClear ? 1 : 0.5)
      );
      const items = {};

      if (firstClear) {
        items[POWER_BOOSTERS[(Number(level) - 1) % POWER_BOOSTERS.length]] = 1;
      }

      if (stars >= 3) items.rainbow = (items.rainbow || 0) + 1;

      const inventory = { ...(user.boosterInventory?.toObject?.() || user.boosterInventory || {}) };

      for (const [key, count] of Object.entries(items)) {
        inventory[key] = Math.min(MAX_ITEM, (inventory[key] || 0) + count);
      }

      user.coins = Math.min(MAX_COINS, (user.coins ?? 0) + coins);
      user.boosterInventory = inventory;
      user.markModified('boosterInventory');
      reward = { coins, items };
    }

    await user.save();

    res.json({
      ok: true,
      reward,
      wallet: walletOf(user),
      progress: {
        currentLevel: user.currentLevel,
        completedLevels: user.completedLevels,
        boosterInventory: user.boosterInventory
      },
      ranked: false,
      message: 'Progress saved.'
    });
  } catch (error) {
    next(error);
  }
});

/* GAME HISTORY */
app.get('/api/games/history', auth, async (req, res, next) => {
  try {
    const rows = await Session.find({
      userId: req.user.id
    }).sort({ createdAt: -1 }).limit(50).lean();

    res.json({ sessions: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/games/:id', auth, async (req, res, next) => {
  try {
    const session = await Session.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();

    if (!session) {
      return res.status(404).json({ message: 'Game session not found' });
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
});

/* ACHIEVEMENTS */
app.get('/api/achievements', (req, res) => {
  res.json({
    achievements: ACHIEVEMENTS.map(([name, description], index) => ({
      id: index + 1,
      name,
      description
    }))
  });
});

app.get('/api/achievements/me', auth, (req, res) => {
  const unlocked = ACHIEVEMENTS.flatMap(
    ([,, test], index) => test(req.user) ? [index + 1] : []
  );

  res.json({ achievements: unlocked });
});

/* LEADERBOARD */
const PERIODS = { weekly: 7, monthly: 30 };

/* Leaderboard: global (profile totals), weekly/monthly (sum of each level's
   best validated session in the window) and friends. */
app.get('/api/leaderboard', optionalAuth, async (req, res, next) => {
  try {
    const type = String(req.query.type || 'global');
    let rows;

    if (PERIODS[type]) {
      const since = new Date(Date.now() - PERIODS[type] * 86400000);

      const best = await Session.aggregate([
        { $match: { status: 'completed', completed: true, completedAt: { $gte: since } } },
        { $group: { _id: { u: '$userId', l: '$levelId' }, score: { $max: '$score' }, stars: { $max: '$stars' }, combo: { $max: '$bestCombo' } } },
        { $group: { _id: '$_id.u', totalScore: { $sum: '$score' }, totalStars: { $sum: '$stars' }, levelsCompleted: { $sum: 1 }, bestCombo: { $max: '$combo' } } },
        { $sort: { totalScore: -1 } },
        { $limit: 50 }
      ]);

      const users = await User.find({ _id: { $in: best.map(b => b._id) } }).select('name').lean();
      const names = Object.fromEntries(users.map(u => [String(u._id), u.name]));

      rows = best.map(b => ({ ...b, name: names[String(b._id)] || 'Player' }));
    } else {
      const filter = { totalScore: { $gt: 0 } };

      if (type === 'friends') {
        if (!req.user) return res.status(401).json({ message: 'Log in to see friends' });
        filter._id = { $in: [req.user._id, ...(req.user.friends || [])] };
      }

      const users = await User.find(filter)
        .sort({ totalScore: -1, totalStars: -1, bestCombo: -1 })
        .limit(50)
        .select('name totalScore totalStars completedLevels bestCombo')
        .lean();

      rows = users.map(u => ({
        name: u.name,
        totalScore: u.totalScore,
        totalStars: u.totalStars,
        levelsCompleted: u.completedLevels.length,
        bestCombo: u.bestCombo
      }));
    }

    res.json({
      type,
      players: rows.map((row, index) => ({
        rank: index + 1,
        name: row.name,
        totalScore: row.totalScore,
        totalStars: row.totalStars,
        levelsCompleted: row.levelsCompleted,
        bestCombo: row.bestCombo,
        verified: false
      })),
      ranked: false,
      message: 'Display leaderboard only. Scores are not authoritative until deterministic replay verification is enabled.'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/leaderboard/me', auth, async (req, res, next) => {
  try {
    const rank = await User.countDocuments({
      totalScore: { $gt: req.user.totalScore }
    }) + 1;

    res.json({ rank, ranked: false, verified: false });
  } catch (error) {
    next(error);
  }
});

/* FRIENDS */
app.get('/api/friends', auth, async (req, res, next) => {
  try {
    const friends = await User.find({ _id: { $in: req.user.friends || [] } })
      .select('name totalScore totalStars').lean();

    res.json({ friends: friends.map(f => ({ name: f.name, totalScore: f.totalScore, totalStars: f.totalStars })) });
  } catch (error) { next(error); }
});

app.post('/api/friends/add', auth, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const friend = await User.findOne({ email });

    if (!friend || friend.id === req.user.id) {
      return res.status(404).json({ message: 'No player found with that email' });
    }

    if (!req.user.friends.some(id => id.equals(friend._id))) {
      req.user.friends.push(friend._id);
      await req.user.save();
    }

    res.json({ ok: true, name: friend.name });
  } catch (error) { next(error); }
});

/* DAILY CHALLENGE */
app.get('/api/daily-challenge', optionalAuth, (req, res) => {
  const day = todayKey();
  const user = req.user;

  res.json({
    ...dailyFor(day),
    completedToday: !!user && user.lastDailyDate === day,
    streak: user?.dailyStreak || 0,
    best: user?.dailyBest?.[day] || null
  });
});

/* Reward only after a real completed game session for today's daily level. */
app.post('/api/daily-challenge/complete', auth, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    const day = todayKey();
    const daily = dailyFor(day);
    const user = req.user;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ message: 'Invalid session' });
    }

    const session = await Session.findOne({
      _id: sessionId,
      userId: user.id,
      levelId: daily.level,
      status: 'completed',
      completed: true
    });

    if (!session || session.completedAt < new Date(day)) {
      return res.status(409).json({ message: 'Complete today\'s daily level first' });
    }

    const best = Math.max(Number(user.dailyBest?.[day]?.score || 0), session.score || 0);
    user.dailyBest = { [day]: { score: best, stars: session.stars || 0 } };
    user.markModified('dailyBest');

    if (user.lastDailyDate === day) {
      await user.save();
      return res.json({ ok: true, alreadyClaimed: true, streak: user.dailyStreak, wallet: walletOf(user) });
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    user.dailyStreak = user.lastDailyDate === yesterday ? (user.dailyStreak || 0) + 1 : 1;
    user.lastDailyDate = day;

    const streakBonus = Math.min(10, user.dailyStreak) * 20;
    user.coins = Math.min(MAX_COINS, (user.coins ?? 0) + daily.reward.coins + streakBonus);

    const inventory = { ...(user.boosterInventory?.toObject?.() || user.boosterInventory || {}) };
    inventory[daily.reward.booster] = Math.min(MAX_ITEM, (inventory[daily.reward.booster] || 0) + 1);
    user.boosterInventory = inventory;
    user.markModified('boosterInventory');

    await user.save();

    res.json({
      ok: true,
      streak: user.dailyStreak,
      reward: { coins: daily.reward.coins + streakBonus, booster: daily.reward.booster },
      wallet: walletOf(user)
    });
  } catch (error) { next(error); }
});

/* CUSTOM LEVELS (visual level editor). Players keep drafts locally;
   admins (ADMIN_EMAILS) create/publish levels everyone can play. */
const sanitizeLevel = body => {
  const board = Array.isArray(body.board) ? body.board.slice(0, 18).map(row =>
    (Array.isArray(row) ? row : []).slice(0, 10).map(cell =>
      Number.isInteger(cell) && cell >= 0 && cell < 6 ? cell
        : (cell && ['stone', 'bomb'].includes(cell.type) ? { type: cell.type } : null))) : [];

  return {
    name: String(body.name || 'Custom level').slice(0, 40),
    objective: ['clear_all', 'rescue', 'drop', 'color_hunt', 'limited_shots', 'combo', 'score'].includes(body.objective) ? body.objective : 'clear_all',
    shots: Math.min(60, Math.max(5, Math.floor(Number(body.shots) || 25))),
    colors: Math.min(6, Math.max(2, Math.floor(Number(body.colors) || 4))),
    targetScore: Math.min(100000, Math.max(0, Math.floor(Number(body.targetScore) || 500))),
    board
  };
};

app.get('/api/custom-levels', async (req, res, next) => {
  try {
    const levels = await CustomLevel.find({ isPublished: true }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ levels });
  } catch (error) { next(error); }
});

app.get('/api/admin/levels', auth, adminOnly, async (req, res, next) => {
  try {
    res.json({ levels: await CustomLevel.find().sort({ createdAt: -1 }).limit(200).lean() });
  } catch (error) { next(error); }
});

app.post('/api/admin/levels', auth, adminOnly, async (req, res, next) => {
  try {
    const level = await CustomLevel.create({
      ...sanitizeLevel(req.body),
      authorId: req.user.id,
      isPublished: !!req.body.isPublished
    });
    res.status(201).json({ level });
  } catch (error) { next(error); }
});

app.put('/api/admin/levels/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const level = await CustomLevel.findByIdAndUpdate(
      req.params.id,
      { ...sanitizeLevel(req.body), isPublished: !!req.body.isPublished },
      { new: true }
    );
    res.json({ level });
  } catch (error) { next(error); }
});

app.delete('/api/admin/levels/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    await CustomLevel.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/me', auth, (req, res) => {
  res.json({ isAdmin: ADMIN_EMAILS.includes(req.user.email) });
});

/* FALLBACK + ERRORS */
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.use((error, req, res, next) => {
  console.error(error.message);

  if (res.headersSent) return next(error);

  res.status(500).json({
    message: 'An unexpected server error occurred'
  });
});

/* START SERVER */
const port = Number(process.env.PORT) || 5000;

if (
  !process.env.MONGODB_URI ||
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  console.error(
    'Set MONGODB_URI and a JWT_SECRET of at least 32 characters in server/.env'
  );
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(port, () => {
      console.log(`${GAME_NAME} API listening on ${port}`);
    });
  })
  .catch(error => {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  });
