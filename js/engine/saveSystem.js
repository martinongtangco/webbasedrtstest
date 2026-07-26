/**
 * ADR-20: Save/Load game state.
 *
 * Serializes the full game state to JSON and stores in localStorage
 * (with optional file download for portability).
 */

const SAVE_KEY = 'fu_savegame';
const MAX_SAVES = 3;
const SAVE_PREFIX = 'fu_savegame_';

/**
 * Serialize the current game state to a save object.
 * @param {object} params - Game state references
 * @param {Unit[]} params.units
 * @param {Building[]} params.buildings
 * @param {ResourceNode[]} params.resources
 * @param {number} params.playerDiamonds
 * @param {number} params.playerBiogas
 * @param {string} params.playerFactionKey
 * @param {object} params.upgradeStates
 * @param {string} params.mapId - ADR-14: selected map
 * @param {string} params.gameMode - 'skirmish' | 'host' | 'guest'
 * @returns {object} Serializable save object
 */
export function createSaveState(params) {
  const {
    units, buildings, resources, playerDiamonds, playerBiogas,
    playerFactionKey, upgradeStates, mapId, gameMode
  } = params;

  return {
    version: 1,
    timestamp: Date.now(),
    mapId: mapId || 'default',
    gameMode: gameMode || 'skirmish',
    player: {
      faction: playerFactionKey,
      diamonds: Math.floor(playerDiamonds),
      biogas: Math.floor(playerBiogas),
      upgrades: upgradeStates || {}
    },
    entities: {
      units: units.filter(u => u.alive).map(u => ({
        id: u.id,
        type: u.type,
        faction: u.faction,
        x: Math.round(u.x * 100) / 100,
        z: Math.round(u.z * 100) / 100,
        team: u.team,
        hp: Math.round(u.hp),
        maxHp: u.maxHp
      })),
      buildings: buildings.filter(b => b.alive).map(b => ({
        id: b.id,
        type: b.type,
        faction: b.faction,
        x: Math.round(b.x * 100) / 100,
        z: Math.round(b.z * 100) / 100,
        team: b.team,
        hp: Math.round(b.hp),
        maxHp: b.maxHp,
        productionQueue: b.productionQueue || [],
        productionTimer: b.productionTimer || 0
      })),
      resources: resources.filter(r => r.alive).map(r => ({
        id: r.id,
        type: r.type,
        x: Math.round(r.x * 100) / 100,
        z: Math.round(r.z * 100) / 100,
        amount: r.amount,
        maxAmount: r.maxAmount
      }))
    }
  };
}

/**
 * Save the game state to localStorage.
 * @param {object} saveState - Output from createSaveState()
 * @param {string|null} [slotId=null] - Slot name (null for auto-quick-save)
 * @returns {boolean} true if saved successfully
 */
export function saveGame(saveState, slotId = null) {
  try {
    const data = JSON.stringify(saveState);
    const size = new Blob([data]).size;

    // Check localStorage quota (rough check)
    if (size > 4 * 1024 * 1024) {
      console.warn('[Save] Save data too large:', size, 'bytes');
      return false;
    }

    if (slotId) {
      localStorage.setItem(SAVE_PREFIX + slotId, data);
    } else {
      // Auto-rotate quick saves
      rotateQuickSaves();
      localStorage.setItem(SAVE_KEY, data);
    }
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('[Save] Storage quota exceeded, oldest saves cleared');
      clearOldSaves();
      try {
        localStorage.setItem(slotId ? SAVE_PREFIX + slotId : SAVE_KEY, JSON.stringify(saveState));
        return true;
      } catch (e2) {
        return false;
      }
    }
    console.error('[Save] Failed to save:', e);
    return false;
  }
}

/**
 * Load a saved game state from localStorage.
 * @param {string|null} [slotId=null] - Slot name (null for quick-save)
 * @returns {object|null} Parsed save state or null
 */
export function loadGame(slotId = null) {
  try {
    const key = slotId ? SAVE_PREFIX + slotId : SAVE_KEY;
    const data = localStorage.getItem(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    // Validate minimum structure
    if (!parsed.version || !parsed.entities || !parsed.player) return null;
    return parsed;
  } catch (e) {
    console.error('[Save] Failed to load:', e);
    return null;
  }
}

/**
 * Download the save state as a .json file.
 * @param {object} saveState - Output from createSaveState()
 * @param {string} [filename] - Optional custom filename
 */
export function downloadSave(saveState, filename) {
  const data = JSON.stringify(saveState, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `frontier-uprising-save-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Load a save state from a file input.
 * @param {File} file - JSON save file
 * @returns {Promise<object|null>} Parsed save state or null
 */
export function loadFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.version || !parsed.entities || !parsed.player) {
          resolve(null);
        } else {
          resolve(parsed);
        }
      } catch {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/**
 * Get a list of available saves.
 * @returns {{ id: string, timestamp: number, label: string }[]}
 */
export function listSaves() {
  const saves = [];

  // Quick save
  const quick = localStorage.getItem(SAVE_KEY);
  if (quick) {
    try {
      const parsed = JSON.parse(quick);
      saves.push({ id: null, timestamp: parsed.timestamp, label: 'Quick Save' });
    } catch {}
  }

  // Named saves
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_PREFIX)) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        const slotName = key.replace(SAVE_PREFIX, '');
        saves.push({ id: slotName, timestamp: parsed.timestamp, label: slotName });
      } catch {}
    }
  }

  // Sort by timestamp, newest first
  saves.sort((a, b) => b.timestamp - a.timestamp);
  return saves;
}

/**
 * Delete a specific save.
 * @param {string|null} [slotId=null]
 * @returns {boolean}
 */
export function deleteSave(slotId = null) {
  try {
    const key = slotId ? SAVE_PREFIX + slotId : SAVE_KEY;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rotate quick saves (keep last N).
 * @private
 */
function rotateQuickSaves() {
  // For now just keep the latest; could add slot rotation later
}

/**
 * Clear old saves to free space.
 * @private
 */
function clearOldSaves() {
  const saves = listSaves();
  // Remove oldest saves until we have room
  while (saves.length > 1) {
    const oldest = saves.pop();
    deleteSave(oldest.id);
  }
}

/**
 * Format a timestamp into a readable date string.
 * @param {number} timestamp - Unix ms
 * @returns {string}
 */
export function formatSaveTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
