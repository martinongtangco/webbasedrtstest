/**
 * ADR-17 — WebRTC Connection Manager
 *
 * Establishes peer-to-peer WebRTC data channels for game communication.
 * Uses the WebSocket server as a signaling server for SDP/ICE exchange.
 * Falls back to WebSocket relay if WebRTC cannot establish.
 *
 * Usage:
 *   const webrtc = new WebRTCConnection(socket, isHost, callbacks);
 *   webrtc.start();  // host creates offer
 *   // or: webrtc.accept(offer);  // guest accepts offer
 *   webrtc.send(data);  // send via data channel
 */

// ── STUN/TURN Servers ──────────────────────────────────────────────────
// Public STUN servers (free, no auth needed)
const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['stun:stun2.cloudflare.com:3478'] },
    // OpenRELAY TURN servers (free tier)
    {
      urls: ['turn:openrelay.metered.ca:80'],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: ['turn:openrelay.metered.ca:443'],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// Timeout for WebRTC connection (ms)
const WEBRTC_TIMEOUT = 15000;

/**
 * WebRTC Connection Manager
 * @param {WebSocket} ws — Signaling WebSocket (to relay server)
 * @param {boolean} isHost — Whether this peer is the host (creates offer)
 * @param {object} opts — Callbacks
 */
export class WebRTCConnection {
  constructor(ws, isHost, opts = {}) {
    this.ws = ws;                 // Signaling WebSocket
    this.isHost = isHost;         // Host creates offer, guest creates answer
    this.pc = null;               // RTCPeerConnection
    this.dc = null;               // RTCDataChannel
    this.connected = false;        // Data channel is open
    this.failed = false;           // WebRTC failed, use relay
    this.timeout = WEBRTC_TIMEOUT;

    // Callbacks
    this.onMessage = opts.onMessage || (() => {});
    this.onConnected = opts.onConnected || (() => {});
    this.onFailed = opts.onFailed || (() => {});
    this.onDisconnected = opts.onDisconnected || (() => {});

    // Internal state
    this._timeoutTimer = null;
    this._pendingCandidates = [];  // ICE candidates received before remoteDescription is set
  }

  /**
   * Start as host: create RTCPeerConnection, data channel, and offer
   */
  start() {
    this._createConnection();
    this._createDataChannel();
    this._startTimeout();

    this.pc.createOffer()
      .then(offer => this.pc.setLocalDescription(offer))
      .then(() => {
        // Wait for ICE gathering to complete (or send early offer)
        // We send immediately for lower latency; ICE candidates follow
        const offer = this.pc.localDescription;
        this.ws.send(JSON.stringify({
          type: 'webrtc_offer',
          sdp: offer.toJSON()
        }));
      })
      .catch(err => {
        console.error('[WebRTC] Failed to create offer:', err);
        this._fail('Failed to create offer');
      });
  }

  /**
   * Accept as guest: create answer to host's offer
   * @param {object} sdp — SDP offer from host
   */
  accept(sdp) {
    this._createConnection();

    // Set up data channel handler (guest receives channel from host)
    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this._setupDataChannel();
    };

    this._startTimeout();

    this.pc.setRemoteDescription(new RTCSessionDescription(sdp))
      .then(() => this.pc.createAnswer())
      .then(answer => this.pc.setLocalDescription(answer))
      .then(() => {
        const answer = this.pc.localDescription;
        this.ws.send(JSON.stringify({
          type: 'webrtc_answer',
          sdp: answer.toJSON()
        }));
      })
      .catch(err => {
        console.error('[WebRTC] Failed to accept offer:', err);
        this._fail('Failed to accept offer');
      });
  }

  /**
   * Set the guest's SDP answer on the host side
   * @param {object} sdp — SDP answer from guest
   */
  setAnswer(sdp) {
    this.pc.setRemoteDescription(new RTCSessionDescription(sdp))
      .catch(err => {
        console.error('[WebRTC] Failed to set answer:', err);
        this._fail('Failed to set answer');
      });
  }

  /**
   * Add an ICE candidate from the remote peer
   * @param {object} candidate — RTCIceCandidateInit
   */
  addCandidate(candidate) {
    if (this.pc.remoteDescription) {
      this.pc.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(err => {
          console.warn('[WebRTC] Failed to add candidate:', err);
        });
    } else {
      // Queue candidate until remoteDescription is set
      this._pendingCandidates.push(candidate);
    }
  }

  /**
   * Send data through the WebRTC data channel
   * @param {string} data — JSON string to send
   */
  send(data) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(data);
    } else if (!this.failed) {
      // Data channel not ready yet — send via signaling relay as fallback
      console.warn('[WebRTC] Data channel not ready, sending via relay');
      this.ws.send(data);
    }
  }

  /**
   * Signal that WebRTC failed and fall back to WebSocket relay
   */
  signalFallback() {
    this.failed = true;
    this._clearTimeout();
    this.ws.send(JSON.stringify({ type: 'webrtc_use_relay' }));
    this.onFailed();
  }

  /**
   * Clean up WebRTC connection
   */
  close() {
    this._clearTimeout();
    if (this.dc) {
      try { this.dc.close(); } catch {}
      this.dc = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
    this.connected = false;
    this.failed = true;
  }

  // ── Internal Methods ─────────────────────────────────────────

  /** Create the RTCPeerConnection */
  _createConnection() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate via signaling server
        this.ws.send(JSON.stringify({
          type: 'webrtc_candidate',
          candidate: event.candidate.toJSON()
        }));
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return; // Already closed
      if (this.pc.connectionState === 'connected') {
        this._clearTimeout();
        console.log('[WebRTC] Peer connection established');
      } else if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        console.warn('[WebRTC] Peer connection failed/disconnected');
        this._fail('Peer connection failed');
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return; // Already closed
      if (this.pc.iceConnectionState === 'failed') {
        this._fail('ICE connection failed');
      }
    };
  }

  /** Create a data channel (host side) */
  _createDataChannel() {
    this.dc = this.pc.createDataChannel('game', {
      ordered: true,       // Messages delivered in order
      maxRetransmits: 3    // Limit retransmissions for real-time gameplay
    });
    this._setupDataChannel();
  }

  /** Set up data channel event handlers */
  _setupDataChannel() {
    if (!this.dc) return;

    this.dc.onopen = () => {
      this.connected = true;
      this._clearTimeout();
      console.log('[WebRTC] Data channel open');
      this.onConnected();
    };

    this.dc.onmessage = (event) => {
      this.onMessage(event.data);
    };

    this.dc.onclose = () => {
      this.connected = false;
      this.onDisconnected();
    };

    this.dc.onerror = (err) => {
      console.error('[WebRTC] Data channel error:', err);
      this._fail('Data channel error');
    };
  }

  /** Start the connection timeout */
  _startTimeout() {
    this._clearTimeout();
    this._timeoutTimer = setTimeout(() => {
      if (!this.connected) {
        this._fail('Connection timeout');
      }
    }, this.timeout);
  }

  /** Clear the connection timeout */
  _clearTimeout() {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
  }

  /** Handle WebRTC failure */
  _fail(reason) {
    if (this.failed) return; // Already failed
    console.warn(`[WebRTC] Failure: ${reason} — falling back to WebSocket relay`);
    this.failed = true;
    this._clearTimeout();
    // Notify other peer
    this.ws.send(JSON.stringify({ type: 'webrtc_use_relay' }));
    this.onFailed();
  }
}
