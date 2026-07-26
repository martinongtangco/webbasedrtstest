/**
 * Map definitions for Frontier Uprising.
 * Each map specifies terrain characteristics, resource positions,
 * and base placement locations.
 */

// ── Map Definitions ────────────────────────────────────────────────────

/**
 * @typedef {object} MapDef
 * @property {string} id - Unique map identifier
 * @property {string} name - Display name
 * @property {string} description - Short description
 * @property {number[]} terrainParams - [frequencyX, frequencyZ, amplitude1, frequency2a, frequency2b, amplitude2] for procedural terrain
 * @property {string} terrainColor - Ground material color hex as string (e.g. '#3a5a3a')
 * @property {string} skyColor - Background/sky color hex
 * @property {number[]} playerBase - [x, z] world coords for team 0 base
 * @property {number[]} enemyBase - [x, z] world coords for team 1 base
 * @property {{ gx: number, gy: number }[]} diamondPositions - Grid positions for diamond deposits
 * @property {{ gx: number, gy: number }[]} gasPositions - Grid positions for gas vents
 * @property {{ gx: number, gy: number; amount: number }[]} diamondClusters - Detailed diamond cluster data
 */

/**
 * Default map — balanced layout with resources spread evenly.
 */
const MAP_DEFAULT = {
  id: 'default',
  name: 'Default',
  description: 'Balanced layout, standard resource distribution',
  terrainParams: [0.02, 0.02, 0.5, 0.05, 0.03, 0.3],
  terrainColor: '#3a5a3a',
  skyColor: '#1a1a2e',
  playerBase: [-60, 60],  // bottom-left quadrant (x negative, z positive)
  enemyBase: [60, -60],   // top-right quadrant
  diamondClusters: [
    { gx: 15, gy: 15, amount: 600 },
    { gx: 45, gy: 10, amount: 600 },
    { gx: 75, gy: 15, amount: 600 },
    { gx: 15, gy: 75, amount: 600 },
    { gx: 45, gy: 85, amount: 600 },
    { gx: 75, gy: 75, amount: 600 },
    { gx: 30, gy: 48, amount: 400 },
    { gx: 65, gy: 48, amount: 400 },
  ],
  gasPositions: [
    { gx: 25, gy: 25 },
    { gx: 70, gy: 20 },
    { gx: 20, gy: 70 },
    { gx: 72, gy: 72 },
  ],
};

/**
 * Narrow Pass — elongated map with a choke point in the center.
 * Resources concentrated along the central corridor.
 */
const MAP_NARROW_PASS = {
  id: 'narrow-pass',
  name: 'Narrow Pass',
  description: 'Elongated terrain with a central choke point',
  terrainParams: [0.03, 0.01, 0.8, 0.04, 0.06, 0.4],
  terrainColor: '#4a5a3a',
  skyColor: '#1a2a1e',
  playerBase: [-70, 70],
  enemyBase: [70, -70],
  diamondClusters: [
    { gx: 10, gy: 10, amount: 500 },
    { gx: 80, gy: 80, amount: 500 },
    { gx: 38, gy: 30, amount: 500 },
    { gx: 58, gy: 50, amount: 500 },
    { gx: 48, gy: 40, amount: 400 },
    { gx: 40, gy: 56, amount: 400 },
    { gx: 20, gy: 30, amount: 350 },
    { gx: 70, gy: 60, amount: 350 },
  ],
  gasPositions: [
    { gx: 15, gy: 15 },
    { gx: 78, gy: 78 },
    { gx: 48, gy: 48 },
    { gx: 44, gy: 44 },
  ],
};

/**
 * Open Plains — wide open map with resources scattered broadly.
 * Favors fast units and ranged combat.
 */
const MAP_OPEN_PLAINS = {
  id: 'open-plains',
  name: 'Open Plains',
  description: 'Wide open terrain, favors fast and ranged units',
  terrainParams: [0.01, 0.01, 0.3, 0.03, 0.02, 0.15],
  terrainColor: '#5a6a3a',
  skyColor: '#2a2a3e',
  playerBase: [-80, 80],
  enemyBase: [80, -80],
  diamondClusters: [
    { gx: 5, gy: 5, amount: 500 },
    { gx: 20, gy: 8, amount: 450 },
    { gx: 8, gy: 20, amount: 450 },
    { gx: 85, gy: 85, amount: 500 },
    { gx: 70, gy: 82, amount: 450 },
    { gx: 82, gy: 70, amount: 450 },
    { gx: 30, gy: 20, amount: 400 },
    { gx: 60, gy: 70, amount: 400 },
    { gx: 50, gy: 35, amount: 350 },
    { gx: 35, gy: 55, amount: 350 },
    { gx: 50, gy: 50, amount: 300 },
    { gx: 65, gy: 25, amount: 300 },
  ],
  gasPositions: [
    { gx: 10, gy: 10 },
    { gx: 82, gy: 82 },
    { gx: 30, gy: 60 },
    { gx: 65, gy: 25 },
    { gx: 45, gy: 50 },
    { gx: 55, gy: 45 },
  ],
};

/**
 * Diamond Rush — map with abundant resources clustered in the center.
 * Encourages aggressive early-game play.
 */
const MAP_DIAMOND_RUSH = {
  id: 'diamond-rush',
  name: 'Diamond Rush',
  description: 'Abundant central resources, encourages aggressive play',
  terrainParams: [0.025, 0.025, 0.6, 0.04, 0.04, 0.35],
  terrainColor: '#3a4a4a',
  skyColor: '#1a1a2e',
  playerBase: [-75, 75],
  enemyBase: [75, -75],
  diamondClusters: [
    { gx: 5, gy: 5, amount: 400 },
    { gx: 85, gy: 85, amount: 400 },
    // Heavy central cluster
    { gx: 40, gy: 40, amount: 800 },
    { gx: 40, gy: 44, amount: 700 },
    { gx: 44, gy: 40, amount: 700 },
    { gx: 52, gy: 52, amount: 800 },
    { gx: 52, gy: 48, amount: 700 },
    { gx: 48, gy: 52, amount: 700 },
    { gx: 46, gy: 46, amount: 600 },
  ],
  gasPositions: [
    { gx: 44, gy: 44 },
    { gx: 52, gy: 48 },
    { gx: 8, gy: 8 },
    { gx: 82, gy: 82 },
  ],
};

// ── Registry ───────────────────────────────────────────────────────────

/** @type {{ [id: string]: MapDef }} */
const MAP_REGISTRY = {
  'default': MAP_DEFAULT,
  'narrow-pass': MAP_NARROW_PASS,
  'open-plains': MAP_OPEN_PLAINS,
  'diamond-rush': MAP_DIAMOND_RUSH,
};

/**
 * Get all available map definitions.
 * @returns {MapDef[]}
 */
export function getAllMaps() {
  return Object.values(MAP_REGISTRY);
}

/**
 * Get a map definition by ID.
 * @param {string} id
 * @returns {MapDef}
 */
export function getMap(id) {
  return MAP_REGISTRY[id] || MAP_DEFAULT;
}

/**
 * Get the default map.
 * @returns {MapDef}
 */
export function getDefaultMap() {
  return MAP_DEFAULT;
}

/**
 * Get a random map (excluding the default for variety).
 * @returns {MapDef}
 */
export function getRandomMap() {
  const maps = Object.values(MAP_REGISTRY);
  return maps[Math.floor(Math.random() * maps.length)];
}

/**
 * Generate resource nodes for the given map.
 * @param {MapDef} mapDef
 * @param {number} tileSize
 * @param {number} worldHalfSize
 * @returns {{ type: string, x: number, z: number, amount: number }[]}
 */
export function generateMapResources(mapDef, tileSize, worldHalfSize) {
  const nodes = [];

  // Diamond deposits
  for (const pos of mapDef.diamondClusters) {
    const wx = pos.gx * tileSize + tileSize / 2 - worldHalfSize;
    const wz = pos.gy * tileSize + tileSize / 2 - worldHalfSize;
    nodes.push({ type: 'diamond', x: wx, z: wz, amount: pos.amount });
  }

  // Gas vents
  for (const pos of mapDef.gasPositions) {
    const wx = pos.gx * tileSize + tileSize / 2 - worldHalfSize;
    const wz = pos.gy * tileSize + tileSize / 2 - worldHalfSize;
    nodes.push({ type: 'gas', x: wx, z: wz, amount: 9999 });
  }

  return nodes;
}
