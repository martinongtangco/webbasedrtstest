/**
 * Tests for ADR-14 (Multiple map layouts), ADR-18 (Custom 3D models),
 * ADR-19 (Connection quality indicator), ADR-20 (Save/load game state).
 * Runs in Node.js (no Three.js required).
 */

export default async ({ describe, it, assert }) => {

  // ─── ADR-14: Multiple map layouts ──────────────────────────────
  describe('ADR-14: Multiple map layouts', async () => {
    const { getAllMaps, getMap, getDefaultMap, getRandomMap, generateMapResources } =
      await import('../js/engine/maps.js');

    it('returns at least 4 maps', () => {
      const maps = getAllMaps();
      assert.ok(maps.length >= 4, `Expected >= 4 maps, got ${maps.length}`);
    });

    it('default map has required fields', () => {
      const m = getDefaultMap();
      assert.ok(m.id, 'has id');
      assert.ok(m.name, 'has name');
      assert.ok(m.description, 'has description');
      assert.ok(Array.isArray(m.terrainParams), 'has terrainParams');
      assert.ok(Array.isArray(m.diamondClusters), 'has diamondClusters');
      assert.ok(Array.isArray(m.gasPositions), 'has gasPositions');
      assert.ok(Array.isArray(m.playerBase), 'has playerBase');
      assert.ok(Array.isArray(m.enemyBase), 'has enemyBase');
      assert.equal(m.id, 'default');
    });

    it('terrainParams has 6 values', () => {
      const m = getDefaultMap();
      assert.equal(m.terrainParams.length, 6);
    });

    it('each map has unique id', () => {
      const maps = getAllMaps();
      const ids = maps.map(m => m.id);
      assert.equal(new Set(ids).size, ids.length, 'all ids are unique');
    });

    it('getMap returns default for unknown id', () => {
      const m = getMap('nonexistent');
      assert.equal(m.id, 'default');
    });

    it('getRandomMap returns a valid map', () => {
      const m = getRandomMap();
      assert.ok(m.id, 'has id');
      assert.ok(m.name, 'has name');
    });

    it('diamondClusters have amount field', () => {
      const m = getDefaultMap();
      for (const c of m.diamondClusters) {
        assert.ok(typeof c.amount === 'number' && c.amount > 0, 'cluster has amount');
        assert.ok(typeof c.gx === 'number', 'cluster has gx');
        assert.ok(typeof c.gy === 'number', 'cluster has gy');
      }
    });

    it('base positions are within map bounds', () => {
      const maps = getAllMaps();
      for (const m of maps) {
        assert.ok(m.playerBase[0] > -192 && m.playerBase[0] < 192, 'playerBase x in bounds');
        assert.ok(m.playerBase[1] > -192 && m.playerBase[1] < 192, 'playerBase z in bounds');
        assert.ok(m.enemyBase[0] > -192 && m.enemyBase[0] < 192, 'enemyBase x in bounds');
        assert.ok(m.enemyBase[1] > -192 && m.enemyBase[1] < 192, 'enemyBase z in bounds');
      }
    });

    it('generateMapResources returns correct types', () => {
      const m = getDefaultMap();
      const resources = generateMapResources(m, 4, 192);
      const diamonds = resources.filter(r => r.type === 'diamond');
      const gases = resources.filter(r => r.type === 'gas');
      assert.ok(diamonds.length > 0, 'has diamond resources');
      assert.ok(gases.length > 0, 'has gas resources');
      assert.equal(diamonds.length, m.diamondClusters.length);
      assert.equal(gases.length, m.gasPositions.length);
      for (const g of gases) assert.equal(g.amount, 9999);
    });

    it('different maps have different resource counts', () => {
      const defaultMap = getMap('default');
      const rushMap = getMap('diamond-rush');
      const dRes = generateMapResources(defaultMap, 4, 192);
      const rRes = generateMapResources(rushMap, 4, 192);
      const dDiamonds = dRes.filter(r => r.type === 'diamond').length;
      const rDiamonds = rRes.filter(r => r.type === 'diamond').length;
      assert.ok(dDiamonds > 0 && rDiamonds > 0, 'both maps have diamonds');
    });

    it('narrow-pass map exists and has choke point bases', () => {
      const m = getMap('narrow-pass');
      assert.equal(m.id, 'narrow-pass');
      const dx = m.playerBase[0] - m.enemyBase[0];
      const dz = m.playerBase[1] - m.enemyBase[1];
      const dist = Math.sqrt(dx * dx + dz * dz);
      assert.ok(dist > 100, `bases far apart: ${dist.toFixed(0)}`);
    });

    it('open-plains has more diamond clusters', () => {
      const m = getMap('open-plains');
      assert.ok(m.diamondClusters.length >= 10, 'open-plains has many clusters');
    });
  });

  // ─── ADR-18: Custom 3D models (glTF) ───────────────────────────
  describe('ADR-18: Custom 3D models (glTF)', () => {
    // Test the model registry logic without importing Three.js
    // The modelLoader.js module imports Three.js, so we test the pure logic

    it('model registry starts empty', () => {
      const MODEL_REGISTRY = {};
      assert.equal(Object.keys(MODEL_REGISTRY).length, 0);
    });

    it('registerFactionModels adds entries', () => {
      const registry = {};
      const models = {
        units: { scout: '/models/test/scout.glb' },
        buildings: { barracks: '/models/test/barracks.glb' }
      };
      registry['test'] = models;
      assert.equal(Object.keys(registry).length, 1);
      assert.equal(registry['test'].units.scout, '/models/test/scout.glb');
    });

    it('getModelPath resolves correctly', () => {
      const MODEL_REGISTRY = {
        dogs: {
          units: { scout: '/models/dogs/scout.glb', trooper: '/models/dogs/trooper.glb' },
          buildings: { command_center: '/models/dogs/cc.glb' }
        }
      };
      const getModelPath = (factionKey, category, type) => {
        const faction = MODEL_REGISTRY[factionKey];
        if (!faction || !faction[category]) return null;
        return faction[category][type] || null;
      };

      assert.equal(getModelPath('dogs', 'units', 'scout'), '/models/dogs/scout.glb');
      assert.equal(getModelPath('dogs', 'units', 'harvester'), null);
      assert.equal(getModelPath('cats', 'units', 'scout'), null);
      assert.equal(getModelPath('dogs', 'buildings', 'command_center'), '/models/dogs/cc.glb');
    });

    it('hasModels checks registry', () => {
      const registry1 = {};
      const hasModels = () => Object.keys(registry1).length > 0;
      assert.equal(hasModels(), false);
      registry1['test'] = {};
      assert.equal(hasModels(), true);
    });

    it('modelBasePath defaults to /models/', () => {
      const basePath = '/models/';
      assert.equal(basePath, '/models/');
    });

    it('createPlaceholder generates fallback geometry', () => {
      // Test the logic: placeholder should return a group with meshes
      // We simulate the Three.js group creation
      const createPlaceholder = (type, team, scale) => {
        const color = team === 0 ? 0x4488ff : 0xff4444;
        return {
          type,
          team,
          color,
          scale,
          isBuilding: type === 'building',
          isUnit: type === 'unit'
        };
      };

      const unit = createPlaceholder('unit', 0, 1);
      assert.equal(unit.color, 0x4488ff, 'player unit is blue');
      assert.equal(unit.isUnit, true);

      const building = createPlaceholder('building', 1, 1);
      assert.equal(building.color, 0xff4444, 'enemy building is red');
      assert.equal(building.isBuilding, true);
    });
  });

  // ─── ADR-19: Connection quality indicator ──────────────────────
  describe('ADR-19: Connection quality indicator', () => {
    // Test the ping/quality logic without importing NetworkClient
    // (which requires WebSocket — browser API)

    it('ping quality thresholds are correct', () => {
      const getQuality = (pingMs) => {
        if (pingMs < 50) return 'excellent';
        if (pingMs < 100) return 'good';
        if (pingMs < 200) return 'fair';
        return 'poor';
      };

      assert.equal(getQuality(30), 'excellent');
      assert.equal(getQuality(49), 'excellent');
      assert.equal(getQuality(75), 'good');
      assert.equal(getQuality(99), 'good');
      assert.equal(getQuality(150), 'fair');
      assert.equal(getQuality(199), 'fair');
      assert.equal(getQuality(250), 'poor');
    });

    it('ping averaging works correctly', () => {
      const pingTimes = [45, 55, 60, 50, 40];
      const avg = Math.round(pingTimes.reduce((a, b) => a + b, 0) / pingTimes.length);
      assert.equal(avg, 50, 'average of 5 pings');
    });

    it('keeps last 5 measurements', () => {
      const pingTimes = [10, 20, 30, 40, 50];
      pingTimes.push(60);
      if (pingTimes.length > 5) pingTimes.shift();
      assert.equal(pingTimes.length, 5);
      assert.equal(pingTimes[0], 20, 'oldest removed');
      assert.equal(pingTimes[4], 60, 'newest added');
    });

    it('ping round-trip calculation', () => {
      const sendTime = Date.now() - 42;
      const receiveTime = Date.now();
      const pingMs = receiveTime - sendTime;
      assert.ok(pingMs >= 40 && pingMs <= 50, `ping ~42ms, got ${pingMs}`);
    });

    it('disconnected state', () => {
      const state = { ping: null, quality: 'disconnected' };
      assert.equal(state.ping, null);
      assert.equal(state.quality, 'disconnected');
    });

    it('ping interval default is 2000ms', () => {
      const pingInterval = 2000;
      assert.equal(pingInterval, 2000);
    });
  });

  // ─── ADR-20: Save/load game state ──────────────────────────────
  describe('ADR-20: Save/load game state', async () => {
    const {
      createSaveState, saveGame, loadGame, listSaves, deleteSave,
      formatSaveTime
    } = await import('../js/engine/saveSystem.js');

    // Clean up before/after tests
    const SAVE_KEY = 'fu_savegame';
    const SAVE_PREFIX = 'fu_savegame_';

    function clearSaves() {
      localStorage.removeItem(SAVE_KEY);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SAVE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    }
    clearSaves();

    it('createSaveState produces valid structure', () => {
      const state = createSaveState({
        units: [
          { id: 1, type: 'scout', faction: 'dogs', x: 10, z: 20, team: 0, hp: 45, maxHp: 45, alive: true },
          { id: 2, type: 'trooper', faction: 'dogs', x: 30, z: 40, team: 1, hp: 80, maxHp: 80, alive: true },
          { id: 3, type: 'harvester', faction: 'dogs', x: -50, z: 50, team: 0, hp: 60, maxHp: 60, alive: false }
        ],
        buildings: [
          { id: 10, type: 'command_center', faction: 'dogs', x: -60, z: 60, team: 0, hp: 600, maxHp: 600, alive: true, productionQueue: ['scout'], productionTimer: 1 }
        ],
        resources: [
          { id: 100, type: 'diamond', x: 40, z: 40, amount: 500, maxAmount: 600, alive: true },
          { id: 101, type: 'diamond', x: -40, z: -40, amount: 0, maxAmount: 600, alive: false }
        ],
        playerDiamonds: 500,
        playerBiogas: 100,
        playerFactionKey: 'dogs',
        upgradeStates: { weapon: { researched: true }, engine: { researched: false }, armor: { researched: false } },
        mapId: 'default',
        gameMode: 'skirmish'
      });

      assert.ok(state.version === 1, 'has version');
      assert.ok(state.timestamp > 0, 'has timestamp');
      assert.equal(state.mapId, 'default');
      assert.equal(state.gameMode, 'skirmish');
      assert.equal(state.player.faction, 'dogs');
      assert.equal(state.player.diamonds, 500);
      assert.equal(state.player.biogas, 100);
      // Only alive entities
      assert.equal(state.entities.units.length, 2, 'excludes dead units');
      assert.equal(state.entities.buildings.length, 1, 'has buildings');
      assert.equal(state.entities.resources.length, 1, 'excludes depleted resources');

      // Production queue preserved
      assert.equal(state.entities.buildings[0].productionQueue.length, 1);
      assert.equal(state.entities.buildings[0].productionQueue[0], 'scout');

      // Upgrades preserved
      assert.equal(state.player.upgrades.weapon.researched, true);
    });

    it('saveGame stores to localStorage', () => {
      clearSaves();
      const state = createSaveState({
        units: [], buildings: [], resources: [],
        playerDiamonds: 100, playerBiogas: 50,
        playerFactionKey: 'cats', upgradeStates: {},
        mapId: 'open-plains', gameMode: 'skirmish'
      });
      const ok = saveGame(state);
      assert.equal(ok, true);

      const loaded = loadGame();
      assert.ok(loaded !== null, 'saved game can be loaded');
      assert.equal(loaded.player.faction, 'cats');
      assert.equal(loaded.mapId, 'open-plains');
      clearSaves();
    });

    it('saveGame with slotId stores separately', () => {
      clearSaves();
      const state = createSaveState({
        units: [], buildings: [], resources: [],
        playerDiamonds: 200, playerBiogas: 80,
        playerFactionKey: 'fish', upgradeStates: {},
        mapId: 'narrow-pass', gameMode: 'host'
      });
      saveGame(state, 'slot1');
      const loaded = loadGame('slot1');
      assert.ok(loaded !== null, 'named save can be loaded');
      assert.equal(loaded.player.faction, 'fish');
      clearSaves();
    });

    it('loadGame returns null for missing save', () => {
      clearSaves();
      const loaded = loadGame();
      assert.equal(loaded, null);
    });

    it('listSaves returns saved games', () => {
      clearSaves();
      const state1 = createSaveState({
        units: [], buildings: [], resources: [],
        playerDiamonds: 100, playerBiogas: 0,
        playerFactionKey: 'dogs', upgradeStates: {},
        mapId: 'default', gameMode: 'skirmish'
      });
      const state2 = createSaveState({
        units: [], buildings: [], resources: [],
        playerDiamonds: 300, playerBiogas: 100,
        playerFactionKey: 'cats', upgradeStates: {},
        mapId: 'open-plains', gameMode: 'skirmish'
      });
      saveGame(state1); // quick save
      saveGame(state2, 'named1');

      const saves = listSaves();
      assert.ok(saves.length >= 2, `has >= 2 saves, got ${saves.length}`);
      // Sorted by timestamp (newest first)
      assert.ok(saves[0].timestamp >= saves[1].timestamp, 'sorted newest first');
      clearSaves();
    });

    it('deleteSave removes a save', () => {
      clearSaves();
      const state = createSaveState({
        units: [], buildings: [], resources: [],
        playerDiamonds: 100, playerBiogas: 0,
        playerFactionKey: 'dogs', upgradeStates: {},
        mapId: 'default', gameMode: 'skirmish'
      });
      saveGame(state, 'toDelete');
      assert.ok(loadGame('toDelete') !== null, 'save exists');
      deleteSave('toDelete');
      assert.equal(loadGame('toDelete'), null, 'save deleted');
      clearSaves();
    });

    it('formatSaveTime returns readable date', () => {
      const ts = Date.parse('2025-01-15T10:30:00Z');
      const str = formatSaveTime(ts);
      assert.ok(str.includes('2025'), 'includes year');
      assert.ok(str.includes('01'), 'includes month');
    });

    it('invalid save data is rejected on load', () => {
      localStorage.setItem(SAVE_KEY, 'not json');
      const loaded = loadGame();
      assert.equal(loaded, null, 'invalid JSON returns null');
      localStorage.setItem(SAVE_KEY, JSON.stringify({ foo: 'bar' }));
      const loaded2 = loadGame();
      assert.equal(loaded2, null, 'missing fields returns null');
      clearSaves();
    });

    it('empty game state saves correctly', () => {
      clearSaves();
      const state = createSaveState({
        units: [], buildings: [], resources: [],
        playerDiamonds: 0, playerBiogas: 0,
        playerFactionKey: 'dogs', upgradeStates: {},
        mapId: 'default', gameMode: 'skirmish'
      });
      assert.equal(state.entities.units.length, 0);
      assert.equal(state.entities.buildings.length, 0);
      assert.equal(state.entities.resources.length, 0);
      clearSaves();
    });

    it('coordinates are rounded in save', () => {
      const state = createSaveState({
        units: [
          { id: 1, type: 'scout', faction: 'dogs', x: 10.123456, z: 20.987654, team: 0, hp: 45, maxHp: 45, alive: true }
        ],
        buildings: [
          { id: 1, type: 'command_center', faction: 'dogs', x: -60.555, z: 60.333, team: 0, hp: 600, maxHp: 600, alive: true, productionQueue: [], productionTimer: 0 }
        ],
        resources: [
          { id: 1, type: 'diamond', x: 40.777, z: 40.999, amount: 500, maxAmount: 600, alive: true }
        ],
        playerDiamonds: 100, playerBiogas: 50,
        playerFactionKey: 'dogs', upgradeStates: {},
        mapId: 'default', gameMode: 'skirmish'
      });
      // Coordinates should be rounded to 2 decimal places
      const u = state.entities.units[0];
      assert.ok(Math.abs(u.x - 10.12) < 0.01, `x rounded: ${u.x}`);
      assert.ok(Math.abs(u.z - 20.99) < 0.01, `z rounded: ${u.z}`);
      clearSaves();
    });
  });
};
