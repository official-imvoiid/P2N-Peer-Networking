'use strict'
const os = require('os')
const dgram = require('dgram')
const { S, emit, MDNS_ADDR, MDNS_PORT, MDNS_PORT_FALLBACK } = require('./state')
const { secEntry } = require('./security')

// ── MULTICAST JOIN ───────────────────────────────────────────────────────────
function _joinMulticastAll(sock) {
  // On Windows, addMembership() without an explicit interface address fails with
  // EINVAL when multiple adapters exist — skip the no-arg call on Windows and
  // go straight to per-interface joins, which work correctly on all platforms.
  if (process.platform !== 'win32') {
    try { sock.addMembership(MDNS_ADDR); S._joinedInterfaces.add('default') } catch (e) {
      secEntry('WARN', 'mDNS default membership failed', e.message)
    }
  }
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of (ifaces[name] || [])) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const key = name + ':' + iface.address
        if (S._joinedInterfaces.has(key)) continue
        try {
          sock.addMembership(MDNS_ADDR, iface.address)
          S._joinedInterfaces.add(key)
          secEntry('OK', `mDNS joined multicast on ${name} (${iface.address})`)
        } catch (e) {
          try {
            sock.setMulticastInterface(iface.address)
            S._joinedInterfaces.add(key)
            secEntry('OK', `mDNS setMulticastInterface fallback on ${name} (${iface.address})`)
          } catch {
            secEntry('WARN', `mDNS join failed on ${name} (${iface.address})`, e.message)
          }
        }
      }
    }
  }
}

// ── PERIODIC INTERFACE RE-SCAN ───────────────────────────────────────────────
function _startInterfaceReScan() {
  if (S._interfaceReScanTimer) return
  S._interfaceReScanTimer = setInterval(() => {
    if (!S.discoverySocket) return
    _joinMulticastAll(S.discoverySocket)
  }, 30000)
}

// ── BROADCAST FALLBACK ───────────────────────────────────────────────────────
function _sendBroadcastAnnounce() {
  if (!S.discoverySocket || !S._announcePort) return
  try {
    const msg = Buffer.from(JSON.stringify({
      type: 'P2N_ANNOUNCE', name: S.myName, nodeId: S.myNodeId, port: S._announcePort, v: 1,
    }))
    try { S.discoverySocket.setBroadcast(true) } catch { }
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
      for (const iface of (ifaces[name] || [])) {
        if (iface.family === 'IPv4' && !iface.internal && iface.netmask) {
          try {
            const ipParts = iface.address.split('.').map(Number)
            const maskParts = iface.netmask.split('.').map(Number)
            const broadcastParts = ipParts.map((ip, i) => (ip | (~maskParts[i] & 255)))
            S.discoverySocket.send(msg, MDNS_PORT, broadcastParts.join('.'), () => { })
          } catch { }
        }
      }
    }
  } catch { }
}

// ── MESSAGE HANDLER ──────────────────────────────────────────────────────────
function _onDiscoveryMsg(data, rinfo) {
  try {
    const msg = JSON.parse(data.toString())
    if (msg.type !== 'P2N_ANNOUNCE' || msg.nodeId === S.myNodeId) return
    if (!msg.port || msg.port === 0) return
    const key = rinfo.address + ':' + msg.nodeId
    S.discoveredPeers.set(key, {
      name: msg.name || 'Unknown', nodeId: msg.nodeId,
      port: msg.port, address: rinfo.address, lastSeen: Date.now(),
    })
    const now = Date.now()
    const staleKeys = []
    for (const [k, v] of S.discoveredPeers) {
      if (now - v.lastSeen > 30000) staleKeys.push(k)
    }
    staleKeys.forEach(k => S.discoveredPeers.delete(k))
    emit('ftps:peers-discovered', Array.from(S.discoveredPeers.values()))
  } catch { }
}

// ── SOCKET SETUP ─────────────────────────────────────────────────────────────
function _ensureDiscoverySocket() {
  if (S.discoverySocket) return Promise.resolve()
  return new Promise(resolve => {
    const tryBind = (port) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      S.discoverySocket = sock
      sock.on('error', e => {
        secEntry('WARN', `mDNS socket error on port ${port}`, e.message)
        S.discoverySocket = null
        S._joinedInterfaces.clear()
        if (!S._mdnsRecoveryTimer) {
          S._mdnsRecoveryTimer = setTimeout(() => {
            S._mdnsRecoveryTimer = null
            secEntry('INFO', 'mDNS attempting socket recovery...')
            _ensureDiscoverySocket().catch(() => {})
          }, 5000)
        }
        resolve()
      })
      sock.on('message', _onDiscoveryMsg)
      sock.bind(port, '0.0.0.0', () => {
        _joinMulticastAll(sock)
        try { sock.setMulticastTTL(4) } catch { }
        try { sock.setMulticastLoopback(true) } catch { }
        try { sock.setBroadcast(true) } catch { }
        _startInterfaceReScan()
        secEntry('OK', `mDNS discovery socket ready on port ${port} (passive)`)
        resolve()
      })
    }
    try { tryBind(MDNS_PORT) } catch {
      secEntry('WARN', `mDNS port ${MDNS_PORT} failed, trying fallback ${MDNS_PORT_FALLBACK}`)
      tryBind(MDNS_PORT_FALLBACK)
    }
  })
}

// ── PUBLIC API ───────────────────────────────────────────────────────────────

function startPassiveDiscovery() {
  _ensureDiscoverySocket().catch(() => { })
}

function startDiscovery(listenPort) {
  S._announcePort = listenPort
  _ensureDiscoverySocket().then(() => {
    if (!S.discoverySocket) return
    clearInterval(S.discoveryInterval)
    let announceCount = 0
    const announce = () => {
      if (!S.discoverySocket || !S._announcePort) return
      try {
        const msg = Buffer.from(JSON.stringify({
          type: 'P2N_ANNOUNCE', name: S.myName, nodeId: S.myNodeId, port: S._announcePort, v: 1,
        }))
        S.discoverySocket.send(msg, MDNS_PORT, MDNS_ADDR, () => { })
        S.discoverySocket.send(msg, MDNS_PORT_FALLBACK, MDNS_ADDR, () => { })
        announceCount++
        if (announceCount % 3 === 0) _sendBroadcastAnnounce()
      } catch { }
    }
    announce()
    S.discoveryInterval = setInterval(announce, 5000)
    secEntry('OK', `mDNS discovery active on port ${listenPort}`)
  }).catch(() => { })
}

function stopDiscovery() {
  clearInterval(S.discoveryInterval)
  S.discoveryInterval = null
  S._announcePort = null
  S.discoveredPeers.clear()
}

function shutdownDiscovery() {
  stopDiscovery()
  if (S._interfaceReScanTimer) { clearInterval(S._interfaceReScanTimer); S._interfaceReScanTimer = null }
  if (S._mdnsRecoveryTimer) { clearTimeout(S._mdnsRecoveryTimer); S._mdnsRecoveryTimer = null }
  S._joinedInterfaces.clear()
  if (S.discoverySocket) { try { S.discoverySocket.close() } catch { }; S.discoverySocket = null }
}

module.exports = {
  startPassiveDiscovery, startDiscovery, stopDiscovery, shutdownDiscovery,
}
