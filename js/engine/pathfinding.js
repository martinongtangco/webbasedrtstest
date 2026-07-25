/**
 * A* Pathfinding on a 2D grid.
 *
 * Grid cells: 0 = walkable, 1 = blocked.
 * Returns array of grid coords [{x, y}, ...] from start to goal, or null if unreachable.
 */

/**
 * @param {{blocked: Set<string>, width: number, height: number}} grid
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} goal
 * @param {object} opts
 * @returns {Array<{x: number, y: number}>|null}
 */
export function astar(grid, start, goal, opts = {}) {
  const { allowDiagonal = false } = opts;

  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;

  if (grid.blocked.has(goalKey)) return null;

  const dirs = allowDiagonal
    ? [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
      ]
    : [
        [-1, 0],
        [0, -1], [0, 1],
        [1, 0]
      ];

  const dirCosts = allowDiagonal
    ? [[1.414], [1], [1.414], [1], [1], [1.414], [1], [1.414]]
    : [[1], [1], [1], [1]];

  const openList = [];       // min-heap by f
  const cameFrom = new Map();
  const gScore = new Map();
  const closedSet = new Set();

  gScore.set(startKey, 0);

  // Simple array as heap (push + sort is fine for small grids)
  openList.push({ key: startKey, f: heuristic(start, goal) });

  while (openList.length > 0) {
    // Find lowest f in openList
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) lowestIdx = i;
    }
    const current = openList.splice(lowestIdx, 1)[0];

    if (current.key === goalKey) {
      // Reconstruct path
      return reconstructPath(cameFrom, current.key);
    }

    if (closedSet.has(current.key)) continue;
    closedSet.add(current.key);

    const [cx, cy] = current.key.split(',').map(Number);

    for (let i = 0; i < dirs.length; i++) {
      const [dx, dy] = dirs[i];
      const nx = cx + dx;
      const ny = cy + dy;

      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;

      const neighborKey = `${nx},${ny}`;
      if (grid.blocked.has(neighborKey)) continue;
      if (closedSet.has(neighborKey)) continue;

      const moveCost = allowDiagonal ? (dx !== 0 && dy !== 0 ? 1.414 : 1) : 1;
      const tentativeG = gScore.get(current.key) + moveCost;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current.key);
        gScore.set(neighborKey, tentativeG);
        const f = tentativeG + heuristic({ x: nx, y: ny }, goal);
        openList.push({ key: neighborKey, f });
      }
    }
  }

  return null; // No path found
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstructPath(cameFrom, currentKey) {
  const path = [{ x: parseInt(currentKey.split(',')[0]), y: parseInt(currentKey.split(',')[1]) }];
  let key = currentKey;
  while (cameFrom.has(key)) {
    key = cameFrom.get(key);
    const [x, y] = key.split(',').map(Number);
    path.push({ x, y });
  }
  path.reverse();
  return path;
}

/**
 * Convert a world position to grid coordinates
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} tileSize
 * @param {number} worldHalfSize
 * @returns {{x: number, y: number}}
 */
export function worldToGrid(worldX, worldZ, tileSize, worldHalfSize) {
  const gx = Math.floor((worldX + worldHalfSize) / tileSize);
  const gy = Math.floor((worldZ + worldHalfSize) / tileSize);
  return {
    x: Math.max(0, Math.min(gx, 95)),
    y: Math.max(0, Math.min(gy, 95))
  };
}

/**
 * Convert grid coordinates to world position (center of tile)
 * @param {number} gx
 * @param {number} gy
 * @param {number} tileSize
 * @param {number} worldHalfSize
 * @returns {{x: number, z: number}}
 */
export function gridToWorld(gx, gy, tileSize, worldHalfSize) {
  return {
    x: gx * tileSize + tileSize / 2 - worldHalfSize,
    z: gy * tileSize + tileSize / 2 - worldHalfSize
  };
}

/**
 * Smooth movement along path waypoints — interpolates between grid cells
 * Returns world position for a given progress (0..1) along the path
 * @param {Array<{x: number, y: number}>} path
 * @param {number} progress - 0 = start, 1 = goal
 * @param {number} tileSize
 * @param {number} worldHalfSize
 * @returns {{x: number, z: number}}
 */
export function lerpPath(path, progress, tileSize, worldHalfSize) {
  if (!path || path.length === 0) return { x: 0, z: 0 };

  const clamped = Math.max(0, Math.min(1, progress));
  const totalSteps = path.length - 1;
  const floatIndex = clamped * totalSteps;
  const idx = Math.floor(floatIndex);
  const t = floatIndex - idx;

  const from = gridToWorld(path[Math.min(idx, path.length - 1)].x, path[Math.min(idx, path.length - 1)].y, tileSize, worldHalfSize);
  const to = gridToWorld(path[Math.min(idx + 1, path.length - 1)].x, path[Math.min(idx + 1, path.length - 1)].y, tileSize, worldHalfSize);

  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t
  };
}