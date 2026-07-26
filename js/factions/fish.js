import * as THREE from 'three';

/**
 * FACTION: Cyborg Fish (Abyssal Trident)
 * Identity: Tanky, armored, slow but durable (humanoid/amphibious)
 * Palette: Teal + bio-luminescent cyan accents
 * Playstyle: Turtle/defend, late-game power
 */

export const FACTION_FISH = {
  name: 'Abyssal Trident',
  subtitle: 'Cyborg Fish',
  primaryColor: 0x226655,
  secondaryColor: 0x00ffcc,
  accentColor: 0x33ffdd,

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
    command_center: { hp: 700, sight: 75, damage: 12, range: 28, cooldown: 1.8, cost: { diamonds: 0, biogas: 0 }, buildTime: 0 },
    barracks: { hp: 450, sight: 55, cost: { diamonds: 120, biogas: 10 }, buildTime: 10 },
    siege_factory: { hp: 550, sight: 60, damage: 30, range: 38, cooldown: 2.5, cost: { diamonds: 160, biogas: 35 }, buildTime: 13 },
    gas_mining: { hp: 280, sight: 45, cost: { diamonds: 90, biogas: 0 }, buildTime: 6 }
  },

  units: {
    harvester: {
      name: 'Abyss Diver',
      hp: 80, damage: 6, speed: 25, sight: 35, range: 3, cooldown: 1.5,
      cost: { diamonds: 50, biogas: 0 }, buildTime: 3
    },
    scout: {
      name: 'Eel Runner',
      hp: 55, damage: 7, speed: 40, sight: 50, range: 0, cooldown: 1,
      cost: { diamonds: 40, biogas: 0 }, buildTime: 2
    },
    trooper: {
      name: 'Shell Trooper',
      hp: 110, damage: 14, speed: 22, sight: 45, range: 12, cooldown: 1.4,
      cost: { diamonds: 70, biogas: 0 }, buildTime: 3
    },
    support: {
      name: 'Coral Shield',
      hp: 130, damage: 4, speed: 18, sight: 50, range: 10, cooldown: 2,
      cost: { diamonds: 65, biogas: 0 }, buildTime: 3
    },
    cannon: {
      name: 'Tidal Fortress',
      hp: 280, damage: 30, speed: 14, sight: 55, range: 22, cooldown: 2.5,
      cost: { diamonds: 170, biogas: 40 }, buildTime: 6
    },
    artillery: {
      name: 'Abyss Howitzer',
      hp: 250, damage: 45, speed: 10, sight: 65, range: 38, cooldown: 3.5,
      cost: { diamonds: 220, biogas: 60 }, buildTime: 8
    }
  },

  buildUnitMesh(unit, group) {
    const isPlayer = unit.team === 0;
    const bodyColor = isPlayer ? 0x226655 : 0x553333;
    const accentColor = isPlayer ? 0x00ffcc : 0xff6644;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.4, flatShading: true });
    const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.6, flatShading: true });

    if (unit.type === 'harvester') {
      // Bulky diver with collection tank
      const bodyGeo = new THREE.CapsuleGeometry(0.7, 1.2, 4, 8);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      group.add(body);

      // Helmet
      const helmGeo = new THREE.SphereGeometry(0.5, 8, 6);
      const helm = new THREE.Mesh(helmGeo, bodyMat);
      helm.position.set(0, 1.5, 0.4);
      group.add(helm);

      // Visor
      const visorGeo = new THREE.BoxGeometry(0.5, 0.2, 0.1);
      const visor = new THREE.Mesh(visorGeo, accentMat);
      visor.position.set(0, 1.55, 0.85);
      group.add(visor);

      // Collection tank on back
      const tankGeo = new THREE.CylinderGeometry(0.4, 0.4, 1, 6);
      const tank = new THREE.Mesh(tankGeo, accentMat);
      tank.position.set(0, 1.5, -0.5);
      group.add(tank);
    } else if (unit.type === 'scout') {
      // Eel-like, slender
      const bodyGeo = new THREE.CapsuleGeometry(0.3, 1.2, 4, 6);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.7;
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      group.add(body);

      // Fins
      for (let side of [-1, 1]) {
        const finGeo = new THREE.ConeGeometry(0.15, 0.6, 3);
        const fin = new THREE.Mesh(finGeo, accentMat);
        fin.position.set(side * 0.4, 0.9, 0);
        fin.rotation.z = side * 0.5;
        group.add(fin);
      }

      // Glowing eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: accentColor });
      for (let side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 4, 4), eyeMat);
        eye.position.set(side * 0.12, 0.85, 0.6);
        group.add(eye);
      }
    } else if (unit.type === 'trooper') {
      // Heavily armored infantry
      const bodyGeo = new THREE.BoxGeometry(1.2, 1.4, 0.9);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);

      // Shell/armor plates
      const plateGeo = new THREE.BoxGeometry(1.25, 0.5, 0.95);
      const plate = new THREE.Mesh(plateGeo, accentMat);
      plate.position.y = 1.5;
      group.add(plate);

      // Helmet
      const helmGeo = new THREE.SphereGeometry(0.4, 6, 6);
      const helm = new THREE.Mesh(helmGeo, bodyMat);
      helm.position.y = 2.1;
      group.add(helm);

      // Cyan visor
      const visorGeo = new THREE.BoxGeometry(0.6, 0.1, 0.1);
      const visor = new THREE.Mesh(visorGeo, accentMat);
      visor.position.set(0, 2.1, 0.35);
      group.add(visor);
    } else if (unit.type === 'support') {
      // Coral Shield — round, defensive
      const bodyGeo = new THREE.SphereGeometry(0.7, 8, 6);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);

      // Shield
      const shieldGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.15, 8);
      const shield = new THREE.Mesh(shieldGeo, accentMat);
      shield.position.set(0.8, 1.2, 0);
      shield.rotation.z = Math.PI / 2;
      group.add(shield);

      // Helmet
      const helmGeo = new THREE.SphereGeometry(0.35, 6, 6);
      const helm = new THREE.Mesh(helmGeo, bodyMat);
      helm.position.set(0, 1.8, 0);
      group.add(helm);
    } else if (unit.type === 'cannon') {
      // Tidal Fortress — massive, boxy
      const bodyGeo = new THREE.BoxGeometry(2.5, 2, 2.5);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.5;
      body.castShadow = true;
      group.add(body);

      // Armor plates
      for (let side of [-1, 1]) {
        const plateGeo = new THREE.BoxGeometry(0.3, 1.5, 2.6);
        const plate = new THREE.Mesh(plateGeo, accentMat);
        plate.position.set(side * 1.4, 1.5, 0);
        group.add(plate);
      }

      // Turret
      const turretGeo = new THREE.CylinderGeometry(0.6, 0.8, 1, 8);
      const turret = new THREE.Mesh(turretGeo, accentMat);
      turret.position.y = 3;
      group.add(turret);

      // Cannon barrel
      const barrelGeo = new THREE.CylinderGeometry(0.15, 0.2, 2, 6);
      const barrel = new THREE.Mesh(barrelGeo, accentMat);
      barrel.position.set(0, 3, 1.5);
      barrel.rotation.x = Math.PI / 2;
      group.add(barrel);
    } else if (unit.type === 'artillery') {
      // Abyss Howitzer — heavy, low profile
      const bodyGeo = new THREE.BoxGeometry(2.5, 1.5, 2.5);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);

      // Rotating base
      const baseGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.5, 8);
      const base = new THREE.Mesh(baseGeo, accentMat);
      base.position.y = 1.75;
      group.add(base);

      // Howitzer barrel
      const barrelGeo = new THREE.CylinderGeometry(0.15, 0.25, 3, 8);
      const barrel = new THREE.Mesh(barrelGeo, accentMat);
      barrel.position.set(0, 2.8, 0.5);
      barrel.rotation.x = Math.PI / 3.5;
      group.add(barrel);
    } else {
      const geo = new THREE.BoxGeometry(1, 1.5, 1);
      const mat = new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.75;
      mesh.castShadow = true;
      group.add(mesh);
    }
  },

  buildBuildingMesh(building, group) {
    const isPlayer = building.team === 0;
    const primary = isPlayer ? 0x226655 : 0x553333;
    const accent = isPlayer ? 0x00ffcc : 0xff6644;

    const mat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.7, metalness: 0.3, flatShading: true });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.5, flatShading: true });

    if (building.type === 'command_center') {
      // Fortress-style base
      const baseGeo = new THREE.BoxGeometry(9, 3.5, 9);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1.75;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Corner turrets
      for (let ix of [-1, 1]) {
        for (let iz of [-1, 1]) {
          const turretGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 6);
          const turret = new THREE.Mesh(turretGeo, accentMat);
          turret.position.set(ix * 4, 4.5, iz * 4);
          turret.castShadow = true;
          group.add(turret);
        }
      }

      // Cyan glow base
      const glowGeo = new THREE.BoxGeometry(9.1, 0.3, 9.1);
      const glow = new THREE.Mesh(glowGeo, accentMat);
      glow.position.y = 0.15;
      group.add(glow);
    } else if (building.type === 'barracks') {
      // Armored barracks
      const baseGeo = new THREE.BoxGeometry(6, 3.5, 5);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1.75;
      base.castShadow = true;
      group.add(base);

      // Reinforced door
      const doorGeo = new THREE.BoxGeometry(1.8, 2.2, 0.3);
      const door = new THREE.Mesh(doorGeo, accentMat);
      door.position.set(0, 1.1, 2.6);
      group.add(door);
    } else if (building.type === 'siege_factory') {
      // Armory
      const baseGeo = new THREE.BoxGeometry(7, 4.5, 6);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 2.25;
      base.castShadow = true;
      group.add(base);

      // Heavy blast doors
      for (let side of [-1, 1]) {
        const doorGeo = new THREE.BoxGeometry(0.2, 3, 3);
        const door = new THREE.Mesh(doorGeo, accentMat);
        door.position.set(side * 3.6, 2, 0);
        group.add(door);
      }
    } else if (building.type === 'gas_mining') {
      // Submersible pump
      const baseGeo = new THREE.CylinderGeometry(2.5, 3, 2, 8);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = 1;
      base.castShadow = true;
      group.add(base);

      // Pump shaft
      const shaftGeo = new THREE.CylinderGeometry(0.4, 0.4, 4, 6);
      const shaft = new THREE.Mesh(shaftGeo, accentMat);
      shaft.position.y = 3;
      group.add(shaft);

      // Pump head
      const headGeo = new THREE.SphereGeometry(0.6, 8, 6);
      const head = new THREE.Mesh(headGeo, accentMat);
      head.position.y = 5.2;
      group.add(head);
    }
  }
};