import { bombCells, fireCells, rowCells, DX } from './logic';

/* Boosters that fly as a projectile and clear cells when they land. */
export const PROJECTILE_BOOSTERS = ['bomb', 'fire', 'lightning', 'rainbow'];

export const isProjectileBooster = key => PROJECTILE_BOOSTERS.includes(key);

/* Which cells a Bomb / Fire / Lightning shot removes. Pure: no game state is touched. */
export function boosterCells(type, board, hitCell, x, y, shift) {
  if (type === 'lightning') return rowCells(board, hitCell || null, shift);
  if (type === 'fire') return fireCells(board, hitCell || null, x, y, shift);
  if (type === 'bomb') return bombCells(board, x, y, DX * 1.9, shift);
  return [];
}
