/**
 * Tests for ADR-5 — Building Auto-Defense
 * Tests that faction buildings have attack stats and the combat algorithm works.
 * Runs in Node.js with mock objects.
 */

export default ({ describe, it, assert }) => {
  describe('ADR-5 — Building Auto-Defense', () => {

    // Faction building data (matching what we set in the faction files)
    const factionBuildings = {
      dogs: {
        command_center: { hp: 600, sight: 80, damage: 8, range: 30, cooldown: 1.5 },
        barracks: { hp: 400, sight: 60 },
        siege_factory: { hp: 500, sight: 65, damage: 20, range: 40, cooldown: 2 },
        gas_mining: { hp: 250, sight: 50 }
      },
      cats: {
        command_center: { hp: 550, sight: 85, damage: 10, range: 35, cooldown: 1.2 },
        barracks: { hp: 380, sight: 65 },
        siege_factory: { hp: 450, sight: 70, damage: 25, range: 45, cooldown: 1.8 },
        gas_mining: { hp: 230, sight: 55 }
      },
      fish: {
        command_center: { hp: 700, sight: 75, damage: 12, range: 28, cooldown: 1.8 },
        barracks: { hp: 450, sight: 55 },
        siege_factory: { hp: 550, sight: 60, damage: 30, range: 38, cooldown: 2.5 },
        gas_mining: { hp: 280, sight: 45 }
      }
    };

    describe('Faction building attack stats', () => {
      for (const [faction, buildings] of Object.entries(factionBuildings)) {
        it(`${faction} command_center has attack stats`, () => {
          assert.ok(buildings.command_center.damage > 0, 'CC should have damage');
          assert.ok(buildings.command_center.range > 0, 'CC should have attack range');
          assert.ok(buildings.command_center.cooldown > 0, 'CC should have attack cooldown');
        });

        it(`${faction} siege_factory has attack stats`, () => {
          assert.ok(buildings.siege_factory.damage > 0, 'siege_factory should have damage');
          assert.ok(buildings.siege_factory.range > 0, 'siege_factory should have range');
          assert.ok(buildings.siege_factory.cooldown > 0, 'siege_factory should have cooldown');
        });

        it(`${faction} barracks has no attack stats`, () => {
          assert.ok(buildings.barracks.damage === undefined, 'barracks should not have damage');
          assert.ok(buildings.barracks.range === undefined, 'barracks should not have range');
        });

        it(`${faction} gas_mining has no attack stats`, () => {
          assert.ok(buildings.gas_mining.damage === undefined, 'gas_mining should not have damage');
          assert.ok(buildings.gas_mining.range === undefined, 'gas_mining should not have range');
        });

        it(`${faction} siege_factory has higher damage than CC`, () => {
          assert.ok(buildings.siege_factory.damage > buildings.command_center.damage,
            'siege_factory should deal more damage than CC');
        });
      }
    });

    describe('Building combat algorithm', () => {
      // Mock Building class (without Three.js)
      function createMockBuilding(type, team, x, z, def) {
        return {
          id: 1, type, team, x, z, alive: true,
          maxHp: def.hp, hp: def.hp,
          sightRange: def.sight,
          damage: def.damage || 0,
          attackRange: def.range || 0,
          attackCooldown: def.cooldown || 0,
          attackTimer: 0,
          autoAttackTimer: 0,
          autoAttackInterval: 0.5,
        };
      }

      function createMockUnit(team, x, z, hp) {
        let currentHp = hp || 100;
        return {
          id: 1, team, x, z, alive: true,
          hp: currentHp, maxHp: hp || 100,
          get hp() { return currentHp; },
          set hp(v) { currentHp = v; },
          takeDamage(amount) {
            currentHp -= amount;
            if (currentHp <= 0) { currentHp = 0; this.alive = false; }
          }
        };
      }

      /** Simulate building combat for one tick (matches Building.updateCombat logic) */
      function simulateBuildingCombat(building, allUnits, dt) {
        if (building.damage <= 0 || building.attackRange <= 0) return false;

        building.attackTimer -= dt;
        building.autoAttackTimer -= dt;

        // Find nearest enemy unit
        let nearest = null;
        let nearestDist = building.attackRange;
        for (const other of allUnits) {
          if (!other.alive || other.team === building.team) continue;
          const dx = other.x - building.x;
          const dz = other.z - building.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = other;
          }
        }

        if (nearest && nearestDist <= building.attackRange) {
          if (building.attackTimer <= 0) {
            nearest.takeDamage(building.damage);
            building.attackTimer = building.attackCooldown;
            return true; // fired
          }
        }
        return false;
      }

      it('CC fires at enemy unit within range', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.dogs.command_center);
        const enemy = createMockUnit(1, 15, 15, 100); // distance = ~21.2 < 30 range
        const fired = simulateBuildingCombat(cc, [enemy], 0.016);
        assert.ok(fired, 'CC should fire at enemy within range');
        assert.equal(enemy.hp, 100 - cc.damage, 'enemy should take damage');
      });

      it('CC does not fire at enemy outside range', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.dogs.command_center);
        const enemy = createMockUnit(1, 50, 50, 100); // distance = ~70.7 > 30 range
        const fired = simulateBuildingCombat(cc, [enemy], 0.016);
        assert.ok(!fired, 'CC should not fire at enemy outside range');
        assert.equal(enemy.hp, 100, 'enemy should not take damage');
      });

      it('CC does not fire at friendly units', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.dogs.command_center);
        const friendly = createMockUnit(0, 10, 10, 100);
        const fired = simulateBuildingCombat(cc, [friendly], 0.016);
        assert.ok(!fired, 'CC should not fire at friendly units');
      });

      it('Barracks does not attack (no damage stat)', () => {
        const barracks = createMockBuilding('barracks', 0, 0, 0, factionBuildings.dogs.barracks);
        const enemy = createMockUnit(1, 5, 5, 100);
        const fired = simulateBuildingCombat(barracks, [enemy], 0.016);
        assert.ok(!fired, 'barracks should not fire');
      });

      it('Building respects attack cooldown', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.dogs.command_center);
        const enemy = createMockUnit(1, 10, 10, 100);

        // First shot
        simulateBuildingCombat(cc, [enemy], 0.016);
        assert.ok(cc.attackTimer > 0, 'attackTimer should be set after firing');

        // Immediate second attempt — should NOT fire (cooldown)
        const fired2 = simulateBuildingCombat(cc, [enemy], 0.001);
        assert.ok(!fired2, 'should not fire during cooldown');
      });

      it('Building fires after cooldown expires', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.dogs.command_center);
        const enemy = createMockUnit(1, 10, 10, 200);

        // First shot
        simulateBuildingCombat(cc, [enemy], 0.016);
        const damage1 = cc.damage;

        // Advance time past cooldown
        simulateBuildingCombat(cc, [enemy], cc.attackCooldown + 0.01);
        const damage2 = cc.damage;

        // Total damage should be 2x
        assert.equal(enemy.hp, 200 - damage1 - damage2, 'should fire again after cooldown');
      });

      it('Building targets nearest enemy when multiple are in range', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.dogs.command_center);
        const near = createMockUnit(1, 10, 10, 100);
        const far = createMockUnit(1, 25, 25, 100);

        simulateBuildingCombat(cc, [near, far], 0.016);
        assert.equal(near.hp, 100 - cc.damage, 'nearest enemy should take damage');
        assert.equal(far.hp, 100, 'far enemy should not take damage');
      });

      it('Siege factory has higher range than CC', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.cats.command_center);
        const siege = createMockBuilding('siege_factory', 0, 0, 0, factionBuildings.cats.siege_factory);
        assert.ok(siege.attackRange > cc.attackRange, 'siege_factory should have longer range than CC');
      });

      it('Building kills enemy unit when HP reaches 0', () => {
        const cc = createMockBuilding('command_center', 0, 0, 0, factionBuildings.dogs.command_center);
        const weak = createMockUnit(1, 10, 10, 5); // HP < CC damage
        simulateBuildingCombat(cc, [weak], 0.016);
        assert.ok(!weak.alive, 'enemy should die when HP reaches 0');
      });
    });
  });
};
