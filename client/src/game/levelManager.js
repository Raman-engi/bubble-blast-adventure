import { levelFor } from './levels';
import { normalizeBoard, pickBubbleColor } from './logic';

export const UNDOS_PER_LEVEL = 3;

/* Builds a fresh game state for a level: board, bubble queue, objectives. */
export function createLevelState(level, override = null) {
  const cfg = override || levelFor(level);
  const queue = [...cfg.bubbleQueue];
  const startBoard = normalizeBoard(cfg.board);
  const recent = [];

  const current = pickBubbleColor(startBoard, queue.shift(), recent, cfg.colors);
  recent.push(current);
  const next = pickBubbleColor(startBoard, queue.shift(), recent, cfg.colors);
  recent.push(next);

  const s = {
    board: startBoard,
    shift: 0,
    recentColors: recent,
    shots: cfg.shots,
    shotsUsed: 0,
    shotsGranted: cfg.shots,
    score: 0,
    combo: 0,
    bestCombo: 0,
    popped: 0,
    current,
    next,
    queue,
    angle: -Math.PI / 2,
    projectile: null,
    status: 'ready',
    cfg,
    particles: [],
    falling: [],
    rescueFx: [],
    explosions: [],
    popups: [],
    finished: false,
    shotsSinceWave: 0,
    waveCount: 0,
    waveAnim: null,
    boostersUsed: [],
    bombLoaded: false,
    fireLoaded: false,
    lightningLoaded: false,
    rainbowLoaded: false,
    dropCount: 0,
    colorHuntCount: 0,
    rescued: 0,
    rescueTargets: cfg.rescueTargets.map(v => ({ ...v })),
    shotsSinceMatch: 0,
    undo: null,
    undoLeft: UNDOS_PER_LEVEL,
  };
  return s;
}
