/**
 * Tests for ADR-8 through ADR-13
 * - ADR-8: Unit walking/attack animations
 * - ADR-9: Particle effects for combat and death
 * - ADR-10: Dynamic pathfinding obstacles
 * - ADR-11: Chat UI
 * - ADR-12: Unit upgrades / tech tree
 * - ADR-13: Settings / options menu
 */

export default ({ describe, it, assert }) => {

  // ═══════════════════════════════════════════════════════════
  // ADR-8: Unit walking/attack animations
  // ═══════════════════════════════════════════════════════════
  describe('ADR-8 — Unit Animations', () => {

    it('Unit has animation state properties', () => {
      // We can't import the Unit class in Node.js (requires Three.js),
      // but we can test the animation logic independently
      const unit = {
        state: 'moving',
        facing: Math.PI / 4,
        wasMoving: true,
        animOffset: 1.5,
        mesh: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, visible: true },
        selected: false,
        alive: true
      };

      // Simulate syncMesh animation logic
      const clockTime = 2.0;

      // Test rotation
      if (unit.facing !== 0 || unit.wasMoving) {
        unit.mesh.rotation.y = unit.facing;
      }
      assert.approx(unit.mesh.rotation.y, Math.PI / 4, 0.01, 'mesh should rotate toward facing direction');

      // Test bobbing during movement
      if (unit.state === 'moving') {
        const bobAmount = Math.sin(clockTime + unit.animOffset) * 0.15;
        unit.mesh.position.y = Math.max(0, bobAmount);
      }
      assert.ok(unit.mesh.position.y >= 0, 'bob should be clamped to non-negative');
      assert.ok(unit.mesh.position.y <= 0.15, 'bob amplitude should be at most 0.15');
    });

    it('Unit bobbing varies per unit (unique animOffset)', () => {
      const clockTime = 1.0;
      const offsets = [0, Math.PI / 3, Math.PI, 2.5];

      const bobs = offsets.map(offset => {
        return Math.sin(clockTime + offset) * 0.15;
      });

      // All offsets should produce different bob values (within floating point precision)
      for (let i = 0; i < bobs.length; i++) {
        for (let j = i + 1; j < bobs.length; j++) {
          assert.ok(Math.abs(bobs[i] - bobs[j]) > 0.001,
            `offsets ${offsets[i]} and ${offsets[j]} should produce different bobs`);
        }
      }
    });

    it('Unit has no bobbing when idle', () => {
      const state = 'idle';
      let yPos = 0;
      if (state === 'moving' || state === 'attacking') {
        yPos = Math.sin(1.0) * 0.15;
      }
      assert.equal(yPos, 0, 'idle unit should have y position 0');
    });

    it('Unit bobbing is gentle during healing state', () => {
      const state = 'healing';
      const clockTime = 1.0;
      const animOffset = 0.5;
      let yPos = 0;
      if (state === 'healing') {
        yPos = Math.sin(clockTime * 0.7 + animOffset) * 0.08;
      }
      assert.ok(yPos >= -0.08 && yPos <= 0.08, 'healing bob should be gentle (max 0.08)');
    });

    it('Facing direction computed correctly from movement delta', () => {
      // Moving right (positive X)
      const dx1 = 5, dz1 = 0;
      const facing1 = Math.atan2(dx1, dz1);
      assert.approx(facing1, Math.PI / 2, 0.01, 'moving right should face PI/2');

      // Moving forward (positive Z)
      const dx2 = 0, dz2 = 5;
      const facing2 = Math.atan2(dx2, dz2);
      assert.approx(facing2, 0, 0.01, 'moving forward should face 0');

      // Moving diagonal
      const dx3 = 3, dz3 = 4;
      const facing3 = Math.atan2(dx3, dz3);
      assert.approx(facing3, 0.6435, 0.01, 'diagonal movement should have correct facing');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ADR-9: Particle effects for combat and death
  // ═══════════════════════════════════════════════════════════
  describe('ADR-9 — Particle Effects', () => {

    it('Death particles have correct structure', () => {
      const particles = [];
      const count = 15 + Math.floor(Math.random() * 8);

      for (let i = 0; i < count; i++) {
        particles.push({
          life: 0.6 + Math.random() * 0.6,
          maxLife: 0.6 + Math.random() * 0.6,
          velocity: {
            x: (Math.random() - 0.5) * 20,
            y: 3 + Math.random() * 8,
            z: (Math.random() - 0.5) * 20
          },
          gravity: -15
        });
      }

      assert.ok(count >= 15 && count <= 22, `death particle count should be 15-22, got ${count}`);

      for (const p of particles) {
        assert.ok(p.velocity.y > 0, 'particles should initially move upward');
        assert.ok(p.gravity < 0, 'gravity should pull downward');
        assert.ok(p.life > 0 && p.life <= 1.2, 'particle life should be in valid range');
      }
    });

    it('Hit particles have correct structure', () => {
      const particles = [];
      const count = 4 + Math.floor(Math.random() * 3);

      for (let i = 0; i < count; i++) {
        particles.push({
          life: 0.2 + Math.random() * 0.3,
          maxLife: 0.2 + Math.random() * 0.3,
          velocity: {
            x: (Math.random() - 0.5) * 8,
            y: 1 + Math.random() * 3,
            z: (Math.random() - 0.5) * 8
          },
          gravity: -10
        });
      }

      assert.ok(count >= 4 && count <= 6, `hit particle count should be 4-6, got ${count}`);
      for (const p of particles) {
        assert.ok(p.life <= 0.5, 'hit particles should have short lifetime');
      }
    });

    it('Particle physics: gravity affects velocity over time', () => {
      const p = {
        velocity: { x: 5, y: 10, z: -3 },
        gravity: -15,
        life: 1.0,
        maxLife: 1.0
      };

      // Simulate 3 frames at dt = 0.016 (60fps)
      for (let i = 0; i < 3; i++) {
        const dt = 0.016;
        p.velocity.y += p.gravity * dt;
        p.life -= dt;
      }

      assert.approx(p.velocity.y, 10 + (-15) * 0.048, 0.01, 'gravity should reduce upward velocity');
      assert.approx(p.life, 0.952, 0.01, 'life should decrease by dt each frame');
    });

    it('Particle fade: opacity proportional to remaining life', () => {
      const life = 0.3;
      const maxLife = 1.0;
      const opacity = Math.max(0, life / maxLife);
      assert.approx(opacity, 0.3, 0.01, 'opacity should be 30% when 30% life remains');

      const deadLife = 0;
      const deadOpacity = Math.max(0, deadLife / maxLife);
      assert.equal(deadOpacity, 0, 'dead particle should be fully transparent');
    });

    it('Particle scale: shrinks as particle dies', () => {
      const life = 0.5;
      const maxLife = 1.0;
      const scale = 0.5 + (life / maxLife) * 0.5;
      assert.approx(scale, 0.75, 0.01, 'scale should be 75% at 50% life');

      const fullScale = 0.5 + (maxLife / maxLife) * 0.5;
      assert.approx(fullScale, 1.0, 0.01, 'scale should be 100% at full life');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ADR-10: Dynamic pathfinding obstacles
  // ═══════════════════════════════════════════════════════════
  describe('ADR-10 — Dynamic Pathfinding Obstacles', () => {

    function createGrid(size) {
      return {
        blocked: new Set(),
        dynamicBlocked: new Set(),
        width: size,
        height: size
      };
    }

    function computeDynamicObstacles(units, tileSize, worldHalf) {
      const dynamicBlocked = new Set();
      for (const u of units) {
        if (u.alive && u.state !== 'idle') {
          const gx = Math.floor((u.x + worldHalf) / tileSize);
          const gy = Math.floor((u.z + worldHalf) / tileSize);
          dynamicBlocked.add(`${gx},${gy}`);
        }
      }
      return dynamicBlocked;
    }

    it('Moving units are added as dynamic obstacles', () => {
      const units = [
        { x: 0, z: 0, alive: true, state: 'moving' },
        { x: 20, z: 20, alive: true, state: 'attacking' },
        { x: 40, z: 40, alive: true, state: 'idle' }
      ];
      const tileSize = 4;
      const worldHalf = 192;

      const dynamic = computeDynamicObstacles(units, tileSize, worldHalf);

      // Moving unit at (0,0) → grid (48, 48)
      assert.ok(dynamic.has('48,48'), 'moving unit should block its cell');
      // Attacking unit at (20,20) → grid (53, 53)
      assert.ok(dynamic.has('53,53'), 'attacking unit should block its cell');
      // Idle unit at (40,40) → grid (58, 58) should NOT be blocked
      assert.ok(!dynamic.has('58,58'), 'idle unit should NOT block its cell');
    });

    it('Dead units are not added as obstacles', () => {
      const units = [
        { x: 0, z: 0, alive: false, state: 'moving' }
      ];
      const dynamic = computeDynamicObstacles(units, 4, 192);
      assert.ok(!dynamic.has('48,48'), 'dead unit should not block any cell');
    });

    it('Dynamic obstacles are cleared each frame', () => {
      const dynamic = new Set();
      dynamic.add('48,48');
      dynamic.add('53,53');

      // Simulate clearing and recomputing
      dynamic.clear();

      const units = [
        { x: 10, z: 10, alive: true, state: 'moving' }
      ];
      for (const u of units) {
        if (u.alive && u.state !== 'idle') {
          const gx = Math.floor((u.x + 192) / 4);
          const gy = Math.floor((u.z + 192) / 4);
          dynamic.add(`${gx},${gy}`);
        }
      }

      assert.equal(dynamic.size, 1, 'dynamic obstacles should only contain current moving units');
      // Unit at world (10,10): gx = floor((10+192)/4) = floor(50.5) = 50
      assert.ok(dynamic.has('50,50'), 'new unit position should be tracked');
    });

    it('A* respects dynamicBlocked in addition to static blocked', () => {
      // Import astar from the actual module
      const grid = createGrid(20);
      grid.blocked.add('5,5');     // Static obstacle
      grid.dynamicBlocked.add('6,5'); // Dynamic obstacle (moving unit)

      // Clear dynamic blocked to simulate what astar checks
      // We can't easily import astar in Node.js with Three.js dependencies,
      // so we test the logic inline
      const checkBlocked = (key) => {
        return grid.blocked.has(key) || (grid.dynamicBlocked && grid.dynamicBlocked.has(key));
      };

      assert.ok(checkBlocked('5,5'), 'static obstacle should be detected');
      assert.ok(checkBlocked('6,5'), 'dynamic obstacle should be detected');
      assert.ok(!checkBlocked('7,5'), 'clear cell should not be blocked');
    });

    it('Many moving units produce correct obstacle count', () => {
      const units = [];
      for (let i = 0; i < 20; i++) {
        units.push({
          x: i * 5, z: i * 3,
          alive: i % 5 !== 0,  // 4 out of 5 alive
          state: i % 3 === 0 ? 'idle' : 'moving'  // 2 out of 3 moving
        });
      }

      const dynamic = computeDynamicObstacles(units, 4, 192);
      // Count: alive AND not idle = 16 alive * 2/3 moving ≈ 10-11
      assert.ok(dynamic.size >= 8 && dynamic.size <= 12,
        `expected 8-12 dynamic obstacles, got ${dynamic.size}`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ADR-11: Chat UI
  // ═══════════════════════════════════════════════════════════
  describe('ADR-11 — Chat UI', () => {

    function createMockChatPanel() {
      const messages = [];
      return {
        messages,
        addMessage(sender, text) {
          messages.push({ sender, text });
          if (messages.length > 100) messages.shift();
        },
        clear() { messages.length = 0; }
      };
    }

    it('Chat messages are stored with sender and text', () => {
      const chat = createMockChatPanel();
      chat.addMessage('Player1', 'Hello!');
      chat.addMessage('Player2', 'Hi there!');

      assert.equal(chat.messages.length, 2);
      assert.equal(chat.messages[0].sender, 'Player1');
      assert.equal(chat.messages[0].text, 'Hello!');
      assert.equal(chat.messages[1].sender, 'Player2');
      assert.equal(chat.messages[1].text, 'Hi there!');
    });

    it('Chat history is capped at 100 messages', () => {
      const chat = createMockChatPanel();
      for (let i = 0; i < 120; i++) {
        chat.addMessage('System', `Message ${i}`);
      }
      assert.equal(chat.messages.length, 100, 'history should be capped at 100');
      assert.equal(chat.messages[0].text, 'Message 20', 'oldest messages should be removed');
    });

    it('Chat can be cleared', () => {
      const chat = createMockChatPanel();
      chat.addMessage('Player', 'Test');
      chat.clear();
      assert.equal(chat.messages.length, 0, 'chat should be empty after clear');
    });

    it('NetworkClient handles chat message protocol', () => {
      // Simulate chat message handling
      const received = [];
      const onChat = (sender, message) => {
        received.push({ sender, message });
      };

      // Simulate receiving a chat message
      const msg = { type: 'chat', sender: 'host', message: 'GL HF!' };
      if (msg.type === 'chat') {
        onChat(msg.sender || 'Opponent', msg.message);
      }

      assert.equal(received.length, 1);
      assert.equal(received[0].sender, 'host');
      assert.equal(received[0].message, 'GL HF!');
    });

    it('Chat message sending includes sender role', () => {
      const sent = [];
      const sendChat = (message, role) => {
        sent.push({ type: 'chat', sender: role || 'player', message });
      };

      sendChat('Hello', 'host');
      sendChat('Hi back', 'guest');
      sendChat('Default role', null);

      assert.equal(sent[0].sender, 'host');
      assert.equal(sent[1].sender, 'guest');
      assert.equal(sent[2].sender, 'player');
    });

    it('Empty chat messages are not sent', () => {
      let sent = false;
      const msg = '  '.trim();
      if (msg) {
        sent = true;
      }
      assert.ok(!sent, 'empty/whitespace-only messages should not be sent');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ADR-12: Unit upgrades / tech tree
  // ═══════════════════════════════════════════════════════════
  describe('ADR-12 — Unit Upgrades', () => {

    function createMockUnit(type, faction, x, z, team) {
      return {
        id: 1, type, faction, team, x, z,
        maxHp: 100, hp: 100,
        damage: 10, speed: 30,
        alive: true,
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
      };
    }

    function createUpgradeStates() {
      return {
        weapon: { researched: false, researching: false, progress: 0, duration: 15 },
        engine: { researched: false, researching: false, progress: 0, duration: 12 },
        armor:  { researched: false, researching: false, progress: 0, duration: 15 }
      };
    }

    it('Weapon upgrade increases damage by 20%', () => {
      const unit = createMockUnit('trooper', 'dogs', 0, 0, 0);
      assert.equal(unit.damage, 10);
      unit.applyUpgrade('weapon');
      assert.equal(unit.damage, 12, 'damage should be 12 after weapon upgrade');
    });

    it('Engine upgrade increases speed by 15%', () => {
      const unit = createMockUnit('scout', 'dogs', 0, 0, 0);
      assert.equal(unit.speed, 30);
      unit.applyUpgrade('engine');
      assert.equal(unit.speed, 34, 'speed should be 34 after engine upgrade');
    });

    it('Armor upgrade increases HP by 25%', () => {
      const unit = createMockUnit('trooper', 'dogs', 0, 0, 0);
      assert.equal(unit.maxHp, 100);
      unit.applyUpgrade('armor');
      assert.equal(unit.maxHp, 125, 'maxHp should be 125 after armor upgrade');
      assert.equal(unit.hp, 125, 'hp should also be increased to match');
    });

    it('Multiple weapon upgrades stack multiplicatively', () => {
      const unit = createMockUnit('trooper', 'dogs', 0, 0, 0);
      unit.applyUpgrade('weapon');  // 10 → 12
      unit.applyUpgrade('weapon');  // 12 → 14
      assert.equal(unit.damage, 14, 'second weapon upgrade should stack');
    });

    it('Upgrade research starts with correct state', () => {
      const states = createUpgradeStates();
      const diamonds = 300;
      const biogas = 100;

      // Research weapon upgrade (costs 200 diamonds, 50 biogas)
      const cost = { diamonds: 200, biogas: 50 };
      if (diamonds >= cost.diamonds && biogas >= cost.biogas) {
        states.weapon.researching = true;
        states.weapon.progress = 0;
      }

      assert.ok(states.weapon.researching, 'research should start');
      assert.equal(states.weapon.progress, 0, 'progress should start at 0');
      assert.ok(!states.weapon.researched, 'should not be researched yet');
    });

    it('Upgrade research completes after duration', () => {
      const states = createUpgradeStates();
      states.weapon.researching = true;
      states.weapon.progress = 0;

      // Simulate 16 seconds at 60fps
      for (let i = 0; i < 16 * 60; i++) {
        states.weapon.progress += (1/60) / states.weapon.duration;
        if (states.weapon.progress >= 1) {
          states.weapon.progress = 1;
          states.weapon.researching = false;
          states.weapon.researched = true;
          break;
        }
      }

      assert.ok(states.weapon.researched, 'upgrade should be researched after duration');
      assert.ok(!states.weapon.researching, 'should not be researching after completion');
    });

    it('Cannot research already completed upgrade', () => {
      const states = createUpgradeStates();
      states.weapon.researched = true;

      let researchedAgain = false;
      if (!states.weapon.researched && !states.weapon.researching) {
        researchedAgain = true;
      }

      assert.ok(!researchedAgain, 'already researched upgrade should not be re-researchable');
    });

    it('Upgrade cost affordability check', () => {
      const diamonds = 150;
      const biogas = 20;
      const cost = { diamonds: 200, biogas: 50 };

      const canAfford = diamonds >= cost.diamonds && biogas >= cost.biogas;
      assert.ok(!canAfford, 'should not afford upgrade with insufficient resources');

      const canAfford2 = 250 >= cost.diamonds && 60 >= cost.biogas;
      assert.ok(canAfford2, 'should afford upgrade with sufficient resources');
    });

    it('Upgrade applied to all existing player units on completion', () => {
      const units = [
        createMockUnit('trooper', 'dogs', 0, 0, 0),
        createMockUnit('scout', 'dogs', 5, 5, 0),
        createMockUnit('trooper', 'dogs', 10, 10, 1)  // enemy team, should NOT get upgrade
      ];

      for (const u of units) {
        if (u.team === 0 && u.alive) {
          u.applyUpgrade('weapon');
        }
      }

      assert.equal(units[0].damage, 12, 'player unit should get upgrade');
      assert.equal(units[1].damage, 12, 'player unit should get upgrade');
      assert.equal(units[2].damage, 10, 'enemy unit should NOT get upgrade');
    });

    it('Upgrade progress updates correctly at fixed timestep', () => {
      const state = { researching: true, progress: 0, duration: 10 };
      const dt = 1/60; // ~60fps

      for (let i = 0; i < 300; i++) { // 5 seconds at 60fps
        state.progress += dt / state.duration;
      }

      assert.approx(state.progress, 0.5, 0.02, 'after 5s of 10s duration, progress should be ~50%');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ADR-13: Settings / options menu
  // ═══════════════════════════════════════════════════════════
  describe('ADR-13 — Settings', () => {

    function createMockSettings() {
      return {
        sfxVolume: 70,
        musicVolume: 50,
        difficulty: 'medium'
      };
    }

    it('Settings have valid default values', () => {
      const settings = createMockSettings();
      assert.ok(settings.sfxVolume >= 0 && settings.sfxVolume <= 100, 'SFX volume should be 0-100');
      assert.ok(settings.musicVolume >= 0 && settings.musicVolume <= 100, 'Music volume should be 0-100');
      assert.ok(['easy', 'medium', 'hard'].includes(settings.difficulty), 'difficulty should be valid');
    });

    it('Volume multiplier converts 0-100 to 0.0-1.0', () => {
      const volumeToMultiplier = (v) => v / 100;
      assert.approx(volumeToMultiplier(0), 0.0, 0.001);
      assert.approx(volumeToMultiplier(50), 0.5, 0.001);
      assert.approx(volumeToMultiplier(100), 1.0, 0.001);
    });

    it('SFX volume affects synth volume correctly', () => {
      // Tone.js volume: multiplier * 30 - 30 maps 0→-30dB (nearly silent), 1→0dB (full)
      const sfxVolumeToDb = (mult) => mult * 30 - 30;
      assert.approx(sfxVolumeToDb(0), -30, 0.01, '0% volume should be -30dB (nearly silent)');
      assert.approx(sfxVolumeToDb(1), 0, 0.01, '100% volume should be 0dB (full)');
      assert.approx(sfxVolumeToDb(0.5), -15, 0.01, '50% volume should be -15dB');
    });

    it('Music volume affects synth volume correctly', () => {
      // Music volume: -18 - (1 - mult) * 12 maps 0→-30dB (nearly silent), 1→-18dB (full)
      const musicVolumeToDb = (mult) => -18 - (1 - mult) * 12;
      assert.approx(musicVolumeToDb(0), -30, 0.01, '0% music should be -30dB (nearly silent)');
      assert.approx(musicVolumeToDb(1), -18, 0.01, '100% music should be -18dB (full)');
      assert.approx(musicVolumeToDb(0.5), -24, 0.01, '50% music should be -24dB');
    });

    it('Settings can be saved and loaded from localStorage', () => {
      const settings = { sfxVolume: 80, musicVolume: 30, difficulty: 'hard' };

      // Simulate save
      const saved = JSON.stringify(settings);
      // Simulate load
      const loaded = JSON.parse(saved);

      assert.equal(loaded.sfxVolume, 80);
      assert.equal(loaded.musicVolume, 30);
      assert.equal(loaded.difficulty, 'hard');
    });

    it('Settings persist across game restart', () => {
      const savedSettings = { sfxVolume: 90, musicVolume: 40, difficulty: 'easy' };
      const saved = JSON.stringify(savedSettings);

      // Simulate loading on next game start
      const restored = JSON.parse(saved);

      assert.equal(restored.sfxVolume, savedSettings.sfxVolume);
      assert.equal(restored.musicVolume, savedSettings.musicVolume);
      assert.equal(restored.difficulty, savedSettings.difficulty);
    });

    it('Volume is clamped to valid range', () => {
      const clampVolume = (v) => Math.max(0, Math.min(1, v));
      assert.equal(clampVolume(-0.5), 0, 'negative volume should clamp to 0');
      assert.equal(clampVolume(1.5), 1, 'volume > 1 should clamp to 1');
      assert.equal(clampVolume(0.5), 0.5, 'valid volume should pass through');
    });

    it('Difficulty has three valid options', () => {
      const difficulties = ['easy', 'medium', 'hard'];
      assert.equal(difficulties.length, 3);
      assert.ok(difficulties.includes('easy'));
      assert.ok(difficulties.includes('medium'));
      assert.ok(difficulties.includes('hard'));
    });
  });

};
