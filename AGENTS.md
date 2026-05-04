# AGENTS.md — Codenames Game

This file helps AI coding agents (Copilot, Cursor, Codex, etc.) understand the
repository layout, build system, conventions, and common workflows so they can
contribute accurately without breaking existing behaviour.

---

## Project Overview

A full-stack implementation of the [Codenames](https://en.wikipedia.org/wiki/Codenames_(board_game))
board game. The stack is:

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + WebSocket (`express-ws`) |
| Frontend | Angular 9 + Angular Material + GSAP |
| P2P mode | PeerJS 1.4.7 (WebRTC DataChannel) |
| Data | YAML word-list files (no database) |
| Language | TypeScript throughout |

Two play modes exist:

1. **Server mode** — requires the Node.js backend; game state lives in server
   memory and expires after 1 hour of inactivity.
2. **P2P / serverless mode** — entirely in the browser using PeerJS. The host
   browser acts as the game server; no backend call is made during play. This
   mode is deployed on GitHub Pages.

---

## Repository Layout

```
/
├── data/                   Word-list YAML files (copied to dist/data at build)
│   ├── 1-gaga.yaml
│   ├── 2-denull.yaml
│   ├── 3-adult.yaml
│   └── 4-english-standard.yaml
├── docs/
│   └── peerjs-local-gaming.md  Deep-dive on P2P / offline play
├── frontend/               Angular 9 application
│   ├── src/
│   │   └── app/
│   │       ├── components/ Page components (page-board, page-p2p-board, …)
│   │       ├── core/       Shared utilities, word lists for P2P
│   │       └── services/   game.service, peer-game.service, …
│   ├── angular.json
│   ├── tsconfig.json       skipLibCheck: true (required for peerjs types)
│   └── package.json
├── server/                 Node.js + Express backend
│   ├── src/
│   │   ├── api/            Shared API types (HTTP + WS)
│   │   ├── app/
│   │   │   ├── controller/ Express route handlers
│   │   │   └── service/    GamesService, GamesGateway (WS)
│   │   ├── core/           Utilities (logging, serialization, …)
│   │   ├── model/          Pure game logic (GameModel, Agent, …)
│   │   └── main.ts         Entry point
│   ├── test/               Jest tests
│   ├── jest.config.js
│   └── package.json
├── dist/                   Build output (git-ignored); served by Node.js
│   ├── server/
│   ├── frontend/
│   └── data/
├── dockerfile              Docker image (copies pre-built dist/)
├── dockerfile.staged       Multi-stage Docker build (builds inside Docker)
├── docker-compose.yaml
└── package.json            Root convenience scripts
```

---

## Build

### Prerequisites

- Node.js ≥ 16
- npm

> **Important:** Angular 9 uses Webpack 4 which is incompatible with OpenSSL 3
> (Node ≥ 17). Always set `NODE_OPTIONS=--openssl-legacy-provider` for any
> Angular build or serve command.

### Full build (server + frontend)

```bash
# Install all dependencies (server and frontend)
npm install            # runs `cd server && npm install && cd ../frontend && npm install`

# Build both packages into dist/
npm run build          # runs server build then frontend build
```

Build artefacts land in:

- `dist/server/`   — compiled Node.js server
- `dist/frontend/` — compiled Angular app (served as static files by the server)
- `dist/data/`     — YAML word lists copied from `data/`

### Server only

```bash
cd server
npm run build
```

### Frontend only

```bash
cd frontend
NODE_OPTIONS=--openssl-legacy-provider npm run build
```

For GitHub Pages deploy the base-href must be set:

```bash
cd frontend
NODE_OPTIONS=--openssl-legacy-provider npm run build -- --prod --base-href /codenames-game/
```

### Docker

```bash
# Build sources first, then Docker image
npm run build-docker

# OR use the multi-stage dockerfile (builds everything inside Docker)
docker build . -f dockerfile.staged -t codenames-game
```

---

## Run

### Development (server-based mode)

```bash
npm run start          # NODE_ENV=production node dist/server/main.js
```

Open `http://localhost:8095/`.

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `CODENAMES_HTTP_PORT` | `8095` | HTTP listen port |
| `NO_CONSOLE_COLORS` | unset | Set to `1` to disable coloured log output |

### Frontend dev server (with proxy to running backend)

```bash
cd frontend
NODE_OPTIONS=--openssl-legacy-provider npm start   # ng serve --proxy-config proxy.conf.json
```

The proxy forwards `/api/*` to `http://localhost:8095`.

### Docker Compose

```bash
docker-compose up
```

Default port mapping: `localhost:3000 → container:8095`.

---

## Test

### Server (Jest)

```bash
cd server
npx jest
```

Test files live in `server/test/` (e.g. `game.test.ts`, `serialization.test.ts`).

### Frontend (Karma / Jasmine)

```bash
cd frontend
NODE_OPTIONS=--openssl-legacy-provider npm test    # ng test
```

---

## Lint & Format

### Server

```bash
cd server
npm run lint     # eslint with @typescript-eslint, --fix applied automatically
npm run format   # prettier --write "src/**/*.ts"
```

### Frontend

```bash
cd frontend
npm run lint     # ng lint (tslint)
```

---

## Architecture Notes

### Server

- **No framework magic** — the application is wired manually via `Application`
  (`server/src/app/application.ts`) which calls `init()` on every controller and
  service in dependency order.
- **Controllers** are thin Express routers. Business logic lives in services.
- **GamesService** is the single source of truth for all in-memory game state.
  Games expire automatically after 1 hour of inactivity.
- **GamesGateway** handles WebSocket connections and pushes real-time updates to
  connected clients.
- **Game logic** is pure TypeScript in `server/src/model/` — no Express
  dependencies. `GameModel` contains move application, win detection, and
  board generation.
- **Dictionaries** are YAML files loaded from `dist/data/` at startup. Add new
  word lists by dropping a `.yaml` file there (follows the structure of existing
  files). The `DictionaryModel` interface defines the contract.

### Frontend

- **Angular 9** with Angular Material components.
- **Two service families:**
  - `game.service.ts` / `dictionaries.service.ts` — HTTP/WS calls to the
    Node.js backend.
  - `peer-game.service.ts` / `p2p-types.ts` — all PeerJS peer-to-peer logic;
    runs without any backend.
- **Page components** map 1:1 to routes defined in `app-routing.module.ts`:
  `page-start`, `page-new-game`, `page-join`, `page-board`, `page-p2p-lobby`,
  `page-p2p-board`, `page-rules`, `page-error`.
- **P2P word lists** (`frontend/src/app/core/p2p-word-lists.ts`) are bundled
  statically so the P2P mode works with no server at all.

### P2P Protocol

All P2P messages are plain JSON sent over PeerJS DataChannels. Types are
defined in `p2p-types.ts`:

```
state_update  → host broadcasts full game state to all guests
reveal_card   → guest requests a card reveal
send_hint     → guest (Spymaster) sends a hint word + count
end_turn      → guest ends their turn
```

See `docs/peerjs-local-gaming.md` for a complete explanation.

---

## Code Conventions

- **TypeScript** everywhere; `strict` is not enabled but avoid `any` where
  practical.
- **snake_case** for file names in `server/` (e.g. `games_service.ts`).
- **camelCase** for file names in `frontend/` (e.g. `gameService.ts`).
- Angular component files follow the Angular CLI convention:
  `page-board/page-board.component.ts`, `.html`, `.scss`.
- Use `bindClass(this)` (from `core/bind_class.ts`) in server classes instead
  of manually binding methods passed as callbacks.
- HTTP response shapes are defined as interfaces in `server/src/api/http/`.
- Use `asyncJson(handler)` (from `core/express/async_json.ts`) to wrap async
  Express handlers — it catches rejections and forwards them to Express's
  error-handling chain.
- The `Logecom` logger (`server/src/core/logecom/`) is used for all server-side
  logging; do not use `console.log` directly in new server code.
- Prettier and ESLint configs are set in `server/.prettierrc` and
  `server/.eslintrc.js`. Run `npm run format && npm run lint` before committing
  server changes.

---

## Important Constraints

- **peerjs version must stay at 1.4.7.** Versions ≥ 1.5.0 use TypeScript 4.1+
  template literal types that are incompatible with the Angular 9 TypeScript 3.8
  compiler. `skipLibCheck: true` is set in `frontend/tsconfig.json` to suppress
  remaining type errors from the peerjs 1.4.7 types.
- **Do not upgrade Angular** without also planning a migration of the PeerJS
  dependency and the OpenSSL legacy provider workaround.
- **`NODE_OPTIONS=--openssl-legacy-provider` is mandatory** for Angular 9 builds
  on Node ≥ 17. It is set in CI (`deploy.yml`) and must be preserved.
- The `dist/` directory is the runtime artifact directory and is not committed to
  git. Never edit files inside `dist/` — regenerate them by running the build.

---

## CI / Deployment

The only workflow is `.github/workflows/deploy.yml`:

1. Triggered on push to `master` (or manually via `workflow_dispatch`).
2. Installs frontend dependencies (`npm ci`) with `NODE_OPTIONS=--openssl-legacy-provider`.
3. Builds the frontend with `--base-href /codenames-game/`.
4. Uploads `dist/frontend` as a Pages artefact.
5. Deploys to GitHub Pages at `https://mgifford.github.io/codenames-game/`.

The live P2P demo is served from GitHub Pages; the server-based mode requires
self-hosting (Docker or direct Node.js).

---

## Adding a New Word List

1. Create `data/<n>-<slug>.yaml` following the structure of the existing YAML
   files (a `name`, `description`, optional `warning`, and a flat list of
   `words`).
2. For **server mode**: the file will be picked up automatically at next server
   start (files are sorted and indexed in order).
3. For **P2P mode**: add the word list to
   `frontend/src/app/core/p2p-word-lists.ts` so it is bundled into the Angular
   app.
4. Rebuild the project.

---

## Common Workflows for AI Agents

| Task | Steps |
|---|---|
| Fix a server-side bug | Edit in `server/src/`, run `cd server && npm run build`, check `cd server && npx jest` |
| Fix a frontend bug | Edit in `frontend/src/`, run `cd frontend && NODE_OPTIONS=--openssl-legacy-provider npm run build` |
| Add a REST endpoint | Add route in the relevant controller under `server/src/app/controller/`, add logic in `server/src/app/service/`, add request/response type in `server/src/api/http/` |
| Add an Angular page | Use Angular CLI: `cd frontend && npx ng generate component components/page-<name>`, then add route in `app-routing.module.ts` |
| Add a new game action (P2P) | Extend the `P2PMessage` union in `p2p-types.ts`, handle it in `peer-game.service.ts` (host and guest sides) |
| Run all server tests | `cd server && npx jest` |
| Format + lint server code | `cd server && npm run format && npm run lint` |
