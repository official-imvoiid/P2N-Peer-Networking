'use strict'
const net = require('net')
const os = require('os')
const { S, emit } = require('./state')
const { secEntry } = require('./security')
const { PeerConn } = require('./peer-conn')

// ── LOCAL NETWORK INFO ───────────────────────────────────────────────────────
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

function isLocalIP(host) {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|localhost)/i.test(host)
}

// ── TCP SERVER ───────────────────────────────────────────────────────────────
function startServer(port) {
  return new Promise((resolve, reject) => {
    if (S.tcpServer) stopServer()
    S.tcpServer = net.createServer(sock => {
      secEntry('INFO', `Incoming from ${sock.remoteAddress}`)
      new PeerConn(sock)
    })
    S.tcpServer.on('error', err => {
      emit('ftps:server-error', { message: err.message })
      secEntry('ERR', 'Server error', err.message)
      reject(err)
    })
    S.tcpServer.listen(port || 0, '0.0.0.0', () => {
      const p = S.tcpServer.address().port
      secEntry('OK', `TCP server on port ${p}`)
      resolve({ port: p, localIPs: getLocalIPs() })
    })
  })
}

function stopServer() {
  if (S.tcpServer) { try { S.tcpServer.close() } catch { }; S.tcpServer = null }
}

// ── TCP CLIENT ───────────────────────────────────────────────────────────────
function connectToPeer(host, port) {
  return new Promise((resolve, reject) => {
    secEntry('INFO', `Connecting to ${host}:${port}`)
    const local = isLocalIP(host)
    const TIMEOUT = local ? 5000 : 12000
    let settled = false
    const rejectOnce = err => { if (!settled) { settled = true; reject(err) } }
    const resolveOnce = () => { if (!settled) { settled = true; resolve() } }

    const sock = net.createConnection({ host, port: parseInt(port) }, () => {
      sock.setTimeout(0)
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

async function connectToPeerWithFallback(host, port) {
  try {
    await connectToPeer(host, port)
    return { ok: true }
  } catch (primaryErr) {
    if (isLocalIP(host)) {
      for (const [, peer] of S.discoveredPeers) {
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

function disconnectPeer(id) {
  const c = S.peers.get(id); if (c) c.disconnect()
}

// Clear authorization for a peer so reconnecting always sends a fresh request
function clearAuthForPeer(host, port) {
  // Remove any peer that matches this host:port from authorizedPeers
  // We check both by nodeId and identity key
  for (const [id, conn] of S.peers) {
    const connHost = conn._initiator?.host || conn._remoteAddress
    const connPort = conn._initiator?.port || conn._remotePort
    if (connHost === host && connPort === parseInt(port)) {
      S.authorizedPeers.delete(id)
      if (conn._peerIdentityPubB64) S.authorizedPeers.delete(conn._peerIdentityPubB64)
    }
  }
}

// ── NETWORK POLLING ──────────────────────────────────────────────────────────
// Late-bound references — set by main.js to avoid circular deps
let _startTorHiddenService = null
function setTorStarter(fn) { _startTorHiddenService = fn }

function startNetworkPolling() {
  if (S._networkPollTimer) return
  S._networkPollTimer = setInterval(() => {
    const ips = getLocalIPs()
    const isOnline = ips.length > 0

    if (isOnline && S.wasOffline) {
      S.wasOffline = false
      secEntry('INFO', 'Network back online — attempting reconnects')
      emit('ftps:network-status', { online: true })
      S.pendingReconnects.forEach((info, peerId) => {
        if (info.timer) clearTimeout(info.timer)
        const sock = net.createConnection({ host: info.host, port: info.port }, () => {
          const nc = new PeerConn(sock, { host: info.host, port: info.port })
          S.peers.delete(peerId)
          S.peers.set(peerId, nc)
          S.pendingReconnects.delete(peerId)
        })
        sock.on('error', () => { S.pendingReconnects.delete(peerId) })
        sock.setTimeout(8000, () => { sock.destroy(); S.pendingReconnects.delete(peerId) })
      })
      if (S.torEnabled && !S.torProcess && S.tcpServer && _startTorHiddenService) {
        const listenPort = S.tcpServer.address()?.port
        if (listenPort) {
          secEntry('INFO', 'Restarting Tor after network recovery')
          _startTorHiddenService(listenPort).catch(e => secEntry('WARN', 'Tor restart after network recovery failed', e.message))
        }
      }
    } else if (!isOnline && !S.wasOffline) {
      S.wasOffline = true
      secEntry('WARN', 'Network appears offline')
      emit('ftps:network-status', { online: false })
    }
  }, 5000)
}

// ── KEEPALIVE PING ───────────────────────────────────────────────────────────
function startKeepalive() {
  if (S._keepaliveTimer) return
  S._keepaliveTimer = setInterval(() => {
    S.peers.forEach(conn => {
      if (conn.ready) { try { conn.send({ type: 'ping', t: Date.now() }) } catch { } }
    })
  }, 15000)
}

// ── GC SWEEP ─────────────────────────────────────────────────────────────────
function startGCSweep() {
  if (S._gcTimer) return
  S._gcTimer = setInterval(() => {
    S.peers.forEach(conn => {
      if (!conn.ready) return
      if (conn._activeSends) {
        for (const [fid, abort] of conn._activeSends) {
          if (abort.cancelled) conn._activeSends.delete(fid)
        }
      }
      for (const [fid, fb] of conn._filebufs) {
        const staleMs = Date.now() - (fb._lastChunkTime || fb._startTime || Date.now())
        if (staleMs > 120000) {
          secEntry('WARN', `GC: cleaning stale file receive: ${fb.meta?.name || fid} (${Math.round(staleMs / 1000)}s idle)`)
          if (fb.ws) try { fb.ws.destroy() } catch { }
          if (fb.tmpPath) try { require('fs').unlinkSync(fb.tmpPath) } catch { }
          conn._filebufs.delete(fid)
        }
      }
    })
  }, 60000)
}

module.exports = {
  getLocalIPs, isLocalIP,
  startServer, stopServer,
  connectToPeer, connectToPeerWithFallback, disconnectPeer,
  clearAuthForPeer,
  startNetworkPolling, startKeepalive, startGCSweep,
  setTorStarter,
}
