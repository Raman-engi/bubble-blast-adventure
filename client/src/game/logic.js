
/**
 * Bubble Blast Adventure
 * Bubble board, matching, collision and gravity logic.
 * Canvas: 420 x 760
 */

export const R = 18;
export const DX = 38;
export const DY = 33;
export const COLS = 10;
export const ROWS = 18;

export const LEFT = 20;
export const TOP = 34;
export const WIDTH = 420;
export const HEIGHT = 760;

export const DANGER_Y = 590;
export const SHOOTER_Y = 666;

export const COLORS = [
  '#ff557e',
  '#4d9cff',
  '#42d6ad',
  '#ffd34f',
  '#a77bff',
  '#ff985c'
];

export const colorName = [
  'Pink',
  'Blue',
  'Mint',
  'Gold',
  'Violet',
  'Orange'
];

export const isColor = value =>
  Number.isInteger(value) &&
  value >= 0 &&
  value < COLORS.length;

export const isOccupied = value =>
  value !== null && value !== undefined;

/*
 * `shift` (0 or 1) keeps the hex-row offset stable when a new row is pushed in
 * from the top. Without it every old row flips half a cell sideways after a
 * wave, which breaks neighbour matching.
 */
export const rowOffset = (r, shift = 0) => (r + shift) % 2;

export const center = (r, c, shift = 0) => ({
  x: LEFT + R + c * DX + rowOffset(r, shift) * (DX / 2),
  y: TOP + R + r * DY
});

/* Always keep a full ROWS x COLS board so bubbles can attach below the last row */
export function normalizeBoard(board) {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => board?.[r]?.[c] ?? null)
  );
}

/* Hexagonal grid neighbours */
export const neighbors = (r, c, shift = 0) => {
  const cells = rowOffset(r, shift)
    ? [
        [r, c - 1],
        [r, c + 1],
        [r - 1, c],
        [r - 1, c + 1],
        [r + 1, c],
        [r + 1, c + 1]
      ]
    : [
        [r, c - 1],
        [r, c + 1],
        [r - 1, c - 1],
        [r - 1, c],
        [r + 1, c - 1],
        [r + 1, c]
      ];

  return cells.filter(
    ([rr, cc]) =>
      rr >= 0 &&
      rr < ROWS &&
      cc >= 0 &&
      cc < COLS
  );
};

export const bubbleCount = board =>
  board.reduce(
    (total, row) =>
      total + row.filter(isOccupied).length,
    0
  );

export const empty = board => bubbleCount(board) === 0;

function validCell(board, r, c) {
  return (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    Array.isArray(board[r])
  );
}

/* BFS: connected bubbles of the same colour */
export function connected(board, r, c, sameColor = true, shift = 0) {
  const start = board[r]?.[c];

  if (!isColor(start)) return [];

  const queue = [[r, c]];
  const seen = new Set([`${r},${c}`]);
  const found = [];

  for (let i = 0; i < queue.length; i++) {
    const [rr, cc] = queue[i];

    found.push([rr, cc]);

    for (const [nr, nc] of neighbors(rr, cc, shift)) {
      if (!validCell(board, nr, nc)) continue;

      const value = board[nr][nc];
      const key = `${nr},${nc}`;

      if (
        !isColor(value) ||
        (sameColor && value !== start) ||
        seen.has(key)
      ) continue;

      seen.add(key);
      queue.push([nr, nc]);
    }
  }

  return found;
}

/* Find bubbles unsupported by the top row */
export function floatingCells(board, shift = 0) {
  const queue = [];
  const supported = new Set();

  for (let c = 0; c < COLS; c++) {
    if (isOccupied(board[0]?.[c])) {
      queue.push([0, c]);
      supported.add(`0,${c}`);
    }
  }

  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];

    for (const [nr, nc] of neighbors(r, c, shift)) {
      if (!validCell(board, nr, nc)) continue;
      if (!isOccupied(board[nr][nc])) continue;

      const key = `${nr},${nc}`;

      if (supported.has(key)) continue;

      supported.add(key);
      queue.push([nr, nc]);
    }
  }

  const dropped = [];

  for (let r = 0; r < Math.min(board.length, ROWS); r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        isOccupied(board[r]?.[c]) &&
        !supported.has(`${r},${c}`)
      ) {
        dropped.push([r, c]);
      }
    }
  }

  return dropped;
}

/* Find the largest adjacent colour group */
function largestAdjacentColourGroup(board, r, c, shift = 0) {
  const candidates = new Map();

  for (const [nr, nc] of neighbors(r, c, shift)) {
    const color = board[nr]?.[nc];

    if (!isColor(color)) continue;

    if (candidates.has(color)) continue;

    candidates.set(
      color,
      connected(board, nr, nc, true, shift)
    );
  }

  return (
    [...candidates.values()].sort(
      (a, b) => b.length - a.length
    )[0] || []
  );
}

/* Resolve match-3 */
export function resolve(board, r, c, rainbow = false, shift = 0) {
  const next = board.map(row => [...row]);

  let matches = [];

  if (rainbow) {
    const group = largestAdjacentColourGroup(next, r, c, shift);

    if (group.length >= 2) {
      matches = [[r, c], ...group];
    }
  } else {
    matches = connected(next, r, c, true, shift);
  }

  let popped = 0;
  let dropped = 0;
  let droppedCells = [];

  if (matches.length >= 3) {
    for (const [rr, cc] of matches) {
      if (isOccupied(next[rr]?.[cc])) {
        next[rr][cc] = null;
        popped++;
      }
    }

    const falling = floatingCells(next, shift);

    droppedCells = falling.map(([rr, cc]) => ({
      r: rr,
      c: cc,
      color: next[rr][cc]
    }));

    for (const [rr, cc] of falling) {
      next[rr][cc] = null;
      dropped++;
    }
  }

  return {
    board: next,
    popped,
    dropped,
    matches: popped >= 3 ? matches : [],
    droppedCells
  };
}

/* Nearest empty cell (touching the ceiling or another bubble) for a landing point */
export function findAttachCell(board, x, y, shift = 0) {
  let best = null;
  let bestDistance = Infinity;

  for (let r = 0; r < Math.min(ROWS, board.length); r++) {
    for (let c = 0; c < COLS; c++) {
      if (!validCell(board, r, c)) continue;
      if (isOccupied(board[r][c])) continue;

      const touchesCeiling = r === 0;

      const touchesBubble = neighbors(r, c, shift).some(
        ([nr, nc]) => isOccupied(board[nr]?.[nc])
      );

      if (!touchesCeiling && !touchesBubble) continue;

      const p = center(r, c, shift);
      const distance = (p.x - x) ** 2 + (p.y - y) ** 2;

      if (distance < bestDistance) {
        bestDistance = distance;
        best = [r, c];
      }
    }
  }

  return best;
}

/* Attach fired bubble to nearest legal cell */
export function attach(board, x, y, color, rainbow = false, shift = 0) {
  const next = normalizeBoard(board);
  const best = findAttachCell(next, x, y, shift);

  if (!best) {
    return {
      board: next,
      popped: 0,
      dropped: 0,
      matches: [],
      droppedCells: [],
      attached: null
    };
  }

  next[best[0]][best[1]] = color;

  return {
    ...resolve(next, best[0], best[1], rainbow, shift),
    attached: best
  };
}

/* Add a new row */
export function pushWave(board, row) {
  const safeRow = Array.from(
    { length: COLS },
    (_, i) => row?.[i] ?? null
  );

  return [
    safeRow,
    ...board.map(r =>
      Array.from(
        { length: COLS },
        (_, i) => r?.[i] ?? null
      )
    )
  ].slice(0, ROWS);
}

/* Bomb explosion radius */
export function bombCells(board, x, y, radius = R * 3.15, shift = 0) {
  const cells = [];

  for (let r = 0; r < Math.min(board.length, ROWS); r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isOccupied(board[r]?.[c])) continue;

      const p = center(r, c, shift);

      if (
        Math.hypot(p.x - x, p.y - y) <= radius
      ) {
        cells.push([r, c]);
      }
    }
  }

  return cells;
}

/* Reproducible random generator for levels */
export function makeLevelSeed(seed) {
  let s = seed >>> 0;

  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * Move a shot in small sub-steps so it can never skip through (or sink deep
 * into) a bubble. Returns { hit, hitCell } where hitCell is the first bubble
 * touched, or null when the shot reached the ceiling.
 */
export function advanceProjectile(board, p, step = 1, shift = 0) {
  const speed = Math.hypot(p.vx, p.vy) * step;
  const parts = Math.max(1, Math.ceil(speed / 3));
  const hitDistance = R * 1.9;

  for (let i = 0; i < parts; i++) {
    p.x += (p.vx * step) / parts;
    p.y += (p.vy * step) / parts;

    if (p.x < R || p.x > WIDTH - R) {
      p.vx *= -1;
      p.x = Math.max(R, Math.min(WIDTH - R, p.x));
    }

    if (p.y <= TOP + R) {
      p.y = TOP + R;
      return { hit: true, hitCell: null };
    }

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isOccupied(board[r]?.[c])) continue;

        const q = center(r, c, shift);

        if (Math.hypot(q.x - p.x, q.y - p.y) <= hitDistance) {
          return { hit: true, hitCell: [r, c] };
        }
      }
    }
  }

  return { hit: false, hitCell: null };
}

/* Colours that are still on the board (only colours a shot can actually clear) */
export function colorsOnBoard(board) {
  const found = new Set();

  for (const row of board) {
    for (const value of row) {
      if (isColor(value)) found.add(value);
    }
  }

  return [...found];
}

/*
 * Choose the next bubble colour:
 *  - prefers the queued colour, but never a colour that is gone from the board
 *  - never gives the same colour more than twice in a row
 */
export function pickBubbleColor(board, queuedColor, recent = [], colorCount = COLORS.length) {
  const present = colorsOnBoard(board);
  const pool = present.length
    ? present
    : Array.from({ length: colorCount }, (_, i) => i);

  const lastTwoSame =
    recent.length >= 2 &&
    recent[recent.length - 1] === recent[recent.length - 2]
      ? recent[recent.length - 1]
      : null;

  let color = Number.isInteger(queuedColor) ? queuedColor % colorCount : null;

  if (color === null || !pool.includes(color)) {
    color = pool[Math.floor(Math.random() * pool.length)];
  }

  if (color === lastTwoSame && pool.length > 1) {
    const others = pool.filter(v => v !== lastTwoSame);
    color = others[Math.floor(Math.random() * others.length)];
  }

  return color;
}


/*
 * Dry-run of a shot, used for the aiming guide. Uses the exact same physics as
 * the real shot, so the preview always matches where the bubble lands.
 */
export function simulateShot(board, angle, shift = 0, maxFrames = 700) {
  const speed = 10.4;
  const p = {
    x: WIDTH / 2,
    y: SHOOTER_Y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed
  };

  const points = [{ x: p.x, y: p.y }];
  let lastVx = p.vx;
  let result = { hit: false, hitCell: null };

  for (let i = 0; i < maxFrames; i++) {
    result = advanceProjectile(board, p, 1, shift);

    // Record only corners (wall bounces) and the final point: keeps the path light.
    if (p.vx !== lastVx || result.hit) {
      points.push({ x: p.x, y: p.y });
      lastVx = p.vx;
    }

    if (result.hit) break;
  }

  const normalized = normalizeBoard(board);

  return {
    points,
    end: { x: p.x, y: p.y },
    hitCell: result.hitCell,
    cell: result.hit ? findAttachCell(normalized, p.x, p.y, shift) : null
  };
}

/* Fire booster: the whole same-colour cluster that was hit (plus a ring for tiny clusters) */
export function fireCells(board, hitCell, x, y, shift = 0) {
  if (hitCell) {
    const [r, c] = hitCell;
    const cluster = isColor(board[r]?.[c])
      ? connected(board, r, c, true, shift)
      : [[r, c]];

    if (cluster.length >= 4) return cluster;

    const key = new Set(cluster.map(([rr, cc]) => `${rr},${cc}`));
    const ring = bombCells(board, center(r, c, shift).x, center(r, c, shift).y, DX * 1.15, shift);

    ring.forEach(([rr, cc]) => key.add(`${rr},${cc}`));

    return [...key].map(k => k.split(',').map(Number));
  }

  return bombCells(board, x, y, DX * 1.15, shift);
}

/* Lightning booster: every bubble in the row that was hit */
export function rowCells(board, hitCell, shift = 0) {
  const row = hitCell ? hitCell[0] : 0;
  const cells = [];

  for (let c = 0; c < COLS; c++) {
    if (isOccupied(board[row]?.[c])) cells.push([row, c]);
  }

  return cells;
}
