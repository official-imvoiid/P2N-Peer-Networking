/**
 * P2N — TCP Bridge (renderer-side)
 * Wraps window.ftps IPC into handler callbacks.
 * onOpen signature: (peerId, peerName, fingerprint, tofu, tofuDetail, identityKey)
 */
export class TCPBridge {
  constructor(handlers = {}) {
    this.h = handlers
    this._unsubs = [
      window.ftps.on('ftps:peer-connected', ({ peerId, peerName, fingerprint, identityKey, tofu, tofuDetail }) => {
        this.h.onOpen?.(peerId, peerName, fingerprint, tofu, tofuDetail, identityKey)
      }),
      window.ftps.on('ftps:peer-disconnected', ({ peerId }) => this.h.onClose?.(peerId)),
      window.ftps.on('ftps:peer-reconnecting', ({ peerId, attempt, maxAttempts }) => this.h.onReconnecting?.(peerId, attempt, maxAttempts)),
      window.ftps.on('ftps:message',      ({ peerId, msg }) => this.h.onMsg?.(peerId, msg)),
      window.ftps.on('ftps:file-start',   ({ peerId, meta }) => this.h.onFileStart?.(peerId, meta)),
      window.ftps.on('ftps:file-progress',({ peerId, fid, pct }) => this.h.onFileProg?.(peerId, fid, pct)),
      window.ftps.on('ftps:file-done',    ({ peerId, meta, dataB64 }) => {
        const bytes = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0))
        this.h.onFileDone?.(peerId, meta, new Blob([bytes], { type: meta.mime || 'application/octet-stream' }))
      }),
      window.ftps.on('ftps:send-progress',({ peerId, fid, pct }) => this.h.onSendProg?.(peerId, fid, pct)),
    ]
  }
  async sendMsg(peerId, payload) {
    const msg = typeof payload === 'string' ? { type:'chat', text:payload, t:Date.now() } : payload
    return (await window.ftps.send(peerId, msg)).ok
  }
  async sendFile(peerId, file, onProg) {
    const fid = crypto.randomUUID()
    const dataB64 = await fileToBase64(file)
    const unsub = window.ftps.on('ftps:send-progress', ({ peerId:pid, fid:f2, pct }) => {
      if (pid === peerId && f2 === fid) onProg?.(pct)
    })
    const res = await window.ftps.sendFile(peerId, fid, file.name, file.size, file.type||'application/octet-stream', dataB64)
    unsub?.()
    return res.ok ? fid : false
  }
  async sendFolder(peerId, files, onEvent) {
    // Send all files in the folder sequentially
    const total = files.length
    for (let i = 0; i < total; i++) {
      const file = files[i]
      try {
        await this.sendFile(peerId, file, (pct) => {
          onEvent?.({ type: 'progress', index: i, total, pct })
        })
        onEvent?.({ type: 'file_done', index: i, total })
      } catch (e) {
        onEvent?.({ type: 'error', index: i, total, error: e.message })
      }
    }
    onEvent?.({ type: 'done', total })
  }
  disconnect(peerId) { window.ftps.disconnect(peerId) }
  closeAll()         { window.ftps.closeAll() }
  destroy()          { this._unsubs.forEach(f => f?.()); this._unsubs = [] }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(r.result.split(',')[1])
    r.onerror = () => reject(new Error('FileReader failed'))
    r.readAsDataURL(file)
  })
}
