# TODO — Frontier Uprising

Kanban board for tracking tasks. Update status columns as work progresses.

**Last Ticket Number:** 27

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

*(All bugs fixed — see Done below)*

### 🟠 High Priority — Core Gameplay

*(All high-priority ADRs completed — see Done below)*

### 🟡 Medium Priority — Polish & Features

*(All medium-priority ADRs completed — see Done below)*

### 🟢 Low Priority — Nice-to-Have

- [ ] **ADR-16 — Replay system** — Record game events and replay later. New module.
- [ ] **ADR-17 — NAT traversal (WebRTC)** — Enable play across different networks, not just LAN. `server.js`, `js/network/client.js`

---

## 🔨 In Progress

Tasks currently being worked on. *(empty)*

---

## 🔒 Blocked

Tasks that depend on other work being completed first.

- [ ] **ADR-16 — Replay system** — Blocked on: event recording infrastructure, deterministic simulation
- [ ] **ADR-17 — NAT traversal** — Blocked on: core LAN multiplayer needs to be rock-solid first

---

## ✅ Done

Completed tasks. Move here from Backlog or In Progress when finished.

- [x] **ADR-1 — Guest input integrated into host simulation** — Added `onPlayerInput` callback to NetworkClient host config; host now calls `processSelection`/`processBoxSelection`/`processCommand` for guest inputs. Refactored `handleInput()` into reusable functions. `js/network/client.js`, `js/main.js`
- [x] **ADR-2 — Fog of war visually applied** — Enemy units/buildings now have `mesh.visible` toggled based on `fogPlayer.isVisible()` at their grid position after fog tick+reveal. `js/main.js`
- [x] **ADR-3 — Shoot/explosion SFX triggered** — `unit_shoot` custom event dispatched in `Unit.updateCombat()` when firing, listened in `main.js` to play `sfx.play('shoot')`. `wasAlive` tracking for units and buildings; `sfx.play('explosion')` when `wasAlive && !alive`. `js/entities/units.js`, `js/main.js`
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
- [x] **ADR-4 — Improve skirmish AI** — Added defensive building guards (idle units guard nearby buildings, 3/building when under attack), multi-pronged attacks (split combat units into 2-3 groups targeting different buildings by priority), adaptive strategy (detects player threats within 60 units, shifts production to troopers/support when under pressure, builds more harvesters when defending, adjusts build order priority). `js/ai/skirmishAI.js`
- [x] **ADR-5 — Building auto-defense** — Added `damage`, `range`, `cooldown` stats to faction building definitions (command_center and siege_factory). Added `updateCombat()` to Building class with nearest-enemy auto-acquire, cooldown tracking, and muzzle flash visual. Called from main game loop. `js/entities/buildings.js`, `js/factions/dogs.js`, `js/factions/cats.js`, `js/factions/fish.js`, `js/main.js`
- [x] **ADR-6 — Network bandwidth optimization** — Throttled broadcasts from every frame (60fps) to every 100ms (10Hz) = ~6x reduction. Implemented delta snapshots: only sends entities with changed position/HP/alive status, plus new/removed entity lists. Guest `applyRemoteState()` handles both full-state and delta formats. Skips broadcast entirely when nothing changed. `js/main.js`
- [x] **ADR-7 — Unit selection ring visible through fog** — After fog visibility pass, selected enemy units/buildings have their `selectionRing.visible` forced to `true` independently of mesh visibility. Ring stays visible through fog, mesh body stays hidden. `js/main.js`
- [x] **ADR-4 to ADR-7 test suite** — Added 4 new test files (59 tests): AI adaptive behavior, building combat algorithm, network delta computation + throttling, fog visibility + selection ring override. Total: 127 tests. `tests/test_adr4_ai.js`, `tests/test_adr5_building_defense.js`, `tests/test_adr6_network_delta.js`, `tests/test_adr7_fog_selection.js`
- [x] **ADR-8 — Unit walking/attack animations** — Added `animOffset` (unique per-unit phase), `facing` (rotation direction), `wasMoving` (bobbing flag). `syncMesh()` applies smooth Y-axis rotation toward facing and vertical sine-wave bobbing (amplitude 0.15) during moving/attacking/gathering/returning states. Gentle bobbing (0.08) during healing. Facing computed from path deltas in `updateMovement`, `updateGathering`, and `updateHealing`. `js/entities/units.js`, `js/main.js`
- [x] **ADR-9 — Particle effects for combat and death** — Added `spawnDeathParticles(x, z, color)` (15-22 particles, warm colors, gravity -15, lifetime 0.6-1.2s) and `spawnHitParticles(x, z)` (4-6 particles, sparks, gravity -10, lifetime 0.2-0.5s). Death particles spawned when units/buildings die. Hit particles spawned via `unit_hit` custom event from `Unit.updateCombat()`. Particles fade by life ratio and scale down as they die. `js/main.js`, `js/entities/units.js`
- [x] **ADR-10 — Dynamic pathfinding obstacles** — Added `dynamicBlocked` Set to pathGrid, computed each frame from moving unit positions (alive + non-idle). `astar()` checks both `grid.blocked` and `grid.dynamicBlocked`. Idle/dead units excluded. `js/engine/pathfinding.js`, `js/main.js`
- [x] **ADR-11 — Chat UI** — Added chat panel (`#chat-panel`) with message history (100 max), textarea input. Toggle via Chat button or Enter key. Close with Escape. `NetworkClient.sendChat()` sends `chat` type messages over WebSocket. `onChat` callback receives messages. System messages for upgrades. `js/ui/hud.js`, `js/network/client.js`, `js/main.js`, `index.html`, `style.css`
- [x] **ADR-12 — Unit upgrades / tech tree** — Three upgrades: Weapon (+20% DMG, 200💎/50⚡, 15s), Engine (+15% SPD, 150💎/30⚡, 12s), Armor (+25% HP, 180💎/40⚡, 15s). Upgrade panel toggled via Upgrades button. `Unit.applyUpgrade()` modifies stats directly. On completion, all existing player units receive the upgrade. New units auto-get upgraded stats. `js/entities/units.js`, `js/ui/hud.js`, `js/main.js`, `index.html`, `style.css`
- [x] **ADR-13 — Settings / options menu** — Settings modal with SFX volume slider (0-100%), Music volume slider (0-100%), Difficulty select (easy/medium/hard). Volume mapped to Tone.js dB: SFX 0→-30dB/1→0dB, Music 0→-30dB/1→-18dB. Settings persisted to `localStorage`. Applied to audio on change. `js/audio/sfx.js`, `js/audio/music.js`, `js/ui/hud.js`, `js/main.js`, `index.html`, `style.css`
- [x] **ADR-8 to ADR-13 test suite** — Added `tests/test_adr8_to_13.js` (39 tests): unit animation state/bobbing/facing, particle structure/physics/fade, dynamic obstacle computation/clearing, chat message storage/limits/clearing, upgrade stats/research/affordability, settings defaults/volume mapping/persistence. Total: 166 tests. `tests/test_adr8_to_13.js`
- [x] **ADR-14 — Multiple map layouts** — Added `js/engine/maps.js` with 4 map definitions (Default, Narrow Pass, Open Plains, Diamond Rush). Each map has terrain params, resource positions, base positions, colors. Map selector dropdown in main menu with descriptions. `generateResourcesFromMap()` in resources.js. Base positions and resources loaded from map data at game start. `js/engine/maps.js`, `js/entities/resources.js`, `js/main.js`, `index.html`, `style.css`
- [x] **ADR-18 — Custom 3D models (glTF)** — Added `js/engine/modelLoader.js` with `loadModel()` (GLTFLoader + Draco), `createPlaceholder()` fallback, faction model registry (`registerFactionModels`, `getModelPath`). Model paths added to faction definitions (`dogs.js`, `cats.js`, `fish.js`) as `models.units` / `models.buildings` dicts (null until .glb files provided). Infrastructure ready for glTF model integration. `js/engine/modelLoader.js`, `js/factions/dogs.js`, `js/factions/cats.js`, `js/factions/fish.js`
- [x] **ADR-19 — Connection quality indicator** — Added ping monitoring to `NetworkClient`: periodic ping/ping_reply exchange every 2s, rolling 5-sample average. Quality levels: excellent (<50ms), good (<100ms), fair (<200ms), poor (>200ms), disconnected. HUD indicator shows colored dot + ping ms in resource bar. `js/network/client.js`, `js/main.js`, `index.html`, `style.css`
- [x] **ADR-20 — Save/load game state** — Added `js/engine/saveSystem.js` with `createSaveState()` (serializes alive entities, resources, upgrades, map, mode), `saveGame()`/`loadGame()` to localStorage, named slots, `downloadSave()`/`loadFromFile()` for file portability, `listSaves()`/`deleteSave()`. Save/Load buttons in HUD open modal with Quick Save/Load, Download, Upload, and save list with Load/Del actions. `applySaveState()` restores full game. `js/engine/saveSystem.js`, `js/main.js`, `index.html`, `style.css`
- [x] **ADR-14 to ADR-20 test suite** — Added `tests/test_adr14_to_20.js` (24 tests): map definitions/fields/uniqueness/resources/base positions, model registry/paths/placeholders, ping quality thresholds/averaging/windowing, save state serialization/load/delete/list/invalid rejection. Total: 190 tests. `tests/test_adr14_to_20.js`
- [x] **ADR-15 — Spectator mode** — Third player joins a running game as read-only viewer. Server: session.spectators[] array, `relayToSpectators()` for game_state, spectator_connected/disconnected events, host disconnect closes spectators. Client: `'spectator'` NetworkClient mode with `connectSpectator()`, `onSpectatorConnected/Disconnected` callbacks. Main: `startGame('spectator')` skips input (handleInput returns early), skips AI/production/unit movement, keeps visual updates (health bars, mesh sync, fog, particles). HUD: interactive buttons hidden (Build, Upgrades, Save, Load), spectating banner shown. `server.js`, `js/network/client.js`, `js/main.js`, `index.html`, `style.css`
- [x] **ADR-15 test suite** — Added `tests/test_adr15_spectator.js` (15 tests): session structure/spectator join/relay/input-ignored/disconnect/clean-up, NetworkClient spectator role, simulation skip/visual keep, neutral game-over, multiple spectators, chat broadcast. Total: 205 tests. `tests/test_adr15_spectator.js`
