import * as THREE from 'three';

let _buildingIdCounter = 0;

export class Building {
  constructor(type, faction, x, z, team) {
    this.id = ++_buildingIdCounter;
    this.type = type;         // 'command_center' | 'barracks' | 'siege_factory' | 'gas_mining'
    this.faction = faction;
    this.team = team;
    this.x = x;
    this.z = z;
    this.alive = true;
    this.deathTimer = 0;

    // Stats
    this.maxHp = 500;
    this.hp = 500;
    this.sightRange = 80;
    this.diamonds = 0;        // resource held (for command center drop-off)

    // ADR-5: Auto-defense stats (only command_center and siege_factory have values)
    this.damage = 0;
    this.attackRange = 0;
    this.attackCooldown = 0;
    this.attackTimer = 0;
    this.autoAttackTimer = 0;
    this.autoAttackInterval = 0.5;

    // Production
    this.productionQueue = [];
    this.productionTimer = 0;
    this.maxQueue = 1;

    // Mesh
    this.mesh = null;
    this.selectionRing = null;
    this.healthBar = null;
    this.healthBarBg = null;
    this.muzzleFlashMesh = null;
    this.muzzleFlashTimer = 0;
    this.constructionProgress = 1.0; // 0..1, 1 = complete
  }

  createMesh(factionDef) {
    const group = new THREE.Group();

    if (factionDef && factionDef.buildBuildingMesh) {
      factionDef.buildBuildingMesh(this, group);
    } else {
      // Fallback: box
      const size = this.type === 'command_center' ? 6 : 4;
      const geo = new THREE.BoxGeometry(size, size * 0.8, size);
      const mat = new THREE.MeshStandardMaterial({
        color: this.team === 0 ? 0x4488ff : 0xff4444,
        roughness: 0.7,
        metalness: 0.3,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = size * 0.4;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    group.position.set(this.x, 0, this.z);
    this.mesh = group;

    // Selection ring
    const ringGeo = new THREE.RingGeometry(5, 6, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.team === 0 ? 0x00ffff : 0xff4444,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.position.y = 0.1;
    this.selectionRing.visible = false;
    group.add(this.selectionRing);

    // Health bar
    const barBgGeo = new THREE.PlaneGeometry(6, 0.4);
    const barBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    this.healthBarBg = new THREE.Mesh(barBgGeo, barBgMat);
    this.healthBarBg.position.y = 5;
    group.add(this.healthBarBg);

    const barGeo = new THREE.PlaneGeometry(5.8, 0.3);
    const barMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide });
    this.healthBar = new THREE.Mesh(barGeo, barMat);
    this.healthBar.position.y = 5;
    this.healthBar.position.z = 0.01;
    group.add(this.healthBar);

    // ADR-5: Muzzle flash for buildings with auto-defense
    const flashGeo = new THREE.SphereGeometry(0.5, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.y = 3;
    this.muzzleFlashMesh.visible = false;
    group.add(this.muzzleFlashMesh);

    return group;
  }

  setStats(def) {
    this.maxHp = def.hp || 500;
    this.hp = this.maxHp;
    this.sightRange = def.sight || 80;
    // ADR-5: Auto-defense stats (only set if the faction defines them)
    this.damage = def.damage || 0;
    this.attackRange = def.range || 0;
    this.attackCooldown = def.cooldown || 0;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathTimer = 1.5;
    }
  }

  updateHealthBar() {
    const pct = this.hp / this.maxHp;
    if (this.healthBar) {
      this.healthBar.scale.x = Math.max(0.01, pct);
      if (pct > 0.6) this.healthBar.material.color.setHex(0x00ff88);
      else if (pct > 0.3) this.healthBar.material.color.setHex(0xffaa00);
      else this.healthBar.material.color.setHex(0xff3344);
    }
  }

  billboardBars(camera) {
    if (this.healthBarBg) this.healthBarBg.lookAt(camera.position);
    if (this.healthBar) this.healthBar.lookAt(camera.position);
  }

  queueProduction(unitType) {
    if (this.productionQueue.length < this.maxQueue) {
      this.productionQueue.push(unitType);
      return true;
    }
    return false;
  }

  syncMesh() {
    if (this.mesh) {
      this.mesh.position.set(this.x, 0, this.z);
      this.selectionRing.visible = this.selected || false;
      // Scale for construction
      if (this.constructionProgress < 1) {
        const p = this.constructionProgress;
        this.mesh.scale.set(1, p, 1);
        this.mesh.position.y = 0;
      }
    }
  }

  containsPoint(px, pz, radius) {
    const half = this.type === 'command_center' ? 4 : 3;
    return px >= this.x - half - radius && px <= this.x + half + radius &&
           pz >= this.z - half - radius && pz <= this.z + half + radius;
  }

  /**
   * ADR-5: Update auto-defense combat — fire at nearest enemy unit in range.
   * Only buildings with damage > 0 and range > 0 can attack.
   */
  updateCombat(dt, allUnits) {
    if (this.damage <= 0 || this.attackRange <= 0) return;

    this.attackTimer -= dt;
    this.autoAttackTimer -= dt;
    this.muzzleFlashTimer -= dt;

    // Muzzle flash visual
    if (this.muzzleFlashMesh) {
      if (this.muzzleFlashTimer > 0) {
        this.muzzleFlashMesh.visible = true;
        this.muzzleFlashMesh.material.opacity = this.muzzleFlashTimer / 0.2;
      } else {
        this.muzzleFlashMesh.visible = false;
      }
    }

    // Find nearest enemy unit (auto-acquire)
    let nearest = null;
    let nearestDist = this.attackRange;

    for (const other of allUnits) {
      if (!other.alive || other.team === this.team) continue;
      const dx = other.x - this.x;
      const dz = other.z - this.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = other;
      }
    }

    if (nearest && nearestDist <= this.attackRange) {
      // In range — fire if cooldown expired
      if (this.attackTimer <= 0) {
        nearest.takeDamage(this.damage);
        this.attackTimer = this.attackCooldown;
        this.muzzleFlashTimer = 0.2;

        // ADR-5: Face the target (rotate the muzzle flash toward enemy)
        if (this.muzzleFlashMesh) {
          this.muzzleFlashMesh.position.x = (dx / nearestDist) * 2;
          this.muzzleFlashMesh.position.z = (dz / nearestDist) * 2;
        }
      }
    }
  }
}

export function resetBuildingIds() {
  _buildingIdCounter = 0;
}