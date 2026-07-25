/**
 * Fog of War system.
 * Three states per grid cell:
 *   0 = unexplored (fully hidden)
 *   1 = explored (revealed before, greyed out)
 *   2 = visible (currently in sight of a unit/building)
 */

export class FogOfWar {
  /**
   * @param {number} gridSize - map size in tiles (e.g. 96)
   * @param {number} team - team this fog belongs to (0 or 1)
   */
  constructor(gridSize, team) {
    this.gridSize = gridSize;
    this.team = team;
    this.grid = new Uint8Array(gridSize * gridSize); // 0, 1, or 2
  }

  idx(x, y) {
    return y * this.gridSize + x;
  }

  /**
   * Reveal a radius around a grid position
   */
  reveal(cx, cy, radius) {
    const r2 = radius * radius;
    const halfR = Math.ceil(radius);

    for (let dy = -halfR; dy <= halfR; dy++) {
      for (let dx = -halfR; dx <= halfR; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gy < 0 || gx >= this.gridSize || gy >= this.gridSize) continue;
        if (dx * dx + dy * dy > r2) continue;

        const i = this.idx(gx, gy);
        this.grid[i] = Math.max(this.grid[i], 2); // mark visible
      }
    }
  }

  /**
   * Mark all currently visible cells that are not re-confirmed as explored-only.
   * Call this each frame after revealing from current unit/building positions.
   */
  tick() {
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === 2) {
        this.grid[i] = 1; // downgrade visible → explored
      }
    }
  }

  /**
   * Get cell state
   */
  getState(x, y) {
    if (x < 0 || y < 0 || x >= this.gridSize || y >= this.gridSize) return 0;
    return this.grid[this.idx(x, y)];
  }

  /**
   * Check if a cell is visible
   */
  isVisible(x, y) {
    return this.getState(x, y) === 2;
  }

  /**
   * Check if a cell is explored (visible or previously explored)
   */
  isExplored(x, y) {
    return this.getState(x, y) >= 1;
  }

  /**
   * Reset entire grid
   */
  reset() {
    this.grid.fill(0);
  }

  /**
   * Generate pixel data for minimap rendering
   * @returns {Uint8ClampedArray} RGBA data
   */
  getMinimapData(terrainColor, exploredColor, hiddenColor) {
    const size = this.gridSize;
    const data = new Uint8ClampedArray(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const pixelIdx = i * 4;
        const state = this.grid[i];

        if (state === 2) {
          data[pixelIdx] = terrainColor[0];
          data[pixelIdx + 1] = terrainColor[1];
          data[pixelIdx + 2] = terrainColor[2];
          data[pixelIdx + 3] = 255;
        } else if (state === 1) {
          data[pixelIdx] = exploredColor[0];
          data[pixelIdx + 1] = exploredColor[1];
          data[pixelIdx + 2] = exploredColor[2];
          data[pixelIdx + 3] = 255;
        } else {
          data[pixelIdx] = hiddenColor[0];
          data[pixelIdx + 1] = hiddenColor[1];
          data[pixelIdx + 2] = hiddenColor[2];
          data[pixelIdx + 3] = 255;
        }
      }
    }

    return data;
  }
}