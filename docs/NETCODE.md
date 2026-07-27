# Netcode

Badminton Arena's online mode is **server-authoritative** with **client-side
prediction** for the local player and **entity interpolation** for the remote
player and shuttle. All three game modes run the exact same simulation from
`@badminton/shared`; the server never forks the rules.

## Topology

```
Client A ──ws──┐                        ┌── 60 Hz authoritative sim (shared)
               ├── Node server (Manager)─┤   per Room
Client B ──ws──┘                        └── 30 Hz snapshot broadcast
```

One Node process serves the built client over HTTP and hosts the game WebSocket
on the same port (`/ws`). Rooms and the quick-match queue live in memory.

## Rates

| Thing | Rate |
|---|---|
| Simulation tick | 60 Hz (`TICK_RATE`, fixed `DT = 1/60`) |
| Snapshot broadcast | 30 Hz (every 2 sim ticks) |
| Client input send | 60 Hz (one bitmask per predicted tick) |
| Ping | 1 Hz |
| Render delay (interpolation) | 100 ms |
| Extrapolation cap | 150 ms |
| Reconnect grace | 20 s |

## Protocol

Compact JSON tagged by `t`, versioned by `PROTOCOL_VERSION` (see
`shared/src/protocol.ts`). Input bitmask bits: `left=1, right=2, jump=4, smash=8`.

**Client → Server:** `hello` · `queue` / `cancelQueue` · `createRoom` /
`joinRoom` · `input {seq, tick, mask}` · `ping` · `rematch {vote}` · `leave`.

**Server → Client:** `welcome {clientId}` · `queued` · `roomCreated {code}` ·
`roomState {playerCount}` · `matchStart {slot, config, code}` ·
`snapshot {state, lastSeq, serverTime}` · `pong` · `opponentGone {graceMs}` ·
`opponentBack` · `matchEnd {winner, forfeit}` · `rematchState {votes}` · `error`.

A snapshot carries the full `GameState` (small: two players, one shuttle, the
match record) plus `lastSeq` — the last input sequence the server processed for
each slot, used for reconciliation.

## Server loop

Each `Match` runs an accumulator loop at 60 Hz. Every tick it decodes the most
recent input received per slot, advances the shared `step`, and every second
tick broadcasts a snapshot. When `phase` becomes `matchOver` (or a forfeit
fires) it emits `matchEnd` and stops. Inputs are applied "latest wins" per slot —
client and server both run ~60 Hz, so this is effectively 1:1, and any drift is
corrected by reconciliation.

## Client-side prediction (local player)

The local player's position is a pure function of its own inputs (movement never
depends on the shuttle), so prediction is decoupled and cheap:

1. Each tick, read local input, assign a monotonic `seq`, push `{seq, mask}` to a
   ring buffer, and send it.
2. Immediately advance the predicted local player via the shared `stepPlayer`.
3. On each snapshot: drop buffered inputs with `seq ≤ lastSeq[slot]`, reset the
   predicted player to the authoritative state, then **replay** the remaining
   unacknowledged inputs through `stepPlayer`. This is the rewind-and-replay
   reconciliation — the local player stays responsive with zero input latency and
   snaps to authority only if the server disagreed.

## Entity interpolation (remote player + shuttle)

The remote player and the shuttle are rendered **100 ms in the past** from a
buffer of recent snapshots:

- Render time `T = now − 100 ms`. Find the two snapshots bracketing `T` (by local
  receive time) and linearly interpolate the remote player and shuttle positions.
- If `T` is past the newest snapshot (packet gap), **extrapolate** from the last
  snapshot's velocities, capped at 150 ms, then hold.

This keeps the opponent's movement, interceptions and returns smooth in real
time. Match/HUD state (score, phase, serve timer) is read from the newest
snapshot directly.

## Juice without event sync

Events (`hit`, `smash`, `netTouch`, `bounce`, scoring) are **not** sent over the
wire. The client derives them by diffing consecutive authoritative snapshots
(shuttle changed hands → hit/smash; `netted` rose → net touch; `dead` rose →
bounce; score/games rose → point/game). This keeps the protocol lean and the
feel identical to offline.

## Disconnect, reconnect, rematch

- On a socket close mid-match the room **freezes** the sim and sends
  `opponentGone {graceMs: 20000}` to the survivor. A 20 s timer runs.
- The client persists its `clientId` (localStorage) and room code
  (sessionStorage). On reload/reconnect it re-`hello`s with those; the server
  reseats it into its old slot, unfreezes, and sends `opponentBack`.
- If the grace expires, the remaining player wins by **forfeit** (`matchEnd
  {forfeit: true}`) and the room is cleaned up.
- After a match both players may vote `rematch`; on double-yes the same room
  restarts with an alternated first server.

## Fairness notes

- The bot (single-player only) drives the same input bitmask a human does — it
  never sets state directly, and predicts the shuttle by forward-integrating the
  shared physics.
- Because the whole simulation is shared and deterministic given inputs, the
  server is the single source of truth and clients can never desync the rules.
