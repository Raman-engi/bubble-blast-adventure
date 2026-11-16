import { makeLevelSeed, COLS, normalizeBoard, floatingCells } from './logic.js';
export const COLORS = ['#ff557e','#4d9cff','#42d6ad','#ffd34f','#a77bff','#ff985c'];
export const WORLD_NAMES = ['Bubble Bay','Coral Coast','Candy Canyon','Crystal Forest','Cloud Kingdom','Lava Peaks','Mystic Marsh','Aurora Isles','Dragon Ridge','Starfall Citadel','Moonlight Harbor','Eternal Galaxy'];
export const WORLD_ICONS = ['🏝️','🐚','🍬','💎','☁️','🌋','🌿','🌌','🐉','🏰','🌙','✨'];
const OBJECTIVES=['clear_all','score','drop','color_hunt','limited_shots','combo','rescue'];
const DIFFICULTY=['Tutorial','Beginner','Easy','Medium','Hard','Expert'];
export function levelFor(id) {
  const n=Math.max(1,Math.min(120,Number(id)||1)), world=Math.floor((n-1)/10);
  const difficultyIndex=n<=5?0:n<=10?1:n<=20?2:n<=30?3:n<=40?4:Math.min(5,Math.floor((n-1)/14));
  const colors=Math.min(6,3+Math.floor((n-1)/18));
  const rows=Math.min(11,4+Math.floor((n-1)/15));
  const random=makeLevelSeed(n*92821+731);
  const board=Array.from({length:rows},(_,r)=>Array.from({length:COLS},(_,c)=>{
    // Small same-colour patches create readable match opportunities instead of pure random noise.
    const patch=Math.floor(c/3)+Math.floor(r/2);
    const palette=(patch+Math.floor(random()*2))%colors;
    return random()<0.025?null:palette;
  }));
  if(n===1){
    // Friendly first level: 5 rows, 3 colours, easy groups to match.
    board.splice(0,board.length,
      [0,0,0,1,1,1,2,2,2,2],
      [0,0,1,1,1,2,2,2,0,0],
      [1,1,0,0,2,2,0,0,1,1],
      [null,1,1,0,null,null,0,1,1,null],
      [null,null,1,null,null,null,null,1,null,null]);
  }
  if(n>=5 && n%5===0 && board[2]) board[2][Math.min(4,COLS-1)]={type:n>=10?'bomb':'stone'};
  // Pad to the full board height and drop bubbles that are not attached to the ceiling.
  const fullBoard=normalizeBoard(board);
  floatingCells(fullBoard).forEach(([r,c])=>{fullBoard[r][c]=null;});
  board.splice(0,board.length,...fullBoard);
  const objective=n<=5?'clear_all':OBJECTIVES[(n-1)%OBJECTIVES.length];
  const rescueTargets=objective==='rescue'?[{r:Math.max(1,rows-1),c:3},{r:Math.max(1,rows-2),c:6}].slice(0,1+Math.floor(n/70)):[];
  rescueTargets.forEach(({r,c})=>{if(board[r])board[r][c]=Math.floor(random()*colors);});
  const shots=Math.max(18,30-Math.floor(n/10)+(n%5===0?2:0));
  const targetScore=300+n*55;
  const bubbleQueue=[];
  while(bubbleQueue.length<shots+16){
    // Never queue the same colour more than twice in a row.
    let v=Math.floor(random()*colors);
    const l=bubbleQueue.length;
    if(colors>1 && l>=2 && bubbleQueue[l-1]===v && bubbleQueue[l-2]===v) v=(v+1+Math.floor(random()*(colors-1)))%colors;
    bubbleQueue.push(v);
  }
  const waveEvery=n<=5?7:n<=20?6:n<=50?5:4;
  return {id:n,world,worldName:WORLD_NAMES[world],difficulty:DIFFICULTY[difficultyIndex],difficultyIndex,colors,rows,board,shots,objective,targetScore,targetColor:(n+1)%colors,colorTarget:Math.min(18,6+Math.floor(n/8)),starThresholds:[targetScore,Math.round(targetScore*1.45),Math.round(targetScore*1.9)],bubbleQueue,waveEvery,waveTrigger:Math.max(12,32-Math.floor(n/5)),maxWaves:n<=5?2:n<=20?3:n<=60?4:5,availableBoosters:['fire','lightning','rainbow','bomb','aimGuide','extraShot','shuffle'],specials:{stone:n>=5,chain:n>=10},rescueTargets,rescueTarget:rescueTargets.length};
}
export const LEVELS=Array.from({length:120},(_,i)=>levelFor(i+1));
