'use strict'
const net = require('net')
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')
const {
  S, emit,
  CHUNK, STREAM_CHUNK, FRAME_HDR,
  MAX_CONCURRENT_SENDS, MAX_CONCURRENT_RECVS,
  RECONNECT_DELAYS,
} = require('./state')
const { secEntry, tofuCheck, isBlocked, isBlockedIP, isRateLimited } = require('./security')

// Late-bound Tor connector — set by main.js to avoid circular dependency
let _connectViaTor = null
function setConnectViaTor(fn) { _connectViaTor = fn }

// ── HKDF KEY DERIVATION ─────────────────────────────────────────────────────
function deriveKey(ecdhSecret, role) {
  return Buffer.from(crypto.hkdfSync(
    'sha256', ecdhSecret,
    Buffer.from('P2N-v5-salt'),
    Buffer.from('P2N-v5-AES256GCM-' + role),
    32
  ))
}

// ── PEER CONNECTION CLASS ────────────────────────────────────────────────────
class PeerConn {
  constructor(socket, initiatorInfo = null) {
    this.socket = socket
    this.id = null
    this.name = ''
    this._txKey = null
    this._rxKey = null
    this.ready = false
    this._buf = Buffer.alloc(0)
    this._ecdh = crypto.createECDH('prime256v1')
    this._ecdh.generateKeys()
    this._filebufs = new Map()
    this._sendQueue = []
    this._fingerprint = null
    this._peerIdentityPubB64 = null
    this._myPubkey = this._ecdh.getPublicKey('base64')
    this._initiator = initiatorInfo
    this.isAuthorized = false
    this._reconnecting = false
    this._reconnectAttempt = 0
    this._closed = false
    this._txSeq = 0n
    this._rxSeq = -1n
    this.isTor = !!(initiatorInfo?.host?.endsWith('.onion'))
    this._remoteAddress = socket.remoteAddress || null
    this._remotePort = socket.remotePort || null
    this._setup()
  }

  _setup() {
    this.socket.on('data', d => {
      S.totalBytesReceived += d.length
      this._buf = Buffer.concat([this._buf, d])
      this._drain()
    })
    this.socket.on('error', e => { secEntry('WARN', 'Socket error', e.message); this._onDisconnect() })
    this.socket.on('close', () => this._onDisconnect())
    this.socket.setKeepAlive(true, 2000)
    this.socket.setNoDelay(true)
    try { this.socket.setRecvBufferSize?.(4 * 1024 * 1024) } catch { }
    try { this.socket.setSendBufferSize?.(4 * 1024 * 1024) } catch { }

    const sigData = Buffer.from(this._myPubkey + '|' + S.myNodeId)
    const sig = crypto.sign(null, sigData, S.myIdentityPrivKey).toString('base64')

    const hello = Buffer.from(JSON.stringify({
      type: 'HELLO',
      pubkey: this._myPubkey,
      identityPubKey: S.myIdentityPubB64,
      sig,
      nodeId: S.myNodeId,
      name: S.myName,
      v: 5,
    }))
    const hdr = Buffer.alloc(4)
    hdr.writeUInt32BE(hello.length, 0)
    this.socket.write(Buffer.concat([hdr, hello]))
  }

  _drain() {
    while (true) {
      if (this._buf.length < FRAME_HDR) return
      const len = this._buf.readUInt32BE(0)
      if (!this.ready && len > 8192) {
        secEntry('ERR', 'Oversized HELLO — dropping connection')
        this._close(); return
      }
      if (this.ready && len > 64 * 1024 * 1024) {
        secEntry('ERR', 'Frame too large')
        this._close(); return
      }
      if (this._buf.length < FRAME_HDR + len) return
      const frame = this._buf.slice(FRAME_HDR, FRAME_HDR + len)
      this._buf = this._buf.slice(FRAME_HDR + len)
      if (!this.ready) this._onHello(frame)
      else this._onFrame(frame)
    }
  }

  _onHello(frame) {
    try {
      const h = JSON.parse(frame.toString())
      if (h.type !== 'HELLO') { this._close(); return }

      const peerId = h.nodeId || ('p_' + Date.now().toString(36))
      const remoteIP = this.socket.remoteAddress || ''

      if (isBlockedIP(remoteIP)) {
        secEntry('WARN', `Blocked IP ${remoteIP} attempted to connect — rejected`)
        this._close(); return
      }
      if (isBlocked(peerId)) {
        secEntry('WARN', `Blocked peer ${h.name || peerId} attempted to connect — rejected`)
        this._close(); return
      }
      if (isRateLimited(remoteIP)) {
        secEntry('WARN', `Rate limited connection from ${remoteIP}`)
        this._close(); return
      }

      // Ed25519 signature verification (v5+)
      const isV5 = h.v >= 5 && h.identityPubKey && h.sig
      if (isV5) {
        try {
          const peerPubKey = crypto.createPublicKey({
            key: Buffer.from(h.identityPubKey, 'base64'), format: 'der', type: 'spki',
          })
          const sigData = Buffer.from(h.pubkey + '|' + h.nodeId)
          const valid = crypto.verify(null, sigData, peerPubKey, Buffer.from(h.sig, 'base64'))
          if (!valid) {
            secEntry('ERR', `HELLO signature INVALID from ${h.name || peerId} — MITM suspected, dropping`)
            this._close(); return
          }
          secEntry('INFO', `HELLO signature verified: ${h.name || peerId}`)
        } catch (e) {
          secEntry('ERR', `HELLO sig verification error: ${e.message} — dropping`)
          this._close(); return
        }
      } else {
        secEntry('WARN', `Legacy v${h.v || 1} peer (no Ed25519 sig): ${h.name || peerId} — accepting with reduced trust`)
      }

      // ECDH key agreement
      const ecdhSecret = this._ecdh.computeSecret(Buffer.from(h.pubkey, 'base64'))
      const amInitiator = !!this._initiator
      this._txKey = deriveKey(ecdhSecret, amInitiator ? 'initiator' : 'responder')
      this._rxKey = deriveKey(ecdhSecret, amInitiator ? 'responder' : 'initiator')

      this.id = peerId
      this.name = h.name || ''
      this._peerIdentityPubB64 = h.identityPubKey || h.identityKey || h.pubkey

      this.ready = true

      // Session fingerprint (SAS)
      const keys = [this._myPubkey, h.pubkey].sort()
      const fpHash = crypto.createHash('sha256').update(keys.join(':')).digest()
      this._fingerprint = Array.from(fpHash.slice(0, 8))
        .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':')

      // TOFU check
      const isLegacy = !isV5
      const tofu = isLegacy ? { status: 'trusted' } : tofuCheck(this.id, this._peerIdentityPubB64, h.name)

      S.peers.set(this.id, this)
      const rc = S.pendingReconnects.get(this.id)
      if (rc) { clearTimeout(rc.timer); S.pendingReconnects.delete(this.id) }
      this._reconnecting = false
      this._reconnectAttempt = 0

      // Check authorization — but only if not force-requesting
      this.isAuthorized = S.authorizedPeers.has(this.id) || S.authorizedPeers.has(this._peerIdentityPubB64)

      secEntry('OK',
        `Peer connected (Auth: ${this.isAuthorized}): ${this.name || this.id}`,
        `${remoteIP} · FP: ${this._fingerprint} · ${isV5 ? 'Ed25519+' : 'legacy-no-sig'}`
      )

      const evtData = {
        peerId: this.id, peerName: this.name,
        fingerprint: this._fingerprint,
        identityKey: this._peerIdentityPubB64,
        tofu: tofu.status,
        tofuDetail: tofu.status === 'changed'
          ? { previousName: tofu.previousName, firstSeen: tofu.firstSeen } : null,
      }

      if (this.isAuthorized) {
        emit('ftps:peer-connected', evtData)
        if (this._sendQueue.length > 0) {
          for (const obj of this._sendQueue) this.send(obj)
          this._sendQueue = []
        }
      } else {
        evtData.role = this._initiator ? 'sender' : 'receiver'
        emit('ftps:peer-requested', evtData)
      }
    } catch (e) { secEntry('ERR', 'Handshake failed', e.message); this._close() }
  }

  _onFrame(frame) {
    try {
      if (frame.length < 28) throw new Error('Frame too short')
      const iv = frame.slice(0, 12)
      const tag = frame.slice(-16)
      const ct = frame.slice(12, -16)

      const d = crypto.createDecipheriv('aes-256-gcm', this._rxKey, iv)
      d.setAuthTag(tag)
      const plain = Buffer.concat([d.update(ct), d.final()])

      if (plain.length < 8) throw new Error('Missing seq')
      const seq = plain.readBigUInt64BE(0)
      if (seq <= this._rxSeq) {
        secEntry('WARN', `Replay detected from ${this.name || this.id}: seq ${seq} <= last ${this._rxSeq}`)
        return
      }
      this._rxSeq = seq

      const payload = plain.slice(8)
      if (payload[0] === 0x01) {
        const fidLen = payload[1]
        const fid = payload.slice(2, 2 + fidLen).toString('utf8')
        const i = payload.readUInt32BE(2 + fidLen)
        const chunk = payload.slice(2 + fidLen + 4)
        this._dispatch({ type: 'file_chunk_bin', fid, i, rawBuf: chunk })
        return
      }

      const msg = JSON.parse(payload.toString('utf8'))
      this._dispatch(msg)
    } catch (e) { secEntry('WARN', 'Decrypt/auth failed', e.message) }
  }

  send(obj) {
    if (this._closed || this.socket?.destroyed) return false
    if (!this.ready || !this._txKey) {
      if (this._reconnecting) { this._sendQueue.push(obj); return true }
      return false
    }
    try {
      const seq = ++this._txSeq
      const seqBuf = Buffer.allocUnsafe(8)
      seqBuf.writeBigUInt64BE(seq, 0)
      const plain = Buffer.concat([seqBuf, Buffer.from(JSON.stringify(obj))])
      const iv = crypto.randomBytes(12)
      const enc = crypto.createCipheriv('aes-256-gcm', this._txKey, iv)
      const ct = Buffer.concat([enc.update(plain), enc.final()])
      const frame = Buffer.concat([iv, ct, enc.getAuthTag()])
      const hdr = Buffer.allocUnsafe(4)
      hdr.writeUInt32BE(frame.length, 0)
      try { this.socket.cork() } catch { }
      this.socket.write(Buffer.concat([hdr, frame]))
      try { this.socket.uncork() } catch { }
      S.totalBytesSent += 4 + frame.length
      return true
    } catch (e) { secEntry('ERR', 'Send failed', e.message); return false }
  }

  sendBinaryChunk(fid, index, buffer) {
    if (this._closed || this.socket?.destroyed) return false
    if (!this.ready || !this._txKey) return false
    try {
      const seq = ++this._txSeq
      const seqBuf = Buffer.allocUnsafe(8)
      seqBuf.writeBigUInt64BE(seq, 0)
      const fidBuf = Buffer.from(fid, 'utf8')
      const header = Buffer.allocUnsafe(2 + fidBuf.length + 4)
      header[0] = 0x01; header[1] = fidBuf.length
      fidBuf.copy(header, 2)
      header.writeUInt32BE(index, 2 + fidBuf.length)
      const plain = Buffer.concat([seqBuf, header, buffer])
      const iv = crypto.randomBytes(12)
      const enc = crypto.createCipheriv('aes-256-gcm', this._txKey, iv)
      const ct = Buffer.concat([enc.update(plain), enc.final()])
      const frame = Buffer.concat([iv, ct, enc.getAuthTag()])
      const hdr = Buffer.allocUnsafe(4)
      hdr.writeUInt32BE(frame.length, 0)
      try { this.socket.cork() } catch { }
      this.socket.write(Buffer.concat([hdr, frame]))
      try { this.socket.uncork() } catch { }
      S.totalBytesSent += 4 + frame.length
      return true
    } catch (e) { secEntry('ERR', 'Binary send failed', e.message); return false }
  }

  async _dispatch(msg) {
    if (this.id && isBlocked(this.id)) {
      secEntry('WARN', `Blocked peer ${this.name || this.id} sent message after block — dropping and disconnecting`)
      try { this.socket.destroy() } catch { }
      this._close()
      return
    }
    if (!this.isAuthorized) {
      if (msg.type === 'auth_accept') {
        this.isAuthorized = true
        S.authorizedPeers.add(this.id)
        emit('ftps:peer-connected', { peerId: this.id, peerName: this.name, fingerprint: this._fingerprint, identityKey: this._peerIdentityPubB64, tofu: 'trusted', tofuDetail: null })
        if (this._sendQueue.length > 0) {
          for (const obj of this._sendQueue) this.send(obj)
          this._sendQueue = []
        }
      } else if (msg.type === 'auth_reject') {
        secEntry('INFO', `Peer ${this.name || this.id} rejected request.`)
        emit('ftps:peer-rejected', { peerId: this.id })
        this.disconnect()
      } else if (msg.type === 'auth_withdraw') {
        secEntry('INFO', `Peer ${this.name || this.id} withdrew request.`)
        emit('ftps:peer-withdrawn', { peerId: this.id })
        this.disconnect()
      }
      return
    }

    switch (msg.type) {
      case 'chat': emit('ftps:message', { peerId: this.id, msg }); break
      case 'file_start': {
        if (this._filebufs.size >= MAX_CONCURRENT_RECVS) {
          secEntry('WARN', `Too many concurrent receives (${this._filebufs.size}), rejecting ${msg.name}`)
          this.send({ type: 'file_abort', fid: msg.fid, reason: 'too_many' })
          break
        }
        const largeTmpPath = path.join(os.tmpdir(), 'p2n-recv-' + msg.fid + '-' + crypto.randomBytes(4).toString('hex'))
        const STREAM_THRESHOLD = 1 * 1024 * 1024
        let ws = null
        if (msg.size > STREAM_THRESHOLD) {
          try { ws = fs.createWriteStream(largeTmpPath) } catch { }
        }
        this._filebufs.set(msg.fid, {
          meta: msg, chunks: ws ? null : new Map(),
          tmpPath: largeTmpPath, written: 0, nextExpected: 0,
          ws, reorderBuf: ws ? new Map() : null, lastProgressEmit: 0,
          _startTime: Date.now(), _lastChunkTime: Date.now()
        })
        emit('ftps:file-start', { peerId: this.id, meta: msg })
        break
      }
      case 'file_chunk':
      case 'file_chunk_bin': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) {
          const chunk = msg.type === 'file_chunk_bin' ? msg.rawBuf : Buffer.from(msg.d, 'base64')
          if (fb.ws) {
            if (msg.i === fb.nextExpected) {
              fb.ws.write(chunk)
              fb.written++; fb.nextExpected++
              while (fb.reorderBuf.has(fb.nextExpected)) {
                fb.ws.write(fb.reorderBuf.get(fb.nextExpected))
                fb.reorderBuf.delete(fb.nextExpected)
                fb.written++; fb.nextExpected++
              }
            } else { fb.reorderBuf.set(msg.i, chunk) }
          } else {
            fb.chunks.set(msg.i, chunk)
            fb.written = fb.chunks.size
          }
          fb._lastChunkTime = Date.now()
          const now = Date.now()
          if (now - fb.lastProgressEmit > 100) {
            fb.lastProgressEmit = now
            emit('ftps:file-progress', { peerId: this.id, fid: msg.fid, pct: fb.written / fb.meta.total })
          }
        }
        break
      }
      case 'file_end': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) {
          emit('ftps:file-progress', { peerId: this.id, fid: msg.fid, pct: 1 })
          if (fb.ws) {
            try {
              await new Promise((res, rej) => { fb.ws.on('finish', res); fb.ws.on('error', rej); fb.ws.end() })
              try {
                const syncFd = fs.openSync(fb.tmpPath, 'r')
                fs.fsyncSync(syncFd); fs.closeSync(syncFd)
              } catch { }
              emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: null, tmpPath: fb.tmpPath })
              secEntry('OK', `File received (streamed): ${fb.meta.name}`, `${fb.meta.size}B -> ${fb.tmpPath}`)
            } catch (e) {
              secEntry('ERR', `File stream close failed: ${fb.meta.name}`, e.message)
              emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: null, tmpPath: null })
            }
          } else {
            const sorted = [...fb.chunks.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
            const data = Buffer.concat(sorted)
            emit('ftps:file-done', { peerId: this.id, meta: fb.meta, dataB64: data.toString('base64'), tmpPath: null })
            secEntry('OK', `File received: ${fb.meta.name}`, `${fb.meta.size}B`)
          }
          if (fb.meta.folderFid !== undefined) {
            emit('ftps:folder-file-done', { peerId: this.id, folderFid: fb.meta.folderFid, fileIndex: fb.meta.fileIndex, meta: fb.meta })
          }
          this.send({ type: 'file_ack', fid: msg.fid })
          this._filebufs.delete(msg.fid)
        }
        break
      }
      case 'file_abort': {
        const fb = this._filebufs.get(msg.fid)
        if (fb) this._filebufs.delete(msg.fid)
        emit('ftps:file-aborted', { peerId: this.id, fid: msg.fid })
        break
      }
      case 'folder_manifest':
        emit('ftps:folder-manifest', { peerId: this.id, manifest: msg })
        break
      case 'folder_complete':
        emit('ftps:folder-complete', { peerId: this.id, fid: msg.fid, name: msg.name, fileCount: msg.fileCount })
        break
      case 'file_ack': break
      case 'ping': break
      default: emit('ftps:message', { peerId: this.id, msg }); break
    }
  }

  async sendFile(fid, name, size, mime, dataB64, extraMeta = {}, filePath = null) {
    this._activeSends = this._activeSends || new Map()
    const activeSendCount = [...(this._activeSends.values())].filter(a => !a.cancelled).length
    if (activeSendCount >= MAX_CONCURRENT_SENDS) {
      secEntry('WARN', `Max concurrent sends (${MAX_CONCURRENT_SENDS}) reached, queuing: ${name}`)
      await new Promise(resolve => {
        const check = setInterval(() => {
          const active = [...(this._activeSends.values())].filter(a => !a.cancelled).length
          if (active < MAX_CONCURRENT_SENDS || this._closed) { clearInterval(check); resolve() }
        }, 200)  // check more frequently (200ms vs 500ms) for faster slot pickup
      })
      if (this._closed) return
    }
    const abort = { cancelled: false, _drainResolve: null }
    this._activeSends.set(fid, abort)

    const isTor = this.isTor || !!(this._initiator?.host?.endsWith('.onion'))
    const TOR_CHUNK = 512 * 1024
    const chunkSize = filePath ? (isTor ? TOR_CHUNK : STREAM_CHUNK) : CHUNK
    const total = Math.ceil(size / chunkSize)
    this.send({ type: 'file_start', fid, name, size, total, mime, ...extraMeta })
    secEntry('OK', `Sending: ${name}`, `${size}B${filePath ? ' (stream)' : ''}${isTor ? ' [Tor 512KB chunks]' : ''}`)

    let lastSendProgressEmit = 0
    const emitSendProgress = (i) => {
      const now = Date.now()
      if (now - lastSendProgressEmit > 100 || i === total - 1) {
        lastSendProgressEmit = now
        emit('ftps:send-progress', { peerId: this.id, fid, pct: (i + 1) / total, bytesSent: Math.min((i + 1) * chunkSize, size) })
      }
    }

    const drainThreshold = isTor ? 512 * 1024 : 4 * 1024 * 1024
    const waitForDrain = () => {
      if (this.socket && !this.socket.destroyed && this.socket.writableLength > drainThreshold) {
        return new Promise(r => {
          abort._drainResolve = r
          this.socket.once('drain', () => { abort._drainResolve = null; r() })
        })
      }
      return null
    }

    if (filePath) {
      let fd
      try {
        fd = fs.openSync(filePath, 'r')
        const buf = Buffer.allocUnsafe(chunkSize)
        for (let i = 0; i < total; i++) {
          if (abort.cancelled || this._closed || this.socket?.destroyed) {
            try { this.send({ type: 'file_abort', fid }) } catch { }
            this._activeSends.delete(fid)
            secEntry('INFO', `Send cancelled/disconnected: ${name}`)
            emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'cancelled' })
            return
          }
          const bytesRead = fs.readSync(fd, buf, 0, chunkSize, i * chunkSize)
          const sent = this.sendBinaryChunk(fid, i, buf.slice(0, bytesRead))
          if (sent === false) {
            this._activeSends.delete(fid)
            secEntry('WARN', `Send failed mid-transfer: ${name} (socket dead at chunk ${i}/${total})`)
            emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'disconnected' })
            return
          }
          const drain = waitForDrain()
          if (drain) await drain
          else if (i % 64 === 0) await new Promise(r => setImmediate(r))
          emitSendProgress(i)
        }
      } finally {
        if (fd !== undefined) try { fs.closeSync(fd) } catch { }
      }
    } else {
      const raw = Buffer.from(dataB64, 'base64')
      for (let i = 0; i < total; i++) {
        if (abort.cancelled || this._closed || this.socket?.destroyed) {
          try { this.send({ type: 'file_abort', fid }) } catch { }
          this._activeSends.delete(fid)
          secEntry('INFO', `Send cancelled/disconnected: ${name}`)
          emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'cancelled' })
          return
        }
        const sent = this.sendBinaryChunk(fid, i, raw.slice(i * chunkSize, (i + 1) * chunkSize))
        if (sent === false) {
          this._activeSends.delete(fid)
          secEntry('WARN', `Send failed mid-transfer: ${name} (socket dead at chunk ${i}/${total})`)
          emit('ftps:send-progress', { peerId: this.id, fid, pct: -1, error: 'disconnected' })
          return
        }
        const drain = waitForDrain()
        if (drain) await drain
        else if (i % 4 === 0) await new Promise(r => setImmediate(r))
        emitSendProgress(i)
      }
    }
    this._activeSends.delete(fid)
    this.send({ type: 'file_end', fid })
  }

  cancelSend(fid) {
    const abort = this._activeSends?.get(fid)
    if (abort) {
      abort.cancelled = true
      if (abort._drainResolve) { abort._drainResolve(); abort._drainResolve = null }
      return true
    }
    return false
  }

  _onDisconnect() {
    if (this._closed) return
    const id = this.id, name = this.name, wasReady = this.ready
    this.ready = false; try { this.socket.destroy() } catch { }

    if (this._sendQueue.length > 0) {
      const cutoff = Date.now() - 60000
      this._sendQueue = this._sendQueue.filter(item => !item._queuedAt || item._queuedAt > cutoff)
    }

    const canReconnect = this._initiator || (this._remoteAddress && this._remotePort && this._remoteAddress !== '127.0.0.1')
    const effectiveReconnectMax = this.isTor ? S.reconnectMax * 3 : S.reconnectMax

    if (wasReady && canReconnect && !this._closed && this._reconnectAttempt < effectiveReconnectMax) {
      this._reconnecting = true; this._reconnectAttempt++
      const delay = RECONNECT_DELAYS[Math.min(this._reconnectAttempt - 1, RECONNECT_DELAYS.length - 1)]
      secEntry('INFO', `Reconnecting to ${name || id} (${this._reconnectAttempt}/${S.reconnectMax})`, `in ${delay}ms`)
      emit('ftps:peer-reconnecting', { peerId: id, attempt: this._reconnectAttempt, maxAttempts: S.reconnectMax })

      const host = this._initiator?.host || this._remoteAddress
      const port = this._initiator?.port || this._remotePort

      const timer = setTimeout(() => {
        S.pendingReconnects.delete(id); if (this._closed) return

        const attachSuccess = (sock) => {
          sock.setTimeout(0)
          const nc = new PeerConn(sock, this._initiator || null)
          nc._sendQueue = this._sendQueue
          nc._reconnectAttempt = this._reconnectAttempt
          if (id) { S.peers.delete(id); S.peers.set(id, nc) }
        }

        const handleError = () => { this._onDisconnect() }

        if (host.endsWith('.onion') && _connectViaTor) {
          _connectViaTor(host, port).then(sock => attachSuccess(sock)).catch(handleError)
        } else if (!host.endsWith('.onion')) {
          const sock = net.createConnection({ host, port }, () => attachSuccess(sock))
          sock.on('error', () => { sock.destroy(); handleError() })
          sock.setTimeout(8000, () => { sock.destroy(); handleError() })
        } else {
          handleError()
        }
      }, delay)

      S.pendingReconnects.set(id, { host, port, attempt: this._reconnectAttempt, timer, maxAttempts: S.reconnectMax })
      return
    }
    this._close()
  }

  _close() {
    if (this._closed) return; this._closed = true; this._reconnecting = false
    for (const [, fb] of this._filebufs) {
      if (fb.ws) try { fb.ws.destroy() } catch { }
      if (fb.tmpPath) try { fs.unlinkSync(fb.tmpPath) } catch { }
    }
    this._filebufs.clear()
    const id = this.id; this.id = null
    if (id) {
      S.peers.delete(id)
      const rc = S.pendingReconnects.get(id)
      if (rc) { clearTimeout(rc.timer); S.pendingReconnects.delete(id) }
      secEntry('INFO', `Peer disconnected: ${this.name || id}`)
      emit('ftps:peer-disconnected', { peerId: id })
    }
    try { this.socket.destroy() } catch { }
  }

  disconnect() { this._close() }
}

module.exports = { PeerConn, deriveKey, setConnectViaTor }
