
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS, levelFor } from './levels';
import {
  R, DX, DY, COLS, ROWS, WIDTH, HEIGHT, DANGER_Y, SHOOTER_Y,
  TOP, center, attach, empty, connected, bubbleCount, pushWave,
  bombCells, floatingCells, isColor, normalizeBoard,
  advanceProjectile, pickBubbleColor, simulateShot, fireCells, rowCells, resolve
} from './logic';
import {
  ITEM_META, getInventory, setInventory, getCoins, ALL_ITEMS
} from './economy';
import { Shop } from '../components/Shop';
import { playSfx } from './audio';
import { calcStars } from './scoring';
import { boosterCells, isProjectileBooster } from './boosters';
import { createLevelState } from './levelManager';

const BOOSTER_META = ITEM_META;

const countBoard = board => bubbleCount(board);

// The saved inventory is the single source of truth (see economy.js).
const readSavedInventory = () => getInventory();

export default function GameCanvas({
  level,
  config = null,
  label = null,
  onFinish,
  onExit,
  initialInventory,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const finishRef = useRef(false);
  const lastFrameRef = useRef(0);

  const [ui, setUI] = useState({});
  const [paused, setPaused] = useState(false);
  const [selectedBooster, setSelectedBooster] = useState(null);

  const [inventory, setInventory_] = useState(() => readSavedInventory());

  const [hint, setHint] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopFocus, setShopFocus] = useState(null);
  const [coins, setCoins] = useState(getCoins);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [full, setFull] = useState(false);

  const [sound, setSound] = useState(
    () => localStorage.getItem('sound') !== 'off'
  );

  const [music, setMusic] = useState(
    () => localStorage.getItem('music') === 'on'
  );

  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  const selectedBoosterRef = useRef(selectedBooster);
  selectedBoosterRef.current = selectedBooster;

  // All inventory changes go through economy.js so counts are always saved.
  const updateInventory = useCallback((updater) => {
    setInventory_((previous) => {
      const next =
        typeof updater === 'function'
          ? updater(previous)
          : updater;

      setInventory(next);
      inventoryRef.current = next;
      return next;
    });
  }, []);

  // Keep UI in sync when the shop (or a reward) changes coins / boosters.
  useEffect(() => {
    const refresh = () => {
      setCoins(getCoins());
      const latest = getInventory();
      inventoryRef.current = latest;
      setInventory_(latest);
    };

    window.addEventListener('bb-economy', refresh);
    return () => window.removeEventListener('bb-economy', refresh);
  }, []);

  const sync = useCallback((s) => {
    setUI({
      shots: s.shots,
      score: s.score,
      combo: s.combo,
      bubbles: countBoard(s.board),
      waves: s.waveCount,
      current: s.current,
      next: s.next,
      status: s.status,
      popped: s.popped,
      cfg: s.cfg,
      undoLeft: s.undoLeft,
      canUndo: !!s.undo,
    });
  }, []);

  const finish = useCallback((s, won) => {
    if (s.finished) return;

    s.finished = true;
    s.status = won ? 'won' : 'lost';
    s.projectile = null;

    playSfx(won ? 'win' : 'fail');
    sync(s);

    const remaining = s.shots;

    const stars = calcStars({ won, score: s.score, shotsRemaining: remaining, cfg: s.cfg });

    onFinish?.({
      level,
      completed: won,
      score: Math.floor(s.score),
      shotsUsed: s.shotsUsed,
      shotsRemaining: remaining,
      bubblesPopped: s.popped,
      rescued: s.rescued,
      bestCombo: s.bestCombo,
      stars,
      boostersUsed: s.boostersUsed,
      boosterInventory: { ...inventoryRef.current },
    });
  }, [level, onFinish, sync]);

  // Restarting a level resets the board, NOT the booster inventory.
  const reset = useCallback(() => {
    const s = createLevelState(level, config);
    const cfg = s.cfg;

    stateRef.current = s;
    finishRef.current = false;

    setSelectedBooster(null);
    setPaused(false);
    setHint(false);

    const savedInventory = readSavedInventory();

    // Keep the player's saved boosters as they are. Boosters that are not
    // unlocked yet are only disabled in the UI, never wiped from storage.
    updateInventory(savedInventory);

    setConfirmRestart(false);
    sync(s);
  }, [level, config, sync, updateInventory]);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!ctx) return;

    let raf;

    const drawOrb = (
      x,
      y,
      color,
      scale = 1,
      { bomb = false, glow = false, alpha = 1 } = {}
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      const base = bomb
        ? '#20283a'
        : (COLORS[color] || COLORS[0]);

      if (glow) {
        ctx.shadowColor = bomb ? '#ff9b39' : base;
        ctx.shadowBlur = 18;
      }

      const g = ctx.createRadialGradient(-7, -9, 1, 1, 2, R);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.18, bomb ? '#596174' : base);
      g.addColorStop(0.76, base);
      g.addColorStop(1, '#171d42');

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffffc0';
      ctx.stroke();

      ctx.fillStyle = '#ffffffc9';
      ctx.beginPath();
      ctx.ellipse(-7, -8, 5, 2.8, -0.55, 0, Math.PI * 2);
      ctx.fill();

      if (bomb) {
        ctx.font = 'bold 18px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', 0, 2);
      }

      ctx.restore();
    };

    const addBurst = (s, x, y, color, count = 18) => {
      for (let i = 0; i < count; i++) {
        const a = Math.PI * 2 * i / count + Math.random() * 0.2;
        const sp = 1.2 + Math.random() * 4;

        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 30 + Math.random() * 12,
          max: 42,
          size: 2 + Math.random() * 3,
          color: color || '#ffd76a',
        });
      }
    };

    const makeWave = (s) => {
      if (
        s.waveCount >= s.cfg.maxWaves ||
        s.waveAnim ||
        s.finished
      ) return false;

      const row = [];

      for (let c = 0; c < COLS; c++) {
        // Match the left neighbour sometimes so waves form groups, not noise.
        const present = s.cfg.colors;
        let v = Math.floor(Math.random() * present);

        if (c > 0 && Math.random() < 0.35) v = row[c - 1];

        row.push(v);
      }

      s.board = pushWave(s.board, row);
      // New top row flips parity so existing rows keep their hex offset.
      s.shift = (s.shift + 1) % 2;
      s.rescueTargets = s.rescueTargets.map(v => ({
        ...v,
        r: v.r + 1,
      }));

      s.waveCount++;
      s.waveAnim = { progress: 0 };
      s.status = 'animating';
      s.shotsSinceWave = 0;

      return true;
    };

    const render = (timestamp) => {
      const s = stateRef.current;

      if (!s) {
        raf = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min(
        32,
        timestamp - (lastFrameRef.current || timestamp)
      );

      lastFrameRef.current = timestamp;

      const step = dt / 16.67;

      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, '#b9e8f0');
      bg.addColorStop(0.36, '#9fd8eb');
      bg.addColorStop(1, '#6bb5d1');

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const water = ctx.createRadialGradient(
        210, 270, 20, 210, 270, 390
      );

      water.addColorStop(0, '#c7f5f1aa');
      water.addColorStop(1, '#2a80ad22');

      ctx.fillStyle = water;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.strokeStyle = '#ffffff20';
      ctx.lineWidth = 1;

      for (let y = 20; y < HEIGHT; y += 56) {
        ctx.beginPath();
        ctx.ellipse(210, y, 145, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#ffffff50';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 18);
      ctx.lineTo(10, DANGER_Y);
      ctx.quadraticCurveTo(10, DANGER_Y + 10, 22, DANGER_Y + 10);
      ctx.moveTo(WIDTH - 10, 18);
      ctx.lineTo(WIDTH - 10, DANGER_Y);
      ctx.quadraticCurveTo(
        WIDTH - 10,
        DANGER_Y + 10,
        WIDTH - 22,
        DANGER_Y + 10
      );
      ctx.stroke();
      ctx.restore();

      let waveProgress = s.waveAnim?.progress ?? 1;

      s.rescueTargets.forEach(({ r, c }) => {
        if (s.board[r]?.[c] === null) {
          const p = center(r, c, s.shift);

          ctx.save();
          ctx.font = '21px system-ui';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#fff2a1';
          ctx.shadowBlur = 14;
          ctx.fillText('🐣', p.x, p.y + 7);
          ctx.restore();
        }
      });

      s.board.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell === null || cell === undefined) return;

          let p = center(r, c, s.shift);

          if (s.waveAnim) {
            p = {
              ...p,
              y: p.y - DY * (1 - waveProgress),
            };
          }

          if (cell?.type === 'stone') {
            ctx.save();
            ctx.fillStyle = '#647184';
            ctx.strokeStyle = '#d5e2ed';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(p.x, p.y, R - 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = '16px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('✦', p.x, p.y + 5);
            ctx.restore();
          } else if (cell?.type === 'bomb') {
            drawOrb(p.x, p.y, 0, 1, {
              bomb: true,
              glow: true,
            });
          } else {
            drawOrb(p.x, p.y, cell, 1, {
              glow: hint && connected(s.board, r, c, true, s.shift).length >= 3,
            });
          }
        });
      });

      if (hint && s.status === 'ready') {
        let best = [];

        for (let r = 0; r < s.board.length; r++) {
          for (let c = 0; c < COLS; c++) {
            if (
              isColor(s.board[r]?.[c]) &&
              s.board[r][c] === s.current
            ) {
              const g = connected(s.board, r, c, true, s.shift);
              if (g.length > best.length) best = g;
            }
          }
        }

        ctx.save();
        ctx.strokeStyle = '#fff2a4';
        ctx.lineWidth = 3;

        best.forEach(([r, c]) => {
          const p = center(r, c, s.shift);
          ctx.beginPath();
          ctx.arc(p.x, p.y, R + 5, 0, Math.PI * 2);
          ctx.stroke();
        });

        ctx.restore();
      }

      const origin = {
        x: WIDTH / 2,
        y: SHOOTER_Y,
      };

      if (!paused && s.status === 'ready') {
        // Cached dry-run: same physics as the real shot, recomputed only when needed.
        const angleKey = Math.round(s.angle * 400);

        if (s.aimBoard !== s.board || s.aimKey !== angleKey || s.aimShift !== s.shift) {
          s.aimBoard = s.board;
          s.aimKey = angleKey;
          s.aimShift = s.shift;
          s.aim = simulateShot(s.board, s.angle, s.shift);
          s.aimMatches = [];

          if (s.aim.cell) {
            const probe = normalizeBoard(s.board);
            probe[s.aim.cell[0]][s.aim.cell[1]] = s.current;
            const outcome = resolve(probe, s.aim.cell[0], s.aim.cell[1], false, s.shift);
            s.aimMatches = outcome.popped ? outcome.matches || [] : [];
          }
        }

        const aim = s.aim;

        // Trajectory (with wall bounces)
        ctx.save();
        ctx.setLineDash([3, 10]);
        ctx.lineCap = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffffd0';
        ctx.beginPath();
        aim.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
        ctx.restore();

        // Ghost bubble: exactly where this shot will land
        if (aim.cell) {
          const g = center(aim.cell[0], aim.cell[1], s.shift);
          const pulse = 0.55 + Math.sin(performance.now() / 160) * 0.15;

          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = COLORS[s.current] || '#fff';
          ctx.beginPath();
          ctx.arc(g.x, g.y, R - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.restore();

          // Aim Guide booster / hint: preview the bubbles this shot would pop
          if (hint && s.aimMatches.length) {
            ctx.save();
            ctx.strokeStyle = '#fff2a8';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ffe27a';
            ctx.shadowBlur = 12;

            s.aimMatches.forEach(([r, c]) => {
              const q = center(r, c, s.shift);
              ctx.beginPath();
              ctx.arc(q.x, q.y, R + 3, 0, Math.PI * 2);
              ctx.stroke();
            });

            ctx.restore();
          }
        }
      }

      // Bubble cannon
      ctx.save();
      ctx.translate(origin.x, origin.y + 18);
      ctx.rotate(s.angle + Math.PI / 2);

      ctx.shadowColor = '#06243b';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 6;

      const barrel = ctx.createLinearGradient(-24, 0, 24, 0);
      barrel.addColorStop(0, '#103c61');
      barrel.addColorStop(0.16, '#247ba0');
      barrel.addColorStop(0.38, '#b9f7f5');
      barrel.addColorStop(0.55, '#ffffff');
      barrel.addColorStop(0.78, '#55b9d5');
      barrel.addColorStop(1, '#103c61');

      ctx.fillStyle = barrel;
      ctx.beginPath();
      ctx.roundRect(-23, -48, 46, 90, 15);
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#eaffff';
      ctx.stroke();

      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#153f60';
      ctx.strokeStyle = '#eaffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(origin.x, origin.y + 30, 52, 27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#153f60';
      ctx.strokeStyle = '#eaffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(origin.x - 31, origin.y + 43, 62, 13, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      drawOrb(origin.x, origin.y, s.current, 1.28, {
        bomb: s.bombLoaded,
        glow: true,
      });

      if (
        selectedBoosterRef.current &&
        selectedBoosterRef.current !== 'bomb'
      ) {
        ctx.save();
        ctx.font = 'bold 19px system-ui';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#07253b';
        ctx.shadowBlur = 8;

        ctx.fillText(
          BOOSTER_META[selectedBoosterRef.current]?.icon || '✨',
          origin.x + 30,
          origin.y - 28
        );

        ctx.restore();
      }

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0a3754b8';
      ctx.beginPath();
      ctx.roundRect(18, 686, 112, 62, 20);
      ctx.fill();

      ctx.strokeStyle = '#e5ffff99';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#faffff';
      ctx.font = 'bold 12px system-ui';
      ctx.fillText('NEXT', 76, 741);
      ctx.restore();

      drawOrb(70, 710, s.next, 0.72, { glow: true });

      s.rescueFx = s.rescueFx.filter(p => p.life > 0);

      s.rescueFx.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life / 48;
        ctx.font = '28px system-ui';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ffe58a';
        ctx.shadowBlur = 18;
        ctx.fillText('🐣', p.x, p.y);
        ctx.restore();

        p.y -= 0.55 * step;
        p.life -= step;
      });

      s.falling = s.falling.filter(p => p.life > 0);

      s.falling.forEach(p => {
        drawOrb(p.x, p.y, p.color, 0.96, {
          alpha: Math.max(0, p.life / p.max),
        });

        p.y += p.vy * step;
        p.vy += 0.24 * step;
        p.life -= step;
      });

      s.particles = s.particles.filter(p => p.life > 0);

      s.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vy += 0.08 * step;
        p.life -= step;
      });

      s.explosions = s.explosions.filter(e => e.life > 0);

      s.explosions.forEach(e => {
        const t = 1 - e.life / e.max;

        ctx.save();
        ctx.globalAlpha = e.life / e.max;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 8 * (1 - t) + 1;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 22;

        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * t, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffe4a0';
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.max(2, 12 * (1 - t)), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        e.life -= step;
      });

      // Lightning bolts across a row
      (s.bolts || []).forEach(bolt => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, bolt.life / bolt.max);
        ctx.strokeStyle = '#d8fbff';
        ctx.lineWidth = 5;
        ctx.shadowColor = '#5fe3ff';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.moveTo(0, bolt.y);

        for (let x = 0; x <= WIDTH; x += 28) {
          ctx.lineTo(x, bolt.y + ((x / 28) % 2 ? -10 : 10));
        }

        ctx.stroke();
        ctx.restore();
        bolt.life -= step;
      });

      s.bolts = (s.bolts || []).filter(bolt => bolt.life > 0);

      // Floating text: COMBO x3!, RESCUED!, etc.
      s.popups = s.popups.filter(pop => pop.life > 0);

      s.popups.forEach(pop => {
        const t = 1 - pop.life / pop.max;

        ctx.save();
        ctx.globalAlpha = Math.min(1, pop.life / (pop.max * 0.4));
        ctx.font = `1000 ${pop.size || 30}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#2b1d4a';
        ctx.fillStyle = pop.color || '#ffe27a';
        ctx.translate(pop.x, pop.y - t * 46);
        ctx.scale(1 + (1 - t) * 0.35, 1 + (1 - t) * 0.35);
        ctx.strokeText(pop.text, 0, 0);
        ctx.fillText(pop.text, 0, 0);
        ctx.restore();
        pop.life -= step;
      });

      if (s.projectile) {
        const p = s.projectile;

        drawOrb(p.x, p.y, p.color, 1.04, {
          bomb: p.type === 'bomb',
          glow: true,
        });

        if (p.type !== 'normal') {
          ctx.save();
          ctx.font = '16px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(
            BOOSTER_META[p.type]?.icon || '✨',
            p.x,
            p.y + 5
          );
          ctx.restore();
        }

        if (!paused && s.status === 'shooting') {
          // Sub-stepped movement: the shot always stops exactly where it touches.
          const { hit, hitCell } = advanceProjectile(s.board, p, step, s.shift);

          if (hit) {
            if (hitCell) {
              const q = center(hitCell[0], hitCell[1], s.shift);
              p.hitX = q.x;
              p.hitY = q.y;
              p.hitCell = hitCell;

              // Hitting a bomb bubble on the board sets it off.
              if (s.board[hitCell[0]]?.[hitCell[1]]?.type === 'bomb') {
                p.type = 'bomb';
              }

              // Explosive shots blow up centred on the bubble they touched.
              if (['bomb', 'fire', 'lightning'].includes(p.type)) {
                p.x = q.x;
                p.y = q.y;
              }
            }

            resolveProjectile(s, p, finish, addBurst);
          }
        }
      }

      if (s.waveAnim && !paused) {
        s.waveAnim.progress = Math.min(
          1,
          s.waveAnim.progress + dt / 520
        );

        if (s.waveAnim.progress >= 1) {
          s.waveAnim = null;
          s.status = 'ready';

          if (
            s.board.some((row, r) =>
              row.some(v => v !== null) &&
              center(r, 0, s.shift).y >= DANGER_Y - R
            )
          ) {
            finish(s, false);
          }

          sync(s);
        }
      }

      if (paused) {
        ctx.save();
        ctx.fillStyle = '#06152acb';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '900 30px system-ui';
        ctx.fillText('PAUSED', WIDTH / 2, HEIGHT / 2);
        ctx.restore();
      }

      raf = requestAnimationFrame(render);
    };

    const resolveProjectile = (s, p, finishGame, burst) => {
      const hitX = p.x;
      const hitY = p.y;

      if (
        p.type === 'bomb' ||
        p.type === 'fire' ||
        p.type === 'lightning'
      ) {
        playSfx(
          p.type === 'bomb'
            ? 'blast'
            : p.type === 'lightning'
              ? 'bolt'
              : 'fire'
        );

        let removed = [];

        removed = boosterCells(p.type, s.board, p.hitCell, hitX, hitY, s.shift);

        if (p.type === 'lightning') {
          s.bolts = s.bolts || [];
          s.bolts.push({
            y: center(removed[0]?.[0] ?? 0, 0, s.shift).y,
            life: 22,
            max: 22,
          });
        }

        const colorPops = removed.filter(
          ([r, c]) => s.board[r]?.[c] === s.cfg.targetColor
        ).length;

        const next = s.board.map(row => row.slice());

        removed.forEach(([r, c]) => {
          next[r][c] = null;
        });

        const falling = floatingCells(next, s.shift);

        falling.forEach(([r, c]) => {
          const pos = center(r, c, s.shift);

          s.falling.push({
            x: pos.x,
            y: pos.y,
            color: next[r][c],
            vy: 1,
            life: 38,
            max: 38,
          });

          next[r][c] = null;
        });

        s.board = next;

        s.rescueTargets = s.rescueTargets.filter(({ r, c }) => {
          if (s.board[r]?.[c] === null) {
            s.rescued++;

            const q = center(r, c, s.shift);

            s.rescueFx.push({
              x: q.x,
              y: q.y,
              life: 48,
            });

            s.score += 100;
            s.popups.push({ text: '🐣 RESCUED!', x: q.x, y: q.y, life: 60, max: 60, size: 28, color: '#fff0a1' });
            playSfx('rescue');
            burst(s, q.x, q.y, '#ffe58a', 12);

            return false;
          }

          return true;
        });

        s.popped += removed.length + falling.length;
        s.dropCount += falling.length;
        s.colorHuntCount += colorPops;
        s.score += removed.length * 24 + falling.length * 38;
        s.combo = removed.length ? s.combo + 1 : 0;

        s.popups.push({
          text:
            p.type === 'lightning' ? '⚡ ZAP!' :
            p.type === 'fire' ? '🔥 BURN!' : '💥 BOOM!',
          x: hitX,
          y: hitY,
          life: 50,
          max: 50,
          size: 32,
          color: p.type === 'lightning' ? '#9aefff' : '#ffb04d',
        });

        s.explosions.push({
          x: hitX,
          y: hitY,
          radius: p.type === 'bomb' ? DX * 1.9 : DX * 1.2,
          life: 26,
          max: 26,
          color:
            p.type === 'lightning'
              ? '#7fe9ff'
              : p.type === 'fire'
                ? '#ff9c42'
                : '#ffc46a',
        });

        burst(
          s,
          hitX,
          hitY,
          p.type === 'lightning' ? '#8ceeff' : '#ffb24d',
          28
        );
      } else {
        playSfx(p.type === 'rainbow' ? 'rainbow' : 'pop');

        const result = attach(
          s.board,
          hitX,
          hitY,
          p.color,
          p.type === 'rainbow',
          s.shift
        );

        s.board = result.board;

        (result.droppedCells || []).forEach(cell => {
          const pos = center(cell.r, cell.c, s.shift);

          s.falling.push({
            x: pos.x,
            y: pos.y,
            color: cell.color,
            vy: 1,
            life: 38,
            max: 38,
          });
        });

        s.rescueTargets = s.rescueTargets.filter(({ r, c }) => {
          if (s.board[r]?.[c] === null) {
            s.rescued++;

            const q = center(r, c, s.shift);

            s.rescueFx.push({
              x: q.x,
              y: q.y,
              life: 48,
            });

            s.score += 100;
            s.popups.push({ text: '🐣 RESCUED!', x: q.x, y: q.y, life: 60, max: 60, size: 28, color: '#fff0a1' });
            playSfx('rescue');
            burst(s, q.x, q.y, '#ffe58a', 12);

            return false;
          }

          return true;
        });

        s.popped += result.popped + result.dropped;
        s.dropCount += result.dropped;

        if (p.type === 'rainbow') {
          s.colorHuntCount += result.popped;
        } else if (p.color === s.cfg.targetColor) {
          s.colorHuntCount += result.popped;
        }

        s.combo = result.popped ? s.combo + 1 : 0;

        if (s.combo >= 2) {
          playSfx('combo');
          s.popups.push({
            text: `COMBO x${s.combo}!`,
            x: WIDTH / 2,
            y: HEIGHT * 0.45,
            life: 56,
            max: 56,
            size: 26 + Math.min(s.combo, 6) * 3,
            color: s.combo >= 4 ? '#ff8ad8' : '#ffe27a',
          });
        } else if (result.dropped >= 3) {
          s.popups.push({
            text: `${result.dropped} DROPPED!`,
            x: WIDTH / 2,
            y: HEIGHT * 0.45,
            life: 50,
            max: 50,
            size: 28,
            color: '#8ff0b8',
          });
        }

        s.score +=
          (result.popped * 20 + result.dropped * 35) *
          (1 + Math.max(0, s.combo - 1) * 0.25);

        (result.matches || []).forEach(([r, c]) => {
          const q = center(r, c, s.shift);
          burst(s, q.x, q.y, COLORS[p.color], 7);
        });

        if (!result.popped) {
          s.shotsSinceMatch++;
        }
      }

      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.projectile = null;
      s.status = 'ready';
      s.shotsSinceWave++;

      // A booster shot is an extra: the loaded bubble stays in the cannon.
      if (p.type === 'normal' || p.type === 'rainbow') {
        s.current = s.next;
        s.recentColors.push(s.current);
        s.recentColors = s.recentColors.slice(-4);

        // Only colours that still exist on the board, never 3 of a kind in a row.
        s.next = pickBubbleColor(
          s.board,
          s.queue.shift(),
          s.recentColors,
          s.cfg.colors
        );
      } else if (!isColor(s.current) || !colorStillOnBoard(s)) {
        s.current = pickBubbleColor(
          s.board,
          s.current,
          s.recentColors,
          s.cfg.colors
        );
      }

      // The cannon colour may have been wiped out by this shot: replace it.
      if (!colorStillOnBoard(s)) {
        s.current = pickBubbleColor(s.board, null, [], s.cfg.colors);
      }

      const won = objectiveComplete(s);

      if (won || empty(s.board)) {
        finishGame(s, true);
        return;
      }

      const reachedDanger = s.board.some((row, r) =>
        row.some(v => v !== null && v !== undefined) &&
        center(r, 0, s.shift).y >= DANGER_Y - R
      );

      if (reachedDanger || s.shots <= 0) {
        finishGame(s, false);
        return;
      }

      if (
        s.waveCount < s.cfg.maxWaves &&
        (
          s.shotsSinceWave >= s.cfg.waveEvery ||
          (
            countBoard(s.board) <=
              Math.max(10, s.cfg.waveTrigger - s.waveCount * 5) &&
            s.shotsSinceWave >= 2
          )
        )
      ) {
        makeWave(s);
      }

      sync(s);
    };

    const colorStillOnBoard = s =>
      s.board.some(row => row.some(v => v === s.current));

    const objectiveComplete = s => {
      switch (s.cfg.objective) {
        case 'score':
          return s.score >= s.cfg.targetScore;

        case 'drop':
          return s.dropCount >= Math.max(8, Math.floor(s.cfg.id / 3));

        case 'combo':
          return s.bestCombo >= Math.min(8, 3 + Math.floor(s.cfg.id / 20));

        case 'color_hunt':
          return s.colorHuntCount >= s.cfg.colorTarget;

        case 'rescue':
          return s.rescued >= s.cfg.rescueTarget;

        default:
          return empty(s.board);
      }
    };

    raf = requestAnimationFrame(render);

    return () => cancelAnimationFrame(raf);
  }, [paused, hint, level, finish, sync]);

  const pointerPoint = e => {
    const b = canvasRef.current.getBoundingClientRect();

    return {
      x: (e.clientX - b.left) * WIDTH / b.width,
      y: (e.clientY - b.top) * HEIGHT / b.height,
    };
  };

  const aim = e => {
    const s = stateRef.current;

    if (!s || paused || s.status !== 'ready' || s.finished) return;

    const { x, y } = pointerPoint(e);

    if (y > DANGER_Y || y > SHOOTER_Y + 10) return;

    let a = Math.atan2(y - SHOOTER_Y, x - WIDTH / 2);

    a = Math.max(-Math.PI + 0.22, Math.min(-0.22, a));

    s.angle = a;
  };

  const fireShot = e => {
    const s = stateRef.current;

    if (!s || paused || s.status !== 'ready' || s.finished) return;

    const { x, y } = pointerPoint(e);

    if (y >= DANGER_Y || y > SHOOTER_Y - 25) return;

    launch();
  };

  // Shared by pointer release and the keyboard (Space)
  const launch = () => {
    const s = stateRef.current;

    if (!s || paused || s.status !== 'ready' || s.finished) return;

    const type =
      selectedBooster &&
      isProjectileBooster(selectedBooster)
        ? selectedBooster
        : 'normal';

    // Do not fire a booster if its saved inventory is empty.
    const currentInventory = readSavedInventory(inventoryRef.current);

    if (type !== 'normal' && (currentInventory[type] || 0) <= 0) {
      setSelectedBooster(null);
      s.bombLoaded = false;
      return;
    }

    // Real undo: snapshot the whole game state before the shot is fired.
    s.undo = {
      board: s.board.map(row => row.slice()),
      shift: s.shift,
      recentColors: [...s.recentColors],
      shots: s.shots,
      shotsUsed: s.shotsUsed,
      shotsGranted: s.shotsGranted,
      score: s.score,
      combo: s.combo,
      bestCombo: s.bestCombo,
      popped: s.popped,
      current: s.current,
      next: s.next,
      queue: [...s.queue],
      dropCount: s.dropCount,
      colorHuntCount: s.colorHuntCount,
      rescued: s.rescued,
      rescueTargets: s.rescueTargets.map(v => ({ ...v })),
      shotsSinceWave: s.shotsSinceWave,
      shotsSinceMatch: s.shotsSinceMatch,
      waveCount: s.waveCount,
      boostersUsed: [...s.boostersUsed],
      refund: type !== 'normal' ? type : null,
    };

    if (type !== 'normal') {
      const nextInventory = {
        ...currentInventory,
        [type]: Math.max(0, (currentInventory[type] || 0) - 1),
      };

      updateInventory(nextInventory);

      s.boostersUsed.push(type);
      setSelectedBooster(null);
    }

    s.projectile = {
      x: WIDTH / 2,
      y: SHOOTER_Y,
      color: s.current,
      type,
      vx: Math.cos(s.angle) * 10.4,
      vy: Math.sin(s.angle) * 10.4,
    };

    playSfx('shot');

    s.bombLoaded = false;
    s.shots--;
    s.shotsUsed++;
    s.status = 'shooting';

    sync(s);
  };

  // Restores board, shots, score, combo, queue and objective progress.
  const undoShot = () => {
    const s = stateRef.current;

    if (
      !s || paused || s.finished || s.status !== 'ready' ||
      s.waveAnim || !s.undo || s.undoLeft <= 0
    ) {
      return;
    }

    const u = s.undo;
    const { refund, ...saved } = u;

    Object.assign(s, saved, {
      projectile: null,
      falling: [],
      explosions: [],
      bolts: [],
      popups: [],
      undo: null,
      undoLeft: s.undoLeft - 1,
      aimBoard: null,
      bombLoaded: false,
    });

    // A booster used on that shot is given back.
    if (refund) {
      updateInventory(v => ({ ...v, [refund]: (v[refund] || 0) + 1 }));
    }

    setSelectedBooster(null);
    playSfx('swap');
    sync(s);
  };

  const swap = () => {
    const s = stateRef.current;

    if (!s || paused || s.status !== 'ready' || s.finished) return;

    [s.current, s.next] = [s.next, s.current];

    setSelectedBooster(null);
    s.bombLoaded = false;

    playSfx('swap');
    sync(s);
  };

  const onPointerDown = e => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is not available in every browser.
    }

    const { x, y } = pointerPoint(e);

    if (y > 690 && x < 115) {
      swap();
      return;
    }

    aim(e);
  };

  const onPointerUp = e => {
    const { x, y } = pointerPoint(e);

    if (y > 690 && x < 115) return;

    aim(e);
    fireShot(e);
  };

  const openShop = key => {
    setShopFocus(key || null);
    setSelectedBooster(null);
    setPaused(true);
    setShopOpen(true);
  };

  const closeShop = () => {
    setShopOpen(false);
    setPaused(false);
    setCoins(getCoins());
  };

  const selectBooster = key => {
    const s = stateRef.current;

    if (!s || paused || s.status !== 'ready' || s.finished) return;

    const currentInventory = readSavedInventory(inventoryRef.current);

    if (
      (currentInventory[key] || 0) <= 0 &&
      ['fire', 'lightning', 'rainbow', 'bomb', 'extraShot', 'shuffle'].includes(key)
    ) {
      openShop(key);
      return;
    }

    if (key === 'extraShot') {
      if ((currentInventory.extraShot || 0) > 0) {
        s.shots += 3;
        s.shotsGranted += 3;

        updateInventory(v => ({
          ...v,
          extraShot: Math.max(0, (v.extraShot || 0) - 1),
        }));

        s.boostersUsed.push(key);
        sync(s);
      }

      return;
    }

    if (key === 'shuffle') {
      if ((currentInventory.shuffle || 0) > 0) {
        const vals = s.board.flat().filter(v => isColor(v));

        for (let i = vals.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [vals[i], vals[j]] = [vals[j], vals[i]];
        }

        let k = 0;

        s.board = s.board.map(row =>
          row.map(v => isColor(v) ? vals[k++] : v)
        );

        updateInventory(v => ({
          ...v,
          shuffle: Math.max(0, (v.shuffle || 0) - 1),
        }));

        s.boostersUsed.push(key);
        sync(s);
      }

      return;
    }

    if (!(currentInventory[key] > 0)) return;
    if (!s.cfg.availableBoosters.includes(key)) return;

    const next = selectedBooster === key ? null : key;

    setSelectedBooster(next);
    s.bombLoaded = next === 'bomb';

    if (next) {
      playSfx('swap');
    }
  };

  // Keyboard: Space = shoot, R = restart, Esc/P = pause, arrows = fine aim, 1-4 = boosters
  useEffect(() => {
    const onKey = e => {
      const s = stateRef.current;

      if (!s || e.target?.tagName === 'INPUT') return;

      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        setPaused(v => !v);
        return;
      }

      if (e.key.toLowerCase() === 'r') {
        setPaused(true);
        setConfirmRestart(true);
        return;
      }

      if (paused || s.status !== 'ready' || s.finished) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        launch();
      } else if (e.key === 'ArrowLeft') {
        s.angle = Math.max(-Math.PI + 0.22, s.angle - 0.04);
      } else if (e.key === 'ArrowRight') {
        s.angle = Math.min(-0.22, s.angle + 0.04);
      } else if (e.key === 'x' || e.key === 'X') {
        swap();
      } else if (e.key.toLowerCase() === 'u' || (e.ctrlKey && e.key.toLowerCase() === 'z')) {
        undoShot();
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        selectBooster(['fire', 'lightning', 'rainbow', 'bomb'][Number(e.key) - 1]);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await canvasRef.current?.parentElement?.requestFullscreen?.();
        setFull(true);
      } else {
        await document.exitFullscreen();
        setFull(false);
      }
    } catch {
      setFull(false);
    }
  };

  useEffect(() => {
    const change = () => {
      setFull(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', change);

    return () => {
      document.removeEventListener('fullscreenchange', change);
    };
  }, []);

  useEffect(() => {
    if (!music) return;

    let audio;
    let osc;
    let gain;
    let timer;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;

      audio = new AC();
      osc = audio.createOscillator();
      gain = audio.createGain();

      osc.type = 'sine';
      gain.gain.value = 0.012;
      osc.frequency.value = 261.63;

      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();

      const notes = [
        261.63, 329.63, 392, 329.63,
        293.66, 349.23, 440, 349.23,
      ];

      let i = 0;

      timer = window.setInterval(() => {
        if (audio?.state === 'running') {
          osc.frequency.setTargetAtTime(
            notes[i % notes.length],
            audio.currentTime,
            0.25
          );

          i++;
        }
      }, 620);

      if (audio.state === 'suspended') {
        audio.resume();
      }
    } catch {
      // Music is optional.
    }

    return () => {
      if (timer) window.clearInterval(timer);

      try {
        osc?.stop();
        audio?.close();
      } catch {
        // Ignore audio cleanup errors.
      }
    };
  }, [music]);

  const boosterAllowed = key =>
    (ui.cfg?.availableBoosters || []).includes(key);

  return (
    <section className="game-shell">
      <div className="game-top">
        <button
          type="button"
          className="top-btn"
          onClick={() => setPaused(true)}
          aria-label="Pause"
        >
          Ⅱ
        </button>

        <span className="level-chip">{label || `LEVEL ${level}`}</span>
        <span className="score">⭐ {Math.floor(ui.score || 0)}</span>
        <span>🎯 {ui.shots ?? 0}</span>
        <span className="hide-sm">🫧 {ui.bubbles ?? 0}</span>
        <span className="hide-sm">🔥 x{ui.combo || 0}</span>

        <button
          type="button"
          className="top-btn coin-btn"
          onClick={() => openShop(null)}
          aria-label="Open booster shop"
        >
          🪙 {coins}
        </button>

        <button
          type="button"
          className="top-btn undo-btn"
          onClick={undoShot}
          disabled={!ui.canUndo || !(ui.undoLeft > 0) || ui.status !== 'ready'}
          aria-label={`Undo last shot (${ui.undoLeft ?? 0} left)`}
        >
          ↶ {ui.undoLeft ?? 0}
        </button>

        <button
          type="button"
          className={`top-btn ${hint ? 'on' : ''}`}
          onClick={() => setHint(v => !v)}
          aria-label="Aim guide"
        >
          💡
        </button>
      </div>

      <div className="game-sub">
        {selectedBooster
          ? `${BOOSTER_META[selectedBooster].icon} ${BOOSTER_META[selectedBooster].label} ready: ${BOOSTER_META[selectedBooster].detail}. Aim and shoot!`
          : (
            <>
              {String(ui.cfg?.objective || 'CLEAR ALL').replaceAll('_', ' ')}
              {ui.cfg?.objective === 'color_hunt'
                ? ` · ${ui.cfg.colorTarget} TARGET BUBBLES`
                : ''}
              {ui.cfg?.objective === 'rescue'
                ? ` · RESCUE ${ui.cfg.rescueTarget}`
                : ''}
              {' · MATCH 3 OR MORE'}
            </>
          )}
      </div>

      <div className="game-board-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerMove={aim}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="game-canvas"
          aria-label="Bubble shooter game board"
        />
      </div>

      <aside className="game-actions">
        <div className="booster-grid">
          {['fire', 'lightning', 'rainbow', 'bomb'].map(key => (
            <button
              key={key}
              type="button"
              aria-label={`${BOOSTER_META[key].label}: ${inventory[key] || 0} left`}
              className={`booster-card ${
                selectedBooster === key ? 'selected' : ''
              } ${(inventory[key] || 0) <= 0 ? 'empty' : ''}`}
              onClick={() => selectBooster(key)}
              disabled={!boosterAllowed(key)}
            >
              <span>{BOOSTER_META[key].icon}</span>
              <b>{BOOSTER_META[key].label}</b>
              <small>{(inventory[key] || 0) > 0 ? `×${inventory[key]}` : '+'}</small>
            </button>
          ))}
        </div>

        <div className="util-row">
          <button
            type="button"
            className="secondary-action"
            aria-label="Extra shots"
            onClick={() => selectBooster('extraShot')}
            disabled={!boosterAllowed('extraShot')}
          >
            ➕<em> +3 shots</em> <small>{(inventory.extraShot || 0) > 0 ? `×${inventory.extraShot}` : '+'}</small>
          </button>

          <button
            type="button"
            className="secondary-action"
            aria-label="Shuffle"
            onClick={() => selectBooster('shuffle')}
            disabled={!boosterAllowed('shuffle')}
          >
            🔀<em> Shuffle</em> <small>{(inventory.shuffle || 0) > 0 ? `×${inventory.shuffle}` : '+'}</small>
          </button>

          <button
            type="button"
            className="secondary-action fullscreen-btn"
            onClick={toggleFullscreen}
          >
            {full ? '↙ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
        </div>

        <p className="key-help">
          Space shoot · X swap · U undo · 1-4 boosters · R restart · Esc pause
        </p>
      </aside>

      {shopOpen && <Shop focus={shopFocus} onClose={closeShop} />}

      {paused && !shopOpen && (
        <div className="modal-backdrop">
          <section className="game-modal">
            <div className="modal-eyebrow">GAME PAUSED</div>

            <h2>Take a breather</h2>

            <p>
              Your adventure is waiting. Resume whenever you're ready.
            </p>

            <button
              className="modal-primary"
              onClick={() => setPaused(false)}
            >
              ▶ Resume Game
            </button>

            <button onClick={() => setConfirmRestart(true)}>
              ↻ Restart Level
            </button>

            <button onClick={onExit}>
              ⌂ Level Map
            </button>

            <div className="settings-row">
              <button
                onClick={() => setSound(v => {
                  localStorage.setItem('sound', v ? 'off' : 'on');
                  return !v;
                })}
              >
                🔊 Sound {sound ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={() => setMusic(v => {
                  localStorage.setItem('music', v ? 'off' : 'on');
                  return !v;
                })}
              >
                🎵 Music {music ? 'ON' : 'OFF'}
              </button>
            </div>

            {confirmRestart && (
              <div className="confirm-box">
                <b>Restart this level?</b>

                <p>
                  Your current score and shots will reset.
                  Your booster inventory will remain unchanged.
                </p>

                <button
                  className="modal-primary"
                  onClick={reset}
                >
                  Yes, restart
                </button>

                <button
                  onClick={() => setConfirmRestart(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
