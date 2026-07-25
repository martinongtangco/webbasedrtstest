import * as THREE from 'three';
import { IsometricCamera } from './engine/camera.js';
import { InputManager } from './engine/input.js';
import { worldToGrid, gridToWorld } from './engine/pathfinding.js';
import { FogOfWar } from './engine/fogOfWar.js';
import { Unit, resetUnitIds } from './entities/units.js';
import { Building, resetBuildingIds } from './entities/buildings.js';
import { ResourceNode, generateResources, resetResourceIds } from './entities/resources.js';
import { FACTION_DOGS } from './factions/dogs.js';
import { SkirmishAI } from './ai/skirmishAI.js';
import { HUD } from './ui/hud.js';
import { SFX } from './audio/sfx.js';
import { Music } from './audio/music.js';

// ── Constants ──────────────────────────────────────────────────────────
const MAP_SIZE = 96;
const TILE_SIZE = 4;
const WORLD_SIZE = MAP_SIZE * TILE_SIZE;
const WORLD_HALF = WORLD_SIZE / 2;

// ── Globals ────────────────────────────────────────────────────────────
let scene, renderer, camera, input;
let clock = new THREE.Clock();
let gameState = 'menu';
let gameMode = null;

// Game objects
let units = [];
let buildings = [];
let resources = [];
let pathGrid = { blocked: new Set(), width: MAP_SIZE, height: MAP_SIZE };

// Player state
let playerDiamonds = 300;
let playerBiogas = 0;
let playerFaction = FACTION_DOGS;
let selectedBuilding = null;

// Systems
let hud, sfx, music, ai;
let fogPlayer, fogEnemy;

// Selection overlay
let selectionCanvas, selectionCtx;

// Death particles
let particles = [];

// DOM
const mainMenuEl = document.getElementById('main-menu');
const hudEl = document.getElementById('hud');
const gameOverEl = document.getElementById('game-over');
const gameOverTitle = document.getElementById('game-over-title');
const btnSkirmish = document.getElementById('btn-skirmish');
const btnHost = document.getElementById('btn-host');
const btnJoin = document.getElementById('btn-join');
const btnConnect = document.getElementById('btn-connect');
const btnMenu = document.getElementById('btn-menu');
const joinPanel = document.getElementById('join-panel');
const hostIpInput = document.getElementById('host-ip');

// ── Init ───────────────────────────────────────────────────────────────
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
   scene.fog = new THREE.Fog(0x1a1a2e, 550, 800);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('game-canvas').appendChild(renderer.domElement);

  camera = new IsometricCamera(scene, window.innerWidth, window.innerHeight, {
    initialDistance: 220, pitchAngle: THREE.MathUtils.degToRad(50),
    yawAngle: THREE.MathUtils.degToRad(-45), minZoom: 70, maxZoom: 400
  });
  camera.setLookTarget(new THREE.Vector3(0, 0, 0));
  scene.add(camera.camera);

  input = new InputManager(renderer, camera);

  selectionCanvas = document.createElement('canvas');
  selectionCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:40;';
  selectionCanvas.width = window.innerWidth;
  selectionCanvas.height = window.innerHeight;
  selectionCtx = selectionCanvas.getContext('2d');
  document.body.appendChild(selectionCanvas);

  buildScene();
  setupMenuEvents();
  window.addEventListener('resize', onResize);

  // Produce unit event
  window.addEventListener('produce_unit', onProduceUnit);

  // Minimap click → jump camera
  window.addEventListener('minimap_click', onMinimapClick);

  // Init audio
  sfx = new SFX();
  music = new Music();

  animate();
}

function buildScene() {
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
  dirLight.position.set(WORLD_HALF * 0.6, WORLD_HALF, WORLD_HALF * 0.4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -WORLD_HALF;
  dirLight.shadow.camera.right = WORLD_HALF;
  dirLight.shadow.camera.top = WORLD_HALF;
  dirLight.shadow.camera.bottom = -WORLD_HALF;
  dirLight.shadow.camera.near = 10;
  dirLight.shadow.camera.far = WORLD_SIZE * 1.5;
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);

  scene.add(new THREE.HemisphereLight(0x8899bb, 0x445533, 0.4));
  createGround();
}

function createGround() {
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 64, 64);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), z = posAttr.getZ(i);
    posAttr.setY(i, Math.sin(x * 0.02) * Math.cos(z * 0.02) * 0.5 + Math.sin(x * 0.05 + z * 0.03) * 0.3);
  }
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    color: 0x3a5a3a, roughness: 0.95, metalness: 0.05
  }));
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // Border walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8, metalness: 0.2 });
  const wh = 6;
  [[WORLD_SIZE, wh, 1, 0, wh/2, -WORLD_HALF], [WORLD_SIZE, wh, 1, 0, wh/2, WORLD_HALF],
   [1, wh, WORLD_SIZE, -WORLD_HALF, wh/2, 0], [1, wh, WORLD_SIZE, WORLD_HALF, wh/2, 0]].forEach(([sx,sy,sz,px,py,pz]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), wallMat);
    wall.position.set(px,py,pz); wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);
  });

  const gridHelper = new THREE.GridHelper(WORLD_SIZE, MAP_SIZE, 0x4a6a4a, 0x2a4a2a);
  gridHelper.position.y = 0.05;
  gridHelper.material.opacity = 0.15;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);
}

// ── Menu ───────────────────────────────────────────────────────────────
function setupMenuEvents() {
  btnSkirmish.addEventListener('click', () => startGame('skirmish'));
  btnHost.addEventListener('click', () => startGame('host'));
  btnJoin.addEventListener('click', () => joinPanel.classList.toggle('hidden'));
  btnConnect.addEventListener('click', () => {
    const ip = hostIpInput.value.trim();
    if (ip) startGame('guest', { hostIp: ip });
  });
  btnMenu.addEventListener('click', returnToMenu);
}

// ── Game Start/End ─────────────────────────────────────────────────────
function startGame(mode, opts = {}) {
  // Init audio on user gesture
  sfx.init();
  music.init();
  music.start();

  gameMode = mode;
  gameState = 'playing';
  mainMenuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  joinPanel.classList.add('hidden');

  // Reset
  resetUnitIds(); resetBuildingIds(); resetResourceIds();
  units = []; buildings = []; resources = []; particles = [];
  pathGrid.blocked.clear();
  playerDiamonds = 300;
  playerBiogas = 0;
  selectedBuilding = null;

  // HUD
  hud = new HUD();

  // Fog of war
  fogPlayer = new FogOfWar(MAP_SIZE, 0);
  fogEnemy = new FogOfWar(MAP_SIZE, 1);

  // Generate resources
  resources = generateResources(MAP_SIZE, WORLD_HALF);
  for (const r of resources) {
    const mesh = r.createMesh();
    scene.add(mesh);
    // Block resource tiles
    const g = worldToGrid(r.x, r.z, TILE_SIZE, WORLD_HALF);
    pathGrid.blocked.add(`${g.x},${g.y}`);
  }

  // Place player base (team 0) — bottom-left quadrant
  const playerBaseX = -WORLD_HALF + 60;
  const playerBaseZ = WORLD_HALF - 60;
  spawnBuilding('command_center', 'dogs', playerBaseX, playerBaseZ, 0);

  // Place enemy base (team 1) — top-right quadrant
  const enemyBaseX = WORLD_HALF - 60;
  const enemyBaseZ = -WORLD_HALF + 60;
  spawnBuilding('command_center', 'dogs', enemyBaseX, enemyBaseZ, 1);

  // Center camera on player base
  camera.setLookTarget(new THREE.Vector3(playerBaseX, 0, playerBaseZ));

  // AI
  if (mode === 'skirmish') {
    ai = new SkirmishAI({
      units, buildings, resources, tileSize: TILE_SIZE, worldHalfSize: WORLD_HALF, fog: fogEnemy
    });
  }

  // Spawn initial harvesters
  setTimeout(() => {
    const cc = buildings.find(b => b.team === 0 && b.type === 'command_center' && b.alive);
    if (cc) spawnUnit('harvester', 'dogs', cc.x + 8, cc.z + 5, 0);
    setTimeout(() => {
      if (cc && cc.alive) spawnUnit('harvester', 'dogs', cc.x + 8, cc.z - 5, 0);
    }, 1000);
  }, 500);
}

function returnToMenu() {
  gameState = 'menu';
  gameMode = null;
  mainMenuEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  gameOverEl.classList.add('hidden');
  gameOverEl.classList.remove('victory', 'defeat');
  music.stop();

  // Remove all game objects from scene
  for (const u of units) if (u.mesh) scene.remove(u.mesh);
  for (const b of buildings) if (b.mesh) scene.remove(b.mesh);
  for (const r of resources) if (r.mesh) scene.remove(r.mesh);
  for (const p of particles) if (p.mesh) scene.remove(p.mesh);
  units = []; buildings = []; resources = []; particles = [];

  camera.setLookTarget(new THREE.Vector3(0, 0, 0));
}

function endGame(victory) {
  gameState = 'gameover';
  gameOverEl.classList.remove('hidden');
  gameOverEl.classList.add(victory ? 'victory' : 'defeat');
  gameOverTitle.textContent = victory ? 'VICTORY' : 'DEFEAT';
  music.stop();
}

// ── Spawning ───────────────────────────────────────────────────────────
function spawnUnit(type, faction, x, z, team) {
  const factionKey = faction;
  const factionDef = factionKey === 'dogs' ? FACTION_DOGS : FACTION_DOGS;
  const unitDef = factionDef.units[type];
  if (!unitDef) return null;

  const unit = new Unit(type, faction, x, z, team);
  unit.setStats(unitDef);
  unit.name = unitDef.name;
  const mesh = unit.createMesh(factionDef);
  scene.add(mesh);
  units.push(unit);
  return unit;
}

function spawnBuilding(type, faction, x, z, team) {
  const factionDef = faction === 'dogs' ? FACTION_DOGS : FACTION_DOGS;
  const buildDef = factionDef.buildings[type];

  const building = new Building(type, faction, x, z, team);
  building.setStats(buildDef || {});
  building.factionDef = factionDef;
  const mesh = building.createMesh(factionDef);
  scene.add(mesh);
  buildings.push(building);

  // Block pathfinding grid for building footprint
  const g = worldToGrid(x, z, TILE_SIZE, WORLD_HALF);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      pathGrid.blocked.add(`${g.x+dx},${g.y+dy}`);

  return building;
}

// Expose spawnBuilding to AI
window.spawnBuilding = spawnBuilding;

// ── Production ─────────────────────────────────────────────────────────
function onProduceUnit(e) {
  const { buildingId, unitType } = e.detail;
  const building = buildings.find(b => b.id === buildingId && b.alive);
  if (!building) return;

  const factionDef = playerFaction;
  const unitDef = factionDef.units[unitType];
  if (!unitDef) return;

  if (playerDiamonds < unitDef.cost.diamonds || playerBiogas < (unitDef.cost.biogas || 0)) return;

  playerDiamonds -= unitDef.cost.diamonds;
  playerBiogas -= (unitDef.cost.biogas || 0);

  building.queueProduction(unitType);
  sfx.play('build');
}

function updateProduction() {
  for (const b of buildings) {
    if (!b.alive || b.productionQueue.length === 0) continue;
    b.productionTimer += 1/60;
    const current = b.productionQueue[0];
    const factionDef = b.factionDef || playerFaction;
    const unitDef = factionDef.units[current];
    const buildTime = unitDef ? unitDef.buildTime : 3;

    if (b.productionTimer >= buildTime) {
      b.productionTimer = 0;
      b.productionQueue.shift();
      // Spawn unit near building
      spawnUnit(current, b.faction, b.x + (Math.random()-0.5)*10, b.z + 8, b.team);
      if (b.team === 0) sfx.play('build');
    }
  }
}

// ── Input Handling ─────────────────────────────────────────────────────
function handleInput() {
  const leftClick = input.getLeftClick();
  const rightClick = input.getRightClick();
  const selBox = input.getSelectionBox();

  // Left click / box select
  if (leftClick && leftClick.world) {
    const wx = leftClick.world.x, wz = leftClick.world.z;

    // Check buildings first
    let clickedBuilding = null;
    for (const b of buildings) {
      if (!b.alive || b.team !== 0) continue;
      if (b.containsPoint(wx, wz, 2)) { clickedBuilding = b; break; }
    }

    if (clickedBuilding) {
      // Select building
      for (const u of units) if (u.team === 0) u.selected = false;
      for (const b of buildings) b.selected = false;
      clickedBuilding.selected = true;
      selectedBuilding = clickedBuilding;
      hud.showUnitInfo(clickedBuilding);
      hud.showBuildMenu(clickedBuilding, playerFaction, playerDiamonds, playerBiogas);
      sfx.play('select');
    } else {
      // Select units
      for (const u of units) u.selected = false;
      selectedBuilding = null;
      hud.hideBuildMenu();

      let selected = false;
      for (const u of units) {
        if (!u.alive || u.team !== 0) continue;
        if (u.containsPoint(wx, wz, 2)) {
          u.selected = true;
          selected = true;
        }
      }

      if (selected) {
        const sel = units.find(u => u.alive && u.selected && u.team === 0);
        hud.showUnitInfo(sel);
        sfx.play('select');
      } else {
        hud.hideUnitInfo();
      }
    }
  }

  // Selection box
  if (selBox) {
    for (const u of units) {
      if (!u.alive || u.team !== 0) continue;
      u.selected = u.insideBox(selBox.min.x, selBox.min.z, selBox.max.x, selBox.max.z);
    }
    for (const b of buildings) b.selected = false;
    selectedBuilding = null;
    hud.hideBuildMenu();
    const sel = units.find(u => u.alive && u.selected && u.team === 0);
    hud.showUnitInfo(sel);
    sfx.play('select');
  }

  // Right click — move / attack / gather
  if (rightClick && rightClick.world) {
    const wx = rightClick.world.x, wz = rightClick.world.z;
    const selectedUnits = units.filter(u => u.alive && u.selected && u.team === 0);

    if (selectedUnits.length === 0) return;

    // Check if right-clicked on enemy unit/building
    let targetUnit = null;
    for (const u of units) {
      if (!u.alive || u.team === 0) continue;
      if (u.containsPoint(wx, wz, 3)) { targetUnit = u; break; }
    }

    if (targetUnit) {
      for (const su of selectedUnits) {
        su.attackUnit(targetUnit);
      }
      sfx.play('move');
      return;
    }

    // Check if right-clicked on resource (for harvesters)
    let targetResource = null;
    for (const r of resources) {
      if (!r.alive || r.amount <= 0) continue;
      const dx = wx - r.x, dz = wz - r.z;
      if (dx*dx + dz*dz < 64) { targetResource = r; break; }
    }

    if (targetResource) {
      for (const su of selectedUnits) {
        if (su.type === 'harvester') {
          const cc = buildings.find(b => b.alive && b.team === 0 && b.type === 'command_center');
          if (cc) su.gatherFrom(targetResource, cc);
        } else {
          su.moveTo(wx, wz, pathGrid, TILE_SIZE, WORLD_HALF);
        }
      }
      sfx.play('move');
      return;
    }

    // Move order
    for (const su of selectedUnits) {
      su.moveTo(wx, wz, pathGrid, TILE_SIZE, WORLD_HALF);
    }
    sfx.play('move');
  }
}

// ── Update ─────────────────────────────────────────────────────────────
function update(dt, time) {
  handleInput();

  // Update units
  for (const u of units) {
    if (!u.alive) {
      u.deathTimer -= dt;
      if (u.deathTimer <= 0 && u.mesh) { scene.remove(u.mesh); }
      continue;
    }

    u.updateMovement(dt, pathGrid, TILE_SIZE, WORLD_HALF);
    u.updateCombat(dt, units);
    u.updateAutoAttack(dt, units);
    u.updateGathering(dt, TILE_SIZE, WORLD_HALF);
    u.updateHealthBar();
    u.syncMesh();
    u.billboardBars(camera.camera);
  }

  // Remove dead units
  units = units.filter(u => u.alive || u.deathTimer > 0);

  // Update buildings
  for (const b of buildings) {
    if (!b.alive) {
      b.deathTimer -= dt;
      if (b.deathTimer <= 0 && b.mesh) scene.remove(b.mesh);
      continue;
    }
    b.updateHealthBar();
    b.syncMesh();
    b.billboardBars(camera.camera);
  }
  buildings = buildings.filter(b => b.alive || b.deathTimer > 0);

  // Production
  updateProduction();

  // Resources
  for (const r of resources) {
    r.update(dt, time);
    r.syncMesh();
  }

  // Particles
  for (const p of particles) {
    p.life -= dt;
    p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
    if (p.life <= 0 && p.mesh) scene.remove(p.mesh);
  }
  particles = particles.filter(p => p.life > 0);

  // Fog of war
  fogPlayer.tick();
  for (const u of units) {
    if (!u.alive) continue;
    const g = worldToGrid(u.x, u.z, TILE_SIZE, WORLD_HALF);
    const sightTiles = Math.floor(u.sightRange / TILE_SIZE);
    if (u.team === 0) fogPlayer.reveal(g.x, g.y, sightTiles);
    else fogEnemy.reveal(g.x, g.y, sightTiles);
  }
  for (const b of buildings) {
    if (!b.alive) continue;
    const g = worldToGrid(b.x, b.z, TILE_SIZE, WORLD_HALF);
    const sightTiles = Math.floor(b.sightRange / TILE_SIZE);
    if (b.team === 0) fogPlayer.reveal(g.x, g.y, sightTiles);
    else fogEnemy.reveal(g.x, g.y, sightTiles);
  }

  // AI
  if (ai && gameMode === 'skirmish') {
    ai.update(dt, {
      units, buildings, resources, pathGrid,
      spawnBuilding: (type, faction, x, z, team) => spawnBuilding(type, faction, x, z, team)
    });
  }

  // Victory/defeat check
  const playerCC = buildings.filter(b => b.team === 0 && b.type === 'command_center' && b.alive);
  const enemyCC = buildings.filter(b => b.team === 1 && b.type === 'command_center' && b.alive);
  if (playerCC.length === 0 && gameState === 'playing') endGame(false);
  else if (enemyCC.length === 0 && gameState === 'playing' && gameMode === 'skirmish') endGame(true);

  // Player resources (from harvesters depositing)
  // Already handled in unit.gathering → homeBuilding.diamonds

  // HUD update
  hud.updateResources(playerDiamonds, playerBiogas);
  const fogData = fogPlayer.getMinimapData([60, 100, 60], [40, 60, 40], [0, 0, 0]);
  hud.updateMinimap(fogData, units, buildings, 0);

  // Update build menu affordability
  if (selectedBuilding && selectedBuilding.alive) {
    hud.showBuildMenu(selectedBuilding, playerFaction, playerDiamonds, playerBiogas);
  }
}

// ── Minimap Click → Camera Jump ────────────────────────────────────────
function onMinimapClick(e) {
  const { x, z } = e.detail;
  camera.setLookTarget(new THREE.Vector3(x, 0, z));
}

// ── Selection overlay ──────────────────────────────────────────────────
function renderSelectionBox() {
  selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
  const dragBox = input.getDragBox();
  if (dragBox && dragBox.w > 2 && dragBox.h > 2) {
    selectionCtx.strokeStyle = '#00d4ff';
    selectionCtx.lineWidth = 1.5;
    selectionCtx.setLineDash([6, 3]);
    selectionCtx.strokeRect(dragBox.x, dragBox.y, dragBox.w, dragBox.h);
    selectionCtx.fillStyle = 'rgba(0, 212, 255, 0.1)';
    selectionCtx.fillRect(dragBox.x, dragBox.y, dragBox.w, dragBox.h);
    selectionCtx.setLineDash([]);
  }
}

// ── Resize ─────────────────────────────────────────────────────────────
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.resize(w, h);
  selectionCanvas.width = w;
  selectionCanvas.height = h;
}

// ── Main Loop ──────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  if (gameState === 'playing') {
    camera.updateKeys(dt);
    camera.updateEdges(dt);
    update(dt, time);
    renderSelectionBox();
  }

  renderer.render(scene, camera.camera);
}

// ── Start ──────────────────────────────────────────────────────────────
init();