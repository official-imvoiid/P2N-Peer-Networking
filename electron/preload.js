'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ftps', {
  setIdentity:          (name, nodeId) => ipcRenderer.invoke('ftps:set-identity', { name, nodeId }),
  clearSession:         ()             => ipcRenderer.invoke('ftps:clear-session'),
  getSession:           ()             => ipcRenderer.invoke('ftps:get-session'),
  getLocalIPs:          ()             => ipcRenderer.invoke('ftps:get-local-ips'),
  getLogs:              ()             => ipcRenderer.invoke('ftps:get-logs'),
  clearLogs:            ()             => ipcRenderer.invoke('ftps:clear-logs'),
  getPublicIP:          ()             => ipcRenderer.invoke('ftps:get-public-ip'),
  getPeers:             ()             => ipcRenderer.invoke('ftps:get-peers'),
  getDiscoveredPeers:   ()             => ipcRenderer.invoke('ftps:get-discovered-peers'),
  listen:               (port, upnp)   => ipcRenderer.invoke('ftps:listen', { port, useUpnp: upnp }),
  stopListen:           ()             => ipcRenderer.invoke('ftps:stop-listen'),
  connect:              (host, port)   => ipcRenderer.invoke('ftps:connect', { host, port }),
  send:                 (pid, payload) => ipcRenderer.invoke('ftps:send', { peerId: pid, payload }),
  sendFile:             (pid, fid, name, size, mime, b64) => ipcRenderer.invoke('ftps:send-file', { peerId:pid, fid, name, size, mime, dataB64:b64 }),
  disconnect:           (pid)          => ipcRenderer.invoke('ftps:disconnect', { peerId: pid }),
  closeAll:             ()             => ipcRenderer.invoke('ftps:close-all'),
  isConnected:          (pid)          => ipcRenderer.invoke('ftps:is-connected', { peerId: pid }),
  saveFile:             (name, b64)    => ipcRenderer.invoke('ftps:save-file', { name, dataB64: b64 }),
  getPairingCode:       (port, useStun) => ipcRenderer.invoke('ftps:get-pairing-code', { port, useStun }),
  getSysStats:          ()             => ipcRenderer.invoke('ftps:get-sys-stats'),
  getNetDetails:        ()             => ipcRenderer.invoke('ftps:get-net-details'),
  connectPairingCode:   (code)         => ipcRenderer.invoke('ftps:connect-pairing-code', { code }),
  extractArchive:       (name, b64)    => ipcRenderer.invoke('ftps:extract-archive', { name, dataB64: b64 }),
  readSandboxFile:      (dir, rel)     => ipcRenderer.invoke('ftps:read-sandbox-file', { sandboxDir:dir, relPath:rel }),
  saveSandboxFile:      (dir, rel, n)  => ipcRenderer.invoke('ftps:save-sandbox-file', { sandboxDir:dir, relPath:rel, name:n }),
  cleanupSandbox:       (sid)          => ipcRenderer.invoke('ftps:cleanup-sandbox', { sandboxId:sid }),
  openSandboxFolder:    (dir)          => ipcRenderer.invoke('ftps:open-sandbox-folder', { sandboxDir:dir }),
  openExternal:         (url)          => ipcRenderer.invoke('shell:open-external', { url }),
  windowControl:        (action)       => ipcRenderer.invoke('window:control', { action }),
  tofuAccept:           (pid, ikey, n) => ipcRenderer.invoke('ftps:tofu-accept', { peerId:pid, identityKey:ikey, name:n }),
  tofuGetKnown:         ()             => ipcRenderer.invoke('ftps:tofu-get-known'),
  tofuRemove:           (pid)          => ipcRenderer.invoke('ftps:tofu-remove', { peerId:pid }),
  getFingerprint:       (pid)          => ipcRenderer.invoke('ftps:get-fingerprint', { peerId:pid }),

  on: (channel, cb) => {
    const allowed = [
      'ftps:peer-connected','ftps:peer-disconnected','ftps:message',
      'ftps:file-start','ftps:file-progress','ftps:file-done','ftps:send-progress',
      'ftps:server-error','ftps:upnp-status','ftps:pairing-status','ftps:peer-reconnecting',
      'ftps:peers-discovered','p2n:log','app:request-close','app:session-active',
    ]
    if (!allowed.includes(channel)) return () => {}
    const h = (_, d) => cb(d)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  },
  off: (ch, fn) => ipcRenderer.removeListener(ch, fn),
})
