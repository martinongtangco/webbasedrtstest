/**
 * Frontier Uprising — Game Server
 *
 * Serves static client files over HTTP and relays multiplayer messages
 * over WebSocket. Run with: node server.js
 *
 * Dependencies: npm install ws
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8181;
const STATIC_DIR = path.join(__dirname);

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.mjs': 'application/javascript; charset=utf-8',
  '.map': 'text/plain',
};

// ── HTTP Server ────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Default to index.html
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  }

  const filePath = path.join(STATIC_DIR, urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Check file exists and serve
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ── WebSocket Server ───────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

// Active game sessions: each session has up to 2 players + spectators
// Session format: { id, host, guest, spectators: [], createdAt }
let sessions = new Map(); // ws -> session
let sessionCounter = 0;

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientIp}`);

  // Determine role: if no active session exists, this client becomes the host
  // If a session exists with only a host, this client becomes the guest
  // If a session has host + guest, this client becomes a spectator (ADR-15)
  let session = null;
  let role = 'host';

  // Find an open session (host exists, no guest)
  for (const [, s] of sessions) {
    if (s.host && !s.guest) {
      session = s;
      role = 'guest';
      break;
    }
  }

  // ADR-15: If no open session, look for a full session to spectate
  if (!session) {
    for (const [, s] of sessions) {
      if (s.host && s.guest) {
        session = s;
        role = 'spectator';
        break;
      }
    }
  }

  if (!session) {
    // Create new session, this client is the host
    session = {
      id: ++sessionCounter,
      host: ws,
      guest: null,
      spectators: [],
      createdAt: Date.now()
    };
    role = 'host';
    console.log(`[WS] New session ${session.id} created (host: ${clientIp})`);
  } else if (role === 'guest') {
    session.guest = ws;
    console.log(`[WS] Guest joined session ${session.id} (${clientIp})`);
  } else if (role === 'spectator') {
    // ADR-15: Add as spectator
    session.spectators.push(ws);
    console.log(`[WS] Spectator joined session ${session.id} (${clientIp})`);
  }

  sessions.set(ws, session);

  // Send role assignment
  ws.send(JSON.stringify({
    type: 'session',
    role: role,
    sessionId: session.id
  }));

  // Notify host that a guest connected
  if (role === 'guest' && session.host.readyState === WebSocket.OPEN) {
    session.host.send(JSON.stringify({
      type: 'guest_connected',
      sessionId: session.id
    }));
  }
  // ADR-15: Notify host and guest that a spectator connected
  if (role === 'spectator') {
    if (session.host.readyState === WebSocket.OPEN) {
      session.host.send(JSON.stringify({
        type: 'spectator_connected',
        sessionId: session.id
      }));
    }
    if (session.guest && session.guest.readyState === WebSocket.OPEN) {
      session.guest.send(JSON.stringify({
        type: 'spectator_connected',
        sessionId: session.id
      }));
    }
    // Send current game state to the spectator immediately
    // (host will continue broadcasting state; spectator just needs to start receiving)
  }

  // Handle messages
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, session, msg);
    } catch (e) {
      console.error('[WS] Failed to parse message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected from session ${session.id}`);
    handleDisconnect(ws, session);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    handleDisconnect(ws, session);
  });
});

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(ws, session, msg) {
  switch (msg.type) {
    case 'game_state':
      // Host broadcasts game state to guest
      if (ws === session.host && session.guest && session.guest.readyState === WebSocket.OPEN) {
        session.guest.send(JSON.stringify(msg));
      }
      // ADR-15: Also relay to spectators
      if (ws === session.host) {
        relayToSpectators(session, msg);
      }
      break;

    case 'player_input':
      // Guest sends input to host (or host sends its own input)
      if (ws === session.guest && session.host && session.host.readyState === WebSocket.OPEN) {
        // Forward guest input to host, tagging it
        const forwarded = { ...msg, type: 'guest_input', sessionId: session.id };
        session.host.send(JSON.stringify(forwarded));
      } else if (ws === session.host) {
        // Host's own input — apply locally (no forwarding needed)
        // The host applies its own input directly in its simulation
      }
      // ADR-15: Spectator input is silently ignored (read-only)
      break;

    case 'chat':
      // Relay chat to all connected in session
      broadcast(session, msg, ws);
      break;

    case 'ack':
      // Acknowledgment — no relay needed
      break;

    default:
      console.warn(`[WS] Unknown message type: ${msg.type}`);
  }
}

/** ADR-15: Send a message to all connected spectators */
function relayToSpectators(session, msg) {
  const data = JSON.stringify(msg);
  if (session.spectators) {
    for (const specWs of session.spectators) {
      if (specWs.readyState === WebSocket.OPEN) {
        specWs.send(data);
      }
    }
  }
}

/**
 * Broadcast a message to all connected clients in a session except the sender
 */
function broadcast(session, msg, excludeWs) {
  const data = JSON.stringify(msg);
  if (session.host && session.host !== excludeWs && session.host.readyState === WebSocket.OPEN) {
    session.host.send(data);
  }
  if (session.guest && session.guest !== excludeWs && session.guest.readyState === WebSocket.OPEN) {
    session.guest.send(data);
  }
  // ADR-15: Include spectators in broadcast
  if (session.spectators) {
    for (const specWs of session.spectators) {
      if (specWs !== excludeWs && specWs.readyState === WebSocket.OPEN) {
        specWs.send(data);
      }
    }
  }
}

/**
 * Handle client disconnection
 */
function handleDisconnect(ws, session) {
  // Remove from session tracking
  sessions.delete(ws);

  if (ws === session.host) {
    // Host disconnected — notify guest and spectators, close session
    if (session.guest && session.guest.readyState === WebSocket.OPEN) {
      session.guest.send(JSON.stringify({
        type: 'host_disconnected',
        sessionId: session.id
      }));
      session.guest.close(1000, 'Host disconnected');
      sessions.delete(session.guest);
    }
    // ADR-15: Close spectators
    if (session.spectators) {
      for (const specWs of session.spectators) {
        if (specWs.readyState === WebSocket.OPEN) {
          specWs.send(JSON.stringify({
            type: 'host_disconnected',
            sessionId: session.id
          }));
          specWs.close(1000, 'Host disconnected');
        }
        sessions.delete(specWs);
      }
    }
    console.log(`[WS] Session ${session.id} ended (host disconnected)`);
  } else if (ws === session.guest) {
    // Guest disconnected
    session.guest = null;
    if (session.host && session.host.readyState === WebSocket.OPEN) {
      session.host.send(JSON.stringify({
        type: 'guest_disconnected',
        sessionId: session.id
      }));
    }
    // ADR-15: Notify spectators
    if (session.spectators) {
      for (const specWs of session.spectators) {
        if (specWs.readyState === WebSocket.OPEN) {
          specWs.send(JSON.stringify({
            type: 'guest_disconnected',
            sessionId: session.id
          }));
        }
      }
    }
    console.log(`[WS] Guest left session ${session.id} (session remains open for new guest)`);
  } else {
    // ADR-15: Spectator disconnected
    if (session.spectators) {
      session.spectators = session.spectators.filter(s => s !== ws);
    }
    if (session.host && session.host.readyState === WebSocket.OPEN) {
      session.host.send(JSON.stringify({
        type: 'spectator_disconnected',
        sessionId: session.id
      }));
    }
    if (session.guest && session.guest.readyState === WebSocket.OPEN) {
      session.guest.send(JSON.stringify({
        type: 'spectator_disconnected',
        sessionId: session.id
      }));
    }
    console.log(`[WS] Spectator left session ${session.id}`);
  }
}

// ── Start Server ───────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           FRONTIER UPRISING — Game Server               ║
╠══════════════════════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}                        ║
║  LAN:     http://<your-LAN-IP>:${PORT}                    ║
║                                                        ║
║  Open the URL in two browsers for LAN multiplayer       ║
╚══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});