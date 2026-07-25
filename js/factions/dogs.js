import * as THREE from 'three';

/**
 * FACTION: Cyborg Dogs (K9 Corps)
 * Identity: Aggressive, cheap, fast-producing pack units
 * Palette: Gunmetal grey + red accents
 * Playstyle: Early rush, numbers over quality
 */

export const FACTION_DOGS = {
  name: 'K9 Corps',
  subtitle: 'Cyborg Dogs',
  primaryColor: 0x555566,
  secondaryColor: 0xcc2233,
  accentColor: 0xff4444,

  // Building stats
  buildings: {
    command_center: { hp: 600, sight: 80 },
    barracks: { hp: 400, sight: 60 },
    siege_factory: { hp: 500, sight: 65 },
    gas_mining: { hp: 250, sight: 50 }
  },

  // Unit roster: key → { name, hp, damage, speed, sight, range, cooldown, cost, buildTime }
  units: {
    harvester: {
      name: 'Mutt Miner',
      hp: 60, damage: 5, speed: 35, sight: 40, range: 3, cooldown: 1.5,
      cost: { diamonds: 50, biogas: 0 }, buildTime: 3
    },
    // Barracks units (2 basic + 1 ranged)
    scout: {
      name: 'Scout Hound',
      hp: 45, damage: 8, speed: 50, sight: 55, range: 0, cooldown: 0.8,
      cost: { diamonds: 35, biogas: 0 }, buildTime: 2
    },
    trooper: {
      name: 'Pack Trooper',
      hp: 80, damage: 12, speed: 30, sight: 50, range: 15, cooldown: 1.2,
      cost: { diamonds: 60, biogas: 0 }, buildTime: 3
    },
    support: {
      name: 'Medic Pup',
      hp: 55, damage: 3, speed: 32, sight: 50, range: 12, cooldown: 2,
      cost: { diamonds: 55, biogas: 0 }, buildTime: 3
    },
    // Siege Factory units
    cannon: {
      name: 'Cannon Walker',
      hp: 200, damage: 35, speed: 18, sight: 60, range: 25, cooldown: 2,
      cost: { diamonds: 150, biogas: 30 }, buildTime: 6
    },
    artillery: {
      name: 'Siege Mutt',
      hp: 150, damage: 50, speed: 12, sight: 70, range: 40, cooldown: 3,
      cost: { diamonds: 200, biogas: 50 }, buildTime: 8
    }
  },

  // Build a unit mesh from primitives
  buildUnitMesh(unit, group) {
    const isPlayer = unit.team === 0;
    const bodyColor = isPlayer ? 0x555566 : 0x665555;
    const accentColor = isPlayer ? 0xcc2233 : 0xaa3322;

    if (unit.type === 'harvester') {
      // Stocky body with mining claw
      const bodyGeo = new THREE.BoxGeometry(1.2, 1, 1.4);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.4, flatShading: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);

      // Head
      const headGeo = new THREE.BoxGeometry(0.8, 0.7, 0.9);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.set(0, 1.8, 0.3);
      head.castShadow = true;
      group.add(head);

      // Red eye
      const eyeGeo = new THREE.SphereGeometry(0.12, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: accentColor });
      const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
      eye1.position.set(-0.2, 1.9, 0.75);
      group.add(eye1);
      const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
      eye2.position.set(0.2, 1.9, 0.75);
      group.add(eye2);

      // Mining claw
      const clawGeo = new THREE.ConeGeometry(0.3, 1, 4);
      const clawMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.6, flatShading: true });
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(0, 0.5, 1.2);
      claw.rotation.x = Math.PI;
      group.add(claw);
    } else if (unit.type === 'scout') {
      // Lean, fast — small body, long legs
      const bodyGeo = new THREE.BoxGeometry(0.8, 0.7, 1.2);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.4, flatShading: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.9;
      body.castShadow = true;
      group.add(body);

      // Snout
      const snoutGeo = new THREE.ConeGeometry(0.25, 0.6, 4);
      const snout = new THREE.Mesh(snoutGeo, bodyMat);
      snout.position.set(0, 0.9, 0.9);
      snout.rotation.x = Math.PI / 2;
      group.add(snout);

      // Red visor
      const visorGeo = new THREE.BoxGeometry(0.6, 0.15, 0.1);
      const visorMat = new THREE.MeshBasicMaterial({ color: accentColor });
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 1.1, 0.55);
      group.add(visor);
    } else if (unit.type === 'trooper') {
      // Medium infantry with rifle
      const bodyGeo = new THREE.BoxGeometry(1, 1.2, 0.8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.5, flatShading: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);

      // Head
      const headGeo = new THREE.SphereGeometry(0.4, 6, 6);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.y = 1.9;
      head.castShadow = true;
      group.add(head);

      // Red stripes
      const stripeGeo = new THREE.BoxGeometry(1.05, 0.15, 0.85);
      const stripeMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, flatShading: true });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.7;
      group.add(stripe);

      // Rifle barrel
      const barrelGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, flatShading: true });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(0.6, 1.2, 0.5);
      barrel.rotation.x = Math.PI / 2;
      group.add(barrel);
    } else if (unit.type === 'support') {
      // Small medic with cross emblem
      const bodyGeo = new THREE.BoxGeometry(0.9, 1, 0.7);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.4, flatShading: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.9;
      body.castShadow = true;
      group.add(body);

      const headGeo = new THREE.SphereGeometry(0.35, 6, 6);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.y = 1.75;
      group.add(head);

      // Red cross
      const crossMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      const ch1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.01), crossMat);
      ch1.position.set(0, 1, 0.36);
      group.add(ch1);
      const ch2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.01), crossMat);
      ch2.position.set(0, 1, 0.36);
      group.add(ch2);
    } else if (unit.type === 'cannon') {
      // Heavy walker — big body, large cannon
      const bodyGeo = new THREE.BoxGeometry(2, 1.5, 1.8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.6, flatShading: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.5;
      body.castShadow = true;
      group.add(body);

      // Treads
      for (let side of [-1, 1]) {
        const treadGeo = new THREE.BoxGeometry(0.4, 0.6, 2);
        const tread = new THREE.Mesh(treadGeo, bodyMat);
        tread.position.set(side * 1.2, 0.3, 0);
        group.add(tread);
      }

      // Big cannon
      const cannonGeo = new THREE.CylinderGeometry(0.2, 0.3, 2.5, 8);
      const cannonMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4, metalness: 0.7, flatShading: true });
      const cannon = new THREE.Mesh(cannonGeo, cannonMat);
      cannon.position.set(0, 2.2, 1.5);
      cannon.rotation.x = Math.PI / 2;
      group.add(cannon);
    } else if (unit.type === 'artillery') {
      // Self-propelled howitzer
      const bodyGeo = new THREE.BoxGeometry(2.2, 1.2, 2);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.5, flatShading: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);

      // Howitzer barrel (angled up)
      const barrelGeo = new THREE.CylinderGeometry(0.15, 0.25, 3, 8);
      const barrelMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.3, metalness: 0.8, flatShading: true });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(0, 2.5, 0.5);
      barrel.rotation.x = Math.PI / 4;
      group.add(barrel);
    } else {
      // Fallback
      const geo = new THREE.BoxGeometry(1, 1.5, 1);
      const mat = new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.75;
      mesh.castShadow = true;
      group.add(mesh);
    }
  },

  // Build a building mesh from primitives
  buildBuildingMesh(building, group) {
    const isPlayer = building.team === 0;
    const primary = isPlayer ? 0x555566 : 0x665555;
    const accent = isPlayer ? 0xcc2233 : 0xaa3322;

    const mat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.7, metalness: 0.4, flatShading: true });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.5, flatShading: true });

    if (building.type === 'command_center') {
      // Large fortified base building
      const baseGeo = new THREE.BoxGeometry(8, 3, 8);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1.5;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Roof
      const roofGeo = new THREE.ConeGeometry(6, 2, 4);
      const roof = new THREE.Mesh(roofGeo, accentMat);
      roof.position.y = 4;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);

      // Red stripe
      const stripeGeo = new THREE.BoxGeometry(8.1, 0.4, 8.1);
      const stripe = new THREE.Mesh(stripeGeo, accentMat);
      stripe.position.y = 0.8;
      group.add(stripe);
    } else if (building.type === 'barracks') {
      // Workshop-style building
      const baseGeo = new THREE.BoxGeometry(6, 3.5, 5);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1.75;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Door
      const doorGeo = new THREE.BoxGeometry(1.5, 2, 0.2);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true });
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(0, 1, 2.6);
      group.add(door);

      // Accent stripe
      const stripeGeo = new THREE.BoxGeometry(6.1, 0.3, 5.1);
      const stripe = new THREE.Mesh(stripeGeo, accentMat);
      stripe.position.y = 2.8;
      group.add(stripe);
    } else if (building.type === 'siege_factory') {
      // Heavy industrial building
      const baseGeo = new THREE.BoxGeometry(7, 4, 6);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 2;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Chimneys
      for (let i = -1; i <= 1; i += 2) {
        const chimGeo = new THREE.CylinderGeometry(0.4, 0.5, 3, 6);
        const chim = new THREE.Mesh(chimGeo, accentMat);
        chim.position.set(i * 2, 5.5, -1);
        chim.castShadow = true;
        group.add(chim);
      }
    } else if (building.type === 'gas_mining') {
      // Drill rig
      const baseGeo = new THREE.BoxGeometry(4, 1.5, 4);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 0.75;
      base.castShadow = true;
      group.add(base);

      // Drill tower
      const towerGeo = new THREE.CylinderGeometry(0.3, 0.5, 5, 6);
      const tower = new THREE.Mesh(towerGeo, accentMat);
      tower.position.y = 3;
      tower.castShadow = true;
      group.add(tower);

      // Drill bit
      const drillGeo = new THREE.ConeGeometry(0.6, 1.5, 6);
      const drill = new THREE.Mesh(drillGeo, accentMat);
      drill.position.y = 0.3;
      group.add(drill);
    }
  }
};