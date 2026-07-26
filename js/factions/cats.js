import * as THREE from 'three';

/**
 * FACTION: Cyborg Cats (Feline Vanguard)
 * Identity: Agile, high-mobility, stealth-leaning
 * Palette: Black + violet accents
 * Playstyle: Harassment, mobility, tech-timing plays
 */

export const FACTION_CATS = {
  name: 'Feline Vanguard',
  subtitle: 'Cyborg Cats',
  primaryColor: 0x222233,
  secondaryColor: 0x9933ff,
  accentColor: 0xbf5fff,

  // ADR-18: Model paths
  models: {
    units: {
      harvester: null, scout: null, trooper: null,
      support: null, cannon: null, artillery: null,
    },
    buildings: {
      command_center: null, barracks: null,
      siege_factory: null, gas_mining: null,
    }
  },

  buildings: {
    command_center: { hp: 550, sight: 85, damage: 10, range: 35, cooldown: 1.2, cost: { diamonds: 0, biogas: 0 }, buildTime: 0 },
    barracks: { hp: 380, sight: 65, cost: { diamonds: 80, biogas: 0 }, buildTime: 7 },
    siege_factory: { hp: 450, sight: 70, damage: 25, range: 45, cooldown: 1.8, cost: { diamonds: 180, biogas: 40 }, buildTime: 14 },
    gas_mining: { hp: 230, sight: 55, cost: { diamonds: 70, biogas: 0 }, buildTime: 4 }
  },

  units: {
    harvester: {
      name: 'Stalker Gatherer',
      hp: 55, damage: 4, speed: 40, sight: 45, range: 3, cooldown: 1.5,
      cost: { diamonds: 50, biogas: 0 }, buildTime: 3
    },
    scout: {
      name: 'Shadow Prowler',
      hp: 40, damage: 10, speed: 58, sight: 60, range: 0, cooldown: 0.7,
      cost: { diamonds: 40, biogas: 0 }, buildTime: 2
    },
    trooper: {
      name: 'Blade Cat',
      hp: 70, damage: 15, speed: 35, sight: 50, range: 4, cooldown: 1,
      cost: { diamonds: 65, biogas: 0 }, buildTime: 3
    },
    support: {
      name: 'Phase Cat',
      hp: 50, damage: 5, speed: 45, sight: 55, range: 15, cooldown: 1.5,
      cost: { diamonds: 60, biogas: 0 }, buildTime: 3
    },
    cannon: {
      name: 'Wraith Striker',
      hp: 180, damage: 40, speed: 22, sight: 65, range: 20, cooldown: 1.5,
      cost: { diamonds: 160, biogas: 35 }, buildTime: 6
    },
    artillery: {
      name: 'Void Cannon',
      hp: 140, damage: 55, speed: 20, sight: 75, range: 35, cooldown: 2.5,
      cost: { diamonds: 190, biogas: 55 }, buildTime: 8
    }
  },

  buildUnitMesh(unit, group) {
    const isPlayer = unit.team === 0;
    const bodyColor = isPlayer ? 0x222233 : 0x332222;
    const accentColor = isPlayer ? 0x9933ff : 0xaa44aa;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, metalness: 0.5, flatShading: true });
    const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4, metalness: 0.6, flatShading: true });

    if (unit.type === 'harvester') {
      // Sleek feline with collection pack
      const bodyGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      group.add(body);

      // Head with pointed ears
      const headGeo = new THREE.SphereGeometry(0.4, 6, 6);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.set(0, 1.3, 0.6);
      group.add(head);

      // Cat ears
      for (let side of [-1, 1]) {
        const earGeo = new THREE.ConeGeometry(0.15, 0.3, 3);
        const ear = new THREE.Mesh(earGeo, accentMat);
        ear.position.set(side * 0.25, 1.7, 0.6);
        group.add(ear);
      }

      // Violet eyes
      const eyeGeo = new THREE.SphereGeometry(0.08, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: accentColor });
      for (let side of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(side * 0.15, 1.35, 1);
        group.add(eye);
      }
    } else if (unit.type === 'scout') {
      // Very lean, ghost-like
      const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 4, 6);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.8;
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      group.add(body);

      // Cloak effect
      const cloakGeo = new THREE.ConeGeometry(0.8, 1.5, 6);
      const cloakMat = new THREE.MeshStandardMaterial({ color: bodyColor, transparent: true, opacity: 0.6, flatShading: true });
      const cloak = new THREE.Mesh(cloakGeo, cloakMat);
      cloak.position.y = 1.2;
      group.add(cloak);

      // Eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: accentColor });
      for (let side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat);
        eye.position.set(side * 0.12, 1, 0.35);
        group.add(eye);
      }
    } else if (unit.type === 'trooper') {
      // Medium with dual blades
      const bodyGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      group.add(body);

      const headGeo = new THREE.SphereGeometry(0.35, 6, 6);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.y = 1.8;
      group.add(head);

      // Blades
      for (let side of [-1, 1]) {
        const bladeGeo = new THREE.BoxGeometry(0.05, 1.2, 0.15);
        const blade = new THREE.Mesh(bladeGeo, accentMat);
        blade.position.set(side * 0.7, 1, 0.3);
        group.add(blade);
      }
    } else if (unit.type === 'support') {
      // Phase Cat — sleek with energy orb
      const bodyGeo = new THREE.CapsuleGeometry(0.4, 0.8, 4, 6);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.9;
      body.rotation.z = Math.PI / 2;
      group.add(body);

      // Floating orb
      const orbGeo = new THREE.SphereGeometry(0.3, 8, 8);
      const orbMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(0.8, 1.5, 0);
      group.add(orb);
    } else if (unit.type === 'cannon') {
      // Wraith Striker — sleek tank
      const bodyGeo = new THREE.BoxGeometry(2, 1.2, 2.2);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);

      // Turret
      const turretGeo = new THREE.CylinderGeometry(0.5, 0.7, 0.8, 8);
      const turret = new THREE.Mesh(turretGeo, accentMat);
      turret.position.y = 2;
      group.add(turret);

      // Cannon
      const cannonGeo = new THREE.CylinderGeometry(0.12, 0.18, 2, 6);
      const cannon = new THREE.Mesh(cannonGeo, accentMat);
      cannon.position.set(0, 2, 1.5);
      cannon.rotation.x = Math.PI / 2;
      group.add(cannon);
    } else if (unit.type === 'artillery') {
      // Void Cannon — floating artillery
      const bodyGeo = new THREE.CylinderGeometry(1.2, 1.5, 1, 8);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 2;
      body.castShadow = true;
      group.add(body);

      // Anti-grav glow
      const glowGeo = new THREE.TorusGeometry(1.3, 0.15, 6, 12);
      const glowMat = new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.6 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 1.5;
      glow.rotation.x = Math.PI / 2;
      group.add(glow);

      // Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.1, 0.2, 2.5, 6);
      const barrel = new THREE.Mesh(barrelGeo, accentMat);
      barrel.position.set(0, 2.5, 1);
      barrel.rotation.x = Math.PI / 3;
      group.add(barrel);
    } else {
      const geo = new THREE.CapsuleGeometry(0.5, 1, 4, 6);
      const mat = new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.75;
      mesh.castShadow = true;
      group.add(mesh);
    }
  },

  buildBuildingMesh(building, group) {
    const isPlayer = building.team === 0;
    const primary = isPlayer ? 0x222233 : 0x332222;
    const accent = isPlayer ? 0x9933ff : 0xaa44aa;

    const mat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.6, metalness: 0.5, flatShading: true });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.6, flatShading: true });

    if (building.type === 'command_center') {
      // Sleek, angular command center
      const baseGeo = new THREE.CylinderGeometry(5, 6, 3, 6);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1.5;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Spire
      const spireGeo = new THREE.ConeGeometry(1.5, 4, 6);
      const spire = new THREE.Mesh(spireGeo, accentMat);
      spire.position.y = 5;
      spire.castShadow = true;
      group.add(spire);

      // Glow ring
      const ringGeo = new THREE.TorusGeometry(5.5, 0.2, 6, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.3;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    } else if (building.type === 'barracks') {
      // Sleek workshop
      const baseGeo = new THREE.BoxGeometry(6, 3, 5);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1.5;
      base.castShadow = true;
      group.add(base);

      // Violet accents on edges
      const edgeGeo = new THREE.BoxGeometry(6.1, 0.2, 5.1);
      const edge = new THREE.Mesh(edgeGeo, accentMat);
      edge.position.y = 3;
      group.add(edge);
    } else if (building.type === 'siege_factory') {
      // Hexagonal factory
      const baseGeo = new THREE.CylinderGeometry(4, 4.5, 4, 6);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 2;
      base.castShadow = true;
      group.add(base);

      // Antenna
      const antGeo = new THREE.CylinderGeometry(0.1, 0.1, 3, 4);
      const ant = new THREE.Mesh(antGeo, accentMat);
      ant.position.y = 5.5;
      group.add(ant);
    } else if (building.type === 'gas_mining') {
      // Siphon structure
      const baseGeo = new THREE.CylinderGeometry(2, 2.5, 2, 8);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1;
      group.add(base);

      // Energy collector
      const collectorGeo = new THREE.TorusGeometry(1.5, 0.3, 6, 12);
      const collector = new THREE.Mesh(collectorGeo, accentMat);
      collector.position.y = 3;
      group.add(collector);
    }
  }
};