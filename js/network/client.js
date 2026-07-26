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
    this.role = null; // 'host' | 'guest'
    this.sessionId = null;

    // Callbacks
    this.onGuestConnected = opts.onGuestConnected || (() => {});
    this.onOpponentLeft = opts.onOpponentLeft || (() => {});
    this.onGameState = opts.onGameState || (() => {});
    this.onPlayerInput = opts.onPlayerInput || (() => {});
    this.onError = opts.onError || ((msg) => console.warn('[Net]', msg));

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

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}
