
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
  Navigate
} from 'react-router-dom';

import { GAME_CONFIG } from './config/gameConfig';
import { LEVELS, WORLD_NAMES, WORLD_ICONS } from './game/levels';
import GameCanvas from './game/GameCanvas';
import { Shop } from './components/Shop';
import { request } from './api';
import { Mascot } from './components/Mascot';
import DailyPage from './pages/DailyPage';
import HistoryPage from './pages/HistoryPage';
import LeaderboardPage from './pages/LeaderboardPage';
import EditorPage, { CustomGame } from './pages/EditorPage';
import { dailyFor, dailyConfig, completeDailyLocal } from './game/daily';
import { playSfx } from './game/audio';
import { getCoins, getInventory, grantLevelReward, claimDailyGift, applyWallet } from './game/economy';
import './style.css';

const GAME_NAME = GAME_CONFIG.title;

document.title = GAME_NAME;

const DEFAULT_PROGRESS = {
  currentLevel: 1,
  totalScore: 0,
  totalStars: 0,
  rescuedObjects: 0,
  completedLevels: [],
  levelStars: {},
  boosterInventory: {
    bomb: 2,
    fire: 2,
    lightning: 2,
    rainbow: 2
  }
};

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('progress') || '{}');

    return {
      ...DEFAULT_PROGRESS,
      ...saved,
      completedLevels: saved.completedLevels || [],
      levelStars: saved.levelStars || {},
      boosterInventory: {
        ...DEFAULT_PROGRESS.boosterInventory,
        ...(saved.boosterInventory || {})
      }
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

function RouteScrollReset() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, [pathname]);

  return null;
}

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });

  const [progress, setProgress] = useState(readProgress);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState('checking');

  const nav = useNavigate();

  const saveProgress = useCallback(value => {
    setProgress(value);
    localStorage.setItem('progress', JSON.stringify(value));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 900);

    request('/health')
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) return;

    let active = true;

    request('/player/progress')
      .then(data => {
        if (!active) return;

        saveProgress({
          ...readProgress(),
          ...data,
          currentLevel: Math.max(1, Number(data.currentLevel) || 1),
          completedLevels: data.completedLevels || [],
          levelStars: data.levelStars || {},
          boosterInventory: {
            ...DEFAULT_PROGRESS.boosterInventory,
            ...(data.boosterInventory || {})
          }
        });
      })
      .catch(error => console.warn('Progress sync:', error.message));

    // Cloud save: import the guest wallet once, then follow the server.
    request('/player/wallet/sync', {
      method: 'POST',
      body: JSON.stringify({ coins: getCoins(), boosterInventory: getInventory() })
    })
      .then(wallet => active && applyWallet(wallet))
      .catch(error => console.warn('Wallet sync:', error.message));

    return () => {
      active = false;
    };
  }, [user?.id, saveProgress]);

  const logout = async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {}

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    nav('/');
  };

  const finish = useCallback(async result => {
    // Custom (editor) levels never touch campaign progress, coins or the server.
    if (result.custom) {
      sessionStorage.setItem('lastResult', JSON.stringify(result));
      nav('/result');
      return;
    }

    const p = readProgress();

    p.boosterInventory = {
      ...p.boosterInventory,
      ...(result.boosterInventory || {})
    };

    let firstClear = false;

    if (result.completed) {
      const levelNumber = Number(result.level);
      const alreadyCompleted = p.completedLevels.includes(levelNumber);
      firstClear = !alreadyCompleted;

      p.currentLevel = Math.min(
        120,
        Math.max(p.currentLevel, levelNumber + 1)
      );

      if (!alreadyCompleted) {
        p.totalScore = (p.totalScore || 0) + (result.score || 0);
        p.rescuedObjects =
          (p.rescuedObjects || 0) + (result.rescued || 0);
      }

      p.completedLevels = [
        ...new Set([...p.completedLevels, levelNumber])
      ];

      const oldStars = Number(p.levelStars[levelNumber] || 0);
      const newStars = Math.max(oldStars, Number(result.stars || 0));

      p.totalStars = (p.totalStars || 0) + (newStars - oldStars);

      p.levelStars = {
        ...p.levelStars,
        [levelNumber]: newStars
      };
    }

    saveProgress(p);

    if (result.completed) {
      // Coins + booster refills so the player never runs dry
      result = {
        ...result,
        reward: grantLevelReward({
          level: Number(result.level),
          stars: Number(result.stars || 0),
          score: Number(result.score || 0),
          firstClear
        })
      };
    }

    sessionStorage.setItem('lastResult', JSON.stringify(result));

    if (user) {
      const sessionId = sessionStorage.getItem('gameSession');

      if (sessionId) {
        try {
          const saved = await request('/games/complete', {
            method: 'POST',
            body: JSON.stringify({
              sessionId,
              ...result
            })
          });

          // Server decides the real reward; show and store that one.
          if (saved.wallet) {
            applyWallet(saved.wallet);

            if (saved.reward) {
              result = { ...result, reward: saved.reward };
              sessionStorage.setItem('lastResult', JSON.stringify(result));
            }
          }
        } catch (error) {
          console.warn('Game result sync:', error.message);
        }
      }
    }

    // Daily challenge: reward is granted once per day (server-verified when logged in).
    if (result.completed && sessionStorage.getItem('dailyRun') === '1' &&
        Number(result.level) === dailyFor().level) {
      let daily = null;

      try {
        const sessionId = sessionStorage.getItem('gameSession');

        if (user && sessionId) {
          const data = await request('/daily-challenge/complete', {
            method: 'POST',
            body: JSON.stringify({ sessionId })
          });

          if (data.wallet) applyWallet(data.wallet);
          daily = { streak: data.streak, reward: data.reward, alreadyClaimed: data.alreadyClaimed };
        } else if (!user) {
          daily = completeDailyLocal(Number(result.score || 0), Number(result.stars || 0));
        }
      } catch (error) {
        console.warn('Daily challenge sync:', error.message);
      }

      if (daily) {
        result = { ...result, daily };
        sessionStorage.setItem('lastResult', JSON.stringify(result));
      }
    }

    sessionStorage.removeItem('dailyRun');
    nav('/result');
  }, [user, nav, saveProgress]);

  if (loading) {
    return (
      <div className="splash">
        <div className="splash-orbs">
          <i />
          <i />
          <i />
        </div>
        <h1>{GAME_NAME}</h1>
        <p>Preparing your adventure…</p>
        <div className="loading-track"><i /></div>
      </div>
    );
  }

  return (
    <>
      <RouteScrollReset />

      <header>
        <Link className="brand" to="/" aria-label={GAME_NAME}>
          <span className="brand-mark">✿</span>
          {GAME_NAME}
        </Link>

        <nav>
          <Link to="/">Home</Link>
          <Link to="/levels">Adventure Map</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/daily">Daily</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/achievements">Achievements</Link>
          <Link to="/editor">Editor</Link>
          <Link to="/history">History</Link>

          {user ? (
            <button type="button" onClick={logout}>Logout</button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/levels"
          element={<LevelMap progress={progress} />}
        />

        <Route
          path="/game/:id"
          element={
            <GameRoute
              finish={finish}
              progress={progress}
            />
          }
        />

        <Route path="/result" element={<Result />} />

        <Route
          path="/login"
          element={<Auth type="login" onAuth={setUser} />}
        />

        <Route
          path="/register"
          element={<Auth type="register" onAuth={setUser} />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard progress={progress} user={user} />}
        />

        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/daily" element={<DailyPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/play/custom/:id" element={<CustomGame finish={finish} />} />
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/settings" element={<Settings />} />

        <Route
          path="/profile"
          element={
            <main className="content-page">
              <h1>Player Profile</h1>
              <p>{user?.name || 'Guest Player'}</p>
              <Link className="primary-link" to="/dashboard">
                View progress
              </Link>
            </main>
          }
        />

        <Route
          path="/help"
          element={
            <main className="content-page">
              <h1>How to Play</h1>
              <p>
                Aim with mouse or touch, release to shoot, and match at
                least three connected bubbles. Tap the preview bubble to
                exchange it with the current bubble. Select a booster to
                arm it; tap again to cancel. Clear the objective before
                shots run out or the bubbles reach the lower limit.
              </p>
            </main>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <footer>
        {GAME_NAME} · Original bubble puzzle adventure
        <span className={`api-indicator ${apiStatus}`}>
          ● API {apiStatus}
        </span>
      </footer>
    </>
  );
}

function Home() {
  return (
    <main className="home-page">
      <div className="home-copy">
        <div className="eyebrow">✦ A MAGICAL BUBBLE ADVENTURE ✦</div>

        <h1>
          Pop your way
          <br />
          <em>to adventure.</em>
        </h1>

        <p>
          Explore 120 challenges, discover special bubbles, trigger
          chain reactions and earn stars across 12 colourful districts.
        </p>

        <div className="home-actions">
          <Link className="cta" to="/levels">▶ Start Adventure</Link>
          <Link className="cta secondary" to="/help">How to Play</Link>
        </div>

        <div className="home-stats">
          <span><b>120</b> LEVELS</span>
          <span><b>12</b> DISTRICTS</span>
          <span><b>6</b> BUBBLE COLOURS</span>
        </div>
      </div>

      <div className="home-art">
        <div className="home-mascot"><Mascot mood="cheer" size={150} say="Hi! I'm Bubbo. Aim, match, pop and rescue!" /></div>
        <div className="art-island island-a">🌴</div>
        <div className="art-island island-b">🏝️</div>
        <div className="art-bubble b1">🔴</div>
        <div className="art-bubble b2">🔵</div>
        <div className="art-bubble b3">🟢</div>
        <div className="art-bubble b4">🟡</div>
        <div className="art-treasure">🧰</div>
        <div className="art-boat">⛵</div>
      </div>
    </main>
  );
}

/* CITY ADVENTURE MAP
 * ONE continuous road for all 120 levels. Level 1 is at the bottom, level 120
 * at the very top, and every bend of the road holds a level. Districts only
 * change the scenery colours: the road never breaks.
 */
const TOTAL_LEVELS = 120;
const LEVEL_GAP = 88;
const WORLD_TOP_PAD = 110;
const WORLD_BOTTOM_PAD = 110;
const WORLD_HEIGHT =
  WORLD_TOP_PAD + WORLD_BOTTOM_PAD + (TOTAL_LEVELS - 1) * LEVEL_GAP;

// x position (in %) of each bend: repeated for every 10 levels
const X_PATTERN = [50, 80, 26, 76, 24, 72, 28, 78, 32, 56];
const levelX = id => X_PATTERN[(id - 1) % X_PATTERN.length];
const levelY = id => WORLD_HEIGHT - WORLD_BOTTOM_PAD - (id - 1) * LEVEL_GAP;

const ROAD_POINTS = Array.from({ length: TOTAL_LEVELS }, (_, index) => ({
  x: levelX(index + 1),
  y: levelY(index + 1)
}));

// Smooth curve between two neighbouring bends (Catmull-Rom -> Bezier)
function roadCurve(index) {
  const p = ROAD_POINTS;
  const p0 = p[index - 1] || p[index];
  const p1 = p[index];
  const p2 = p[index + 1];
  const p3 = p[index + 2] || p2;

  const c1x = p1.x + (p2.x - p0.x) / 6;
  const c1y = p1.y + (p2.y - p0.y) / 6;
  const c2x = p2.x - (p3.x - p1.x) / 6;
  const c2y = p2.y - (p3.y - p1.y) / 6;

  return `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x} ${p2.y}`;
}

const ROAD_CURVES = ROAD_POINTS.slice(0, -1).map((_, index) => roadCurve(index));

const ROAD_PATH = `M${ROAD_POINTS[0].x} ${ROAD_POINTS[0].y} ${ROAD_CURVES.join(' ')}`;

const DISTRICTS = [
  { name: 'Big City', icon: '🏙️', theme: 'downtown', tagline: 'The adventure begins', decor: ['🏢', '🏬', '🚦', '🌳'] },
  { name: 'Coastal Town', icon: '🌊', theme: 'coastal', tagline: 'Explore the seaside', decor: ['⛵', '🏖️', '🗼', '🐚'] },
  { name: 'Green Valley', icon: '🌳', theme: 'valley', tagline: 'Discover hidden nature', decor: ['🌲', '🌻', '🏡', '🦋'] },
  { name: 'Neon City', icon: '🌆', theme: 'neon', tagline: 'Light up the night', decor: ['🌃', '🚕', '🏙️', '💡'] },
  { name: 'Candy Avenue', icon: '🍭', theme: 'candy', tagline: 'A sweeter challenge', decor: ['🍬', '🍭', '🎡', '🍩'] },
  { name: 'Royal Square', icon: '🏰', theme: 'royal', tagline: 'Enter the royal district', decor: ['🏰', '⛲', '🌷', '👑'] },
  { name: 'Mountain Road', icon: '🏔️', theme: 'mountain', tagline: 'Climb to new heights', decor: ['🏔️', '🚠', '🌲', '🪨'] },
  { name: 'Mystic Forest', icon: '🌌', theme: 'mystic', tagline: 'Find the secret path', decor: ['🌙', '🍄', '🧚', '🌳'] },
  { name: 'Desert Kingdom', icon: '🏜️', theme: 'desert', tagline: 'Cross the golden sands', decor: ['🌵', '🐪', '🏜️', '☀️'] },
  { name: 'Sky Harbour', icon: '☁️', theme: 'sky', tagline: 'Adventure above the clouds', decor: ['☁️', '🎈', '✈️', '🌤️'] },
  { name: 'Dragon District', icon: '🐉', theme: 'dragon', tagline: 'Face the ultimate challenge', decor: ['🐉', '🔥', '🏯', '💎'] },
  { name: 'Starfall City', icon: '✨', theme: 'starfall', tagline: 'The final adventure awaits', decor: ['🌠', '🌌', '🚀', '⭐'] }
];

// Vertical zone of every district on the one long map
const DISTRICT_BANDS = DISTRICTS.map((district, index) => {
  const first = index * 10 + 1;
  const last = first + 9;

  const top = index === DISTRICTS.length - 1 ? 0 : levelY(last) - LEVEL_GAP / 2;
  const bottom = index === 0 ? WORLD_HEIGHT : levelY(first) + LEVEL_GAP / 2;

  return { ...district, index, first, last, top, bottom, height: bottom - top };
});

function LevelMap({ progress }) {
  const navigate = useNavigate();

  const current = Math.max(
    1,
    Math.min(TOTAL_LEVELS, Number(progress.currentLevel) || 1)
  );

  const completed = new Set(progress.completedLevels || []);
  const [selectedId, setSelectedId] = useState(current);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [coins, setCoins] = useState(getCoins);
  const [gift, setGift] = useState(null);
  const currentNodeRef = useRef(null);

  // Open the map where the player is (level 1 is at the bottom of the page).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      currentNodeRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, 80);

    return () => window.clearTimeout(timer);
  }, []);

  // One free gift every day + live coin counter
  useEffect(() => {
    setGift(claimDailyGift());

    const refresh = () => setCoins(getCoins());
    window.addEventListener('bb-economy', refresh);

    return () => window.removeEventListener('bb-economy', refresh);
  }, []);

  const goToMyLevel = () => {
    currentNodeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setSelectedId(current);
  };

  const selectLevel = id => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  const selected = LEVELS[selectedId - 1] || LEVELS[0];
  const selectedUnlocked = selectedId <= current;
  const selectedWon = completed.has(selectedId);

  const selectedStars = selectedWon
    ? Math.min(3, Number((progress.levelStars || {})[selectedId] || 0))
    : 0;

  const selectedDistrict = DISTRICTS[Math.floor((selectedId - 1) / 10)];

  // Gold glow on every part of the road that is already cleared
  const doneRoad = ROAD_POINTS.slice(0, -1)
    .map((point, index) =>
      completed.has(index + 1)
        ? `M${point.x} ${point.y} ${ROAD_CURVES[index]}`
        : ''
    )
    .filter(Boolean)
    .join(' ');

  const play = id => navigate(`/game/${id}`);

  return (
    <main className="city-map-page">
      <section className="city-map-hero">
        <div className="city-hero-copy">
          <span className="eyebrow">{GAME_NAME}</span>
          <h1>City Adventure</h1>
          <p>One long road, 120 levels. Start at the bottom and climb to the top.</p>
        </div>

        <div className="city-stats">
          <div>
            <strong>{completed.size}<small>/120</small></strong>
            <span>LEVELS CLEARED</span>
          </div>
          <div>
            <strong>{progress.totalStars || 0} ⭐</strong>
            <span>STARS COLLECTED</span>
          </div>
          <button type="button" className="coin-stat" onClick={() => setShopOpen(true)}>
            <strong>🪙 {coins}</strong>
            <span>BOOSTER SHOP</span>
          </button>
        </div>
      </section>

      {gift && (
        <div className="daily-gift" role="status">
          <span>🎁</span>
          <div>
            <b>Daily gift collected!</b>
            <small>+1 Fire, Lightning, Rainbow, Bomb and +{gift.coins} 🪙</small>
          </div>
          <button type="button" onClick={() => setGift(null)} aria-label="Close">✕</button>
        </div>
      )}

      <div className="city-map-layout">
        <div className="city-map-scroll">
          <div className="city-map-intro">
            <span>🗺️ YOUR JOURNEY</span>
            <span>START AT THE BOTTOM · CLIMB UP ↑</span>
          </div>

          <div className="city-map-finish">
            <span>🏆</span>
            <h2>City Champion</h2>
            <p>Reach level 120 to finish the adventure.</p>
          </div>

          <div
            className="city-world"
            style={{ height: `${WORLD_HEIGHT}px` }}
          >
            {/* Scenery zones: colours change, the road does not */}
            {DISTRICT_BANDS.map(band => (
              <div
                key={band.name}
                className={`city-band city-${band.theme}`}
                style={{ top: `${band.top}px`, height: `${band.height}px` }}
                aria-hidden="true"
              >
                {band.decor.map((item, index) => (
                  <span
                    key={index}
                    className="city-band-decor"
                    style={{
                      top: `${12 + index * 22}%`,
                      [index % 2 ? 'right' : 'left']: '2%'
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ))}

            {/* District gates sit ON the road: a sign, not a break */}
            {DISTRICT_BANDS.filter(band => band.index > 0).map(band => {
              const cleared = LEVELS
                .slice(band.first - 1, band.last)
                .filter(level => completed.has(level.id)).length;

              return (
                <div
                  key={band.name}
                  className="city-gate"
                  style={{ top: `${band.bottom}px` }}
                >
                  <span>
                    {band.icon} DISTRICT {String(band.index + 1).padStart(2, '0')} · {band.name}
                    <em>{cleared}/10</em>
                  </span>
                </div>
              );
            })}

            <div className="city-road-col">
            <svg
              className="city-road-svg city-world-road"
              viewBox={`0 0 100 ${WORLD_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="city-road-edge" d={ROAD_PATH} />
              <path className="city-road" d={ROAD_PATH} />
              <path className="city-road-line" d={ROAD_PATH} />
              {doneRoad && <path className="city-road-done" d={doneRoad} />}
            </svg>

            {LEVELS.map(item => {
              const unlocked = item.id <= current;
              const won = completed.has(item.id);
              const isCurrent = item.id === current;
              const isSelected = item.id === selectedId;

              const stars = won
                ? Math.min(3, Number((progress.levelStars || {})[item.id] || 0))
                : 0;

              return (
                <button
                  type="button"
                  key={item.id}
                  ref={isCurrent ? currentNodeRef : null}
                  className={[
                    'city-level-node',
                    won ? 'node-completed' : '',
                    isCurrent ? 'node-current' : '',
                    !unlocked ? 'node-locked' : '',
                    isSelected ? 'node-selected' : ''
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: `${levelX(item.id)}%`,
                    top: `${levelY(item.id)}px`
                  }}
                  onClick={() => selectLevel(item.id)}
                  aria-label={`Level ${item.id}${unlocked ? '' : ' (locked)'}`}
                  aria-pressed={isSelected}
                >
                  <span className="city-node-icon">
                    {!unlocked ? '🔒' : won ? '🏆' : isCurrent ? '🚀' : '🫧'}
                  </span>
                  <strong>{item.id}</strong>
                  {won && (
                    <span className="city-node-stars">
                      {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
                    </span>
                  )}
                  {isCurrent && !won && (
                    <span className="city-current-tag">YOU ARE HERE</span>
                  )}
                </button>
              );
            })}
            </div>
          </div>

          <div className="city-map-start">
            <span>🚩</span>
            <strong>START HERE</strong>
            <small>Level 1 is at the bottom of the road</small>
          </div>
        </div>

        <aside className="city-level-panel">
          <div className="level-panel-top">
            <span>LEVEL DETAILS</span>
            <span className="level-panel-world">
              {selectedDistrict.icon} {selectedDistrict.name}
            </span>
          </div>

          <div className="level-preview-art">
            <div className="preview-skyline">
              <span>🏢</span><span>🏬</span><span>🏙️</span>
            </div>
            <div className="preview-road">🛣️</div>
            <div className="preview-bubbles">🔴 🔵 🟡</div>
            <div className="preview-level-number">{selectedId}</div>
          </div>

          <div className="level-panel-content">
            <span className="eyebrow">SELECTED STAGE</span>
            <h2>Level {selectedId}</h2>
            <p className="level-panel-description">
              {selected.difficulty} challenge in {selectedDistrict.name}.
            </p>

            <div className="level-detail-row">
              <span>🎯 Objective</span>
              <strong>{String(selected.objective || 'clear_all').replaceAll('_', ' ')}</strong>
            </div>
            <div className="level-detail-row">
              <span>🫧 Bubble colours</span>
              <strong>{selected.colors}</strong>
            </div>
            <div className="level-detail-row">
              <span>🎮 Available shots</span>
              <strong>{selected.shots}</strong>
            </div>
            <div className="level-detail-row">
              <span>⭐ Best stars</span>
              <strong>{selectedStars}/3</strong>
            </div>

            <div className="level-panel-status">
              {!selectedUnlocked
                ? '🔒 Complete earlier levels to unlock this stage.'
                : selectedWon
                  ? '🏆 Level completed. Replay and improve your score!'
                  : '🚀 This level is ready to play!'}
            </div>

            <button
              type="button"
              className="city-play-button"
              disabled={!selectedUnlocked}
              onClick={() => play(selectedId)}
            >
              {selectedWon ? '↻ PLAY AGAIN' : '▶ PLAY LEVEL'}
            </button>

            <div className="level-panel-navigation">
              <button
                type="button"
                disabled={selectedId <= 1}
                onClick={() => setSelectedId(value => Math.max(1, value - 1))}
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={selectedId >= current}
                onClick={() => setSelectedId(value => Math.min(current, value + 1))}
              >
                Next →
              </button>
            </div>

            <button type="button" className="panel-shop" onClick={() => setShopOpen(true)}>
              🪙 Booster Shop
            </button>
          </div>
        </aside>
      </div>

      <div className="city-map-legend">
        <span>🚀 Current level</span>
        <span>🏆 Completed</span>
        <span>🔒 Locked</span>
      </div>

      <button type="button" className="map-fab" onClick={goToMyLevel}>
        📍 My level
      </button>

      {/* Phone: tap a level, a sheet slides up with Play */}
      {sheetOpen && (
        <div className="level-sheet" role="dialog" aria-label={`Level ${selectedId}`}>
          <button
            type="button"
            className="sheet-close"
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
          >
            ✕
          </button>

          <div className="sheet-badge">{selectedId}</div>

          <div className="sheet-info">
            <b>Level {selectedId} · {selectedDistrict.name}</b>
            <small>
              {String(selected.objective || 'clear_all').replaceAll('_', ' ')} · {selected.shots} shots · {selected.colors} colours
            </small>
            <span className="sheet-stars">
              {'★'.repeat(selectedStars)}{'☆'.repeat(3 - selectedStars)}
            </span>
          </div>

          <button
            type="button"
            className="city-play-button sheet-play"
            disabled={!selectedUnlocked}
            onClick={() => play(selectedId)}
          >
            {!selectedUnlocked ? '🔒 Locked' : selectedWon ? '↻ Replay' : '▶ Play'}
          </button>
        </div>
      )}

      {shopOpen && <Shop onClose={() => setShopOpen(false)} />}
    </main>
  );
}

/* GAME ROUTE */
function GameRoute({ finish, progress }) {
  const { id } = useParams();
  const nav = useNavigate();
  const n = Number(id);
  const [search] = useSearchParams();
  const isDaily = search.get('daily') === '1' && n === dailyFor().level;
  const dailyCfg = React.useMemo(() => (isDaily ? dailyConfig() : null), [isDaily]);

  const [sessionReady, setSessionReady] = useState(false);

  // Full-screen game on phones: hides the site header/footer while playing
  useEffect(() => {
    document.body.classList.add('playing');
    return () => document.body.classList.remove('playing');
  }, []);

  useEffect(() => {
    let active = true;

    sessionStorage.removeItem('gameSession');
    if (isDaily) sessionStorage.setItem('dailyRun', '1');
    else sessionStorage.removeItem('dailyRun');

    // The level opens right away. The server session is created in the
    // background so a slow or offline server can never block the game.
    setSessionReady(true);

    if (!Number.isInteger(n) || n < 1 || n > 120) {
      return () => { active = false; };
    }

    if (localStorage.getItem('token')) {
      request('/games/start', {
        method: 'POST',
        body: JSON.stringify({ levelId: n, daily: isDaily })
      })
        .then(data => {
          if (active && data.sessionId) {
            sessionStorage.setItem('gameSession', data.sessionId);
          }
        })
        .catch(error => {
          console.warn('Game session could not start:', error.message);
        });
    }

    return () => {
      active = false;
    };
  }, [n, isDaily]);

  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 120 ||
    (!isDaily && n > Math.max(1, Number(progress.currentLevel) || 1))
  ) {
    return <Navigate to="/levels" replace />;
  }

  if (!sessionReady) {
    return <div className="page-loading">Preparing level {n}…</div>;
  }

  return (
    <main className="game-page">
      <GameCanvas
        key={n}
        level={n}
        config={dailyCfg}
        label={isDaily ? '📅 DAILY' : null}
        initialInventory={progress.boosterInventory}
        onFinish={finish}
        onExit={() => nav('/levels')}
      />
    </main>
  );
}

const ITEM_ICONS = {
  fire: '🔥',
  lightning: '⚡',
  rainbow: '🌈',
  bomb: '💣',
  extraShot: '➕',
  shuffle: '🔀'
};

function Result() {
  const [announced] = useState({ done: false });
  let result = null;

  try {
    result = JSON.parse(sessionStorage.getItem('lastResult') || 'null');
  } catch {}

  useEffect(() => {
    if (!result || announced.done) return undefined;
    announced.done = true;
    const timers = [];
    for (let i = 0; i < (result.stars || 0); i++) {
      timers.push(window.setTimeout(() => playSfx('star'), 500 + i * 380));
    }
    return () => timers.forEach(window.clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) {
    return (
      <main className="content-page center">
        <h1>No recent result</h1>
        <Link className="cta" to="/levels">Back to Map</Link>
      </main>
    );
  }

  return (
    <main className={`result-page ${result.completed ? 'victory' : 'defeat'}`}>
      <div className="result-card">
        <Mascot
          mood={result.completed ? (result.stars >= 3 ? 'cheer' : 'happy') : 'sad'}
          size={84}
          say={result.completed
            ? (result.stars >= 3 ? 'Perfect! Three stars!' : 'Nice shot! Try for more stars.')
            : 'So close! Use a booster and try again.'}
        />

        <span className="eyebrow">
          {result.completed ? 'LEVEL CLEARED' : 'KEEP TRYING'}
        </span>

        <h1>{result.completed ? 'Victory!' : 'Out of moves'}</h1>

        <p className="result-level">
          {result.custom ? 'Custom level' : `Level ${result.level}`}
          {!result.custom && result.completed && result.level < 120
            ? ` → Level ${result.level + 1}`
            : ''}
        </p>

        <div className="result-stars">
          {[1, 2, 3].map(number => (
            <span
              className={number <= result.stars ? 'earned' : ''}
              key={number}
            >
              ★
            </span>
          ))}
        </div>

        <div className="result-stats">
          <div><small>FINAL SCORE</small><b>{Number(result.score || 0).toLocaleString()}</b></div>
          <div><small>SHOTS USED</small><b>{result.shotsUsed || 0}</b></div>
          <div><small>SHOTS LEFT</small><b>{result.shotsRemaining || 0}</b></div>
          <div><small>BUBBLES POPPED</small><b>{result.bubblesPopped || 0}</b></div>
          <div><small>RESCUED</small><b>{result.rescued || 0}</b></div>
          <div><small>BEST COMBO</small><b>×{result.bestCombo || 0}</b></div>
        </div>

        {result.completed && result.reward && (
          <div className="result-reward">
            <small>REWARDS</small>
            <div>
              <span>🪙 +{result.reward.coins}</span>
              {Object.entries(result.reward.items || {}).map(([key, count]) => (
                <span key={key}>
                  {ITEM_ICONS[key] || '🎁'} +{count}
                </span>
              ))}
            </div>
          </div>
        )}

        {result.daily && (
          <div className="result-reward">
            <small>DAILY CHALLENGE</small>
            <div>
              <span>🔥 Streak {result.daily.streak}</span>
              {result.daily.reward && <span>🪙 +{result.daily.reward.coins}</span>}
              {result.daily.alreadyClaimed && <span>Reward already claimed today</span>}
            </div>
          </div>
        )}

        <div className="result-actions">
          {result.custom ? (
            <>
              <Link className="cta" to={`/play/custom/${result.customId}`}>↻ Play again</Link>
              <Link className="text-link" to="/editor">Back to Level Editor</Link>
            </>
          ) : result.completed && result.level < 120 ? (
            <Link className="cta" to={`/game/${result.level + 1}`}>
              Next Level →
            </Link>
          ) : !result.completed ? (
            <Link className="cta" to={`/game/${result.level}`}>
              ↻ Retry
            </Link>
          ) : (
            <Link className="cta" to="/levels">Adventure Complete</Link>
          )}

          <Link className="cta secondary" to={`/game/${result.level}`}>
            Replay
          </Link>
          <Link className="text-link" to="/levels">Level Select · City Map</Link>
        </div>
      </div>
    </main>
  );
}

function Auth({ type, onAuth }) {
  const nav = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget));

    if (
      type === 'register' &&
      data.password !== data.confirmPassword
    ) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await request(`/auth/${type}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });

      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      onAuth(result.user);
      nav('/dashboard');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="content-page">
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">{GAME_NAME}</span>
        <h1>{type === 'login' ? 'Welcome back' : 'Join the adventure'}</h1>

        {type === 'register' && (
          <input name="name" placeholder="Your name" required />
        )}

        <input
          name="email"
          type="email"
          placeholder="Email address"
          required
        />

        <input
          name="password"
          type="password"
          placeholder="Password (8+ characters)"
          minLength="8"
          required
        />

        {type === 'register' && (
          <input
            name="confirmPassword"
            type="password"
            placeholder="Confirm password"
            required
          />
        )}

        {error && <p className="error">{error}</p>}

        <button className="cta" type="submit" disabled={loading}>
          {loading
            ? 'Please wait…'
            : type === 'login'
              ? 'Log In'
              : 'Create Account'}
        </button>

        <Link to={type === 'login' ? '/register' : '/login'}>
          {type === 'login'
            ? 'Create an account'
            : 'Already registered? Log in'}
        </Link>
      </form>
    </main>
  );
}

function Dashboard({ progress, user }) {
  return (
    <main className="content-page">
      <span className="eyebrow">PLAYER HOME</span>
      <h1>Welcome, {user?.name || 'Adventurer'}!</h1>

      <p>
        Your journey is saved on this device. Sign in to sync it with
        your account.
      </p>

      <div className="dashboard-grid">
        {[
          ['Current Level', progress.currentLevel],
          ['Total Score', (progress.totalScore || 0).toLocaleString()],
          ['Stars', progress.totalStars || 0],
          ['Levels Cleared', progress.completedLevels?.length || 0]
        ].map(([label, value]) => (
          <div className="dashboard-card" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <Link className="cta" to="/levels">Continue Adventure</Link>
    </main>
  );
}

function Achievements() {
  const [items, setItems] = useState([]);
  const [unlocked, setUnlocked] = useState([]);

  useEffect(() => {
    let active = true;

    request('/achievements')
      .then(data => {
        if (active) setItems(data.achievements || []);
      })
      .catch(() => {});

    if (localStorage.getItem('token')) {
      request('/achievements/me')
        .then(data => {
          if (active) setUnlocked(data.achievements || []);
        })
        .catch(() => {});
    }

    return () => { active = false; };
  }, []);

  return (
    <main className="content-page">
      <span className="eyebrow">MILESTONES & REWARDS</span>
      <h1>Achievements</h1>

      <div className="achievement-grid">
        {items.map(item => (
          <article
            className={`achievement-card ${
              unlocked.includes(item.id) ? 'unlocked' : ''
            }`}
            key={item.id}
          >
            <span>{unlocked.includes(item.id) ? '🏆' : '🔒'}</span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </main>
  );
}

function Settings() {
  const [sound, setSound] = useState(
    localStorage.getItem('sound') !== 'off'
  );

  const [music, setMusic] = useState(
    localStorage.getItem('music') === 'on'
  );

  const [haptics, setHaptics] = useState(
    localStorage.getItem('haptics') !== 'off'
  );

  return (
    <main className="content-page">
      <span className="eyebrow">YOUR PREFERENCES</span>
      <h1>Settings</h1>

      <div className="settings-card">
        <button
          type="button"
          onClick={() => {
            setSound(value => {
              localStorage.setItem('sound', value ? 'off' : 'on');
              return !value;
            });
          }}
        >
          🔊 Sound effects: {sound ? 'ON' : 'OFF'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMusic(value => {
              localStorage.setItem('music', value ? 'off' : 'on');
              return !value;
            });
          }}
        >
          🎵 Music: {music ? 'ON' : 'OFF'}
        </button>

        <button
          type="button"
          onClick={() => {
            setHaptics(value => {
              localStorage.setItem('haptics', value ? 'off' : 'on');
              return !value;
            });
          }}
        >
          📳 Haptic feedback: {haptics ? 'ON' : 'OFF'}
        </button>

        <p>
          Sound effects and music are independent. Preferences are saved
          on this device. Music is generated live with Web Audio and
          stops immediately when switched off.
        </p>
      </div>
    </main>
  );
}

// Button click sound (respects the Sound setting inside playSfx)
document.addEventListener('click', event => {
  if (event.target.closest?.('button, a.cta')) playSfx('click');
});

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
