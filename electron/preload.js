'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ftps', {
  setIdentity: (name, nodeId) => ipcRenderer.invoke('ftps:set-identity', { name, nodeId }),
  clearSession: () => ipcRenderer.invoke('ftps:clear-session'),
  getSession: () => ipcRenderer.invoke('ftps:get-session'),
  getLocalIPs: () => ipcRenderer.invoke('ftps:get-local-ips'),
  getLogs: () => ipcRenderer.invoke('ftps:get-logs'),
  clearLogs: () => ipcRenderer.invoke('ftps:clear-logs'),
  getPeers: () => ipcRenderer.invoke('ftps:get-peers'),
  getDiscoveredPeers: () => ipcRenderer.invoke('ftps:get-discovered-peers'),
  listen: (port) => ipcRenderer.invoke('ftps:listen', { port }),
  stopListen: () => ipcRenderer.invoke('ftps:stop-listen'),
  connect: (host, port) => ipcRenderer.invoke('ftps:connect', { host, port }),
  send: (pid, payload) => ipcRenderer.invoke('ftps:send', { peerId: pid, payload }),
  sendFile: (pid, fid, name, size, mime, b64) => ipcRenderer.invoke('ftps:send-file', { peerId: pid, fid, name, size, mime, dataB64: b64 }),
  disconnect: (pid) => ipcRenderer.invoke('ftps:disconnect', { peerId: pid }),
  closeAll: () => ipcRenderer.invoke('ftps:close-all'),
  isConnected: (pid) => ipcRenderer.invoke('ftps:is-connected', { peerId: pid }),
  saveFile: (name, b64) => ipcRenderer.invoke('ftps:save-file', { name, dataB64: b64 }),
  startTor: (port) => ipcRenderer.invoke('ftps:start-tor', { port }),
  stopTor: () => ipcRenderer.invoke('ftps:stop-tor'),
  getTorStatus: () => ipcRenderer.invoke('ftps:get-tor-status'),
  connectOnion: (addr, port) => ipcRenderer.invoke('ftps:connect-onion', { address: addr, port }),
  getSysStats: () => ipcRenderer.invoke('ftps:get-sys-stats'),
  getNetDetails: () => ipcRenderer.invoke('ftps:get-net-details'),
  extractArchive: (name, b64) => ipcRenderer.invoke('ftps:extract-archive', { name, dataB64: b64 }),
  readSandboxFile: (dir, rel) => ipcRenderer.invoke('ftps:read-sandbox-file', { sandboxDir: dir, relPath: rel }),
  saveSandboxFile: (dir, rel, n) => ipcRenderer.invoke('ftps:save-sandbox-file', { sandboxDir: dir, relPath: rel, name: n }),
  cleanupSandbox: (sid) => ipcRenderer.invoke('ftps:cleanup-sandbox', { sandboxId: sid }),
  openSandboxFolder: (dir) => ipcRenderer.invoke('ftps:open-sandbox-folder', { sandboxDir: dir }),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', { url }),
  windowControl: (action) => ipcRenderer.invoke('window:control', { action }),
  tofuAccept: (pid, ikey, n) => ipcRenderer.invoke('ftps:tofu-accept', { peerId: pid, identityKey: ikey, name: n }),
  tofuGetKnown: () => ipcRenderer.invoke('ftps:tofu-get-known'),
  tofuRemove: (pid) => ipcRenderer.invoke('ftps:tofu-remove', { peerId: pid }),
  getFingerprint: (pid) => ipcRenderer.invoke('ftps:get-fingerprint', { peerId: pid }),
  setMaxRetries: (n) => ipcRenderer.invoke('ftps:set-max-retries', { value: n }),
  getMaxRetries: () => ipcRenderer.invoke('ftps:get-max-retries'),
  setTorEnabled: (v) => ipcRenderer.invoke('ftps:set-tor-enabled', { enabled: v }),

  // BUG-02 FIX: 6 missing IPC bridges
  getPlatform: () => ipcRenderer.invoke('ftps:get-platform'),
  listArchive: (name, b64) => ipcRenderer.invoke('ftps:list-archive', { name, dataB64: b64 }),
  readArchiveEntry: (name, b64, entryPath) => ipcRenderer.invoke('ftps:read-archive-entry', { name, dataB64: b64, entryPath }),
  saveFileFromTemp: (tmpPath, name) => ipcRenderer.invoke('ftps:save-file-from-temp', { tmpPath, name }),
  saveToDir: (files, folderName) => ipcRenderer.invoke('ftps:save-to-dir', { files, folderName }),
  launchOSSandbox: (opts) => ipcRenderer.invoke('ftps:launch-os-sandbox', opts),

  // CHANGE 3: Cancel file send mid-transfer
  cancelSend: (peerId, fid) => ipcRenderer.invoke('ftps:cancel-send', { peerId, fid }),
  // CHANGE 4: Folder transfer protocol
  sendFolderManifest: (peerId, manifest) => ipcRenderer.invoke('ftps:send-folder-manifest', { peerId, manifest }),
  sendFileInFolder: (peerId, fid, name, size, mime, b64, folderFid, relPath, idx) =>
    ipcRenderer.invoke('ftps:send-file-in-folder', { peerId, fid, name, size, mime, dataB64: b64, folderFid, folderRelPath: relPath, fileIndex: idx }),
  sendFolderComplete: (peerId, fid, name, fileCount) => ipcRenderer.invoke('ftps:send-folder-complete', { peerId, fid, name, fileCount }),
  // CHANGE 8: Port settings persistence
  savePort: (port) => ipcRenderer.invoke('ftps:save-port', { port }),
  getPort: () => ipcRenderer.invoke('ftps:get-port'),

  // B4/C1: Blocked peers
  blockPeer: (peerId, peerName, reason) => ipcRenderer.invoke('ftps:block-peer', { peerId, peerName, reason }),
  unblockPeer: (peerId) => ipcRenderer.invoke('ftps:unblock-peer', { peerId }),
  getBlocked: () => ipcRenderer.invoke('ftps:get-blocked'),

  on: (channel, cb) => {
    const allowed = [
      'ftps:peer-connected', 'ftps:peer-disconnected', 'ftps:message',
      'ftps:file-start', 'ftps:file-progress', 'ftps:file-done', 'ftps:send-progress',
      'ftps:server-error', 'ftps:peer-reconnecting',
      'ftps:peers-discovered', 'ftps:tor-status', 'p2n:log', 'app:request-close', 'app:session-active',
      'ftps:listen-auto',
      'ftps:file-aborted',
      'ftps:folder-manifest', 'ftps:folder-file-done', 'ftps:folder-complete',
      'ftps:peer-blocked',
    ]
    if (!allowed.includes(channel)) return () => { }
    const h = (_, d) => cb(d)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  },
  off: (ch, fn) => ipcRenderer.removeListener(ch, fn),
})
