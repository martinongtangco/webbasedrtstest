# Architecture — Frontier Uprising

## Overview

Frontier Uprising is a client-side 3D RTS with a thin WebSocket relay server. The game simulation runs entirely on the host client; the server only forwards messages.

```
┌──────────────────────┐         ┌──────────────────────┐
│   Host Browser       │         │   Guest Browser      │
│  ┌────────────────┐  │         │  ┌────────────────┐  │
│  │  Three.js      │  │         │  │  Three.js      │  │
│  │  Renderer      │  │         │  │  Renderer      │  │
│  └────────────────┘  │         │  └────────────────┘  │
│  ┌────────────────┐  │         │  ┌────────────────┐  │
│  │  Game Engine   │  │         │  │  Input Capture │  │
│  │  (Authoritative│  │         │  │  + State Sync  │  │
│  │   Simulation)  │  │         │  │                │  │
│  └────────────────┘  │         │  └────────────────┘  │
│  ┌────────────────┐  │         │  ┌────────────────┐  │
│  │  AI (CPU opp.) │  │         │  │  UI / HUD      │  │
│  └────────────────┘  │         │  └────────────────┘  │
│  ┌────────────────┐  │         │  ┌────────────────┐  │
│  │  Network Client│  │         │  │  Network Client│  │
│  └───────┬────────┘  │         │  └───────┬────────┘  │
└──────────┼───────────┘         └──────────┼───────────┘
           │                                 │
           │       WebSocket (ws)            │
           ▼                                 ▼
     ┌─────────────────────────────────────────────────┐
     │              server.js (Relay Server)            │
     │                                                   │
     │  HTTP static file server   +   WS message relay  │
     │  (no game logic)               (no state)        │
     └─────────────────────────────────────────────────┘
```

## Module Responsibilities

### `js/engine/`
Core game infrastructure:
- **Game loop** — fixed-timestep simulation, variable-timestep rendering
- **Camera** — isometric/orthographic projection, pan & zoom controls
- **Input** — keyboard/mouse handling, selection框 (marquee selection)
- **Entity management** — spawn/despawn, spatial queries

### `js/entities/`
Unit and building definitions:
- Stats (HP, speed, attack, range, cost)
- Behaviors (move, attack, gather, build)
- Visual representation (Three.js meshes)

### `js/factions/`
Faction-specific configuration:
- **K9 Corps** — dog-themed units
- **Feline Vanguard** — cat-themed units
- **Abyssal Trident** — fish-themed units
- Each faction has unique units, colors, and balance stats

### `js/ai/`
CPU opponent intelligence:
- Resource management
- Unit production decisions
- Attack wave timing
- Pathfinding for enemy units

### `js/network/`
Multiplayer client logic:
- WebSocket connection lifecycle
- Input serialization (guest → host)
- State deserialization & interpolation (guest sync)
- Latency compensation

### `js/audio/`
Sound system:
- Sound effects (selection, building, combat)
- Background music
- Web Audio API management

### `js/ui/`
User interface:
- Main menu & faction selection
- HUD (resources, minimap, build menu)
- Unit info panel
- Victory/defeat screen

## Data Flow

### Single-player (skirmish vs CPU)
```
Player Input → Engine → Simulation → Renderer → Screen
                    ↓
                  AI Module → CPU Orders → Simulation
```

### LAN multiplayer
```
Host:  Player Input → Simulation → Serialize → WS → Server → WS → Guest
Guest: Player Input → WS → Server → WS → Host → Simulation
       ← Serialize ← WS ← Server ← WS ← Host (game_state snapshots)
```

## Key Design Constraints

1. **No backend game state** — The server is stateless; all game logic lives in the host browser.
2. **No build step** — Code is written as ES modules and loaded directly. No transpilation.
3. **Single HTML entry point** — `index.html` loads everything; no SSR or client routing.
4. **2-player max per session** — Keep it simple; expand later if needed.
