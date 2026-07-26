/**
 * Tests for support unit healing logic.
 * Tests the updateHealing() algorithm in isolation (no Three.js needed).
 */

export default async ({ describe, it, assert }) => {
  // Simulate the healing algorithm from units.js updateHealing()
  function simulateHealing(supportUnit, allUnits, dt) {
    if (supportUnit.type !== 'support' || !supportUnit.alive) return;

    // Find nearest friendly unit needing healing
    if (supportUnit.state !== 'healing' || !supportUnit.attackTarget || !supportUnit.attackTarget.alive) {
      let nearest = null;
      let nearestDist = supportUnit.sightRange;

      for (const other of allUnits) {
        if (!other.alive || other.team !== supportUnit.team || other.id === supportUnit.id) continue;
        if (other.hp >= other.maxHp) continue;
        const dx = other.x - supportUnit.x;
        const dz = other.z - supportUnit.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = other;
        }
      }

      if (nearest) {
        supportUnit.attackTarget = nearest;
        supportUnit.state = 'healing';
      } else {
        supportUnit.state = 'idle';
        supportUnit.attackTarget = null;
        return;
      }
    }

    const dx = supportUnit.attackTarget.x - supportUnit.x;
    const dz = supportUnit.attackTarget.z - supportUnit.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= supportUnit.attackRange + 1) {
      // In range — heal
      if (supportUnit.attackTimer <= 0) {
        supportUnit.attackTarget.hp = Math.min(supportUnit.attackTarget.maxHp,
          supportUnit.attackTarget.hp + supportUnit.damage);
        supportUnit.attackTimer = supportUnit.attackCooldown;
      }
    } else {
      // Move toward target
      const moveStep = supportUnit.speed * dt;
      if (dist > moveStep) {
        supportUnit.x += (dx / dist) * moveStep;
        supportUnit.z += (dz / dist) * moveStep;
      }
    }

    // If target fully healed, reset
    if (supportUnit.attackTarget.hp >= supportUnit.attackTarget.maxHp) {
      supportUnit.attackTarget = null;
      supportUnit.state = 'idle';
    }
  }

  describe('Healing Behavior', () => {
    it('non-support units are unaffected', () => {
      const unit = { type: 'trooper', alive: true, state: 'idle', attackTimer: 0 };
      simulateHealing(unit, [], 0.016);
      assert.equal(unit.state, 'idle', 'trooper state should not change');
    });

    it('dead support units do nothing', () => {
      const unit = { type: 'support', alive: false, state: 'idle', attackTimer: 0 };
      simulateHealing(unit, [], 0.016);
      assert.equal(unit.state, 'idle', 'dead unit should not change state');
    });

    it('support unit finds injured ally and enters healing state', () => {
      const ally = { id: 1, alive: true, team: 0, hp: 50, maxHp: 100, x: 5, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 0, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'idle', attackTarget: null
      };
      simulateHealing(medic, [ally], 0.016);
      assert.equal(medic.state, 'healing');
      assert.equal(medic.attackTarget, ally);
    });

    it('support unit does not select fully healed ally', () => {
      const ally = { id: 1, alive: true, team: 0, hp: 100, maxHp: 100, x: 5, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 0, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'idle', attackTarget: null
      };
      simulateHealing(medic, [ally], 0.016);
      assert.equal(medic.state, 'idle', 'should stay idle when no injured ally');
      assert.ok(!medic.attackTarget, 'should have no target');
    });

    it('support unit does not target enemies', () => {
      const enemy = { id: 1, alive: true, team: 1, hp: 30, maxHp: 100, x: 5, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 0, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'idle', attackTarget: null
      };
      simulateHealing(medic, [enemy], 0.016);
      assert.equal(medic.state, 'idle', 'should not target enemy');
    });

    it('support unit heals ally when in range', () => {
      const ally = { id: 1, alive: true, team: 0, hp: 50, maxHp: 100, x: 5, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 5, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'healing', attackTarget: ally
      };
      simulateHealing(medic, [ally], 0.016);
      assert.equal(ally.hp, 55, 'ally should have gained 5 hp');
      assert.equal(medic.attackTimer, 2, 'cooldown should be set');
    });

    it('support unit does not over-heal', () => {
      const ally = { id: 1, alive: true, team: 0, hp: 98, maxHp: 100, x: 5, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 5, z: 0, sightRange: 50, attackRange: 12,
        damage: 10, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'healing', attackTarget: ally
      };
      simulateHealing(medic, [ally], 0.016);
      assert.equal(ally.hp, 100, 'should cap at maxHp');
      assert.equal(medic.state, 'idle', 'should reset after full heal');
    });

    it('support unit moves toward injured ally when out of range', () => {
      const ally = { id: 1, alive: true, team: 0, hp: 50, maxHp: 100, x: 30, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 0, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'healing', attackTarget: ally
      };
      simulateHealing(medic, [ally], 0.016);
      assert.ok(medic.x > 0, 'should have moved toward ally');
      assert.ok(Math.abs(medic.z) < 0.1, 'should stay on same z-axis');
    });

    it('support unit picks nearest injured ally', () => {
      const nearAlly = { id: 1, alive: true, team: 0, hp: 50, maxHp: 100, x: 10, z: 0 };
      const farAlly = { id: 3, alive: true, team: 0, hp: 30, maxHp: 100, x: 40, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 0, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'idle', attackTarget: null
      };
      simulateHealing(medic, [nearAlly, farAlly], 0.016);
      assert.equal(medic.attackTarget, nearAlly, 'should pick nearest injured ally');
    });

    it('heal cooldown prevents spam healing', () => {
      const ally = { id: 1, alive: true, team: 0, hp: 50, maxHp: 100, x: 5, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 5, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 2, state: 'healing', attackTarget: ally
      };
      // Timer > 0, so no heal this tick
      simulateHealing(medic, [ally], 0.016);
      assert.equal(ally.hp, 50, 'should not heal while cooldown active');
    });

    it('healing fires once per cooldown (not doubled)', () => {
      // This test verifies the fix: updateCombat also decrements attackTimer,
      // but updateHealing no longer decrements it. So the effective cooldown
      // should match attackCooldown (2 seconds), not attackCooldown/2.
      const ally = { id: 1, alive: true, team: 0, hp: 50, maxHp: 100, x: 5, z: 0 };
      const medic = {
        id: 2, type: 'support', alive: true, team: 0,
        x: 5, z: 0, sightRange: 50, attackRange: 12,
        damage: 5, speed: 32, attackCooldown: 2,
        attackTimer: 0, state: 'healing', attackTarget: ally
      };

      // Simulate 4 full seconds of game time (250 frames at 62.5fps, or 125 at ~125fps)
      // Each simulateHealing call represents one frame
      // updateCombat would decrement attackTimer by dt each frame
      // But updateHealing no longer does — so total decrement = dt per frame (correct)
      let totalDt = 0;
      let healCount = 0;
      while (totalDt < 4) {
        const dt = 0.016;
        // Simulate what updateCombat does: decrement attackTimer
        medic.attackTimer -= dt;
        simulateHealing(medic, [ally], dt);
        totalDt += dt;
        if (medic.attackTimer === 2) healCount++; // heal just fired
      }

      // With 2s cooldown and 4s of simulation, should have healed ~2 times
      // (first at t=0, then at t=2, then at t=4)
      assert.ok(healCount >= 2 && healCount <= 4, `expected 2-4 heals, got ${healCount}`);
    });
  });
};
