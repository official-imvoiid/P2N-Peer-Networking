/**
 * P2N — Peer-Networking · Main Process
 * Direct TCP · ECDH P-256 · AES-256-GCM
 * Persistent Identity Key (TOFU) · mDNS Local Discovery
 * UPnP + STUN + HTTP fallback · Sandbox · Security log
 */
'use strict'

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path   = require('path')
const net    = require('net')
const crypto = require('crypto')
const os     = require('os')
const fs     = require('fs')
const dgram  = require('dgram')
const http   = require('http')
const https  = require('https')
const dns    = require('dns')
const { exec, execFile } = require('child_process')

const CHUNK     = 65536
const FRAME_HDR = 4

// ── MUTABLE STATE ─────────────────────────────────────────────────────────────
let mainWindow  = null
let tcpServer   = null
const peers     = new Map()
let myNodeId    = '#0000'
let myName      = 'Unknown'
let upnpMapping = null
let allowClose  = false

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
  } catch {}
  // Generate fresh identity key
  myIdentityKey = crypto.randomBytes(32).toString('hex')
  try {
    fs.mkdirSync(path.dirname(identityFile), { recursive: true })
    fs.writeFileSync(identityFile, JSON.stringify({ key: myIdentityKey, created: new Date().toISOString() }))
  } catch {}
  secEntry('OK', 'New persistent identity key generated')
}

// ── TOFU STORE ────────────────────────────────────────────────────────────────
const tofuStore = new Map()
const tofuFile  = path.join(app.getPath('userData'), 'known_peers.json')

function loadTOFU() {
  try {
    if (fs.existsSync(tofuFile)) {
      const data = JSON.parse(fs.readFileSync(tofuFile, 'utf8'))
      for (const [k, v] of Object.entries(data)) tofuStore.set(k, v)
    }
  } catch {}
}
function saveTOFU() {
  try {
    const obj = {}; tofuStore.forEach((v, k) => obj[k] = v)
    fs.writeFileSync(tofuFile, JSON.stringify(obj, null, 2))
  } catch {}
}

// FIX: TOFU now checks identityKey (persistent per-device), NOT the ephemeral
// ECDH pubkey. This means reconnections from same device never trigger MITM warning.
function tofuCheck(nodeId, identityKey, name) {
  const existing = tofuStore.get(nodeId)
  if (!existing) {
    tofuStore.set(nodeId, {
      identityKey, name,
      firstSeen: new Date().toISOString(),
      lastSeen:  new Date().toISOString(),
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
    lastSeen:  new Date().toISOString(),
  })
  saveTOFU()
}

// ── RECONNECT TRACKING ────────────────────────────────────────────────────────
const pendingReconnects = new Map()
const RECONNECT_MAX    = 5
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
const MDNS_ADDR = '224.0.0.251'
const MDNS_PORT = 7476
let discoverySocket   = null
let discoveryInterval = null
const discoveredPeers = new Map()  // address → { name, nodeId, port, address, lastSeen }

function startDiscovery(listenPort) {
  if (discoverySocket) stopDiscovery()
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  discoverySocket = sock

  sock.on('error', () => { discoverySocket = null })
  sock.on('message', (data, rinfo) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type !== 'P2N_ANNOUNCE' || msg.nodeId === myNodeId) return
      const key = rinfo.address + ':' + msg.nodeId
      discoveredPeers.set(key, {
        name: msg.name || 'Unknown',
        nodeId: msg.nodeId,
        port: msg.port,
        address: rinfo.address,
        lastSeen: Date.now(),
      })
      // Prune stale peers (>30s)
      const now = Date.now()
      for (const [k, v] of discoveredPeers) {
        if (now - v.lastSeen > 30000) discoveredPeers.delete(k)
      }
      emit('ftps:peers-discovered', Array.from(discoveredPeers.values()))
    } catch {}
  })

  const announce = () => {
    if (!discoverySocket) return
    try {
      const msg = Buffer.from(JSON.stringify({
        type: 'P2N_ANNOUNCE',
        name: myName,
        nodeId: myNodeId,
        port: listenPort,
        v: 1,
      }))
      sock.send(msg, MDNS_PORT, MDNS_ADDR, () => {})
    } catch {}
  }

  sock.bind(MDNS_PORT, () => {
    try { sock.addMembership(MDNS_ADDR) } catch {}
    sock.setMulticastTTL(4)
    announce()
    discoveryInterval = setInterval(announce, 5000)
    secEntry('OK', `mDNS discovery started on port ${listenPort}`)
  })
}

function stopDiscovery() {
  clearInterval(discoveryInterval); discoveryInterval = null
  if (discoverySocket) { try { discoverySocket.close() } catch {}; discoverySocket = null }
  discoveredPeers.clear()
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
            peerId:      conn.id,
            peerName:    conn.name,
            fingerprint: conn._fingerprint,
            identityKey: conn._peerIdentityKey,
            tofu:        'trusted',
            tofuDetail:  null,
          })
        }
      })
      // Re-emit UPnP state
      if (upnpMapping) {
        emit('ftps:upnp-status', {
          status:     'mapped',
          port:        upnpMapping.port,
          externalIp:  upnpMapping.externalIp,
        })
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

app.whenReady().then(() => {
  loadIdentity()
  loadTOFU()
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})
app.on('window-all-closed', () => {
  stopServer(); stopDiscovery()
  peers.forEach((_, id) => disconnectPeer(id))
  upnpRemoveMapping().catch(() => {}); cleanupAllSandboxes()
  if (process.platform !== 'darwin') app.quit()
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
    const v4  = all.find(i => i.family === 'IPv4' && !i.internal)
    const mac = all.find(i => i.mac && i.mac !== '00:00:00:00:00:00')
    if (v4) results.push({ name, address: v4.address, netmask: v4.netmask, mac: mac?.mac || null })
  }
  return results
}

function fetchPublicIPHttp() {
  const SOURCES = [
    'https://api.ipify.org?format=json',
    'https://api4.my-ip.io/ip.json',
  ]
  return new Promise(resolve => {
    let done = false
    let tried = 0
    for (const url of SOURCES) {
      const req = https.get(url, { timeout: 5000 }, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => {
          if (done) return; done = true
          try {
            const j = JSON.parse(d)
            resolve(j.ip || j.IP || null)
          } catch { if (++tried === SOURCES.length && !done) { done=true; resolve(null) } }
        })
      })
      req.on('error', () => { if (++tried === SOURCES.length && !done) { done=true; resolve(null) } })
      req.on('timeout', () => { req.destroy() })
    }
    setTimeout(() => { if (!done) { done=true; resolve(null) } }, 6000)
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// STUN — RFC 5389 minimal UDP client
// ═════════════════════════════════════════════════════════════════════════════
function stunDiscover(localPort = 0) {
  return new Promise(resolve => {
    const SERVERS = [
      { host: 'stun.l.google.com',     port: 19302 },
      { host: 'stun1.l.google.com',    port: 19302 },
      { host: 'stun2.l.google.com',    port: 19302 },
      { host: 'stun.cloudflare.com',   port: 3478  },
      { host: 'stun.stunprotocol.org', port: 3478  },
      { host: 'stun.nextcloud.com',    port: 3478  },
    ]
    let done = false
    const sock = dgram.createSocket('udp4')
    const finish = result => {
      if (done) return; done = true
      clearTimeout(timer); clearInterval(retryInterval)
      try { sock.close() } catch {} resolve(result)
    }
    const timer = setTimeout(() => {
      secEntry('WARN', 'STUN timed out (8s) — trying HTTP fallback')
      finish(null)
    }, 8000)

    const req = Buffer.alloc(20)
    req.writeUInt16BE(0x0001, 0); req.writeUInt16BE(0, 2)
    req.writeUInt32BE(0x2112A442, 4); crypto.randomBytes(12).copy(req, 8)

    sock.on('error', () => finish(null))
    sock.on('message', data => {
      if (done) return
      try {
        if (data.length < 20 || data.readUInt16BE(0) !== 0x0101) return
        let offset = 20
        while (offset + 4 <= data.length) {
          const aType = data.readUInt16BE(offset), aLen = data.readUInt16BE(offset + 2)
          if ((aType === 0x0020 || aType === 0x0001) && data.readUInt8(offset + 5) === 0x01 && offset + 12 <= data.length) {
            let port, ip
            if (aType === 0x0020) {
              port = data.readUInt16BE(offset + 6) ^ 0x2112
              ip = [data.readUInt8(offset+8)^0x21, data.readUInt8(offset+9)^0x12, data.readUInt8(offset+10)^0xA4, data.readUInt8(offset+11)^0x42].join('.')
            } else {
              port = data.readUInt16BE(offset + 6)
              ip = [offset+8,offset+9,offset+10,offset+11].map(o=>data.readUInt8(o)).join('.')
            }
            finish({ ip, port }); return
          }
          offset += 4 + aLen + (aLen % 4 ? 4 - aLen % 4 : 0)
        }
      } catch {}
    })
    let retryCount = 0
    const sendAll = () => { for (const s of SERVERS) sock.send(req, s.port, s.host, () => {}) }
    const retryInterval = setInterval(() => { if (++retryCount < 4 && !done) sendAll() }, 1500)
    sock.bind(localPort, () => { sendAll() })
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// UPnP — SSDP discovery + SOAP port mapping
// ═════════════════════════════════════════════════════════════════════════════
function upnpDiscover() {
  return new Promise(resolve => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const SA = '239.255.255.250', SP = 1900
    let found = false
    const done = r => { if (found) return; found = true; try { sock.close() } catch {}; clearTimeout(t); clearInterval(retry); resolve(r) }
    const t = setTimeout(() => { secEntry('WARN','UPnP: No IGD found (10s timeout)'); done(null) }, 10000)
    sock.on('error', () => done(null))
    sock.on('message', d => { const m = /LOCATION:\s*(.+)/i.exec(d.toString()); if (m) done(m[1].trim()) })
    const sendDiscovery = () => {
      for (const st of [
        'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
        'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
        'urn:schemas-upnp-org:service:WANIPConnection:1',
        'urn:schemas-upnp-org:service:WANIPConnection:2',
        'urn:schemas-upnp-org:service:WANPPPConnection:1',
        'upnp:rootdevice',
      ])
        sock.send(Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SA}:${SP}\r\nMAN: "ssdp:discover"\r\nMX: 3\r\nST: ${st}\r\n\r\n`), SP, SA, () => {})
    }
    const retry = setInterval(() => { if (!found) sendDiscovery() }, 2000)
    sock.bind(0, () => { try { sock.setBroadcast(true) } catch {}; sendDiscovery() })
  })
}

function upnpGetControlUrl(loc) {
  return new Promise((resolve, reject) => {
    const req = http.get(loc, { timeout: 8000 }, res => {
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => {
        for (const st of ['WANIPConnection:1','WANPPPConnection:1','WANIPConnection:2','WANPPPConnection:2']) {
          const re = new RegExp(`<serviceType>[^<]*${st}</serviceType>[\\s\\S]*?<controlURL>([^<]*)</controlURL>`, 'i')
          const m = re.exec(d)
          if (m) {
            const p = new URL(loc)
            resolve({ controlUrl: m[1].startsWith('http') ? m[1] : `${p.protocol}//${p.host}${m[1]}`, serviceType: `urn:schemas-upnp-org:service:${st}` }); return
          }
        }
        reject(new Error('No WANIPConnection in IGD'))
      })
    })
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('IGD timeout')) })
  })
}

function upnpSOAP(ctrl, st, action, params) {
  return new Promise((resolve, reject) => {
    const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${st}">${Object.entries(params).map(([k,v])=>`<${k}>${v}</${k}>`).join('')}</u:${action}></s:Body></s:Envelope>`
    const p = new URL(ctrl)
    const req = http.request({ hostname:p.hostname, port:p.port||80, path:p.pathname, method:'POST', timeout:8000, headers:{'Content-Type':'text/xml','Content-Length':Buffer.byteLength(body),'SOAPAction':`"${st}#${action}"`} }, res => {
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => { res.statusCode < 300 ? resolve(d) : reject(new Error(`SOAP ${res.statusCode}`)) })
    })
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('SOAP timeout')) })
    req.write(body); req.end()
  })
}

async function upnpMapPort(port) {
  try {
    emit('ftps:upnp-status', { status: 'discovering' })
    const loc = await upnpDiscover()
    if (!loc) {
      emit('ftps:upnp-status', { status: 'failed', error: 'No UPnP router found. Enable UPnP in router admin (192.168.1.1 → UPnP settings). STUN will be used for IP discovery instead.' })
      return { ok:false }
    }
    emit('ftps:upnp-status', { status: 'connecting' })
    const { controlUrl, serviceType } = await upnpGetControlUrl(loc)
    const localIp = getLocalIPs()[0]?.address || '192.168.1.1'
    await upnpSOAP(controlUrl, serviceType, 'AddPortMapping', {
      NewRemoteHost:'', NewExternalPort:port, NewProtocol:'TCP',
      NewInternalPort:port, NewInternalClient:localIp,
      NewEnabled:1, NewPortMappingDescription:'P2N-Peer-Networking', NewLeaseDuration:86400,
    })
    const xml = await upnpSOAP(controlUrl, serviceType, 'GetExternalIPAddress', {}).catch(()=>'')
    const externalIp = /<NewExternalIPAddress>([^<]+)</.exec(xml)?.[1]?.trim() || null
    upnpMapping = { port, controlUrl, serviceType, externalIp }
    emit('ftps:upnp-status', { status: 'mapped', port, externalIp })
    secEntry('OK', `UPnP mapped port ${port}`, externalIp||'')
    return { ok:true, externalIp, port }
  } catch(e) {
    const msg = e.message.includes('SOAP') ? `Router rejected mapping: ${e.message}`
      : e.message.includes('timeout') ? 'Router found but not responding — try restarting router'
      : `UPnP error: ${e.message}`
    emit('ftps:upnp-status', { status: 'failed', error: msg })
    secEntry('WARN', 'UPnP failed', msg)
    return { ok:false, error: msg }
  }
}

async function upnpRemoveMapping() {
  if (!upnpMapping) return
  const { port, controlUrl, serviceType } = upnpMapping; upnpMapping = null
  await upnpSOAP(controlUrl, serviceType, 'DeletePortMapping', { NewRemoteHost:'', NewExternalPort:port, NewProtocol:'TCP' }).catch(()=>{})
}

// ── PAIRING CODE ──────────────────────────────────────────────────────────────
function encodePairingCode(ip, port, nodeId, name) {
  return Buffer.from(JSON.stringify({ ip, port, id:nodeId, n:name, t:Date.now() }))
    .toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
}
function decodePairingCode(code) {
  try { return JSON.parse(Buffer.from(code.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(code.length/4)*4,'='), 'base64').toString()) }
  catch { return null }
}

// ── ARCHIVE SANDBOX ───────────────────────────────────────────────────────────
const sandboxes = new Map()

function buildFileTree(dir, base) {
  const out = {}
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes:true })) {
      const fp = path.join(dir, e.name)
      if (e.isDirectory()) out[e.name] = { type:'dir', children:buildFileTree(fp, base) }
      else if (e.isFile()) { const s = fs.statSync(fp); out[e.name] = { type:'file', size:s.size, relPath:path.relative(base,fp) } }
    }
  } catch {}
  return out
}
function extractArchive(src, dest) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase(); let cmd, args
    if (process.platform === 'win32') {
      if (/\.(zip|tar|tgz|tar\.gz|tar\.bz2)$/.test(e)) { cmd='tar'; args=['-xf',src,'-C',dest] }
      else if (/\.(7z|rar)$/.test(e)) { cmd='7z'; args=['x',src,`-o${dest}`,'-y'] }
      else return reject(new Error('Unsupported format'))
    } else {
      if (e.endsWith('.zip')) { cmd='unzip'; args=['-o',src,'-d',dest] }
      else if (/\.(tar\.gz|tgz)$/.test(e)) { cmd='tar'; args=['-xzf',src,'-C',dest] }
      else if (/\.(tar\.bz2|tbz2)$/.test(e)) { cmd='tar'; args=['-xjf',src,'-C',dest] }
      else if (e.endsWith('.tar')) { cmd='tar'; args=['-xf',src,'-C',dest] }
      else if (/\.(7z|rar)$/.test(e)) { cmd='7z'; args=['x',src,`-o${dest}`,'-y'] }
      else return reject(new Error('Unsupported format'))
    }
    execFile(cmd, args, { timeout:60000 }, err => err ? reject(err) : resolve())
  })
}
function cleanupAllSandboxes() {
  for (const [, dir] of sandboxes) try { fs.rmSync(path.dirname(dir),{recursive:true,force:true}) } catch {}
  sandboxes.clear()
}
app.on('before-quit', cleanupAllSandboxes)

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
    this.socket.on('error', e => { secEntry('WARN','Socket error',e.message); this._onDisconnect() })
    this.socket.on('close', () => this._onDisconnect())
    this.socket.setKeepAlive(true, 5000); this.socket.setNoDelay(true)
    // HELLO includes persistent identityKey for TOFU + ephemeral ECDH pubkey for encryption
    const hello = Buffer.from(JSON.stringify({
      type:'HELLO',
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
      if (len > 64*1024*1024) { secEntry('ERR','Frame too large'); this._close(); return }
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
      const secret   = this._ecdh.computeSecret(Buffer.from(h.pubkey, 'base64'))
      this.sharedKey = crypto.createHash('sha256').update(secret).digest()
      this.id        = h.nodeId || ('p_' + Date.now().toString(36))
      this.name      = h.name  || ''
      this._peerIdentityKey = h.identityKey || h.pubkey  // fallback to pubkey for v<4 clients
      this.ready     = true

      // Session fingerprint from ECDH keys (for voice verification)
      const keys = [this._myPubkey, h.pubkey].sort()
      const fpHash = crypto.createHash('sha256').update(keys.join(':')).digest()
      this._fingerprint = Array.from(fpHash.slice(0,8)).map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(':')

      // FIX: Handle legacy v<4 clients that don't send persistent identityKey
      const isLegacyClient = !h.identityKey || (h.v || 1) < 4
      const tofu = isLegacyClient ? { status: 'trusted' } : tofuCheck(this.id, this._peerIdentityKey, h.name)
      peers.set(this.id, this)

      const rc = pendingReconnects.get(this.id)
      if (rc) { clearTimeout(rc.timer); pendingReconnects.delete(this.id) }
      this._reconnecting = false; this._reconnectAttempt = 0

      secEntry('OK', `Peer connected: ${this.name||this.id}`, `${this.socket.remoteAddress||''} · FP: ${this._fingerprint}`)
      emit('ftps:peer-connected', {
        peerId:      this.id,
        peerName:    this.name,
        fingerprint: this._fingerprint,
        identityKey: this._peerIdentityKey,
        tofu:        tofu.status,
        tofuDetail:  tofu.status === 'changed' ? { previousName:tofu.previousName, firstSeen:tofu.firstSeen } : null,
      })
      if (this._sendQueue.length > 0) {
        for (const obj of this._sendQueue) this.send(obj)
        this._sendQueue = []
      }
    } catch(e) { secEntry('ERR','Handshake failed',e.message); this._close() }
  }
  _onFrame(frame) {
    try {
      if (frame.length < 28) throw new Error('Frame too short')
      const iv=frame.slice(0,12), tag=frame.slice(-16), ct=frame.slice(12,-16)
      const d=crypto.createDecipheriv('aes-256-gcm',this.sharedKey,iv); d.setAuthTag(tag)
      const msg=JSON.parse(Buffer.concat([d.update(ct),d.final()]).toString())
      this._dispatch(msg)
    } catch(e) { secEntry('WARN','Decrypt/auth failed',e.message) }
  }
  send(obj) {
    if (!this.ready||!this.sharedKey) { if(this._reconnecting){this._sendQueue.push(obj);return}; return }
    try {
      const plain=Buffer.from(JSON.stringify(obj)), iv=crypto.randomBytes(12)
      const enc=crypto.createCipheriv('aes-256-gcm',this.sharedKey,iv)
      const ct=Buffer.concat([enc.update(plain),enc.final()])
      const frame=Buffer.concat([iv,ct,enc.getAuthTag()])
      const hdr=Buffer.alloc(4); hdr.writeUInt32BE(frame.length,0)
      const data = Buffer.concat([hdr,frame])
      this.socket.write(data)
      totalBytesSent += data.length
    } catch(e) { secEntry('ERR','Send failed',e.message) }
  }
  _dispatch(msg) {
    switch(msg.type) {
      case 'chat': emit('ftps:message',{peerId:this.id,msg}); break
      case 'file_start': this._filebufs.set(msg.fid,{meta:msg,chunks:new Map()}); emit('ftps:file-start',{peerId:this.id,meta:msg}); break
      case 'file_chunk': { const fb=this._filebufs.get(msg.fid); if(fb){fb.chunks.set(msg.i,Buffer.from(msg.d,'base64'));emit('ftps:file-progress',{peerId:this.id,fid:msg.fid,pct:fb.chunks.size/fb.meta.total})} break }
      case 'file_end': { const fb=this._filebufs.get(msg.fid); if(fb){const data=Buffer.concat([...fb.chunks.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]));emit('ftps:file-done',{peerId:this.id,meta:fb.meta,dataB64:data.toString('base64')});this._filebufs.delete(msg.fid);secEntry('OK',`File received: ${fb.meta.name}`,`${fb.meta.size}B`)} break }
      default: emit('ftps:message',{peerId:this.id,msg}); break
    }
  }
  async sendFile(fid,name,size,mime,dataB64) {
    const total=Math.ceil(size/CHUNK); this.send({type:'file_start',fid,name,size,total,mime})
    secEntry('OK',`Sending: ${name}`,`${size}B`)
    const raw=Buffer.from(dataB64,'base64')
    for(let i=0;i<total;i++){
      this.send({type:'file_chunk',fid,i,d:raw.slice(i*CHUNK,(i+1)*CHUNK).toString('base64')})
      if(i%16===0) await new Promise(r=>setImmediate(r))
      emit('ftps:send-progress',{peerId:this.id,fid,pct:(i+1)/total})
    }
    this.send({type:'file_end',fid})
  }
  _onDisconnect() {
    if (this._closed) return
    const id=this.id, name=this.name, wasReady=this.ready
    this.ready=false; try{this.socket.destroy()}catch{}
    if (wasReady&&this._initiator&&!this._closed&&this._reconnectAttempt<RECONNECT_MAX) {
      this._reconnecting=true; this._reconnectAttempt++
      const delay=RECONNECT_DELAYS[Math.min(this._reconnectAttempt-1,RECONNECT_DELAYS.length-1)]
      secEntry('INFO',`Reconnecting to ${name||id} (${this._reconnectAttempt}/${RECONNECT_MAX})`,`in ${delay}ms`)
      emit('ftps:peer-reconnecting',{peerId:id,attempt:this._reconnectAttempt,maxAttempts:RECONNECT_MAX})
      const timer=setTimeout(()=>{
        pendingReconnects.delete(id); if(this._closed)return
        const sock=net.createConnection({host:this._initiator.host,port:this._initiator.port},()=>{
          const nc=new PeerConn(sock,this._initiator); nc._sendQueue=this._sendQueue; nc._reconnectAttempt=this._reconnectAttempt
          if(id)peers.delete(id)
        })
        sock.on('error',()=>this._onDisconnect())
        sock.setTimeout(8000,()=>{sock.destroy();this._onDisconnect()})
      },delay)
      pendingReconnects.set(id,{...this._initiator,attempt:this._reconnectAttempt,timer,maxAttempts:RECONNECT_MAX})
      return
    }
    this._close()
  }
  _close() {
    if(this._closed)return; this._closed=true; this._reconnecting=false
    const id=this.id; this.id=null
    if(id){peers.delete(id);const rc=pendingReconnects.get(id);if(rc){clearTimeout(rc.timer);pendingReconnects.delete(id)};secEntry('INFO',`Peer disconnected: ${this.name||id}`);emit('ftps:peer-disconnected',{peerId:id})}
    try{this.socket.destroy()}catch{}
  }
  disconnect(){this._closed=true;this._close()}
}

// ── TCP SERVER / CLIENT ───────────────────────────────────────────────────────
function startServer(port) {
  return new Promise((resolve,reject)=>{
    if(tcpServer)stopServer()
    tcpServer=net.createServer(sock=>{secEntry('INFO',`Incoming from ${sock.remoteAddress}`);new PeerConn(sock)})
    tcpServer.on('error',err=>{emit('ftps:server-error',{message:err.message});secEntry('ERR','Server error',err.message);reject(err)})
    tcpServer.listen(port||0,'0.0.0.0',()=>{const p=tcpServer.address().port;secEntry('OK',`TCP server on port ${p}`);resolve({port:p,localIPs:getLocalIPs()})})
  })
}
function stopServer(){if(tcpServer){try{tcpServer.close()}catch{};tcpServer=null}}
function isLocalIP(host) {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|localhost)/i.test(host)
}

function connectToPeer(host, port) {
  return new Promise((resolve, reject) => {
    secEntry('INFO', `Connecting to ${host}:${port}`)
    const local = isLocalIP(host)
    const TIMEOUT = local ? 5000 : 12000  // local = shorter timeout, fail faster

    const sock = net.createConnection({ host, port: parseInt(port) }, () => {
      sock.setTimeout(0) // clear connect timeout on success
      new PeerConn(sock, { host, port: parseInt(port) })
      resolve()
    })
    sock.on('error', err => {
      secEntry('WARN', `Connect failed (${host}:${port})`, err.message)
      reject(err)
    })
    sock.setTimeout(TIMEOUT, () => {
      sock.destroy()
      reject(new Error(local
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
      const localIPs = getLocalIPs().map(i => i.address)
      // Find peers discovered via mDNS that match this port
      for (const [, peer] of discoveredPeers) {
        if (peer.port === parseInt(port) && peer.address !== host) {
          try {
            secEntry('INFO', `Trying fallback address: ${peer.address}:${port}`)
            await connectToPeer(peer.address, port)
            return { ok: true }
          } catch {}
        }
      }
    }
    return { ok: false, error: primaryErr.message }
  }
}
function disconnectPeer(id){const c=peers.get(id);if(c)c.disconnect()}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('ftps:set-identity', (_,{name,nodeId})=>{
  const suffix = myIdentityKey.slice(0, 6)
  myNodeId = nodeId + '-' + suffix
  myName=name; 
  activeSession={ name, nodeId: myNodeId, startedAt: new Date().toISOString() }
  secEntry('OK',`Identity: ${name} ${myNodeId}`)
  return {ok:true, nodeId: myNodeId, identityKey: myIdentityKey}
})
ipcMain.handle('ftps:clear-session', ()=>{ activeSession=null; return {ok:true} })
ipcMain.handle('ftps:get-session',   ()=> activeSession ? {...activeSession, active:true} : { active:false })
ipcMain.handle('ftps:get-local-ips', ()=> getLocalIPs())
ipcMain.handle('ftps:get-logs',      ()=> [...secLog])
ipcMain.handle('ftps:clear-logs',    ()=>{ secLog.length=0; return {ok:true} })
ipcMain.handle('ftps:get-peers',     ()=>{
  const result=[]
  peers.forEach(conn=>{if(conn.ready&&conn.id)result.push({peerId:conn.id,peerName:conn.name,fingerprint:conn._fingerprint,identityKey:conn._peerIdentityKey,tofu:'trusted',tofuDetail:null})})
  return result
})
ipcMain.handle('ftps:get-discovered-peers', ()=> Array.from(discoveredPeers.values()))

ipcMain.handle('ftps:listen', async(_,{port,useUpnp})=>{
  try{
    const r=await startServer(port||0)
    startDiscovery(r.port)  // always start mDNS discovery when listening
    if(useUpnp!==false) upnpMapPort(r.port).catch(()=>{})
    return {ok:true,...r}
  }catch(e){return{ok:false,error:e.message}}
})
ipcMain.handle('ftps:stop-listen', async()=>{
  stopServer(); stopDiscovery(); await upnpRemoveMapping().catch(()=>{}); return {ok:true}
})
ipcMain.handle('ftps:connect',          async(_,{host,port})=>{ return connectToPeerWithFallback(host, port) })
ipcMain.handle('ftps:send',             (_,{peerId,payload})=>{const c=peers.get(peerId);if(c&&c._reconnecting){c.send(payload);return{ok:true,queued:true}};if(!c?.ready)return{ok:false,error:'Not connected'};c.send(payload);return{ok:true}})
ipcMain.handle('ftps:send-file',        async(_,{peerId,fid,name,size,mime,dataB64})=>{const c=peers.get(peerId);if(!c?.ready)return{ok:false,error:'Not connected'};try{await c.sendFile(fid,name,size,mime,dataB64);return{ok:true}}catch(e){return{ok:false,error:e.message}}})
ipcMain.handle('ftps:disconnect',       (_,{peerId})=>{disconnectPeer(peerId);return{ok:true}})
ipcMain.handle('ftps:close-all',        ()=>{stopServer();stopDiscovery();peers.forEach((_,id)=>disconnectPeer(id));return{ok:true}})
ipcMain.handle('ftps:is-connected',     (_,{peerId})=>({connected:peers.has(peerId)&&peers.get(peerId).ready}))

// TOFU IPC
ipcMain.handle('ftps:tofu-accept', (_,{peerId,identityKey,name})=>{
  const c=peers.get(peerId)
  const key=identityKey||c?._peerIdentityKey
  if(!key){secEntry('WARN',`TOFU accept: no identityKey for ${peerId}`);return{ok:false,error:'No identity key available'}}
  tofuAcceptNewKey(peerId,key,name); secEntry('OK',`TOFU: accepted new identity for ${name||peerId}`)
  return{ok:true}
})
ipcMain.handle('ftps:tofu-get-known', ()=>{const r=[];tofuStore.forEach((v,k)=>r.push({id:k,...v}));return r})
ipcMain.handle('ftps:tofu-remove',    (_,{peerId})=>{tofuStore.delete(peerId);saveTOFU();secEntry('INFO',`TOFU: removed ${peerId}`);return{ok:true}})
ipcMain.handle('ftps:get-fingerprint',(_,{peerId})=>{const c=peers.get(peerId);return{fingerprint:c?._fingerprint||null}})

ipcMain.handle('ftps:save-file', async(_,{name,dataB64})=>{
  if(!mainWindow)return{ok:false}
  const{filePath,canceled}=await dialog.showSaveDialog(mainWindow,{defaultPath:name,filters:[{name:'All Files',extensions:['*']}]})
  if(canceled||!filePath)return{ok:false,canceled:true}
  fs.writeFileSync(filePath,Buffer.from(dataB64,'base64')); secEntry('OK',`Saved: ${path.basename(filePath)}`); return{ok:true,filePath}
})

ipcMain.handle('ftps:get-pairing-code', async(_,{port,useStun})=>{
  const s = useStun ? await stunDiscover(port) : null
  const extIp = s?.ip || (await fetchPublicIPHttp()) || 'Unavailable'
  const method = s?.ip ? 'stun' : (useStun ? 'http fallback' : 'ipify (stun disabled)')
  const code = encodePairingCode(extIp, port, myNodeId, myName) // Retain original encodePairingCode signature
  secEntry('OK',`Pairing code generated: ${code}`, `via ${method}`)
  emit('ftps:pairing-status',{status:'ready',ip:extIp,method})
  return{ok:true,code,ip:extIp,port,method}
})
ipcMain.handle('ftps:connect-pairing-code', async(_,{code})=>{
  const d=decodePairingCode(code)
  if(!d||!d.ip||!d.port)return{ok:false,error:'Invalid pairing code'}
  secEntry('INFO',`Connecting via code to ${d.ip}:${d.port}`)
  return connectToPeerWithFallback(d.ip, d.port)
})
ipcMain.handle('ftps:get-public-ip', async()=>{
  const s=await stunDiscover(0); if(s?.ip)return{ip:s.ip,method:'stun'}
  const h=await fetchPublicIPHttp(); return{ip:h||'Unavailable',method:'http'}
})

ipcMain.handle('ftps:get-sys-stats', async () => {
  const mem = process.memoryUsage()
  const cpus = os.cpus()
  // Basic CPU Load calculation (average load)
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
ipcMain.handle('ftps:extract-archive', async(_,{name,dataB64})=>{
  try{
    const sid=crypto.randomBytes(8).toString('hex'), sDir=path.join(os.tmpdir(),'p2n-sandbox-'+sid)
    fs.mkdirSync(sDir,{recursive:true})
    const archPath=path.join(sDir,'_archive_'+name)
    fs.writeFileSync(archPath,Buffer.from(dataB64,'base64'))
    const extDir=path.join(sDir,'extracted'); fs.mkdirSync(extDir,{recursive:true})
    await extractArchive(archPath,extDir); fs.unlinkSync(archPath)
    const tree=buildFileTree(extDir,extDir); sandboxes.set(sid,sDir)
    secEntry('OK',`Archive extracted: ${name}`,extDir)
    return{ok:true,sandboxId:sid,sandboxDir:extDir,tree,name}
  }catch(e){secEntry('ERR',`Extract failed: ${name}`,e.message);return{ok:false,error:e.message}}
})
ipcMain.handle('ftps:read-sandbox-file', async(_,{sandboxDir,relPath})=>{
  try{const fp=path.resolve(sandboxDir,relPath);if(!fp.startsWith(path.resolve(sandboxDir)))return{ok:false,error:'Path traversal'};const st=fs.statSync(fp);if(st.size>50*1024*1024)return{ok:false,error:'File >50MB'};return{ok:true,dataB64:fs.readFileSync(fp).toString('base64'),size:st.size}}catch(e){return{ok:false,error:e.message}}
})
ipcMain.handle('ftps:save-sandbox-file', async(_,{sandboxDir,relPath,name:fname})=>{
  if(!mainWindow)return{ok:false}
  try{const fp=path.resolve(sandboxDir,relPath);if(!fp.startsWith(path.resolve(sandboxDir)))return{ok:false,error:'Path traversal'};const{filePath,canceled}=await dialog.showSaveDialog(mainWindow,{defaultPath:fname||path.basename(relPath),filters:[{name:'All Files',extensions:['*']}]});if(canceled||!filePath)return{ok:false,canceled:true};fs.copyFileSync(fp,filePath);return{ok:true,filePath}}catch(e){return{ok:false,error:e.message}}
})
ipcMain.handle('ftps:cleanup-sandbox', async(_,{sandboxId})=>{const d=sandboxes.get(sandboxId);if(d){try{fs.rmSync(path.dirname(d),{recursive:true,force:true})}catch{};sandboxes.delete(sandboxId)};return{ok:true}})
ipcMain.handle('ftps:open-sandbox-folder', async(_,{sandboxDir})=>{secEntry('INFO','Sandbox in explorer',sandboxDir);await shell.openPath(sandboxDir);return{ok:true}})

// Shell + Window
ipcMain.handle('shell:open-external', async(_,{url})=>{if(!/^https?:\/\//.test(url))return{ok:false};await shell.openExternal(url);secEntry('INFO','External URL',url);return{ok:true}})
ipcMain.handle('window:control', (_,{action})=>{
  if(!mainWindow)return
  const wc=mainWindow.webContents
  switch(action){
    case 'minimize':   mainWindow.minimize(); break
    case 'maximize':   mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize(); break
    case 'fullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break
    case 'devtools':   wc.toggleDevTools(); break
    // FIX: reload refreshes renderer UI only — TCP peers survive, re-announced via did-finish-load
    case 'reload':     wc.reload(); break
    case 'zoomin':     wc.setZoomLevel(wc.getZoomLevel()+0.5); break
    case 'zoomout':    wc.setZoomLevel(wc.getZoomLevel()-0.5); break
    case 'zoomreset':  wc.setZoomLevel(0); break
    case 'close-confirmed': allowClose=true; mainWindow.close(); break
  }
  return{ok:true}
})
