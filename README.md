# Bubble Blast Adventure — VELOOP Rewards Internship Project

Original full-stack bubble shooter project **development starter** based on the assigned 45-page brief. This is **not yet a complete submission**.

## Included in this version
- React/Vite responsive landing page, level selection, dashboard, auth, leaderboard placeholder, achievements display, help and settings
- Canvas gameplay with pointer aiming, trajectory preview, side-wall bounce, collision/nearest-grid attachment, hex-offset adjacency, BFS connected-component match-3, ceiling-connected floating detection, scoring, combo, shot limits, pause, hint and a basic bomb booster
- 40 deterministic, data-driven level layouts (not yet individually balanced or playtested)
- Express/Mongoose auth and session endpoints, JWT/bcrypt, basic input validation, duplicate-session checks
- Centralized frontend `VITE_GAME_NAME` and backend `GAME_NAME` configuration

## Important missing work before submission
- Reference gameplay study and 40-level difficulty/playability testing; several objective types are generated but **not yet implemented** (rescue, color hunt, drop, etc.)
- Sound effects, background music, particles, original mascot assets, polished level completion animation
- True server-authoritative score validation/replay: current score payload checks are **not anti-cheat proof**, so ranked leaderboard is intentionally disabled
- Persistent verified achievements, booster inventory, mobile QA, PWA, admin, production test suite and deployment
- Current game uses Canvas rather than Phaser; this is an acceptable PDF alternative but may be upgraded

## Installation
Requires Node 20+ and a MongoDB instance.

```bash
cd client && npm install && cp .env.example .env && npm run dev
```

In another terminal:

```bash
cd server && npm install && cp .env.example .env
# Edit server/.env: add MONGODB_URI and a strong random JWT_SECRET
npm run dev
```

Windows PowerShell: use `Copy-Item .env.example .env` instead of `cp`.

## Environment
Frontend `client/.env`: `VITE_GAME_NAME`, `VITE_API_URL`. Backend `server/.env`: `GAME_NAME`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, `PORT`. Never commit secrets. Changing Vite environment values requires rebuilding the production bundle.

## API summary
`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/levels`, `GET /api/levels/:id`, `POST /api/games/start`, `POST /api/games/complete`, `GET /api/games/history`, `GET /api/games/:id`, `GET /api/player/progress`, `GET /api/leaderboard`, `GET /api/leaderboard/me`, `GET /api/achievements`, `GET /api/achievements/me`, `GET /api/health`.

## Architecture
`client/src/game/logic.js` contains board graph logic independent of React; `GameCanvas.jsx` renders and handles pointer inputs; `levels.js` produces level configurations; `server/src/index.js` implements the initial backend. Refactor backend routes/services as features expand.

## Deployment plan
Deploy `client` to Vercel, `server` to Render, database to MongoDB Atlas. Set environment variables in hosting dashboards and configure CORS origin. Deployment has **not been performed**.

## Reference and originality
Reference game: https://play.google.com/store/apps/details?id=game.bubble.shooter.dragon.pop . Do not reuse original game assets, branding, music or source.

## Demo / screenshots
Not yet recorded. Capture only after gameplay, backend, and deployment testing are complete.
