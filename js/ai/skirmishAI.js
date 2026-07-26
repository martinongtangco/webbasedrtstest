/**
 * Skirmish AI — adaptive finite-state AI opponent.
 * 
 * ADR-4 improvements:
 * - Defensive positioning: idle units guard nearby buildings
 * - Multi-pronged attacks: split combat units into 2-3 groups
 * - Adaptive strategy: responds to player aggression, adjusts build priorities
 */

export class SkirmishAI {
  constructor(opts) {
    this.team = 1;
    this.units = opts.units;
    this.buildings = opts.buildings;
    this.resources = opts.resources;
    this.diamonds = 200;
    this.biogas = 0;
    this.tileSize = opts.tileSize || 4;
    this.worldHalfSize = opts.worldHalfSize || 192;
    this.stateTimer = 0;
    this.hasBarracks = false;
    this.hasGasMining = false;
    this.hasSiegeFactory = false;
    this.attackTimer = 30;
    this.attackInterval = 25;

    // ADR-4: Adaptive tracking
    this.initialBuildingCount = 1; // starts with 1 CC
    this.playerAttackTimer = 0;
    this.playerAttackInterval = 2; // scan every 2s for incoming threats
    this.underAttack = false;
    this.guardAssignments = new Map(); // unitId -> buildingId
    this.buildingLosses = 0;
    this.previousBuildingCount = 1;
  }

  update(dt, game) {
    this.stateTimer += dt;
    this.attackTimer -= dt;
    this.playerAttackTimer -= dt;

    if (this.hasGasMining) this.biogas += dt * 2;
    this.diamonds += dt * 1;

    // ADR-4: Track building losses for adaptive strategy
    const currentBuildingCount = this.buildings.filter(b => b.team === this.team && b.alive).length;
    if (currentBuildingCount < this.previousBuildingCount) {
      this.buildingLosses += this.previousBuildingCount - currentBuildingCount;
    }
    this.previousBuildingCount = currentBuildingCount;

    // ADR-4: Detect if under attack (player units near our buildings)
    this._detectPlayerThreat(game);

    this._assignHarvesters();

    if (this.stateTimer > 3) {
      this.stateTimer = 0;
      this._executeBuildOrder(game);
    }

    if (this.attackTimer <= 0) {
      this.attackTimer = this.attackInterval;
      this._launchAttack(game);
    }

    // ADR-4: Defensive guard assignment + idle management
    this._assignBuildingGuards(game);
    this._manageIdleUnits(game);
  }

  _executeBuildOrder(game) {
    // ADR-4: Adaptive build priorities
    // When under attack or losing buildings, prioritize barracks over gas/siege
    const defensivePriority = this.underAttack || this.buildingLosses > 0;

    if (!this.hasBarracks && this.diamonds >= 100) {
      this._tryBuildBuilding('barracks', game);
      if (this.hasBarracks) this.diamonds -= 100;
    } else if (defensivePriority && this.hasBarracks && !this.hasSiegeFactory && this.diamonds >= 150 && this.biogas >= 20) {
      // ADR-4: When under pressure, build siege factory earlier for defense
      this._tryBuildBuilding('siege_factory', game);
      if (this.hasSiegeFactory) { this.diamonds -= 150; this.biogas -= 20; }
    } else if (this.hasBarracks && !this.hasGasMining && this.diamonds >= 80) {
      this._tryBuildGasMining(game);
      if (this.hasGasMining) this.diamonds -= 80;
    } else if (!defensivePriority && this.hasBarracks && this.hasGasMining && !this.hasSiegeFactory && this.diamonds >= 150 && this.biogas >= 20) {
      this._tryBuildBuilding('siege_factory', game);
      if (this.hasSiegeFactory) { this.diamonds -= 150; this.biogas -= 20; }
    }
    this._produceUnits(game);
  }

  _tryBuildBuilding(type, game) {
    const cc = this.buildings.find(b => b.team === this.team && b.type === 'command_center' && b.alive);
    if (!cc) return;
    const offsets = [
      { dx: 15, dz: 10 }, { dx: -15, dz: 10 }, { dx: 15, dz: -10 },
      { dx: -15, dz: -10 }, { dx: 0, dz: 20 }, { dx: 0, dz: -20 }
    ];
    for (const off of offsets) {
      const bx = cc.x + off.dx;
      const bz = cc.z + off.dz;
      const overlap = this.buildings.some(b => b.alive && Math.abs(b.x - bx) < 8 && Math.abs(b.z - bz) < 8);
      if (!overlap) {
        game.spawnBuilding(type, this.buildings[0].faction, bx, bz, this.team);
        if (type === 'barracks') this.hasBarracks = true;
        if (type === 'siege_factory') this.hasSiegeFactory = true;
        return;
      }
    }
  }

  _tryBuildGasMining(game) {
    const gasVents = this.resources.filter(r => r.type === 'gas' && r.alive);
    if (gasVents.length === 0) return;
    const cc = this.buildings.find(b => b.team === this.team && b.type === 'command_center' && b.alive);
    if (!cc) return;
    let nearest = gasVents[0], nearestDist = Infinity;
    for (const vent of gasVents) {
      const dist = Math.sqrt((vent.x - cc.x) ** 2 + (vent.z - cc.z) ** 2);
      if (dist < nearestDist) { nearestDist = dist; nearest = vent; }
    }
    const existing = this.buildings.some(b => b.type === 'gas_mining' && b.alive && Math.abs(b.x - nearest.x) < 8 && Math.abs(b.z - nearest.z) < 8);
    if (existing) { this.hasGasMining = true; return; }
    // Offset from the gas vent so the building doesn't spawn on top of it
    const offX = (cc.x < nearest.x) ? -6 : 6;
    const offZ = (cc.z < nearest.z) ? -6 : 6;
    game.spawnBuilding('gas_mining', this.buildings[0].faction, nearest.x + offX, nearest.z + offZ, this.team);
    this.hasGasMining = true;
  }

  _produceUnits(game) {
    const barracks = this.buildings.find(b => b.team === this.team && b.type === 'barracks' && b.alive);
    const siege = this.buildings.find(b => b.team === this.team && b.type === 'siege_factory' && b.alive);
    const cc = this.buildings.find(b => b.team === this.team && b.type === 'command_center' && b.alive);
    const activeHarvesters = this.units.filter(u => u.team === this.team && u.type === 'harvester' && u.alive).length;

    // ADR-4: Produce more harvesters if under attack (need resources for defense)
    const targetHarvesters = this.underAttack ? 5 : 4;
    if (activeHarvesters < targetHarvesters && cc && this.diamonds >= 50) {
      if (cc.queueProduction('harvester')) this.diamonds -= 50;
    }
    if (barracks && this.diamonds >= 60) {
      // ADR-4: Adaptive unit mix — more troopers when defending, more scouts for harassment
      let unitType;
      if (this.underAttack) {
        unitType = 'trooper'; // focus on solid melee units for defense
      } else if (this.buildingLosses > 1) {
        // ADR-4: If losing ground, produce support units to sustain forces
        unitType = Math.random() < 0.4 ? 'support' : 'trooper';
      } else {
        unitType = Math.random() < 0.6 ? 'trooper' : 'scout';
      }
      if (barracks.queueProduction(unitType)) this.diamonds -= 60;
    }
    if (siege && this.hasGasMining && this.diamonds >= 150 && this.biogas >= 30) {
      if (siege.queueProduction('cannon')) { this.diamonds -= 150; this.biogas -= 30; }
    }
  }

  _assignHarvesters() {
    const harvesters = this.units.filter(u => u.team === this.team && u.type === 'harvester' && u.alive && u.state === 'idle');
    const cc = this.buildings.find(b => b.team === this.team && b.type === 'command_center' && b.alive);
    if (!cc || harvesters.length === 0) return;
    const diamonds = this.resources.filter(r => r.type === 'diamond' && r.alive && r.amount > 0);
    if (diamonds.length === 0) return;
    for (const h of harvesters) {
      let nearest = diamonds[0], nearestDist = Infinity;
      for (const d of diamonds) {
        const dist = Math.sqrt((d.x - h.x) ** 2 + (d.z - h.z) ** 2);
        if (dist < nearestDist) { nearestDist = dist; nearest = d; }
      }
      h.gatherFrom(nearest, cc);
    }
  }

  _launchAttack(game) {
    // ADR-4: Multi-pronged attack — split forces into 2-3 groups targeting different buildings
    const combatUnits = this.units.filter(u => u.team === this.team && u.type !== 'harvester' && u.alive && (u.state === 'idle' || u.state === 'moving'));
    if (combatUnits.length < 3) return;
    const playerBuildings = (game.buildings || []).filter(b => b.team === 0 && b.alive);
    if (playerBuildings.length === 0) return;

    // ADR-4: Determine number of prongs based on available units
    const numProngs = Math.min(3, Math.max(2, playerBuildings.length));
    const minGroupSize = 3;
    const availableForAttack = combatUnits.length;

    if (availableForAttack < numProngs * minGroupSize) {
      // Not enough for multi-prong, fall back to concentrated attack on CC
      const target = playerBuildings.find(b => b.type === 'command_center') || playerBuildings[0];
      const attackX = target.x + (Math.random() - 0.5) * 20;
      const attackZ = target.z + (Math.random() - 0.5) * 20;
      for (const unit of combatUnits) {
        unit.moveTo(attackX, attackZ, game.pathGrid, this.tileSize, this.worldHalfSize);
      }
      return;
    }

    // ADR-4: Pick distinct targets (prefer high-value: CC > siege > barracks > gas)
    const priority = { command_center: 4, siege_factory: 3, barracks: 2, gas_mining: 1 };
    const sortedTargets = [...playerBuildings].sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0));
    const targets = sortedTargets.slice(0, numProngs);

    // Shuffle units for diversity
    const shuffled = [...combatUnits].sort(() => Math.random() - 0.5);
    const groupSize = Math.floor(shuffled.length / numProngs);

    for (let i = 0; i < numProngs; i++) {
      const target = targets[i];
      const group = shuffled.slice(i * groupSize, (i + 1) * groupSize);
      // Each group attacks a slightly different point near the target
      const attackX = target.x + (Math.random() - 0.5) * 16;
      const attackZ = target.z + (Math.random() - 0.5) * 16;
      for (const unit of group) {
        unit.moveTo(attackX, attackZ, game.pathGrid, this.tileSize, this.worldHalfSize);
      }
    }
    // Assign remainder to highest-priority target
    const remainder = shuffled.slice(numProngs * groupSize);
    if (remainder.length > 0 && targets[0]) {
      const t = targets[0];
      for (const unit of remainder) {
        unit.moveTo(t.x + (Math.random() - 0.5) * 16, t.z + (Math.random() - 0.5) * 16, game.pathGrid, this.tileSize, this.worldHalfSize);
      }
    }
  }

  /**
   * ADR-4: Detect if player units are approaching our buildings (under attack)
   */
  _detectPlayerThreat(game) {
    if (this.playerAttackTimer > 0) return;
    this.playerAttackTimer = this.playerAttackInterval;

    const myBuildings = this.buildings.filter(b => b.team === this.team && b.alive);
    const playerUnits = this.units.filter(u => u.team === 0 && u.alive && u.type !== 'harvester');

    let threatDetected = false;
    for (const pUnit of playerUnits) {
      for (const b of myBuildings) {
        const dist = Math.sqrt((pUnit.x - b.x) ** 2 + (pUnit.z - b.z) ** 2);
        if (dist < 60) { // Player unit within 60 units of our building
          threatDetected = true;
          break;
        }
      }
      if (threatDetected) break;
    }
    this.underAttack = threatDetected;
  }

  /**
   * ADR-4: Assign idle combat units to guard nearby buildings
   */
  _assignBuildingGuards(game) {
    const myBuildings = this.buildings.filter(b => b.team === this.team && b.alive);
    if (myBuildings.length === 0) return;

    // Find units that are idle and not assigned as guards
    const idleCombat = this.units.filter(u =>
      u.team === this.team && u.type !== 'harvester' && u.alive &&
      u.state === 'idle' && !this.guardAssignments.has(u.id)
    );

    // ADR-4: When under attack, assign more guards (up to 3 per important building)
    const guardsPerBuilding = this.underAttack ? 3 : 1;

    // Prioritize buildings: CC > siege > barracks > gas
    const priority = { command_center: 4, siege_factory: 3, barracks: 2, gas_mining: 1 };
    const sortedBuildings = [...myBuildings].sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0));

    for (const unit of idleCombat) {
      // Find nearest building that needs a guard
      let nearestBuilding = null;
      let nearestDist = Infinity;
      for (const b of sortedBuildings) {
        const currentGuards = [...this.guardAssignments.entries()]
          .filter(([_, bid]) => bid === b.id).length;
        if (currentGuards >= guardsPerBuilding) continue;

        const dist = Math.sqrt((unit.x - b.x) ** 2 + (unit.z - b.z) ** 2);
        if (dist < nearestDist && dist < 80) {
          nearestDist = dist;
          nearestBuilding = b;
        }
      }
      if (nearestBuilding) {
        // Move to a guard position near the building
        const angle = Math.random() * Math.PI * 2;
        const radius = 8 + Math.random() * 6;
        this.guardAssignments.set(unit.id, nearestBuilding.id);
        unit.moveTo(
          nearestBuilding.x + Math.cos(angle) * radius,
          nearestBuilding.z + Math.sin(angle) * radius,
          game.pathGrid, this.tileSize, this.worldHalfSize
        );
      }
    }

    // Clear stale guard assignments (building destroyed or unit moved to attacking)
    for (const [unitId, buildingId] of this.guardAssignments) {
      const unit = this.units.find(u => u.id === unitId);
      const building = this.buildings.find(b => b.id === buildingId);
      if (!unit || !unit.alive || !building || !building.alive || unit.state !== 'idle') {
        this.guardAssignments.delete(unitId);
      }
    }
  }

  /**
   * ADR-4: Manage truly idle units (not assigned as guards)
   * Only sends units to harass if not under attack
   */
  _manageIdleUnits(game) {
    // Only harass if not under attack — otherwise hold defensive positions
    const idleCombat = this.units.filter(u =>
      u.team === this.team && u.type !== 'harvester' && u.alive &&
      u.state === 'idle' && !this.guardAssignments.has(u.id)
    );
    if (this.underAttack || idleCombat.length === 0) return;

    const playerBuildings = (game.buildings || []).filter(b => b.team === 0 && b.alive);
    if (playerBuildings.length === 0) return;

    // ADR-4: Send small harassment groups instead of all idle units
    const harassGroup = idleCombat.slice(0, Math.min(3, idleCombat.length));
    const target = playerBuildings[Math.floor(Math.random() * playerBuildings.length)];
    for (const unit of harassGroup) {
      unit.moveTo(target.x + (Math.random() - 0.5) * 30, target.z + (Math.random() - 0.5) * 30, game.pathGrid, this.tileSize, this.worldHalfSize);
    }
  }
}