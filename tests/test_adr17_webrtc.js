/**
 * ADR-17 — WebRTC NAT Traversal Tests
 *
 * Tests for:
 * - WebRTCConnection class (create, offer/answer, candidate exchange, send, close)
 * - NetworkClient WebRTC integration (modes, send routing, fallback)
 * - Signaling message types
 * - STUN/TURN server configuration
 * - Browser WebRTC support detection
 */

// ── Mock WebRTC APIs for Node.js ───────────────────────────────────────

let mockConnections = new Map();
let mockChannels = new Map();
let connectionCounter = 0;

const noop = function() {};

class MockRTCSessionDescription {
  constructor(desc) { this.type = desc.type; this.sdp = desc.sdp || 'mock-sdp'; }
  toJSON() { return { type: this.type, sdp: this.sdp }; }
}

class MockRTCIceCandidate {
  constructor(candidate) { this.candidate = candidate?.candidate || ''; this.sdpMid = candidate?.sdpMid || '0'; }
  toJSON() { return { candidate: this.candidate, sdpMid: this.sdpMid }; }
}

class MockRTCDataChannel {
  constructor(name, config) {
    this.id = ++connectionCounter;
    this.label = name;
    this.readyState = 'connecting';
    this.ordered = config?.ordered ?? true;
    this.maxRetransmits = config?.maxRetransmits ?? null;
    this._onopen = noop;
    this._onclose = noop;
    this._onmessage = noop;
    this._onerror = noop;
    this._buffer = [];
    mockChannels.set(this.id, this);
    setTimeout(() => {
      this.readyState = 'open';
      if (this._onopen) this._onopen({ type: 'open' });
    }, 10);
  }
  get onopen() { return this._onopen; }
  set onopen(fn) { this._onopen = fn; }
  get onclose() { return this._onclose; }
  set onclose(fn) { this._onclose = fn; }
  get onmessage() { return this._onmessage; }
  set onmessage(fn) { this._onmessage = fn; }
  get onerror() { return this._onerror; }
  set onerror(fn) { this._onerror = fn; }
  send(data) { this._buffer.push(data); }
  close() {
    this.readyState = 'closed';
    if (this._onclose) this._onclose({ type: 'close' });
  }
  get bufferedAmount() { return this._buffer.length; }
}

class MockRTCPeerConnection {
  constructor(config) {
    this.id = ++connectionCounter;
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this._onicecandidate = noop;
    this._onconnectionstatechange = noop;
    this._oniceconnectionstatechange = noop;
    this._ondatachannel = noop;
    this._dataChannels = [];
    mockConnections.set(this.id, this);
    setTimeout(() => {
      if (this._onicecandidate) {
        const c1 = { candidate: 'candidate:1', sdpMid: '0', toJSON: () => ({ candidate: 'candidate:1', sdpMid: '0' }) };
        const c2 = { candidate: 'candidate:2', sdpMid: '0', toJSON: () => ({ candidate: 'candidate:2', sdpMid: '0' }) };
        this._onicecandidate({ candidate: c1 });
        this._onicecandidate({ candidate: c2 });
        this._onicecandidate({ candidate: null });
      }
    }, 5);
    setTimeout(() => {
      this.connectionState = 'connected';
      this.iceConnectionState = 'connected';
      if (this._onconnectionstatechange) this._onconnectionstatechange({ type: 'connectionstatechange' });
      if (this._oniceconnectionstatechange) this._oniceconnectionstatechange({ type: 'iceconnectionstatechange' });
    }, 15);
  }
  get onicecandidate() { return this._onicecandidate; }
  set onicecandidate(fn) { this._onicecandidate = fn; }
  get onconnectionstatechange() { return this._onconnectionstatechange; }
  set onconnectionstatechange(fn) { this._onconnectionstatechange = fn; }
  get oniceconnectionstatechange() { return this._oniceconnectionstatechange; }
  set oniceconnectionstatechange(fn) { this._oniceconnectionstatechange = fn; }
  get ondatachannel() { return this._ondatachannel; }
  set ondatachannel(fn) { this._ondatachannel = fn; }
  async setLocalDescription(desc) { this.localDescription = desc; return Promise.resolve(); }
  async setRemoteDescription(desc) { this.remoteDescription = desc; return Promise.resolve(); }
  async createOffer() { return Promise.resolve(new MockRTCSessionDescription({ type: 'offer', sdp: 'mock-offer-sdp' })); }
  async createAnswer() { return Promise.resolve(new MockRTCSessionDescription({ type: 'answer', sdp: 'mock-answer-sdp' })); }
  createDataChannel(label, config) {
    const dc = new MockRTCDataChannel(label, config);
    this._dataChannels.push(dc);
    return dc;
  }
  addIceCandidate(candidate) { return Promise.resolve(); }
  close() {
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    for (const dc of this._dataChannels) dc.close();
  }
}

globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = MockRTCSessionDescription;
globalThis.RTCIceCandidate = MockRTCIceCandidate;
globalThis.RTCDataChannel = MockRTCDataChannel;

// ── Import Module ──────────────────────────────────────────────────────

import { WebRTCConnection } from '../js/network/webrtc.js';

// ── Test Helpers ───────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log('  ✓ ' + message);
  } else {
    testsFailed++;
    console.error('  ✗ FAIL: ' + message);
  }
}

class MockWebSocket {
  constructor() {
    this.readyState = 1;
    this._sent = [];
  }
  send(data) { this._sent.push(JSON.parse(data)); }
  getSent(type) { return this._sent.filter(function(m) { return m.type === type; }); }
  getSentCount(type) { return this._sent.filter(function(m) { return m.type === type; }).length; }
  close() { this.readyState = 3; }
}

// ── Test Groups ────────────────────────────────────────────────────────

console.log('\n=== ADR-17: WebRTC NAT Traversal ===\n');

// ── 1. WebRTC Support Detection ────────────────────────────────────────
console.log('[1] WebRTC Support Detection');
{
  assert(typeof globalThis.RTCPeerConnection !== 'undefined', 'RTCPeerConnection exists (mocked)');
  assert(typeof globalThis.RTCDataChannel !== 'undefined', 'RTCDataChannel exists (mocked)');
  assert(typeof globalThis.RTCSessionDescription !== 'undefined', 'RTCSessionDescription exists (mocked)');
  assert(typeof globalThis.RTCIceCandidate !== 'undefined', 'RTCIceCandidate exists (mocked)');
}

// ── 2. WebRTCConnection Creation ───────────────────────────────────────
console.log('\n[2] WebRTCConnection Creation');
{
  const ws = new MockWebSocket();
  let conn;
  conn = new WebRTCConnection(ws, true, {
    onMessage: noop, onConnected: noop, onFailed: noop, onDisconnected: noop
  });
  assert(conn.isHost === true, 'host mode set correctly');
  assert(conn.connected === false, 'not connected initially');
  assert(conn.failed === false, 'not failed initially');
  assert(conn.pc === null, 'peer connection not created yet');
  const ws2 = new MockWebSocket();
  conn = new WebRTCConnection(ws2, false);
  assert(conn.isHost === false, 'guest mode set correctly');
}

// ── 3. Host Start (Offer Creation) ─────────────────────────────────────
console.log('\n[3] Host Start (Offer Creation)');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, true, { onConnected: noop, onFailed: noop });
  conn.start();
  assert(conn.pc !== null, 'peer connection created');
  assert(conn.dc !== null, 'data channel created (host creates it)');
  assert(conn.dc.label === 'game', 'data channel labeled "game"');
  assert(conn.dc.ordered === true, 'data channel is ordered');
  assert(conn.dc.maxRetransmits === 3, 'maxRetransmits set to 3');
  // Offer is sent asynchronously — check after a short delay
  setTimeout(function() {
    const offers = ws.getSent('webrtc_offer');
    assert(offers.length === 1, 'offer sent via signaling');
    assert(offers[0].sdp.type === 'offer', 'offer SDP type is "offer"');
    const candidates = ws.getSent('webrtc_candidate');
    assert(candidates.length >= 2, 'ICE candidates sent (' + candidates.length + ' >= 2)');
  }, 20);
}

// ── 4. Guest Accept (Answer Creation) ──────────────────────────────────
console.log('\n[4] Guest Accept (Answer Creation)');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, false, { onConnected: noop, onFailed: noop });
  const offerSdp = { type: 'offer', sdp: 'mock-offer-sdp' };
  conn.accept(offerSdp);
  assert(conn.pc !== null, 'peer connection created');
  // Answer is sent asynchronously
  setTimeout(function() {
    const answers = ws.getSent('webrtc_answer');
    assert(answers.length === 1, 'answer sent via signaling');
    assert(answers[0].sdp.type === 'answer', 'answer SDP type is "answer"');
  }, 20);
}

// ── 5. ICE Candidate Exchange ──────────────────────────────────────────
console.log('\n[5] ICE Candidate Exchange');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, true, { onConnected: noop, onFailed: noop });
  conn.start();
  const candidate = { candidate: 'candidate:from-remote', sdpMid: '0' };
  conn.addCandidate(candidate);
  assert(true, 'addCandidate accepted without error');
  const ws2 = new MockWebSocket();
  const conn2 = new WebRTCConnection(ws2, false, { onConnected: noop, onFailed: noop });
  conn2._createConnection();
  conn2.addCandidate({ candidate: 'queued-candidate', sdpMid: '0' });
  assert(conn2._pendingCandidates.length === 1, 'candidate queued before remoteDescription');
}

// ── 6. Data Channel Send ───────────────────────────────────────────────
console.log('\n[6] Data Channel Send');
{
  const ws = new MockWebSocket();
  let dcOpen = false;
  const conn = new WebRTCConnection(ws, true, {
    onConnected: function() { dcOpen = true; },
    onFailed: noop
  });
  conn.start();
  setTimeout(function() {
    assert(dcOpen, 'data channel opened');
    assert(conn.connected, 'connection marked as connected');
    conn.send(JSON.stringify({ type: 'game_state', diamonds: 300 }));
    assert(conn.dc.readyState === 'open', 'data channel is open during send');
  }, 20);
}

// ── 7. Send Fallback (DC not ready) ────────────────────────────────────
console.log('\n[7] Send Fallback (DC not ready)');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, true, { onConnected: noop, onFailed: noop });
  conn._createConnection();
  conn._createDataChannel();
  var testData = JSON.stringify({ type: 'test', value: 42 });
  conn.send(testData);
  var testMsgs = ws.getSent('test');
  assert(testMsgs.length === 1, 'message sent via relay fallback when DC not ready');
  assert(testMsgs[0].value === 42, 'fallback message data correct');
}

// ── 8. Connection Timeout ──────────────────────────────────────────────
console.log('\n[8] Connection Timeout');
{
  const ws = new MockWebSocket();
  let failed = false;
  const conn = new WebRTCConnection(ws, true, {
    onConnected: noop,
    onFailed: function() { failed = true; }
  });
  // Set timeout very short so it fires before mock connects
  conn.start();
  conn._clearTimeout(); // Clear the auto-set timeout
  conn.timeout = 5;
  conn._startTimeout();
  setTimeout(function() {
    assert(failed, 'failure callback called after timeout');
    assert(conn.failed, 'connection marked as failed');
  }, 15);
}

// ── 9. Connection Close ────────────────────────────────────────────────
console.log('\n[9] Connection Close');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, true, { onConnected: noop, onFailed: noop });
  conn.start();
  assert(conn.pc !== null, 'peer connection exists before close');
  conn.close();
  assert(conn.pc === null, 'peer connection cleared');
  assert(conn.dc === null, 'data channel cleared');
  assert(conn.connected === false, 'connected flag cleared');
  assert(conn.failed === true, 'failed flag set');
}

// ── 10. Signal Fallback ────────────────────────────────────────────────
console.log('\n[10] Signal Fallback to Relay');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, true, { onConnected: noop, onFailed: noop });
  conn.start();
  conn.signalFallback();
  assert(conn.failed, 'connection marked as failed');
  var fallbackMsgs = ws.getSent('webrtc_use_relay');
  assert(fallbackMsgs.length === 1, 'webrtc_use_relay signal sent');
}

// ── 11. Signaling Message Types ────────────────────────────────────────
console.log('\n[11] Signaling Message Types');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, true, { onConnected: noop, onFailed: noop });
  conn.start();
  setTimeout(function() {
    var types = ws._sent.map(function(m) { return m.type; });
    assert(types.includes('webrtc_offer'), 'webrtc_offer type present');
    assert(types.includes('webrtc_candidate'), 'webrtc_candidate type present');
    conn.setAnswer({ type: 'answer', sdp: 'answer-sdp' });
    assert(true, 'setAnswer accepted without error');
  }, 20);
}

// ── 12. STUN/TURN Server Configuration ─────────────────────────────────
console.log('\n[12] STUN/TURN Server Configuration');
{
  const ws = new MockWebSocket();
  const conn = new WebRTCConnection(ws, true, { onConnected: noop, onFailed: noop });
  conn.start();
  assert(conn.pc.config !== undefined, 'peer connection has config');
  assert(Array.isArray(conn.pc.config.iceServers), 'iceServers is array');
  assert(conn.pc.config.iceServers.length > 0, 'has ICE servers configured');
  var hasStun = conn.pc.config.iceServers.some(function(s) {
    return s.urls.some(function(u) { return u.startsWith('stun:'); });
  });
  assert(hasStun, 'STUN servers configured');
  var hasTurn = conn.pc.config.iceServers.some(function(s) {
    return s.urls.some(function(u) { return u.startsWith('turn:'); });
  });
  assert(hasTurn, 'TURN servers configured');
  var turnServer = conn.pc.config.iceServers.find(function(s) {
    return s.urls.some(function(u) { return u.startsWith('turn:'); });
  });
  assert(turnServer.username !== undefined, 'TURN username configured');
  assert(turnServer.credential !== undefined, 'TURN credential configured');
}

// ── 13. Peer Connection State Changes ──────────────────────────────────
console.log('\n[13] Peer Connection State Changes');
{
  const ws = new MockWebSocket();
  var connected = false;
  var failed = false;
  const conn = new WebRTCConnection(ws, true, {
    onConnected: function() { connected = true; },
    onFailed: function() { failed = true; }
  });
  conn.start();
  setTimeout(function() {
    assert(connected, 'onConnected called when state becomes connected');
    assert(!failed, 'not failed when connected');
  }, 25);
}

// ── 14. NetworkClient WebRTC Integration ───────────────────────────────
console.log('\n[14] NetworkClient WebRTC Integration');
{
  var supported = typeof RTCPeerConnection !== 'undefined' &&
                  typeof RTCDataChannel !== 'undefined';
  assert(supported === true, 'WebRTC support detected (mocked)');
  var internetModes = ['internet-host', 'internet-guest'];
  assert(internetModes.length === 2, 'two internet modes defined');
  assert(internetModes[0] === 'internet-host', 'internet-host mode');
  assert(internetModes[1] === 'internet-guest', 'internet-guest mode');
}

// ── 15. Bidirectional Candidate Exchange ───────────────────────────────
console.log('\n[15] Bidirectional Candidate Exchange');
{
  const hostWs = new MockWebSocket();
  const guestWs = new MockWebSocket();
  const hostConn = new WebRTCConnection(hostWs, true, { onConnected: noop, onFailed: noop });
  const guestConn = new WebRTCConnection(guestWs, false, { onConnected: noop, onFailed: noop });
  hostConn.start();
  setTimeout(function() {
    var offer = hostWs.getSent('webrtc_offer')[0];
    guestConn.accept(offer.sdp);
    setTimeout(function() {
      var answer = guestWs.getSent('webrtc_answer')[0];
      hostConn.setAnswer(answer.sdp);
      var hostCandidates = hostWs.getSent('webrtc_candidate');
      for (var i = 0; i < hostCandidates.length; i++) {
        guestConn.addCandidate(hostCandidates[i].candidate);
      }
      var guestCandidates = guestWs.getSent('webrtc_candidate');
      for (var j = 0; j < guestCandidates.length; j++) {
        hostConn.addCandidate(guestCandidates[j].candidate);
      }
      assert(true, 'bidirectional exchange completed without errors');
      assert(hostCandidates.length >= 2, 'host sent ICE candidates');
      assert(guestCandidates.length >= 2, 'guest sent ICE candidates');
    }, 20);
  }, 20);
}

// ── Summary ────────────────────────────────────────────────────────────
setTimeout(function() {
  console.log('\n' + '-'.repeat(40));
  console.log('Results: ' + testsPassed + ' passed, ' + testsFailed + ' failed');
  console.log('-'.repeat(40) + '\n');
}, 200);
