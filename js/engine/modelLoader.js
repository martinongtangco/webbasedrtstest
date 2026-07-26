import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * ADR-18: Model loader for glTF models.
 *
 * Loads .glb/.gltf models with Draco compression support.
 * Falls back to placeholder geometry on failure.
 *
 * Usage:
 *   const model = await loadModel('/models/unit.glb');
 *   scene.add(model);
 */

let gltfLoader = null;
let dracoLoader = null;

/**
 * Lazy-init the GLTFLoader with Draco decoder.
 * @returns {GLTFLoader}
 */
function getLoader() {
  if (!gltfLoader) {
    gltfLoader = new GLTFLoader();

    // Draco decoder for compressed models
    try {
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
      gltfLoader.setDRACOLoader(dracoLoader);
    } catch (e) {
      // Draco not available — continue without it
    }
  }
  return gltfLoader;
}

/**
 * Load a glTF/glB model from a URL.
 * @param {string} url - Path to the .glb or .gltf file
 * @param {object} [options]
 * @param {boolean} [options.castShadow=true] - Enable shadow casting
 * @param {boolean} [options.receiveShadow=true] - Enable shadow receiving
 * @param {number} [options.scale=1] - Uniform scale factor
 * @param {THREE.Color} [options.color] - Override material color
 * @returns {Promise<THREE.Group>}
 */
export function loadModel(url, options = {}) {
  const {
    castShadow = true,
    receiveShadow = true,
    scale = 1,
    color = null
  } = options;

  return new Promise((resolve, reject) => {
    const loader = getLoader();
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);

        // Configure meshes
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = castShadow;
            child.receiveShadow = receiveShadow;
            if (color) {
              child.material = child.material.clone();
              child.material.color.set(color);
            }
          }
        });

        resolve(model);
      },
      undefined, // progress callback (optional)
      (error) => {
        reject(new Error(`Failed to load model ${url}: ${error.message}`));
      }
    );
  });
}

/**
 * Create a placeholder geometry when model loading fails.
 * @param {string} type - Entity type hint ('unit', 'building')
 * @param {number} team - Team index for color
 * @param {number} [scale=1]
 * @returns {THREE.Group}
 */
export function createPlaceholder(type, team, scale = 1) {
  const group = new THREE.Group();
  const color = team === 0 ? 0x4488ff : 0xff4444;

  if (type === 'building') {
    const geo = new THREE.BoxGeometry(4 * scale, 3 * scale, 4 * scale);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.7, metalness: 0.3, flatShading: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.5 * scale;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  } else {
    const geo = new THREE.CapsuleGeometry(0.8 * scale, 1.5 * scale, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.6, metalness: 0.3, flatShading: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.2 * scale;
    mesh.castShadow = true;
    group.add(mesh);
  }

  return group;
}

// ── Faction model registry ─────────────────────────────────────────────

/**
 * Registry of model paths per faction and entity type.
 * Each faction can define model paths in its definition file.
 * Format: { faction: { entityType: '/path/to/model.glb' } }
 *
 * Models are expected in a `models/` directory at project root.
 */
const MODEL_REGISTRY = {};

/**
 * Register models for a faction.
 * @param {string} factionKey - Faction identifier (e.g. 'dogs')
 * @param {object} models - { units: { type: path }, buildings: { type: path } }
 */
export function registerFactionModels(factionKey, models) {
  MODEL_REGISTRY[factionKey] = models;
}

/**
 * Get model path for a specific entity.
 * @param {string} factionKey
 * @param {'units'|'buildings'} category
 * @param {string} type - Entity type
 * @returns {string|null}
 */
export function getModelPath(factionKey, category, type) {
  const faction = MODEL_REGISTRY[factionKey];
  if (!faction || !faction[category]) return null;
  return faction[category][type] || null;
}

/**
 * Check if any models are registered (used to determine if glTF loading is active).
 * @returns {boolean}
 */
export function hasModels() {
  return Object.keys(MODEL_REGISTRY).length > 0;
}

/**
 * Enable glTF model loading with a base path prefix.
 * When enabled, faction definitions can reference models relative to this path.
 * @param {string} basePath - Base URL for model files (e.g. '/models/')
 */
export function setModelBasePath(basePath) {
  window.__MODEL_BASE_PATH = basePath;
}

/**
 * Get the base path for model files.
 * @returns {string}
 */
export function getModelBasePath() {
  return window.__MODEL_BASE_PATH || '/models/';
}
