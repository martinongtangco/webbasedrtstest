/**
 * ADR-16 — Replay System Tests
 *
 * Tests for:
 * - ReplayRecorder (start, record events, snapshots, stop)
 * - ReplayReplayer (event indexing, tick advancement, snapshot lookup)
 * - Replay storage (save, load, list, delete, download)
 * - Event types and data format
 * - Seeded random for deterministic replay
 */

import {
  ReplayRecorder,
  ReplayReplayer,
  createReplayData,
  createEvent,
  saveReplay,
  loadReplay,
  listReplays,
  deleteReplay,
  createSeededRandom,
  seedFromReplayId,
  EVT_SELECT,
  EVT_BOX_SELECT,
  EVT_COMMAND,
  EVT_BUILD,
  EVT_UPGRADE,
  EVT_AI_SPAWN_UNIT,
  EVT_AI_SPAWN_BUILDING,
  EVT_AI_COMMAND,
  EVT_SNAPSHOT,
  EVT_GAME_OVER
} from '../js/engine/replay.js';

// ── Helpers ────────────────────────────────────────────────────────────

// Polyfill localStorage for Node.js
const storageData = {};
globalThis.localStorage = {
  getItem: (key) => storageData[key] || null,
  setItem: (key, val) => { storageData[key] = val; },
  removeItem: (key) => { delete storageData[key]; },
  clear: () => { Object.keys(storageData).forEach(k => delete storageData[k]); }
};

const TEST_STORAGE_KEY = 'fu_replays_test';
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function clearTestStorage() {
  // Clean up any test replays
  try {
    const key = 'fu_replays';
    const data = JSON.parse(localStorage.getItem(key) || '{"replays":[]}');
    const before = data.replays.length;
    data.replays = data.replays.filter(r => !r.replayId.startsWith('test_'));
    localStorage.setItem(key, JSON.stringify(data));
    if (data.replays.length < before) {
      console.log(`  (cleaned ${before - data.replays.length} test replays)`);
    }
  } catch {}
}

// ── Test Groups ────────────────────────────────────────────────────────

console.log('\n=== ADR-16: Replay System ===\n');

// ── 1. Replay Data Structure ───────────────────────────────────────────
console.log('[1] Replay Data Structure');

{
  const data = createReplayData();
  assert(data.version === 1, 'version is 1');
  assert(typeof data.replayId === 'string', 'has replayId string');
  assert(data.replayId.startsWith('rpl_'), 'replayId starts with rpl_');
  assert(Array.isArray(data.events), 'events is empty array');
  assert(Array.isArray(data.snapshots), 'snapshots is empty array');
  assert(data.events.length === 0, 'events starts empty');
  assert(data.snapshots.length === 0, 'snapshots starts empty');
  assert(data.duration === 0, 'duration starts at 0');
  assert(data.winner === null, 'winner starts null');
  assert(data.settings === null, 'settings starts null');
  assert(typeof data.createdAt === 'number', 'has numeric createdAt');
}

// ── 2. Event Creation ──────────────────────────────────────────────────
console.log('\n[2] Event Creation');

{
  const evt = createEvent(120, EVT_SELECT, { x: 10, z: 20 });
  assert(evt.tick === 120, 'event has correct tick');
  assert(evt.type === EVT_SELECT, 'event has correct type');
  assert(evt.data.x === 10 && evt.data.z === 20, 'event has correct data');

  const evt2 = createEvent(0, EVT_BUILD, { type: 'barracks', x: 5, z: 5 });
  assert(evt2.tick === 0, 'build event at tick 0');
  assert(evt2.type === EVT_BUILD, 'build event type');
  assert(evt2.data.type === 'barracks', 'build event data.type');

  const evt3 = createEvent(500, EVT_GAME_OVER, { winner: 0 });
  assert(evt3.type === EVT_GAME_OVER, 'game over event type');
  assert(evt3.data.winner === 0, 'game over winner');
}

// ── 3. Event Type Constants ────────────────────────────────────────────
console.log('\n[3] Event Type Constants');

{
  assert(EVT_SELECT === 'player_select', 'EVT_SELECT is player_select');
  assert(EVT_BOX_SELECT === 'player_box_select', 'EVT_BOX_SELECT is player_box_select');
  assert(EVT_COMMAND === 'player_command', 'EVT_COMMAND is player_command');
  assert(EVT_BUILD === 'player_build', 'EVT_BUILD is player_build');
  assert(EVT_UPGRADE === 'player_upgrade', 'EVT_UPGRADE is player_upgrade');
  assert(EVT_AI_SPAWN_UNIT === 'ai_spawn_unit', 'EVT_AI_SPAWN_UNIT is ai_spawn_unit');
  assert(EVT_AI_SPAWN_BUILDING === 'ai_spawn_building', 'EVT_AI_SPAWN_BUILDING is ai_spawn_building');
  assert(EVT_AI_COMMAND === 'ai_command', 'EVT_AI_COMMAND is ai_command');
  assert(EVT_SNAPSHOT === 'snapshot', 'EVT_SNAPSHOT is snapshot');
  assert(EVT_GAME_OVER === 'game_over', 'EVT_GAME_OVER is game_over');
}

// ── 4. ReplayRecorder ─────────────────────────────────────────────────
console.log('\n[4] ReplayRecorder');

{
  let recorder;

  // Start recording
  recorder = new ReplayRecorder();
  assert(!recorder.recording, 'not recording initially');
  assert(recorder.currentTick === 0, 'tick starts at 0');

  recorder.start(
    { faction: 'K9 Corps', factionKey: 'dogs', mapId: 'default', mode: 'skirmish', difficulty: 'medium' },
    { units: [], buildings: [], resources: [], playerDiamonds: 300, playerBiogas: 0, upgradeStates: {}, mapId: 'default', mode: 'skirmish' }
  );
  assert(recorder.recording, 'recording after start');
  assert(recorder.replay.settings.faction === 'K9 Corps', 'settings.faction stored');
  assert(recorder.replay.settings.mapId === 'default', 'settings.mapId stored');
  assert(recorder.replay.snapshots.length === 1, 'initial snapshot recorded');
  assert(recorder.replay.snapshots[0].tick === 0, 'initial snapshot at tick 0');

  // Record events
  recorder.recordPlayerInput(EVT_SELECT, { x: 10, z: 20 });
  assert(recorder.replay.events.length === 1, '1 event after recordPlayerInput');
  assert(recorder.replay.events[0].type === EVT_SELECT, 'event type is select');

  recorder.recordPlayerInput(EVT_COMMAND, { x: 30, z: 40 });
  recorder.recordAiEvent(EVT_AI_SPAWN_UNIT, { type: 'trooper', faction: 'dogs' });
  assert(recorder.replay.events.length === 3, '3 events total');
  assert(recorder.replay.events[2].type === EVT_AI_SPAWN_UNIT, 'AI event recorded');

  // Advance tick
  recorder.advanceTick();
  assert(recorder.currentTick === 1, 'tick advanced to 1');

  // Record after tick advance
  recorder.recordPlayerInput(EVT_SELECT, { x: 15, z: 25 });
  assert(recorder.replay.events[3].tick === 1, 'event recorded at tick 1');

  // Record snapshot
  recorder.recordSnapshot({ units: [{}], buildings: [{}], resources: [], playerDiamonds: 250, playerBiogas: 10, upgradeStates: {}, mapId: 'default', mode: 'skirmish' });
  assert(recorder.replay.snapshots.length === 2, '2 snapshots after recordSnapshot');
  assert(recorder.replay.snapshots[1].tick === 1, 'snapshot at tick 1');

  // Record game over
  recorder.recordGameOver(0);
  assert(recorder.replay.winner === 0, 'winner set to 0');
  assert(recorder.replay.winnerTick === 1, 'winnerTick set');
  const gameOverEvent = recorder.replay.events.find(e => e.type === EVT_GAME_OVER);
  assert(gameOverEvent !== undefined, 'game over event in events');

  // Stop recording
  const replayData = recorder.stop();
  assert(!recorder.recording, 'not recording after stop');
  assert(replayData.duration > 0, 'duration calculated');
  assert(replayData.events.length === 5, 'all events preserved (3 inputs + 1 AI + 1 game_over)');
  assert(replayData.snapshots.length === 2, 'all snapshots preserved');

  // Events don't record when not recording
  recorder.recordPlayerInput(EVT_SELECT, { x: 99, z: 99 });
  assert(recorder.replay.events.length === 5, 'no events added when not recording');
}

// ── 5. ReplayReplayer ──────────────────────────────────────────────────
console.log('\n[5] ReplayReplayer');

{
  // Create replay data with events
  const replayData = createReplayData();
  replayData.replayId = 'test_replayer';
  replayData.settings = { faction: 'K9 Corps', factionKey: 'dogs', mapId: 'default', mode: 'skirmish', difficulty: 'medium' };
  replayData.duration = 30;
  replayData.winner = 0;
  replayData.winnerTick = 1800;

  // Add some snapshots
  replayData.snapshots = [
    { tick: 0, state: { player: { diamonds: 300 }, entities: {} } },
    { tick: 600, state: { player: { diamonds: 500 }, entities: {} } },
    { tick: 1200, state: { player: { diamonds: 800 }, entities: {} } }
  ];

  // Add events at various ticks
  replayData.events = [
    { tick: 0, type: EVT_SELECT, data: { x: 10, z: 20 } },
    { tick: 5, type: EVT_COMMAND, data: { x: 30, z: 40 } },
    { tick: 5, type: EVT_SELECT, data: { x: 15, z: 25 } }, // two events at same tick
    { tick: 100, type: EVT_BUILD, data: { type: 'barracks', x: 5, z: 5 } },
    { tick: 500, type: EVT_AI_SPAWN_UNIT, data: { type: 'trooper', faction: 'dogs' } },
    { tick: 600, type: EVT_SELECT, data: { x: 50, z: 60 } },
    { tick: 1800, type: EVT_GAME_OVER, data: { winner: 0 } }
  ];

  const replayer = new ReplayReplayer(replayData);

  // Initial state
  assert(replayer.currentTick === 0, 'starts at tick 0');
  assert(!replayer.finished, 'not finished initially');

  // Get events for tick 0
  const events0 = replayer.getEventsForTick();
  assert(events0.length === 1, '1 event at tick 0');
  assert(events0[0].type === EVT_SELECT, 'event at tick 0 is select');

  // Advance to tick 5
  for (let i = 0; i < 5; i++) replayer.advanceTick();
  assert(replayer.currentTick === 5, 'advanced to tick 5');
  const events5 = replayer.getEventsForTick();
  assert(events5.length === 2, '2 events at tick 5');
  assert(events5[0].type === EVT_COMMAND, 'first event at tick 5 is command');
  assert(events5[1].type === EVT_SELECT, 'second event at tick 5 is select');

  // Advance to tick 6 - no events there
  replayer.advanceTick();
  assert(replayer.currentTick === 6, 'advanced to tick 6');
  assert(replayer.getEventsForTick().length === 0, 'no events at tick 6');

  // Initial settings
  const settings = replayer.getInitialSettings();
  assert(settings.faction === 'K9 Corps', 'initial settings.faction correct');
  assert(settings.mapId === 'default', 'initial settings.mapId correct');

  // Initial snapshot
  const initSnap = replayer.getInitialSnapshot();
  assert(initSnap !== null, 'initial snapshot exists');
  assert(initSnap.player.diamonds === 300, 'initial snapshot player diamonds');

  // Metadata
  const meta = replayer.getMetadata();
  assert(meta.replayId === 'test_replayer', 'metadata replayId');
  assert(meta.totalEvents === 7, 'metadata totalEvents');
  assert(meta.totalSnapshots === 3, 'metadata totalSnapshots');
  assert(meta.winner === 0, 'metadata winner');

  // Snapshot lookup during replay
  const snap600 = replayer.getSnapshotForTick();
  // Should return null since we're at tick 5 (past initial, before 600)
  // The logic skips tick 0 (initial) and returns snapshot only at exact tick match

  // Advance past game over (currently at tick 6)
  while (replayer.currentTick < 1801) replayer.advanceTick();
  assert(replayer.currentTick === 1801, 'advanced to tick 1801');
  assert(replayer.finished, 'finished after game over tick');
}

// ── 6. Replay Storage ──────────────────────────────────────────────────
console.log('\n[6] Replay Storage');

{
  // Save a replay
  const data = createReplayData();
  data.replayId = 'test_storage_' + Date.now();
  data.createdAt = Date.now();
  data.duration = 45.5;
  data.settings = { faction: 'Feline Vanguard', factionKey: 'cats', mapId: 'narrow-pass', mode: 'skirmish', difficulty: 'hard' };
  data.winner = 0;
  data.events = [
    { tick: 0, type: EVT_SELECT, data: { x: 10, z: 20 } },
    { tick: 100, type: EVT_COMMAND, data: { x: 30, z: 40 } },
    { tick: 2700, type: EVT_GAME_OVER, data: { winner: 0 } }
  ];
  data.snapshots = [{ tick: 0, state: {} }];

  const entry = saveReplay(data, 'Test Replay');
  assert(entry !== null, 'save returns entry');
  assert(entry.replayId === data.replayId, 'saved replayId matches');
  assert(entry.name === 'Test Replay', 'saved name matches');

  // Load the replay
  const loaded = loadReplay(data.replayId);
  assert(loaded !== null, 'load returns data');
  assert(loaded.replayId === data.replayId, 'loaded replayId matches');
  assert(loaded.events.length === 3, 'loaded events count');
  assert(loaded.duration === 45.5, 'loaded duration');
  assert(loaded.winner === 0, 'loaded winner');

  // List replays
  const replays = listReplays();
  assert(Array.isArray(replays.replays), 'list returns array');
  const found = replays.replays.find(r => r.replayId === data.replayId);
  assert(found !== undefined, 'saved replay in list');
  assert(found.name === 'Test Replay', 'name in list');
  assert(found.duration === 45.5, 'duration in list');
  assert(found.winner === 0, 'winner in list');

  // Delete the replay
  const deleted = deleteReplay(data.replayId);
  assert(deleted === true, 'delete returns true');
  const afterDelete = loadReplay(data.replayId);
  assert(afterDelete === null, 'load returns null after delete');

  // Load nonexistent
  const none = loadReplay('nonexistent_id');
  assert(none === null, 'load nonexistent returns null');

  // Delete nonexistent
  const delNone = deleteReplay('nonexistent_id');
  assert(delNone === false, 'delete nonexistent returns false');
}

// ── 7. Seeded Random ───────────────────────────────────────────────────
console.log('\n[7] Seeded Random for Deterministic Replay');

{
  // Same seed produces same sequence
  const rng1 = createSeededRandom(12345);
  const rng2 = createSeededRandom(12345);

  const seq1 = [];
  const seq2 = [];
  for (let i = 0; i < 20; i++) {
    seq1.push(rng1());
    seq2.push(rng2());
  }

  let allMatch = true;
  for (let i = 0; i < 20; i++) {
    if (seq1[i] !== seq2[i]) { allMatch = false; break; }
  }
  assert(allMatch, 'same seed produces identical sequence');
  assert(seq1[0] >= 0 && seq1[0] < 1, 'values in [0, 1) range');

  // Different seeds produce different sequences
  const rng3 = createSeededRandom(99999);
  const seq3 = [];
  for (let i = 0; i < 20; i++) seq3.push(rng3());

  let anyDifferent = false;
  for (let i = 0; i < 20; i++) {
    if (seq1[i] !== seq3[i]) { anyDifferent = true; break; }
  }
  assert(anyDifferent, 'different seed produces different sequence');
}

// ── 8. Seed from Replay ID ─────────────────────────────────────────────
console.log('\n[8] Seed from Replay ID');

{
  const seed1 = seedFromReplayId('rpl_abc123');
  const seed2 = seedFromReplayId('rpl_abc123');
  assert(seed1 === seed2, 'same ID produces same seed');
  assert(typeof seed1 === 'number', 'seed is a number');

  const seed3 = seedFromReplayId('rpl_xyz789');
  assert(seed1 !== seed3, 'different ID produces different seed');

  // Seed can be used with createSeededRandom
  const rng = createSeededRandom(seed1);
  const val = rng();
  assert(val >= 0 && val < 1, 'seeded random produces valid value');
}

// ── 9. Replay Data Serialization ───────────────────────────────────────
console.log('\n[9] Replay Data Serialization');

{
  const data = createReplayData();
  data.settings = { faction: 'K9 Corps', factionKey: 'dogs', mapId: 'default', mode: 'skirmish', difficulty: 'medium' };
  data.events = [
    { tick: 0, type: EVT_SELECT, data: { x: 10, z: 20 } },
    { tick: 100, type: EVT_BUILD, data: { type: 'barracks', x: 5, z: 5 } },
    { tick: 500, type: EVT_GAME_OVER, data: { winner: 1 } }
  ];
  data.snapshots = [{ tick: 0, state: { player: { diamonds: 300 } } }];
  data.duration = 45;
  data.winner = 1;

  // Serialize to JSON and back
  const json = JSON.stringify(data);
  const parsed = JSON.parse(json);

  assert(parsed.version === data.version, 'version survives serialization');
  assert(parsed.events.length === 3, 'events count survives');
  assert(parsed.events[0].type === EVT_SELECT, 'event types survive');
  assert(parsed.events[1].data.type === 'barracks', 'event data survives');
  assert(parsed.snapshots.length === 1, 'snapshots survive');
  assert(parsed.duration === 45, 'duration survives');
  assert(parsed.winner === 1, 'winner survives');
}

// ── 10. Recorder edge cases ────────────────────────────────────────────
console.log('\n[10] Recorder Edge Cases');

{
  // Recording with no settings
  const r1 = new ReplayRecorder();
  r1.start(null, { units: [], buildings: [], resources: [], playerDiamonds: 300, playerBiogas: 0, upgradeStates: {}, mapId: 'default', mode: 'skirmish' });
  const d1 = r1.stop();
  assert(d1 !== null, 'stop returns data even with null settings');

  // Recording then stopping immediately
  const r2 = new ReplayRecorder();
  r2.start({ factionKey: 'dogs', mapId: 'default', mode: 'skirmish' }, { units: [], buildings: [], resources: [], playerDiamonds: 300, playerBiogas: 0, upgradeStates: {}, mapId: 'default', mode: 'skirmish' });
  const d2 = r2.stop();
  assert(d2.snapshots.length === 1, 'initial snapshot still present');
  assert(d2.events.length === 0, 'no events when stopped immediately');

  // Multiple record stops
  const r3 = new ReplayRecorder();
  r3.start({ factionKey: 'cats', mapId: 'default', mode: 'skirmish' }, { units: [], buildings: [], resources: [], playerDiamonds: 300, playerBiogas: 0, upgradeStates: {}, mapId: 'default', mode: 'skirmish' });
  r3.recordPlayerInput(EVT_SELECT, { x: 1, z: 1 });
  const d3a = r3.stop();
  const d3b = r3.stop(); // stop again
  assert(d3a.events.length === 1, 'first stop has event');
  assert(d3b !== null, 'stop again returns data');
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log(`${'─'.repeat(40)}\n`);
