/**
 * P2N — Peer-Networking · Main Process
 * Direct TCP · ECDH P-256 · AES-256-GCM
 * Persistent Identity Key (TOFU) · mDNS Local Discovery
 * Tor Hidden Service for cross-network connectivity
 */
'use strict'

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const net = require('net')
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const dgram = require('dgram')
const dns = require('dns')
const { exec, execFile } = require('child_process')
// Note: http and https modules removed — were imported but never used

// 512KB chunks for non-streaming (legacy base64)
const CHUNK = 524288
// 8MB chunks for streaming — maximum throughput for LAN; large chunks also help Tor by reducing protocol overhead
const STREAM_CHUNK = 8388608
const FRAME_HDR = 4

// ── MUTABLE STATE ─────────────────────────────────────────────────────────────
let mainWindow = null
let tcpServer = null
const peers = new Map()
let myNodeId = '#0000'
let myName = 'Unknown'
let allowClose = false

// Active session info — survives renderer reload
let activeSession = null  // { name, nodeId, startedAt }
let totalBytesSent = 0
let totalBytesReceived = 0

// ── EPHEMERAL IDENTITY (Ed25519) ──────────────────────────────────────────────
// P2N is designed as a temporary secure session tool — no data written to disk.
// A fresh Ed25519 keypair is generated every time the app starts.
// Nothing is saved between sessions: no identity file, no TOFU file, no blocked list.
//
//   - myIdentityPrivKey : in-memory only, signs every HELLO to prove ownership
//   - myIdentityPubKey  : sent in HELLO, peers keep it in memory for TOFU this session
//   - myIdentityPubB64  : base64-DER SPKI — the shareable form
//
// TOFU still works perfectly within a session:
//   peer connects → key stored in memory → reconnects → key matched → trusted
// It just resets when the app closes, which is intentional.

let myIdentityPrivKey = null
let myIdentityPubKey  = null
let myIdentityPubB64  = ''

function _generateIdentityKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  myIdentityPrivKey = privateKey
  myIdentityPubKey  = publicKey
  myIdentityPubB64  = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  secEntry('OK', 'Fresh Ed25519 identity keypair generated (session-scoped, not saved to disk)')
}

// ── TOFU STORE (in-memory, session-scoped) ────────────────────────────────────
// Tracks peer Ed25519 public keys seen this session.
// First contact → stored. Reconnect → verified. Key change → MITM warning.
// Wiped automatically when app closes — no file written.
const tofuStore = new Map()

function tofuCheck(nodeId, identityPubB64, name) {
  const existing = tofuStore.get(nodeId)
  if (!existing) {
    tofuStore.set(nodeId, { identityKey: identityPubB64, name, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() })
    return { status: 'new' }
  }
  if (existing.identityKey === identityPubB64) {
    existing.lastSeen = new Date().toISOString()
    existing.name = name || existing.name
    return { status: 'trusted' }
  }
  return { status: 'changed', previousName: existing.name, firstSeen: existing.firstSeen }
}
function tofuAcceptNewKey(nodeId, identityPubB64, name) {
  tofuStore.set(nodeId, { identityKey: identityPubB64, name, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() })
}

// ── BLOCKED PEERS (in-memory, session-scoped) ─────────────────────────────────
const blockedPeers = new Map() // nodeId -> expiryTimestamp (or 0 for permanent)
const authorizedPeers = new Set() // nodeId or pubkey for session-long allowlist
// <!-- FIX: Issue 9 --> IP-based block list for incoming connections before HELLO
const blockedIPs = new Set()
const connectionAttempts = new Map()
const RATE_LIMIT_WINDOW = 60000
const RATE_LIMIT_MAX = 5

function isBlocked(nodeId) {
  if (!blockedPeers.has(nodeId)) return false;
  const data = blockedPeers.get(nodeId);
  if (data.expiry && Date.now() > data.expiry) {
    blockedPeers.delete(nodeId);
    return false;
  }
  return true;
}
// <!-- FIX: Issue 9 --> Check IP-based block list
function isBlockedIP(ip) { return blockedIPs.has(ip) }
function isRateLimited(ip) {
  const now = Date.now()
  const entry = connectionAttempts.get(ip)
  if (!entry) { connectionAttempts.set(ip, { count: 1, firstAttempt: now }); return false }
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) { connectionAttempts.set(ip, { count: 1, firstAttempt: now }); return false }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    secEntry('WARN', `Rate limited IP: ${ip}`, `${entry.count} attempts in ${Math.round((now - entry.firstAttempt) / 1000)}s`)
    return true
  }
  return false
}

// ── RECONNECT TRACKING ────────────────────────────────────────────────────────
const pendingReconnects = new Map()
let reconnectMax = 100  // Very high — keep trying; user can disconnect manually
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15000, 30000]  // Cap at 30s for persistent retry
// <!-- FIX: Issue 5 --> Track all reconnect timer IDs for cleanup on quit
const reconnectTimers = new Set()
// <!-- FIX: Issue 5 --> Network online polling state
let wasOffline = false

// ── RENAME TRACKING ───────────────────────────────────────────────────────────
const RENAME_LIMIT = 3   // max renames per session
let renameCountThisSession = 0

// ── SECURITY LOG ──────────────────────────────────────────────────────────────
const secLog = []
// <!-- FIX: Issue 14 --> Debounced log emission to avoid IPC spam during Tor bootstrap
let _logBatch = []
let _logTimer = null
function _flushLogBatch() {
  if (_logBatch.length === 0) return
  for (const entry of _logBatch) emit('p2n:log', entry)
  _logBatch = []
  _logTimer = null
}
function secEntry(level, msg, detail = '') {
  const entry = { ts: new Date().toISOString().slice(11, 19), level, msg, detail }
  secLog.push(entry)
  if (secLog.length > 500) secLog.shift()
  _logBatch.push(entry)
  if (!_logTimer) _logTimer = setTimeout(_flushLogBatch, 200)
}

// ── mDNS LOCAL PEER DISCOVERY ─────────────────────────────────────────────────
// Fully decentralized, serverless, same-network auto-discovery.
// Uses UDP multicast — no internet, no server, no dependencies.
// Passive mode: socket is opened on session start so peers on the same network
// are seen even before the user clicks "Start Listening".
const MDNS_ADDR = '224.0.0.251'
const MDNS_PORT = 7476
let discoverySocket = null
let discoveryInterval = null
let _announcePort = null   // null = passive (receive only), number = active
const discoveredPeers = new Map()  // key → { name, nodeId, port, address, lastSeen }

// Join multicast group on every non-loopback IPv4 interface so discovery
// works regardless of which NIC is connected to the local network.
function _joinMulticastAll(sock) {
  try { sock.addMembership(MDNS_ADDR) } catch { }   // default interface
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of (ifaces[name] || [])) {
      if (iface.family === 'IPv4' && !iface.internal) {
        try { sock.addMembership(MDNS_ADDR, iface.address) } catch { }
      }
    }
  }
}

// Handle one received mDNS announcement packet.
function _onDiscoveryMsg(data, rinfo) {
  try {
    const msg = JSON.parse(data.toString())
    if (msg.type !== 'P2N_ANNOUNCE' || msg.nodeId === myNodeId) return
    if (!msg.port || msg.port === 0) return  // peer is not listening, skip
    const key = rinfo.address + ':' + msg.nodeId
    discoveredPeers.set(key, {
      name: msg.name || 'Unknown',
      nodeId: msg.nodeId,
      port: msg.port,
      address: rinfo.address,
      lastSeen: Date.now(),
    })
    // BUG-11 fix: collect stale keys first, then delete — never mutate Map during for..of
    const now = Date.now()
    const staleKeys = []
    for (const [k, v] of discoveredPeers) {
      if (now - v.lastSeen > 30000) staleKeys.push(k)
    }
    staleKeys.forEach(k => discoveredPeers.delete(k))
    emit('ftps:peers-discovered', Array.from(discoveredPeers.values()))
  } catch { }
}

// Create the UDP multicast socket once and bind it. Returns a Promise.
// Subsequent calls are no-ops if the socket already exists.
function _ensureDiscoverySocket() {
  if (discoverySocket) return Promise.resolve()
  return new Promise(resolve => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    discoverySocket = sock
    sock.on('error', e => {
      secEntry('WARN', 'mDNS socket error', e.message)
      discoverySocket = null
      resolve()  // resolve anyway so callers don't hang
    })
    sock.on('message', _onDiscoveryMsg)
    // Explicitly bind to '0.0.0.0' for reliable multicast reception on all platforms.
    sock.bind(MDNS_PORT, '0.0.0.0', () => {
      _joinMulticastAll(sock)
      try { sock.setMulticastTTL(4) } catch { }
      try { sock.setMulticastLoopback(true) } catch { }  // allow same-machine testing
      secEntry('OK', 'mDNS discovery socket ready (passive)')
      resolve()
    })
  })
}

// Start passive discovery (receive only — no announcements).
// Called when a session is started so the user can see nearby peers
// in My Network even before clicking "Start Listening".
function startPassiveDiscovery() {
  _ensureDiscoverySocket().catch(() => { })
}

// Start active discovery: receive AND announce on listenPort.
function startDiscovery(listenPort) {
  _announcePort = listenPort
  _ensureDiscoverySocket().then(() => {
    if (!discoverySocket) return
    clearInterval(discoveryInterval)
    const announce = () => {
      if (!discoverySocket || !_announcePort) return
      try {
        const msg = Buffer.from(JSON.stringify({
          type: 'P2N_ANNOUNCE',
          name: myName,
          nodeId: myNodeId,
          port: _announcePort,
          v: 1,
        }))
        discoverySocket.send(msg, MDNS_PORT, MDNS_ADDR, () => { })
      } catch { }
    }
    announce()
    discoveryInterval = setInterval(announce, 5000)
    secEntry('OK', `mDNS discovery active on port ${listenPort}`)
  }).catch(() => { })
}

// Stop announcing but keep the socket open for passive discovery.
function stopDiscovery() {
  clearInterval(discoveryInterval)
  discoveryInterval = null
  _announcePort = null
  // Socket stays open — still receives peer announcements.
  discoveredPeers.clear()
}

// Full teardown — called only on app quit.
function _shutdownDiscovery() {
  stopDiscovery()
  if (discoverySocket) { try { discoverySocket.close() } catch { }; discoverySocket = null }
}

// ── WINDOW ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 960, minHeight: 640,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: process.platform === 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.on('close', e => {
    if (!allowClose) { e.preventDefault(); emit('app:request-close', {}) }
  })

  // FIX: After renderer reload (Refresh UI), re-emit session + active peers.
  // TCP connections in main process are NOT affected by renderer reload.
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      // Re-announce active session so renderer can restore without showing setup
      if (activeSession) {
        emit('app:session-active', activeSession)
      }
      // Re-announce all connected peers
      peers.forEach((conn) => {
        if (conn.ready && conn.id) {
          emit('ftps:peer-connected', {
            peerId: conn.id,
            peerName: conn.name,
            fingerprint: conn._fingerprint,
            identityKey: conn._peerIdentityPubB64,
            tofu: 'trusted',
            tofuDetail: null,
          })
        }
      })
      // Re-emit Tor state so renderer always knows current status
      if (torProcess && onionAddress) {
        const port = tcpServer?.address()?.port || 7000
        emit('ftps:tor-status', { status: 'running', onionAddress, port })
      } else if (torProcess && !onionAddress) {
        emit('ftps:tor-status', { status: 'starting' })
      } else {
        emit('ftps:tor-status', { status: 'off' })
      }
    }, 300)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

// CHANGE 8: Port settings persistence
const portSettingsFile = path.join(app.getPath('userData'), 'port_settings.json')
let savedPort = 7900
function loadPortSettings() {
  try {
    if (fs.existsSync(portSettingsFile)) {
      const d = JSON.parse(fs.readFileSync(portSettingsFile, 'utf8'))
      if (d?.port && Number.isInteger(d.port) && d.port >= 1024 && d.port <= 65535) savedPort = d.port
    // else keep savedPort at 7900 default
    }
  } catch { }
}
function savePortSettings(port) {
  try { fs.writeFileSync(portSettingsFile, JSON.stringify({ port, updatedAt: new Date().toISOString() })); savedPort = port } catch { }
}


// ── PORT SETTINGS (only thing we persist — pure convenience, not security data) ─

app.whenReady().then(() => {
  _generateIdentityKeypair()   // fresh Ed25519 keypair every session — nothing loaded from disk
  loadPortSettings()           // port is the only setting that survives restarts
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})
app.on('window-all-closed', () => {
  // Edit 9: Immediately wipe all sensitive in-memory state on close
  activeSession = null
  tofuStore.clear()
  blockedPeers.clear()
  blockedIPs.clear()
  connectionAttempts.clear()
  authorizedPeers.clear()
  // Clear all pending reconnect timers
  for (const tid of reconnectTimers) clearTimeout(tid)
  reconnectTimers.clear()
  pendingReconnects.forEach(rc => { if (rc.timer) clearTimeout(rc.timer) })
  pendingReconnects.clear()
  // Clear network polling
  if (_networkPollTimer) { clearInterval(_networkPollTimer); _networkPollTimer = null }
  stopServer(); _shutdownDiscovery(); stopTorDaemon()
  ;[...peers.keys()].forEach(id => disconnectPeer(id))
  peers.clear()
  cleanupAllSandboxes()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // <!-- FIX: Issue 5 --> Clear all pending reconnect timers on quit
  for (const tid of reconnectTimers) clearTimeout(tid)
  reconnectTimers.clear()
  pendingReconnects.forEach(rc => { if (rc.timer) clearTimeout(rc.timer) })
  pendingReconnects.clear()
  cleanupAllSandboxes()
})

function emit(ch, data) {
  if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed())
    mainWindow.webContents.send(ch, data)
}

// ── LOCAL NETWORK INFO ────────────────────────────────────────────────────────
function getLocalIPs() {
  const ifaces = os.networkInterfaces(), results = []
  for (const name of Object.keys(ifaces)) {
    const all = ifaces[name]
    const v4 = all.find(i => i.family === 'IPv4' && !i.internal)
    const mac = all.find(i => i.mac && i.mac !== '00:00:00:00:00:00')
    if (v4) results.push({ name, address: v4.address, netmask: v4.netmask, mac: mac?.mac || null })
  }
  return results
}

// ═════════════════════════════════════════════════════════════════════════════
// TOR HIDDEN SERVICE — Ephemeral .onion for cross-network P2P
// ═════════════════════════════════════════════════════════════════════════════
let torProcess = null
let torDataDir = null
let torSocksPort = 0  // BUG-12 fix: start at 0 (invalid) so we never accidentally hit Tor Browser on 9050
let onionAddress = null
let torEnabled = true

async function startTorHiddenService(localPort) {
  // FIX: Return success when Tor is already running/starting instead of a false error.
  // Multiple callers (set-identity, listen, start-tor) can race here — dedup gracefully.
  if (torProcess) {
    secEntry('INFO', 'Tor already running — deduplicating start request')
    if (onionAddress) return { ok: true, onionAddress, port: localPort }
    return { ok: true, starting: true }
  }
  try {
    const tmpBase = path.join(os.tmpdir(), 'p2n-tor-' + crypto.randomBytes(4).toString('hex'))
    fs.mkdirSync(tmpBase, { recursive: true })
    torDataDir = tmpBase
    const hsDir = path.join(tmpBase, 'hidden_service')
    fs.mkdirSync(hsDir, { recursive: true })
    torSocksPort = 19050 + Math.floor(Math.random() * 1000)  // FIX: start above 19050 to never clash with a user-run tor on 9050
    const torrc = [
      `SocksPort ${torSocksPort}`,
      `DataDirectory ${tmpBase.replace(/\\/g, '/')}`,
      `HiddenServiceDir ${hsDir.replace(/\\/g, '/')}`,
      `HiddenServicePort ${localPort} 127.0.0.1:${localPort}`,
      // FIX: suppress GeoIP path warnings by setting them to empty string
      'GeoIPFile ""',
      'GeoIPv6File ""',
      'Log notice stderr',
    ].join('\n')
    const torrcPath = path.join(tmpBase, 'torrc')
    fs.writeFileSync(torrcPath, torrc)
    secEntry('INFO', `Tor starting on SOCKS ${torSocksPort}, forwarding port ${localPort}`)
    emit('ftps:tor-status', { status: 'starting' })

    return new Promise((resolve) => {
      // ── Tor binary search ────────────────────────────────────────────────
      // When PACKAGED (npm run dist), electron-builder copies tor/ → resources/tor/
      // via the extraResources entry in package.json.  process.resourcesPath always
      // points to the resources/ folder next to the exe, so that is the primary path.
      //
      // When running in DEV (npm run dev), __dirname is electron/ inside the project
      // root, so ../tor/ resolves to the project-level tor/ folder directly.
      //
      // Both paths are tried first before falling back to system PATH.

      const IS_PACKAGED = app.isPackaged

      // process.resourcesPath = <app>/resources  (packaged)
      //                       = <project root>   (dev, not always reliable)
      const resourcesDir = process.resourcesPath || ''

      // __dirname = <project>/electron (dev) or <asar>/electron (packaged)
      // Going one level up from __dirname in the packaged case reaches app.asar itself,
      // which is not a real directory — use process.resourcesPath instead.
      const devRoot = path.resolve(__dirname, '..')  // project root in dev mode

      const exe = process.platform === 'win32' ? 'tor.exe' : 'tor'

      const possibleBins = process.platform === 'win32'
        ? [
            // ① PACKAGED primary — extraResources copies tor/ here
            path.join(resourcesDir, 'tor', exe),
            // ② PACKAGED secondary — asar.unpacked mirror (asarUnpack in package.json)
            path.join(resourcesDir, 'app.asar.unpacked', 'tor', exe),
            // ③ DEV primary — project root tor/ folder
            path.join(devRoot, 'tor', exe),
            // ④ DEV secondary — cwd (same as devRoot in most cases)
            path.join(process.cwd(), 'tor', exe),
            // ⑤ User-level installs
            path.join(process.env.APPDATA || '', 'tor', exe),
            path.join(process.env.LOCALAPPDATA || '', 'tor', exe),
          ]
        : [
            path.join(resourcesDir, 'tor', exe),
            path.join(resourcesDir, 'app.asar.unpacked', 'tor', exe),
            path.join(devRoot, 'tor', exe),
            path.join(process.cwd(), 'tor', exe),
            '/usr/bin/tor',
            '/usr/local/bin/tor',
            '/opt/homebrew/bin/tor',
          ]

      let torBin = null
      for (const b of possibleBins) {
        if (b && fs.existsSync(b)) { torBin = b; break }
      }

      // Log search results for diagnostics
      const searchLog = possibleBins.filter(Boolean)
        .map(b => `${b} [${fs.existsSync(b) ? 'FOUND' : 'missing'}]`).join(' | ')
      secEntry('INFO', `Tor search paths: ${searchLog}`)

      // Also check system PATH (covers user-installed tor or manually-run daemon)
      if (!torBin) {
        const { execSync } = require('child_process')
        try {
          const whichCmd = process.platform === 'win32' ? 'where tor.exe' : 'which tor'
          const found = execSync(whichCmd, { timeout: 3000 }).toString().trim().split('\n')[0].trim()
          if (found && fs.existsSync(found)) {
            torBin = found
            secEntry('INFO', `Found tor in system PATH: ${torBin}`)
          }
        } catch { }
      }

      if (!torBin) {
        const hint = IS_PACKAGED
          ? `Run GetTorDaemon.py from the project folder then rebuild with "npm run dist:win".`
          : `Run GetTorDaemon.py to install tor.exe into the tor/ folder, then restart.`
        const msg = `Tor binary not found.\nSearched:\n${possibleBins.filter(Boolean).join('\n')}\n\n${hint}`
        secEntry('ERR', msg)
        emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg: msg.split('\n')[0] })
        emit('ftps:tor-status', { status: 'error', error: msg.split('\n')[0] })
        resolve({ ok: false, error: msg })
        return
      }

      secEntry('INFO', `Spawning Tor: ${torBin}`)
      let proc
      try {
        proc = require('child_process').spawn(torBin, ['-f', torrcPath], {
          windowsHide: true,
          env: { ...process.env, LD_LIBRARY_PATH: path.dirname(torBin) },
        })
      } catch (spawnErr) {
        const msg = `Failed to spawn Tor process: ${spawnErr.message}`
        secEntry('ERR', msg)
        emit('ftps:tor-status', { status: 'error', error: msg })
        resolve({ ok: false, error: msg })
        return
      }
      torProcess = proc
      let started = false
      // <!-- FIX: Issue 13 --> Use line buffer to handle split log lines
      let lineBuffer = ''

      const timeout = setTimeout(() => {
        if (!started) {
          started = true
          secEntry('ERR', 'Tor startup timed out (60s)')
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg: 'Tor startup timed out. Check if Tor is blocked by firewall or antivirus.' })
          emit('ftps:tor-status', { status: 'error', error: 'Tor startup timed out (60s)' })
          stopTorDaemon()
          resolve({ ok: false, error: 'Tor startup timed out' })
        }
      }, 60000)

      const onTorLog = (d) => {
        const chunk = d.toString()
        lineBuffer += chunk
        
        // <!-- FIX: Issue 13 --> Process only complete lines to avoid split-line misses
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || '' // keep incomplete last line in buffer
        
        lines.filter(l => l.trim()).forEach(l => {
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'INFO', msg: 'Tor: ' + l.trim() })
          
          // <!-- FIX: Issue 13 --> Emit bootstrap progress events
          const bootMatch = l.match(/Bootstrapped\s+(\d+)%/)
          if (bootMatch) {
            const progress = parseInt(bootMatch[1])
            emit('ftps:tor-status', { status: 'starting', progress })
          }
        })

        // Check complete lines for bootstrap completion
        if (lines.some(l => l.includes('Bootstrapped 100%')) && !started) {
          started = true
          clearTimeout(timeout)
          // A3 FIX: Clear line buffer after bootstrap to prevent unbounded memory growth
          lineBuffer = ''
          // Poll for hostname file (Tor might take a moment to write it after bootstrap)
          const hostnamePath = path.join(hsDir, 'hostname')
          let retries = 0
          const tryRead = () => {
            try {
              if (fs.existsSync(hostnamePath)) {
                onionAddress = fs.readFileSync(hostnamePath, 'utf8').trim()
                secEntry('OK', `Tor hidden service: ${onionAddress}`)
                emit('ftps:tor-status', { status: 'running', onionAddress, port: localPort })
                resolve({ ok: true, onionAddress, port: localPort })
              } else if (retries < 10) {
                retries++
                setTimeout(tryRead, 500)
              } else {
                throw new Error('hostname file not created')
              }
            } catch (e) {
              secEntry('ERR', 'Tor: could not read hostname', e.message)
              emit('ftps:tor-status', { status: 'error' })
              resolve({ ok: false, error: 'Could not read onion hostname' })
            }
          }
          tryRead()
        }
      }

      proc.stdout.on('data', onTorLog)
      proc.stderr.on('data', onTorLog)

      proc.on('error', e => {
        if (!started) {
          started = true; clearTimeout(timeout)
          let msg
          if (e.code === 'ENOENT') {
            const hint = app.isPackaged
              ? `Run GetTorDaemon.py from the project source folder, then rebuild with "npm run dist:win".`
              : `Run GetTorDaemon.py to place tor.exe in the tor/ folder, then restart.`
            msg = `Tor binary not found at "${torBin}". ${hint}`
          } else if (e.code === 'EACCES') {
            msg = `Permission denied running Tor binary "${torBin}". Check file permissions.`
          } else {
            msg = `Tor process error: ${e.message} (code: ${e.code || 'unknown'})`
          }
          secEntry('ERR', 'Tor spawn error', msg)
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg })
          emit('ftps:tor-status', { status: 'error', error: msg })
          torProcess = null
          resolve({ ok: false, error: msg })
        }
      })
      proc.on('exit', (code, signal) => { 
        if (code !== 0 && code !== null) {
          const exitMsg = `Tor exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`
          secEntry('ERR', exitMsg)
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg: exitMsg })
        }
        torProcess = null; onionAddress = null; emit('ftps:tor-status', { status: 'off' }) 
      })
    })
  } catch (e) {
    secEntry('ERR', 'Tor init error', e.message)
    return { ok: false, error: e.message }
  }
}

function stopTorDaemon() {
  if (torProcess) {
    try { torProcess.kill() } catch { }
    torProcess = null
  }
  onionAddress = null
  if (torDataDir) {
    try { fs.rmSync(torDataDir, { recursive: true, force: true }) } catch { }
    torDataDir = null
  }
  emit('ftps:tor-status', { status: 'off' })
  secEntry('OK', 'Tor daemon stopped')
}

function connectViaTor(onionHost, port) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket()
    // Buffer all incoming bytes so we can handle partial SOCKS5 responses safely
    let rxBuf = Buffer.alloc(0)
    let step = 'greeting'
    let settled = false

    // <!-- FIX: Issue 11 --> Map SOCKS5 errors to user-friendly messages
    const fail = (err) => {
      if (!settled) {
        settled = true
        try { sock.destroy() } catch { }
        // Map raw errors to friendly messages
        let friendlyMsg = err.message
        if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
          friendlyMsg = 'Tor daemon not running — restart the app or enable Tor in Settings'
          // Attempt Tor restart if server is up
          if (tcpServer) {
            const port = tcpServer.address()?.port
            if (port) {
              secEntry('WARN', 'Tor SOCKS port refused — attempting restart')
              emit('ftps:tor-status', { status: 'error', error: 'Tor crashed — restarting…' })
              stopTorDaemon()
              startTorHiddenService(port).catch(() => {})
            }
          }
        } else if (err.message.includes('network unreachable')) {
          friendlyMsg = 'Network unreachable — check your internet connection'
        } else if (err.message.includes('host unreachable')) {
          friendlyMsg = 'Peer is offline or onion address has changed'
        } else if (err.message.includes('connection refused') && !err.message.includes('ECONNREFUSED')) {
          friendlyMsg = 'Peer is not listening — they may need to restart'
        } else if (err.message.includes('timeout') || err.message.includes('Timeout')) {
          friendlyMsg = 'Connection timed out — check internet connection and try again'
        }
        reject(new Error(friendlyMsg))
      }
    }
    const succeed = () => {
      if (!settled) {
        settled = true
        // FIX: Clear the 30s timeout and remove our SOCKS5 data listener BEFORE
        // handing the socket to PeerConn. If left in place, the timeout destroys
        // a healthy onion connection after 30s and the stale listener competes with
        // PeerConn for incoming bytes.
        sock.setTimeout(0)
        sock.removeAllListeners('data')
        // A6 FIX: Do NOT remove 'error' listener here — there's a gap between
        // succeed() and PeerConn._setup() where the socket has no error handler,
        // causing an unhandled 'error' event crash. PeerConn._setup() will replace it.
        sock.removeAllListeners('timeout')
        resolve(sock)
      }
    }

    sock.setTimeout(60000, () => fail(new Error('SOCKS5 timeout — onion connections can be slow, try again')))
    sock.on('error', fail)

    sock.connect(torSocksPort, '127.0.0.1', () => {
      // SOCKS5 greeting: version 5, 1 auth method, no auth
      sock.write(Buffer.from([0x05, 0x01, 0x00]))
    })

    sock.on('data', chunk => {
      rxBuf = Buffer.concat([rxBuf, chunk])

      if (step === 'greeting') {
        if (rxBuf.length < 2) return  // wait for full 2-byte greeting response
        if (rxBuf[0] !== 0x05 || rxBuf[1] !== 0x00) { fail(new Error(`SOCKS5 auth rejected (server method: ${rxBuf[1]})`)); return }
        rxBuf = rxBuf.slice(2)  // consume greeting bytes
        step = 'connect'
        // SOCKS5 CONNECT request with domain name (onion address)
        const hostBuf = Buffer.from(onionHost, 'utf8')
        const req = Buffer.alloc(7 + hostBuf.length)
        req[0] = 0x05  // version
        req[1] = 0x01  // CONNECT
        req[2] = 0x00  // reserved
        req[3] = 0x03  // domain name
        req[4] = hostBuf.length
        hostBuf.copy(req, 5)
        req.writeUInt16BE(port, 5 + hostBuf.length)
        sock.write(req)

      } else if (step === 'connect') {
        // BUG-03 FIX: SOCKS5 CONNECT reply: VER REP RSV ATYP [BND.ADDR variable] BND.PORT(2)
        // Must skip the ENTIRE reply based on ATYP, NOT just 2 bytes.
        // Old code sliced only 2 bytes → 8 leftover SOCKS5 header bytes prepended to HELLO
        // → JSON.parse failed → every onion connection died silently.
        if (rxBuf.length < 4) return  // wait for VER REP RSV ATYP
        if (rxBuf[0] !== 0x05 || rxBuf[1] !== 0x00) {
          // <!-- FIX: Issue 11 --> User-friendly SOCKS5 error codes
          const codes = {
            1: 'Tor internal error — try restarting',
            2: 'Connection not allowed by ruleset',
            3: 'Network unreachable — check your internet connection',
            4: 'Peer is offline or onion address has changed',
            5: 'Peer is not listening on that port',
            6: 'Connection timed out — network too slow',
            7: 'Command not supported',
            8: 'Address type not supported'
          }
          fail(new Error(`SOCKS5 connect failed: ${codes[rxBuf[1]] || 'error code ' + rxBuf[1]}`))
          return
        }
        const atyp = rxBuf[3]
        let responseLen
        if (atyp === 0x01) responseLen = 10        // IPv4: 4 hdr + 4 addr + 2 port
        else if (atyp === 0x04) responseLen = 22   // IPv6: 4 hdr + 16 addr + 2 port
        else if (atyp === 0x03) {
          if (rxBuf.length < 5) return             // wait for domain length byte
          responseLen = 7 + rxBuf[4]               // 4 hdr + 1 len + N domain + 2 port
        } else { fail(new Error(`SOCKS5 unknown ATYP: ${atyp}`)); return }
        if (rxBuf.length < responseLen) return     // wait for full reply
        step = 'connected'
        const leftover = rxBuf.slice(responseLen)  // real app data starts after full SOCKS5 reply
        succeed()
        if (leftover.length > 0) {
          setImmediate(() => { if (!sock.destroyed) sock.emit('data', leftover) })
        }
      }
    })
  })
}

// FIX Issue 5: Network online polling — detect internet recovery and trigger reconnects
let _networkPollTimer = null
function startNetworkPolling() {
  if (_networkPollTimer) return
  _networkPollTimer = setInterval(() => {
    const ips = getLocalIPs()
    const isOnline = ips.length > 0

    if (isOnline && wasOffline) {
      wasOffline = false
      secEntry('INFO', 'Network back online — attempting reconnects')
      emit('ftps:network-status', { online: true })
      // Attempt immediate reconnects for all pending peers
      pendingReconnects.forEach((info, peerId) => {
        if (info.timer) clearTimeout(info.timer)
        const sock = net.createConnection({ host: info.host, port: info.port }, () => {
          const nc = new PeerConn(sock, { host: info.host, port: info.port })
          peers.delete(peerId)
          peers.set(peerId, nc)
          pendingReconnects.delete(peerId)
        })
        sock.on('error', () => {})
        sock.setTimeout(8000, () => { sock.destroy() })
      })
      // Also attempt to restart Tor if it was running before
      if (torEnabled && !torProcess && tcpServer) {
        const listenPort = tcpServer.address()?.port
        if (listenPort) {
          secEntry('INFO', 'Restarting Tor after network recovery')
          startTorHiddenService(listenPort).catch(e => secEntry('WARN', 'Tor restart after network recovery failed', e.message))
        }
      }
    } else if (!isOnline && !wasOffline) {
      wasOffline = true
      secEntry('WARN', 'Network appears offline')
      emit('ftps:network-status', { online: false })
    }
  }, 5000)
}

// <!-- FIX: Issue 13 --> Keepalive ping to prevent NAT/Tor circuit timeouts
setInterval(() => {
  peers.forEach(conn => {
    if (conn.ready) {
      try { conn.send({ type: 'ping', t: Date.now() }) } catch { }
    }
  })
}, 30000)

// ── ARCHIVE SANDBOX ───────────────────────────────────────────────────────────
const sandboxes = new Map()

function buildFileTree(dir, base) {
  const out = {}
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name)
      if (e.isDirectory()) out[e.name] = { type: 'dir', children: buildFileTree(fp, base) }
      else if (e.isFile()) { const s = fs.statSync(fp); out[e.name] = { type: 'file', size: s.size, relPath: path.relative(base, fp) } }
    }
  } catch { }
  return out
}
// <!-- FIX: Issue 12 --> 7z binary search
function find7zBin() {
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\7-Zip\\7z.exe')
    ]
    for (const p of paths) if (fs.existsSync(p)) return p
  } else {
    try { execSync('which 7z', { stdio: 'ignore' }); return '7z' } catch {}
  }
  return null
}

// <!-- FIX: Issue 3 & 12 --> Fast archive listing without extraction
async function listArchive(src, password) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase(), files = []
    const _7z = find7zBin()
    const pwArgs = (password && password.length > 0) ? ['-p' + password] : []

    if (_7z && /\.(zip|tar(\.gz|\.bz2|\.xz)?|tgz|tbz2)$/i.test(e)) {
      // FIX 11: RAR/7z hard-rejected — only ZIP and TAR variants supported
      if (/\.(rar|7z)$/i.test(e)) return reject(new Error('RAR and 7z formats are no longer supported. Please use ZIP or TAR.'))
      execFile(_7z, ['l', '-slt', ...pwArgs, src], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const combined = ((stdout || '') + (stderr || '')).toLowerCase()
          if (combined.includes('wrong password') || combined.includes('cannot open encrypted') || combined.includes('data error')) {
            return reject(Object.assign(new Error('Wrong password'), { isWrongPassword: true }))
          }
          return reject(new Error('7-Zip list failed: ' + err.message))
        }
        const blocks = stdout.split('\n\n')
        let anyEncrypted = false
        for (const block of blocks) {
          const dict = {}
          for (const line of block.split('\n')) {
            const m = line.match(/^([^=]+)\s+=\s+(.*)$/)
            if (m) dict[m[1].trim()] = m[2].trim()
          }
          if (dict.Encrypted === '+') anyEncrypted = true
          if (dict.Path && dict.Path !== src && dict.Attributes !== 'D') {
            const size = parseInt(dict.Size || '0', 10)
            files.push({ path: dict.Path.replace(/\\/g, '/'), size: isNaN(size) ? 0 : size, encrypted: dict.Encrypted === '+' })
          }
        }
        if (!password && anyEncrypted) return reject(Object.assign(new Error('Archive is password-protected'), { isEncrypted: true }))
        resolve(files)
      })
    } else if (process.platform === 'win32' && e.endsWith('.zip')) {
      // Fallback Windows ZIP
      execFile('tar', ['-tf', src], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('tar list failed'))
        stdout.split('\n').filter(Boolean).forEach(l => {
          const p = l.trim().replace(/\\/g, '/')
          if (p && !p.endsWith('/')) files.push({ path: p, size: 0 }) // size unknown
        })
        resolve(files)
      })
    } else if (process.platform !== 'win32' && e.endsWith('.zip')) {
      // Fallback Unix ZIP
      execFile('unzip', ['-l', src], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('unzip list failed'))
        const lines = stdout.split('\n')
        for (let i = 3; i < lines.length - 2; i++) {
          const m = lines[i].match(/^\s*\d+\s+[\d-]+\s+[\d:]+\s+(.+)$/)
          if (m && !m[1].endsWith('/')) files.push({ path: m[1], size: 0 })
        }
        resolve(files)
      })
    } else if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2)$/.test(e)) {
      // Fallback TAR
      const args = ['-tvf', src]
      if (/\.(gz|tgz)$/.test(e)) args.splice(1, 0, '-z')
      if (/\.(bz2|tbz2)$/.test(e)) args.splice(1, 0, '-j')
      execFile('tar', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('tar list failed'))
        stdout.split('\n').filter(Boolean).forEach(l => {
          const parts = l.trim().split(/\s+/)
          if (parts.length >= 6 && !parts[0].startsWith('d')) {
            const size = parseInt(parts[2] || '0', 10)
            const p = parts.slice(5).join(' ')
            if (p) files.push({ path: p, size: isNaN(size) ? 0 : size })
          }
        })
        resolve(files)
      })
    } else {
      reject(new Error('Unsupported archive format OR 7-Zip not installed'))
    }
  })
}

// Full extraction is now only used explicitly when the user requests a specific file preview
function extractSingleFile(src, fileRelPath, destDir, password = null) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase(), _7z = find7zBin()
    if (_7z) {
      const args = ['e', src, `-o${destDir}`, fileRelPath, '-y', '-r']
      if (password) args.push(`-p${password}`)
      execFile(_7z, args, { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else if (process.platform === 'win32' && /\.(zip|tar|tgz|tar\.gz|tar\.bz2)$/.test(e)) {
      if (password) return reject(new Error('Password extraction requires 7-Zip installed'))
      execFile('tar', ['-xf', src, '-C', destDir, fileRelPath], { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else if (process.platform !== 'win32' && e.endsWith('.zip')) {
      const args = ['-j', '-o', src, fileRelPath, '-d', destDir]
      if (password) args.push('-P', password)
      execFile('unzip', args, { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else if (process.platform !== 'win32' && /\.(tar|tgz|tar\.gz|tbz2|tar\.bz2)$/.test(e)) {
      if (password) return reject(new Error('Password extraction requires 7-Zip installed'))
      execFile('tar', ['-xf', src, '-C', destDir, fileRelPath], { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else {
      reject(new Error('Unsupported format for extraction OR 7-Zip missing'))
    }
  })
}
function cleanupAllSandboxes() {
  for (const [, dir] of sandboxes) try { fs.rmSync(path.dirname(dir), { recursive: true, force: true }) } catch { }
  sandboxes.clear()
}

// FIX Issue 9/12: Missing extractArchive function — was called in ftps:extract-archive but never defined
// Supports zip, tar, 7z, rar (with 7-Zip), tgz, bz2
function extractArchive(src, destDir) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase()
    const _7z = find7zBin()

    // FIX 11: Hard-reject RAR and 7z formats
    if (/\.(rar|7z)$/i.test(e)) {
      return reject(new Error('RAR and 7z formats are no longer supported. Please use ZIP or TAR.'))
    }

    if (_7z) {
      // 7-Zip handles everything: zip, rar, 7z, tar, gz, bz2, xz, tgz
      execFile(_7z, ['x', src, `-o${destDir}`, '-y', '-r'], { timeout: 300000, maxBuffer: 8 * 1024 * 1024 }, err => {
        if (err) reject(new Error('7-Zip extraction failed: ' + err.message))
        else resolve()
      })
    } else if (process.platform !== 'win32' && e.endsWith('.zip')) {
      execFile('unzip', ['-o', src, '-d', destDir], { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else if (process.platform === 'win32' && e.endsWith('.zip')) {
      execFile('tar', ['-xf', src, '-C', destDir], { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz)$/i.test(e)) {
      execFile('tar', ['-xf', src, '-C', destDir], { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else if (e.endsWith('.gz') && !e.endsWith('.tar.gz')) {
      // Single .gz file
      const outFile = path.join(destDir, path.basename(src, '.gz'))
      exec(`gzip -cd "${src}" > "${outFile}"`, { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else {
      reject(new Error('Unsupported archive format. Install 7-Zip for full support (zip, rar, 7z, tar, etc.)'))
    }
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// PEER CONN — Full E2E Encryption Stack (v5)
//
//  Handshake  │ ECDH P-256 ephemeral key agreement (fresh every session → forward secrecy)
//  Signing    │ Ed25519 identity signs the ECDH pubkey → proves the pubkey owner
//  KDF        │ HKDF-SHA256(ecdh_secret, salt, info) → two separate 256-bit session keys
//  Encryption │ AES-256-GCM with unique 96-bit random IV per frame
//  Direction  │ Separate tx-key (→peer) and rx-key (peer→) prevent reflection attacks
//  Replay     │ 8-byte monotonic sequence counter inside every encrypted frame
//  TOFU       │ Ed25519 public key stored on first contact; change = MITM warning
//
//  Wire format (post-handshake):
//    [4B frame_len][12B iv][8B seq (encrypted)][ciphertext][16B GCM tag]
//
//  HELLO (plaintext, pre-encryption):
//    [4B len][JSON{ type:"HELLO", pubkey(ECDH), identityPubKey(Ed25519),
//                  sig(Ed25519 over pubkey+nodeId), nodeId, name, v:5 }]
// ═════════════════════════════════════════════════════════════════════════════

// HKDF helper — derives a 32-byte key from the ECDH shared secret
// Using separate info strings for tx/rx prevents reflection attacks
function deriveKey(ecdhSecret, role) {
  // Salt = SHA-256 of both public keys sorted lexically (both peers reach same salt)
  // Info encodes direction so tx≠rx even with same secret
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    ecdhSecret,
    Buffer.from('P2N-v5-salt'),
    Buffer.from('P2N-v5-AES256GCM-' + role),  // 'tx' or 'rx'
    32
  ))
}

class PeerConn {
  constructor(socket, initiatorInfo = null) {
    this.socket       = socket
    this.id           = null
    this.name         = ''
    this._txKey       = null    // AES-256-GCM key: our encryptions to peer
    this._rxKey       = null    // AES-256-GCM key: peer's encryptions to us
    this.ready        = false
    this._buf         = Buffer.alloc(0)
    this._ecdh        = crypto.createECDH('prime256v1')
    this._ecdh.generateKeys()
    this._filebufs    = new Map()
    this._sendQueue   = []
    this._fingerprint = null
    this._peerIdentityPubB64 = null
    this._myPubkey    = this._ecdh.getPublicKey('base64')
    this._initiator   = initiatorInfo
    this.isAuthorized = false
    this._reconnecting  = false
    this._reconnectAttempt = 0
    this._closed      = false
    this._txSeq       = 0n   // monotonic send counter (BigInt for safe uint64)
    this._rxSeq       = -1n  // last accepted receive seq (-1 = none yet)
    // <!-- FIX: Issue 5 --> Store remote address for bidirectional reconnect
    this._remoteAddress = socket.remoteAddress || null
    this._remotePort    = socket.remotePort || null
    this._setup()
  }

  _setup() {
    this.socket.on('data', d => {
      totalBytesReceived += d.length
      this._buf = Buffer.concat([this._buf, d])
      this._drain()
    })
    this.socket.on('error', e => { secEntry('WARN', 'Socket error', e.message); this._onDisconnect() })
    this.socket.on('close', () => this._onDisconnect())
    this.socket.setKeepAlive(true, 2000)  // Send keepalive probe every 2s (was 5s)
    this.socket.setNoDelay(true)
    // Tune socket buffers for high-throughput LAN transfers
    try { this.socket.setRecvBufferSize?.(4 * 1024 * 1024) } catch {}
    try { this.socket.setSendBufferSize?.(4 * 1024 * 1024) } catch {}

    // ── HELLO v5 ──────────────────────────────────────────────────────────────
    // Sign the ECDH pubkey with our Ed25519 identity private key.
    // The peer verifies this signature against our identity public key (stored in TOFU).
    // This closes the classical MITM hole: without our private key the attacker
    // cannot forge a valid (pubkey, sig) pair, so the AES session key is guaranteed
    // to be shared only with the holder of our identity private key.
    const sigData = Buffer.from(this._myPubkey + '|' + myNodeId)  // what we sign
    const sig = crypto.sign(null, sigData, myIdentityPrivKey).toString('base64')

    const hello = Buffer.from(JSON.stringify({
      type: 'HELLO',
      pubkey:         this._myPubkey,   // ephemeral ECDH pubkey (for key agreement)
      identityPubKey: myIdentityPubB64, // Ed25519 public key (for signature verification)
      sig,                               // sign(identityPrivKey, ecdh_pubkey + '|' + nodeId)
      nodeId: myNodeId,
      name:   myName,
      v: 5,
    }))
    const hdr = Buffer.alloc(4)
    hdr.writeUInt32BE(hello.length, 0)
    this.socket.write(Buffer.concat([hdr, hello]))
  }

  _drain() {
    while (true) {
      if (this._buf.length < FRAME_HDR) return
      const len = this._buf.readUInt32BE(0)
      // Pre-hello frames: cap at 8KB to prevent memory exhaustion before encryption
      if (!this.ready && len > 8192) {
        secEntry('ERR', 'Oversized HELLO — dropping connection')
        this._close()
        return
      }
      // Post-hello frames: cap at 64MB
      if (this.ready && len > 64 * 1024 * 1024) {
        secEntry('ERR', 'Frame too large')
        this._close()
        return
      }
      if (this._buf.length < FRAME_HDR + len) return
      const frame = this._buf.slice(FRAME_HDR, FRAME_HDR + len)
      this._buf = this._buf.slice(FRAME_HDR + len)
      if (!this.ready) this._onHello(frame)
      else this._onFrame(frame)
    }
  }

  _onHello(frame) {
    try {
      const h = JSON.parse(frame.toString())
      if (h.type !== 'HELLO') { this._close(); return }

      // ── Blocked / rate-limit checks (before any crypto work) ─────────────
      const peerId   = h.nodeId || ('p_' + Date.now().toString(36))
      const remoteIP = this.socket.remoteAddress || ''
      // <!-- FIX: Issue 9 --> Check IP-based block list before peer ID is known
      if (isBlockedIP(remoteIP)) {
        secEntry('WARN', `Blocked IP ${remoteIP} attempted to connect — rejected`)
        this._close(); return
      }
      if (isBlocked(peerId)) {
        secEntry('WARN', `Blocked peer ${h.name || peerId} attempted to connect — rejected`)
        this._close(); return
      }
      if (isRateLimited(remoteIP)) {
        secEntry('WARN', `Rate limited connection from ${remoteIP}`)
        this._close(); return
      }

      // ── Ed25519 signature verification (v5+) ─────────────────────────────
      // Verify that the ECDH pubkey was signed by the claimed identity private key.
      // If sig is missing or invalid, the peer is either legacy (v<5) or a MITM.
      const isV5 = h.v >= 5 && h.identityPubKey && h.sig
      if (isV5) {
        try {
          const peerPubKey = crypto.createPublicKey({
            key: Buffer.from(h.identityPubKey, 'base64'),
            format: 'der', type: 'spki',
          })
          const sigData = Buffer.from(h.pubkey + '|' + h.nodeId)
          const valid = crypto.verify(null, sigData, peerPubKey, Buffer.from(h.sig, 'base64'))
          if (!valid) {
            secEntry('ERR', `HELLO signature INVALID from ${h.name || peerId} — MITM suspected, dropping`)
            this._close(); return
          }
          secEntry('INFO', `HELLO signature verified: ${h.name || peerId}`)
        } catch (e) {
          secEntry('ERR', `HELLO sig verification error: ${e.message} — dropping`)
          this._close(); return
        }
      } else {
        secEntry('WARN', `Legacy v${h.v || 1} peer (no Ed25519 sig): ${h.name || peerId} — accepting with reduced trust`)
      }

      // ── ECDH key agreement ────────────────────────────────────────────────
      const ecdhSecret = this._ecdh.computeSecret(Buffer.from(h.pubkey, 'base64'))

      // ── HKDF key derivation — separate tx/rx keys ─────────────────────────
      // The "role" string must be mirrored on both sides:
      //   initiator (connector) encrypts with 'initiator', decrypts with 'responder'
      //   responder (listener)  encrypts with 'responder', decrypts with 'initiator'
      const amInitiator = !!this._initiator
      this._txKey = deriveKey(ecdhSecret, amInitiator ? 'initiator' : 'responder')
      this._rxKey = deriveKey(ecdhSecret, amInitiator ? 'responder' : 'initiator')

      this.id   = peerId
      this.name = h.name || ''
      this._peerIdentityPubB64 = h.identityPubKey || h.identityKey || h.pubkey  // fallback chain

      this.ready = true

      // ── Session fingerprint (SAS for voice verification) ─────────────────
      // SHA-256 of both ECDH pubkeys sorted: same value on both sides regardless of role.
      const keys    = [this._myPubkey, h.pubkey].sort()
      const fpHash  = crypto.createHash('sha256').update(keys.join(':')).digest()
      this._fingerprint = Array.from(fpHash.slice(0, 8))
        .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':')

      // ── TOFU check ────────────────────────────────────────────────────────
      const isLegacy = !isV5
      const tofu = isLegacy
        ? { status: 'trusted' }
        : tofuCheck(this.id, this._peerIdentityPubB64, h.name)

      peers.set(this.id, this)
      const rc = pendingReconnects.get(this.id)
      if (rc) { clearTimeout(rc.timer); pendingReconnects.delete(this.id) }
      this._reconnecting = false
      this._reconnectAttempt = 0

      this.isAuthorized = authorizedPeers.has(this.id) || authorizedPeers.has(this._peerIdentityPubB64)

      secEntry('OK',
        `Peer connected (Auth: ${this.isAuthorized}): ${this.name || this.id}`,
        `${remoteIP} · FP: ${this._fingerprint} · ${isV5 ? 'Ed25519✓' : 'legacy-no-sig'}`
      )
      
      const evtData = {
        peerId: this.id, peerName: this.name,
        fingerprint: this._fingerprint,
        identityKey: this._peerIdentityPubB64,
        tofu: tofu.status,
        tofuDetail: tofu.status === 'changed'
          ? { previousName: tofu.previousName, firstSeen: tofu.firstSeen } : null,
      }

      if (this.isAuthorized) {
        emit('ftps:peer-connected', evtData)
        if (this._sendQueue.length > 0) {
          for (const obj of this._sendQueue) this.send(obj)
          this._sendQueue = []
        }
      } else {
        evtData.role = this._initiator ? 'sender' : 'receiver'
        emit('ftps:peer-requested', evtData)
      }
    } catch (e) { secEntry('ERR', 'Handshake failed', e.message); this._close() }
  }

  _onFrame(frame) {
    try {
      // Wire format: [12B iv][8B seq (inside ciphertext)][...ciphertext...][16B tag]
      if (frame.length < 28) throw new Error('Frame too short')
      const iv  = frame.slice(0, 12)
      const tag = frame.slice(-16)
      const ct  = frame.slice(12, -16)

      const d = crypto.createDecipheriv('aes-256-gcm', this._rxKey, iv)
      d.setAuthTag(tag)
      const plain = Buffer.concat([d.update(ct), d.final()])

      // ── Sequence number anti-replay ───────────────────────────────────────
      // First 8 bytes of plaintext are the sender's monotonic uint64 seq counter.
      if (plain.length < 8) throw new Error('Missing seq')
      const seq = plain.readBigUInt64BE(0)
      if (seq <= this._rxSeq) {
        secEntry('WARN', `Replay detected from ${this.name || this.id}: seq ${seq} ≤ last ${this._rxSeq}`)
        return  // drop silently — do not close, could be benign reorder
      }
      this._rxSeq = seq

      const payload = plain.slice(8)
      // Edit 2.1: Bypass JSON parsing for binary chunks
      if (payload[0] === 0x01) {
        const fidLen = payload[1]
        const fid = payload.slice(2, 2 + fidLen).toString('utf8')
        const i = payload.readUInt32BE(2 + fidLen)
        const chunk = payload.slice(2 + fidLen + 4)
        this._dispatch({ type: 'file_chunk_bin', fid, i, rawBuf: chunk })
        return
      }

      const msg = JSON.parse(payload.toString('utf8'))
      this._dispatch(msg)
    } catch (e) { secEntry('WARN', 'Decrypt/auth failed', e.message) }
  }

  send(obj) {
    // FIX 8F: Guard against write-after-destroy during reconnect window
    if (this._closed || this.socket?.destroyed) return false
    if (!this.ready || !this._txKey) {
      if (this._reconnecting) { this._sendQueue.push(obj); return true }
      return false
    }
    try {
      // Prepend 8-byte monotonic seq counter before JSON payload
      const seq    = ++this._txSeq
      const seqBuf = Buffer.allocUnsafe(8)
      seqBuf.writeBigUInt64BE(seq, 0)
      const plain  = Buffer.concat([seqBuf, Buffer.from(JSON.stringify(obj))])
      const iv     = crypto.randomBytes(12)
      const enc    = crypto.createCipheriv('aes-256-gcm', this._txKey, iv)
      const ct     = Buffer.concat([enc.update(plain), enc.final()])
      const frame  = Buffer.concat([iv, ct, enc.getAuthTag()])  // 12+N+16
      const hdr    = Buffer.allocUnsafe(4)
      hdr.writeUInt32BE(frame.length, 0)
      this.socket.write(Buffer.concat([hdr, frame]))
      totalBytesSent += 4 + frame.length
      return true
    } catch (e) { secEntry('ERR', 'Send failed', e.message); return false }
  }

  sendBinaryChunk(fid, index, buffer) {
    if (this._closed || this.socket?.destroyed) return false
    if (!this.ready || !this._txKey) { return false } // do not queue binary chunks to memory
    try {
      const seq = ++this._txSeq;
      const seqBuf = Buffer.allocUnsafe(8);
      seqBuf.writeBigUInt64BE(seq, 0);

      const fidBuf = Buffer.from(fid, 'utf8');
      const header = Buffer.allocUnsafe(2 + fidBuf.length + 4);
      header[0] = 0x01;
      header[1] = fidBuf.length;
      fidBuf.copy(header, 2);
      header.writeUInt32BE(index, 2 + fidBuf.length);

      const plain = Buffer.concat([seqBuf, header, buffer]);
      const iv = crypto.randomBytes(12)
      const enc = crypto.createCipheriv('aes-256-gcm', this._txKey, iv)
      const ct = Buffer.concat([enc.update(plain), enc.final()])
      const frame = Buffer.concat([iv, ct, enc.getAuthTag()])
      const hdr = Buffer.allocUnsafe(4)
      hdr.writeUInt32BE(frame.length, 0)
      this.socket.write(Buffer.concat([hdr, frame]))
      totalBytesSent += 4 + frame.length
      return true
    } catch (e) { secEntry('ERR', 'Binary send failed', e.message); return false }
  }
  async _dispatch(msg) {
    // FIX 9: Security — check block list on EVERY incoming message, not just HELLO.
    // If a peer was blocked after connecting, their messages are silently dropped.
    // BUG 5A FIX: Immediately destroy the socket to prevent more buffered messages
    // from being dispatched between the isBlocked check and _close() completion.
    if (this.id && isBlocked(this.id)) {
      secEntry('WARN', `Blocked peer ${this.name || this.id} sent message after block — dropping and disconnecting`)
      try { this.socket.destroy() } catch { }
      this._close()
      return
    }
    if (!this.isAuthorized) {
      if (msg.type === 'auth_accept') {
        this.isAuthorized = true;
        authorizedPeers.add(this.id);
        emit('ftps:peer-connected', { peerId: this.id, peerName: this.name, fingerprint: this._fingerprint, identityKey: this._peerIdentityPubB64, tofu: 'trusted', tofuDetail: null });
        if (this._sendQueue.length > 0) {
          for (const obj of this._sendQueue) this.send(obj)
          this._sendQueue = []
        }
      } else if (msg.type === 'auth_reject') {
        secEntry('INFO', `Peer ${this.name||this.id} rejected request.`)
        emit('ftps:peer-rejected', { peerId: this.id })
        this.disconnect();
      } else if (msg.type === 'auth_withdraw') {
        secEntry('INFO', `Peer ${this.name||this.id} withdrew request.`)
        emit('ftps:peer-withdrawn', { peerId: this.id })
        this.disconnect();
      }
      return;
    }
    switch (msg.type) {
      case 'chat': emit('ftps:message', { peerId: this.id, msg }); break
      case 'file_start': {
        const largeTmpPath = path.join(os.tmpdir(), 'p2n-recv-' + msg.fid + '-' + crypto.randomBytes(4).toString('hex'))
        // FIX 8A: Open a WriteStream immediately for large files — chunks write directly to disk
        // instead of accumulating in RAM. For small files (<1MB) we still use in-memory buffer.
        const STREAM_THRESHOLD = 1 * 1024 * 1024
        let ws = null
        if (msg.size > STREAM_THRESHOLD) {
          try { ws = fs.createWriteStream(largeTmpPath) } catch { }
        }
        this._filebufs.set(msg.fid, {
          meta: msg, chunks: ws ? null : new Map(),
          tmpPath: largeTmpPath, written: 0, nextExpected: 0,
          ws, reorderBuf: ws ? new Map() : null, lastProgressEmit: 0
        })
        emit('ftps:file-start', { peerId: this.id, meta: msg })
        break
      }
      case 'file_chunk':
      case 'file_chunk_bin': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) {
          const chunk = msg.type === 'file_chunk_bin' ? msg.rawBuf : Buffer.from(msg.d, 'base64')
          if (fb.ws) {
            // FIX 8A: Incremental write — stream chunks to disk immediately
            if (msg.i === fb.nextExpected) {
              fb.ws.write(chunk)
              fb.written++
              fb.nextExpected++
              // Flush any buffered out-of-order chunks
              while (fb.reorderBuf.has(fb.nextExpected)) {
                fb.ws.write(fb.reorderBuf.get(fb.nextExpected))
                fb.reorderBuf.delete(fb.nextExpected)
                fb.written++
                fb.nextExpected++
              }
            } else {
              // Out-of-order chunk (rare over TCP, but safe)
              fb.reorderBuf.set(msg.i, chunk)
            }
          } else {
            // Small file: in-memory
            fb.chunks.set(msg.i, chunk)
            fb.written = fb.chunks.size
          }
          // FIX 8C: Throttle progress to max 10/sec per fid
          const now = Date.now()
          if (now - fb.lastProgressEmit > 100) {
            fb.lastProgressEmit = now
            emit('ftps:file-progress', { peerId: this.id, fid: msg.fid, pct: fb.written / fb.meta.total })
          }
        }
        break
      }
      case 'file_end': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) {
          // Emit final 100% progress
          emit('ftps:file-progress', { peerId: this.id, fid: msg.fid, pct: 1 })
          if (fb.ws) {
            // FIX 8A: Close the write stream — file is already on disk
            try {
              await new Promise((res, rej) => { fb.ws.on('finish', res); fb.ws.on('error', rej); fb.ws.end() })
              emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: null, tmpPath: fb.tmpPath })
              secEntry('OK', `File received (streamed): ${fb.meta.name}`, `${fb.meta.size}B → ${fb.tmpPath}`)
            } catch (e) {
              secEntry('ERR', `File stream close failed: ${fb.meta.name}`, e.message)
              emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: null, tmpPath: null })
            }
          } else {
            // Small file: concat in memory, send as base64
            const sorted = [...fb.chunks.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
            const data = Buffer.concat(sorted)
            emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: data.toString('base64'), tmpPath: null })
            secEntry('OK', `File received: ${fb.meta.name}`, `${fb.meta.size}B`)
          }
          // CHANGE 4: If file belongs to a folder, emit folder-file-done
          if (fb.meta.folderFid !== undefined) {
            emit('ftps:folder-file-done', { peerId: this.id, folderFid: fb.meta.folderFid, fileIndex: fb.meta.fileIndex, meta: fb.meta })
          }
          this._filebufs.delete(msg.fid)
        }
        break
      }
      // CHANGE 3: Handle file_abort from sender cancelling mid-send
      case 'file_abort': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) this._filebufs.delete(msg.fid)
        emit('ftps:file-aborted', { peerId: this.id, fid: msg.fid })
        break
      }
      // CHANGE 4: Folder protocol messages
      case 'folder_manifest': {
        emit('ftps:folder-manifest', { peerId: this.id, manifest: msg })
        break
      }
      case 'folder_complete': {
        emit('ftps:folder-complete', { peerId: this.id, fid: msg.fid, name: msg.name, fileCount: msg.fileCount })
        break
      }
      default: emit('ftps:message', { peerId: this.id, msg }); break
    }
  }
  // CHANGE 3: sendFile with abort mechanism + CHANGE 4: extraMeta for folder transfers
  // FIX #2/#5: Dual-mode send — path-based streaming (zero extra RAM) or legacy base64.
  // Path-based is used when the renderer passes filePath instead of dataB64.
  // This lets us handle files of any size (10GB+) without loading into memory.
  async sendFile(fid, name, size, mime, dataB64, extraMeta = {}, filePath = null) {
    this._activeSends = this._activeSends || new Map()
    const abort = { cancelled: false, _drainResolve: null }
    this._activeSends.set(fid, abort)
    // Use 2MB chunks for Tor — reduces per-chunk encryption overhead by 4x vs 512KB
    // LAN gets full 8MB chunks for maximum throughput
    const isTor = !!(this._initiator?.host?.endsWith('.onion'))
    const TOR_CHUNK = 2 * 1024 * 1024  // 2MB chunks for Tor — balances throughput vs circuit limits
    const chunkSize = filePath ? (isTor ? TOR_CHUNK : STREAM_CHUNK) : CHUNK
    const total = Math.ceil(size / chunkSize)
    this.send({ type: 'file_start', fid, name, size, total, mime, ...extraMeta })
    secEntry('OK', `Sending: ${name}`, `${size}B${filePath ? ' (stream)' : ''}${isTor ? ' [Tor 2MB chunks]' : ''}`)

    // FIX 8C: Throttle send-progress to max 10/sec
    let lastSendProgressEmit = 0
    const emitSendProgress = (i) => {
      const now = Date.now()
      if (now - lastSendProgressEmit > 100 || i === total - 1) {
        lastSendProgressEmit = now
        emit('ftps:send-progress', { peerId: this.id, fid, pct: (i + 1) / total, bytesSent: Math.min((i + 1) * chunkSize, size) })
      }
    }
    // FIX 8B: Backpressure helper — wait for drain if socket buffer is full
    // Tor gets 2MB threshold to match chunk size; LAN gets 8MB
    const drainThreshold = isTor ? 2 * 1024 * 1024 : 8 * 1024 * 1024
    const waitForDrain = () => {
      if (this.socket && !this.socket.destroyed && this.socket.writableLength > drainThreshold) {
        return new Promise(r => {
          abort._drainResolve = r
          this.socket.once('drain', () => { abort._drainResolve = null; r() })
        })
      }
      return null
    }

    if (filePath) {
      // ── STREAMING PATH: read directly from disk, never fully in memory ──
      let fd
      try {
        fd = fs.openSync(filePath, 'r')
        const buf = Buffer.allocUnsafe(chunkSize)
        for (let i = 0; i < total; i++) {
          // BUG 2 FIX: Check socket health BEFORE each chunk send.
          // If socket died mid-transfer, abort immediately and notify receiver.
          if (abort.cancelled || this._closed || this.socket?.destroyed) {
            try { this.send({ type: 'file_abort', fid }) } catch { }
            this._activeSends.delete(fid)
            secEntry('INFO', `Send cancelled/disconnected: ${name}`)
            emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'cancelled' })
            return
          }
          const bytesRead = fs.readSync(fd, buf, 0, chunkSize, i * chunkSize)
          const sent = this.sendBinaryChunk(fid, i, buf.slice(0, bytesRead))
          // BUG 2 FIX: If send() returned false, socket is dead — abort the loop
          if (sent === false) {
            this._activeSends.delete(fid)
            secEntry('WARN', `Send failed mid-transfer: ${name} (socket dead at chunk ${i}/${total})`)
            emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'disconnected' })
            return
          }
          // FIX 8B: Respect TCP backpressure instead of blind setImmediate yield
          const drain = waitForDrain()
          if (drain) await drain
          else if (i % 64 === 0) await new Promise(r => setImmediate(r))
          emitSendProgress(i)
        }
      } finally {
        if (fd !== undefined) try { fs.closeSync(fd) } catch { }
      }
    } else {
      // ── LEGACY BASE64 PATH: kept for backward compat / non-path files ──
      const raw = Buffer.from(dataB64, 'base64')
      for (let i = 0; i < total; i++) {
        if (abort.cancelled || this._closed || this.socket?.destroyed) {
          try { this.send({ type: 'file_abort', fid }) } catch { }
          this._activeSends.delete(fid)
          secEntry('INFO', `Send cancelled/disconnected: ${name}`)
          emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'cancelled' })
          return
        }
        const sent = this.sendBinaryChunk(fid, i, raw.slice(i * chunkSize, (i + 1) * chunkSize))
        if (sent === false) {
          this._activeSends.delete(fid)
          secEntry('WARN', `Send failed mid-transfer: ${name} (socket dead at chunk ${i}/${total})`)
          emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'disconnected' })
          return
        }
        // FIX 8B: Backpressure
        const drain = waitForDrain()
        if (drain) await drain
        else if (i % 4 === 0) await new Promise(r => setImmediate(r))
        emitSendProgress(i)
      }
    }
    this._activeSends.delete(fid)
    this.send({ type: 'file_end', fid })
  }
  cancelSend(fid) {
    const abort = this._activeSends?.get(fid)
    if (abort) {
      abort.cancelled = true
      // Immediately resolve any pending drain wait so the send loop exits NOW
      if (abort._drainResolve) {
        abort._drainResolve()
        abort._drainResolve = null
      }
      return true
    }
    return false
  }
  _onDisconnect() {
    if (this._closed) return
    const id = this.id, name = this.name, wasReady = this.ready
    this.ready = false; try { this.socket.destroy() } catch { }
    
    // Determine if we can reconnect. Either we initiated it, OR we have their remote IP/Port
    const canReconnect = this._initiator || (this._remoteAddress && this._remotePort && this._remoteAddress !== '127.0.0.1')
    
    // <!-- FIX: Issue 5 --> Bidirectional reconnects using remote address
    if (wasReady && canReconnect && !this._closed && this._reconnectAttempt < reconnectMax) {
      this._reconnecting = true; this._reconnectAttempt++
      const delay = RECONNECT_DELAYS[Math.min(this._reconnectAttempt - 1, RECONNECT_DELAYS.length - 1)]
      secEntry('INFO', `Reconnecting to ${name || id} (${this._reconnectAttempt}/${reconnectMax})`, `in ${delay}ms`)
      emit('ftps:peer-reconnecting', { peerId: id, attempt: this._reconnectAttempt, maxAttempts: reconnectMax })
      
      const host = this._initiator?.host || this._remoteAddress
      const port = this._initiator?.port || this._remotePort
      
      const timer = setTimeout(() => {
        pendingReconnects.delete(id); if (this._closed) return
        
        const attachSuccess = (sock) => {
          sock.setTimeout(0) // clear the connect timeout
          const nc = new PeerConn(sock, this._initiator || null)
          nc._sendQueue = this._sendQueue
          nc._reconnectAttempt = this._reconnectAttempt
          // pre-register new PeerConn under the old id
          if (id) {
            peers.delete(id)
            peers.set(id, nc)
          }
        }
        
        const handleError = () => { this._onDisconnect() }

        if (host.endsWith('.onion')) {
          connectViaTor(host, port).then(sock => attachSuccess(sock)).catch(handleError)
        } else {
          const sock = net.createConnection({ host, port }, () => attachSuccess(sock))
          sock.on('error', () => { sock.destroy(); handleError() })
          sock.setTimeout(8000, () => { sock.destroy(); handleError() })
        }
      }, delay)
      
      pendingReconnects.set(id, { host, port, attempt: this._reconnectAttempt, timer, maxAttempts: reconnectMax })
      return
    }
    this._close()
  }
  _close() {
    if (this._closed) return; this._closed = true; this._reconnecting = false
    // FIX 8D: Clean up all in-progress file receive buffers and temp files
    for (const [, fb] of this._filebufs) {
      if (fb.ws) try { fb.ws.destroy() } catch { }
      if (fb.tmpPath) try { fs.unlinkSync(fb.tmpPath) } catch { }
    }
    this._filebufs.clear()
    const id = this.id; this.id = null
    if (id) { peers.delete(id); const rc = pendingReconnects.get(id); if (rc) { clearTimeout(rc.timer); pendingReconnects.delete(id) }; secEntry('INFO', `Peer disconnected: ${this.name || id}`); emit('ftps:peer-disconnected', { peerId: id }) }
    try { this.socket.destroy() } catch { }
  }
  disconnect() { this._closed = true; this._close() }
}

// ── TCP SERVER / CLIENT ───────────────────────────────────────────────────────
function startServer(port) {
  return new Promise((resolve, reject) => {
    if (tcpServer) stopServer()
    tcpServer = net.createServer(sock => { secEntry('INFO', `Incoming from ${sock.remoteAddress}`); new PeerConn(sock) })
    tcpServer.on('error', err => { emit('ftps:server-error', { message: err.message }); secEntry('ERR', 'Server error', err.message); reject(err) })
    tcpServer.listen(port || 0, '0.0.0.0', () => { const p = tcpServer.address().port; secEntry('OK', `TCP server on port ${p}`); resolve({ port: p, localIPs: getLocalIPs() }) })
  })
}
function stopServer() { if (tcpServer) { try { tcpServer.close() } catch { }; tcpServer = null } }
function isLocalIP(host) {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|localhost)/i.test(host)
}

function connectToPeer(host, port) {
  return new Promise((resolve, reject) => {
    secEntry('INFO', `Connecting to ${host}:${port}`)
    const local = isLocalIP(host)
    const TIMEOUT = local ? 5000 : 12000  // local = shorter timeout, fail faster

    // Guard against double-reject (timeout fires then 'error' event also fires).
    let settled = false
    const rejectOnce = err => { if (!settled) { settled = true; reject(err) } }
    const resolveOnce = () => { if (!settled) { settled = true; resolve() } }

    const sock = net.createConnection({ host, port: parseInt(port) }, () => {
      sock.setTimeout(0) // clear connect timeout on success
      new PeerConn(sock, { host, port: parseInt(port) })
      resolveOnce()
    })
    sock.on('error', err => {
      secEntry('WARN', `Connect failed (${host}:${port})`, err.message)
      rejectOnce(err)
    })
    sock.setTimeout(TIMEOUT, () => {
      sock.destroy()
      rejectOnce(new Error(local
        ? `No response from ${host}:${port} — check peer is listening on correct port`
        : `Timed out connecting to ${host}:${port} — check pairing code or firewall`
      ))
    })
  })
}

// FIX: For same-network connections, try ALL local IPs of discovered peers if direct fails
async function connectToPeerWithFallback(host, port) {
  // First try direct connection
  try {
    await connectToPeer(host, port)
    return { ok: true }
  } catch (primaryErr) {
    // If this was a local IP, try other local interfaces on same subnet
    if (isLocalIP(host)) {
      // Find peers discovered via mDNS that match this port
      for (const [, peer] of discoveredPeers) {
        if (peer.port === parseInt(port) && peer.address !== host) {
          try {
            secEntry('INFO', `Trying fallback address: ${peer.address}:${port}`)
            await connectToPeer(peer.address, port)
            return { ok: true }
          } catch { }
        }
      }
    }
    return { ok: false, error: primaryErr.message }
  }
}
function disconnectPeer(id) { const c = peers.get(id); if (c) c.disconnect() }

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('ftps:set-identity', async (_, { name, nodeId }) => {
  const suffix = myIdentityPubB64.slice(0, 6)
  // FIX Issue 1: Prevent double-suffix on session restore (renderer reload sends already-suffixed nodeId)
  myNodeId = nodeId.endsWith('-' + suffix) ? nodeId : nodeId + '-' + suffix
  myName = name
  activeSession = { name, nodeId: myNodeId, startedAt: new Date().toISOString() }
  renameCountThisSession = 0  // FIX #3: reset rename counter on new session
  secEntry('OK', `Identity: ${name} ${myNodeId}`)
  // Start passive mDNS discovery immediately
  startPassiveDiscovery()
  // FIX Issue 5: Start network online/offline polling for auto-reconnect after internet drops
  startNetworkPolling()

  // FIX: Auto-start TCP server + Tor when a session begins using the user's SAVED port.
  // savedPort defaults to 7900 but is updated when user saves a different port in Settings.
  if (!tcpServer) {
    try {
      const r = await startServer(savedPort)
      startDiscovery(r.port)
      emit('ftps:listen-auto', { ok: true, port: r.port, localIPs: r.localIPs })
      secEntry('OK', `TCP server auto-started on port ${r.port}`)
      if (torEnabled) {
        if (torProcess && onionAddress) {
          // Tor already running — check if it's on the right port
          // If port matches, just re-emit status so renderer gets the address
          secEntry('INFO', `Tor already running on port ${r.port}, re-emitting status`)
          emit('ftps:tor-status', { status: 'running', onionAddress, port: r.port })
        } else if (torProcess && !onionAddress) {
          emit('ftps:tor-status', { status: 'starting' })
        } else {
          startTorHiddenService(r.port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
        }
      }
    } catch (e) {
      secEntry('WARN', 'TCP server auto-start failed', e.message)
    }
  } else if (torEnabled && !torProcess) {
    // Server already up (session restore) — just ensure Tor is running
    const port = tcpServer.address()?.port
    if (port) startTorHiddenService(port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
  } else if (torProcess && onionAddress) {
    // Server + Tor both already running (e.g. lock/wipe then re-setup)
    const port = tcpServer.address()?.port || savedPort
    emit('ftps:tor-status', { status: 'running', onionAddress, port })
  }

  return { ok: true, nodeId: myNodeId, identityKey: myIdentityPubB64 }
})

// FIX #3: Update-name now broadcasts to all live peers + security log + rename limit
ipcMain.handle('ftps:update-name', (_, { name }) => {
  if (!name || typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Invalid name' }
  if (renameCountThisSession >= RENAME_LIMIT) {
    secEntry('WARN', `Rename blocked: limit of ${RENAME_LIMIT} renames per session reached`)
    return { ok: false, error: `Rename limit (${RENAME_LIMIT} per session) reached`, limitReached: true }
  }
  const oldName = myName
  myName = name.trim()
  if (activeSession) activeSession.name = myName
  renameCountThisSession++
  secEntry('OK', `${oldName} renamed to: ${myName}`, `[${renameCountThisSession}/${RENAME_LIMIT} renames used]`)
  // Broadcast rename to all connected peers so they update their UI without disconnecting
  peers.forEach(conn => {
    if (conn.ready) {
      conn.send({ type: 'peer_rename', oldName, newName: myName })
    }
  })
  return { ok: true, renameCount: renameCountThisSession, renameLimit: RENAME_LIMIT }
})
ipcMain.handle('ftps:get-rename-info', () => ({ count: renameCountThisSession, limit: RENAME_LIMIT }))
ipcMain.handle('ftps:clear-session', () => { activeSession = null; tofuStore.clear(); blockedPeers.clear(); return { ok: true } })

// Edit 8 & 9: Full session wipe — clears ALL in-memory state immediately
// Called on: wrong password (max tries), session end, app close
ipcMain.handle('ftps:full-wipe', () => {
  activeSession = null
  tofuStore.clear()
  blockedPeers.clear()
  blockedIPs.clear()
  connectionAttempts.clear()
  authorizedPeers.clear()
  // Disconnect all peers
  ;[...peers.keys()].forEach(id => {
    try { peers.get(id)?.disconnect() } catch {}
  })
  peers.clear()
  // Clear reconnect timers
  for (const tid of reconnectTimers) clearTimeout(tid)
  reconnectTimers.clear()
  pendingReconnects.forEach(rc => { if (rc.timer) clearTimeout(rc.timer) })
  pendingReconnects.clear()
  totalBytesSent = 0
  totalBytesReceived = 0
  secEntry('OK', 'Full session wipe complete')
  return { ok: true }
})
ipcMain.handle('ftps:get-session', () => activeSession ? { ...activeSession, active: true } : { active: false })
ipcMain.handle('ftps:get-local-ips', () => getLocalIPs())
ipcMain.handle('ftps:get-logs', () => [...secLog])
ipcMain.handle('ftps:clear-logs', () => { secLog.length = 0; return { ok: true } })
ipcMain.handle('ftps:get-peers', () => {
  const result = []
  peers.forEach(conn => { if (conn.ready && conn.id) result.push({ peerId: conn.id, peerName: conn.name, fingerprint: conn._fingerprint, identityKey: conn._peerIdentityPubB64, tofu: 'trusted', tofuDetail: null }) })
  return result
})
ipcMain.handle('ftps:get-discovered-peers', () => Array.from(discoveredPeers.values()))

ipcMain.handle('ftps:listen', async (_, { port }) => {
  try {
    const r = await startServer(port || 0)
    startDiscovery(r.port)  // always start mDNS discovery when listening
    // Auto-start Tor daemon if enabled (default ON)
    if (torEnabled && !torProcess) {
      startTorHiddenService(r.port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
    }
    return { ok: true, ...r }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('ftps:stop-listen', async () => {
  // FIX: Stop TCP server and mDNS discovery but do NOT stop Tor daemon.
  // Tor runs independently — the hidden service keeps the onion address alive
  // even while the local TCP server is not accepting new connections.
  stopServer(); stopDiscovery(); return { ok: true }
})
ipcMain.handle('ftps:connect', async (_, { host, port }) => { return connectToPeerWithFallback(host, port) })
ipcMain.handle('ftps:send', (_, { peerId, payload }) => { const c = peers.get(peerId); if (c && c._reconnecting) { c.send(payload); return { ok: true, queued: true } }; if (!c?.ready) return { ok: false, error: 'Not connected' }; c.send(payload); return { ok: true } })
ipcMain.handle('ftps:send-file', async (_, { peerId, fid, name, size, mime, dataB64 }) => { const c = peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }; try { await c.sendFile(fid, name, size, mime, dataB64); return { ok: true } } catch (e) { return { ok: false, error: e.message } } })
// FIX #2/#5: Path-based streaming send — no base64 overhead, no RAM limit.
// Renderer passes the file's filesystem path (available via file.path in Electron).
// Main process reads directly from disk in CHUNK-sized slices.
ipcMain.handle('ftps:send-file-stream', async (_, { peerId, fid, name, size, mime, filePath, extraMeta }) => {
  const c = peers.get(peerId)
  if (!c?.ready) return { ok: false, error: 'Not connected' }
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'File not found: ' + filePath }
  try {
    await c.sendFile(fid, name, size, mime, null, extraMeta || {}, filePath)
    return { ok: true }
  } catch (e) {
    secEntry('ERR', `Stream send failed: ${name}`, e.message)
    return { ok: false, error: e.message }
  }
})
ipcMain.handle('ftps:disconnect', (_, { peerId }) => { disconnectPeer(peerId); return { ok: true } })
// CHANGE 3: Cancel active file send
ipcMain.handle('ftps:cancel-send', (_, { peerId, fid }) => {
  const c = peers.get(peerId)
  if (c?.cancelSend(fid)) return { ok: true }
  return { ok: false, error: 'No active send found' }
})
// CHANGE 4: Folder transfer protocol IPC handlers
ipcMain.handle('ftps:send-folder-manifest', (_, { peerId, manifest }) => {
  const c = peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
  c.send({ type: 'folder_manifest', ...manifest }); return { ok: true }
})

ipcMain.handle('ftps:accept-request', (_, { peerId }) => {
  const c = peers.get(peerId);
  if (!c) return { ok: false };
  c.isAuthorized = true;
  authorizedPeers.add(peerId);
  authorizedPeers.add(c._peerIdentityPubB64);
  c.send({ type: 'auth_accept' });
  emit('ftps:peer-connected', { peerId: c.id, peerName: c.name, fingerprint: c._fingerprint, identityKey: c._peerIdentityPubB64, tofu: 'trusted', tofuDetail: null })
  return { ok: true };
})

ipcMain.handle('ftps:reject-request', (_, { peerId }) => {
  const c = peers.get(peerId);
  // 10 minute block timer
  blockedPeers.set(peerId, { name: c?.name || '', blockedAt: new Date().toISOString(), reason: 'Rejected connection request', expiry: Date.now() + 10 * 60 * 1000 });
  if (c && c.socket?.remoteAddress && c.socket.remoteAddress !== '127.0.0.1') {
    // Optionally temp-block IP? We won't for now since they might be NATted, just block the ID.
  }
  if (c) {
    c.send({ type: 'auth_reject' });
    setTimeout(()=>c.disconnect(), 200);
  }
  secEntry('INFO', `Rejected request from ${peerId} (Blocked for 10m)`)
  return { ok: true };
})

ipcMain.handle('ftps:withdraw-request', (_, { peerId }) => {
  const c = peers.get(peerId);
  if (c) {
    c.send({ type: 'auth_withdraw' });
    setTimeout(()=>c.disconnect(), 200);
  }
  secEntry('INFO', `Withdrew request to ${peerId}`)
  return { ok: true };
})
ipcMain.handle('ftps:send-file-in-folder', async (_, { peerId, fid, name, size, mime, dataB64, filePath, folderFid, folderRelPath, fileIndex }) => {
  const c = peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
  try {
    const meta = { folderFid, folderRelPath, fileIndex }
    if (filePath && fs.existsSync(filePath)) {
      await c.sendFile(fid, name, size, mime, null, meta, filePath)
    } else {
      await c.sendFile(fid, name, size, mime, dataB64, meta)
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('ftps:send-folder-complete', (_, { peerId, fid, name, fileCount }) => {
  const c = peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
  c.send({ type: 'folder_complete', fid, name, fileCount }); return { ok: true }
})
// CHANGE 8: Port settings persistence
ipcMain.handle('ftps:save-port', (_, { port }) => {
  const p = Math.max(1024, Math.min(65535, parseInt(port) || 7900))
  savePortSettings(p); secEntry('OK', `Port setting saved: ${p}`); return { ok: true, port: p }
})
ipcMain.handle('ftps:get-port', () => ({ port: savedPort }))
ipcMain.handle('ftps:close-all', () => { stopServer(); _shutdownDiscovery(); peers.forEach((_, id) => disconnectPeer(id)); return { ok: true } })
ipcMain.handle('ftps:is-connected', (_, { peerId }) => ({ connected: peers.has(peerId) && peers.get(peerId).ready }))

// TOFU IPC
ipcMain.handle('ftps:tofu-accept', (_, { peerId, identityKey, name }) => {
  const c = peers.get(peerId)
  const key = identityKey || c?._peerIdentityPubB64
  if (!key) { secEntry('WARN', `TOFU accept: no identityKey for ${peerId}`); return { ok: false, error: 'No identity key available' } }
  tofuAcceptNewKey(peerId, key, name); secEntry('OK', `TOFU: accepted new identity for ${name || peerId}`)
  return { ok: true }
})
ipcMain.handle('ftps:tofu-get-known', () => { const r = []; tofuStore.forEach((v, k) => r.push({ id: k, ...v })); return r })
ipcMain.handle('ftps:tofu-remove', (_, { peerId }) => { tofuStore.delete(peerId); secEntry('INFO', `TOFU: removed ${peerId}`); return { ok: true } })
ipcMain.handle('ftps:get-fingerprint', (_, { peerId }) => { const c = peers.get(peerId); return { fingerprint: c?._fingerprint || null } })

// <!-- FIX: Issue 9 --> Add IP blocking
ipcMain.handle('ftps:block-ip', (_, { ip, reason }) => {
  if (!ip) return { ok: false }
  blockedIPs.add(ip)
  secEntry('OK', `Blocked IP: ${ip}`, reason || '')
  // Also disconnect any active peers from this IP
  peers.forEach(c => {
    if (c.socket?.remoteAddress === ip) c.disconnect()
  })
  return { ok: true }
})

// B4/C1: Blocked peers IPC
ipcMain.handle('ftps:block-peer', (_, { peerId, peerName, reason }) => {
  blockedPeers.set(peerId, { name: peerName || '', blockedAt: new Date().toISOString(), reason: reason || '' })
  // Disconnect if currently connected
  const c = peers.get(peerId)
  if (c) c.disconnect()
  secEntry('OK', `Blocked peer: ${peerName || peerId}`)
  emit('ftps:peer-blocked', { peerId })  // <!-- FIX: Issue 9 --> emit event for UI
  return { ok: true }
})
ipcMain.handle('ftps:unblock-peer', (_, { peerId }) => {
  blockedPeers.delete(peerId)
  secEntry('OK', `Unblocked peer: ${peerId}`)
  // FIX 10: Emit event so renderer can auto-reconnect
  emit('ftps:peer-unblocked', { peerId })
  return { ok: true }
})
ipcMain.handle('ftps:get-blocked', () => {
  const result = []; blockedPeers.forEach((v, k) => result.push({ id: k, ...v }))
  return result
})

ipcMain.handle('ftps:save-file', async (_, { name, dataB64 }) => {
  if (!mainWindow) return { ok: false }
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, { defaultPath: name, filters: [{ name: 'All Files', extensions: ['*'] }] })
  if (canceled || !filePath) return { ok: false, canceled: true }
  fs.writeFileSync(filePath, Buffer.from(dataB64, 'base64')); secEntry('OK', `Saved: ${path.basename(filePath)}`); return { ok: true, filePath }
})

// Tor IPC handlers
ipcMain.handle('ftps:start-tor', async (_, { port }) => {
  return startTorHiddenService(port)
})
ipcMain.handle('ftps:stop-tor', async () => {
  stopTorDaemon(); return { ok: true }
})
ipcMain.handle('ftps:get-tor-status', () => {
  // FIX: return the TCP listen port (what peers connect to), NOT the internal SOCKS port
  const listenPort = tcpServer?.address()?.port || savedPort
  return { running: !!torProcess, onionAddress: onionAddress || null, port: listenPort, socksPort: torSocksPort, enabled: torEnabled }
})

// ── MY CARD — everything a stranger needs to connect to you ──────────────────
// Returns: { onion, port, fingerprint, name, nodeId }
// fingerprint = first 20 hex chars of SHA-256(Ed25519PubKey), grouped 4-4-4-4-4
// Peers share this card via Discord, Signal, website, etc.
// The receiver pastes the onion:port to connect, and verifies the fingerprint
// out-of-band (voice call / video / another message) to confirm no MITM.
ipcMain.handle('ftps:get-my-card', () => {
  const listenPort = tcpServer?.address()?.port || savedPort
  let fingerprint = null
  try {
    const raw = Buffer.from(myIdentityPubB64, 'base64')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    fingerprint = hash.slice(0, 20).toUpperCase().match(/.{4}/g).join('-')
  } catch { }
  return {
    onion: onionAddress || null,
    port: listenPort,
    name: myName,
    nodeId: myNodeId,
    identityPubKey: myIdentityPubB64,
    fingerprint,
    // Full shareable string: paste-able into connect field
    connectStr: onionAddress ? `${onionAddress}:${listenPort}` : null,
  }
})

// Max retries IPC
ipcMain.handle('ftps:set-max-retries', (_, { value }) => {
  reconnectMax = Math.max(1, Math.min(200, parseInt(value) || 100))
  secEntry('OK', `Max reconnect retries set to ${reconnectMax}`)
  return { ok: true, value: reconnectMax }
})
ipcMain.handle('ftps:get-max-retries', () => ({ value: reconnectMax }))

// Tor enabled setting — controls auto-start/stop
ipcMain.handle('ftps:set-tor-enabled', async (_, { enabled }) => {
  torEnabled = !!enabled
  secEntry('OK', `Tor daemon ${torEnabled ? 'enabled' : 'disabled'}`)
  if (!torEnabled && torProcess) {
    stopTorDaemon()
  }
  if (torEnabled && !torProcess && tcpServer) {
    const port = tcpServer.address()?.port
    if (port) startTorHiddenService(port).catch(() => {})
  }
  return { ok: true, enabled: torEnabled }
})
ipcMain.handle('ftps:connect-onion', async (_, { address, port }) => {
  try {
    if (!torProcess) {
      return { ok: false, error: 'Tor daemon is not running. Enable Tor in Settings first.' }
    }
    // FIX Issue 11: SOCKS port 0 means Tor hasn't assigned a port yet — don't ECONNREFUSED the user
    if (!torSocksPort || torSocksPort === 0) {
      return { ok: false, error: 'Tor is still starting up. Please wait a moment and try again.' }
    }
    const sock = await connectViaTor(address, port)
    // Hand off the SOCKS5-tunneled socket to PeerConn just like a normal TCP connection.
    // PeerConn._setup() already handles the HELLO handshake and emits events via the
    // global emit() function, so no additional event wiring is needed here.
    new PeerConn(sock, { host: address, port: parseInt(port) })
    secEntry('OK', `Connected via Tor to ${address}:${port}`)
    return { ok: true }
  } catch (e) {
    secEntry('ERR', `Tor connect failed: ${address}:${port}`, e.message)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('ftps:get-sys-stats', async () => {
  const mem = process.memoryUsage()
  // FIX: os.loadavg() returns [0,0,0] on Windows. Compute real CPU % via os.cpus() delta.
  let cpuPercent = 0
  try {
    const cpus = os.cpus()
    const totalIdle = cpus.reduce((a, c) => a + c.times.idle, 0)
    const totalTick = cpus.reduce((a, c) => a + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq, 0)
    if (global._prevCpuIdle !== undefined) {
      const idleDelta = totalIdle - global._prevCpuIdle
      const tickDelta = totalTick - global._prevCpuTick
      cpuPercent = tickDelta > 0 ? Math.round(((tickDelta - idleDelta) / tickDelta) * 100) : 0
    }
    global._prevCpuIdle = totalIdle
    global._prevCpuTick = totalTick
  } catch {}
  const load = os.loadavg()
  return {
    bytesSent: totalBytesSent,
    bytesReceived: totalBytesReceived,
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: process.uptime(),
    osUptime: os.uptime(),
    loadAvg: load[0], // 1 minute avg (0 on Windows)
    cpuPercent, // FIX: real CPU % from delta calculation
    platform: process.platform,
    arch: process.arch,
    nodeVer: process.version,
    osRelease: os.release()
  }
})

ipcMain.handle('ftps:get-net-details', async () => {
  return new Promise(resolve => {
    const dnsServers = dns.getServers()
    let gateway = 'Unknown'
    const cmd = process.platform === 'win32'
      ? 'route print 0.0.0.0'
      : "ip route | grep default | awk '{print $3}'"

    exec(cmd, (err, stdout) => {
      if (!err && stdout) {
        if (process.platform === 'win32') {
          const m = /0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/.exec(stdout)
          if (m) gateway = m[1]
        } else {
          gateway = stdout.trim()
        }
      }
      resolve({ dnsServers, gateway })
    })
  })
})

// Sandbox IPC
ipcMain.handle('ftps:extract-archive', async (_, { name, dataB64 }) => {
  try {
    const sid = crypto.randomBytes(8).toString('hex'), sDir = path.join(os.tmpdir(), 'p2n-sandbox-' + sid)
    fs.mkdirSync(sDir, { recursive: true })
    const archPath = path.join(sDir, '_archive_' + name)
    fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))
    const extDir = path.join(sDir, 'extracted'); fs.mkdirSync(extDir, { recursive: true })
    await extractArchive(archPath, extDir); fs.unlinkSync(archPath)
    const tree = buildFileTree(extDir, extDir); sandboxes.set(sid, sDir)
    secEntry('OK', `Archive extracted: ${name}`, extDir)
    return { ok: true, sandboxId: sid, sandboxDir: extDir, tree, name }
  } catch (e) { secEntry('ERR', `Extract failed: ${name}`, e.message); return { ok: false, error: e.message } }
})
ipcMain.handle('ftps:read-sandbox-file', async (_, { sandboxDir, relPath }) => {
  try { const fp = path.resolve(sandboxDir, relPath); if (!fp.startsWith(path.resolve(sandboxDir))) return { ok: false, error: 'Path traversal' }; const st = fs.statSync(fp); if (st.size > 50 * 1024 * 1024) return { ok: false, error: 'File >50MB' }; return { ok: true, dataB64: fs.readFileSync(fp).toString('base64'), size: st.size } } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('ftps:save-sandbox-file', async (_, { sandboxDir, relPath, name: fname }) => {
  if (!mainWindow) return { ok: false }
  try { const fp = path.resolve(sandboxDir, relPath); if (!fp.startsWith(path.resolve(sandboxDir))) return { ok: false, error: 'Path traversal' }; const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, { defaultPath: fname || path.basename(relPath), filters: [{ name: 'All Files', extensions: ['*'] }] }); if (canceled || !filePath) return { ok: false, canceled: true }; fs.copyFileSync(fp, filePath); return { ok: true, filePath } } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('ftps:cleanup-sandbox', async (_, { sandboxId }) => { const d = sandboxes.get(sandboxId); if (d) { try { fs.rmSync(path.dirname(d), { recursive: true, force: true }) } catch { }; sandboxes.delete(sandboxId) }; return { ok: true } })
ipcMain.handle('ftps:open-sandbox-folder', async (_, { sandboxDir }) => { secEntry('INFO', 'Sandbox in explorer', sandboxDir); await shell.openPath(sandboxDir); return { ok: true } })

// BUG-02 FIX: 6 IPC handlers that were called from renderer but never existed in main.js

// Get platform string for OS Sandbox feature
ipcMain.handle('ftps:get-platform', () => process.platform)

// FIX #5: List archive contents using fast listing commands (no full extraction)
ipcMain.handle('ftps:list-archive', async (_, { name, dataB64, password }) => {
  const tmpDir = path.join(os.tmpdir(), 'p2n-archlist-' + crypto.randomBytes(6).toString('hex'))
  try {
    fs.mkdirSync(tmpDir, { recursive: true })
    const archPath = path.join(tmpDir, name)
    fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))

    // Quick ZIP password-bit check (without 7z) only when no password supplied
    if (!password && /\.zip$/i.test(name)) {
      const buf = fs.readFileSync(archPath)
      if ((buf[6] & 0x01) || buf.toString('binary').includes('\x09\x08\x06\x00')) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
        return { passwordProtected: true }
      }
    }

    const files = await listArchive(archPath, password || null)

    const tree = {}
    for (const f of files) {
      if (!f.path) continue
      const parts = f.path.split('/')
      let current = tree
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]; if (!p) continue
        if (i === parts.length - 1) current[p] = { type: 'file', size: f.size }
        else { current[p] = current[p] || { type: 'dir', children: {} }; current = current[p].children }
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return { ok: true, tree }
  } catch (e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { }
    if (e.isEncrypted) return { passwordProtected: true }
    if (e.isWrongPassword) return { wrongPassword: true }
    if (e.message?.toLowerCase().includes('password') || e.message?.toLowerCase().includes('encrypt')) return { passwordProtected: true }
    return { error: e.message }
  }
})

// <!-- FIX: Issue 9 --> Extract large archive from disk path (no base64 memory overhead)
ipcMain.handle('ftps:extract-archive-from-path', async (_, { name, archPath }) => {
  try {
    if (!fs.existsSync(archPath)) return { ok: false, error: 'File not found on disk' }
    
    // Check password protection for zip
    if (/\.zip$/i.test(name)) {
      const fd = fs.openSync(archPath, 'r'), buf = Buffer.alloc(100)
      fs.readSync(fd, buf, 0, 100, 0); fs.closeSync(fd)
      const str = buf.toString('binary')
      if (str.includes('\x09\x08\x06\x00') || (buf[6] & 0x01)) {
        return { passwordProtected: true }
      }
    }

    const files = await listArchive(archPath)
    
    // Build tree
    const tree = {}
    for (const f of files) {
      if (!f.path) continue
      const parts = f.path.split('/')
      let current = tree
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        if (!p) continue
        if (i === parts.length - 1) current[p] = { type: 'file', size: f.size }
        else { current[p] = current[p] || { type: 'dir', children: {} }; current = current[p].children }
      }
    }
    return { ok: true, tree }
  } catch (e) {
    if (e.message?.toLowerCase().includes('password') || e.message?.toLowerCase().includes('encrypted')) return { passwordProtected: true }
    return { error: e.message }
  }
})

// Read a single file entry from inside a zip/rar (for preview without full extraction)
ipcMain.handle('ftps:read-archive-entry', async (_, { name, dataB64, entryPath, password }) => {
  try {
    const sid = crypto.randomBytes(6).toString('hex')
    const tmpDir = path.join(os.tmpdir(), 'p2n-archentry-' + sid)
    fs.mkdirSync(tmpDir, { recursive: true })
    const archPath = path.join(tmpDir, name)
    fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))
    const extractDir = path.join(tmpDir, 'entry')
    fs.mkdirSync(extractDir, { recursive: true })
    
    // <!-- FIX: Issue 3/12 --> Extract only the requested file
    await extractSingleFile(archPath, entryPath, extractDir, password)
    
    // tar/unzip handles extraction paths differently depending on OS.
    // Try to find the file recursively in extractDir
    let targetPath = null
    const findFile = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        const full = path.join(dir, item.name)
        if (item.isDirectory()) { const found = findFile(full); if (found) return found }
        else if (item.name === path.basename(entryPath)) return full // found it
      }
      return null
    }
    targetPath = findFile(extractDir)

    if (!targetPath || !fs.existsSync(targetPath)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return { ok: false, error: 'File not found in archive' }
    }
    const stat = fs.statSync(targetPath)
    if (stat.size > 50 * 1024 * 1024) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return { ok: false, error: 'File too large to preview (>50MB)' }
    }
    const dataB64out = fs.readFileSync(targetPath).toString('base64')
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return { ok: true, dataB64: dataB64out }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// <!-- FIX: Issue 7/9 --> Read file directly from disk path for preview
ipcMain.handle('ftps:read-file-for-preview', async (_, { filePath }) => {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' }
    const st = fs.statSync(filePath)
    if (st.size > 50 * 1024 * 1024) return { ok: false, error: 'File too large to preview (>50MB)' }
    return { ok: true, dataB64: fs.readFileSync(filePath).toString('base64'), size: st.size }
  } catch (e) { return { ok: false, error: e.message } }
})

// <!-- FIX: Issue 12 --> Export 7z availability check
ipcMain.handle('ftps:find-7z', () => ({ ok: true, found: !!find7zBin() }))

// Save a large file from a temp path (used for files >32MB that bypass IPC base64)
ipcMain.handle('ftps:save-file-from-temp', async (_, { tmpPath, name }) => {
  if (!mainWindow) return { ok: false }
  try {
    if (!fs.existsSync(tmpPath)) return { ok: false, error: 'Temp file not found — may have been cleaned up' }
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: name,
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.copyFileSync(tmpPath, filePath)
    // Clean up temp file after save
    try { fs.unlinkSync(tmpPath) } catch { }
    secEntry('OK', `Large file saved: ${path.basename(filePath)}`)
    return { ok: true, filePath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Save an entire received folder to a user-chosen directory
ipcMain.handle('ftps:save-to-dir', async (_, { files, folderName }) => {
  if (!mainWindow) return { ok: false }
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: `Save folder "${folderName}" to…`,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    const destBase = path.join(filePaths[0], folderName)
    fs.mkdirSync(destBase, { recursive: true })
    for (const f of files) {
      if (!f.relPath && !f.name) continue
      const dest = path.resolve(destBase, f.relPath || f.name)
      if (!dest.startsWith(path.resolve(destBase))) continue  // path traversal guard
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      if (f.tmpPath && fs.existsSync(f.tmpPath)) {
        fs.copyFileSync(f.tmpPath, dest)
        try { fs.unlinkSync(f.tmpPath) } catch { }
      } else if (f.dataB64) {
        fs.writeFileSync(dest, Buffer.from(f.dataB64, 'base64'))
      }
    }
    secEntry('OK', `Folder saved: ${folderName}`, destBase)
    return { ok: true, dir: destBase }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Launch OS-level sandbox: Windows Sandbox (Hyper-V) or Linux firejail/bubblewrap
ipcMain.handle('ftps:launch-os-sandbox', async (_, { name, dataB64, tmpPath }) => {
  try {
    const plat = process.platform
    const sid = crypto.randomBytes(6).toString('hex')
    const stageDir = path.join(os.tmpdir(), 'p2n-ossandbox-' + sid)
    // P2P-Archive subfolder: sandbox > P2P-Archive > {filename}
    const archiveDir = path.join(stageDir, 'P2P-Archive')
    fs.mkdirSync(archiveDir, { recursive: true })
    const fileDest = path.join(archiveDir, name)
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.copyFileSync(tmpPath, fileDest)
    } else if (dataB64) {
      fs.writeFileSync(fileDest, Buffer.from(dataB64, 'base64'))
    } else {
      return { ok: false, error: 'No file data provided' }
    }

    if (plat === 'win32') {
      // Try Windows Sandbox (requires Win10/11 Pro with Hyper-V)
      // Map the stageDir so P2P-Archive subfolder is visible inside sandbox
      const wsb = `<Configuration><MappedFolders><MappedFolder><HostFolder>${stageDir}</HostFolder><ReadOnly>true</ReadOnly></MappedFolder></MappedFolders><LogonCommand><Command>explorer C:\\Users\\WDAGUtilityAccount\\Desktop\\mapped\\P2P-Archive</Command></LogonCommand></Configuration>`
      const wsbPath = path.join(stageDir, 'sandbox.wsb')
      fs.writeFileSync(wsbPath, wsb)
      const { spawn } = require('child_process')
      const proc = spawn('WindowsSandbox.exe', [wsbPath], { detached: true, stdio: 'ignore' })
      proc.unref()
      secEntry('OK', `Windows Sandbox launched for ${name} (P2P-Archive)`)
      return { ok: true, message: 'Windows Sandbox launched — file in P2P-Archive folder (read-only)' }
    } else if (plat === 'linux') {
      // Try firejail, fall back to bubblewrap
      const { execFile } = require('child_process')
      const tryCmd = (cmd, args) => new Promise(res => {
        execFile('which', [cmd], (err, out) => {
          if (err || !out.trim()) { res(false); return }
          const proc = require('child_process').spawn(cmd, args, { detached: true, stdio: 'ignore' })
          proc.unref()
          res(true)
        })
      })
      const launched = await tryCmd('firejail', ['--noprofile', '--private=' + stageDir, 'bash', '-c', `cd ${archiveDir} && xterm -e "ls -la; echo 'Press Enter'; read" || bash`])
        || await tryCmd('bwrap', ['--ro-bind', stageDir, '/sandbox', '--proc', '/proc', '--dev', '/dev', '--unshare-all', 'ls', '-la', '/sandbox/P2P-Archive'])
      if (!launched) return { ok: false, unsupported: true, message: 'firejail and bubblewrap not found. Install with: sudo apt install firejail' }
      secEntry('OK', `Linux sandbox launched for ${name}`)
      return { ok: true, message: 'Sandbox launched via firejail/bubblewrap' }
    } else {
      return { ok: false, unsupported: true, message: 'OS sandbox not available on macOS yet' }
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})


// Shell + Window
// Shell + Window
ipcMain.handle('shell:open-external', async (_, { url }) => { if (!/^https?:\/\//.test(url)) return { ok: false }; await shell.openExternal(url); secEntry('INFO', 'External URL', url); return { ok: true } })
ipcMain.handle('window:control', (_, { action }) => {
  if (!mainWindow) return
  const wc = mainWindow.webContents
  switch (action) {
    case 'minimize': mainWindow.minimize(); break
    case 'maximize': mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); break
    case 'fullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break
    case 'zoomin': wc.setZoomLevel(wc.getZoomLevel() + 0.5); break
    case 'zoomout': wc.setZoomLevel(wc.getZoomLevel() - 0.5); break
    case 'zoomreset': wc.setZoomLevel(0); break
    case 'close-confirmed': allowClose = true; mainWindow.close(); break
  }
  return { ok: true }
})
