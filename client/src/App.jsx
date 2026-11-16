import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Bomb, Volume2, VolumeX, Award } from 'lucide-react';
import { GAME_CONFIG } from './config/gameConfig';
import { findConnectedBubbles } from './utils/matchDetector';
import { getFloatingBubbles } from './utils/floatingDetector';
import { BubbleLauncher } from './components/BubbleLauncher';
import { GameOverModal } from './components/GameOverModal';

const getRandomColor = () => {
  const colors = GAME_CONFIG.colors;
  return colors[Math.floor(Math.random() * colors.length)];
};

const createInitialGrid = (level) => {
  const rows = GAME_CONFIG.maxRows;
  const cols = GAME_CONFIG.maxCols;
  const filledRows = Math.min(4 + Math.floor(level / 2), 7);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));

  for (let r = 0; r < filledRows; r++) {
    const colLimit = r % 2 === 1 ? cols - 1 : cols;
    for (let c = 0; c < colLimit; c++) {
      grid[r][c] = getRandomColor();
    }
  }
  return grid;
};

export default function App() {
  const [level, setLevel] = useState(1);
  const [grid, setGrid] = useState(() => createInitialGrid(1));
  const [currentBubble, setCurrentBubble] = useState(() => getRandomColor());
  const [nextBubble, setNextBubble] = useState(() => getRandomColor());
  const [projectile, setProjectile] = useState(null);
  const [score, setScore] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(25);
  const [gameState, setGameState] = useState('playing'); // 'playing' | 'won' | 'lost'
  const [bombActive, setBombActive] = useState(false);

  const boardRef = useRef(null);
  const animRef = useRef(null);

  const startLevel = useCallback((lvl) => {
    setLevel(lvl);
    setGrid(createInitialGrid(lvl));
    setCurrentBubble(getRandomColor());
    setNextBubble(getRandomColor());
    setProjectile(null);
    setShotsLeft(25 + lvl * 2);
    setGameState('playing');
    setBombActive(false);
  }, []);

  const handleSwap = () => {
    if (projectile || gameState !== 'playing') return;
    const temp = currentBubble;
    setCurrentBubble(nextBubble);
    setNextBubble(temp);
  };

  const submitScoreToBackend = async (finalScore, clearedLevel) => {
    try {
      await fetch(`${GAME_CONFIG.apiUrl}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: 'Player',
          score: finalScore,
          level: clearedLevel,
        }),
      });
    } catch {
      // Backend offline fallback: silent ignore
    }
  };

  const snapBubbleToGrid = useCallback(
    (px, py, boardWidth, bubbleColor, isBomb) => {
      const cellWidth = boardWidth / GAME_CONFIG.maxCols;
      const rowHeight = cellWidth * 0.88;

      let row = Math.max(0, Math.min(GAME_CONFIG.maxRows - 1, Math.round(py / rowHeight)));
      const isOdd = row % 2 === 1;
      const maxColsForRow = isOdd ? GAME_CONFIG.maxCols - 1 : GAME_CONFIG.maxCols;
      const offsetX = isOdd ? cellWidth / 2 : 0;
      let col = Math.max(0, Math.min(maxColsForRow - 1, Math.round((px - offsetX) / cellWidth)));

      const newGrid = grid.map((r) => [...r]);

      if (newGrid[row][col] !== null) {
        // Find nearest empty neighbor
        let placed = false;
        for (let dr = 0; dr <= 2 && !placed; dr++) {
          for (let dc = -1; dc <= 1 && !placed; dc++) {
            const nr = Math.min(GAME_CONFIG.maxRows - 1, row + dr);
            const ncMax = nr % 2 === 1 ? GAME_CONFIG.maxCols - 1 : GAME_CONFIG.maxCols;
            const nc = Math.max(0, Math.min(ncMax - 1, col + dc));
            if (newGrid[nr][nc] === null) {
              row = nr;
              col = nc;
              placed = true;
            }
          }
        }
      }

      if (isBomb) {
        let destroyed = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < GAME_CONFIG.maxRows && nc >= 0 && nc < GAME_CONFIG.maxCols && newGrid[nr][nc]) {
              newGrid[nr][nc] = null;
              destroyed++;
            }
          }
        }
        setScore((s) => s + destroyed * 50);
      } else {
        newGrid[row][col] = bubbleColor;
        const matches = findConnectedBubbles(newGrid, row, col, bubbleColor.name);
        if (matches.length >= 3) {
          matches.forEach((m) => {
            newGrid[m.row][m.col] = null;
          });
          setScore((s) => s + matches.length * 30);
        }
      }

      // Drop floating bubbles
      const floating = getFloatingBubbles(newGrid);
      if (floating.length > 0) {
        floating.forEach((f) => {
          newGrid[f.row][f.col] = null;
        });
        setScore((s) => s + floating.length * 50);
      }

      setGrid(newGrid);
      setProjectile(null);

      // Check win / lose
      const remaining = newGrid.flat().filter(Boolean).length;
      const dangerRowReached = newGrid[GAME_CONFIG.maxRows - 2].some(Boolean);

      if (remaining === 0) {
        setGameState('won');
        submitScoreToBackend(score + 200, level);
      } else if (dangerRowReached || shotsLeft - 1 <= 0) {
        setGameState('lost');
      }
    },
    [grid, level, score, shotsLeft]
  );

  const handleShoot = (angleDeg) => {
    if (projectile || gameState !== 'playing' || !boardRef.current) return;

    const rect = boardRef.current.getBoundingClientRect();
    const rad = (angleDeg * Math.PI) / 180;
    const speed = GAME_CONFIG.shooterSpeed;

    setShotsLeft((prev) => prev - 1);
    setProjectile({
      x: rect.width / 2,
      y: rect.height - 20,
      vx: Math.cos(rad) * speed,
      vy: Math.sin(rad) * speed,
      color: currentBubble,
      isBomb: bombActive,
    });

    setBombActive(false);
    setCurrentBubble(nextBubble);
    setNextBubble(getRandomColor());
  };

  useEffect(() => {
    if (!projectile || !boardRef.current) return;

    const rect = boardRef.current.getBoundingClientRect();
    const cellWidth = rect.width / GAME_CONFIG.maxCols;
    const rowHeight = cellWidth * 0.88;
    const radius = cellWidth * 0.44;

    const step = () => {
      setProjectile((prev) => {
        if (!prev) return null;
        let nx = prev.x + prev.vx;
        let ny = prev.y + prev.vy;
        let nvx = prev.vx;

        if (nx <= radius || nx >= rect.width - radius) {
          nvx = -nvx;
          nx = Math.max(radius, Math.min(rect.width - radius, nx));
        }

        // Check ceiling hit
        if (ny <= radius) {
          snapBubbleToGrid(nx, 0, rect.width, prev.color, prev.isBomb);
          return null;
        }

        // Check collision with existing bubbles
        for (let r = 0; r < GAME_CONFIG.maxRows; r++) {
          const isOdd = r % 2 === 1;
          const cols = isOdd ? GAME_CONFIG.maxCols - 1 : GAME_CONFIG.maxCols;
          for (let c = 0; c < cols; c++) {
            if (grid[r][c]) {
              const bx = c * cellWidth + cellWidth / 2 + (isOdd ? cellWidth / 2 : 0);
              const by = r * rowHeight + radius;
              const dist = Math.hypot(nx - bx, ny - by);
              if (dist < radius * 1.85) {
                snapBubbleToGrid(nx, ny, rect.width, prev.color, prev.isBomb);
                return null;
              }
            }
          }
        }

        return { ...prev, x: nx, y: ny, vx: nvx };
      });

      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [projectile, grid, snapBubbleToGrid]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 flex flex-col items-center justify-between p-3 sm:p-6">
      {/* Top Header */}
      <header className="w-full max-w-md flex items-center justify-between bg-slate-900/80 border border-slate-800 px-4 py-3 rounded-2xl shadow-lg">
        <div>
          <h1 className="text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            {GAME_CONFIG.title}
          </h1>
          <span className="text-xs text-slate-400">Level {level} • Shots: {shotsLeft}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Award className="w-4 h-4 text-yellow-400" />
            <span className="font-bold text-sm">{score.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* Main Game Arena */}
      <main className="w-full max-w-md flex-1 my-3 bg-slate-900/70 border border-slate-800/90 rounded-3xl shadow-2xl flex flex-col justify-between overflow-hidden relative">
        {/* Bubble Board */}
        <div ref={boardRef} className="relative flex-1 w-full overflow-hidden">
          {grid.map((row, rIdx) => {
            const isOdd = rIdx % 2 === 1;
            const cellPct = 100 / GAME_CONFIG.maxCols;
            return (
              <div
                key={rIdx}
                className="flex items-center"
                style={{
                  paddingLeft: isOdd ? `${cellPct / 2}%` : '0%',
                  height: `${100 / GAME_CONFIG.maxRows}%`,
                }}
              >
                {row.map((bubble, cIdx) => {
                  if (isOdd && cIdx === GAME_CONFIG.maxCols - 1) return null;
                  return (
                    <div
                      key={cIdx}
                      style={{ width: `${cellPct}%` }}
                      className="h-full flex items-center justify-center p-0.5"
                    >
                      {bubble && (
                        <div
                          className={`w-full aspect-square rounded-full bg-gradient-to-br ${bubble.gradient} shadow-md border border-white/25 relative transition-transform duration-200`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-white/40 absolute top-1.5 left-1.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Flying Projectile */}
          {projectile && (
            <div
              className={`w-9 h-9 rounded-full absolute -translate-x-1/2 -translate-y-1/2 shadow-lg border-2 border-white ${
                projectile.isBomb
                  ? 'bg-gradient-to-br from-amber-500 to-red-700 animate-pulse'
                  : `bg-gradient-to-br ${projectile.color.gradient}`
              }`}
              style={{ left: `${projectile.x}px`, top: `${projectile.y}px` }}
            />
          )}

          {/* Danger Threshold Line */}
          <div className="absolute bottom-2 inset-x-0 border-b border-dashed border-rose-500/40 pointer-events-none" />
        </div>

        {/* Booster Bar */}
        <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800/60 flex items-center justify-between">
          <button
            onClick={() => setBombActive(!bombActive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              bombActive
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Bomb className="w-3.5 h-3.5" />
            {bombActive ? 'Bomb Ready!' : 'Bomb Booster'}
          </button>

          <button
            onClick={() => startLevel(level)}
            className="text-xs text-slate-400 hover:text-white transition"
          >
            Reset Level
          </button>
        </div>

        {/* Shooter Launcher */}
        <BubbleLauncher
          onShoot={handleShoot}
          currentBubble={currentBubble}
          nextBubble={nextBubble}
          onSwap={handleSwap}
          disabled={!!projectile || gameState !== 'playing'}
        />
      </main>

      {gameState !== 'playing' && (
        <GameOverModal
          isWin={gameState === 'won'}
          score={score}
          stars={shotsLeft > 10 ? 3 : shotsLeft > 5 ? 2 : 1}
          onRestart={() => {
            setScore(0);
            startLevel(1);
          }}
          onNextLevel={() => startLevel(level + 1)}
        />
      )}
    </div>
  );
}
