import * as THREE from 'three';

/**
 * Resource nodes on the map:
 * - Diamond deposits (Rare Earth Diamonds): crystal clusters
 * - Gas vents: secondary resource, requires Gas Mining building
 */

let _resourceIdCounter = 0;

export class ResourceNode {
  constructor(type, x, z, amount) {
    this.id = ++_resourceIdCounter;
    this.type = type; // 'diamond' | 'gas'
    this.x = x;
    this.z = z;
    this.amount = amount;
    this.maxAmount = amount;
    this.amountPerGather = type === 'diamond' ? 15 : 10;
    this.alive = true;

    // Mesh
    this.mesh = null;
    this.sparkleTimer = 0;
  }

  createMesh() {
    const group = new THREE.Group();

    if (this.type === 'diamond') {
      // Crystal cluster — multiple octahedra
      const mat = new THREE.MeshStandardMaterial({
        color: 0x00d4ff,
        roughness: 0.1,
        metalness: 0.8,
        flatShading: true,
        emissive: 0x003355,
        emissiveIntensity: 0.3
      });

      const sizes = [
        { s: 1.2, ox: 0, oz: 0 },
        { s: 0.7, ox: 1, oz: 0.5 },
        { s: 0.6, ox: -0.8, oz: -0.5 },
        { s: 0.5, ox: 0.3, oz: -1 },
        { s: 0.8, ox: -0.5, oz: 1 }
      ];

      for (const { s, ox, oz } of sizes) {
        const geo = new THREE.OctahedronGeometry(s, 0);
        const crystal = new THREE.Mesh(geo, mat);
        crystal.position.set(ox, s * 0.8, oz);
        crystal.rotation.y = Math.random() * Math.PI;
        crystal.castShadow = true;
        group.add(crystal);
      }
    } else {
      // Gas vent — dark vent with purple glow
      const ventMat = new THREE.MeshStandardMaterial({
        color: 0x221133,
        roughness: 0.5,
        metalness: 0.3
      });

      const ventGeo = new THREE.CylinderGeometry(1.5, 2, 1, 8);
      const vent = new THREE.Mesh(ventGeo, ventMat);
      vent.position.y = 0.5;
      vent.receiveShadow = true;
      group.add(vent);

      // Purple gas cloud (semi-transparent)
      const gasMat = new THREE.MeshStandardMaterial({
        color: 0xbf5fff,
        transparent: true,
        opacity: 0.4,
        emissive: 0x6622aa,
        emissiveIntensity: 0.5,
        flatShading: true
      });

      for (let i = 0; i < 3; i++) {
        const gasGeo = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 6, 6);
        const gas = new THREE.Mesh(gasGeo, gasMat);
        gas.position.set(
          (Math.random() - 0.5) * 1.5,
          1.5 + Math.random() * 1,
          (Math.random() - 0.5) * 1.5
        );
        gas.userData.floatOffset = Math.random() * Math.PI * 2;
        gas.userData.floatSpeed = 0.5 + Math.random() * 0.5;
        group.add(gas);
      }
    }

    group.position.set(this.x, 0, this.z);
    this.mesh = group;
    return group;
  }

  /**
   * Update sparkle/float animation
   */
  update(dt, time) {
    if (this.mesh) {
      if (this.type === 'diamond') {
        // Subtle pulse
        const pulse = 1 + Math.sin(time * 2) * 0.05;
        this.mesh.scale.set(pulse, pulse, pulse);
      } else {
        // Float gas clouds
        for (const child of this.mesh.children) {
          if (child.userData.floatOffset !== undefined) {
            child.position.y += Math.sin(time * child.userData.floatSpeed + child.userData.floatOffset) * 0.002;
          }
        }
      }
    }

    // Update visual when depleted
    if (this.amount <= 0) {
      this.alive = false;
    }
  }

  syncMesh() {
    if (this.mesh) {
      // Fade as resource depletes
      const pct = this.amount / this.maxAmount;
      this.mesh.visible = this.alive && pct > 0;
      if (this.alive) {
        for (const child of this.mesh.children) {
          if (child.material) {
            if (this.type === 'diamond') {
              child.material.opacity = pct;
              child.material.transparent = pct < 1;
            }
          }
        }
      }
    }
  }
}

/**
 * Generate resource nodes for the map
 * @param {number} mapSize
 * @param {number} worldHalfSize
 * @returns {ResourceNode[]}
 */
export function generateResources(mapSize, worldHalfSize) {
  const nodes = [];
  const tileSize = 4;

  // Diamond deposits — 6 clusters scattered on the map
  const diamondPositions = [
    { gx: 15, gy: 15 }, { gx: 45, gy: 10 }, { gx: 75, gy: 15 },
    { gx: 15, gy: 75 }, { gx: 45, gy: 85 }, { gx: 75, gy: 75 },
    { gx: 30, gy: 48 }, { gx: 65, gy: 48 }
  ];

  for (const pos of diamondPositions) {
    const wx = pos.gx * tileSize + tileSize / 2 - worldHalfSize;
    const wz = pos.gy * tileSize + tileSize / 2 - worldHalfSize;
    nodes.push(new ResourceNode('diamond', wx, wz, 600));
  }

  // Gas vents — 4 vents
  const gasPositions = [
    { gx: 25, gy: 25 }, { gx: 70, gy: 20 },
    { gx: 20, gy: 70 }, { gx: 72, gy: 72 }
  ];

  for (const pos of gasPositions) {
    const wx = pos.gx * tileSize + tileSize / 2 - worldHalfSize;
    const wz = pos.gy * tileSize + tileSize / 2 - worldHalfSize;
    nodes.push(new ResourceNode('gas', wx, wz, 9999)); // infinite
  }

  return nodes;
}

export function resetResourceIds() {
  _resourceIdCounter = 0;
}