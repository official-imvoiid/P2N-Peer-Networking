'use strict'
const { app } = require('electron')
const path = require('path')

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const CHUNK = 524288           // 512KB chunks for legacy base64
const STREAM_CHUNK = 4194304   // 4MB chunks for streaming LAN
const FRAME_HDR = 4
const MAX_CONCURRENT_SENDS = 5 // FIX: increased from 3 for better LAN parallelism
const MAX_CONCURRENT_RECVS = 20
const RATE_LIMIT_WINDOW = 60000
const RATE_LIMIT_MAX = 5
const RENAME_LIMIT = 3
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15000, 30000]

// mDNS constants
const MDNS_ADDR = '224.0.0.251'
const MDNS_PORT = 7476
const MDNS_PORT_FALLBACK = 7477

// ── SHARED MUTABLE STATE ─────────────────────────────────────────────────────
// All modules import S and read/write properties directly.
// Since S is an object, mutations are visible across all modules.
const S = {
  mainWindow: null,
  tcpServer: null,
  peers: new Map(),
  myNodeId: '#0000',
  myName: 'Unknown',
  allowClose: false,
  activeSession: null,
  totalBytesSent: 0,
  totalBytesReceived: 0,

  // Ephemeral Identity (Ed25519) — regenerated every session
  myIdentityPrivKey: null,
  myIdentityPubKey: null,
  myIdentityPubB64: '',

  // TOFU store (in-memory, session-scoped)
  tofuStore: new Map(),

  // Blocked peers & IPs
  blockedPeers: new Map(),
  authorizedPeers: new Set(),
  blockedIPs: new Set(),
  connectionAttempts: new Map(),

  // Reconnect tracking
  pendingReconnects: new Map(),
  reconnectMax: 100,
  reconnectTimers: new Set(),
  wasOffline: false,

  // Rename tracking
  renameCountThisSession: 0,

  // Security log
  secLog: [],
  _logBatch: [],
  _logTimer: null,

  // Tor state
  torProcess: null,
  torDataDir: null,
  torSocksPort: 0,
  onionAddress: null,
  torEnabled: true,

  // Archive sandboxes
  sandboxes: new Map(),

  // mDNS discovery
  discoverySocket: null,
  discoveryInterval: null,
  _announcePort: null,
  discoveredPeers: new Map(),
  _joinedInterfaces: new Set(),
  _interfaceReScanTimer: null,
  _mdnsRecoveryTimer: null,

  // Port settings
  savedPort: 7900,

  // Network polling
  _networkPollTimer: null,
  _keepaliveTimer: null,
  _gcTimer: null,
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

// Lazily computed port settings file path (app.getPath only works after ready)
let _portSettingsFile = null
function getPortSettingsFile() {
  if (!_portSettingsFile) _portSettingsFile = path.join(app.getPath('userData'), 'port_settings.json')
  return _portSettingsFile
}

// Emit IPC event to renderer
function emit(ch, data) {
  if (S.mainWindow?.webContents && !S.mainWindow.webContents.isDestroyed())
    S.mainWindow.webContents.send(ch, data)
}

module.exports = {
  S, emit, getPortSettingsFile,
  CHUNK, STREAM_CHUNK, FRAME_HDR,
  MAX_CONCURRENT_SENDS, MAX_CONCURRENT_RECVS,
  RATE_LIMIT_WINDOW, RATE_LIMIT_MAX, RENAME_LIMIT,
  RECONNECT_DELAYS,
  MDNS_ADDR, MDNS_PORT, MDNS_PORT_FALLBACK,
}
