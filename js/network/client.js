/**
 * NetworkClient — WebSocket-based LAN multiplayer with WebRTC support (ADR-17).
 *
 * Host runs the authoritative simulation and broadcasts game state.
 * Guest sends input and receives state from the host.
 *
 * Modes:
 * - 'host': LAN host (WebSocket relay)
 * - 'guest': LAN guest (WebSocket relay)
 * - 'internet-host': Internet host (WebRTC P2P with signaling server)
 * - 'internet-guest': Internet guest (WebRTC P2P with signaling server)
 * - 'spectator': Read-only viewer (WebSocket relay)
 */

import { WebRTCConnection } from './webrtc.js';

export class NetworkClient {
  /**
   * @param {'host'|'guest'|'internet-host'|'internet-guest'|'spectator'} mode
   * @param {object} opts
   */
  constructor(mode, opts = {}) {
    this.mode = mode;
    this.ws = null;
    this.connected = false;
    this.role = null; // 'host' | 'guest' | 'spectator'
    this.sessionId = null;
    // ADR-17: WebRTC connection
    this.webrtc = null;
    this.useWebrtc = (mode === 'internet-host' || mode === 'internet-guest');
    this.webrtcConnected = false;
    this.serverUrl = null; // ADR-17: Server URL for remote connections

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
    // ADR-17: WebRTC status callbacks
    this.onWebrtcConnected = opts.onWebrtcConnected || (() => {});
    this.onWebrtcFailed = opts.onWebrtcFailed || (() => {});

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
   * ADR-17: Initialize WebRTC connection after WebSocket is ready
   */
  _initWebrtc() {
    if (!this.useWebrtc || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.webrtc) return; // Already initialized

    try {
      this.webrtc = new WebRTCConnection(this.ws, this.role === 'host', {
        onMessage: (data) => {
          try {
            const msg = JSON.parse(data);
            this._handleMessage(msg);
          } catch (e) {
            this.onError(`Bad WebRTC message: ${e.message}`);
          }
        },
        onConnected: () => {
          this.webrtcConnected = true;
          this.onWebrtcConnected();
        },
        onFailed: () => {
          this.webrtcConnected = false;
          this.onWebrtcFailed();
        },
        onDisconnected: () => {
          this.webrtcConnected = false;
        }
      });

      // Host starts the WebRTC handshake; guest waits for offer
      if (this.role === 'host') {
        // Wait for guest_connected event before creating offer
        // (we'll start it in the guest_connected callback)
      }
    } catch (e) {
      console.error('[WebRTC] Failed to initialize:', e);
      this.onError(`WebRTC not supported: ${e.message}`);
      this.useWebrtc = false;
    }
  }

  /**
   * ADR-17: Start WebRTC offer creation (called after guest connects)
   */
  _startWebrtcOffer() {
    if (this.webrtc && !this.webrtc.failed) {
      this.webrtc.start();
    }
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

  /**
   * ADR-17: Connect as host for internet play (WebRTC with signaling)
   * Connects to the server at the same origin (must be publicly reachable)
   */
  connectInternetHost() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    this._connect(url);
  }

  /**
   * ADR-17: Connect as guest for internet play (WebRTC with signaling)
   * @param {string} serverAddr — Signaling server address, e.g. "play.frontieruprising.com:8181"
   */
  connectInternetGuest(serverAddr) {
    // Determine protocol
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${serverAddr}`;
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
      // ADR-17: Initialize WebRTC for internet modes
      if (this.useWebrtc) {
        this._initWebrtc();
      }
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
          // ADR-17: Initialize WebRTC for internet guest (role needed)
          if (this.useWebrtc && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._initWebrtc();
          }
        }
        break;

      case 'guest_connected':
        if (this.role === 'host') {
          this.onGuestConnected();
          // ADR-17: Start WebRTC offer after guest connects
          if (this.useWebrtc) {
            this._startWebrtcOffer();
          }
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

      case 'guest_input':
        // ADR-17: Server forwards guest input with this type
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

      // ADR-17: Server info (public URL for remote connections)
      case 'server_info':
        this.serverUrl = msg.serverUrl;
        break;

      // ADR-17: WebRTC signaling messages

      case 'webrtc_offer':
        // Guest receives offer from host; accept it
        if (this.role === 'guest' && this.useWebrtc && this.webrtc) {
          this.webrtc.accept(msg.sdp);
        }
        break;

      case 'webrtc_answer':
        // Host receives answer from guest
        if (this.role === 'host' && this.useWebrtc && this.webrtc) {
          this.webrtc.setAnswer(msg.sdp);
        }
        break;

      case 'webrtc_candidate':
        // Both sides receive ICE candidates
        if (this.useWebrtc && this.webrtc) {
          this.webrtc.addCandidate(msg.candidate);
        }
        break;

      case 'webrtc_use_relay':
        // Other peer signals WebRTC fallback; use relay
        if (this.useWebrtc && this.webrtc) {
          this.webrtcConnected = false;
          this.webrtc.failed = true;
          console.log('[Net] Peer requested relay fallback');
        }
        break;

      default:
        break;
    }
  }

  /**
   * Send a message (queues if not yet connected)
   * ADR-17: Prefers WebRTC data channel when available
   */
  send(msg) {
    const data = JSON.stringify(msg);

    // ADR-17: Send via WebRTC data channel if connected
    if (this.webrtc && this.webrtc.connected && !this.webrtc.failed) {
      this.webrtc.send(data);
      return;
    }

    // Fall back to WebSocket relay
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
    // ADR-17: Close WebRTC connection
    if (this.webrtc) {
      this.webrtc.close();
      this.webrtc = null;
    }
    this.webrtcConnected = false;
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

  /**
   * ADR-17: Check if WebRTC is available in this browser
   * @returns {boolean}
   */
  static isWebrtcSupported() {
    return typeof RTCPeerConnection !== 'undefined' &&
           typeof RTCDataChannel !== 'undefined';
  }

  /**
   * ADR-17: Get the connection type string
   * @returns {string} 'webrtc' | 'relay' | 'none'
   */
  getConnectionType() {
    if (this.webrtc && this.webrtc.connected) return 'webrtc';
    if (this.connected) return 'relay';
    return 'none';
  }
}
