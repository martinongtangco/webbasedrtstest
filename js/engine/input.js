import * as THREE from 'three';

/**
 * InputManager handles mouse and keyboard input for the RTS game.
 * Tracks mouse position, clicks, drag selection, and key states.
 * Provides screen-to-world conversion via raycasting.
 */
export class InputManager {
  /**
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
   * @param {IsometricCamera} isoCamera - The isometric camera manager
   */
  constructor(renderer, isoCamera) {
    this.renderer = renderer;
    this.camera = isoCamera;

    // Mouse state
    this.mouse = new THREE.Vector2();       // NDC coordinates
    this.screenPos = new THREE.Vector2();   // Pixel coordinates
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.clickStart = new THREE.Vector2();  // Screen coords of click start
    this.isDragging = false;
    this.dragBox = null; // {x, y, w, h} in screen pixels

    // Click events (consumed per frame)
    this._leftClick = null;    // {screen: Vector2, ndc: Vector2, world: Vector3|null}
    this._rightClick = null;   // same
    this._leftDoubleClick = null;

    // Selection box (world space)
    this._selectionBox = null; // {min: Vector3, max: Vector3}

    // Last click timestamp for double-click detection
    this._lastClickTime = 0;
    this._lastClickPos = new THREE.Vector2();
    this.doubleClickThreshold = 300; // ms
    this.doubleClickDistance = 10;   // pixels

    // DOM elements
    this._canvas = renderer.domElement;

    this._bindEvents();
  }

  _bindEvents() {
    this._onMouseDown = (e) => this.onMouseDown(e);
    this._onMouseMove = (e) => this.onMouseMove(e);
    this._onMouseUp = (e) => this.onMouseUp(e);
    this._onWheel = (e) => this.onWheel(e);
    this._onContextMenu = (e) => this.onContextMenu(e);
    this._onKeyDown = (e) => this.onKeyDown(e);
    this._onKeyUp = (e) => this.onKeyUp(e);
    this._onMouseLeave = () => this.onMouseLeave();

    this._canvas.addEventListener('mousedown', this._onMouseDown);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mouseup', this._onMouseUp);
    this._canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this._canvas.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  /**
   * Remove all event listeners (cleanup)
   */
  dispose() {
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('mouseup', this._onMouseUp);
    this._canvas.removeEventListener('wheel', this._onWheel);
    this._canvas.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
  }

  onMouseDown(e) {
    if (e.button === 0) {
      this.mouseDown = true;
      this.clickStart.set(e.clientX, e.clientY);
      this.isDragging = false;
    } else if (e.button === 2) {
      this.rightMouseDown = true;
    }
  }

  onMouseMove(e) {
    // Update screen position
    this.screenPos.set(e.clientX, e.clientY);

    // Update NDC mouse
    const rect = this._canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Update camera mouse position for edge pan
    this.camera.setMousePosition(e.clientX, e.clientY);

    // Track drag
    if (this.mouseDown) {
      const dx = e.clientX - this.clickStart.x;
      const dy = e.clientY - this.clickStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.isDragging = true;
      }
      this.dragBox = {
        x: Math.min(e.clientX, this.clickStart.x),
        y: Math.min(e.clientY, this.clickStart.y),
        w: Math.abs(dx),
        h: Math.abs(dy)
      };
    }
  }

  onMouseUp(e) {
    if (e.button === 0) {
      const now = performance.now();
      const pos = new THREE.Vector2(e.clientX, e.clientY);

      // Compute NDC
      const rect = this._canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      // World position via raycast (will be resolved against ground)
      const world = this.screenToWorld(ndc);

      if (!this.isDragging) {
        // Single click or double-click
        const dist = pos.distanceTo(this._lastClickPos);
        const timeDelta = now - this._lastClickTime;

        if (timeDelta < this.doubleClickThreshold && dist < this.doubleClickDistance) {
          // Double-click
          this._leftDoubleClick = { screen: pos.clone(), ndc: ndc.clone(), world: world };
        } else {
          // Single click
          this._leftClick = { screen: pos.clone(), ndc: ndc.clone(), world: world };
        }
      } else {
        // Drag → selection box
        this._selectionBox = this.screenToSelectionBox(ndc);
      }

      this.mouseDown = false;
      this.isDragging = false;
      this.dragBox = null;

      // Store for double-click detection
      if (!this._leftDoubleClick) {
        this._lastClickTime = now;
        this._lastClickPos.copy(pos);
      }
    } else if (e.button === 2) {
      const rect = this._canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const world = this.screenToWorld(ndc);
      this._rightClick = { screen: this.screenPos.clone(), ndc: ndc.clone(), world: world };
      this.rightMouseDown = false;
    }
  }

  onWheel(e) {
    e.preventDefault();
    // Scroll down (positive delta) → zoom out; scroll up → zoom in
    const zoomDelta = -e.deltaY * 0.15;
    this.camera.zoom(zoomDelta);
  }

  onContextMenu(e) {
    e.preventDefault();
  }

  onKeyDown(e) {
    this.camera.onKeyEvent(e, 'down');
  }

  onKeyUp(e) {
    this.camera.onKeyEvent(e, 'up');
  }

  onMouseLeave() {
    this.camera.hideMouse();
  }

  /**
   * Convert NDC mouse to world position on the ground plane (Y=0)
   * @param {THREE.Vector2} ndc - Normalized device coordinates
   * @returns {THREE.Vector3|null}
   */
  screenToWorld(ndc) {
    const raycaster = this.camera.screenToRay(ndc.x, ndc.y);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(groundPlane, intersection);
    return hit ? intersection.clone() : null;
  }

  /**
   * Convert a drag box in screen space to world-space bounding box on ground
   * @param {THREE.Vector2} currentNdc - Current NDC mouse position
   * @returns {{min: THREE.Vector3, max: THREE.Vector3}|null}
   */
  screenToSelectionBox(currentNdc) {
    const startNdc = new THREE.Vector2(
      ((this.clickStart.x - this._canvas.getBoundingClientRect().left) / this._canvas.clientWidth) * 2 - 1,
      -((this.clickStart.y - this._canvas.getBoundingClientRect().top) / this._canvas.clientHeight) * 2 + 1
    );

    // Get four corners of the screen rect and convert to world
    const corners = [
      new THREE.Vector2(startNdc.x, startNdc.y),
      new THREE.Vector2(currentNdc.x, startNdc.y),
      new THREE.Vector2(startNdc.x, currentNdc.y),
      new THREE.Vector2(currentNdc.x, currentNdc.y)
    ];

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldCorners = [];

    for (const corner of corners) {
      const raycaster = this.camera.screenToRay(corner.x, corner.y);
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
        worldCorners.push(intersection);
      }
    }

    if (worldCorners.length < 2) return null;

    const min = new THREE.Vector3(+Infinity, 0, +Infinity);
    const max = new THREE.Vector3(-Infinity, 0, -Infinity);

    for (const wc of worldCorners) {
      min.x = Math.min(min.x, wc.x);
      min.z = Math.min(min.z, wc.z);
      max.x = Math.max(max.x, wc.x);
      max.z = Math.max(max.z, wc.z);
    }

    return { min, max };
  }

  /**
   * Consume and return the left click event (null if none this frame)
   * @returns {object|null}
   */
  getLeftClick() {
    const click = this._leftClick;
    this._leftClick = null;
    return click;
  }

  /**
   * Consume and return the left double-click event
   * @returns {object|null}
   */
  getLeftDoubleClick() {
    const click = this._leftDoubleClick;
    this._leftDoubleClick = null;
    return click;
  }

  /**
   * Consume and return the right click event
   * @returns {object|null}
   */
  getRightClick() {
    const click = this._rightClick;
    this._rightClick = null;
    return click;
  }

  /**
   * Consume and return the selection box (world space on ground)
   * @returns {object|null}
   */
  getSelectionBox() {
    const box = this._selectionBox;
    this._selectionBox = null;
    return box;
  }

  /**
   * Get current NDC mouse position
   * @returns {THREE.Vector2}
   */
  getMouse() {
    return this.mouse.clone();
  }

  /**
   * Get current screen-space mouse position
   * @returns {THREE.Vector2}
   */
  getScreenPos() {
    return this.screenPos.clone();
  }

  /**
   * Get the current drag box in screen pixels (or null)
   * @returns {object|null}
   */
  getDragBox() {
    return this.dragBox;
  }

  /**
   * Check if the left mouse button is currently held down
   * @returns {boolean}
   */
  isLeftDown() {
    return this.mouseDown;
  }

  /**
   * Check if the right mouse button is currently held down
   * @returns {boolean}
   */
  isRightDown() {
    return this.rightMouseDown;
  }
}