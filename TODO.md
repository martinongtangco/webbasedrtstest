# TODO — Frontier Uprising

Kanban board for tracking tasks. Update status columns as work progresses.

## Legend

| Marker | Meaning          |
|--------|------------------|
| `🔴`   | Critical / Bug   |
| `🟠`   | High priority    |
| `🟡`   | Medium priority  |
| `🟢`   | Low priority / Nice-to-have |
| `🔒`   | Blocked          |

---

## 📋 Backlog

Tasks not yet started. Move to **In Progress** when work begins.

### 🔴 Bugs

- [ ] **Guest input not integrated into host simulation** — `player_input` messages are forwarded by the relay but never consumed by the host game loop. Guest actions have no effect. `js/network/client.js`, `main.js`
- [ ] **Fog of war not visually applied** — Visibility tracking works (grid state + minimap) but units/buildings remain fully visible even outside the player's sight range. `main.js`, `js/engine/fogOfWar.js`
- [ ] **Shoot/explosion SFX defined but never triggered** — `sfx.js` registers `shoot` and `explosion` sounds but `main.js` never calls them during combat/death. `js/audio/sfx.js`, `main.js`

### 🟠 High Priority — Core Gameplay

- [ ] **Improve skirmish AI** — Add defensive behavior (idle units guard buildings), multi-pronged attacks, adaptive strategy based on player actions. `js/ai/skirmishAI.js`
- [ ] **Building auto-defense** — Buildings should attack nearby enemy units when in range (e.g., command center turret, defensive towers). `js/entities/buildings.js`, `main.js`
- [ ] **Network bandwidth optimization** — Full-state broadcast every frame is heavy. Implement delta snapshots (only send changed entities) or throttled updates. `js/network/client.js`, `main.js`
- [ ] **Unit selection ring visible through fog** — Selected enemy units beyond fog boundary should not reveal themselves. `main.js`

### 🟡 Medium Priority — Polish & Features

- [ ] **Unit walking/attack animations** — Units are static meshes; add bobbing/rotation during movement and aim animation during attacks. `js/entities/units.js`
- [ ] **Particle effects for combat and death** — Particle system exists (command indicator rings) but death/combat particles are not spawned. `main.js`, `js/entities/units.js`
- [ ] **Dynamic pathfinding obstacles** — A* grid is static; moving units should temporarily block grid cells for better pathfinding. `js/engine/pathfinding.js`
- [ ] **Chat UI** — WebSocket protocol supports `chat` messages but no client-side chat input or message display exists. `js/ui/hud.js`, `js/network/client.js`
- [ ] **Unit upgrades / tech tree** — No upgrade system. Add a researchable upgrade path (e.g., +damage, +speed, +HP). `main.js`, `js/ui/hud.js`
- [ ] **Settings / options menu** — No volume sliders, difficulty selection, or graphics quality options. `index.html`, `style.css`, `main.js`

### 🟢 Low Priority — Nice-to-Have

- [ ] **Multiple map layouts** — Single hardcoded map. Add procedural or hand-crafted map variations. `main.js`
- [ ] **Spectator mode** — Third player joins and watches without controlling. `js/network/client.js`, `main.js`
- [ ] **Replay system** — Record game events and replay later. New module.
- [ ] **NAT traversal (WebRTC)** — Enable play across different networks, not just LAN. `server.js`, `js/network/client.js`
- [ ] **Custom 3D models (glTF)** — Replace Three.js primitives with imported models. `js/factions/`, `js/entities/`
- [ ] **Connection quality indicator** — Show ping/latency to the other player. `js/network/client.js`, `js/ui/hud.js`
- [ ] **Save/load game state** — Persist and restore games. New module.

---

## 🔨 In Progress

Tasks currently being worked on. *(empty)*

---

## 🔒 Blocked

Tasks that depend on other work being completed first.

- [ ] **Replay system** — Blocked on: event recording infrastructure, deterministic simulation
- [ ] **Spectator mode** — Blocked on: guest input not integrated (bug above)
- [ ] **NAT traversal** — Blocked on: core LAN multiplayer needs to be rock-solid first

---

## ✅ Done

Completed tasks. Move here from Backlog or In Progress when finished.

- [x] **Three factions** (K9 Corps, Feline Vanguard, Abyssal Trident) with unique units, buildings, meshes, colors, and balanced stats
- [x] **Game loop & state machine** — menu → playing → gameover with fixed-timestep simulation
- [x] **Three.js scene** — terrain with vertex displacement, lighting, shadows, ground plane, border walls
- [x] **A* pathfinding** — binary min-heap, 4-directional, world↔grid conversion
- [x] **Fog of war system** — 3-state grid (unexplored/explored/visible), radius-based reveal, minimap overlay
- [x] **Resource economy** — diamonds (gathering) + biogas (passive income)
- [x] **Building placement** — ghost preview, validity checks, collision detection, affordability
- [x] **Unit production** — queue-based system tied to buildings with timer-driven spawning
- [x] **Unit combat** — ranged/melee attack, cooldown, auto-attack, muzzle flash
- [x] **Support/healing units** — find injured ally, move to them, heal with cooldown
- [x] **Harvester gathering** — move to diamond deposit, gather, return to command center, deposit
- [x] **Unit selection** — click + marquee drag-selection
- [x] **Unit commands** — right-click move, attack, gather
- [x] **Isometric camera** — perspective at 50°, edge-pan, WASD pan, scroll zoom
- [x] **HUD** — resource bar, build menu, placement menu, unit info panel, minimap
- [x] **Skirmish AI** — basic build order, production, attack waves, harvester assignment
- [x] **WebSocket relay server** — static file serving + message forwarding
- [x] **LAN multiplayer** — host/guest session lifecycle, state broadcast, input forwarding
- [x] **Sound effects** — select, move, build (Tone.js lazy-loaded from CDN)
- [x] **Background music** — looping chord progression (Tone.js PolySynth)
- [x] **Victory/defeat detection** — command center destruction
- [x] **Test suite** — 68 tests (factions, pathfinding, placement, unit healing)
