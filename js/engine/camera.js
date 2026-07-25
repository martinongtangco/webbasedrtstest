import * as THREE from 'three';

/**
 * IsometricCamera manages a fixed-angle isometric view over the game scene.
 * Uses a PerspectiveCamera positioned at ~50° pitch for the classic RTS look.
 * Supports edge-pan, WASD/arrow pan, and scroll-wheel zoom.
 */
export class IsometricCamera {
  /**
   * @param {THREE.Scene} scene - The Three.js scene
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   * @param {object} opts - Options
   */
  constructor(scene, width, height, opts = {}) {
    this.scene = scene;

    // Camera settings
    this.fov = opts.fov || 30;
    this.near = opts.near || 1;
    this.far = opts.far || 2000;
    this.minZoom = opts.minZoom || 80;   // closest camera distance
    this.maxZoom = opts.maxZoom || 350;  // farthest camera distance

    // Pan settings
    this.panSpeed = opts.panSpeed || 1.2;       // units per frame for key pan
    this.edgePanSpeed = opts.edgePanSpeed || 60; // units/sec for edge pan
    this.edgeMargin = opts.edgeMargin || 80;    // px from screen edge to trigger pan

    // Create perspective camera
    this.camera = new THREE.PerspectiveCamera(this.fov, width / height, this.near, this.far);

    // Initial position: isometric angle (~50° pitch, 45° yaw)
    this.targetDistance = opts.initialDistance || 200;
    this.pitchAngle = opts.pitchAngle || THREE.MathUtils.degToRad(50);
    this.yawAngle = opts.yawAngle || THREE.MathUtils.degToRad(-45);

    // Target to look at (center of the map by default)
    this.lookTarget = new THREE.Vector3(0, 0, 0);

    // Pan edge tracking
    this.mouseX = 0;
    this.mouseY = 0;
    this.isMouseOnScreen = true;

    // Key state
    this.keys = {
      w: false, a: false, s: false, d: false,
      ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
    };

    // Viewport dimensions
    this.width = width;
    this.height = height;

    this._updateCameraPosition();
  }

  /**
   * Update camera position based on spherical coords around lookTarget
   * @private
   */
  _updateCameraPosition() {
    const x = this.targetDistance * Math.cos(this.pitchAngle) * Math.sin(this.yawAngle);
    const y = this.targetDistance * Math.sin(this.pitchAngle);
    const z = this.targetDistance * Math.cos(this.pitchAngle) * Math.cos(this.yawAngle);

    this.camera.position.set(
      this.lookTarget.x + x,
      this.lookTarget.y + y,
      this.lookTarget.z + z
    );

    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Pan the camera (move lookTarget) in world space
   * @param {number} dx - Horizontal pan delta (positive = right)
   * @param {number} dy - Vertical pan delta (positive = up on screen)
   */
  pan(dx, dy) {
    // Get camera right and up vectors (projected to XZ plane for ground pan)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    const right = new THREE.Vector3();
    right.crossVectors(this.camera.up, forward).normalize();

    // "Up on screen" means moving the target toward the camera's top
    // We want screen-up to pan the view "up" (lookTarget moves in -forward direction projected)
    const screenUp = new THREE.Vector3();
    screenUp.crossVectors(right, this.camera.up).normalize();
    // Flip because dy positive = moving up on screen = camera should look "up" = target moves toward camera direction
    screenUp.negate();

    // Only move on XZ plane (ground plane)
    this.lookTarget.addScaledVector(right, dx);
    this.lookTarget.addScaledVector(screenUp, dy);

    this._updateCameraPosition();
  }

  /**
   * Zoom the camera in/out
   * @param {number} delta - Positive to zoom in, negative to zoom out
   */
  zoom(delta) {
    this.targetDistance += delta;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance, this.minZoom, this.maxZoom);
    this._updateCameraPosition();
  }

  /**
   * Set viewport dimensions (call on window resize)
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Handle keyboard input for panning
   * @param {KeyboardEvent} e
   * @param {'down'|'up'} type
   */
  onKeyEvent(e, type) {
    const key = e.key;
    if (key in this.keys) {
      this.keys[key] = type === 'down';
    }
  }

  /**
   * Update key-based panning
   * @param {number} _deltaTime - Delta time in seconds
   */
  updateKeys(_deltaTime) {
    let dx = 0, dy = 0;

    if (this.keys.w || this.keys.ArrowUp) dy -= this.panSpeed;
    if (this.keys.s || this.keys.ArrowDown) dy += this.panSpeed;
    if (this.keys.a || this.keys.ArrowLeft) dx -= this.panSpeed;
    if (this.keys.d || this.keys.ArrowRight) dx += this.panSpeed;

    if (dx !== 0 || dy !== 0) {
      this.pan(dx, dy);
    }
  }

  /**
   * Set mouse position for edge-pan detection
   * @param {number} x - Screen X
   * @param {number} y - Screen Y
   */
  setMousePosition(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    this.isMouseOnScreen = true;
  }

  /**
   * Hide mouse (when cursor leaves window)
   */
  hideMouse() {
    this.isMouseOnScreen = false;
  }

  /**
   * Update edge-based panning
   * @param {number} deltaTime - Delta time in seconds
   */
  updateEdges(deltaTime) {
    if (!this.isMouseOnScreen) return;

    const margin = this.edgeMargin;
    const speed = this.edgePanSpeed * deltaTime;

    let dx = 0, dy = 0;

    if (this.mouseX < margin) dx = speed;          // left edge → pan left
    else if (this.mouseX > this.width - margin) dx = -speed; // right edge → pan right

     if (this.mouseY < margin) dy = -speed;          // top edge → pan up
     else if (this.mouseY > this.height - margin) dy = speed; // bottom edge → pan down

    if (dx !== 0 || dy !== 0) {
      this.pan(dx, dy);
    }
  }

  /**
   * Get the camera's current look target
   * @returns {THREE.Vector3}
   */
  getLookTarget() {
    return this.lookTarget.clone();
  }

  /**
   * Set the camera's look target
   * @param {THREE.Vector3} target
   */
  setLookTarget(target) {
    this.lookTarget.copy(target);
    this._updateCameraPosition();
  }

  /**
   * Smoothly move the look target toward a position
   * @param {THREE.Vector3} target
   * @param {number} lerpFactor - 0..1 interpolation factor per frame
   */
  lerpLookTarget(target, lerpFactor = 0.1) {
    this.lookTarget.lerp(target, lerpFactor);
    this._updateCameraPosition();
  }

  /**
   * Convert screen coordinates to a ray for world picking
   * @param {number} ndcX - Normalized device X (-1..1)
   * @param {number} ndcY - Normalized device Y (-1..1)
   * @returns {THREE.Raycaster}
   */
  screenToRay(ndcX, ndcY) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return raycaster;
  }
}