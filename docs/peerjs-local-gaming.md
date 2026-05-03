# PeerJS and Local / Serverless Gaming

This document explains how Codenames uses [PeerJS](https://peerjs.com/) to run entirely
without a central game server, including on very local networks (a single Wi-Fi hotspot,
a home router, or an ad-hoc device mesh) where there is no public internet access at all.

---

## Table of Contents

1. [What is PeerJS?](#1-what-is-peerjs)
2. [How WebRTC Peer-to-Peer Connections Work](#2-how-webrtc-peer-to-peer-connections-work)
3. [The Role of a Signalling Server](#3-the-role-of-a-signalling-server)
4. [Playing on a Very Local Network (No Internet)](#4-playing-on-a-very-local-network-no-internet)
5. [How Codenames Uses PeerJS](#5-how-codenames-uses-peerjs)
6. [Host / Guest Architecture](#6-host--guest-architecture)
7. [The Wire Protocol](#7-the-wire-protocol)
8. [Limitations and Trade-offs](#8-limitations-and-trade-offs)
9. [Tips for Different Network Setups](#9-tips-for-different-network-setups)

---

## 1. What is PeerJS?

PeerJS is a JavaScript library that wraps the browser's native **WebRTC DataChannel** API
behind a much simpler interface. Instead of dealing with ICE candidates, SDP offers/answers,
and STUN/TURN negotiation by hand, you write code like:

```js
const peer = new Peer('my-unique-id');
const conn = peer.connect('their-unique-id');
conn.on('data', data => console.log(data));
conn.send({ hello: 'world' });
```

Once two peers are connected, all messages travel **directly between browsers** — no game
server involved, no cloud, no monthly bill.

Version used in this project: **peerjs 1.4.7** (highest version compatible with
TypeScript 3.8 / Angular 9).

---

## 2. How WebRTC Peer-to-Peer Connections Work

WebRTC is a W3C standard built into every modern browser (Chrome, Firefox, Safari, Edge).
At its core, setting up a connection requires two steps:

1. **Signalling** — the two browsers exchange a small amount of metadata ("my public
   IP address and port are X, my private IP address is Y, here is my codec description").
   This exchange can happen over *any* channel: a central server, a QR code, a text
   message, or even voice.

2. **ICE (Interactive Connectivity Establishment)** — the browsers try a ranked list of
   candidate paths (direct LAN address → public NAT address → TURN relay) until one
   succeeds.

Once the ICE handshake completes, a raw encrypted **DataChannel** is open and all game
data flows peer-to-peer, completely bypassing whatever server was used for signalling.

```
  Player A                             Player B
  ──────────────────────────────────────────────────────────
  Browser                              Browser
     │  ①  "Here is my SDP offer"         │
     │ ──────────► signalling server ────► │
     │                                     │
     │  ②  "Here is my SDP answer"         │
     │ ◄────────── signalling server ◄──── │
     │                                     │
     │  ③  DataChannel open  (direct!)     │
     │ ◄══════════════════════════════════► │
     │       All game messages here        │
```

---

## 3. The Role of a Signalling Server

PeerJS ships with a reference signalling server
([peerjs-server](https://github.com/peers/peerjs-server)) and also provides a free hosted
version at `0.peerjs.com`.

**What the signalling server does:**

- Assigns a unique peer ID (e.g. `cn-a3f8x7k`) when `new Peer(id)` is called.
- Relays the initial SDP offer/answer and ICE candidates between the two browsers.
- Does **nothing** after the connection is established.

**What the signalling server does NOT do:**

- It never sees your game data.
- It is not involved in game logic.
- It does not need to be fast or highly available; it is only contacted for a few hundred
  milliseconds at session start.

Because the signalling server's job is so lightweight, it can be self-hosted on a
Raspberry Pi, a laptop running `npx peer`, or any Node.js process on the same LAN.

---

## 4. Playing on a Very Local Network (No Internet)

The P2P mode is designed to work on **very local networks** — the kind you might find
at a board-game night, a classroom, a hackathon, or a community event with no internet
connection.

### 4a. Scenarios

| Scenario | What you need |
|---|---|
| Everyone on the same Wi-Fi / Ethernet | Just a LAN — ICE finds the local address automatically |
| Mobile hotspot (one phone sharing) | The hotspot acts as the router; no internet needed |
| No router at all (two devices, one cable or ad-hoc Wi-Fi) | Link-local addresses (169.254.x.x / fe80::) work with WebRTC |
| Complete offline (pre-loaded app) | Works if the app is already loaded in each browser |

### 4b. The Signalling Problem on a LAN

The one catch: PeerJS needs to exchange those initial SDP messages *somehow*.  Two options:

**Option A — Use the built-in default signalling server (requires internet)**

By default, `new Peer()` connects to `0.peerjs.com`. This is fine when the devices have
internet access, but breaks if they don't.

**Option B — Run a local signalling server (no internet needed)**

Install and run `peerjs-server` on one machine on the LAN:

```bash
# One-time install (needs npm, once)
npm install -g peer

# Start the server (port 9000)
peerjs --port 9000
```

Then pass the server address when constructing the Peer object in
`peer-game.service.ts`:

```ts
// Example: override default signalling server
this.peer = new Peer(roomId, {
    host: '192.168.1.42',   // LAN IP of the machine running peerjs-server
    port: 9000,
    path: '/'
});
```

All devices on the LAN reach `192.168.1.42:9000` for the two-second handshake, then
talk directly to each other for the rest of the game.  No packet ever leaves the room.

**Option C — Manual / Out-of-band Signalling**

For the truly offline case (two devices, no network at all), the SDP offer/answer blobs
can theoretically be copy-pasted manually or transferred via QR code.  This is not
implemented in the current UI but is architecturally possible with PeerJS.

### 4c. Why No Packets Leave the Room

Once ICE selects a **host candidate** (a local-network IP address), both browsers open
a direct UDP/DTLS channel over the LAN.  Every `conn.send(message)` call serialises the
message to JSON, wraps it in a DTLS-encrypted UDP datagram, and delivers it directly
to the other device's IP address on the LAN.  The latency is typically under 5 ms.

No cloud service, no NAT traversal, no TURN relay — the packets never reach a router
with a default gateway.

---

## 5. How Codenames Uses PeerJS

The P2P feature is found in:

| File | Purpose |
|---|---|
| `frontend/src/app/services/peer-game.service.ts` | All PeerJS logic, game state, messaging |
| `frontend/src/app/services/p2p-types.ts` | TypeScript types for messages and game state |
| `frontend/src/app/components/page-p2p-lobby/` | Lobby UI (create/join room) |
| `frontend/src/app/components/page-p2p-board/` | In-game board UI |
| `frontend/src/app/core/p2p-word-lists.ts` | Word lists bundled into the frontend (no server needed) |

The word lists are statically bundled into the Angular app, so the game board can be
generated entirely in the browser.  No API calls are made during a P2P game.

---

## 6. Host / Guest Architecture

Codenames P2P uses a **star topology** with a single host as the source of truth:

```
        ┌──────────┐
        │   HOST   │  (generates board, applies all moves)
        └─────┬────┘
        ┌─────┴──────┐
   ─────┤  PeerJS    ├─────
        │  DataChan  │
   ─────┴──────┬─────┴─────
        ┌──────┴───┐  ┌──────────┐
        │ Guest 1  │  │ Guest 2  │  (send actions → host; receive state ← host)
        └──────────┘  └──────────┘
```

### Host responsibilities

- Calls `new Peer(roomId)` with a deterministic room ID (e.g. `cn-a3f8x7k`).
- Generates the board (shuffle, card assignments) locally in the browser.
- Listens for incoming connections via `peer.on('connection', ...)`.
- Applies every game action (reveal card, send hint, end turn) and broadcasts the new
  state to all guests.

### Guest responsibilities

- Calls `new Peer()` (random ephemeral ID) then `peer.connect(hostPeerId)`.
- Sends action messages to the host; never mutates state directly.
- Re-renders whenever a `state_update` message arrives.

This design means:

- **No central server is needed for game logic** — the host's browser *is* the server.
- Any number of guests can join; the host fans the state out to each connection.
- If the host leaves the session, the game ends (single point of failure by design —
  keeping it simple).

---

## 7. The Wire Protocol

All messages are plain JSON objects sent over PeerJS DataChannels.
The message union type is defined in `p2p-types.ts`:

```ts
export type P2PMessage =
    | { type: 'state_update'; state: P2PGameState }   // Host → all Guests
    | { type: 'reveal_card'; cardIndex: number }       // Guest → Host
    | { type: 'send_hint';   hint: string; count: number } // Guest → Host
    | { type: 'end_turn' };                            // Guest → Host
```

### Message flow for a typical turn

```
Guest (Spymaster)                    Host
─────────────────                    ────
send_hint "ocean / 3"  ────────────► applyHint()
                                     broadcastState()
                        ◄──────────  state_update { move: { hint:"ocean", count:4 } }

Guest (Operative)                    Host
─────────────────                    ────
reveal_card 7          ────────────► applyRevealCard(7)
                                     broadcastState()
                        ◄──────────  state_update { board[7].uncovered: true, ... }
```

The count sent in a hint is `count + 1` internally (to allow the bonus guess), and
`count = 0` maps to "unlimited" (full board size) per standard Codenames rules.

---

## 8. Limitations and Trade-offs

| Topic | Current behaviour |
|---|---|
| **Trust model** | All card sides are always synced to all peers. A guest who reads the raw DataChannel messages can see all card colours — this is an "honour system" implementation. |
| **Host departure** | If the host closes the tab, all guests lose the game state. |
| **Reconnection** | There is no reconnect logic; a dropped connection ends the session. |
| **Many players** | The host opens one DataChannel per guest; 4–6 guests is comfortable, more may work but is untested. |
| **Signalling server** | The default `0.peerjs.com` requires internet for the initial handshake (see §4b for the LAN alternative). |
| **TURN relay** | Not configured; connections that cannot go direct (symmetric NAT, strict firewalls) will fail. On a LAN this is never an issue. |

---

## 9. Tips for Different Network Setups

### Home / office Wi-Fi (internet available)
No configuration needed. Share the Room ID that appears in the lobby and join with it.

### Mobile hotspot (host phone sharing internet)
Works out of the box. The hotspot provides internet for the PeerJS signalling handshake;
after that, data travels over the hotspot's private 192.168.x.x network.

### LAN party / classroom with no internet
1. On one laptop, run: `npx peerjs --port 9000`
2. Note its LAN IP (e.g. `192.168.0.10`)
3. In `peer-game.service.ts`, pass the `host`/`port` options to both `new Peer()` calls
   (see §4b).
4. Rebuild the frontend: `cd frontend && NODE_OPTIONS=--openssl-legacy-provider npm run build`
5. Serve the built files from any static file server on the same laptop.
   All game traffic stays within the room.

### Completely offline (pre-loaded in browser, two devices)
As long as the Angular app is already loaded (cached by the browser's service worker or
opened from a local file), the only blocker is signalling.  Running `peerjs-server`
locally (§4b) or using a manually exchanged SDP blob removes that dependency entirely.

---

## Further Reading

- [PeerJS documentation](https://peerjs.com/docs/)
- [peerjs-server (self-host the signalling server)](https://github.com/peers/peerjs-server)
- [MDN: WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [MDN: ICE (Interactive Connectivity Establishment)](https://developer.mozilla.org/en-US/docs/Glossary/ICE)
- [Codenames board game rules (Wikipedia)](https://en.wikipedia.org/wiki/Codenames_(board_game))
