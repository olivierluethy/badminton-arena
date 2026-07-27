# 🏸 Badminton Arena

A real-time 2D badminton game for the browser. Two articulated players rally a
shuttlecock across a floodlit arcade court. Three modes, one shared physics core:

- **Single Player** — vs. an AI bot (Easy / Normal / Hard).
- **Local Multiplayer** — two players, one keyboard (`WASD` vs. arrow keys).
- **Online Multiplayer** — server-authoritative real-time play with client-side
  prediction, over Quick Match or private room codes.

Built with TypeScript (strict), Vite + Canvas 2D on the client, Node + `ws` on
the server, and a single pure-TypeScript simulation shared by both.

## Requirements

- Node.js 20+ (developed on Node 24)
- npm 10+

## Install

```bash
npm install
```

## Develop

```bash
npm run dev
```

Runs the Vite client (http://localhost:5173) and the game server
(ws://localhost:8080) concurrently. The client proxies `/ws` to the server.

## Build & run production

```bash
npm run build
npm start
```

`npm start` launches a single Node process that serves the built client and the
WebSocket endpoint on one port (default `8080`, override with `PORT`).

## Controls

| Action | Player 1 / You | Player 2 |
|---|---|---|
| Move | `A` / `D` | `←` / `→` |
| Jump / Serve | `W` | `↑` |
| Smash (air) / Dive (ground) | `S` | `↓` |

`Esc` pause (offline) · `M` mute · `Enter` confirm menus.

In Single Player and Online, the local human always uses `WASD`.

## Rules

Rally scoring — every rally scores a point. Games are first to **11, win by 2,
hard cap 15**. A match is **best of 3 games**. Players swap ends after each game
(and at 6 in a deciding game). The rally winner serves; the server has a 5-second
window to serve or it auto-executes. You lose a rally if the shuttle lands on your
side, you hit the net, or you hit it out past the opponent's baseline.

## Project layout

```
shared/   pure simulation: constants, physics, rules, state machine, bot, protocol
client/   Vite + Canvas 2D renderer, input, netcode client, menus
server/   ws server: matchmaking, authoritative 60 Hz loop, static hosting
docs/     STYLEGUIDE.md, NETCODE.md
```

See [`docs/STYLEGUIDE.md`](docs/STYLEGUIDE.md) for the visual system and
[`docs/NETCODE.md`](docs/NETCODE.md) for the network model.
