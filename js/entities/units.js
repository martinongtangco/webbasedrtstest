import * as THREE from 'three';
import { worldToGrid, gridToWorld, astar } from '../engine/pathfinding.js';

/**
 * Unit base class. Each unit is a Three.js Group with:
 * - mesh geometry built from primitives
 * - stats (hp, damage, speed, sight, range)
 * - movement state (path, progress)
 * - combat state (target, attack timer)
 */

let _unitIdCounter = 0;

export class Unit {
  constructor(type, faction, x, z, team) {
    this.id = ++_unitIdCounter;
    this.type = type;         // string key into faction's unit roster
    this.faction = faction;   // faction name
    this.team = team;         // 0 = player, 1 = enemy
    this.x = x;
    this.z = z;

    // Stats (filled from faction definition)
    this.maxHp = 100;
    this.hp = 100;
    this.damage = 10;
    this.speed = 30;          // world units per second
    this.sightRange = 60;
    this.attackRange = 5;     // 0 = melee
    this.attackCooldown = 1;  // seconds between attacks
    this.cost = { diamonds: 0, biogas: 0 };
    this.buildTime = 3;

    // State
    this.selected = false;
    this.path = null;         // array of {x, y} grid coords
    this.pathProgress = 0;    // 0..1 along path
    this.moveTarget = null;   // world {x, z} of move order
    this.attackTarget = null; // another Unit
    this.attackTimer = 0;
    this.gatherTarget = null; // Resource node
    this.carrying = 0;        // resource amount
    this.state = 'idle';      // idle | moving | attacking | gathering | returning | building
    this.alive = true;
    this.deathTimer = 0;

    // Mesh
    this.mesh = null;
    this.selectionRing = null;
    this.healthBar = null;
    this.healthBarBg = null;

    // Firing visual
    this.muzzleFlashTimer = 0;
    this.muzzleFlashMesh = null;

    // Auto-attack
    this.autoAttackTimer = 0;
    this.autoAttackInterval = 0.5;

    // ADR-8: Animation state
    this.animOffset = Math.random() * Math.PI * 2; // unique per-unit phase offset
    this.facing = 0;              // current rotation in radians
    this.wasMoving = false;       // flag set during movement for bobbing

    // Combat pathfinding
    this.combatPath = null;
    this.combatPathIdx = 0;
    this.combatPathTimer = 0;
  }

  /**
   * Create the Three.js mesh group
   * @param {object} factionDef - Faction definition with colors and buildUnitMesh function
   * @returns {THREE.Group}
   */
  createMesh(factionDef) {
    const group = new THREE.Group();

    // Call faction-specific mesh builder
    if (factionDef && factionDef.buildUnitMesh) {
      factionDef.buildUnitMesh(this, group);
    } else {
      // Fallback: simple capsule
      const geo = new THREE.CapsuleGeometry(0.8, 1.5, 4, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: this.team === 0 ? 0x4488ff : 0xff4444,
        roughness: 0.6,
        metalness: 0.3,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      group.add(mesh);
    }

    group.position.set(this.x, 0, this.z);
    this.mesh = group;

    // Selection ring
    const ringGeo = new THREE.RingGeometry(1.8, 2.2, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.team === 0 ? 0x00ffff : 0xff4444,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.position.y = 0.1;
    this.selectionRing.visible = false;
    group.add(this.selectionRing);

    // Health bar
    const barBgGeo = new THREE.PlaneGeometry(3, 0.3);
    const barBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    this.healthBarBg = new THREE.Mesh(barBgGeo, barBgMat);
    this.healthBarBg.position.y = 2.5;
    group.add(this.healthBarBg);

    const barGeo = new THREE.PlaneGeometry(2.8, 0.2);
    const barMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide });
    this.healthBar = new THREE.Mesh(barGeo, barMat);
    this.healthBar.position.y = 2.5;
    this.healthBar.position.z = 0.01;
    group.add(this.healthBar);

    // Muzzle flash
    const flashGeo = new THREE.SphereGeometry(0.4, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.y = 1.5;
    this.muzzleFlashMesh.position.x = 1.5;
    this.muzzleFlashMesh.visible = false;
    group.add(this.muzzleFlashMesh);

    return group;
  }

  /**
   * Set stats from type definition
   * @param {object} def
   */
  setStats(def) {
    this.maxHp = def.hp || 100;
    this.hp = this.maxHp;
    this.damage = def.damage || 10;
    this.speed = def.speed || 30;
    this.sightRange = def.sight || 60;
    this.attackRange = def.range || 5;
    this.attackCooldown = def.cooldown || 1;
    this.cost = def.cost || { diamonds: 50, biogas: 0 };
    this.buildTime = def.buildTime || 3;
  }

  /**
   * Order unit to move to world position
   */
  moveTo(worldX, worldZ, grid, tileSize, worldHalfSize) {
    this.state = 'moving';
    this.attackTarget = null;

    const start = worldToGrid(this.x, this.z, tileSize, worldHalfSize);
    const goal = worldToGrid(worldX, worldZ, tileSize, worldHalfSize);

    const path = astar(grid, start, goal);
    if (path && path.length > 1) {
      this.path = path;
      this.pathProgress = 0;
      this.moveTarget = { x: worldX, z: worldZ };
    } else {
      // Direct movement if pathfinding fails or same cell
      this.moveTarget = { x: worldX, z: worldZ };
      this.path = null;
      this.state = 'moving';
    }
  }

  /**
   * Order unit to attack a target unit
   */
  attackUnit(target) {
    this.attackTarget = target;
    this.state = 'attacking';
    this.path = null;
  }

  /**
   * Order unit to gather from a resource node
   */
  gatherFrom(resource, homeBuilding) {
    this.gatherTarget = resource;
    this.homeBuilding = homeBuilding;
    this.carrying = 0;
    this.state = 'gathering';
  }

  /**
   * Take damage
   */
  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathTimer = 1.0; // 1 second death animation
    }
  }

  /**
   * Update health bar width
   */
  updateHealthBar() {
    const pct = this.hp / this.maxHp;
    if (this.healthBar) {
      this.healthBar.scale.x = Math.max(0.01, pct);
      // Color change: green → yellow → red
      if (pct > 0.6) this.healthBar.material.color.setHex(0x00ff88);
      else if (pct > 0.3) this.healthBar.material.color.setHex(0xffaa00);
      else this.healthBar.material.color.setHex(0xff3344);
    }
  }

  /**
   * Make health bar billboard the camera
   */
  billboardBars(camera) {
    if (this.healthBarBg) this.healthBarBg.lookAt(camera.position);
    if (this.healthBar) this.healthBar.lookAt(camera.position);
  }

  /**
   * Update movement for this frame
   * @param {number} dt - delta time in seconds
   * @param {object} grid - pathfinding grid
   * @param {number} tileSize
   * @param {number} worldHalfSize
   */
  updateMovement(dt, grid, tileSize, worldHalfSize) {
    this.wasMoving = false;
    if (this.state !== 'moving' || !this.moveTarget) return;

    if (this.path && this.path.length > 1) {
      // ADR-8: Compute facing direction from path
      const distPerStep = this.speed * dt;
      const totalPathDist = this.path.length - 1;
      this.pathProgress += distPerStep / (totalPathDist * tileSize);

      if (this.pathProgress >= 1) {
        // Reached destination
        this.x = this.moveTarget.x;
        this.z = this.moveTarget.z;
        this.state = 'idle';
        this.path = null;
        this.moveTarget = null;
        this.wasMoving = false;
      } else {
        // Interpolate position along path
        const clamped = Math.min(this.pathProgress, 1);
        const steps = this.path.length - 1;
        const floatIdx = clamped * steps;
        const idx = Math.floor(floatIdx);
        const t = floatIdx - idx;

        const from = gridToWorld(this.path[Math.min(idx, steps)].x, this.path[Math.min(idx, steps)].y, tileSize, worldHalfSize);
        const to = gridToWorld(this.path[Math.min(idx + 1, steps)].x, this.path[Math.min(idx + 1, steps)].y, tileSize, worldHalfSize);

        // ADR-8: Set facing direction from path movement delta
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        if (dx !== 0 || dz !== 0) {
          this.facing = Math.atan2(dx, dz);
        }

        this.x = from.x + (dx) * t;
        this.z = from.z + (dz) * t;
        this.wasMoving = true;
      }
    } else if (this.moveTarget) {
      // Direct movement (no path)
      const dx = this.moveTarget.x - this.x;
      const dz = this.moveTarget.z - this.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const moveStep = this.speed * dt;

      // ADR-8: Set facing direction
      if (dist > 0) {
        this.facing = Math.atan2(dx, dz);
      }

      if (dist < moveStep) {
        this.x = this.moveTarget.x;
        this.z = this.moveTarget.z;
        this.state = 'idle';
        this.moveTarget = null;
        this.wasMoving = false;
      } else {
        this.x += (dx / dist) * moveStep;
        this.z += (dz / dist) * moveStep;
        this.wasMoving = true;
      }
    }

    // Clamp to world bounds
    const half = worldHalfSize - 2;
    this.x = Math.max(-half, Math.min(half, this.x));
    this.z = Math.max(-half, Math.min(half, this.z));
  }

  /**
   * Update combat for this frame
   * @param {number} dt
   * @param {Unit[]} allUnits
   * @param {object} grid - pathfinding grid (needed for path-based combat approach)
   * @param {number} tileSize
   * @param {number} worldHalfSize
   */
  updateCombat(dt, allUnits, grid, tileSize, worldHalfSize) {
    this.attackTimer -= dt;
    this.muzzleFlashTimer -= dt;

    // Muzzle flash
    if (this.muzzleFlashMesh) {
      if (this.muzzleFlashTimer > 0) {
        this.muzzleFlashMesh.visible = true;
        this.muzzleFlashMesh.material.opacity = this.muzzleFlashTimer / 0.15;
      } else {
        this.muzzleFlashMesh.visible = false;
      }
    }

    if (this.state !== 'attacking' || !this.attackTarget) return;

    if (!this.attackTarget.alive) {
      this.attackTarget = null;
      this.state = 'idle';
      return;
    }

    const dx = this.attackTarget.x - this.x;
    const dz = this.attackTarget.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Face target
    if (this.mesh) {
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    if (dist <= this.attackRange + 1) {
      // In range — fire
      if (this.attackTimer <= 0) {
        this.attackTarget.takeDamage(this.damage);
        this.attackTimer = this.attackCooldown;
        this.muzzleFlashTimer = 0.15;
        // ADR-3: Play shoot SFX when unit fires
        window.dispatchEvent(new CustomEvent('unit_shoot', { detail: { id: this.id } }));
        // ADR-9: Dispatch event for hit particles at target position
        window.dispatchEvent(new CustomEvent('unit_hit', { detail: { x: this.attackTarget.x, z: this.attackTarget.z } }));
      }
    } else {
      // Use pathfinding to approach target (re-path periodically)
      if (!this.combatPath || this.combatPathTimer <= 0) {
        this.combatPathTimer = 0.5; // re-path every 0.5s
        const start = worldToGrid(this.x, this.z, tileSize, worldHalfSize);
        const goal = worldToGrid(this.attackTarget.x, this.attackTarget.z, tileSize, worldHalfSize);
        const path = astar(grid, start, goal);
        if (path && path.length > 1) {
          this.combatPath = path;
          this.combatPathIdx = 0;
        } else {
          this.combatPath = null; // fall back to direct movement
        }
      }
      this.combatPathTimer -= dt;

      if (this.combatPath && this.combatPath.length > 1) {
        // Follow combat path
        const idx = Math.min(this.combatPathIdx, this.combatPath.length - 1);
        const next = this.combatPath[idx + 1];
        const targetWorld = gridToWorld(next.x, next.y, tileSize, worldHalfSize);
        const pdx = targetWorld.x - this.x;
        const pdz = targetWorld.z - this.z;
        const pDist = Math.sqrt(pdx * pdx + pdz * pdz);
        const moveStep = this.speed * dt;
        if (pDist < moveStep) {
          this.x = targetWorld.x;
          this.z = targetWorld.z;
          this.combatPathIdx++;
        } else {
          this.x += (pdx / pDist) * moveStep;
          this.z += (pdz / pDist) * moveStep;
        }
      } else {
        // Direct movement fallback (when pathfinding fails)
        const moveStep = this.speed * dt;
        if (dist > moveStep) {
          this.x += (dx / dist) * moveStep;
          this.z += (dz / dist) * moveStep;
        }
      }
    }
  }

  /**
   * Auto-acquire nearby enemy
   */
  updateAutoAttack(dt, allUnits) {
    this.autoAttackTimer -= dt;
    if (this.autoAttackTimer > 0) return;
    this.autoAttackTimer = this.autoAttackInterval;

    if (this.state !== 'idle' && this.state !== 'moving') return;

    let nearest = null;
    let nearestDist = this.sightRange;

    for (const other of allUnits) {
      if (!other.alive || other.team === this.team || other.id === this.id) continue;
      const dx = other.x - this.x;
      const dz = other.z - this.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = other;
      }
    }

    if (nearest && nearestDist <= this.sightRange) {
      this.attackUnit(nearest);
    }
  }

  /**
   * Support unit healing: find injured friendly units and heal them
   * Prioritized over auto-attack — called before updateAutoAttack
   */
  updateHealing(dt, allUnits) {
    if (this.type !== 'support' || !this.alive) return;

    // Note: attackTimer is decremented by updateCombat (called after this).
    // We only decrement muzzleFlashTimer here for visual sync.
    this.muzzleFlashTimer -= dt;

    // Muzzle flash visual (green for healing)
    if (this.muzzleFlashMesh) {
      if (this.muzzleFlashTimer > 0) {
        this.muzzleFlashMesh.visible = true;
        this.muzzleFlashMesh.material.opacity = this.muzzleFlashTimer / 0.15;
        this.muzzleFlashMesh.material.color.setHex(0x00ff88);
      } else {
        this.muzzleFlashMesh.visible = false;
      }
    }

    // Find nearest friendly unit needing healing
    if (this.state !== 'healing' || !this.attackTarget || !this.attackTarget.alive) {
      let nearest = null;
      let nearestDist = this.sightRange;

      for (const other of allUnits) {
        if (!other.alive || other.team !== this.team || other.id === this.id) continue;
        if (other.hp >= other.maxHp) continue;
        const dx = other.x - this.x;
        const dz = other.z - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = other;
        }
      }

      if (nearest) {
        this.attackTarget = nearest;
        this.state = 'healing';
      } else {
        this.state = 'idle';
        this.attackTarget = null;
        if (this.muzzleFlashMesh) this.muzzleFlashMesh.material.color.setHex(0xffff00);
        return;
      }
    }

    const dx = this.attackTarget.x - this.x;
    const dz = this.attackTarget.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Face target
    if (this.mesh) {
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    if (dist <= this.attackRange + 1) {
      // In range — heal
      if (this.attackTimer <= 0) {
        this.attackTarget.hp = Math.min(this.attackTarget.maxHp, this.attackTarget.hp + this.damage);
        this.attackTimer = this.attackCooldown;
        this.muzzleFlashTimer = 0.15;
      }
    } else {
      // ADR-8: Face healing target when moving
      this.facing = Math.atan2(dx, dz);
      // Move toward target if out of range
      const moveStep = this.speed * dt;
      if (dist > moveStep) {
        this.x += (dx / dist) * moveStep;
        this.z += (dz / dist) * moveStep;
      }
    }

    // If target fully healed, look for another next tick
    if (this.attackTarget.hp >= this.attackTarget.maxHp) {
      this.attackTarget = null;
      this.state = 'idle';
      if (this.muzzleFlashMesh) this.muzzleFlashMesh.material.color.setHex(0xffff00);
    }
  }

  /**
   * Update gathering behavior
   * @param {number} dt
   * @param {number} tileSize
   * @param {number} worldHalfSize
   */
  updateGathering(dt, tileSize, worldHalfSize) {
    this.wasMoving = false;
    if (this.state === 'gathering' && this.gatherTarget && this.gatherTarget.alive) {
      // Move toward resource
      const dx = this.gatherTarget.x - this.x;
      const dz = this.gatherTarget.z - this.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 3) {
        // ADR-8: Face gathering target
        this.facing = Math.atan2(dx, dz);
        this.wasMoving = true;
        const step = this.speed * dt;
        this.x += (dx / dist) * Math.min(step, dist);
        this.z += (dz / dist) * Math.min(step, dist);
      } else {
        // At resource — gather
        this.gatherTimer = (this.gatherTimer || 0) + dt;
        if (this.gatherTimer >= 2) {
          this.carrying = this.gatherTarget.amountPerGather || 10;
          this.gatherTarget.amount -= this.carrying;
          this.gatherTimer = 0;
          this.state = 'returning';
          if (this.gatherTarget.amount <= 0) {
            this.gatherTarget.alive = false;
            this.gatherTarget = null;
          }
        }
      }
    } else if (this.state === 'returning' && this.homeBuilding) {
      // Move toward home building
      const dx = this.homeBuilding.x - this.x;
      const dz = this.homeBuilding.z - this.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 5) {
        // ADR-8: Face home building
        this.facing = Math.atan2(dx, dz);
        this.wasMoving = true;
        const step = this.speed * dt;
        this.x += (dx / dist) * Math.min(step, dist);
        this.z += (dz / dist) * Math.min(step, dist);
      } else {
        // At home — deposit
        this.homeBuilding.diamonds += this.carrying;
        window.dispatchEvent(new CustomEvent('resource_deposited', { detail: { amount: this.carrying } }));
        this.carrying = 0;
        if (this.gatherTarget && this.gatherTarget.alive) {
          this.state = 'gathering';
          this.gatherTimer = 0;
        } else {
          this.state = 'idle';
        }
      }
    }
  }

  /**
   * Sync mesh position
   * ADR-8: Applies rotation toward facing direction and vertical bobbing during movement/attack
   */
  syncMesh() {
    if (this.mesh) {
      this.mesh.position.set(this.x, 0, this.z);
      this.selectionRing.visible = this.selected;

      // ADR-8: Smooth rotation toward facing direction
      if (this.facing !== 0 || this.wasMoving) {
        this.mesh.rotation.y = this.facing;
      }

      // ADR-8: Vertical bobbing during movement/attack states
      if (this.state === 'moving' || this.state === 'attacking' || this.state === 'gathering' || this.state === 'returning') {
        const bobAmount = Math.sin(clockTime + this.animOffset) * 0.15;
        this.mesh.position.y = Math.max(0, bobAmount);
      } else if (this.state === 'healing') {
        const bobAmount = Math.sin(clockTime * 0.7 + this.animOffset) * 0.08;
        this.mesh.position.y = Math.max(0, bobAmount);
      } else {
        this.mesh.position.y = 0;
      }
    }
  }

  /**
   * ADR-12: Apply an upgrade to this unit's stats (modifies base stats directly)
   * @param {string} upgradeType - 'weapon' | 'engine' | 'armor'
   */
  applyUpgrade(upgradeType) {
    if (upgradeType === 'weapon') {
      this.damage = Math.floor(this.damage * 1.2);
    } else if (upgradeType === 'engine') {
      this.speed = Math.floor(this.speed * 1.15);
    } else if (upgradeType === 'armor') {
      const hpBonus = Math.floor(this.maxHp * 0.25);
      this.maxHp += hpBonus;
      this.hp = Math.min(this.hp + hpBonus, this.maxHp);
    }
  }

  /**
   * Check if a world point is within this unit's selection radius
   */
  containsPoint(px, pz, radius) {
    const dx = px - this.x;
    const dz = pz - this.z;
    return (dx * dx + dz * dz) <= (radius + 2) * (radius + 2);
  }

  /**
   * Check if unit is inside a world-space box
   */
  insideBox(minX, minZ, maxX, maxZ) {
    return this.x >= minX && this.x <= maxX && this.z >= minZ && this.z <= maxZ;
  }
}

export function resetUnitIds() {
  _unitIdCounter = 0;
}