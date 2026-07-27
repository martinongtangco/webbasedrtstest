/**
 * ADR-16 — Replay System
 *
 * Records game events and periodic snapshots, then replays them deterministically.
 *
 * Design: Event Recording + Periodic Checkpoint Replay
 * - Player inputs and AI decisions are recorded as timestamped events
 * - Full-state snapshots taken every 30s (SNAPSHOT_INTERVAL_TICKS) anchor the replay
 * - On replay, events are injected at their recorded ticks; snapshots correct drift
 *
 * Usage:
 *   // Recording
 *   const recorder = new ReplayRecorder();
 *   recorder.start(settings, gameState);
 *   recorder.recordPlayerInput(tick, 'select', { x: 10, z: 20 });
 *   recorder.recordAiEvent(tick, 'ai_spawn_unit', { type: 'trooper', ... });
 *   recorder.recordSnapshot(tick, gameState);
 *   const replay = recorder.stop();
 *   saveReplay(replay, 'my_game');
 *
 *   // Replay
 *   const data = loadReplay('my_game');
 *   const replayer = new ReplayReplayer(data);
 *   const events = replayer.getEventsForTick(tick);
 */

import { createSaveState } from './saveSystem.js';

const REPLAY_STORAGE_KEY = 'fu_replays';
const REPLAY_VERSION = 1;
const SNAPSHOT_INTERVAL_TICKS = 1800; // 30 seconds at 60fps

// ── Replay Data Structure ────────────────────────────────────────────────

/**
 * Create an empty replay data structure
 * @returns {object} replay data
 */
export function createReplayData() {
  return {
    version: REPLAY_VERSION,
    replayId: generateReplayId(),
    createdAt: Date.now(),
    settings: null,    // { faction, factionKey, mapId, mode, difficulty }
    events: [],         // { tick, type, data }
    snapshots: [],      // { tick, state }
    duration: 0,        // seconds (filled on stop)
    winner: null,       // 0 = player, 1 = enemy, null = unknown
    winnerTick: null
  };
}

/** Generate a unique replay ID */
function generateReplayId() {
  return 'rpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ── Event Types ──────────────────────────────────────────────────────────

// Player input events
export const EVT_SELECT       = 'player_select';
export const EVT_BOX_SELECT   = 'player_box_select';
export const EVT_COMMAND      = 'player_command';
export const EVT_BUILD        = 'player_build';
export const EVT_UPGRADE      = 'player_upgrade';

// AI decision events
export const EVT_AI_SPAWN_UNIT      = 'ai_spawn_unit';
export const EVT_AI_SPAWN_BUILDING  = 'ai_spawn_building';
export const EVT_AI_COMMAND         = 'ai_command';
export const EVT_AI_ASSIGN_GATHER   = 'ai_assign_gather';

// Game events
export const EVT_SNAPSHOT = 'snapshot';
export const EVT_GAME_OVER = 'game_over';

/**
 * Create a replay event
 * @param {number} tick - Game tick (60fps counter)
 * @param {string} type - Event type constant
 * @param {object} data - Event-specific data
 * @returns {object} event
 */
export function createEvent(tick, type, data) {
  return { tick, type, data: data || {} };
}

// ── ReplayRecorder ───────────────────────────────────────────────────────

/**
 * Records game events during a live session.
 */
export class ReplayRecorder {
  constructor() {
    this.replay = null;
    this.recording = false;
    this.currentTick = 0;
  }

  /**
   * Start recording a new replay
   * @param {object} settings - Game settings (faction, map, mode, difficulty)
   * @param {object} gameState - Initial game state for saveSystem snapshot
   */
  start(settings, gameState) {
    this.replay = createReplayData();
    this.replay.settings = settings ? {
      faction: settings.faction || null,
      factionKey: settings.factionKey || null,
      mapId: settings.mapId || null,
      mode: settings.mode || null,
      difficulty: settings.difficulty || null
    } : null;
    // Record initial snapshot at tick 0
    this.replay.snapshots.push({
      tick: 0,
      state: this._captureState(gameState)
    });
    this.currentTick = 0;
    this.recording = true;
  }

  /**
   * Record a player input event
   * @param {string} type - Event type
   * @param {object} data - Event data
   */
  recordPlayerInput(type, data) {
    if (!this.recording) return;
    this.replay.events.push(createEvent(this.currentTick, type, data));
  }

  /**
   * Record an AI decision event
   * @param {string} type - Event type
   * @param {object} data - Event data
   */
  recordAiEvent(type, data) {
    if (!this.recording) return;
    this.replay.events.push(createEvent(this.currentTick, type, data));
  }

  /**
   * Record a periodic state snapshot (for drift correction)
   * @param {object} gameState - Current game state
   */
  recordSnapshot(gameState) {
    if (!this.recording) return;
    this.replay.snapshots.push({
      tick: this.currentTick,
      state: this._captureState(gameState)
    });
  }

  /**
   * Record game over
   * @param {number} winner - 0 = player, 1 = enemy
   */
  recordGameOver(winner) {
    if (!this.recording) return;
    this.replay.events.push(createEvent(this.currentTick, EVT_GAME_OVER, { winner }));
    this.replay.winner = winner;
    this.replay.winnerTick = this.currentTick;
  }

  /**
   * Advance the internal tick counter
   */
  advanceTick() {
    if (!this.recording) return;
    this.currentTick++;
  }

  /**
   * Stop recording and return the replay data
   * @returns {object} replay data
   */
  stop() {
    this.recording = false;
    if (this.replay) {
      this.replay.duration = this.currentTick / 60; // convert ticks to seconds
    }
    return this.replay;
  }

  /**
   * Capture a serializable game state snapshot
   * @param {object} gameState - Current game globals
   * @returns {object} serializable state
   */
  _captureState(gameState) {
    const state = createSaveState({
      units: gameState.units,
      buildings: gameState.buildings,
      resources: gameState.resources,
      playerDiamonds: gameState.playerDiamonds,
      playerBiogas: gameState.playerBiogas,
      upgradeStates: gameState.upgradeStates,
      mapId: gameState.mapId,
      mode: gameState.mode
    });
    return state;
  }
}

// ── ReplayReplayer ───────────────────────────────────────────────────────

/**
 * Replays a recorded session.
 *
 * Manages event injection at correct ticks and snapshot restoration.
 */
export class ReplayReplayer {
  /**
   * @param {object} replayData - Replay data from ReplayRecorder.stop() or storage
   */
  constructor(replayData) {
    this.replay = replayData;
    this.currentTick = 0;
    this.eventsByTick = new Map();   // tick -> [events]
    this.snapshots = replayData.snapshots || [];
    this.nextSnapshotIdx = 0;
    this.finished = false;
    this._indexEvents();
  }

  /** Index events by tick for O(1) lookup */
  _indexEvents() {
    for (const evt of this.replay.events) {
      if (!this.eventsByTick.has(evt.tick)) {
        this.eventsByTick.set(evt.tick, []);
      }
      this.eventsByTick.get(evt.tick).push(evt);
    }
  }

  /**
   * Get all events for the current tick
   * @returns {object[]} array of events
   */
  getEventsForTick() {
    return this.eventsByTick.get(this.currentTick) || [];
  }

  /**
   * Check if a snapshot should be restored at the current tick
   * @returns {object|null} snapshot state or null
   */
  getSnapshotForTick() {
    while (this.nextSnapshotIdx < this.snapshots.length &&
           this.snapshots[this.nextSnapshotIdx].tick <= this.currentTick) {
      const snap = this.snapshots[this.nextSnapshotIdx];
      if (snap.tick === this.currentTick && this.nextSnapshotIdx > 0) {
        // Don't restore the initial (tick 0) snapshot during replay — that's set up before replay starts
        this.nextSnapshotIdx++;
        return snap.state;
      }
      this.nextSnapshotIdx++;
    }
    return null;
  }

  /**
   * Advance to the next tick
   */
  advanceTick() {
    this.currentTick++;
    // Check if we've reached the end
    const gameOver = this.replay.events.find(e => e.type === EVT_GAME_OVER);
    if (gameOver && this.currentTick > gameOver.tick) {
      this.finished = true;
    }
  }

  /**
   * Check if replay is complete
   * @returns {boolean}
   */
  isFinished() {
    return this.finished;
  }

  /**
   * Get replay metadata
   * @returns {object}
   */
  getMetadata() {
    return {
      replayId: this.replay.replayId,
      createdAt: this.replay.createdAt,
      settings: this.replay.settings,
      duration: this.replay.duration,
      winner: this.replay.winner,
      totalEvents: this.replay.events.length,
      totalSnapshots: this.snapshots.length
    };
  }

  /**
   * Get the initial game settings for setup
   * @returns {object}
   */
  getInitialSettings() {
    return this.replay.settings;
  }

  /**
   * Get the initial snapshot (tick 0) for game setup
   * @returns {object|null}
   */
  getInitialSnapshot() {
    return this.snapshots.length > 0 ? this.snapshots[0].state : null;
  }
}

// ── Replay Storage ───────────────────────────────────────────────────────

/**
 * Save a replay to localStorage
 * @param {object} replayData - Replay data from recorder.stop()
 * @param {string} name - Display name for the replay
 */
export function saveReplay(replayData, name) {
  try {
    const replays = listReplays();
    const entry = {
      replayId: replayData.replayId,
      name: name || `Replay ${new Date(replayData.createdAt).toLocaleString()}`,
      createdAt: replayData.createdAt,
      duration: replayData.duration,
      settings: replayData.settings,
      winner: replayData.winner,
      data: replayData
    };
    replays.replays.push(entry);
    localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(replays));
    return entry;
  } catch (e) {
    console.warn('[Replay] Failed to save replay:', e);
    return null;
  }
}

/**
 * Load a replay by ID
 * @param {string} replayId
 * @returns {object|null} replay data or null
 */
export function loadReplay(replayId) {
  try {
    const replays = listReplays();
    const entry = replays.replays.find(r => r.replayId === replayId);
    return entry ? entry.data : null;
  } catch (e) {
    console.warn('[Replay] Failed to load replay:', e);
    return null;
  }
}

/**
 * List all saved replays
 * @returns {object} { replays: [{ replayId, name, createdAt, duration, settings, winner }] }
 */
export function listReplays() {
  try {
    const raw = localStorage.getItem(REPLAY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.replays)) return parsed;
    }
  } catch (e) {
    console.warn('[Replay] Failed to list replays:', e);
  }
  return { replays: [] };
}

/**
 * Delete a replay by ID
 * @param {string} replayId
 * @returns {boolean}
 */
export function deleteReplay(replayId) {
  try {
    const replays = listReplays();
    const before = replays.replays.length;
    replays.replays = replays.replays.filter(r => r.replayId !== replayId);
    if (replays.replays.length < before) {
      localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(replays));
      return true;
    }
  } catch (e) {
    console.warn('[Replay] Failed to delete replay:', e);
  }
  return false;
}

/**
 * Download a replay as a JSON file
 * @param {string} replayId
 */
export function downloadReplay(replayId) {
  const data = loadReplay(replayId);
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${replayId}.replay.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Load a replay from a JSON file
 * @param {File} file
 * @returns {Promise<object|null>}
 */
export function loadReplayFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data && data.version === REPLAY_VERSION && data.events) {
          resolve(data);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    reader.readAsText(file);
  });
}

// ── Math.random Seeding for Deterministic Replay ────────────────────────

/**
 * Simple mulberry32 PRNG for deterministic replay
 * @param {number} seed
 * @returns {function} random() -> number [0, 1)
 */
export function createSeededRandom(seed) {
  let s = seed | 0;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Seed value for a replay (derived from replay ID)
 * @param {string} replayId
 * @returns {number}
 */
export function seedFromReplayId(replayId) {
  let hash = 0;
  for (let i = 0; i < replayId.length; i++) {
    const ch = replayId.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash;
}
