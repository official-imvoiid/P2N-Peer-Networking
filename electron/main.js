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

// B9 FIX: 512KB chunks (was 64KB) for faster transfers
const CHUNK = 524288
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

// ── PERSISTENT IDENTITY KEY ───────────────────────────────────────────────────
// Unlike ephemeral ECDH keys (regenerated every session for forward secrecy),
// the identity key persists across sessions so TOFU can tell "same device" from
// "different device" without false MITM warnings on reconnection.
const identityFile = path.join(app.getPath('userData'), 'identity.json')
let myIdentityKey = null   // hex string, loaded/created on startup

function loadIdentity() {
  try {
    if (fs.existsSync(identityFile)) {
      const d = JSON.parse(fs.readFileSync(identityFile, 'utf8'))
      if (d?.key && typeof d.key === 'string' && d.key.length === 64) {
        myIdentityKey = d.key; return
      }
    }
  } catch { }
  // Generate fresh identity key
  myIdentityKey = crypto.randomBytes(32).toString('hex')
  try {
    fs.mkdirSync(path.dirname(identityFile), { recursive: true })
    fs.writeFileSync(identityFile, JSON.stringify({ key: myIdentityKey, created: new Date().toISOString() }))
  } catch { }
  secEntry('OK', 'New persistent identity key generated')
}

// ── TOFU STORE ────────────────────────────────────────────────────────────────
const tofuStore = new Map()
const tofuFile = path.join(app.getPath('userData'), 'known_peers.json')

function loadTOFU() {
  try {
    if (fs.existsSync(tofuFile)) {
      const data = JSON.parse(fs.readFileSync(tofuFile, 'utf8'))
      for (const [k, v] of Object.entries(data)) tofuStore.set(k, v)
    }
  } catch { }
}
function saveTOFU() {
  try {
    const obj = {}; tofuStore.forEach((v, k) => obj[k] = v)
    fs.writeFileSync(tofuFile, JSON.stringify(obj, null, 2))
  } catch { }
}

// FIX: TOFU now checks identityKey (persistent per-device), NOT the ephemeral
// ECDH pubkey. This means reconnections from same device never trigger MITM warning.
function tofuCheck(nodeId, identityKey, name) {
  const existing = tofuStore.get(nodeId)
  if (!existing) {
    tofuStore.set(nodeId, {
      identityKey, name,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    })
    saveTOFU()
    return { status: 'new' }
  }
  if (existing.identityKey === identityKey) {
    existing.lastSeen = new Date().toISOString()
    existing.name = name || existing.name
    saveTOFU()
    return { status: 'trusted' }
  }
  // Identity key changed — this is unusual and warrants a warning
  return { status: 'changed', previousName: existing.name, firstSeen: existing.firstSeen }
}
function tofuAcceptNewKey(nodeId, identityKey, name) {
  tofuStore.set(nodeId, {
    identityKey, name,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  })
  saveTOFU()
}

// ── BLOCKED PEERS (B4/C1) ────────────────────────────────────────────────────
const blockedPeers = new Map()  // nodeId → { name, blockedAt, reason }
const blockedFile = path.join(app.getPath('userData'), 'blocked_peers.json')
// IP rate limiting: track connection attempts per IP
const connectionAttempts = new Map()  // ip → { count, firstAttempt }
const RATE_LIMIT_WINDOW = 60000  // 60s window
const RATE_LIMIT_MAX = 5  // max attempts per window

function loadBlocked() {
  try {
    if (fs.existsSync(blockedFile)) {
      const data = JSON.parse(fs.readFileSync(blockedFile, 'utf8'))
      for (const [k, v] of Object.entries(data)) blockedPeers.set(k, v)
    }
  } catch { }
}
function saveBlocked() {
  try {
    const obj = {}; blockedPeers.forEach((v, k) => obj[k] = v)
    fs.writeFileSync(blockedFile, JSON.stringify(obj, null, 2))
  } catch { }
}
function isBlocked(nodeId) {
  return blockedPeers.has(nodeId)
}
function isRateLimited(ip) {
  const now = Date.now()
  const entry = connectionAttempts.get(ip)
  if (!entry) { connectionAttempts.set(ip, { count: 1, firstAttempt: now }); return false }
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) {
    connectionAttempts.set(ip, { count: 1, firstAttempt: now }); return false
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    secEntry('WARN', `Rate limited IP: ${ip}`, `${entry.count} attempts in ${Math.round((now - entry.firstAttempt) / 1000)}s`)
    return true
  }
  return false
}

// ── RECONNECT TRACKING ────────────────────────────────────────────────────────
const pendingReconnects = new Map()
let reconnectMax = 5
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000]

// ── SECURITY LOG ──────────────────────────────────────────────────────────────
const secLog = []
function secEntry(level, msg, detail = '') {
  const entry = { ts: new Date().toISOString().slice(11, 19), level, msg, detail }
  secLog.push(entry)
  if (secLog.length > 500) secLog.shift()
  emit('p2n:log', entry)
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
            identityKey: conn._peerIdentityKey,
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


// ── PERSISTENCE SETTINGS ──────────────────────────────────────────────────────
// Controls whether identity.json / known_peers.json / blocked_peers.json survive quit.
// Default: OFF (false) — every session starts completely fresh.
// If user enables, files are kept across restarts.
const persistSettingsFile = path.join(app.getPath('userData'), 'persist_settings.json')
let persistData = false  // default OFF — no data kept between sessions

function loadPersistSettings() {
  try {
    if (fs.existsSync(persistSettingsFile)) {
      const d = JSON.parse(fs.readFileSync(persistSettingsFile, 'utf8'))
      if (typeof d?.persistData === 'boolean') persistData = d.persistData
    }
  } catch { }
}
function savePersistSettings() {
  try { fs.writeFileSync(persistSettingsFile, JSON.stringify({ persistData, updatedAt: new Date().toISOString() })) } catch { }
}

// Wipe persistent session data on exit (keep identity.json + port_settings.json)
function wipePersistentData() {
  // If persistData is OFF (default), wipe all three files
  // If persistData is ON, keep them — user wants continuity across sessions
  if (!persistData) {
    tofuStore.clear()
    blockedPeers.clear()
    try { fs.unlinkSync(tofuFile) } catch { }
    try { fs.unlinkSync(blockedFile) } catch { }
    try { fs.unlinkSync(identityFile) } catch { }
    secEntry('OK', 'Session data wiped — identity, peers, blocked cleared (persistData=OFF)')
  } else {
    secEntry('OK', 'Session ended — data kept on disk (persistData=ON)')
  }
}

app.whenReady().then(() => {
  loadPersistSettings()  // must load first — affects whether identity/tofu/blocked are loaded
  if (persistData) {
    loadIdentity()
    loadTOFU()
    loadBlocked()
  } else {
    // persistData OFF: generate fresh identity every time
    myIdentityKey = require('crypto').randomBytes(32).toString('hex')
    secEntry('OK', 'Fresh identity generated (persistData=OFF)')
  }
  loadPortSettings()
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})
app.on('window-all-closed', () => {
  activeSession = null
  // A8 FIX: wipePersistentData only in before-quit (was called 3x total)
  stopServer(); _shutdownDiscovery(); stopTorDaemon()
  peers.forEach((_, id) => disconnectPeer(id))
  cleanupAllSandboxes()
  if (process.platform !== 'darwin') app.quit()
})
// A8+A7 FIX: Single before-quit handler for both wipePersistentData and cleanupAllSandboxes
app.on('before-quit', () => { wipePersistentData(); cleanupAllSandboxes() })

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
      let logBuffer = ''

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
        logBuffer += chunk
        
        // Log to UI
        chunk.split('\n').filter(l => l.trim()).forEach(l => {
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'INFO', msg: 'Tor: ' + l.trim() })
        })

        if (logBuffer.includes('Bootstrapped 100%') && !started) {
          started = true
          clearTimeout(timeout)
          // A3 FIX: Clear log buffer after bootstrap to prevent unbounded memory growth
          logBuffer = ''
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

    const fail = (err) => { if (!settled) { settled = true; try { sock.destroy() } catch { }; reject(err) } }
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
          const codes = { 1: 'general failure', 2: 'connection not allowed', 3: 'network unreachable', 4: 'host unreachable', 5: 'connection refused', 6: 'TTL expired', 7: 'command not supported', 8: 'address type not supported' }
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
function extractArchive(src, dest) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase(); let cmd, args
    if (process.platform === 'win32') {
      if (/\.(zip|tar|tgz|tar\.gz|tar\.bz2)$/.test(e)) { cmd = 'tar'; args = ['-xf', src, '-C', dest] }
      else if (/\.(7z|rar)$/.test(e)) { cmd = '7z'; args = ['x', src, `-o${dest}`, '-y'] }
      else return reject(new Error('Unsupported format'))
    } else {
      if (e.endsWith('.zip')) { cmd = 'unzip'; args = ['-o', src, '-d', dest] }
      else if (/\.(tar\.gz|tgz)$/.test(e)) { cmd = 'tar'; args = ['-xzf', src, '-C', dest] }
      else if (/\.(tar\.bz2|tbz2)$/.test(e)) { cmd = 'tar'; args = ['-xjf', src, '-C', dest] }
      else if (e.endsWith('.tar')) { cmd = 'tar'; args = ['-xf', src, '-C', dest] }
      else if (/\.(7z|rar)$/.test(e)) { cmd = '7z'; args = ['x', src, `-o${dest}`, '-y'] }
      else return reject(new Error('Unsupported format'))
    }
    execFile(cmd, args, { timeout: 60000 }, err => err ? reject(err) : resolve())
  })
}
function cleanupAllSandboxes() {
  for (const [, dir] of sandboxes) try { fs.rmSync(path.dirname(dir), { recursive: true, force: true }) } catch { }
  sandboxes.clear()
}
// A7 FIX: Removed duplicate cleanupAllSandboxes — already handled in before-quit above

// ═════════════════════════════════════════════════════════════════════════════
// PEER CONN — ECDH P-256 ephemeral · AES-256-GCM every frame
// Persistent identityKey (separate from ECDH) used for TOFU
// ═════════════════════════════════════════════════════════════════════════════
class PeerConn {
  constructor(socket, initiatorInfo = null) {
    this.socket = socket; this.id = null; this.name = ''; this.sharedKey = null
    this.ready = false; this._buf = Buffer.alloc(0)
    this._ecdh = crypto.createECDH('prime256v1'); this._ecdh.generateKeys()
    this._filebufs = new Map(); this._sendQueue = []
    this._fingerprint = null
    this._peerIdentityKey = null
    this._myPubkey = this._ecdh.getPublicKey('base64')
    this._initiator = initiatorInfo
    this._reconnecting = false
    this._reconnectAttempt = 0
    this._closed = false
    this._setup()
  }
  _setup() {
    this.socket.on('data', d => {
      totalBytesReceived += d.length
      this._buf = Buffer.concat([this._buf, d]);
      this._drain()
    })
    this.socket.on('error', e => { secEntry('WARN', 'Socket error', e.message); this._onDisconnect() })
    this.socket.on('close', () => this._onDisconnect())
    this.socket.setKeepAlive(true, 5000); this.socket.setNoDelay(true)
    // HELLO includes persistent identityKey for TOFU + ephemeral ECDH pubkey for encryption
    const hello = Buffer.from(JSON.stringify({
      type: 'HELLO',
      pubkey: this._myPubkey,       // ephemeral ECDH — for encryption only
      identityKey: myIdentityKey,   // persistent — for TOFU identity
      nodeId: myNodeId,
      name: myName,
      v: 4,
    }))
    const hdr = Buffer.alloc(4); hdr.writeUInt32BE(hello.length, 0)
    this.socket.write(Buffer.concat([hdr, hello]))
  }
  _drain() {
    while (true) {
      if (this._buf.length < FRAME_HDR) return
      const len = this._buf.readUInt32BE(0)
      if (len > 64 * 1024 * 1024) { secEntry('ERR', 'Frame too large'); this._close(); return }
      if (this._buf.length < FRAME_HDR + len) return
      const frame = this._buf.slice(FRAME_HDR, FRAME_HDR + len)
      this._buf = this._buf.slice(FRAME_HDR + len)
      if (!this.ready) this._onHello(frame); else this._onFrame(frame)
    }
  }
  _onHello(frame) {
    try {
      const h = JSON.parse(frame.toString())
      if (h.type !== 'HELLO') { this._close(); return }
      const secret = this._ecdh.computeSecret(Buffer.from(h.pubkey, 'base64'))
      this.sharedKey = crypto.createHash('sha256').update(secret).digest()
      this.id = h.nodeId || ('p_' + Date.now().toString(36))
      this.name = h.name || ''
      this._peerIdentityKey = h.identityKey || h.pubkey  // fallback to pubkey for v<4 clients

      // B4/C1 FIX: Check if peer is blocked before proceeding
      if (isBlocked(this.id)) {
        secEntry('WARN', `Blocked peer ${this.name || this.id} attempted to connect — rejected`)
        this._close()
        return
      }
      // Rate limiting check
      const remoteIP = this.socket.remoteAddress || ''
      if (isRateLimited(remoteIP)) {
        secEntry('WARN', `Rate limited connection from ${remoteIP}`)
        this._close()
        return
      }

      this.ready = true

      // Session fingerprint from ECDH keys (for voice verification)
      const keys = [this._myPubkey, h.pubkey].sort()
      const fpHash = crypto.createHash('sha256').update(keys.join(':')).digest()
      this._fingerprint = Array.from(fpHash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':')

      // FIX: Handle legacy v<4 clients that don't send persistent identityKey
      const isLegacyClient = !h.identityKey || (h.v || 1) < 4
      const tofu = isLegacyClient ? { status: 'trusted' } : tofuCheck(this.id, this._peerIdentityKey, h.name)
      peers.set(this.id, this)

      const rc = pendingReconnects.get(this.id)
      if (rc) { clearTimeout(rc.timer); pendingReconnects.delete(this.id) }
      this._reconnecting = false; this._reconnectAttempt = 0

      secEntry('OK', `Peer connected: ${this.name || this.id}`, `${this.socket.remoteAddress || ''} · FP: ${this._fingerprint}`)
      emit('ftps:peer-connected', {
        peerId: this.id,
        peerName: this.name,
        fingerprint: this._fingerprint,
        identityKey: this._peerIdentityKey,
        tofu: tofu.status,
        tofuDetail: tofu.status === 'changed' ? { previousName: tofu.previousName, firstSeen: tofu.firstSeen } : null,
      })
      if (this._sendQueue.length > 0) {
        for (const obj of this._sendQueue) this.send(obj)
        this._sendQueue = []
      }
    } catch (e) { secEntry('ERR', 'Handshake failed', e.message); this._close() }
  }
  _onFrame(frame) {
    try {
      if (frame.length < 28) throw new Error('Frame too short')
      const iv = frame.slice(0, 12), tag = frame.slice(-16), ct = frame.slice(12, -16)
      const d = crypto.createDecipheriv('aes-256-gcm', this.sharedKey, iv); d.setAuthTag(tag)
      const msg = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString())
      this._dispatch(msg)
    } catch (e) { secEntry('WARN', 'Decrypt/auth failed', e.message) }
  }
  send(obj) {
    if (!this.ready || !this.sharedKey) { if (this._reconnecting) { this._sendQueue.push(obj); return }; return }
    try {
      const plain = Buffer.from(JSON.stringify(obj)), iv = crypto.randomBytes(12)
      const enc = crypto.createCipheriv('aes-256-gcm', this.sharedKey, iv)
      const ct = Buffer.concat([enc.update(plain), enc.final()])
      const frame = Buffer.concat([iv, ct, enc.getAuthTag()])
      const hdr = Buffer.alloc(4); hdr.writeUInt32BE(frame.length, 0)
      const data = Buffer.concat([hdr, frame])
      this.socket.write(data)
      totalBytesSent += data.length
    } catch (e) { secEntry('ERR', 'Send failed', e.message) }
  }
  async _dispatch(msg) {
    switch (msg.type) {
      case 'chat': emit('ftps:message', { peerId: this.id, msg }); break
      case 'file_start': {
        const largeTmpPath = path.join(os.tmpdir(), 'p2n-recv-' + msg.fid + '-' + crypto.randomBytes(4).toString('hex'))
        this._filebufs.set(msg.fid, { meta: msg, chunks: new Map(), tmpPath: largeTmpPath, written: 0 })
        emit('ftps:file-start', { peerId: this.id, meta: msg })
        break
      }
      case 'file_chunk': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) {
          fb.chunks.set(msg.i, Buffer.from(msg.d, 'base64'))
          emit('ftps:file-progress', { peerId: this.id, fid: msg.fid, pct: fb.chunks.size / fb.meta.total })
        }
        break
      }
      case 'file_end': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) {
          const sorted = [...fb.chunks.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
          const LARGE_THRESHOLD = 32 * 1024 * 1024
          if (fb.meta.size > LARGE_THRESHOLD) {
            try {
              const tmpPath = fb.tmpPath
              const ws = fs.createWriteStream(tmpPath)
              await new Promise((res, rej) => { ws.on('finish', res); ws.on('error', rej); sorted.forEach(c => ws.write(c)); ws.end() })
              emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: null, tmpPath })
              secEntry('OK', `Large file received: ${fb.meta.name}`, `${fb.meta.size}B → ${tmpPath}`)
            } catch (e) {
              secEntry('ERR', `Large file write failed: ${fb.meta.name}`, e.message)
              emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: null, tmpPath: null })
            }
          } else {
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
  async sendFile(fid, name, size, mime, dataB64, extraMeta = {}) {
    this._activeSends = this._activeSends || new Map()
    const abort = { cancelled: false }
    this._activeSends.set(fid, abort)
    const total = Math.ceil(size / CHUNK)
    this.send({ type: 'file_start', fid, name, size, total, mime, ...extraMeta })
    secEntry('OK', `Sending: ${name}`, `${size}B`)
    const raw = Buffer.from(dataB64, 'base64')
    for (let i = 0; i < total; i++) {
      if (abort.cancelled) {
        this.send({ type: 'file_abort', fid })
        this._activeSends.delete(fid)
        secEntry('INFO', `Send cancelled: ${name}`)
        return
      }
      this.send({ type: 'file_chunk', fid, i, d: raw.slice(i * CHUNK, (i + 1) * CHUNK).toString('base64') })
      // B9c FIX: Yield more frequently (every 4 chunks) for better responsiveness with larger chunks
      if (i % 4 === 0) await new Promise(r => setImmediate(r))
      emit('ftps:send-progress', { peerId: this.id, fid, pct: (i + 1) / total })
    }
    this._activeSends.delete(fid)
    this.send({ type: 'file_end', fid })
  }
  cancelSend(fid) {
    if (this._activeSends?.has(fid)) { this._activeSends.get(fid).cancelled = true; return true }
    return false
  }
  _onDisconnect() {
    if (this._closed) return
    const id = this.id, name = this.name, wasReady = this.ready
    this.ready = false; try { this.socket.destroy() } catch { }
    if (wasReady && this._initiator && !this._closed && this._reconnectAttempt < reconnectMax) {
      this._reconnecting = true; this._reconnectAttempt++
      const delay = RECONNECT_DELAYS[Math.min(this._reconnectAttempt - 1, RECONNECT_DELAYS.length - 1)]
      secEntry('INFO', `Reconnecting to ${name || id} (${this._reconnectAttempt}/${reconnectMax})`, `in ${delay}ms`)
      emit('ftps:peer-reconnecting', { peerId: id, attempt: this._reconnectAttempt, maxAttempts: reconnectMax })
      const timer = setTimeout(() => {
        pendingReconnects.delete(id); if (this._closed) return
        const sock = net.createConnection({ host: this._initiator.host, port: this._initiator.port }, () => {
          const nc = new PeerConn(sock, this._initiator)
          nc._sendQueue = this._sendQueue
          nc._reconnectAttempt = this._reconnectAttempt
          // BUG-10 fix: pre-register new PeerConn under the old id so the peers map
          // is never empty during reconnect. _onHello will overwrite with final id.
          if (id) {
            peers.delete(id)
            peers.set(id, nc)
          }
        })
        sock.on('error', () => this._onDisconnect())
        sock.setTimeout(8000, () => { sock.destroy(); this._onDisconnect() })
      }, delay)
      pendingReconnects.set(id, { ...this._initiator, attempt: this._reconnectAttempt, timer, maxAttempts: reconnectMax })
      return
    }
    this._close()
  }
  _close() {
    if (this._closed) return; this._closed = true; this._reconnecting = false
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
  const suffix = myIdentityKey.slice(0, 6)
  myNodeId = nodeId + '-' + suffix
  myName = name
  activeSession = { name, nodeId: myNodeId, startedAt: new Date().toISOString() }
  secEntry('OK', `Identity: ${name} ${myNodeId}`)
  // Start passive mDNS discovery immediately
  startPassiveDiscovery()

  // FIX: Auto-start TCP server + Tor when a session begins using the user's SAVED port.
  // savedPort defaults to 7900 but is updated when user saves a different port in Settings.
  if (!tcpServer) {
    try {
      const r = await startServer(savedPort)
      startDiscovery(r.port)
      emit('ftps:listen-auto', { ok: true, port: r.port, localIPs: r.localIPs })
      secEntry('OK', `TCP server auto-started on port ${r.port}`)
      if (torEnabled) {
        startTorHiddenService(r.port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
      }
    } catch (e) {
      secEntry('WARN', 'TCP server auto-start failed', e.message)
    }
  } else if (torEnabled && !torProcess) {
    // Server already up (session restore) — just ensure Tor is running
    const port = tcpServer.address()?.port
    if (port) startTorHiddenService(port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
  }

  return { ok: true, nodeId: myNodeId, identityKey: myIdentityKey }
})
ipcMain.handle('ftps:clear-session', () => { activeSession = null; wipePersistentData(); return { ok: true } })
ipcMain.handle('ftps:get-session', () => activeSession ? { ...activeSession, active: true } : { active: false })
ipcMain.handle('ftps:get-local-ips', () => getLocalIPs())
ipcMain.handle('ftps:get-logs', () => [...secLog])
ipcMain.handle('ftps:clear-logs', () => { secLog.length = 0; return { ok: true } })
ipcMain.handle('ftps:get-peers', () => {
  const result = []
  peers.forEach(conn => { if (conn.ready && conn.id) result.push({ peerId: conn.id, peerName: conn.name, fingerprint: conn._fingerprint, identityKey: conn._peerIdentityKey, tofu: 'trusted', tofuDetail: null }) })
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
ipcMain.handle('ftps:send-file-in-folder', async (_, { peerId, fid, name, size, mime, dataB64, folderFid, folderRelPath, fileIndex }) => {
  const c = peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
  try { await c.sendFile(fid, name, size, mime, dataB64, { folderFid, folderRelPath, fileIndex }); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
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
  const key = identityKey || c?._peerIdentityKey
  if (!key) { secEntry('WARN', `TOFU accept: no identityKey for ${peerId}`); return { ok: false, error: 'No identity key available' } }
  tofuAcceptNewKey(peerId, key, name); secEntry('OK', `TOFU: accepted new identity for ${name || peerId}`)
  return { ok: true }
})
ipcMain.handle('ftps:tofu-get-known', () => { const r = []; tofuStore.forEach((v, k) => r.push({ id: k, ...v })); return r })
ipcMain.handle('ftps:tofu-remove', (_, { peerId }) => { tofuStore.delete(peerId); saveTOFU(); secEntry('INFO', `TOFU: removed ${peerId}`); return { ok: true } })
ipcMain.handle('ftps:get-fingerprint', (_, { peerId }) => { const c = peers.get(peerId); return { fingerprint: c?._fingerprint || null } })

// B4/C1: Blocked peers IPC
ipcMain.handle('ftps:block-peer', (_, { peerId, peerName, reason }) => {
  blockedPeers.set(peerId, { name: peerName || '', blockedAt: new Date().toISOString(), reason: reason || '' })
  saveBlocked()
  // Disconnect if currently connected
  const c = peers.get(peerId)
  if (c) c.disconnect()
  secEntry('OK', `Blocked peer: ${peerName || peerId}`)
  return { ok: true }
})
ipcMain.handle('ftps:unblock-peer', (_, { peerId }) => {
  blockedPeers.delete(peerId)
  saveBlocked()
  secEntry('OK', `Unblocked peer: ${peerId}`)
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
  return { running: !!torProcess, onionAddress: onionAddress || null, socksPort: torSocksPort, enabled: torEnabled }
})

// Max retries IPC
ipcMain.handle('ftps:set-max-retries', (_, { value }) => {
  reconnectMax = Math.max(1, Math.min(20, parseInt(value) || 5))
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
  // cpus removed — os.cpus() was called but result was never used
  const load = os.loadavg() // [1m, 5m, 15m]
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
    loadAvg: load[0], // 1 minute avg
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

// List contents of a zip/rar archive as a file tree (no extraction)
ipcMain.handle('ftps:list-archive', async (_, { name, dataB64 }) => {
  try {
    const sid = crypto.randomBytes(6).toString('hex')
    const tmpDir = path.join(os.tmpdir(), 'p2n-archlist-' + sid)
    fs.mkdirSync(tmpDir, { recursive: true })
    const archPath = path.join(tmpDir, name)
    fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))
    // Check for password protection on zip
    if (/\.zip$/i.test(name)) {
      const buf = fs.readFileSync(archPath)
      const str = buf.toString('binary')
      if (str.includes('\x09\x08\x06\x00') || (buf[6] & 0x01)) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
        return { passwordProtected: true }
      }
    }
    const listDir = path.join(tmpDir, 'listing')
    fs.mkdirSync(listDir, { recursive: true })
    await extractArchive(archPath, listDir)
    const tree = buildFileTree(listDir, listDir)
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return { ok: true, tree }
  } catch (e) {
    if (e.message?.toLowerCase().includes('password') || e.message?.toLowerCase().includes('encrypted')) {
      return { passwordProtected: true }
    }
    return { error: e.message }
  }
})

// Read a single file entry from inside a zip/rar (for preview without full extraction)
ipcMain.handle('ftps:read-archive-entry', async (_, { name, dataB64, entryPath }) => {
  try {
    const sid = crypto.randomBytes(6).toString('hex')
    const tmpDir = path.join(os.tmpdir(), 'p2n-archentry-' + sid)
    fs.mkdirSync(tmpDir, { recursive: true })
    const archPath = path.join(tmpDir, name)
    fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))
    const extractDir = path.join(tmpDir, 'entry')
    fs.mkdirSync(extractDir, { recursive: true })
    await extractArchive(archPath, extractDir)
    const targetPath = path.resolve(extractDir, entryPath)
    // Path traversal guard
    if (!targetPath.startsWith(path.resolve(extractDir))) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return { ok: false, error: 'Path traversal detected' }
    }
    if (!fs.existsSync(targetPath)) {
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
    fs.mkdirSync(stageDir, { recursive: true })
    const fileDest = path.join(stageDir, name)
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.copyFileSync(tmpPath, fileDest)
    } else if (dataB64) {
      fs.writeFileSync(fileDest, Buffer.from(dataB64, 'base64'))
    } else {
      return { ok: false, error: 'No file data provided' }
    }

    if (plat === 'win32') {
      // Try Windows Sandbox (requires Win10/11 Pro with Hyper-V)
      const wsb = `<Configuration><MappedFolders><MappedFolder><HostFolder>${stageDir}</HostFolder><ReadOnly>true</ReadOnly></MappedFolder></MappedFolders><LogonCommand><Command>explorer C:\\Users\\WDAGUtilityAccount\\Desktop\\mapped</Command></LogonCommand></Configuration>`
      const wsbPath = path.join(stageDir, 'sandbox.wsb')
      fs.writeFileSync(wsbPath, wsb)
      const { spawn } = require('child_process')
      const proc = spawn('WindowsSandbox.exe', [wsbPath], { detached: true, stdio: 'ignore' })
      proc.unref()
      secEntry('OK', `Windows Sandbox launched for ${name}`)
      return { ok: true, message: 'Windows Sandbox launched — file is read-only inside' }
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
      const launched = await tryCmd('firejail', ['--noprofile', '--private=' + stageDir, 'bash', '-c', `cd ${stageDir} && xterm -e "ls -la; echo 'Press Enter'; read" || bash`])
        || await tryCmd('bwrap', ['--ro-bind', stageDir, '/sandbox', '--proc', '/proc', '--dev', '/dev', '--unshare-all', 'ls', '-la', '/sandbox'])
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


// Persistence settings IPC
ipcMain.handle('ftps:get-persist-settings', () => ({ persistData }))
ipcMain.handle('ftps:set-persist-settings', (_, { persist }) => {
  persistData = !!persist
  savePersistSettings()
  secEntry('OK', `Persistent data storage ${persistData ? 'ENABLED' : 'DISABLED'}`)
  return { ok: true, persistData }
})

// Shell + Window
ipcMain.handle('shell:open-external', async (_, { url }) => { if (!/^https?:\/\//.test(url)) return { ok: false }; await shell.openExternal(url); secEntry('INFO', 'External URL', url); return { ok: true } })
ipcMain.handle('window:control', (_, { action }) => {
  if (!mainWindow) return
  const wc = mainWindow.webContents
  switch (action) {
    case 'minimize': mainWindow.minimize(); break
    case 'maximize': mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); break
    case 'fullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break
    case 'devtools': wc.toggleDevTools(); break
    // FIX: reload refreshes renderer UI only — TCP peers survive, re-announced via did-finish-load
    case 'reload': wc.reload(); break
    case 'zoomin': wc.setZoomLevel(wc.getZoomLevel() + 0.5); break
    case 'zoomout': wc.setZoomLevel(wc.getZoomLevel() - 0.5); break
    case 'zoomreset': wc.setZoomLevel(0); break
    case 'close-confirmed': allowClose = true; mainWindow.close(); break
  }
  return { ok: true }
})
