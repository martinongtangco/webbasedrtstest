import * as THREE from 'three';

export class HUD {
  constructor() {
    this.diamondEl = document.getElementById('diamond-count');
    this.biogasEl = document.getElementById('biogas-count');
    this.buildMenuEl = document.getElementById('build-menu');
    this.unitInfoEl = document.getElementById('unit-info');
    this.minimapContainer = document.getElementById('minimap-container');
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 96;
    this.minimapCanvas.height = 96;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.minimapContainer.appendChild(this.minimapCanvas);

    // Placement menu
    this.placementMenuEl = document.getElementById('placement-menu');

    // Constants for world↔minimap conversion
    this.MAP_SIZE = 96;       // tiles
    this.TILE_SIZE = 4;       // world units per tile
    this.WORLD_HALF = (this.MAP_SIZE * this.TILE_SIZE) / 2; // 192

    // Minimap click → camera jump
    this.minimapCanvas.addEventListener('click', (e) => this.onMinimapClick(e));
  }

  onMinimapClick(e) {
    const rect = this.minimapCanvas.getBoundingClientRect();
    const scaleX = this.minimapCanvas.width / rect.width;
    const scaleY = this.minimapCanvas.height / rect.height;

    // Pixel within the 96×96 canvas
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    // Convert to grid coords (0..95)
    const gx = Math.floor(px);
    const gy = Math.floor(py);

    // Convert grid to world: map spans -WORLD_HALF .. +WORLD_HALF
    // grid 0 → -WORLD_HALF + TILE_SIZE/2, grid 95 → +WORLD_HALF - TILE_SIZE/2
    const worldX = -this.WORLD_HALF + gx * this.TILE_SIZE + this.TILE_SIZE / 2;
    const worldZ = -this.WORLD_HALF + gy * this.TILE_SIZE + this.TILE_SIZE / 2;

    // Dispatch event so main.js moves the camera
    window.dispatchEvent(new CustomEvent('minimap_click', {
      detail: { x: worldX, z: worldZ }
    }));
  }

  updateResources(diamonds, biogas) {
    if (this.diamondEl) this.diamondEl.textContent = `💎 ${Math.floor(diamonds)}`;
    if (this.biogasEl) this.biogasEl.textContent = `⚡ ${Math.floor(biogas)}`;
  }

  updateMinimap(fogData, units, buildings, team) {
    if (!fogData) return;
    const ctx = this.minimapCtx;
    const imgData = ctx.createImageData(96, 96);
    imgData.data.set(fogData);
    ctx.putImageData(imgData, 0, 0);
    for (const b of buildings) {
      if (!b.alive) continue;
      const gx = Math.floor((b.x + 192) / 4);
      const gy = Math.floor((b.z + 192) / 4);
      ctx.fillStyle = b.team === team ? '#4488ff' : '#ff4444';
      ctx.fillRect(gx - 2, gy - 2, 4, 4);
    }
    for (const u of units) {
      if (!u.alive) continue;
      const gx = Math.floor((u.x + 192) / 4);
      const gy = Math.floor((u.z + 192) / 4);
      ctx.fillStyle = u.team === team ? '#66aaff' : '#ff6666';
      ctx.fillRect(gx, gy, 1, 1);
    }
  }

  showBuildMenu(building, factionDef, diamonds, biogas) {
    this.buildMenuEl.innerHTML = '';
    if (!building || !building.alive) return;
    let unitTypes = [];
    if (building.type === 'command_center') unitTypes = ['harvester'];
    else if (building.type === 'barracks') unitTypes = ['scout', 'trooper', 'support'];
    else if (building.type === 'siege_factory') unitTypes = ['cannon', 'artillery'];
    else return;
    for (const utype of unitTypes) {
      const def = factionDef.units[utype];
      if (!def) continue;
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      const canAfford = diamonds >= def.cost.diamonds && biogas >= (def.cost.biogas || 0);
      btn.disabled = !canAfford;
      btn.innerHTML = `${def.name}<span class="cost">💎${def.cost.diamonds}${def.cost.biogas ? ' ⚡' + def.cost.biogas : ''}</span>`;
      btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('produce_unit', { detail: { buildingId: building.id, unitType: utype } }));
      });
      this.buildMenuEl.appendChild(btn);
    }
  }

  hideBuildMenu() { this.buildMenuEl.innerHTML = ''; }

  showUnitInfo(entity) {
    this.unitInfoEl.innerHTML = '';
    if (!entity || !entity.alive) return;
    const h3 = document.createElement('h3');
    h3.textContent = entity.name || entity.type;
    this.unitInfoEl.appendChild(h3);
    if (entity.hp !== undefined) {
      const stat = document.createElement('div');
      stat.className = 'stat';
      stat.textContent = `HP: ${Math.floor(entity.hp)}/${entity.maxHp}`;
      this.unitInfoEl.appendChild(stat);
      const barContainer = document.createElement('div');
      barContainer.className = 'health-bar';
      const fill = document.createElement('div');
      fill.className = 'health-bar-fill';
      fill.style.width = `${(entity.hp / entity.maxHp) * 100}%`;
      barContainer.appendChild(fill);
      this.unitInfoEl.appendChild(barContainer);
    }
    if (entity.damage !== undefined) {
      const stat = document.createElement('div');
      stat.className = 'stat';
      stat.textContent = `DMG: ${entity.damage} | SPD: ${entity.speed}`;
      this.unitInfoEl.appendChild(stat);
    }
  }

  hideUnitInfo() { this.unitInfoEl.innerHTML = ''; }

  /**
   * Show the placement menu with buttons for each buildable building type.
   * @param {object} factionDef - Faction definition with buildings
   * @param {number} diamonds - Current diamond count
   * @param {number} biogas - Current biogas count
   */
  showPlacementMenu(factionDef, diamonds, biogas) {
    if (!this.placementMenuEl || !factionDef) return;
    this.placementMenuEl.innerHTML = '';
    this.placementMenuEl.classList.remove('hidden');

    const buildableTypes = ['barracks', 'siege_factory', 'gas_mining'];
    for (const btype of buildableTypes) {
      const def = factionDef.buildings[btype];
      if (!def || !def.cost) continue;
      const btn = document.createElement('button');
      btn.className = 'placement-btn';
      const canAfford = diamonds >= def.cost.diamonds && biogas >= (def.cost.biogas || 0);
      btn.disabled = !canAfford;
      const displayName = btype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      btn.innerHTML = `${displayName}<span class="cost">&#x1F48E;${def.cost.diamonds}${def.cost.biogas ? ' &#9889;' + def.cost.biogas : ''}</span>`;
      btn.dataset.buildingType = btype;
      btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('start_placement', { detail: { type: btype } }));
      });
      this.placementMenuEl.appendChild(btn);
    }
  }

  /** Hide the placement menu panel */
  hidePlacementMenu() {
    if (this.placementMenuEl) {
      this.placementMenuEl.classList.add('hidden');
    }
  }

  /**
   * Update affordability of placement menu buttons based on current resources.
   * @param {object} factionDef - Faction definition with buildings
   * @param {number} diamonds - Current diamond count
   * @param {number} biogas - Current biogas count
   */
  updatePlacementMenu(factionDef, diamonds, biogas) {
    if (!this.placementMenuEl || this.placementMenuEl.classList.contains('hidden')) return;
    const buttons = this.placementMenuEl.querySelectorAll('.placement-btn');
    for (const btn of buttons) {
      const btype = btn.dataset.buildingType;
      const def = factionDef.buildings[btype];
      if (!def || !def.cost) continue;
      const canAfford = diamonds >= def.cost.diamonds && biogas >= (def.cost.biogas || 0);
      btn.disabled = !canAfford;
    }
  }
}