import { levelFor } from './levels';
import { COLS, ROWS, normalizeBoard, floatingCells, makeLevelSeed } from './logic';

/* Player-made levels (Level Editor). Drafts live in localStorage; admins can
   publish a level to the server so everybody can play it. */
const KEY = 'bubble-blast-custom-levels-v1';
export const EDITOR_ROWS = 10;

export const OBJECTIVE_TYPES = [
  ['clear_all', 'Clear all bubbles'],
  ['rescue', 'Rescue hidden creatures'],
  ['drop', 'Drop bubbles'],
  ['color_hunt', 'Clear a colour'],
  ['limited_shots', 'Limited shots'],
  ['combo', 'Combo challenge'],
  ['score', 'Reach a score'],
];

export const blankLevel = () => ({
  id: `local-${Date.now().toString(36)}`,
  name: 'My level',
  objective: 'clear_all',
  shots: 25,
  colors: 4,
  targetScore: 500,
  board: Array.from({ length: EDITOR_ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => (r < 3 ? (c + r) % 3 : null))),
});

export function listLocalLevels() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalLevel(level) {
  const all = listLocalLevels().filter(item => item.id !== level.id);
  all.unshift(level);
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 30)));
}

export function deleteLocalLevel(id) {
  localStorage.setItem(KEY, JSON.stringify(listLocalLevels().filter(l => l.id !== id)));
}

export function getLocalLevel(id) {
  return listLocalLevels().find(item => item.id === id) || null;
}

/* Turns editor data into the same config shape levelFor() returns. */
export function buildCustomConfig(level) {
  const base = levelFor(1);
  const colors = Math.min(6, Math.max(2, Number(level.colors) || 4));
  const padded = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => level.board?.[r]?.[c] ?? null));
  const board = normalizeBoard(padded);

  // Bubbles that are not attached to the ceiling would just fall: drop them.
  floatingCells(board).forEach(([r, c]) => { board[r][c] = null; });

  const filled = [];
  board.forEach((row, r) => row.forEach((cell, c) => {
    if (Number.isInteger(cell)) filled.push([r, c]);
  }));

  const rescueTargets = level.objective === 'rescue'
    ? filled.slice(-2).map(([r, c]) => ({ r, c })) : [];

  const shots = Math.min(60, Math.max(5, Number(level.shots) || 25));
  const targetScore = Math.max(0, Number(level.targetScore) || 500);
  const random = makeLevelSeed(
    [...String(level.id || 'x')].reduce((t, ch) => t + ch.charCodeAt(0), 7));
  const bubbleQueue = [];

  while (bubbleQueue.length < shots + 16) {
    let v = Math.floor(random() * colors);
    const l = bubbleQueue.length;

    if (colors > 1 && l >= 2 && bubbleQueue[l - 1] === v && bubbleQueue[l - 2] === v) {
      v = (v + 1) % colors;
    }

    bubbleQueue.push(v);
  }

  return {
    ...base,
    id: 0,
    custom: true,
    name: level.name,
    worldName: 'Level Editor',
    difficulty: 'Custom',
    colors,
    board,
    objective: level.objective,
    shots,
    targetScore,
    targetColor: 0,
    colorTarget: 10,
    starThresholds: [targetScore, Math.round(targetScore * 1.45), Math.round(targetScore * 1.9)],
    bubbleQueue,
    rescueTargets,
    rescueTarget: rescueTargets.length,
    maxWaves: 0,
  };
}
