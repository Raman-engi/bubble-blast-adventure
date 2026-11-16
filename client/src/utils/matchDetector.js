export const getNeighbors = (row, col, maxRows, maxCols) => {
  const isOddRow = row % 2 === 1;
  const directions = isOddRow
    ? [
        [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, 0],  [1, 1]
      ]
    : [
        [-1, -1], [-1, 0],
        [0, -1],  [0, 1],
        [1, -1],  [1, 0]
      ];

  const neighbors = [];
  for (const [dr, dc] of directions) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < maxRows && nc >= 0 && nc < maxCols) {
      neighbors.push({ row: nr, col: nc });
    }
  }
  return neighbors;
};

export const findConnectedBubbles = (grid, startRow, startCol, targetColorName) => {
  const visited = new Set();
  const queue = [{ row: startRow, col: startCol }];
  const matches = [];

  visited.add(`${startRow},${startCol}`);

  while (queue.length > 0) {
    const { row, col } = queue.shift();
    matches.push({ row, col });

    const neighbors = getNeighbors(row, col, grid.length, grid[0].length);
    for (const n of neighbors) {
      const key = `${n.row},${n.col}`;
      const cell = grid[n.row]?.[n.col];
      if (!visited.has(key) && cell && cell.name === targetColorName) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  return matches.length >= 3 ? matches : [];
};
