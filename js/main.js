import * as THREE from 'three';
import { IsometricCamera } from './engine/camera.js';
import { InputManager } from './engine/input.js';
import { worldToGrid, gridToWorld } from './engine/pathfinding.js';
import { FogOfWar } from './engine/fogOfWar.js';
import { Unit, resetUnitIds } from './entities/units.js';
import { Building, resetBuildingIds } from './entities/buildings.js';
import { ResourceNode, generateResources, generateResourcesFromMap, resetResourceIds } from './entities/resources.js';
import { getDefaultMap, getAllMaps, getMap } from './engine/maps.js';
import { createSaveState, saveGame, loadGame, listSaves, deleteSave, downloadSave, loadFromFile, formatSaveTime } from './engine/saveSystem.js';
import { FACTION_DOGS } from './factions/dogs.js';
import { FACTION_CATS } from './factions/cats.js';
import { FACTION_FISH } from './factions/fish.js';
import { SkirmishAI } from './ai/skirmishAI.js';
import { HUD } from './ui/hud.js';
import { SFX } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { NetworkClient } from './network/client.js';
// ADR-16: Replay system
import { ReplayRecorder, ReplayReplayer, saveReplay, loadReplay, listReplays, deleteReplay, downloadReplay, loadReplayFromFile } from './engine/replay.js';
import { EVT_SELECT, EVT_BOX_SELECT, EVT_COMMAND, EVT_BUILD, EVT_UPGRADE, EVT_AI_SPAWN_UNIT, EVT_AI_SPAWN_BUILDING, EVT_AI_COMMAND, EVT_GAME_OVER } from './engine/replay.js';

// ── Constants ──────────────────────────────────────────────────────────
const MAP_SIZE = 96;
const TILE_SIZE = 4;
const WORLD_SIZE = MAP_SIZE * TILE_SIZE;
const WORLD_HALF = WORLD_SIZE / 2;

// ── Globals ────────────────────────────────────────────────────────────
let scene, renderer, camera, input;
let clock = new THREE.Clock();
// ADR-8: Shared clock time for unit animations
let clockTime = 0;
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
let playerFactionKey = 'dogs';
let selectedBuilding = null;

// Building placement
let placementMode = null // { type: string, ghostMesh: THREE.Group, valid: boolean, shakeTimer: number }

// Faction registry
const FACTIONS = {
  dogs: FACTION_DOGS,
  cats: FACTION_CATS,
  fish: FACTION_FISH
};

/** Resolve a faction key to its definition */
function getFaction(key) {
  return FACTIONS[key] || FACTION_DOGS;
}

// Systems
let hud, sfx, music, ai;
let fogPlayer, fogEnemy;
let net = null;         // NetworkClient instance
let netWaiting = false; // true when waiting for guest to join (host mode)

// ADR-6: Network delta snapshot tracking
let netPreviousState = null;  // previous snapshot for delta computation
let netBroadcastTimer = 0;    // throttle timer (send every 100ms)
const NET_BROADCAST_INTERVAL = 0.1; // 100ms between broadcasts

// Selection overlay
let selectionCanvas, selectionCtx;

// ADR-9: Death/combat particles + command indicators
let particles = [];
let commandIndicators = [];

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
const btnBuildToggle = document.getElementById('btn-build-toggle');
// ADR-12: Upgrades button
const btnUpgrades = document.getElementById('btn-upgrades');
// ADR-11: Chat button
const btnChat = document.getElementById('btn-chat');
// ADR-15: Spectate UI
const btnSpectate = document.getElementById('btn-spectate');
const spectatePanel = document.getElementById('spectate-panel');
const spectateHostIp = document.getElementById('spectate-host-ip');
const btnSpectateConnect = document.getElementById('btn-spectate-connect');
const spectatingBanner = document.getElementById('spectating-banner');
// ADR-13: Settings button
const btnSettings = document.getElementById('btn-settings');
// ADR-14: Map selector
const mapSelectDropdown = document.getElementById('map-select-dropdown');
const mapDescription = document.getElementById('map-description');
// ADR-19: Connection quality indicator
const connectionIndicator = document.getElementById('connection-indicator');
const pingDot = document.querySelector('.ping-dot');
const pingValue = document.querySelector('.ping-value');
// ADR-20: Save/Load
const btnSaveGame = document.getElementById('btn-save');
const btnLoadGame = document.getElementById('btn-load');
const saveLoadModal = document.getElementById('save-load-modal');
const btnQuickSave = document.getElementById('btn-quick-save');
const btnQuickLoad = document.getElementById('btn-quick-load');
const btnDownloadSave = document.getElementById('btn-download-save');
const btnUploadSave = document.getElementById('btn-upload-save');
const saveFileInput = document.getElementById('save-file-input');
const btnCloseSaveLoad = document.getElementById('btn-close-save-load');
const saveListItems = document.getElementById('save-list-items');
const joinPanel = document.getElementById('join-panel');
const hostIpInput = document.getElementById('host-ip');
const factionButtons = document.querySelectorAll('.faction-btn');
const waitingOverlay = document.getElementById('waiting-overlay');
const hostIpDisplay = document.getElementById('host-ip-display');
const btnCancelHost = document.getElementById('btn-cancel-host');
const placementMenuEl = document.getElementById('placement-menu');

// ADR-16: Replay UI elements
const btnReplays = document.getElementById('btn-replays');
const replayModal = document.getElementById('replay-modal');
const btnCloseReplay = document.getElementById('btn-close-replay');
const btnUploadReplay = document.getElementById('btn-upload-replay');
const replayFileInput = document.getElementById('replay-file-input');
const replayListItems = document.getElementById('replay-list-items');
const replayControls = document.getElementById('replay-controls');
const replayNameEl = document.getElementById('replay-name');
const btnReplayRewind = document.getElementById('btn-replay-rewind');
const btnReplayPause = document.getElementById('btn-replay-pause');
const btnReplaySpeed = document.getElementById('btn-replay-speed');
const btnReplayClose = document.getElementById('btn-replay-close');
const replayProgressFill = document.getElementById('replay-progress-fill');
const replayTimeEl = document.getElementById('replay-time');

// ADR-12: Upgrade system state
let upgradeStates = {
  weapon: { researched: false, researching: false, progress: 0, duration: 15 },
  engine: { researched: false, researching: false, progress: 0, duration: 12 },
  armor:  { researched: false, researching: false, progress: 0, duration: 15 }
};

// ADR-13: Settings
let gameSettings = {
  sfxVolume: 70,
  musicVolume: 50,
  difficulty: 'medium'
};

// ADR-14: Map selection
let selectedMapId = 'default';
let currentMapDef = getDefaultMap();

// ADR-16: Replay system
let replayRecorder = null;       // ReplayRecorder instance
let replayReplayer = null;       // ReplayReplayer instance
let replayTick = 0;              // Current replay tick counter
let replayPaused = false;        // Replay paused
let replaySpeed = 1;             // Replay speed multiplier (1, 2, 4, 0.5)
let replaySnapshotTimer = 0;     // Timer for periodic snapshots
const REPLAY_SNAPSHOT_INTERVAL = 30; // seconds between snapshots
let replayRecording = false;     // Whether currently recording

// Load saved settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem('fu_settings');
    if (saved) Object.assign(gameSettings, JSON.parse(saved));
  } catch (e) {}
}
loadSettings();

function saveSettings() {
  try {
    localStorage.setItem('fu_settings', JSON.stringify(gameSettings));
  } catch (e) {}
}

// ADR-13: Volume multipliers (0.0 to 1.0)
function sfxVolumeMultiplier() { return gameSettings.sfxVolume / 100; }
function musicVolumeMultiplier() { return gameSettings.musicVolume / 100; }

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
  setupSaveLoadEvents();
  // ADR-16: Setup replay events
  setupReplayEvents();
  window.addEventListener('resize', onResize);

  // Produce unit event
  window.addEventListener('produce_unit', onProduceUnit);

  // Minimap click → jump camera
  window.addEventListener('minimap_click', onMinimapClick);

  // ADR-3: Unit shoot SFX
  window.addEventListener('unit_shoot', () => sfx.play('shoot'));

  // ADR-9: Hit particles when units fire
  window.addEventListener('unit_hit', (e) => spawnHitParticles(e.detail.x, e.detail.z));

  // Harvester deposited resources
  window.addEventListener('resource_deposited', onResourceDeposited);

  // Start placement mode
  window.addEventListener('start_placement', onStartPlacement);

  // ADR-11: Send chat message event
  window.addEventListener('send_chat', (e) => {
    if (net && net.connected) {
      net.sendChat(e.detail.message);
    } else {
      hud.addChatMessage('You', e.detail.message);
    }
  });

  // ADR-12: Research upgrade event
  window.addEventListener('research_upgrade', onResearchUpgrade);

  // ADR-11: Chat button (setup once, references global hud)
  if (btnChat) {
    btnChat.addEventListener('click', () => {
      if (hud && gameState === 'playing') {
        hud.toggleChat();
        btnChat.classList.toggle('active', hud.chatVisible);
      }
    });
  }

  // ADR-11: Keyboard shortcut for chat (Enter key)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && gameState === 'playing' && hud) {
      // If chat input has focus, the textarea handles Enter itself
      if (document.activeElement === hud.chatInputEl) return;
      // Otherwise toggle chat
      if (!hud.chatVisible) {
        hud.toggleChat(true);
        btnChat && btnChat.classList.add('active');
      }
    }
    // ADR-11: Escape to close chat
    if (e.key === 'Escape' && hud && hud.chatVisible) {
      hud.toggleChat(false);
      btnChat && btnChat.classList.remove('active');
    }
  });

  // ADR-12: Upgrades button (setup once, references global hud)
  if (btnUpgrades) {
    btnUpgrades.addEventListener('click', () => {
      if (hud && gameState === 'playing') {
        hud.toggleUpgrades();
        btnUpgrades.classList.toggle('active', hud.upgradeVisible);
        if (hud.upgradeVisible) {
          hud.renderUpgrades(upgradeStates, playerDiamonds, playerBiogas);
        }
      }
    });
  }

  // ADR-13: Settings close saves
  const closeSettingsBtn = document.getElementById('btn-close-settings');
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      if (hud) {
        const newSettings = hud.readSettings();
        Object.assign(gameSettings, newSettings);
        applyVolumeSettings();
        saveSettings();
        hud.toggleSettings(false);
      }
    });
  }

  // Init audio
  sfx = new SFX();
  music = new Music();

  // ADR-13: Apply saved volume on init
  applyVolumeSettings();

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

// ADR-14: Build scene with map-specific settings
function buildSceneWithMap(mapDef) {
  // Remove old lights
  while (scene.children.length > 0) scene.remove(scene.children[0]);

  scene.background = new THREE.Color(mapDef.skyColor || '#1a1a2e');
  scene.fog = new THREE.Fog(mapDef.skyColor || '#1a1a2e', 550, 800);

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
  createGroundForMap(mapDef);

  // Re-add camera
  camera = new IsometricCamera(scene, window.innerWidth, window.innerHeight, {
    initialDistance: 220, pitchAngle: THREE.MathUtils.degToRad(50),
    yawAngle: THREE.MathUtils.degToRad(-45), minZoom: 70, maxZoom: 400
  });
  camera.setLookTarget(new THREE.Vector3(0, 0, 0));
  scene.add(camera.camera);
  input = new InputManager(renderer, camera);
}

function createGround() {
  createGroundForMap(getDefaultMap());
}

/**
 * ADR-14: Create ground mesh with map-specific terrain and colors.
 * @param {object} mapDef - Map definition from maps.js
 */
function createGroundForMap(mapDef) {
  const [freqX, freqZ, amp1, freq2a, freq2b, amp2] = mapDef.terrainParams;
  const terrainColor = parseInt(mapDef.terrainColor.replace('#', '0x'));

  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 64, 64);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), z = posAttr.getZ(i);
    posAttr.setY(i, Math.sin(x * freqX) * Math.cos(z * freqZ) * amp1 + Math.sin(x * freq2a + z * freq2b) * amp2);
  }
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    color: terrainColor, roughness: 0.95, metalness: 0.05
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
  // Faction selection
  factionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      factionButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      playerFaction = getFaction(btn.dataset.faction);
      playerFactionKey = btn.dataset.faction;
      btnSkirmish.disabled = false;
    });
  });

  btnSkirmish.addEventListener('click', () => startGame('skirmish'));
  btnHost.addEventListener('click', () => startGame('host'));
  btnJoin.addEventListener('click', () => joinPanel.classList.toggle('hidden'));
  btnConnect.addEventListener('click', () => {
    const ip = hostIpInput.value.trim();
    if (ip) startGame('guest', { hostIp: ip });
  });
  // ADR-15: Spectate button
  if (btnSpectate) {
    btnSpectate.addEventListener('click', () => spectatePanel.classList.toggle('hidden'));
  }
  if (btnSpectateConnect) {
    btnSpectateConnect.addEventListener('click', () => {
      const ip = spectateHostIp.value.trim();
      if (ip) startGame('spectator', { hostIp: ip });
    });
  }
  btnCancelHost.addEventListener('click', () => {
    if (gameState === 'waiting') returnToMenu();
  });
  btnMenu.addEventListener('click', returnToMenu);

  // Build toggle button
  btnBuildToggle.addEventListener('click', () => {
    if (placementMode) {
      cancelPlacement();
      return;
    }
    const menuVisible = placementMenuEl && !placementMenuEl.classList.contains('hidden');
    if (menuVisible) {
      hud.hidePlacementMenu();
      btnBuildToggle.classList.remove('active');
    } else {
      hud.showPlacementMenu(playerFaction, playerDiamonds, playerBiogas);
      btnBuildToggle.classList.add('active');
    }
  });

  // ADR-14: Map selector
  if (mapSelectDropdown) {
    const mapDescriptions = {
      'default': 'Balanced layout, standard resource distribution',
      'narrow-pass': 'Elongated terrain with a central choke point',
      'open-plains': 'Wide open terrain, favors fast and ranged units',
      'diamond-rush': 'Abundant central resources, encourages aggressive play',
    };
    mapSelectDropdown.addEventListener('change', () => {
      selectedMapId = mapSelectDropdown.value;
      if (mapDescription && mapDescriptions[selectedMapId]) {
        mapDescription.textContent = mapDescriptions[selectedMapId];
      }
    });
  }

  // ADR-13: Settings button (main menu)
  btnSettings.addEventListener('click', () => {
    if (hud) {
      hud.loadSettings(gameSettings);
      hud.toggleSettings(true);
    }
    // Update volume display values
    const sfxVal = document.getElementById('sfx-volume-val');
    const musicVal = document.getElementById('music-volume-val');
    if (sfxVal) sfxVal.textContent = `${gameSettings.sfxVolume}%`;
    if (musicVal) musicVal.textContent = `${gameSettings.musicVolume}%`;
  });

  // ADR-13: Settings volume sliders live update
  const sfxSlider = document.getElementById('sfx-volume');
  const musicSlider = document.getElementById('music-volume');
  const sfxVal = document.getElementById('sfx-volume-val');
  const musicVal = document.getElementById('music-volume-val');
  if (sfxSlider) {
    sfxSlider.addEventListener('input', () => {
      gameSettings.sfxVolume = parseInt(sfxSlider.value);
      if (sfxVal) sfxVal.textContent = `${gameSettings.sfxVolume}%`;
      applyVolumeSettings();
      saveSettings();
    });
  }
  if (musicSlider) {
    musicSlider.addEventListener('input', () => {
      gameSettings.musicVolume = parseInt(musicSlider.value);
      if (musicVal) musicVal.textContent = `${gameSettings.musicVolume}%`;
      applyVolumeSettings();
      saveSettings();
    });
  }
  const difficultySelect = document.getElementById('difficulty-select');
  if (difficultySelect) {
    difficultySelect.addEventListener('change', () => {
      gameSettings.difficulty = difficultySelect.value;
      saveSettings();
    });
  }

  // ADR-16: Replay button (main menu)
  if (btnReplays) {
    btnReplays.addEventListener('click', () => {
      renderReplayList();
      replayModal.classList.remove('hidden');
    });
  }
}

/** ADR-13: Apply volume settings to audio system */
function applyVolumeSettings() {
  const sfxVol = sfxVolumeMultiplier();
  const musicVol = musicVolumeMultiplier();
  if (sfx) sfx.setVolume(sfxVol);
  if (music) music.setVolume(musicVol);
}

// ── ADR-20: Save/Load ─────────────────────────────────────────────────

/** Setup save/load button event handlers */
function setupSaveLoadEvents() {
  // HUD Save button → open modal
  if (btnSaveGame) {
    btnSaveGame.addEventListener('click', () => {
      if (gameState === 'playing') {
        renderSaveLoadModal();
        saveLoadModal.classList.remove('hidden');
      }
    });
  }

  // HUD Load button → open modal
  if (btnLoadGame) {
    btnLoadGame.addEventListener('click', () => {
      if (gameState === 'playing') {
        renderSaveLoadModal();
        saveLoadModal.classList.remove('hidden');
      }
    });
  }

  // Quick Save
  if (btnQuickSave) {
    btnQuickSave.addEventListener('click', () => {
      const state = createSaveState({
        units, buildings, resources,
        playerDiamonds, playerBiogas,
        playerFactionKey, upgradeStates,
        mapId: selectedMapId, gameMode
      });
      const ok = saveGame(state);
      if (ok) {
        hud.addChatMessage('System', 'Game saved (Quick Save)');
        sfx.play('build');
        saveLoadModal.classList.add('hidden');
      } else {
        hud.addChatMessage('System', 'Save failed (storage full?)');
      }
      renderSaveLoadModal();
    });
  }

  // Quick Load
  if (btnQuickLoad) {
    btnQuickLoad.addEventListener('click', () => {
      const state = loadGame();
      if (state) {
        applySaveState(state);
        hud.addChatMessage('System', 'Game loaded (Quick Save)');
        sfx.play('build');
        saveLoadModal.classList.add('hidden');
      } else {
        hud.addChatMessage('System', 'No quick save found');
      }
    });
  }

  // Download Save
  if (btnDownloadSave) {
    btnDownloadSave.addEventListener('click', () => {
      const state = createSaveState({
        units, buildings, resources,
        playerDiamonds, playerBiogas,
        playerFactionKey, upgradeStates,
        mapId: selectedMapId, gameMode
      });
      downloadSave(state);
      hud.addChatMessage('System', 'Save file downloaded');
    });
  }

  // Upload Save
  if (btnUploadSave) {
    btnUploadSave.addEventListener('click', () => {
      saveFileInput.click();
    });
  }

  // File input change
  if (saveFileInput) {
    saveFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const state = await loadFromFile(file);
      if (state) {
        applySaveState(state);
        hud.addChatMessage('System', `Game loaded from ${file.name}`);
        sfx.play('build');
        saveLoadModal.classList.add('hidden');
      } else {
        hud.addChatMessage('System', 'Invalid save file');
      }
      saveFileInput.value = ''; // reset
    });
  }

  // Close modal
  if (btnCloseSaveLoad) {
    btnCloseSaveLoad.addEventListener('click', () => {
      saveLoadModal.classList.add('hidden');
    });
  }
}

/** Render the save/load modal with current saves */
function renderSaveLoadModal() {
  if (!saveListItems) return;
  const saves = listSaves();
  saveListItems.innerHTML = '';

  if (saves.length === 0) {
    saveListItems.innerHTML = '<div class="no-saves">No saved games found</div>';
    return;
  }

  for (const save of saves) {
    const div = document.createElement('div');
    div.className = 'save-item';

    const info = document.createElement('div');
    info.className = 'save-item-info';

    const label = document.createElement('span');
    label.className = 'save-item-label';
    label.textContent = save.label;

    const time = document.createElement('span');
    time.className = 'save-item-time';
    time.textContent = formatSaveTime(save.timestamp);

    info.appendChild(label);
    info.appendChild(time);

    const actions = document.createElement('div');
    actions.className = 'save-item-actions';

    // Load button
    const loadBtn = document.createElement('button');
    loadBtn.className = 'load-btn';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      const state = loadGame(save.id);
      if (state) {
        applySaveState(state);
        hud.addChatMessage('System', `Game loaded (${save.label})`);
        sfx.play('build');
        saveLoadModal.classList.add('hidden');
      } else {
        hud.addChatMessage('System', 'Failed to load save');
      }
    });

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Del';
    delBtn.addEventListener('click', () => {
      deleteSave(save.id);
      hud.addChatMessage('System', `${save.label} deleted`);
      renderSaveLoadModal();
    });

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);

    div.appendChild(info);
    div.appendChild(actions);
    saveListItems.appendChild(div);
  }
}

/** Apply a loaded save state to the current game */
function applySaveState(state) {
  if (!state || !state.entities) return;

  // Restore map
  if (state.mapId) {
    selectedMapId = state.mapId;
    currentMapDef = getMap(selectedMapId);
  }

  // Clear current entities
  for (const u of units) if (u.mesh) scene.remove(u.mesh);
  for (const b of buildings) if (b.mesh) scene.remove(b.mesh);
  for (const r of resources) if (r.mesh) scene.remove(r.mesh);
  units = []; buildings = []; resources = [];
  pathGrid.blocked.clear();
  if (pathGrid.dynamicBlocked) pathGrid.dynamicBlocked.clear();

  // Restore player resources
  if (state.player) {
    playerDiamonds = state.player.diamonds || 300;
    playerBiogas = state.player.biogas || 0;
    if (state.player.faction) {
      playerFactionKey = state.player.faction;
      playerFaction = getFaction(playerFactionKey);
    }
    if (state.player.upgrades) {
      upgradeStates = state.player.upgrades;
    }
  }

  // Restore buildings first (they block pathfinding)
  for (const bData of state.entities.buildings) {
    const b = spawnBuilding(bData.type, bData.faction || playerFactionKey, bData.x, bData.z, bData.team);
    if (b) {
      b.id = bData.id;
      b.hp = bData.hp;
      b.maxHp = bData.maxHp;
      b.productionQueue = bData.productionQueue || [];
      b.productionTimer = bData.productionTimer || 0;
    }
  }

  // Restore units
  for (const uData of state.entities.units) {
    const u = spawnUnit(uData.type, uData.faction || playerFactionKey, uData.x, uData.z, uData.team);
    if (u) {
      u.id = uData.id;
      u.hp = uData.hp;
      u.maxHp = uData.maxHp;
    }
  }

  // Restore resources
  for (const rData of state.entities.resources) {
    const r = new ResourceNode(rData.type, rData.x, rData.z, rData.amount);
    r.id = rData.id;
    r.maxAmount = rData.maxAmount;
    r.alive = rData.amount > 0;
    const mesh = r.createMesh();
    scene.add(mesh);
    resources.push(r);
    // Block resource tiles
    const g = worldToGrid(rData.x, rData.z, TILE_SIZE, WORLD_HALF);
    pathGrid.blocked.add(`${g.x},${g.y}`);
  }

  // Re-apply fog of war
  fogPlayer = new FogOfWar(MAP_SIZE, 0);
  fogEnemy = new FogOfWar(MAP_SIZE, 1);
}

// ── ADR-16: Replay System ──────────────────────────────────────────────

/** Setup replay button event handlers */
function setupReplayEvents() {
  // Close replay modal
  if (btnCloseReplay) {
    btnCloseReplay.addEventListener('click', () => {
      replayModal.classList.add('hidden');
    });
  }

  // Upload replay from file
  if (btnUploadReplay) {
    btnUploadReplay.addEventListener('click', () => {
      replayFileInput.click();
    });
  }

  // File input change
  if (replayFileInput) {
    replayFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const data = await loadReplayFromFile(file);
      if (data) {
        const name = file.name.replace('.replay.json', '').replace('.json', '');
        saveReplay(data, name);
        renderReplayList();
      } else {
        alert('Invalid replay file');
      }
      replayFileInput.value = '';
    });
  }

  // Replay controls
  if (btnReplayRewind) {
    btnReplayRewind.addEventListener('click', () => {
      rewindReplay();
    });
  }

  if (btnReplayPause) {
    btnReplayPause.addEventListener('click', () => {
      replayPaused = !replayPaused;
      btnReplayPause.textContent = replayPaused ? '▶' : '⏸';
    });
  }

  if (btnReplaySpeed) {
    btnReplaySpeed.addEventListener('click', () => {
      const speeds = [0.5, 1, 2, 4];
      const idx = speeds.indexOf(replaySpeed);
      replaySpeed = speeds[(idx + 1) % speeds.length];
      btnReplaySpeed.textContent = `${replaySpeed}x`;
    });
  }

  if (btnReplayClose) {
    btnReplayClose.addEventListener('click', () => {
      endReplay();
    });
  }
}

/** Render the replay list modal */
function renderReplayList() {
  if (!replayListItems) return;
  const replays = listReplays();
  replayListItems.innerHTML = '';

  if (replays.replays.length === 0) {
    replayListItems.innerHTML = '<div class="no-saves">No replays found. Record a game first!</div>';
    return;
  }

  // Sort by date (newest first)
  const sorted = [...replays.replays].sort((a, b) => b.createdAt - a.createdAt);

  for (const entry of sorted) {
    const div = document.createElement('div');
    div.className = 'save-item';

    const info = document.createElement('div');
    info.className = 'save-item-info';

    const label = document.createElement('span');
    label.className = 'save-item-label';
    label.textContent = entry.name || `Replay ${entry.replayId.slice(0, 12)}`;

    const time = document.createElement('span');
    time.className = 'save-item-time';
    const d = new Date(entry.createdAt);
    time.textContent = d.toLocaleString();

    const faction = document.createElement('span');
    faction.className = 'save-item-faction';
    const mode = entry.settings ? entry.settings.mode || 'skirmish' : 'skirmish';
    const factionName = entry.settings ? (entry.settings.faction || 'Unknown') : 'Unknown';
    const winner = entry.winner !== null && entry.winner !== undefined
      ? (entry.winner === 0 ? '🏆 Victory' : '💀 Defeat')
      : '⏱️ Incomplete';
    faction.textContent = `${factionName} (${mode}) — ${formatReplayDuration(entry.duration)} ${winner}`;

    info.appendChild(label);
    info.appendChild(time);
    info.appendChild(faction);

    const actions = document.createElement('div');
    actions.className = 'save-item-actions';

    // Watch button
    const watchBtn = document.createElement('button');
    watchBtn.className = 'load-btn';
    watchBtn.textContent = 'Watch';
    watchBtn.addEventListener('click', () => {
      const data = loadReplay(entry.replayId);
      if (data) {
        replayModal.classList.add('hidden');
        startReplay(data, entry.name);
      }
    });

    // Download button
    const dlBtn = document.createElement('button');
    dlBtn.textContent = '⬇';
    dlBtn.title = 'Download';
    dlBtn.addEventListener('click', () => {
      downloadReplay(entry.replayId);
    });

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Del';
    delBtn.addEventListener('click', () => {
      deleteReplay(entry.replayId);
      renderReplayList();
    });

    actions.appendChild(watchBtn);
    actions.appendChild(dlBtn);
    actions.appendChild(delBtn);

    div.appendChild(info);
    div.appendChild(actions);
    replayListItems.appendChild(div);
  }
}

/** Format replay duration in seconds to mm:ss */
function formatReplayDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Start a replay session */
function startReplay(replayData, name) {
  // Stop any existing game
  if (ai) ai = null;
  if (net) { net.disconnect(); net = null; }
  for (const u of units) if (u.mesh) scene.remove(u.mesh);
  for (const b of buildings) if (b.mesh) scene.remove(b.mesh);
  for (const r of resources) if (r.mesh) scene.remove(r.mesh);
  units = []; buildings = []; resources = []; particles = [];
  commandIndicators = [];
  pathGrid.blocked.clear();
  if (pathGrid.dynamicBlocked) pathGrid.dynamicBlocked.clear();

  // Init audio
  sfx.init();
  music.init();
  music.start();
  applyVolumeSettings();

  // Setup replayer
  replayReplayer = new ReplayReplayer(replayData);
  replayTick = 0;
  replayPaused = false;
  replaySpeed = 1;
  replayRecorder = null;
  replayRecording = false;

  // Show UI
  mainMenuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  gameOverEl.classList.add('hidden');

  // Create HUD
  hud = new HUD();

  // Setup replayer
  replayReplayer = new ReplayReplayer(replayData);
  replayTick = 0;
  replayPaused = false;
  replaySpeed = 1;
  btnReplayPause.textContent = '⏸';
  btnReplaySpeed.textContent = '1x';

  // Show replay controls, hide interactive buttons
  replayControls.classList.remove('hidden');
  if (replayNameEl) replayNameEl.textContent = name || 'Replay';

  // Hide interactive buttons (spectator-like)
  disableInteractiveHUD();
  spectatingBanner.classList.remove('hidden');
  spectatingBanner.textContent = '📼 REPLAY';

  // Get initial settings
  const settings = replayReplayer.getInitialSettings();
  if (settings) {
    selectedMapId = settings.mapId || 'default';
    playerFactionKey = settings.factionKey || 'dogs';
    playerFaction = getFaction(playerFactionKey);
  }

  // Load initial state from snapshot
  const initialState = replayReplayer.getInitialSnapshot();
  if (initialState) {
    // Minimal setup - just set up the map and fog
    currentMapDef = getMap(selectedMapId);

    // Apply initial state
    applySaveState(initialState);

    // Center camera
    const playerCC = buildings.find(b => b.team === 0 && b.type === 'command_center' && b.alive);
    if (playerCC) {
      camera.setLookTarget(new THREE.Vector3(playerCC.x, 0, playerCC.z));
    }
  } else {
    // Fallback: set up from scratch
    startGameFromReplaySettings(settings || {});
  }

  gameMode = 'replay';
  gameState = 'playing';
}

/** Minimal game setup for replay when no initial snapshot */
function startGameFromReplaySettings(settings) {
  currentMapDef = getMap(settings.mapId || 'default');
  playerFactionKey = settings.factionKey || 'dogs';
  playerFaction = getFaction(playerFactionKey);

  // Set up resources from map
  resources = generateResourcesFromMap(currentMapDef, TILE_SIZE, WORLD_HALF);
  for (const r of resources) {
    const node = new ResourceNode(r.type, r.x, r.z, r.amount);
    resources[resources.length - 1] = node;
    const mesh = node.createMesh();
    scene.add(mesh);
    const g = worldToGrid(r.x, r.z, TILE_SIZE, WORLD_HALF);
    pathGrid.blocked.add(`${g.x},${g.y}`);
  }

  // Place bases
  const playerBaseX = currentMapDef.playerBase[0];
  const playerBaseZ = currentMapDef.playerBase[1];
  spawnBuilding('command_center', playerFactionKey, playerBaseX, playerBaseZ, 0);
  const enemyBaseX = currentMapDef.enemyBase[0];
  const enemyBaseZ = currentMapDef.enemyBase[1];
  spawnBuilding('command_center', playerFactionKey, enemyBaseX, enemyBaseZ, 1);

  camera.setLookTarget(new THREE.Vector3(playerBaseX, 0, playerBaseZ));
  playerDiamonds = 300;
  playerBiogas = 0;
}

/** Rewind replay to the beginning */
function rewindReplay() {
  if (!replayReplayer) return;
  // Re-start the replay
  const data = replayReplayer.replay;
  startReplay(data, replayNameEl ? replayNameEl.textContent : 'Replay');
}

/** End replay and return to menu */
function endReplay() {
  replayReplayer = null;
  replayRecorder = null;
  replayRecording = false;
  replayControls.classList.add('hidden');
  spectatingBanner.classList.add('hidden');
  // Restore interactive buttons
  if (btnBuildToggle) btnBuildToggle.style.display = '';
  if (btnUpgrades) btnUpgrades.style.display = '';
  if (btnSaveGame) btnSaveGame.style.display = '';
  if (btnLoadGame) btnLoadGame.style.display = '';
  returnToMenu();
}

/** Record a player input event for replay */
function recordPlayerInput(type, data) {
  if (replayRecorder && replayRecording) {
    replayRecorder.recordPlayerInput(type, data);
  }
}

/** Record an AI event for replay */
function recordAiEvent(type, data) {
  if (replayRecorder && replayRecording) {
    replayRecorder.recordAiEvent(type, data);
  }
}

/** Process replay events for the current tick */
function processReplayEvents() {
  if (!replayReplayer || replayPaused) return;

  const events = replayReplayer.getEventsForTick();
  for (const evt of events) {
    if (evt.type === EVT_GAME_OVER && evt.data.winner !== undefined) {
      endGame(evt.data.winner === 0);
    }
    // Other events are processed during the simulation
    // (player inputs are replayed by re-running the tick with those inputs)
  }
}

/** Update replay UI (progress bar, time display) */
function updateReplayUI() {
  if (!replayReplayer) return;
  const meta = replayReplayer.getMetadata();
  const totalTicks = meta.winnerTick || Math.max(replayTick, 60 * (meta.duration || 1));
  const progress = Math.min(100, (replayTick / totalTicks) * 100);
  if (replayProgressFill) replayProgressFill.style.width = `${progress}%`;
  if (replayTimeEl) {
    const current = formatReplayDuration(replayTick / 60);
    const total = formatReplayDuration(meta.duration || 0);
    replayTimeEl.textContent = `${current} / ${total}`;
  }
}

// ── ADR-15: Disable interactive HUD for spectator mode ──────────────
function disableInteractiveHUD() {
  // Hide build-related buttons
  if (btnBuildToggle) btnBuildToggle.style.display = 'none';
  if (btnUpgrades) btnUpgrades.style.display = 'none';
  if (btnSaveGame) btnSaveGame.style.display = 'none';
  if (btnLoadGame) btnLoadGame.style.display = 'none';
  // Hide placement menu and build menu
  if (placementMenuEl) placementMenuEl.classList.add('hidden');
  const buildMenuEl = document.getElementById('build-menu');
  if (buildMenuEl) buildMenuEl.style.display = 'none';
  const unitInfoEl = document.getElementById('unit-info');
  if (unitInfoEl) unitInfoEl.style.display = 'none';
}

// ── Game Start/End ─────────────────────────────────────────────────────
function startGame(mode, opts = {}) {
  // Init audio on user gesture
  sfx.init();
  music.init();
  music.start();

  gameMode = mode;
  mainMenuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  joinPanel.classList.add('hidden');

  // Reset
  resetUnitIds(); resetBuildingIds(); resetResourceIds();
  units = []; buildings = []; resources = []; particles = [];
  pathGrid.blocked.clear();
  // ADR-10: Clear dynamic obstacles
  if (pathGrid.dynamicBlocked) pathGrid.dynamicBlocked.clear();
  playerDiamonds = 300;
  playerBiogas = 0;
  selectedBuilding = null;
  ai = null;
  placementMode = null;
  netPreviousState = null;
  netBroadcastTimer = 0;
  // ADR-16: Reset replay state
  replayRecorder = new ReplayRecorder();
  replayTick = 0;
  replayRecording = (mode === 'skirmish' || mode === 'host');
  replaySnapshotTimer = 0;
  replayReplayer = null;
  replayControls.classList.add('hidden');
  // ADR-12: Reset upgrades
  upgradeStates = {
    weapon: { researched: false, researching: false, progress: 0, duration: 15 },
    engine: { researched: false, researching: false, progress: 0, duration: 12 },
    armor:  { researched: false, researching: false, progress: 0, duration: 15 }
  };
  // ADR-11: Clear chat
  if (hud) hud.clearChat();
  if (placementMenuEl) placementMenuEl.classList.add('hidden');
  if (btnBuildToggle) btnBuildToggle.classList.remove('active');
  if (btnUpgrades) btnUpgrades.classList.remove('active');
  if (btnChat) btnChat.classList.remove('active');

  // HUD
  hud = new HUD();

  // ADR-13: Apply saved volume
  applyVolumeSettings();

  // Load saved settings into modal
  hud.loadSettings(gameSettings);

  // Fog of war
  fogPlayer = new FogOfWar(MAP_SIZE, 0);
  fogEnemy = new FogOfWar(MAP_SIZE, 1);

  // ADR-14: Use map-specific resource generation and base positions
  currentMapDef = getMap(selectedMapId);
  resources = generateResourcesFromMap(currentMapDef, TILE_SIZE, WORLD_HALF);
  for (const r of resources) {
    const node = new ResourceNode(r.type, r.x, r.z, r.amount);
    resources[resources.length - 1] = node; // replace plain object with ResourceNode
    const mesh = node.createMesh();
    scene.add(mesh);
    // Block resource tiles
    const g = worldToGrid(r.x, r.z, TILE_SIZE, WORLD_HALF);
    pathGrid.blocked.add(`${g.x},${g.y}`);
  }

  // ADR-14: Place bases from map definition
  const playerBaseX = currentMapDef.playerBase[0];
  const playerBaseZ = currentMapDef.playerBase[1];
  spawnBuilding('command_center', playerFactionKey, playerBaseX, playerBaseZ, 0);

  const enemyBaseX = currentMapDef.enemyBase[0];
  const enemyBaseZ = currentMapDef.enemyBase[1];
  spawnBuilding('command_center', playerFactionKey, enemyBaseX, enemyBaseZ, 1);

  // Center camera on player base
  camera.setLookTarget(new THREE.Vector3(playerBaseX, 0, playerBaseZ));

  // ADR-16: Start recording for skirmish and host modes
  if (replayRecording && replayRecorder) {
    replayRecorder.start({
      faction: playerFaction.name || playerFactionKey,
      factionKey: playerFactionKey,
      mapId: selectedMapId,
      mode: mode,
      difficulty: gameSettings.difficulty
    }, {
      units, buildings, resources,
      playerDiamonds, playerBiogas,
      upgradeStates,
      mapId: selectedMapId,
      mode
    });
  }

  // ── Mode-specific setup ──
  if (mode === 'skirmish') {
    gameState = 'playing';
    ai = new SkirmishAI({
      units, buildings, resources, tileSize: TILE_SIZE, worldHalfSize: WORLD_HALF, fog: fogEnemy
    });
    spawnInitialHarvesters();
  } else if (mode === 'host') {
    gameState = 'waiting'; // wait for guest to join
    netWaiting = true;
    waitingOverlay.classList.remove('hidden');
    hostIpDisplay.textContent = `http://${location.hostname}:${location.port}`;
    // Host gets AI for enemy team (team 1) — guest replaces AI control when connected
    ai = new SkirmishAI({
      units, buildings, resources, tileSize: TILE_SIZE, worldHalfSize: WORLD_HALF, fog: fogEnemy
    });
    net = new NetworkClient('host', {
      onGuestConnected: () => {
        netWaiting = false;
        gameState = 'playing';
        waitingOverlay.classList.add('hidden');
        spawnInitialHarvesters();
      },
      onOpponentLeft: () => {
        endGame(false);
      },
      onPlayerInput: (data) => {
        if (data.action === 'select') {
          processSelection(data.x, data.z);
        } else if (data.action === 'box_select') {
          processBoxSelection(data.minX, data.minZ, data.maxX, data.maxZ);
        } else if (data.action === 'command') {
          processCommand(data.x, data.z);
        }
      },
      // ADR-11: Chat callback for host
      onChat: (sender, message) => {
        hud.addChatMessage(sender, message);
      },
      // ADR-19: Ping update callback for host
      onPingUpdate: (pingMs, quality) => {
        // Indicator updated in main loop via updateConnectionIndicator()
      },
      onError: (msg) => {
        console.warn('[Net]', msg);
      }
    });
    net.connectHost();
  } else if (mode === 'guest') {
    gameState = 'waiting';
    netWaiting = true;
    waitingOverlay.classList.remove('hidden');
    hostIpDisplay.textContent = `Connecting to ${opts.hostIp}...`;
    net = new NetworkClient('guest', {
      onOpponentLeft: () => {
        if (gameState === 'playing') endGame(false);
      },
      onGameState: (state) => {
        if (gameState === 'waiting') {
          gameState = 'playing';
          netWaiting = false;
          waitingOverlay.classList.add('hidden');
        }
        applyRemoteState(state);
      },
      // ADR-11: Chat callback for guest
      onChat: (sender, message) => {
        hud.addChatMessage(sender, message);
      },
      // ADR-19: Ping update callback for guest
      onPingUpdate: (pingMs, quality) => {
        // Indicator updated in main loop via updateConnectionIndicator()
      },
      onError: (msg) => {
        console.warn('[Net]', msg);
        netWaiting = false;
        gameState = 'menu';
        returnToMenu();
      }
    });
    net.connectGuest(opts.hostIp || 'localhost:8181');
  }
  // ADR-15: Spectator mode
  else if (mode === 'spectator') {
    gameState = 'waiting';
    netWaiting = true;
    waitingOverlay.classList.remove('hidden');
    hostIpDisplay.textContent = `Spectating ${opts.hostIp}...`;
    net = new NetworkClient('spectator', {
      onOpponentLeft: () => {
        if (gameState === 'playing') endGame(false);
      },
      onGameState: (state) => {
        if (gameState === 'waiting') {
          gameState = 'playing';
          netWaiting = false;
          waitingOverlay.classList.add('hidden');
          // Show spectating banner
          if (spectatingBanner) spectatingBanner.classList.remove('hidden');
          // Disable interactive HUD elements
          disableInteractiveHUD();
        }
        applyRemoteState(state);
      },
      // ADR-11: Chat callback for spectator
      onChat: (sender, message) => {
        hud.addChatMessage(sender, message);
      },
      // ADR-19: Ping update callback for spectator
      onPingUpdate: (pingMs, quality) => {
        // Indicator updated in main loop via updateConnectionIndicator()
      },
      onError: (msg) => {
        console.warn('[Net]', msg);
        netWaiting = false;
        gameState = 'menu';
        returnToMenu();
      }
    });
    net.connectSpectator(opts.hostIp || 'localhost:8181');
  }
}

/** Spawn initial harvesters for team 0 */
function spawnInitialHarvesters() {
  setTimeout(() => {
    const cc = buildings.find(b => b.team === 0 && b.type === 'command_center' && b.alive);
    if (cc) spawnUnit('harvester', playerFactionKey, cc.x + 8, cc.z + 5, 0);
    setTimeout(() => {
      if (cc && cc.alive) spawnUnit('harvester', playerFactionKey, cc.x + 8, cc.z - 5, 0);
    }, 1000);
  }, 500);
}

/** Apply a game state received from the host (guest mode)
 * ADR-6: Handles both full-state snapshots and delta updates
 */
function applyRemoteState(state) {
  // Update player resources
  playerDiamonds = state.playerDiamonds ?? playerDiamonds;
  playerBiogas = state.playerBiogas ?? playerBiogas;

  // ADR-6: Detect if this is a delta update (has newUnits/removedUnits fields)
  const isDelta = state.newUnits !== undefined || state.removedUnits !== undefined;

  if (isDelta) {
    // ── Delta update ──

    // Apply new units
    if (state.newUnits) {
      for (const nu of state.newUnits) {
        const u = spawnUnit(nu.type, nu.faction, nu.x, nu.z, nu.team);
        if (u) {
          u.id = nu.id;
          u.maxHp = nu.maxHp;
          u.hp = nu.hp;
        }
      }
    }

    // Apply changed units
    if (state.units) {
      for (const cu of state.units) {
        const u = units.find(u => u.id === cu.id);
        if (u) {
          u.x = cu.x; u.z = cu.z;
          u.hp = cu.hp; u.maxHp = cu.maxHp;
          u.alive = cu.alive;
          u.selected = false;
        }
      }
    }

    // Remove dead units
    if (state.removedUnits) {
      for (const id of state.removedUnits) {
        const u = units.find(u => u.id === id);
        if (u && u.alive) { u.alive = false; u.deathTimer = 0; }
      }
    }

    // Apply new buildings
    if (state.newBuildings) {
      for (const nb of state.newBuildings) {
        const b = spawnBuilding(nb.type, nb.faction, nb.x, nb.z, nb.team);
        if (b) {
          b.id = nb.id;
          b.hp = nb.hp; b.maxHp = nb.maxHp;
        }
      }
    }

    // Apply changed buildings
    if (state.buildings) {
      for (const cb of state.buildings) {
        const b = buildings.find(b => b.id === cb.id);
        if (b) {
          b.x = cb.x; b.z = cb.z;
          b.hp = cb.hp; b.maxHp = cb.maxHp;
          b.alive = cb.alive;
        }
      }
    }

    // Remove dead buildings
    if (state.removedBuildings) {
      for (const id of state.removedBuildings) {
        const b = buildings.find(b => b.id === id);
        if (b && b.alive) { b.alive = false; b.deathTimer = 0; }
      }
    }

    // Apply changed resources
    if (state.resources) {
      for (const rr of state.resources) {
        const r = resources.find(r => r.id === rr.id);
        if (r) {
          r.amount = rr.amount;
          r.alive = rr.amount > 0;
        }
      }
    }
  } else {
    // ── Full-state snapshot (initial or legacy) ──
    const remoteUnits = state.units || [];
    const remoteBuildings = state.buildings || [];
    const remoteResources = state.resources || [];

    // Sync units
    for (const ru of remoteUnits) {
      let u = units.find(u => u.id === ru.id);
      if (!u) {
        u = spawnUnit(ru.type, ru.faction, ru.x, ru.z, ru.team);
        if (u) {
          u.id = ru.id;
          u.setStats(u.type === 'harvester' ? { hp: ru.hp, damage: ru.damage, speed: ru.speed } : { hp: ru.maxHp, damage: ru.damage, speed: ru.speed });
          u.maxHp = ru.maxHp;
          u.hp = ru.hp;
        }
      } else {
        u.x = ru.x; u.z = ru.z;
        u.hp = ru.hp; u.maxHp = ru.maxHp;
        u.alive = ru.alive;
        u.selected = false;
      }
    }
    // Remove units no longer on server
    for (const u of units) {
      if (!remoteUnits.find(ru => ru.id === u.id) && u.alive) {
        u.alive = false;
        u.deathTimer = 0;
      }
    }

    // Sync buildings
    for (const rb of remoteBuildings) {
      let b = buildings.find(b => b.id === rb.id);
      if (!b) {
        b = spawnBuilding(rb.type, rb.faction, rb.x, rb.z, rb.team);
        if (b) {
          b.id = rb.id;
          b.hp = rb.hp; b.maxHp = rb.maxHp;
        }
      } else {
        b.hp = rb.hp; b.maxHp = rb.maxHp;
        b.alive = rb.alive;
      }
    }

    // Sync resources
    for (const rr of remoteResources) {
      let r = resources.find(r => r.id === rr.id);
      if (r) {
        r.amount = rr.amount;
        r.alive = rr.amount > 0;
      }
    }
  }
}

function returnToMenu() {
  // Disconnect network
  if (net) { net.disconnect(); net = null; }
  netWaiting = false;

  // Cancel placement mode
  cancelPlacement();

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
  for (const ci of commandIndicators) if (ci.mesh) scene.remove(ci.mesh);
  units = []; buildings = []; resources = []; particles = []; commandIndicators = [];
  waitingOverlay.classList.add('hidden');
  placementMode = null;

  // ADR-15: Restore HUD elements hidden during spectator mode
  if (btnBuildToggle) btnBuildToggle.style.display = '';
  if (btnUpgrades) btnUpgrades.style.display = '';
  if (btnSaveGame) btnSaveGame.style.display = '';
  if (btnLoadGame) btnLoadGame.style.display = '';
  const buildMenuEl = document.getElementById('build-menu');
  if (buildMenuEl) buildMenuEl.style.display = '';
  const unitInfoEl = document.getElementById('unit-info');
  if (unitInfoEl) unitInfoEl.style.display = '';
  if (spectatingBanner) spectatingBanner.classList.add('hidden');

  // ADR-16: Clean up replay state
  replayRecording = false;
  replayRecorder = null;
  replayReplayer = null;
  replayControls.classList.add('hidden');

  // Reset faction UI
  factionButtons.forEach(b => b.classList.remove('selected'));
  btnSkirmish.disabled = true;
  // ADR-15: Reset spectate panel
  if (spectatePanel) spectatePanel.classList.add('hidden');

  // Clean up input listeners to avoid accumulation across sessions
  input.dispose();
  camera = new IsometricCamera(scene, window.innerWidth, window.innerHeight, {
    initialDistance: 220, pitchAngle: THREE.MathUtils.degToRad(50),
    yawAngle: THREE.MathUtils.degToRad(-45), minZoom: 70, maxZoom: 400
  });
  camera.setLookTarget(new THREE.Vector3(0, 0, 0));
  scene.add(camera.camera);
  input = new InputManager(renderer, camera);

  camera.setLookTarget(new THREE.Vector3(0, 0, 0));
}

function endGame(victory) {
  // ADR-16: Stop recording and save replay
  if (replayRecording && replayRecorder) {
    replayRecorder.recordGameOver(victory ? 0 : 1);
    const replayData = replayRecorder.stop();
    replayRecording = false;
    // Save replay with a descriptive name
    const factionName = playerFaction.name || playerFactionKey;
    const result = victory ? 'Victory' : 'Defeat';
    const mapName = selectedMapId || 'default';
    const replayName = `${factionName} - ${result} on ${mapName}`;
    saveReplay(replayData, replayName);
    console.log(`[Replay] Saved: ${replayName} (${replayData.events.length} events, ${replayData.duration.toFixed(1)}s)`);
  }

  // Disconnect network
  if (net) { net.disconnect(); net = null; }
  netWaiting = false;

  // Cancel placement mode
  cancelPlacement();

  gameState = 'gameover';
  gameOverEl.classList.remove('hidden');
  // ADR-15: Spectator sees neutral game over
  if (gameMode === 'spectator') {
    gameOverTitle.textContent = 'GAME OVER';
    gameOverEl.classList.add('victory'); // use neutral styling
  } else {
    gameOverEl.classList.add(victory ? 'victory' : 'defeat');
    gameOverTitle.textContent = victory ? 'VICTORY' : 'DEFEAT';
  }
  music.stop();
}

// ── Spawning ───────────────────────────────────────────────────────────
function spawnUnit(type, faction, x, z, team) {
  const factionDef = getFaction(faction);
  const unitDef = factionDef.units[type];
  if (!unitDef) return null;

  const unit = new Unit(type, faction, x, z, team);
  unit.setStats(unitDef);
  unit.name = unitDef.name;
  const mesh = unit.createMesh(factionDef);
  scene.add(mesh);
  units.push(unit);
  // ADR-16: Record AI unit spawns
  if (team === 1 && replayRecording) {
    recordAiEvent(EVT_AI_SPAWN_UNIT, { type, faction, x: Math.round(x), z: Math.round(z) });
  }
  return unit;
}

function spawnBuilding(type, faction, x, z, team) {
  const factionDef = getFaction(faction);
  const buildDef = factionDef.buildings[type];

  const building = new Building(type, faction, x, z, team);
  building.setStats(buildDef || {});
  building.factionDef = factionDef;
  // ADR-16: Record AI building spawns
  if (team === 1 && replayRecording) {
    recordAiEvent(EVT_AI_SPAWN_BUILDING, { type, faction, x: Math.round(x), z: Math.round(z) });
  }
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

// ── Building Placement ─────────────────────────────────────────────────

/** Check if a building can be placed at (x, z) */
function isPlacementValid(x, z) {
  // World bounds check
  const margin = 6;
  if (x < -WORLD_HALF + margin || x > WORLD_HALF - margin) return false;
  if (z < -WORLD_HALF + margin || z > WORLD_HALF - margin) return false;

  // Overlap with existing buildings (8 unit radius)
  for (const b of buildings) {
    if (!b.alive) continue;
    const dx = x - b.x, dz = z - b.z;
    if (dx * dx + dz * dz < 64) return false;
  }

  // Overlap with resources (6 unit radius)
  for (const r of resources) {
    if (!r.alive || r.amount <= 0) continue;
    const dx = x - r.x, dz = z - r.z;
    if (dx * dx + dz * dz < 36) return false;
  }

  return true;
}

/** Create a semi-transparent ghost mesh for placement preview */
function createGhostMesh(buildingType) {
  const group = new THREE.Group();
  const factionDef = playerFaction;

  // Create a temporary building object to use buildBuildingMesh
  const tempBuilding = {
    type: buildingType,
    team: 0,
    faction: playerFactionKey
  };

  if (factionDef && factionDef.buildBuildingMesh) {
    factionDef.buildBuildingMesh(tempBuilding, group);
  } else {
    const geo = new THREE.BoxGeometry(4, 3, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.5;
    group.add(mesh);
  }

  // Make all materials semi-transparent
  group.traverse(child => {
    if (child.isMesh) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = 0.5;
      child.material.depthWrite = false;
    }
  });

  scene.add(group);
  return group;
}

/** Handle the start_placement custom event */
function onStartPlacement(e) {
  const { type } = e.detail;
  const buildDef = playerFaction.buildings[type];
  if (!buildDef || !buildDef.cost) return;

  // Check affordability
  if (playerDiamonds < buildDef.cost.diamonds || playerBiogas < (buildDef.cost.biogas || 0)) return;

  // Hide placement menu
  hud.hidePlacementMenu();
  btnBuildToggle.classList.remove('active');

  // Enter placement mode
  const ghostMesh = createGhostMesh(type);
  placementMode = {
    type,
    ghostMesh,
    valid: false,
    shakeTimer: 0
  };
}

/** Cancel building placement and clean up */
function cancelPlacement() {
  if (!placementMode) return;
  if (placementMode.ghostMesh) {
    scene.remove(placementMode.ghostMesh);
    // Dispose materials to prevent memory leaks
    placementMode.ghostMesh.traverse(child => {
      if (child.isMesh && child.material) child.material.dispose();
    });
  }
  placementMode = null;
  hud.hidePlacementMenu();
  btnBuildToggle.classList.remove('active');
}

/** Try to place a building at world position (x, z) */
function tryPlaceBuilding(x, z) {
  if (!placementMode) return;

  const buildDef = playerFaction.buildings[placementMode.type];
  if (!buildDef) return;

  const valid = isPlacementValid(x, z);

  if (!valid) {
    // Shake the ghost mesh as visual rejection
    placementMode.shakeTimer = 0.3;
    return;
  }

  // Deduct cost
  playerDiamonds -= buildDef.cost.diamonds;
  playerBiogas -= (buildDef.cost.biogas || 0);

  // Remove ghost
  scene.remove(placementMode.ghostMesh);
  placementMode.ghostMesh.traverse(child => {
    if (child.isMesh && child.material) child.material.dispose();
  });

  // Spawn the real building
  spawnBuilding(placementMode.type, playerFactionKey, x, z, 0);
  // ADR-16: Record building placement
  recordPlayerInput(EVT_BUILD, { type: placementMode.type, x, z });
  sfx.play('build');

  // Exit placement mode
  placementMode = null;
}

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

/**
 * ADR-12: Handle researching an upgrade
 * @param {CustomEvent} e
 */
function onResearchUpgrade(e) {
  const { type, diamonds, biogas } = e.detail;
  const state = upgradeStates[type];
  if (!state || state.researched || state.researching) return;
  if (playerDiamonds < diamonds || playerBiogas < biogas) return;

  // Deduct resources
  playerDiamonds -= diamonds;
  playerBiogas -= biogas;

  // Start researching
  state.researching = true;
  state.progress = 0;
  sfx.play('build');
  // ADR-16: Record upgrade research
  recordPlayerInput(EVT_UPGRADE, { type });

  hud.addChatMessage('System', `Researching ${type} upgrade...`);
}

/**
 * ADR-12: Update research progress each frame
 * @param {number} dt
 */
function updateResearch(dt) {
  for (const key of Object.keys(upgradeStates)) {
    const state = upgradeStates[key];
    if (!state.researching) continue;

    state.progress += dt / state.duration;
    if (state.progress >= 1) {
      state.progress = 1;
      state.researching = false;
      state.researched = true;

      // Apply upgrade to all existing player units
      for (const u of units) {
        if (u.team === 0 && u.alive) {
          u.applyUpgrade(key);
        }
      }

      hud.addChatMessage('System', `${key} upgrade complete!`);
      sfx.play('build');
    }
  }
}

/**
 * ADR-9: Spawn death particles at world position
 * @param {number} x
 * @param {number} z
 * @param {number} [color] - particle color (default: random warm colors)
 */
function spawnDeathParticles(x, z, color) {
  const count = 15 + Math.floor(Math.random() * 8);
  for (let i = 0; i < count; i++) {
    const size = 0.15 + Math.random() * 0.3;
    const geo = new THREE.SphereGeometry(size, 4, 4);
    const hue = color ? new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).h : (0.05 + Math.random() * 0.1);
    const mat = new THREE.MeshBasicMaterial({
      color: color || new THREE.Color().setHSL(hue, 0.9, 0.5),
      transparent: true,
      opacity: 1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1 + Math.random() * 2, z);
    scene.add(mesh);

    particles.push({
      mesh,
      life: 0.6 + Math.random() * 0.6,
      maxLife: 0.6 + Math.random() * 0.6,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        3 + Math.random() * 8,
        (Math.random() - 0.5) * 20
      ),
      gravity: -15
    });
  }
}

/**
 * ADR-9: Spawn hit/combat particles at world position
 * @param {number} x
 * @param {number} z
 */
function spawnHitParticles(x, z) {
  const count = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.12;
    const geo = new THREE.SphereGeometry(size, 3, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.1 + Math.random() * 0.05, 1, 0.6),
      transparent: true,
      opacity: 1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 1, 1 + Math.random(), z + (Math.random() - 0.5) * 1);
    scene.add(mesh);

    particles.push({
      mesh,
      life: 0.2 + Math.random() * 0.3,
      maxLife: 0.2 + Math.random() * 0.3,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        1 + Math.random() * 3,
        (Math.random() - 0.5) * 8
      ),
      gravity: -10
    });
  }
}

/** Create a visual command indicator ring on the ground */
function addCommandIndicator(x, z, color) {
  const geo = new THREE.RingGeometry(0.5, 0.8, 16);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.2, z);
  mesh.scale.set(0.01, 0.01, 0.01);
  scene.add(mesh);
  commandIndicators.push({ mesh, life: 0.8 });
}

// ── Input Handling ─────────────────────────────────────────────────────

/** Process a left-click selection at world position (wx, wz) */
function processSelection(wx, wz) {
  // Check buildings first
  let clickedBuilding = null;
  for (const b of buildings) {
    if (!b.alive || b.team !== 0) continue;
    if (b.containsPoint(wx, wz, 2)) { clickedBuilding = b; break; }
  }

  if (clickedBuilding) {
    for (const u of units) if (u.team === 0) u.selected = false;
    for (const b of buildings) b.selected = false;
    clickedBuilding.selected = true;
    selectedBuilding = clickedBuilding;
    hud.showUnitInfo(clickedBuilding);
    hud.showBuildMenu(clickedBuilding, playerFaction, playerDiamonds, playerBiogas);
    sfx.play('select');
  } else {
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

/** Process a box selection */
function processBoxSelection(minX, minZ, maxX, maxZ) {
  for (const u of units) {
    if (!u.alive || u.team !== 0) continue;
    u.selected = u.insideBox(minX, minZ, maxX, maxZ);
  }
  for (const b of buildings) b.selected = false;
  selectedBuilding = null;
  hud.hideBuildMenu();
  const sel = units.find(u => u.alive && u.selected && u.team === 0);
  hud.showUnitInfo(sel);
  sfx.play('select');
}

/** Process a right-click command at world position (wx, wz) */
function processCommand(wx, wz) {
  const selectedUnits = units.filter(u => u.alive && u.selected && u.team === 0);
  if (selectedUnits.length === 0) return;

  // Check enemy unit
  let targetUnit = null;
  for (const u of units) {
    if (!u.alive || u.team === 0) continue;
    if (u.containsPoint(wx, wz, 3)) { targetUnit = u; break; }
  }
  if (targetUnit) {
    for (const su of selectedUnits) su.attackUnit(targetUnit);
    addCommandIndicator(wx, wz, 0xff4444);
    sfx.play('move');
    return;
  }

  // Check resource
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
    addCommandIndicator(wx, wz, 0xffff00);
    sfx.play('move');
    return;
  }

  // Move order
  for (const su of selectedUnits) {
    su.moveTo(wx, wz, pathGrid, TILE_SIZE, WORLD_HALF);
  }
  addCommandIndicator(wx, wz, 0x00ff88);
  sfx.play('move');
}

/** Handle placement mode input; returns true if placement input was consumed */
function processPlacementInput(leftClick, rightClick, selBox) {
  if (leftClick && leftClick.world) {
    tryPlaceBuilding(leftClick.world.x, leftClick.world.z);
    return true;
  }
  if (rightClick) {
    cancelPlacement();
    return true;
  }
  // selBox is consumed (ignored) in placement mode
  return !!selBox;
}

function handleInput() {
  // ADR-15: Spectator mode — all input is read-only, skip processing
  if (gameMode === 'spectator') return;

  const leftClick = input.getLeftClick();
  const rightClick = input.getRightClick();
  const selBox = input.getSelectionBox();

  // ── Placement mode input (checked first) ──
  if (placementMode) {
    if (processPlacementInput(leftClick, rightClick, selBox)) return;
  }

  // Guest mode: forward all input to host
  if (gameMode === 'guest' && net && net.connected) {
    if (leftClick && leftClick.world) {
      net.sendInput({ action: 'select', x: leftClick.world.x, z: leftClick.world.z });
    }
    if (selBox && !placementMode) {
      net.sendInput({ action: 'box_select', minX: selBox.min.x, minZ: selBox.min.z, maxX: selBox.max.x, maxZ: selBox.max.z });
    }
    if (rightClick && rightClick.world && !placementMode) {
      net.sendInput({ action: 'command', x: rightClick.world.x, z: rightClick.world.z });
    }
    // Still process locally for visual feedback
  }

  // Left click — select
  if (leftClick && leftClick.world) {
    processSelection(leftClick.world.x, leftClick.world.z);
    // ADR-16: Record player select
    recordPlayerInput(EVT_SELECT, { x: leftClick.world.x, z: leftClick.world.z });
  }

  // Selection box
  if (selBox && !placementMode) {
    processBoxSelection(selBox.min.x, selBox.min.z, selBox.max.x, selBox.max.z);
    // ADR-16: Record player box select
    recordPlayerInput(EVT_BOX_SELECT, { minX: selBox.min.x, minZ: selBox.min.z, maxX: selBox.max.x, maxZ: selBox.max.z });
  }

  // Right click — move / attack / gather
  if (rightClick && rightClick.world && !placementMode) {
    processCommand(rightClick.world.x, rightClick.world.z);
    // ADR-16: Record player command
    recordPlayerInput(EVT_COMMAND, { x: rightClick.world.x, z: rightClick.world.z });
  }
}

// ── ADR-16: Visuals-only update for replay mode ────────────────────────
/** Update only visual elements (health bars, mesh sync, fog) without simulation */
function updateVisualsOnly() {
  clockTime = clock.getElapsedTime();

  // Update units visuals
  for (const u of units) {
    if (!u.alive) {
      u.deathTimer -= 1/60;
      if (u.deathTimer <= 0 && u.mesh) scene.remove(u.mesh);
      continue;
    }
    u.updateHealthBar();
    u.syncMesh(clockTime);
    u.billboardBars(camera.camera);
  }

  // Update buildings visuals
  for (const b of buildings) {
    if (!b.alive) {
      b.deathTimer -= 1/60;
      if (b.deathTimer <= 0 && b.mesh) scene.remove(b.mesh);
      continue;
    }
    b.updateHealthBar();
    b.syncMesh();
    b.billboardBars(camera.camera);
  }

  // Update resources visuals
  for (const r of resources) r.syncMesh();

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

  // ADR-2: Apply fog visibility
  for (const u of units) {
    if (!u.alive || u.mesh === null) continue;
    if (u.team !== 0) {
      const g = worldToGrid(u.x, u.z, TILE_SIZE, WORLD_HALF);
      const visible = fogPlayer.isVisible(g.x, g.y);
      u.mesh.visible = visible;
      if (u.selectionRing && u.selected) u.selectionRing.visible = true;
    }
  }
  for (const b of buildings) {
    if (!b.alive || b.mesh === null) continue;
    if (b.team !== 0) {
      const g = worldToGrid(b.x, b.z, TILE_SIZE, WORLD_HALF);
      const visible = fogPlayer.isVisible(g.x, g.y);
      b.mesh.visible = visible;
      if (b.selectionRing && b.selected) b.selectionRing.visible = true;
    }
  }

  // Remove dead entities
  units = units.filter(u => u.alive || u.deathTimer > 0);
  buildings = buildings.filter(b => b.alive || b.deathTimer > 0);

  // HUD
  hud.updateResources(playerDiamonds, playerBiogas);
  const fogData = fogPlayer.getMinimapData([60, 100, 60], [40, 60, 40], [0, 0, 0]);
  hud.updateMinimap(fogData, units, buildings, 0);
}

// ── Update ─────────────────────────────────────────────────────────────
function update(dt, time) {
  // ADR-16: Replay mode — skip simulation, inject events and advance
  if (gameMode === 'replay') {
    if (!replayPaused && replayReplayer) {
      const speedDt = dt * replaySpeed;
      // Advance tick by speedDt * 60 ticks
      const ticksToAdd = Math.floor(speedDt * 60);
      for (let i = 0; i < ticksToAdd; i++) {
        processReplayEvents();
        replayReplayer.advanceTick();
        replayTick = replayReplayer.currentTick;
      }
      // Check if replay finished
      if (replayReplayer.isFinished() && replayPaused === false) {
        replayPaused = true;
        if (btnReplayPause) btnReplayPause.textContent = '▶';
      }
    }
    updateReplayUI();
    // Still update visuals
    updateVisualsOnly();
    return;
  }

  handleInput();

  // ADR-16: Advance replay tick and record snapshots
  if (replayRecording && replayRecorder) {
    replayRecorder.advanceTick();
    replaySnapshotTimer += dt;
    if (replaySnapshotTimer >= REPLAY_SNAPSHOT_INTERVAL) {
      replaySnapshotTimer = 0;
      replayRecorder.recordSnapshot({
        units, buildings, resources,
        playerDiamonds, playerBiogas,
        upgradeStates,
        mapId: selectedMapId,
        mode: gameMode
      });
    }
  }

  // ADR-8: Update shared clock time for unit animations
  clockTime = clock.getElapsedTime();

  // ADR-15: Spectator skips local simulation (no AI, no unit movement, no production)
  if (gameMode !== 'spectator') {
    // ADR-10: Compute dynamic obstacles (moving units block pathfinding cells)
    if (!pathGrid.dynamicBlocked) pathGrid.dynamicBlocked = new Set();
    pathGrid.dynamicBlocked.clear();
    for (const u of units) {
      if (u.alive && u.state !== 'idle') {
        const g = worldToGrid(u.x, u.z, TILE_SIZE, WORLD_HALF);
        pathGrid.dynamicBlocked.add(`${g.x},${g.y}`);
      }
    }

    // ADR-12: Update research progress
    updateResearch(dt);
  } else {
    // Spectator: just keep mesh sync for smooth rendering
    // (no movement/combat/production, but still update visuals)
  }

  // ── Placement ghost mesh update ──
  if (placementMode) {
    const ndc = input.getMouse();
    const raycaster = camera.camera ? new THREE.Raycaster() : null;
    if (raycaster) {
      raycaster.setFromCamera(ndc, camera.camera);
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
        placementMode.ghostMesh.position.set(intersection.x, 0, intersection.z);
        placementMode.valid = isPlacementValid(intersection.x, intersection.z);

        // Tint green (valid) or red (invalid)
        const tint = placementMode.valid ? 0x00ff88 : 0xff3344;
        placementMode.ghostMesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.color.setHex(tint);
            child.material.emissive && child.material.emissive.setHex(tint);
          }
        });
      }
    }

    // Shake animation on invalid placement attempt
    if (placementMode.shakeTimer > 0) {
      placementMode.shakeTimer -= dt;
      const shakeAmount = Math.sin(placementMode.shakeTimer * 60) * 0.5;
      placementMode.ghostMesh.position.x += shakeAmount;
    }
  }

  // ADR-15: Spectator mode — skip simulation, only update visuals
  if (gameMode !== 'spectator') {
    // Track which units were alive before this frame (for death SFX — ADR-3)
    for (const u of units) u._wasAlive = u.alive;

    // Update units
    for (const u of units) {
      if (!u.alive) {
        u.deathTimer -= dt;
        if (u.deathTimer <= 0 && u.mesh) { scene.remove(u.mesh); }
        continue;
      }

      u.updateMovement(dt, pathGrid, TILE_SIZE, WORLD_HALF);
      u.updateCombat(dt, units, pathGrid, TILE_SIZE, WORLD_HALF);
      u.updateHealing(dt, units);
      u.updateAutoAttack(dt, units);
      u.updateGathering(dt, TILE_SIZE, WORLD_HALF);
      u.updateHealthBar();
      u.syncMesh(clockTime);
      u.billboardBars(camera.camera);
    }

    // ADR-3: Play explosion SFX for units that just died this frame
    // ADR-9: Spawn death particles for units that just died
    for (const u of units) {
      if (u._wasAlive && !u.alive) {
        sfx.play('explosion');
        spawnDeathParticles(u.x, u.z, u.team === 0 ? 0x4488ff : 0xff4444);
      }
    }

    // Remove dead units
    units = units.filter(u => u.alive || u.deathTimer > 0);

    // Track which buildings were alive (for death SFX — ADR-3)
    for (const b of buildings) b._wasAlive = b.alive;

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
      // ADR-5: Building auto-defense — buildings with attack stats fire at nearby enemies
      b.updateCombat(dt, units);
    }
  } else {
    // ADR-15: Spectator — just update visuals (health bars, mesh sync, billboards)
    for (const u of units) {
      if (!u.alive) {
        u.deathTimer -= dt;
        if (u.deathTimer <= 0 && u.mesh) { scene.remove(u.mesh); }
        continue;
      }
      u.updateHealthBar();
      u.syncMesh(clockTime);
      u.billboardBars(camera.camera);
    }
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
  }
  // ADR-3: Play explosion SFX for buildings that just died this frame
  // ADR-9: Spawn death particles for buildings that just died
  // ADR-15: Spectator skips building death SFX/particles
  if (gameMode !== 'spectator') {
    for (const b of buildings) {
      if (b._wasAlive && !b.alive) {
        sfx.play('explosion');
        spawnDeathParticles(b.x, b.z, 0xffaa00);
      }
    }
    buildings = buildings.filter(b => b.alive || b.deathTimer > 0);

    // Production
    updateProduction();
  } else {
    buildings = buildings.filter(b => b.alive || b.deathTimer > 0);
  }

  // Resources — ADR-15: spectator still syncs visuals
  for (const r of resources) {
    r.syncMesh();
  }
  if (gameMode !== 'spectator') {
    for (const r of resources) {
      r.update(dt, time);
    }
  }

  // ADR-9: Update particles with gravity and fade
  for (const p of particles) {
    p.life -= dt;
    // Apply gravity
    p.velocity.y += (p.gravity || -15) * dt;
    p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
    // Fade out based on remaining life
    const lifeRatio = p.life / (p.maxLife || 1);
    p.mesh.material.opacity = Math.max(0, lifeRatio);
    // Scale down as particle dies
    const scale = 0.5 + lifeRatio * 0.5;
    p.mesh.scale.set(scale, scale, scale);
    if (p.life <= 0 && p.mesh) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
  }
  particles = particles.filter(p => p.life > 0);

  // Command indicators
  for (const ci of commandIndicators) {
    ci.life -= dt;
    const progress = 1 - ci.life / 0.8;
    if (progress < 0.3) {
      const scale = progress / 0.3;
      ci.mesh.scale.set(scale * 3, scale * 3, scale * 3);
      ci.mesh.material.opacity = 1;
    } else {
      const fade = 1 - (progress - 0.3) / 0.7;
      ci.mesh.material.opacity = Math.max(0, fade);
    }
    if (ci.life <= 0 && ci.mesh) scene.remove(ci.mesh);
  }
  commandIndicators = commandIndicators.filter(ci => ci.life > 0);

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

  // ADR-2: Apply fog of war visibility to enemy units and buildings
  // ADR-7: Keep selection rings visible through fog for selected entities
  for (const u of units) {
    if (!u.alive || u.mesh === null) continue;
    if (u.team !== 0) {
      const g = worldToGrid(u.x, u.z, TILE_SIZE, WORLD_HALF);
      const visible = fogPlayer.isVisible(g.x, g.y);
      u.mesh.visible = visible;
      // ADR-7: Force selection ring visible even when hidden by fog
      if (u.selectionRing && u.selected) {
        u.selectionRing.visible = true;
      }
    }
  }
  for (const b of buildings) {
    if (!b.alive || b.mesh === null) continue;
    if (b.team !== 0) {
      const g = worldToGrid(b.x, b.z, TILE_SIZE, WORLD_HALF);
      const visible = fogPlayer.isVisible(g.x, g.y);
      b.mesh.visible = visible;
      // ADR-7: Force selection ring visible even when hidden by fog
      if (b.selectionRing && b.selected) {
        b.selectionRing.visible = true;
      }
    }
  }

  // AI (only in skirmish; host mode uses a simple AI for the enemy team too)
  if (ai && (gameMode === 'skirmish' || gameMode === 'host')) {
    ai.update(dt, {
      units, buildings, resources, pathGrid,
      spawnBuilding: (type, faction, x, z, team) => spawnBuilding(type, faction, x, z, team)
    });
  }

  // Victory/defeat check
  const playerCC = buildings.filter(b => b.team === 0 && b.type === 'command_center' && b.alive);
  const enemyCC = buildings.filter(b => b.team === 1 && b.type === 'command_center' && b.alive);
  if (playerCC.length === 0 && gameState === 'playing') endGame(false);
  else if (enemyCC.length === 0 && gameState === 'playing') endGame(gameMode !== 'guest');

  // ADR-6: Host — broadcast game state to guest (throttled + delta)
  if (net && gameMode === 'host' && net.connected) {
    netBroadcastTimer += dt;
    if (netBroadcastTimer >= NET_BROADCAST_INTERVAL) {
      netBroadcastTimer = 0;

      // Compact entity snapshot
      const currentUnits = units.map(u => ({
        id: u.id, type: u.type, faction: u.faction,
        x: u.x, z: u.z, team: u.team,
        hp: u.hp, maxHp: u.maxHp, alive: u.alive
      }));
      const currentBuildings = buildings.map(b => ({
        id: b.id, type: b.type, faction: b.faction,
        x: b.x, z: b.z, team: b.team,
        hp: b.hp, maxHp: b.maxHp, alive: b.alive
      }));
      const currentResources = resources.map(r => ({
        id: r.id, amount: r.amount, alive: r.alive
      }));

      if (!netPreviousState) {
        // First broadcast: send full state
        net.sendGameState({
          playerDiamonds, playerBiogas,
          units: currentUnits, buildings: currentBuildings, resources: currentResources
        });
      } else {
        // ADR-6: Compute delta — only changed entities
        const prevUnitIds = new Set(netPreviousState.units.map(e => e.id));
        const currUnitIds = new Set(currentUnits.map(e => e.id));
        const prevBuildingIds = new Set(netPreviousState.buildings.map(e => e.id));
        const currBuildingIds = new Set(currentBuildings.map(e => e.id));

        // Changed units (position or HP difference)
        const changedUnits = currentUnits.filter(c => {
          const p = netPreviousState.units.find(e => e.id === c.id);
          return !p || p.x !== c.x || p.z !== c.z || p.hp !== c.hp || p.alive !== c.alive;
        });
        const newUnits = currentUnits.filter(c => !prevUnitIds.has(c.id));
        const removedUnitIds = [...prevUnitIds].filter(id => !currUnitIds.has(id));

        // Changed buildings
        const changedBuildings = currentBuildings.filter(c => {
          const p = netPreviousState.buildings.find(e => e.id === c.id);
          return !p || p.x !== c.x || p.z !== c.z || p.hp !== c.hp || p.alive !== c.alive;
        });
        const newBuildings = currentBuildings.filter(c => !prevBuildingIds.has(c.id));
        const removedBuildingIds = [...prevBuildingIds].filter(id => !currBuildingIds.has(id));

        // Changed resources
        const changedResources = currentResources.filter(c => {
          const p = netPreviousState.resources.find(e => e.id === c.id);
          return !p || p.amount !== c.amount || p.alive !== c.alive;
        });

        const hasChanges = changedUnits.length > 0 || newUnits.length > 0 || removedUnitIds.length > 0 ||
                           changedBuildings.length > 0 || newBuildings.length > 0 || removedBuildingIds.length > 0 ||
                           changedResources.length > 0 ||
                           netPreviousState.playerDiamonds !== playerDiamonds ||
                           netPreviousState.playerBiogas !== playerBiogas;

        if (hasChanges) {
          net.sendGameState({
            playerDiamonds, playerBiogas,
            units: changedUnits.length > 0 ? changedUnits : undefined,
            newUnits: newUnits.length > 0 ? newUnits : undefined,
            removedUnits: removedUnitIds.length > 0 ? removedUnitIds : undefined,
            buildings: changedBuildings.length > 0 ? changedBuildings : undefined,
            newBuildings: newBuildings.length > 0 ? newBuildings : undefined,
            removedBuildings: removedBuildingIds.length > 0 ? removedBuildingIds : undefined,
            resources: changedResources.length > 0 ? changedResources : undefined
          });
        }
      }

      // Store compact snapshot for next delta
      netPreviousState = {
        playerDiamonds, playerBiogas,
        units: currentUnits, buildings: currentBuildings, resources: currentResources
      };
    }
  }

  // Player resources (from harvesters depositing)
  // Already handled in unit.gathering → homeBuilding.diamonds

  // Biogas production from gas mining buildings
  const playerGasMiners = buildings.filter(b => b.team === 0 && b.type === 'gas_mining' && b.alive);
  if (playerGasMiners.length > 0) {
    playerBiogas += playerGasMiners.length * dt * 2;
  }

  // HUD update
  hud.updateResources(playerDiamonds, playerBiogas);
  const fogData = fogPlayer.getMinimapData([60, 100, 60], [40, 60, 40], [0, 0, 0]);
  hud.updateMinimap(fogData, units, buildings, 0);

  // Update build menu affordability
  if (selectedBuilding && selectedBuilding.alive) {
    hud.showBuildMenu(selectedBuilding, playerFaction, playerDiamonds, playerBiogas);
  }

  // Update placement menu affordability
  if (placementMenuEl && !placementMenuEl.classList.contains('hidden')) {
    hud.updatePlacementMenu(playerFaction, playerDiamonds, playerBiogas);
  }

  // ADR-12: Update upgrade panel if visible
  if (hud.upgradeVisible) {
    hud.renderUpgrades(upgradeStates, playerDiamonds, playerBiogas);
  }

  // ADR-19: Update connection indicator
  updateConnectionIndicator();
}

/** ADR-19: Update the connection quality indicator in the HUD */
function updateConnectionIndicator() {
  if (!net || !connectionIndicator) return;
  if (!net.connected) {
    connectionIndicator.classList.add('hidden');
    return;
  }
  connectionIndicator.classList.remove('hidden');
  const ping = net.getPing();
  const quality = net.getQuality();
  if (ping !== null) {
    pingValue.textContent = `${ping}ms`;
  }
  if (pingDot) {
    pingDot.className = 'ping-dot';
    if (quality) pingDot.classList.add(quality);
  }
  if (connectionIndicator) {
    connectionIndicator.title = `Connection: ${quality || 'unknown'} (${ping !== null ? ping + 'ms' : 'measuring...'})`;
  }
}

// ── Minimap Click → Camera Jump ────────────────────────────────────────
function onResourceDeposited(e) {
  playerDiamonds += e.detail.amount;
}

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