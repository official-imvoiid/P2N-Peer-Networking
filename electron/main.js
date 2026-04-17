/**
 * P2N — Peer-Networking · Main Process (Entry Point)
 * Direct TCP · ECDH P-256 · AES-256-GCM
 * Persistent Identity Key (TOFU) · mDNS Local Discovery
 * Tor Hidden Service for cross-network connectivity
 *
 * This file orchestrates module initialization. All logic lives in electron/lib/.
 */
'use strict'

const { app, BrowserWindow } = require('electron')
const path = require('path')

// ── MODULE IMPORTS ───────────────────────────────────────────────────────────
const { S, emit } = require('./lib/state')
const { generateIdentityKeypair } = require('./lib/security')
const { shutdownDiscovery, stopDiscovery } = require('./lib/discovery')
const { stopTorDaemon } = require('./lib/tor')
const { connectViaTor } = require('./lib/tor')
const { setConnectViaTor } = require('./lib/peer-conn')
const { stopServer, disconnectPeer, startKeepalive, startGCSweep, setTorStarter } = require('./lib/network')
const { startTorHiddenService } = require('./lib/tor')
const { cleanupAllSandboxes } = require('./lib/archive')
const { registerIPC, loadPortSettings } = require('./lib/ipc')

// ── WIRE LATE-BOUND DEPENDENCIES ─────────────────────────────────────────────
// These break circular dependency chains between modules.
setConnectViaTor(connectViaTor)
setTorStarter(startTorHiddenService)

// ── WINDOW ───────────────────────────────────────────────────────────────────
function createWindow() {
  S.mainWindow = new BrowserWindow({
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

  S.mainWindow.on('close', e => {
    if (!S.allowClose) { e.preventDefault(); emit('app:request-close', {}) }
  })

  // After renderer reload, re-emit session + active peers + Tor state
  S.mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (S.activeSession) emit('app:session-active', S.activeSession)
      S.peers.forEach((conn) => {
        if (conn.ready && conn.id) {
          emit('ftps:peer-connected', {
            peerId: conn.id, peerName: conn.name,
            fingerprint: conn._fingerprint,
            identityKey: conn._peerIdentityPubB64,
            tofu: 'trusted', tofuDetail: null,
          })
        }
      })
      if (S.torProcess && S.onionAddress) {
        const port = S.tcpServer?.address()?.port || 7000
        emit('ftps:tor-status', { status: 'running', onionAddress: S.onionAddress, port })
      } else if (S.torProcess && !S.onionAddress) {
        emit('ftps:tor-status', { status: 'starting' })
      } else {
        emit('ftps:tor-status', { status: 'off' })
      }
    }, 300)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    S.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    S.mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  S.mainWindow.on('closed', () => { S.mainWindow = null })
}

// ── APP LIFECYCLE ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  generateIdentityKeypair()
  loadPortSettings()
  registerIPC()
  startKeepalive()
  startGCSweep()
  createWindow()
  app.on('activate', () => { if (!S.mainWindow) createWindow() })
})

app.on('window-all-closed', () => {
  // Wipe all sensitive in-memory state on close
  S.activeSession = null
  S.tofuStore.clear()
  S.blockedPeers.clear()
  S.blockedIPs.clear()
  S.connectionAttempts.clear()
  S.authorizedPeers.clear()
  for (const tid of S.reconnectTimers) clearTimeout(tid)
  S.reconnectTimers.clear()
  S.pendingReconnects.forEach(rc => { if (rc.timer) clearTimeout(rc.timer) })
  S.pendingReconnects.clear()
  if (S._networkPollTimer) { clearInterval(S._networkPollTimer); S._networkPollTimer = null }
  stopServer(); shutdownDiscovery(); stopTorDaemon()
  ;[...S.peers.keys()].forEach(id => disconnectPeer(id))
  S.peers.clear()
  cleanupAllSandboxes()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  for (const tid of S.reconnectTimers) clearTimeout(tid)
  S.reconnectTimers.clear()
  S.pendingReconnects.forEach(rc => { if (rc.timer) clearTimeout(rc.timer) })
  S.pendingReconnects.clear()
  cleanupAllSandboxes()
})
