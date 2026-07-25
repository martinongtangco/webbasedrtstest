/**
 * Skirmish AI — simple finite-state AI opponent.
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
  }

  update(dt, game) {
    this.stateTimer += dt;
    this.attackTimer -= dt;

    if (this.hasGasMining) this.biogas += dt * 2;
    this.diamonds += dt * 1;

    this._assignHarvesters();

    if (this.stateTimer > 3) {
      this.stateTimer = 0;
      this._executeBuildOrder(game);
    }

    if (this.attackTimer <= 0) {
      this.attackTimer = this.attackInterval;
      this._launchAttack(game);
    }

    this._manageIdleUnits(game);
  }

  _executeBuildOrder(game) {
    if (!this.hasBarracks && this.diamonds >= 100) {
      this._tryBuildBuilding('barracks', game);
      if (this.hasBarracks) this.diamonds -= 100;
    } else if (this.hasBarracks && !this.hasGasMining && this.diamonds >= 80) {
      this._tryBuildGasMining(game);
      if (this.hasGasMining) this.diamonds -= 80;
    } else if (this.hasBarracks && this.hasGasMining && !this.hasSiegeFactory && this.diamonds >= 150 && this.biogas >= 20) {
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
    game.spawnBuilding('gas_mining', this.buildings[0].faction, nearest.x, nearest.z, this.team);
    this.hasGasMining = true;
  }

  _produceUnits(game) {
    const barracks = this.buildings.find(b => b.team === this.team && b.type === 'barracks' && b.alive);
    const siege = this.buildings.find(b => b.team === this.team && b.type === 'siege_factory' && b.alive);
    const cc = this.buildings.find(b => b.team === this.team && b.type === 'command_center' && b.alive);
    const activeHarvesters = this.units.filter(u => u.team === this.team && u.type === 'harvester' && u.alive).length;
    if (activeHarvesters < 4 && cc && this.diamonds >= 50) {
      if (cc.queueProduction('harvester')) this.diamonds -= 50;
    }
    if (barracks && this.diamonds >= 60) {
      const unitType = Math.random() < 0.6 ? 'trooper' : 'scout';
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
    const combatUnits = this.units.filter(u => u.team === this.team && u.type !== 'harvester' && u.alive && (u.state === 'idle' || u.state === 'moving'));
    if (combatUnits.length < 3) return;
    const playerBuildings = (game.buildings || []).filter(b => b.team === 0 && b.alive);
    if (playerBuildings.length === 0) return;
    const target = playerBuildings.find(b => b.type === 'command_center') || playerBuildings[0];
    const attackX = target.x + (Math.random() - 0.5) * 20;
    const attackZ = target.z + (Math.random() - 0.5) * 20;
    for (const unit of combatUnits) {
      unit.moveTo(attackX, attackZ, game.pathGrid, this.tileSize, this.worldHalfSize);
    }
  }

  _manageIdleUnits(game) {
    const idleCombat = this.units.filter(u => u.team === this.team && u.type !== 'harvester' && u.alive && u.state === 'idle');
    const playerBuildings = (game.buildings || []).filter(b => b.team === 0 && b.alive);
    if (idleCombat.length > 0 && playerBuildings.length > 0) {
      const target = playerBuildings[Math.floor(Math.random() * playerBuildings.length)];
      for (const unit of idleCombat) {
        unit.moveTo(target.x + (Math.random() - 0.5) * 30, target.z + (Math.random() - 0.5) * 30, game.pathGrid, this.tileSize, this.worldHalfSize);
      }
    }
  }
}