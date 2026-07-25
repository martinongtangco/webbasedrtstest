# Design Decisions — Frontier Uprising

## Decision Log

### 1. Authoritative Host for Multiplayer
**Date:** Initial design
**Decision:** The host client runs the authoritative game simulation; the guest sends inputs and receives state snapshots.
**Rationale:**
- Simplest model for LAN play (no dedicated server infrastructure)
- Eliminates most cheating in casual play
- Server is just a WebSocket relay — zero game logic on the server
**Tradeoffs:**
- Host has a slight advantage (zero latency for their own inputs)
- If host disconnects, the session ends
- No rollback/netcode (lockstep or state-sync would be more complex)

### 2. No Build Toolchain
**Date:** Initial design
**Decision:** Use ES modules via importmap; no Webpack, Vite, esbuild, or bundler.
**Rationale:**
- Zero configuration, instant iteration
- Three.js loads from CDN (jsdelivr) — no npm dependency for the game engine
- Keeps the project accessible for contributors without toolchain knowledge
**Tradeoffs:**
- No tree-shaking or code splitting
- Larger initial download (Three.js full bundle from CDN)
- No hot module replacement (HMR)
- Cannot use modern JS features that need transpilation

### 3. Vanilla JavaScript (No Framework)
**Date:** Initial design
**Decision:** All UI and game logic in vanilla JS; no React, Vue, Svelte, etc.
**Rationale:**
- RTS games need tight integration with Three.js rendering loop
- DOM manipulation for HUD is straightforward and performant
- No framework overhead in a game context where every ms counts
- Fewer dependencies = fewer things to break
**Tradeoffs:**
- More boilerplate for UI state management
- No component model for reusable UI pieces
- State management is manual

### 4. Three.js for 3D Rendering
**Date:** Initial design
**Decision:** Use Three.js (r160) for all 3D rendering.
**Rationale:**
- Mature, well-documented 3D library with large ecosystem
- Handles camera, lighting, materials, and geometry out of the box
- Supports instanced meshes for performance (many units on screen)
**Tradeoffs:**
- Large library (~600KB minified) loaded from CDN
- Abstraction layer over WebGL — some performance cost vs raw WebGL

### 5. WebSocket Relay Server (Node.js + ws)
**Date:** Initial design
**Decision:** Use Node.js with the `ws` library for a minimal relay server.
**Rationale:**
- Single dependency (`ws`) for the entire server
- Simple to run: `node server.js`
- Handles both static file serving and WebSocket relay
**Tradeoffs:**
- No authentication or encryption (LAN-only design)
- No NAT traversal — both players must be on the same network
- No connection quality monitoring or packet loss handling

### 6. Faction Theme: Animals (Dogs, Cats, Fish)
**Date:** Initial design
**Decision:** Three factions themed around animals — K9 Corps, Feline Vanguard, Abyssal Trident.
**Rationale:**
- Fun, approachable theme for a web-based RTS
- Easy to differentiate visually (different color palettes, unit shapes)
- Room for creative unit names and abilities
**Tradeoffs:**
- Less "serious" than traditional RTS themes (sci-fi, fantasy)
- May appeal to a narrower audience

### 7. Two Resources: Diamonds + Biogas
**Date:** Initial design
**Decision:** Two-resource economy — 💎 Diamonds (premium/scarce) and ⚡ Biogas (common/fuel).
**Rationale:**
- Two resources provide meaningful tradeoffs without overwhelming complexity
- Diamonds for buildings/high-tier units, Biogas for basic units/upgrades
- Mirrors successful RTS designs (e.g., StarCraft's minerals + gas)
**Tradeoffs:**
- Resource gathering AI needs to balance both types
- UI must display both clearly

---

## Future Considerations

- **Rollback netcode (ENet/gskit-style):** If multiplayer quality needs improvement, consider implementing rollback instead of authoritative host
- **Dedicated server:** If expanding beyond LAN, move game simulation to a Node.js server process
- **Build tool (Vite):** If the project grows large enough to need code splitting, HMR, or tree-shaking
- **WebRTC:** For peer-to-peer play across different networks (bypasses LAN limitation)
- **Asset pipeline:** If custom 3D models are added, consider a glTF import pipeline
