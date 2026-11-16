import { getNeighbors } from './matchDetector';

export const getFloatingBubbles = (grid) => {
  const maxRows = grid.length;
  const maxCols = grid[0].length;
  const visited = new Set();
  const queue = [];

  for (let col = 0; col < maxCols; col++) {
    if (grid[0][col] !== null) {
      queue.push({ row: 0, col });
      visited.add(`0,${col}`);
    }
  }

  while (queue.length > 0) {
    const { row, col } = queue.shift();
    const neighbors = getNeighbors(row, col, maxRows, maxCols);

    for (const n of neighbors) {
      const key = `${n.row},${n.col}`;
      if (!visited.has(key) && grid[n.row]?.[n.col] !== null) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  const floating = [];
  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      if (grid[row][col] !== null && !visited.has(`${row},${col}`)) {
        floating.push({ row, col });
      }
    }
  }

  return floating;
};
