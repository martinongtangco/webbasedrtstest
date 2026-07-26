/**
 * A* Pathfinding on a 2D grid.
 *
 * Grid cells: 0 = walkable, 1 = blocked.
 * Returns array of grid coords [{x, y}, ...] from start to goal, or null if unreachable.
 */

// ── Binary Min-Heap ────────────────────────────────────────────────────────

class MinHeap {
  constructor() { this.data = []; }

  get size() { return this.data.length; }
  get isEmpty() { return this.data.length === 0; }

  push(val, priority) {
    this.data.push({ val, priority });
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  has(key) {
    return this.data.some(item => item.val.key === key);
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].priority <= this.data[i].priority) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1, right = 2 * i + 2;
      if (left < n && this.data[left].priority < this.data[smallest].priority) smallest = left;
      if (right < n && this.data[right].priority < this.data[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

/**
 * @param {{blocked: Set<string>, width: number, height: number, dynamicBlocked?: Set<string>}} grid
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
  // ADR-10: Also check dynamic obstacles (moving units)
  if (grid.dynamicBlocked && grid.dynamicBlocked.has(goalKey)) return null;

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

  const openList = new MinHeap();
  const cameFrom = new Map();
  const gScore = new Map();
  const closedSet = new Set();

  gScore.set(startKey, 0);
  openList.push({ key: startKey }, heuristic(start, goal));

  while (!openList.isEmpty) {
    const current = openList.pop().val;

    if (current.key === goalKey) {
      // Reconstruct path
      return reconstructPath(cameFrom, current.key);
    }

    if (closedSet.has(current.key)) continue;
    closedSet.add(current.key);

    const [cx, cy] = current.key.split(',').map(Number);

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;

      const neighborKey = `${nx},${ny}`;
      if (grid.blocked.has(neighborKey)) continue;
      // ADR-10: Check dynamic obstacles
      if (grid.dynamicBlocked && grid.dynamicBlocked.has(neighborKey)) continue;
      if (closedSet.has(neighborKey)) continue;

      const moveCost = allowDiagonal && dx !== 0 && dy !== 0 ? 1.414 : 1;
      const tentativeG = gScore.get(current.key) + moveCost;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current.key);
        gScore.set(neighborKey, tentativeG);
        const f = tentativeG + heuristic({ x: nx, y: ny }, goal);
        openList.push({ key: neighborKey }, f);
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
  const gridDim = Math.floor((worldHalfSize * 2) / tileSize);
  const gx = Math.floor((worldX + worldHalfSize) / tileSize);
  const gy = Math.floor((worldZ + worldHalfSize) / tileSize);
  return {
    x: Math.max(0, Math.min(gx, gridDim - 1)),
    y: Math.max(0, Math.min(gy, gridDim - 1))
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