# BUBBLE BLAST ADVENTURE

An original browser-based bubble puzzle adventure built with React, Vite, Canvas 2D, Node.js, Express and MongoDB. The project uses a single environment-driven game name and a data-driven 120-level catalogue.

## Current product scope

- 12 themed water-world chapters with 10 sequential levels each (120 total).
- Bottom-to-top winding island map with current, completed, starred and locked nodes.
- Responsive landing page, player dashboard, login/register, achievements, leaderboard status, settings and help pages.
- Canvas bubble shooter with six colours, mouse/touch aiming, dotted trajectory, side-wall bounce, nearest valid hex-grid placement, BFS match detection, floating-bubble detection, particles and combo scoring.
- Controlled per-level bubble queue, limited shots and controlled descending rows. A row enters with a short slide animation after the level's wave cadence; waves are capped per level.
- One continuous scrolling map (level 1 at the bottom, a node on every bend), tap a node to open a level sheet.
- Coin economy: level rewards, daily gift, booster shop (Fire/Lightning/Rainbow/Bomb refills), 3 Undo shots per level.
- Daily Challenge (`/daily`): one deterministic puzzle per UTC date, +500 coins, a free booster and a streak bonus. Logged-in rewards are verified against a completed game session on the server.
- Leaderboards: Global, Weekly, Monthly and Friends tabs, plus your rank. Friends are added by email.
- Game History page (`/history`), original helper character "Bubbo", haptic feedback on phones, reduced-motion support and visible focus states.
- Level Editor (`/editor`): paint a hex board, set shots/colours/objective, test-play, save locally. Admins can publish levels for everyone.
- Phone-first layout (100dvh, thumb-reach booster dock).
- Selectable Fire, Lightning, Rainbow and Bomb shots; Extra Shot and Shuffle utilities; selected state and inventory counts.
- Pause overlay with resume, restart confirmation, map exit and sound/music preference toggles.
- Victory/defeat result screen with score, shots, popped bubbles, combo and star award.
- JWT authentication, bcrypt password hashing, MongoDB player progress, game sessions, progress persistence, achievement criteria and basic session/result plausibility checks.
- PWA manifest and a shell service worker. API requests are deliberately not cached.

## Tech stack

- Frontend: React 18, Vite 5, React Router, Canvas 2D.
- Backend: Node.js, Express 4, Mongoose, MongoDB.
- Security: Helmet, CORS allowlist, express-rate-limit, bcrypt, JWT.
- Hosting target: Vercel (client), Render (server), MongoDB Atlas.

## Local setup

Use Node.js 20 or newer.

### Backend

```powershell
cd server
npm install
Copy-Item .env.example .env
# Edit server/.env and set MONGODB_URI, JWT_SECRET, GAME_NAME, CLIENT_ORIGIN
npm run dev
```

`JWT_SECRET` must be a private random value of at least 32 characters. Never paste it into chat or commit it.

### Frontend (second terminal)

```powershell
cd client
npm install
Copy-Item .env.example .env
# Set VITE_GAME_NAME and VITE_API_URL in client/.env
npm run dev
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:5000/api/health`.

## Environment variables

`client/.env`:

```env
VITE_GAME_NAME=BUBBLE BLAST ADVENTURE
VITE_API_URL=http://localhost:5000/api
```

`server/.env`:

```env
PORT=5000
GAME_NAME=BUBBLE BLAST ADVENTURE
MONGODB_URI=
JWT_SECRET=
CLIENT_ORIGIN=http://localhost:5173
# Optional: comma-separated emails allowed to publish levels
ADMIN_EMAILS=
```

Frontend variables are baked into the bundle at build time: after changing `VITE_GAME_NAME` rebuild (`npm run build`) or restart `npm run dev`, and redeploy in production, before the new name appears. The backend reads `GAME_NAME` when the server starts.

The game name is centralized in `client/src/config/gameConfig.js` and the backend `GAME_NAME` setting. Vite variables are public in the browser bundle; never put secrets in `VITE_*` variables.

## API routes

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Levels and player data
- `GET /api/levels`
- `GET /api/levels/:id`
- `GET /api/player/progress` (JWT)
- `GET /api/player/wallet` (JWT; coins + booster inventory)
- `POST /api/player/wallet/sync` (JWT; one-time import of a guest save, clamped; afterwards the server wins)
- `POST /api/player/wallet/buy` (JWT; server-side price check)
- `POST /api/player/boosters/use` (JWT)

### Leaderboard, friends, daily, custom levels
- `GET /api/leaderboard?type=global|weekly|monthly|friends`
- `GET /api/friends`, `POST /api/friends/add` (JWT)
- `GET /api/daily-challenge` (optional JWT: adds streak/completed), `POST /api/daily-challenge/complete` (JWT; needs a completed session of today's level)
- `GET /api/custom-levels` (published levels)
- `GET /api/admin/me`, `GET|POST /api/admin/levels`, `PUT|DELETE /api/admin/levels/:id` (JWT + email listed in `ADMIN_EMAILS`)

### Game sessions
- `POST /api/games/start` (JWT; checks sequential unlock)
- `POST /api/games/complete` (JWT; validates ownership, one-time submission, elapsed time, numeric bounds and booster inventory)
- `GET /api/games/history` (JWT)
- `GET /api/games/:id` (JWT)

### Achievements, leaderboard and daily challenge
- `GET /api/achievements`
- `GET /api/achievements/me` (JWT)
- `GET /api/leaderboard`
- `GET /api/leaderboard/me` (JWT)
- `GET /api/daily-challenge`
- `POST /api/daily-challenge/complete` (JWT)

## Game rules and architecture

- The board is a row-offset hexagonal grid. `logic.js` contains grid coordinates, six-neighbour traversal, connected-component BFS, attachment, match resolution, unsupported-bubble detection and area selection for special shots.
- `levels.js` is the source of truth for level data: difficulty, colour count, initial board, objective metadata, shot budget, controlled queue, wave cadence, wave cap and available boosters.
- `economy.js` (coins/inventory cache), `audio.js` (Web Audio SFX), `scoring.js` (stars/points), `boosters.js` (Bomb/Fire/Lightning cell selection), `levelManager.js` (fresh level state) and `src/api.js` (fetch wrapper) keep `GameCanvas.jsx` focused on the render loop and state machine.
- Coins and boosters are saved on the server for logged-in players: prices, level rewards and booster deductions are computed server-side in `/api/games/complete` and `/api/player/wallet/*`; localStorage is only an offline cache.
- `GameCanvas.jsx` owns the per-level state machine: ready, shooting, descending-row animation, paused, won and lost. Restart restores the original generated board, queue, shots, score, combo and booster selection.
- The UI is split into route-level screens in `main.jsx`; level progression is sequential and the map scrolls to the current level.

## Score validation and leaderboard safety

The backend verifies session ownership, rejects reused sessions, checks elapsed time and plausible score/shot/pop/combo bounds, validates booster names and deducts booster inventory. **This is basic anti-cheat, not deterministic replay verification.** The leaderboard endpoint can display player totals but marks entries unverified and `ranked:false`. Do not present client-submitted scores as authoritative until the server simulates or verifies a deterministic shot replay.

## VELoop assignment checklist

### Implemented in the current source
- Original game identity and environment-based game name.
- React/Vite frontend and Express/MongoDB backend.
- Registration/login with bcrypt and JWT.
- Canvas launcher, current/next bubble, mouse/touch aim, trajectory and wall bounce.
- Offset bubble grid, six colours, collision placement, BFS match-3, pop particles and floating-bubble detection.
- Limited shots, controlled queue, score, combo and three-star calculation.
- 120 data-driven levels, sequential map unlocking, replay and 12 worlds.
- Pause, restart confirmation, hint/aim guide, bomb/fire/lightning/rainbow shots, extra-shot and shuffle utilities.
- Level completion/failure result route, player dashboard, game sessions/history API and achievement criteria.
- Responsive layout foundation, loading screen, error/loading feedback, environment examples, README, PWA manifest and service worker shell cache.

### Partial or needs real-device acceptance testing
- Generated level layouts have not each been individually hand-balanced or proven solvable. The level objective catalogue includes clear, score, drop, colour-hunt, limited-shots and combo metadata, but objective-specific progress tracking is not complete for every type.
- Stone and grid-bomb obstacles are represented in board data. A simple hidden hatchling rescue marker/objective is implemented; chained-bubble lock mechanics and richer character animations are not finished.
- Booster effects work in-game; the reward economy (coins, shop, level rewards, daily gift) is server-validated for logged-in players. Daily gift is still local-only.
- Server endpoints for wallet, daily challenge, friends, weekly/monthly leaderboards and custom levels were written and syntax-checked but could not be run against a real MongoDB in the authoring environment; test them once after setting `MONGODB_URI`.
- Sound effects and a simple synthesized ambient music loop are generated with Web Audio. A polished original music track and complete sound design asset pack are not included.
- PWA manifest, icon and `public/sw.js` shell cache exist; offline progress queueing is not implemented.
- Server checks session ownership, replay/duplicate use, time, plausible values and booster counts. It does not yet validate the actual shot sequence against a deterministic server-side game simulation.
- Achievements are computed from player stats; a separate durable user-achievement event collection is not included.

### Not yet complete / bonus work
- Reference-game playthrough and documented human gameplay analysis must be completed by the project owner; this build does not claim the reference app was played by the assistant.
- Splitting `logic.js` further into separate collision/matching files (currently one pure module, covered by tests).
- Full rescue-objective character animations and all objective variants.
- Original background music and complete sound design.
- Fully ranked global/weekly/monthly/friends leaderboard after authoritative replay verification.
- Dedicated admin dashboard UI (admins publish from the editor; there is no separate management page).
- Replay system and advanced analytics.
- Social share flow, final demo video and deployment acceptance test.

## Deployment

- Vercel: root directory `client`, build `npm run build`, output `dist`; configure `VITE_GAME_NAME` and production `VITE_API_URL`.
- Render: root directory `server`, build `npm install`, start `npm start`; configure `GAME_NAME`, `MONGODB_URI`, `JWT_SECRET`, and production `CLIENT_ORIGIN`.
- MongoDB Atlas: use a least-privilege database user and rotate credentials if they were ever included in an uploaded archive or shared message.

Never upload `.env`, `node_modules`, `.git` or private credentials to GitHub.
