/**
 * Tests for pathfinding utility functions (worldToGrid, gridToWorld, astar).
 * Tests the logic in isolation — no Three.js required.
 */

export default async ({ describe, it, assert }) => {
  // Replicate the pathfinding functions from js/engine/pathfinding.js
  const MAP_SIZE = 96;
  const TILE_SIZE = 4;
  const WORLD_SIZE = MAP_SIZE * TILE_SIZE; // 384
  const WORLD_HALF = WORLD_SIZE / 2; // 192

  function worldToGrid(wx, wz, tileSize = TILE_SIZE, worldHalf = WORLD_HALF) {
    const gx = Math.floor((wx + worldHalf) / tileSize);
    const gy = Math.floor((wz + worldHalf) / tileSize);
    return {
      x: Math.max(0, Math.min(MAP_SIZE - 1, gx)),
      y: Math.max(0, Math.min(MAP_SIZE - 1, gy))
    };
  }

  function gridToWorld(gx, gy, tileSize = TILE_SIZE, worldHalf = WORLD_HALF) {
    return {
      x: (gx + 0.5) * tileSize - worldHalf,
      z: (gy + 0.5) * tileSize - worldHalf
    };
  }

  // Simplified A* for testing
  function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function getNeighbors(node, grid) {
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
      { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }
    ];
    const neighbors = [];
    for (const d of dirs) {
      const nx = node.x + d.x;
      const ny = node.y + d.y;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      if (grid.blocked.has(`${nx},${ny}`)) continue;
      neighbors.push({ x: nx, y: ny });
    }
    return neighbors;
  }

  function astar(grid, start, goal) {
    if (start.x === goal.x && start.y === goal.y) return [start];
    const open = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const key = (n) => `${n.x},${n.y}`;

    gScore.set(key(start), 0);
    fScore.set(key(start), heuristic(start, goal));

    while (open.length > 0) {
      // Find node with lowest fScore
      let currentIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if ((fScore.get(key(open[i])) ?? Infinity) < (fScore.get(key(open[currentIdx])) ?? Infinity)) {
          currentIdx = i;
        }
      }
      const current = open.splice(currentIdx, 1)[0];

      if (current.x === goal.x && current.y === goal.y) {
        // Reconstruct path
        const path = [current];
        let ck = key(current);
        let traceNode = cameFrom.get(ck);
        while (traceNode) {
          path.unshift(traceNode);
          traceNode = cameFrom.get(key(traceNode));
        }
        return path;
      }

      for (const neighbor of getNeighbors(current, grid)) {
        const nk = key(neighbor);
        const tentativeG = (gScore.get(key(current)) ?? Infinity) + 1;
        if (tentativeG < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, current);
          gScore.set(nk, tentativeG);
          fScore.set(nk, tentativeG + heuristic(neighbor, goal));
          if (!open.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
            open.push(neighbor);
          }
        }
      }
    }
    return null; // No path found
  }

  describe('worldToGrid', () => {
    it('center of map (0,0) maps to grid center', () => {
      const result = worldToGrid(0, 0);
      assert.equal(result.x, 48, 'center x should be 48');
      assert.equal(result.y, 48, 'center y should be 48');
    });

    it('negative world coords map to lower grid indices', () => {
      const result = worldToGrid(-192, -192);
      assert.equal(result.x, 0, 'min world x should map to grid 0');
      assert.equal(result.y, 0, 'min world y should map to grid 0');
    });

    it('positive world coords map to higher grid indices', () => {
      const result = worldToGrid(188, 188); // just inside bounds
      assert.equal(result.x, 95, 'should be near max');
      assert.equal(result.y, 95, 'should be near max');
    });

    it('out of bounds coords are clamped', () => {
      const result = worldToGrid(500, -500);
      assert.equal(result.x, 95, 'should clamp to max');
      assert.equal(result.y, 0, 'should clamp to min');
    });

    it('grid cells are TILE_SIZE units apart', () => {
      const a = worldToGrid(0, 0);
      const b = worldToGrid(4, 0);
      assert.equal(b.x - a.x, 1, '4 world units should be 1 grid cell');
      assert.equal(b.y, a.y, 'same z should give same y');
    });
  });

  describe('gridToWorld', () => {
    it('grid center maps to near world center', () => {
      const result = gridToWorld(48, 48);
      assert.ok(Math.abs(result.x) <= 2, 'center grid should map near world center (got ' + result.x + ')');
      assert.ok(Math.abs(result.z) <= 2, 'center grid should map near world center (got ' + result.z + ')');
    });

    it('grid corner (0,0) maps to near world corner', () => {
      const result = gridToWorld(0, 0);
      assert.ok(result.x < 0 && result.x > -WORLD_HALF, 'should be in negative quadrant');
      assert.ok(result.z < 0 && result.z > -WORLD_HALF, 'should be in negative quadrant');
    });

    it('round-trip worldToGrid → gridToWorld is close to original', () => {
      const wx = 50, wz = -30;
      const grid = worldToGrid(wx, wz);
      const world = gridToWorld(grid.x, grid.y);
      assert.ok(Math.abs(world.x - wx) < TILE_SIZE, 'round-trip x error should be < TILE_SIZE');
      assert.ok(Math.abs(world.z - wz) < TILE_SIZE, 'round-trip z error should be < TILE_SIZE');
    });
  });

  describe('A* Pathfinding', () => {
    const emptyGrid = { blocked: new Set(), width: MAP_SIZE, height: MAP_SIZE };

    it('finds straight path on empty grid', () => {
      const path = astar(emptyGrid, { x: 10, y: 10 }, { x: 15, y: 10 });
      assert.ok(path !== null, 'path should exist');
      assert.ok(path.length > 1, 'path should have multiple nodes');
      assert.equal(path[0].x, 10, 'should start at source');
      assert.equal(path[path.length - 1].x, 15, 'should end at goal');
    });

    it('returns single node for same start and goal', () => {
      const path = astar(emptyGrid, { x: 10, y: 10 }, { x: 10, y: 10 });
      assert.ok(path !== null);
      assert.equal(path.length, 1);
    });

    it('returns null when no path exists', () => {
      const grid = { blocked: new Set(), width: 10, height: 10 };
      // Block a wall across the middle
      for (let x = 0; x < 10; x++) {
        grid.blocked.add(`${x},5`);
      }
      const path = astar(grid, { x: 0, y: 0 }, { x: 0, y: 9 });
      assert.ok(path === null, 'should find no path when wall blocks');
    });

    it('finds path around obstacle', () => {
      const grid = { blocked: new Set(), width: 20, height: 20 };
      // Single obstacle in the middle
      grid.blocked.add('5,5');
      const path = astar(grid, { x: 0, y: 5 }, { x: 10, y: 5 });
      assert.ok(path !== null, 'should find path around single obstacle');
      // Verify no node is on the obstacle
      for (const node of path) {
        assert.ok(!grid.blocked.has(`${node.x},${node.y}`), `path should not go through blocked tile (${node.x},${node.y})`);
      }
    });

    it('avoids all blocked tiles in path', () => {
      const grid = { blocked: new Set(), width: 20, height: 20 };
      // Create a small cluster of blocked tiles
      grid.blocked.add('5,5');
      grid.blocked.add('5,6');
      grid.blocked.add('6,5');
      const path = astar(grid, { x: 0, y: 5 }, { x: 10, y: 5 });
      assert.ok(path !== null, 'should find path around cluster');
      for (const node of path) {
        assert.ok(!grid.blocked.has(`${node.x},${node.y}`));
      }
    });

    it('path is reasonable length', () => {
      const path = astar(emptyGrid, { x: 0, y: 0 }, { x: 10, y: 0 });
      assert.ok(path !== null);
      // Manhattan distance is 10, path should be close (diagonal allows shorter)
      assert.ok(path.length <= 12, `path length ${path.length} should be close to manhattan distance 10`);
    });
  });
};
