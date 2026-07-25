# Frontier Uprising — AGENTS.md

Project context file for AI assistants (Claude, Cursor, Copilot, Qwen, etc.).

## What is this project?

**Frontier Uprising** is a browser-based real-time strategy (RTS) game built with Three.js for 3D rendering and WebSocket for LAN multiplayer. Players choose one of three factions (K9 Corps, Feline Vanguard, or Abyssal Trident) and compete in skirmishes against the CPU or over a local network.

## Tech Stack

| Layer      | Technology                       |
|------------|----------------------------------|
| 3D Render  | Three.js r160 (CDN via importmap)|
| Networking | Node.js + `ws` (WebSocket)       |
| UI         | Vanilla HTML/CSS/JS              |
| Audio      | Web Audio API                    |
| Packaging  | None (browsed directly from disk or served via `node server.js`) |

## Project Structure

```
webbasedrtstest/
├── index.html            # Entry point — imports Three.js + main.js
├── style.css             # Global styles (menu, HUD, overlays)
├── server.js             # Static file server + WebSocket relay
├── package.json          # Dependencies: ws
├── AGENTS.md             # ← this file
├── docs/
│   ├── architecture.md   # Architecture overview & decisions
│   └── design-decisions.md # Design rationale & tradeoffs
├── js/
│   ├── main.js           # App bootstrap & scene setup
│   ├── engine/           # Core game loop, camera, input
│   ├── entities/         # Unit/building entity definitions
│   ├── factions/         # Faction-specific units, colors, stats
│   ├── ai/               # CPU opponent AI
│   ├── network/          # LAN multiplayer client logic
│   ├── audio/            # Sound effects & music
│   └── ui/               # HUD, menus, build menu
└── docs/
```

## Key Architectural Principles

1. **Authoritative host model** — The host runs the simulation; the guest sends inputs and receives game-state snapshots. The server is a pure relay.
2. **No build toolchain** — No Webpack/Vite/esbuild. Modules load via ES importmap from CDN. Keeps the project simple and dependency-light.
3. **Vanilla JavaScript** — No React, Vue, Svelte, or framework overhead. All UI is DOM manipulation.
4. **LAN-first multiplayer** — No matchmaking server, no NAT traversal. Players connect directly via IP + WebSocket port.

## Running the Game

```bash
# Start the server (static files + WebSocket relay)
npm install
node server.js          # default port 8181

# Open in browser
# Single-player:   http://localhost:8181
# LAN multiplayer: http://<host-ip>:8181 (host) / join via UI (guest)
```

## Coding Conventions

- **ES modules** (`"type": "module"` via importmap), no CommonJS in client code
- **CamelCase** for variables/functions, **PascalCase** for classes
- **JSDoc** on public methods and exported functions
- **No semicolons** optional — follow existing file style
- Prefer **composition over inheritance** for entities
- Keep game loop at a fixed timestep; render at display refresh rate

## WebSocket Protocol

Messages are JSON with a `type` field:

| Type              | Direction       | Purpose                              |
|-------------------|-----------------|--------------------------------------|
| `session`         | Server → Client | Assigns host/guest role              |
| `guest_connected` | Server → Host   | Notifies host a guest joined         |
| `game_state`      | Host → Guest    | Full game state snapshot (via relay) |
| `player_input`    | Guest → Host    | Input commands (via relay)           |
| `chat`            | Peer → Peer     | In-game chat messages                |
| `host_disconnected`| Server → Guest | Host left; session ends              |
| `guest_disconnected`| Server → Host | Guest left; session stays open       |

## Adding New Code

- New entity types → `js/entities/`
- New faction data → `js/factions/`
- New UI panels → `js/ui/`
- Network message changes → update both `js/network/` and `server.js`, and document in this file's table above
