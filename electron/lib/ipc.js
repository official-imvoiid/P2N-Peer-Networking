'use strict'
const { ipcMain, dialog, shell } = require('electron')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const dns = require('dns')
const { exec } = require('child_process')
const { S, emit, getPortSettingsFile } = require('./state')
const { secEntry, tofuAcceptNewKey } = require('./security')
const { startDiscovery, startPassiveDiscovery, stopDiscovery, shutdownDiscovery } = require('./discovery')
const { startTorHiddenService, stopTorDaemon, connectViaTor } = require('./tor')
const {
  getLocalIPs, startServer, stopServer,
  connectToPeerWithFallback, disconnectPeer, clearAuthForPeer,
  startNetworkPolling,
} = require('./network')
const { PeerConn } = require('./peer-conn')
const {
  buildFileTree, find7zBin, listArchive,
  extractSingleFile, extractArchive, cleanupAllSandboxes,
} = require('./archive')

// ── PORT SETTINGS ────────────────────────────────────────────────────────────
function loadPortSettings() {
  try {
    const f = getPortSettingsFile()
    if (fs.existsSync(f)) {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (d?.port && Number.isInteger(d.port) && d.port >= 1024 && d.port <= 65535) S.savedPort = d.port
    }
  } catch { }
}

function savePortSettings(port) {
  try { fs.writeFileSync(getPortSettingsFile(), JSON.stringify({ port, updatedAt: new Date().toISOString() })); S.savedPort = port } catch { }
}

// ── REGISTER ALL IPC HANDLERS ────────────────────────────────────────────────
function registerIPC() {

  // ── Session & Identity ───────────────────────────────────────────────────
  ipcMain.handle('ftps:set-identity', async (_, { name, nodeId }) => {
    const suffix = S.myIdentityPubB64.slice(0, 6)
    S.myNodeId = nodeId.endsWith('-' + suffix) ? nodeId : nodeId + '-' + suffix
    S.myName = name
    S.activeSession = { name, nodeId: S.myNodeId, startedAt: new Date().toISOString() }
    S.renameCountThisSession = 0
    secEntry('OK', `Identity: ${name} ${S.myNodeId}`)
    startPassiveDiscovery()
    startNetworkPolling()

    if (!S.tcpServer) {
      try {
        const r = await startServer(S.savedPort)
        startDiscovery(r.port)
        emit('ftps:listen-auto', { ok: true, port: r.port, localIPs: r.localIPs })
        secEntry('OK', `TCP server auto-started on port ${r.port}`)
        if (S.torEnabled) {
          if (S.torProcess && S.onionAddress) {
            secEntry('INFO', `Tor already running on port ${r.port}, re-emitting status`)
            emit('ftps:tor-status', { status: 'running', onionAddress: S.onionAddress, port: r.port })
          } else if (S.torProcess && !S.onionAddress) {
            emit('ftps:tor-status', { status: 'starting' })
          } else {
            startTorHiddenService(r.port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
          }
        }
      } catch (e) { secEntry('WARN', 'TCP server auto-start failed', e.message) }
    } else if (S.torEnabled && !S.torProcess) {
      const port = S.tcpServer.address()?.port
      if (port) startTorHiddenService(port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
    } else if (S.torProcess && S.onionAddress) {
      const port = S.tcpServer.address()?.port || S.savedPort
      emit('ftps:tor-status', { status: 'running', onionAddress: S.onionAddress, port })
    }

    return { ok: true, nodeId: S.myNodeId, identityKey: S.myIdentityPubB64 }
  })

  ipcMain.handle('ftps:update-name', (_, { name }) => {
    if (!name || typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Invalid name' }
    if (S.renameCountThisSession >= 3) {
      secEntry('WARN', `Rename blocked: limit of 3 renames per session reached`)
      return { ok: false, error: `Rename limit (3 per session) reached`, limitReached: true }
    }
    const oldName = S.myName
    S.myName = name.trim()
    if (S.activeSession) S.activeSession.name = S.myName
    S.renameCountThisSession++
    secEntry('OK', `${oldName} renamed to: ${S.myName}`, `[${S.renameCountThisSession}/3 renames used]`)
    S.peers.forEach(conn => {
      if (conn.ready) conn.send({ type: 'peer_rename', oldName, newName: S.myName })
    })
    return { ok: true, renameCount: S.renameCountThisSession, renameLimit: 3 }
  })

  ipcMain.handle('ftps:get-rename-info', () => ({ count: S.renameCountThisSession, limit: 3 }))
  ipcMain.handle('ftps:clear-session', () => { S.activeSession = null; S.tofuStore.clear(); S.blockedPeers.clear(); return { ok: true } })

  ipcMain.handle('ftps:full-wipe', () => {
    S.activeSession = null
    S.tofuStore.clear(); S.blockedPeers.clear(); S.blockedIPs.clear()
    S.connectionAttempts.clear(); S.authorizedPeers.clear()
      ;[...S.peers.keys()].forEach(id => { try { S.peers.get(id)?.disconnect() } catch { } })
    S.peers.clear()
    for (const tid of S.reconnectTimers) clearTimeout(tid)
    S.reconnectTimers.clear()
    S.pendingReconnects.forEach(rc => { if (rc.timer) clearTimeout(rc.timer) })
    S.pendingReconnects.clear()
    S.totalBytesSent = 0; S.totalBytesReceived = 0
    secEntry('OK', 'Full session wipe complete')
    return { ok: true }
  })

  ipcMain.handle('ftps:get-session', () => S.activeSession ? { ...S.activeSession, active: true } : { active: false })
  ipcMain.handle('ftps:get-local-ips', () => getLocalIPs())
  ipcMain.handle('ftps:get-logs', () => [...S.secLog])
  ipcMain.handle('ftps:clear-logs', () => { S.secLog.length = 0; return { ok: true } })

  ipcMain.handle('ftps:get-peers', () => {
    const result = []
    S.peers.forEach(conn => {
      if (conn.ready && conn.id) result.push({
        peerId: conn.id, peerName: conn.name, fingerprint: conn._fingerprint,
        identityKey: conn._peerIdentityPubB64, tofu: 'trusted', tofuDetail: null
      })
    })
    return result
  })

  ipcMain.handle('ftps:get-discovered-peers', () => Array.from(S.discoveredPeers.values()))

  // ── Server & Connection ──────────────────────────────────────────────────
  ipcMain.handle('ftps:listen', async (_, { port }) => {
    try {
      const r = await startServer(port || 0)
      startDiscovery(r.port)
      if (S.torEnabled && !S.torProcess) {
        startTorHiddenService(r.port).catch(e => secEntry('WARN', 'Tor auto-start failed', e.message || ''))
      }
      return { ok: true, ...r }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:stop-listen', async () => {
    stopServer(); stopDiscovery(); return { ok: true }
  })

  // Always clear auth before connecting so a fresh request is sent
  ipcMain.handle('ftps:connect', async (_, { host, port }) => {
    clearAuthForPeer(host, parseInt(port))
    return connectToPeerWithFallback(host, port)
  })

  ipcMain.handle('ftps:disconnect', (_, { peerId }) => { disconnectPeer(peerId); return { ok: true } })
  ipcMain.handle('ftps:is-connected', (_, { peerId }) => ({ connected: S.peers.has(peerId) && S.peers.get(peerId).ready }))
  ipcMain.handle('ftps:close-all', () => { stopServer(); shutdownDiscovery(); S.peers.forEach((_, id) => disconnectPeer(id)); return { ok: true } })

  // ── Peer Communication ───────────────────────────────────────────────────
  ipcMain.handle('ftps:send', (_, { peerId, payload }) => {
    const c = S.peers.get(peerId)
    if (c && c._reconnecting) { c.send(payload); return { ok: true, queued: true } }
    if (!c?.ready) return { ok: false, error: 'Not connected' }
    c.send(payload); return { ok: true }
  })

  // ── Request Handling ─────────────────────────────────────────────────────
  ipcMain.handle('ftps:accept-request', (_, { peerId }) => {
    const c = S.peers.get(peerId)
    if (!c) return { ok: false }
    c.isAuthorized = true
    S.authorizedPeers.add(peerId)
    S.authorizedPeers.add(c._peerIdentityPubB64)
    c.send({ type: 'auth_accept' })
    emit('ftps:peer-connected', { peerId: c.id, peerName: c.name, fingerprint: c._fingerprint, identityKey: c._peerIdentityPubB64, tofu: 'trusted', tofuDetail: null })
    return { ok: true }
  })

  ipcMain.handle('ftps:reject-request', (_, { peerId }) => {
    const c = S.peers.get(peerId)
    S.blockedPeers.set(peerId, { name: c?.name || '', blockedAt: new Date().toISOString(), reason: 'Rejected connection request', expiry: Date.now() + 10 * 60 * 1000 })
    if (c) { c.send({ type: 'auth_reject' }); setTimeout(() => c.disconnect(), 200) }
    secEntry('INFO', `Rejected request from ${peerId} (Blocked for 10m)`)
    return { ok: true }
  })

  ipcMain.handle('ftps:withdraw-request', (_, { peerId }) => {
    const c = S.peers.get(peerId)
    if (c) { c.send({ type: 'auth_withdraw' }); setTimeout(() => c.disconnect(), 200) }
    secEntry('INFO', `Withdrew request to ${peerId}`)
    return { ok: true }
  })

  // ── File Transfer ────────────────────────────────────────────────────────
  ipcMain.handle('ftps:send-file', async (_, { peerId, fid, name, size, mime, dataB64 }) => {
    const c = S.peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
    try { await c.sendFile(fid, name, size, mime, dataB64); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:send-file-stream', async (_, { peerId, fid, name, size, mime, filePath, extraMeta }) => {
    const c = S.peers.get(peerId)
    if (!c?.ready) return { ok: false, error: 'Not connected' }
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'File not found: ' + filePath }
    try {
      await c.sendFile(fid, name, size, mime, null, extraMeta || {}, filePath)
      return { ok: true }
    } catch (e) { secEntry('ERR', `Stream send failed: ${name}`, e.message); return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:cancel-send', (_, { peerId, fid }) => {
    const c = S.peers.get(peerId)
    if (c?.cancelSend(fid)) return { ok: true }
    return { ok: false, error: 'No active send found' }
  })

  // ── Folder Transfer ──────────────────────────────────────────────────────
  ipcMain.handle('ftps:send-folder-manifest', (_, { peerId, manifest }) => {
    const c = S.peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
    c.send({ type: 'folder_manifest', ...manifest }); return { ok: true }
  })

  ipcMain.handle('ftps:send-file-in-folder', async (_, { peerId, fid, name, size, mime, dataB64, filePath, folderFid, folderRelPath, fileIndex }) => {
    const c = S.peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
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
    const c = S.peers.get(peerId); if (!c?.ready) return { ok: false, error: 'Not connected' }
    c.send({ type: 'folder_complete', fid, name, fileCount }); return { ok: true }
  })

  // ── TOFU ─────────────────────────────────────────────────────────────────
  ipcMain.handle('ftps:tofu-accept', (_, { peerId, identityKey, name }) => {
    const c = S.peers.get(peerId)
    const key = identityKey || c?._peerIdentityPubB64
    if (!key) { secEntry('WARN', `TOFU accept: no identityKey for ${peerId}`); return { ok: false, error: 'No identity key available' } }
    tofuAcceptNewKey(peerId, key, name); secEntry('OK', `TOFU: accepted new identity for ${name || peerId}`)
    return { ok: true }
  })
  ipcMain.handle('ftps:tofu-get-known', () => { const r = []; S.tofuStore.forEach((v, k) => r.push({ id: k, ...v })); return r })
  ipcMain.handle('ftps:tofu-remove', (_, { peerId }) => { S.tofuStore.delete(peerId); secEntry('INFO', `TOFU: removed ${peerId}`); return { ok: true } })
  ipcMain.handle('ftps:get-fingerprint', (_, { peerId }) => { const c = S.peers.get(peerId); return { fingerprint: c?._fingerprint || null } })

  // ── Blocking ─────────────────────────────────────────────────────────────
  ipcMain.handle('ftps:block-ip', (_, { ip, reason }) => {
    if (!ip) return { ok: false }
    S.blockedIPs.add(ip)
    secEntry('OK', `Blocked IP: ${ip}`, reason || '')
    S.peers.forEach(c => { if (c.socket?.remoteAddress === ip) c.disconnect() })
    return { ok: true }
  })

  ipcMain.handle('ftps:block-peer', (_, { peerId, peerName, reason }) => {
    S.blockedPeers.set(peerId, { name: peerName || '', blockedAt: new Date().toISOString(), reason: reason || '' })
    const c = S.peers.get(peerId); if (c) c.disconnect()
    secEntry('OK', `Blocked peer: ${peerName || peerId}`)
    emit('ftps:peer-blocked', { peerId })
    return { ok: true }
  })

  ipcMain.handle('ftps:unblock-peer', (_, { peerId }) => {
    S.blockedPeers.delete(peerId)
    secEntry('OK', `Unblocked peer: ${peerId}`)
    emit('ftps:peer-unblocked', { peerId })
    return { ok: true }
  })

  ipcMain.handle('ftps:get-blocked', () => {
    const result = []; S.blockedPeers.forEach((v, k) => result.push({ id: k, ...v })); return result
  })

  // ── Tor ──────────────────────────────────────────────────────────────────
  ipcMain.handle('ftps:start-tor', async (_, { port }) => startTorHiddenService(port))
  ipcMain.handle('ftps:stop-tor', async () => { stopTorDaemon(); return { ok: true } })
  ipcMain.handle('ftps:get-tor-status', () => {
    const listenPort = S.tcpServer?.address()?.port || S.savedPort
    return { running: !!S.torProcess, onionAddress: S.onionAddress || null, port: listenPort, socksPort: S.torSocksPort, enabled: S.torEnabled }
  })
  ipcMain.handle('ftps:set-tor-enabled', async (_, { enabled }) => {
    S.torEnabled = !!enabled
    secEntry('OK', `Tor daemon ${S.torEnabled ? 'enabled' : 'disabled'}`)
    if (!S.torEnabled && S.torProcess) stopTorDaemon()
    if (S.torEnabled && !S.torProcess && S.tcpServer) {
      const port = S.tcpServer.address()?.port
      if (port) startTorHiddenService(port).catch(() => { })
    }
    return { ok: true, enabled: S.torEnabled }
  })
  ipcMain.handle('ftps:connect-onion', async (_, { address, port }) => {
    try {
      if (!S.torProcess) return { ok: false, error: 'Tor daemon is not running. Enable Tor in Settings first.' }
      if (!S.torSocksPort || S.torSocksPort === 0) return { ok: false, error: 'Tor is still starting up. Please wait a moment and try again.' }
      // Clear auth for onion connections too
      clearAuthForPeer(address, parseInt(port))
      const sock = await connectViaTor(address, port)
      new PeerConn(sock, { host: address, port: parseInt(port) })
      secEntry('OK', `Connected via Tor to ${address}:${port}`)
      return { ok: true }
    } catch (e) {
      secEntry('ERR', `Tor connect failed: ${address}:${port}`, e.message)
      return { ok: false, error: e.message }
    }
  })

  // ── My Card ──────────────────────────────────────────────────────────────
  ipcMain.handle('ftps:get-my-card', () => {
    const listenPort = S.tcpServer?.address()?.port || S.savedPort
    let fingerprint = null
    try {
      const raw = Buffer.from(S.myIdentityPubB64, 'base64')
      const hash = crypto.createHash('sha256').update(raw).digest('hex')
      fingerprint = hash.slice(0, 20).toUpperCase().match(/.{4}/g).join('-')
    } catch { }
    return {
      onion: S.onionAddress || null, port: listenPort, name: S.myName,
      nodeId: S.myNodeId, identityPubKey: S.myIdentityPubB64, fingerprint,
      connectStr: S.onionAddress ? `${S.onionAddress}:${listenPort}` : null,
    }
  })

  // ── Settings ─────────────────────────────────────────────────────────────
  ipcMain.handle('ftps:save-port', (_, { port }) => {
    const p = Math.max(1024, Math.min(65535, parseInt(port) || 7900))
    savePortSettings(p); secEntry('OK', `Port setting saved: ${p}`); return { ok: true, port: p }
  })
  ipcMain.handle('ftps:get-port', () => ({ port: S.savedPort }))
  ipcMain.handle('ftps:set-max-retries', (_, { value }) => {
    S.reconnectMax = Math.max(1, Math.min(200, parseInt(value) || 100))
    secEntry('OK', `Max reconnect retries set to ${S.reconnectMax}`)
    return { ok: true, value: S.reconnectMax }
  })
  ipcMain.handle('ftps:get-max-retries', () => ({ value: S.reconnectMax }))

  // ── System & Network Info ────────────────────────────────────────────────
  ipcMain.handle('ftps:get-sys-stats', async () => {
    const mem = process.memoryUsage()
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
      global._prevCpuIdle = totalIdle; global._prevCpuTick = totalTick
    } catch { }
    const load = os.loadavg()
    return {
      bytesSent: S.totalBytesSent, bytesReceived: S.totalBytesReceived,
      rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed,
      totalMem: os.totalmem(), freeMem: os.freemem(),
      uptime: process.uptime(), osUptime: os.uptime(),
      loadAvg: load[0], cpuPercent,
      platform: process.platform, arch: process.arch,
      nodeVer: process.version, osRelease: os.release()
    }
  })

  ipcMain.handle('ftps:get-net-details', async () => {
    return new Promise(resolve => {
      const dnsServers = dns.getServers()
      let gateway = 'Unknown'
      const cmd = process.platform === 'win32' ? 'route print 0.0.0.0' : "ip route | grep default | awk '{print $3}'"
      exec(cmd, (err, stdout) => {
        if (!err && stdout) {
          if (process.platform === 'win32') {
            const m = /0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/.exec(stdout)
            if (m) gateway = m[1]
          } else { gateway = stdout.trim() }
        }
        resolve({ dnsServers, gateway })
      })
    })
  })

  // ── File Operations ──────────────────────────────────────────────────────
  ipcMain.handle('ftps:save-file', async (_, { name, dataB64 }) => {
    if (!S.mainWindow) return { ok: false }
    const { filePath, canceled } = await dialog.showSaveDialog(S.mainWindow, { defaultPath: name, filters: [{ name: 'All Files', extensions: ['*'] }] })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.writeFileSync(filePath, Buffer.from(dataB64, 'base64')); secEntry('OK', `Saved: ${path.basename(filePath)}`); return { ok: true, filePath }
  })

  ipcMain.handle('ftps:save-file-from-temp', async (_, { tmpPath, name }) => {
    if (!S.mainWindow) return { ok: false }
    try {
      if (!fs.existsSync(tmpPath)) return { ok: false, error: 'Temp file not found — may have been cleaned up' }
      const { filePath, canceled } = await dialog.showSaveDialog(S.mainWindow, { defaultPath: name, filters: [{ name: 'All Files', extensions: ['*'] }] })
      if (canceled || !filePath) return { ok: false, canceled: true }
      fs.copyFileSync(tmpPath, filePath)
      try { fs.unlinkSync(tmpPath) } catch { }
      secEntry('OK', `Large file saved: ${path.basename(filePath)}`)
      return { ok: true, filePath }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:save-to-dir', async (_, { files, folderName }) => {
    if (!S.mainWindow) return { ok: false }
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog(S.mainWindow, {
        title: `Save folder "${folderName}" to...`, properties: ['openDirectory', 'createDirectory'],
      })
      if (canceled || !filePaths?.length) return { ok: false, canceled: true }
      const destBase = path.join(filePaths[0], folderName)
      fs.mkdirSync(destBase, { recursive: true })
      for (const f of files) {
        if (!f.relPath && !f.name) continue
        const dest = path.resolve(destBase, f.relPath || f.name)
        if (!dest.startsWith(path.resolve(destBase))) continue
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
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:read-file-for-preview', async (_, { filePath }) => {
    try {
      if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' }
      const st = fs.statSync(filePath)
      if (st.size > 50 * 1024 * 1024) return { ok: false, error: 'File too large to preview (>50MB)' }
      return { ok: true, dataB64: fs.readFileSync(filePath).toString('base64'), size: st.size }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // ── Archive & Sandbox ────────────────────────────────────────────────────
  ipcMain.handle('ftps:extract-archive', async (_, { name, dataB64 }) => {
    try {
      const sid = crypto.randomBytes(8).toString('hex'), sDir = path.join(os.tmpdir(), 'p2n-sandbox-' + sid)
      fs.mkdirSync(sDir, { recursive: true })
      const archPath = path.join(sDir, '_archive_' + name)
      fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))
      const extDir = path.join(sDir, 'extracted'); fs.mkdirSync(extDir, { recursive: true })
      await extractArchive(archPath, extDir); fs.unlinkSync(archPath)
      const tree = buildFileTree(extDir, extDir); S.sandboxes.set(sid, sDir)
      secEntry('OK', `Archive extracted: ${name}`, extDir)
      return { ok: true, sandboxId: sid, sandboxDir: extDir, tree, name }
    } catch (e) { secEntry('ERR', `Extract failed: ${name}`, e.message); return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:read-sandbox-file', async (_, { sandboxDir, relPath }) => {
    try {
      const fp = path.resolve(sandboxDir, relPath)
      if (!fp.startsWith(path.resolve(sandboxDir))) return { ok: false, error: 'Path traversal' }
      const st = fs.statSync(fp)
      if (st.size > 50 * 1024 * 1024) return { ok: false, error: 'File >50MB' }
      return { ok: true, dataB64: fs.readFileSync(fp).toString('base64'), size: st.size }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:save-sandbox-file', async (_, { sandboxDir, relPath, name: fname }) => {
    if (!S.mainWindow) return { ok: false }
    try {
      const fp = path.resolve(sandboxDir, relPath)
      if (!fp.startsWith(path.resolve(sandboxDir))) return { ok: false, error: 'Path traversal' }
      const { filePath, canceled } = await dialog.showSaveDialog(S.mainWindow, { defaultPath: fname || path.basename(relPath), filters: [{ name: 'All Files', extensions: ['*'] }] })
      if (canceled || !filePath) return { ok: false, canceled: true }
      fs.copyFileSync(fp, filePath)
      return { ok: true, filePath }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ftps:cleanup-sandbox', async (_, { sandboxId }) => {
    const d = S.sandboxes.get(sandboxId)
    if (d) { try { fs.rmSync(path.dirname(d), { recursive: true, force: true }) } catch { }; S.sandboxes.delete(sandboxId) }
    return { ok: true }
  })

  ipcMain.handle('ftps:open-sandbox-folder', async (_, { sandboxDir }) => {
    secEntry('INFO', 'Sandbox in explorer', sandboxDir)
    await shell.openPath(sandboxDir)
    return { ok: true }
  })

  ipcMain.handle('ftps:get-platform', () => process.platform)
  ipcMain.handle('ftps:find-7z', () => ({ ok: true, found: !!find7zBin() }))

  ipcMain.handle('ftps:list-archive', async (_, { name, dataB64, password }) => {
    const tmpDir = path.join(os.tmpdir(), 'p2n-archlist-' + crypto.randomBytes(6).toString('hex'))
    try {
      fs.mkdirSync(tmpDir, { recursive: true })
      const archPath = path.join(tmpDir, name)
      fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))
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

  ipcMain.handle('ftps:extract-archive-from-path', async (_, { name, archPath }) => {
    try {
      if (!fs.existsSync(archPath)) return { ok: false, error: 'File not found on disk' }
      if (/\.zip$/i.test(name)) {
        const fd = fs.openSync(archPath, 'r'), buf = Buffer.alloc(100)
        fs.readSync(fd, buf, 0, 100, 0); fs.closeSync(fd)
        const str = buf.toString('binary')
        if (str.includes('\x09\x08\x06\x00') || (buf[6] & 0x01)) return { passwordProtected: true }
      }
      const files = await listArchive(archPath)
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
      return { ok: true, tree }
    } catch (e) {
      if (e.message?.toLowerCase().includes('password') || e.message?.toLowerCase().includes('encrypted')) return { passwordProtected: true }
      return { error: e.message }
    }
  })

  ipcMain.handle('ftps:read-archive-entry', async (_, { name, dataB64, entryPath, password }) => {
    try {
      const sid = crypto.randomBytes(6).toString('hex')
      const tmpDir = path.join(os.tmpdir(), 'p2n-archentry-' + sid)
      fs.mkdirSync(tmpDir, { recursive: true })
      const archPath = path.join(tmpDir, name)
      fs.writeFileSync(archPath, Buffer.from(dataB64, 'base64'))
      const extractDir = path.join(tmpDir, 'entry')
      fs.mkdirSync(extractDir, { recursive: true })
      await extractSingleFile(archPath, entryPath, extractDir, password)
      let targetPath = null
      const findFile = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true })
        for (const item of items) {
          const full = path.join(dir, item.name)
          if (item.isDirectory()) { const found = findFile(full); if (found) return found }
          else if (item.name === path.basename(entryPath)) return full
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
    } catch (e) { return { ok: false, error: e.message } }
  })

  // ── OS Sandbox ───────────────────────────────────────────────────────────
  ipcMain.handle('ftps:launch-os-sandbox', async (_, { name, dataB64, tmpPath }) => {
    try {
      const plat = process.platform
      const sid = crypto.randomBytes(6).toString('hex')
      const stageDir = path.join(os.tmpdir(), 'p2n-ossandbox-' + sid)
      const archiveDir = path.join(stageDir, 'P2P-Archive')
      fs.mkdirSync(archiveDir, { recursive: true })
      const fileDest = path.join(archiveDir, name)
      if (tmpPath && fs.existsSync(tmpPath)) { fs.copyFileSync(tmpPath, fileDest) }
      else if (dataB64) { fs.writeFileSync(fileDest, Buffer.from(dataB64, 'base64')) }
      else { return { ok: false, error: 'No file data provided' } }

      if (plat === 'win32') {
        const wsb = `<Configuration><MappedFolders><MappedFolder><HostFolder>${stageDir}</HostFolder><ReadOnly>true</ReadOnly></MappedFolder></MappedFolders><LogonCommand><Command>explorer C:\\Users\\WDAGUtilityAccount\\Desktop\\mapped\\P2P-Archive</Command></LogonCommand></Configuration>`
        const wsbPath = path.join(stageDir, 'sandbox.wsb')
        fs.writeFileSync(wsbPath, wsb)
        const proc = require('child_process').spawn('WindowsSandbox.exe', [wsbPath], { detached: true, stdio: 'ignore' })
        proc.unref()
        secEntry('OK', `Windows Sandbox launched for ${name} (P2P-Archive)`)
        return { ok: true, message: 'Windows Sandbox launched — file in P2P-Archive folder (read-only)' }
      } else if (plat === 'linux') {
        const { execFile: ef } = require('child_process')
        const tryCmd = (cmd, args) => new Promise(res => {
          ef('which', [cmd], (err, out) => {
            if (err || !out.trim()) { res(false); return }
            const proc = require('child_process').spawn(cmd, args, { detached: true, stdio: 'ignore' })
            proc.unref(); res(true)
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
    } catch (e) { return { ok: false, error: e.message } }
  })

  // ── Shell & Window ───────────────────────────────────────────────────────
  ipcMain.handle('shell:open-external', async (_, { url }) => {
    if (!/^https?:\/\//.test(url)) return { ok: false }
    await shell.openExternal(url); secEntry('INFO', 'External URL', url); return { ok: true }
  })

  ipcMain.handle('window:control', (_, { action }) => {
    if (!S.mainWindow) return
    const wc = S.mainWindow.webContents
    switch (action) {
      case 'minimize': S.mainWindow.minimize(); break
      case 'maximize': S.mainWindow.isMaximized() ? S.mainWindow.unmaximize() : S.mainWindow.maximize(); break
      case 'fullscreen': S.mainWindow.setFullScreen(!S.mainWindow.isFullScreen()); break
      case 'zoomin': wc.setZoomLevel(wc.getZoomLevel() + 0.5); break
      case 'zoomout': wc.setZoomLevel(wc.getZoomLevel() - 0.5); break
      case 'zoomreset': wc.setZoomLevel(0); break
      case 'close-confirmed': S.allowClose = true; S.mainWindow.close(); break
    }
    return { ok: true }
  })
}

module.exports = { registerIPC, loadPortSettings }
