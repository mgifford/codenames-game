# CODENAMES Board Game Server and Frontend

This is a simple implementation of the famous board game - Codenames (by Vlaada Chvátil) -
using __Node.js__, __Angular__ and __Google Material UI__. No any database is used, all the games are kept in runtime memory and removed in one hour of inactivity.

The game supports both a **server-based mode** (requires a running Node.js backend) and a
**P2P / serverless mode** powered by PeerJS that works directly in the browser, including
on GitHub Pages and local networks.

Word lists include Russian sets and an English Standard set. You can create your own
dictionary by implementing `DictionaryModel` interface (see `GamesService` for usage) or
simply put extra yaml files in `dist/data` directory respecting the same structure as others.

## Play now (P2P / GitHub Pages)
Open **[https://mgifford.github.io/codenames-game/](https://mgifford.github.io/codenames-game/)**
and click **P2P Mode** — no server required.

## Steps to run (server mode)
 - Install [Node.js](https://nodejs.org/en/)
 - `$ git clone https://github.com/mgifford/codenames-game.git` - clone this repo
 - `$ cd codenames-game`
 - `$ npm i` - install dependencies
 - `$ npm run build` - build sources into `./dist`
 - `$ npm run start` - start game server serving API and frontend
 - Open `http://localhost:8095/` and have fun

## Build Docker image from local sources build
 - Install [Node.js](https://nodejs.org/en/)
 - Install [Docker](https://www.docker.com/)
 - `$ git clone https://github.com/mgifford/codenames-game.git` - clone this repo
 - `$ cd codenames-game`
 - `$ npm i` - install dependencies
 - `$ npm run build-docker`
 
Result image will be tagged as `codenames-game:latest`.

## Build Docker image only (using staged build)
 - Install [Docker](https://www.docker.com/)
 - `$ git clone https://github.com/mgifford/codenames-game.git` - clone this repo
 - `$ cd codenames-game`
 - `$ docker build . -f dockerfile.staged -t codenames-game`
 
## ENV Options
 - Default http port (8095) can be changed via `CODENAMES_HTTP_PORT`
 - `NO_CONSOLE_COLORS=1` to disable colorful console output 

## P2P / Serverless mode
The frontend includes a peer-to-peer game mode powered by [PeerJS](https://peerjs.com/).
Players can connect directly — no central game server required — making it suitable for
local Wi-Fi, mobile hotspots, or even a LAN with no internet access.

See **[docs/peerjs-local-gaming.md](docs/peerjs-local-gaming.md)** for a full explanation
of how it works, the host/guest architecture, the wire protocol, and setup tips for
different network environments.

## How to play
See [Wikipedia](https://en.wikipedia.org/wiki/Codenames_(board_game)) for the rules and details.
