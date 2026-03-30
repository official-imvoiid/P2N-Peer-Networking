/**
 * P2N — TCP Bridge (renderer-side)
 * Wraps window.ftps IPC into handler callbacks.
 * onOpen signature: (peerId, peerName, fingerprint, tofu, tofuDetail, identityKey)
 */
export class TCPBridge {
  constructor(handlers = {}) {
    this.h = handlers
    // Cache for folder-file blobs/tmpPaths: fid → { blob, tmpPath }
    // main.js emits ftps:file-done (with data) then ftps:folder-file-done (metadata only)
    // for the same file. We stash the payload here so onFolderFileDone gets both.
    this._folderFileCache = new Map()

    this._unsubs = [
      window.ftps.on('ftps:peer-connected', ({ peerId, peerName, fingerprint, identityKey, tofu, tofuDetail }) => {
        this.h.onOpen?.(peerId, peerName, fingerprint, tofu, tofuDetail, identityKey)
      }),
      window.ftps.on('ftps:peer-disconnected', ({ peerId }) => this.h.onClose?.(peerId)),
      window.ftps.on('ftps:peer-reconnecting', ({ peerId, attempt, maxAttempts }) => this.h.onReconnecting?.(peerId, attempt, maxAttempts)),
      window.ftps.on('ftps:message',      ({ peerId, msg }) => this.h.onMsg?.(peerId, msg)),
      window.ftps.on('ftps:file-start',   ({ peerId, meta }) => this.h.onFileStart?.(peerId, meta)),
      window.ftps.on('ftps:file-progress',({ peerId, fid, pct }) => this.h.onFileProg?.(peerId, fid, pct)),
      window.ftps.on('ftps:file-done', ({ peerId, meta, dataB64, tmpPath }) => {
        // If this file belongs to a folder transfer, stash blob/tmpPath for
        // ftps:folder-file-done (which arrives right after) then return early —
        // App.jsx's onFileDone skips folder files anyway.
        if (meta.folderFid !== undefined) {
          if (tmpPath && !dataB64) {
            this._folderFileCache.set(meta.fid, { blob: null, tmpPath })
          } else if (dataB64) {
            const bytes = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0))
            const blob = new Blob([bytes], { type: meta.mime || 'application/octet-stream' })
            this._folderFileCache.set(meta.fid, { blob, tmpPath: null })
          }
          return
        }
        // BUG-06 fix: large standalone files (>32MB) arrive with tmpPath and no dataB64
        if (tmpPath && !dataB64) {
          this.h.onFileDone?.(peerId, meta, null, tmpPath)
          return
        }
        const bytes = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0))
        this.h.onFileDone?.(peerId, meta, new Blob([bytes], { type: meta.mime || 'application/octet-stream' }), null)
      }),
      window.ftps.on('ftps:send-progress',({ peerId, fid, pct }) => this.h.onSendProg?.(peerId, fid, pct)),

      // ── Folder protocol events ──────────────────────────────────────────────
      // main.js emits this when a folder_manifest message arrives from the sender
      window.ftps.on('ftps:folder-manifest', ({ peerId, manifest }) => {
        this.h.onFolderManifest?.(peerId, manifest)
      }),

      // main.js emits this immediately after ftps:file-done for every file that
      // belongs to a folder transfer. We retrieve the cached blob/tmpPath here.
      window.ftps.on('ftps:folder-file-done', ({ peerId, folderFid, fileIndex, meta }) => {
        const cached = this._folderFileCache.get(meta.fid) || { blob: null, tmpPath: null }
        this._folderFileCache.delete(meta.fid)
        this.h.onFolderFileDone?.(peerId, folderFid, fileIndex, meta, cached.blob, cached.tmpPath)
      }),

      // main.js emits this when the sender's folder_complete message is received
      window.ftps.on('ftps:folder-complete', ({ peerId, fid, name, fileCount }) => {
        this.h.onFolderComplete?.(peerId, fid, name, fileCount)
      }),

      // <!-- FIX: Issue 14 --> Handle canceled transfers
      window.ftps.on('ftps:file-aborted', ({ peerId, fid }) => {
        this._folderFileCache.delete(fid)
        this.h.onFileAborted?.(peerId, fid)
      }),
    ]
  }
  async sendMsg(peerId, payload) {
    const msg = typeof payload === 'string' ? { type:'chat', text:payload, t:Date.now() } : payload
    return (await window.ftps.send(peerId, msg)).ok
  }
  // FIX #2/#5: Use path-based streaming when file.path is available (Electron exposes this).
  // This means files of ANY size (10GB+) are sent without loading into RAM.
  // Falls back to FileReader base64 only if no path (e.g., generated Blob).
  async sendFile(peerId, file, onProg, fidOverride) {
    const fid = fidOverride || crypto.randomUUID()
    const filePath = file.path || null  // Electron File objects expose .path

    if (filePath) {
      // FAST PATH: stream directly from disk — no RAM overhead, no base64 encode/decode on sender side
      const unsub = window.ftps.on('ftps:send-progress', ({ peerId: pid, fid: f2, pct }) => {
        if (pid === peerId && f2 === fid) onProg?.(pct)
      })
      const res = await window.ftps.sendFileStream(
        peerId, fid, file.name, file.size,
        file.type || 'application/octet-stream', filePath
      )
      unsub?.()
      return res?.ok ? fid : false
    } else {
      // FALLBACK PATH: legacy FileReader base64 (Blobs, generated data, etc.)
      const dataB64 = await fileToBase64(file)
      const unsub = window.ftps.on('ftps:send-progress', ({ peerId: pid, fid: f2, pct }) => {
        if (pid === peerId && f2 === fid) onProg?.(pct)
      })
      const res = await window.ftps.sendFile(peerId, fid, file.name, file.size, file.type || 'application/octet-stream', dataB64)
      unsub?.()
      return res.ok ? fid : false
    }
  }
  // FIX #5: Folder send also uses streaming per file
  async sendFolderFile(peerId, file, fid, folderFid, relPath, fileIndex, onProg) {
    const filePath = file.path || null
    if (filePath) {
      const unsub = window.ftps.on('ftps:send-progress', ({ peerId: pid, fid: f2, pct }) => {
        if (pid === peerId && f2 === fid) onProg?.(pct)
      })
      const res = await window.ftps.sendFileInFolderStream(
        peerId, fid, file.name, file.size,
        file.type || 'application/octet-stream',
        filePath, folderFid, relPath, fileIndex
      )
      unsub?.()
      return res?.ok ? fid : false
    } else {
      const dataB64 = await fileToBase64(file)
      const unsub = window.ftps.on('ftps:send-progress', ({ peerId: pid, fid: f2, pct }) => {
        if (pid === peerId && f2 === fid) onProg?.(pct)
      })
      const res = await window.ftps.sendFileInFolder(
        peerId, fid, file.name, file.size, file.type || 'application/octet-stream',
        dataB64, folderFid, relPath, fileIndex
      )
      unsub?.()
      return res?.ok ? fid : false
    }
  }
  async sendFolder(peerId, files, onEvent) {
    // v4.1: Parallel file sending — send up to 3 files concurrently for faster throughput
    const CONCURRENCY = 3
    const total = files.length
    let completed = 0
    const queue = [...files.entries()]

    const worker = async () => {
      while (queue.length > 0) {
        const [i, file] = queue.shift()
        try {
          await this.sendFile(peerId, file, (pct) => {
            onEvent?.({ type: 'progress', index: i, total, pct })
          })
          completed++
          onEvent?.({ type: 'file_done', index: i, total })
        } catch (e) {
          completed++
          onEvent?.({ type: 'error', index: i, total, error: e.message })
        }
      }
    }

    // Launch workers — min of CONCURRENCY and total files
    await Promise.allSettled(
      Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker())
    )
    onEvent?.({ type: 'done', total })
  }
  disconnect(peerId) { window.ftps.disconnect(peerId) }
  closeAll()         { window.ftps.closeAll() }
  destroy()          { this._unsubs.forEach(f => f?.()); this._unsubs = []; this._folderFileCache.clear() }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(r.result.split(',')[1])
    r.onerror = () => reject(new Error('FileReader failed'))
    r.readAsDataURL(file)
  })
}
