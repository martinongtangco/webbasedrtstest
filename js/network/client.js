/**
 * NetworkClient — WebSocket-based LAN multiplayer.
 *
 * Host runs the authoritative simulation and broadcasts game state.
 * Guest sends input and receives state from the host.
 */

export class NetworkClient {
  /**
   * @param {'host'|'guest'} mode
   * @param {object} opts
   */
  constructor(mode, opts = {}) {
    this.mode = mode;
    this.ws = null;
    this.connected = false;
    this.role = null; // 'host' | 'guest' | 'spectator'
    this.sessionId = null;

    // Callbacks
    this.onGuestConnected = opts.onGuestConnected || (() => {});
    this.onOpponentLeft = opts.onOpponentLeft || (() => {});
    this.onGameState = opts.onGameState || (() => {});
    this.onPlayerInput = opts.onPlayerInput || (() => {});
    this.onError = opts.onError || ((msg) => console.warn('[Net]', msg));
    // ADR-11: Chat callback
    this.onChat = opts.onChat || ((sender, message) => {});
    // ADR-15: Spectator callbacks
    this.onSpectatorConnected = opts.onSpectatorConnected || (() => {});
    this.onSpectatorDisconnected = opts.onSpectatorDisconnected || (() => {});
    // ADR-19: Connection quality callback
    this.onPingUpdate = opts.onPingUpdate || ((pingMs, quality) => {});

    // ADR-19: Ping tracking
    this._pingTimes = [];         // last N ping measurements in ms
    this._pingInterval = 2000;    // ping every 2 seconds
    this._pingTimer = null;
    this._pendingPings = {};      // id → timestamp
    this._currentPing = null;     // current ping in ms
    this._currentQuality = 'unknown'; // 'excellent' | 'good' | 'fair' | 'poor'

    // Pending messages (queued until connected)
    this._queue = [];
  }

  /**
   * Connect as host (uses same-origin WebSocket)
   */
  connectHost() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    this._connect(url);
  }

  /**
   * Connect as guest to a remote host
   * @param {string} hostIp — e.g. "192.168.1.50:8181"
   */
  connectGuest(hostIp) {
    const proto = 'ws:';
    const url = `${proto}//${hostIp}`;
    this._connect(url);
  }

  /**
   * ADR-15: Connect as spectator to a running game
   * @param {string} hostIp — e.g. "192.168.1.50:8181"
   */
  connectSpectator(hostIp) {
    const proto = 'ws:';
    const url = `${proto}//${hostIp}`;
    this._connect(url);
  }

  _connect(url) {
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.onError(`Failed to create WebSocket: ${e.message}`);
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      // Flush queued messages
      for (const msg of this._queue) {
        this.ws.send(JSON.stringify(msg));
      }
      this._queue = [];
      // ADR-19: Start ping monitoring
      this._startPingTimer();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      } catch (e) {
        this.onError(`Bad message: ${e.message}`);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      // ADR-19: Stop ping monitoring
      this._stopPingTimer();
      this._currentPing = null;
      this._currentQuality = 'disconnected';
      this.onPingUpdate(null, 'disconnected');
      this.onOpponentLeft();
    };

    this.ws.onerror = () => {
      this.onError('WebSocket error');
    };
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'session':
        this.role = msg.role;
        this.sessionId = msg.sessionId;
        if (this.role === 'guest') {
          // Guest: server assigned us as guest — game starts
        }
        break;

      case 'guest_connected':
        if (this.role === 'host') {
          this.onGuestConnected();
        }
        break;

      case 'host_disconnected':
        this.onOpponentLeft();
        break;

      case 'guest_disconnected':
        if (this.role === 'host') {
          this.onOpponentLeft();
        }
        break;

      // ADR-15: Spectator connection events
      case 'spectator_connected':
        this.onSpectatorConnected();
        break;

      case 'spectator_disconnected':
        this.onSpectatorDisconnected();
        break;

      case 'game_state':
        // Host broadcasts full game state to guest
        this.onGameState(msg);
        break;

      case 'player_input':
        // Host receives guest input and integrates it into simulation
        if (this.role === 'host') {
          this.onPlayerInput({ action: msg.action, x: msg.x, z: msg.z, minX: msg.minX, minZ: msg.minZ, maxX: msg.maxX, maxZ: msg.maxZ });
        }
        break;

      // ADR-11: Chat message handling
      case 'chat':
        this.onChat(msg.sender || 'Opponent', msg.message);
        break;

      // ADR-19: Ping reply
      case 'ping_reply':
        if (this._pendingPings[msg.id] !== undefined) {
          const pingMs = Date.now() - this._pendingPings[msg.id];
          delete this._pendingPings[msg.id];
          this._pingTimes.push(pingMs);
          // Keep last 5 measurements
          if (this._pingTimes.length > 5) this._pingTimes.shift();
          // Compute average
          const avg = Math.round(this._pingTimes.reduce((a, b) => a + b, 0) / this._pingTimes.length);
          this._currentPing = avg;
          // Determine quality
          if (avg < 50) this._currentQuality = 'excellent';
          else if (avg < 100) this._currentQuality = 'good';
          else if (avg < 200) this._currentQuality = 'fair';
          else this._currentQuality = 'poor';
          this.onPingUpdate(avg, this._currentQuality);
        }
        break;

      // ADR-19: Ping request (from other side)
      case 'ping':
        this.send({ type: 'ping_reply', id: msg.id });
        break;

      default:
        break;
    }
  }

  /**
   * Send a message (queues if not yet connected)
   */
  send(msg) {
    const data = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this._queue.push(msg);
    }
  }

  /**
   * Send player input (unit commands, etc.)
   */
  sendInput(inputData) {
    this.send({ type: 'player_input', ...inputData });
  }

  /**
   * Send game state (host → guest)
   */
  sendGameState(state) {
    this.send({ type: 'game_state', ...state });
  }

  /**
   * ADR-11: Send a chat message
   * @param {string} message
   */
  sendChat(message) {
    const sender = this.role || 'player';
    this.send({ type: 'chat', sender, message });
    // Also show locally
    if (this.onChat) this.onChat(sender, message);
  }

  disconnect() {
    this._stopPingTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // ═══════════════════════════════════════════════════════════
  // ADR-19: Ping monitoring
  // ═══════════════════════════════════════════════════════════

  /** Start periodic ping checks */
  _startPingTimer() {
    this._stopPingTimer(); // clear any existing timer
    this._pingTimer = setInterval(() => {
      if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const id = Date.now() + Math.random();
      this._pendingPings[id] = Date.now();
      this.send({ type: 'ping', id });
    }, this._pingInterval);
  }

  /** Stop ping timer */
  _stopPingTimer() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Get current ping in milliseconds.
   * @returns {number|null}
   */
  getPing() {
    return this._currentPing;
  }

  /**
   * Get current connection quality string.
   * @returns {string} 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' | 'disconnected'
   */
  getQuality() {
    return this._currentQuality;
  }
}
