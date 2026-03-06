/**
 * FTPS — WebRTC P2P with ECDH E2E encryption
 * nodeId is exchanged during handshake so both sides see the same peer ID.
 */
import { exportPublicKey, importPublicKey, deriveSharedKey, encryptData, decryptData, fromB64 } from './crypto.js'

// ICE servers — STUN for NAT discovery + TURN for cross-network relay
// TURN servers ensure connections work across different ISPs, mobile networks,
// corporate firewalls, and symmetric NAT (which STUN alone cannot pierce).
const ICE = [
  // STUN — public IP discovery
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },

  // TURN — relay fallback for symmetric NAT / firewalls (cross-network)
  // Open Relay Project — free public TURN
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // Numb.viagenie.ca backup TURN
  {
    urls: 'turn:numb.viagenie.ca',
    username: 'webrtc@live.com',
    credential: 'muazkh',
  },
]
const CHUNK = 16384
const sleep = ms => new Promise(r => setTimeout(r, ms))
const toB64J = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))))
const fromB64J = b => JSON.parse(decodeURIComponent(escape(atob(b))))

export class P2PNode {
  constructor(handlers = {}) {
    this.h = handlers
    this.conns = new Map()     // peerId → { pc, ch, sharedKey, kp }
    this._bufs = {}            // fileId → { meta, chunks[] }
    this._spam = {}            // peerId → { count, resetAt }
    this._spamLimit = 200
  }

  setSpamLimit(n) { this._spamLimit = n }

  // ── INITIATOR ─────────────────────────────────────────────────────────
  async createOffer(kp, myNodeId) {
    const pc = this._mkPc()
    const ch = pc.createDataChannel('ftps', { ordered: true })
    const tmp = 'tmp_' + Date.now().toString(36)
    this.conns.set(tmp, { pc, ch, sharedKey: null, kp })
    this._wireC(ch, tmp)
    this._wirePc(pc, tmp)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this._ice(pc)
    const pub = await exportPublicKey(kp.publicKey)
    return { tempId: tmp, offerB64: toB64J({ sdp: pc.localDescription, pub, nid: myNodeId, v: '2' }) }
  }

  // ── RESPONDER ─────────────────────────────────────────────────────────
  async createAnswer(offerB64, kp, myNodeId) {
    const od = fromB64J(offerB64)
    const pc = this._mkPc()
    // Use the initiator's nodeId as the peerId so both sides agree
    const peerId = od.nid || ('peer_' + Date.now().toString(36))
    const conn = { pc, ch: null, sharedKey: null, kp, peerNodeId: peerId }
    this.conns.set(peerId, conn)
    this._wirePc(pc, peerId)
    pc.ondatachannel = e => { conn.ch = e.channel; this._wireC(e.channel, peerId) }
    await pc.setRemoteDescription(od.sdp)
    const ans = await pc.createAnswer()
    await pc.setLocalDescription(ans)
    await this._ice(pc)
    const peerPub = await importPublicKey(od.pub)
    conn.sharedKey = await deriveSharedKey(kp.privateKey, peerPub)
    const pub = await exportPublicKey(kp.publicKey)
    return { peerId, answerB64: toB64J({ sdp: pc.localDescription, pub, nid: myNodeId, v: '2' }) }
  }

  // ── FINALIZE ─────────────────────────────────────────────────────────
  async finalizeOffer(tempId, answerB64) {
    const conn = this.conns.get(tempId)
    if (!conn) throw new Error('No pending: ' + tempId)
    const ad = fromB64J(answerB64)
    // Rename conn to use peer's nodeId
    const peerId = ad.nid || tempId
    if (peerId !== tempId) {
      this.conns.set(peerId, conn)
      this.conns.delete(tempId)
    }
    await conn.pc.setRemoteDescription(ad.sdp)
    const peerPub = await importPublicKey(ad.pub)
    conn.sharedKey = await deriveSharedKey(conn.kp.privateKey, peerPub)
    conn.peerNodeId = peerId
    return peerId
  }

  // ── SEND ─────────────────────────────────────────────────────────────
  async sendMsg(pid, text) {
    const c = this.conns.get(pid)
    if (!this._open(c)) return false
    await this._send(c, JSON.stringify({ type: 'chat', text, t: Date.now() }))
    return true
  }

  async sendFile(pid, file, onProg) {
    const c = this.conns.get(pid)
    if (!this._open(c)) return false
    const fid = crypto.randomUUID()
    const total = Math.ceil(file.size / CHUNK)
    await this._send(c, JSON.stringify({ type: 'file_start', fid, name: file.name, size: file.size, total, mime: file.type || 'application/octet-stream' }))
    const buf = await file.arrayBuffer()
    for (let i = 0; i < total; i++) {
      const sl = buf.slice(i * CHUNK, (i + 1) * CHUNK)
      const b64 = btoa(String.fromCharCode(...new Uint8Array(sl)))
      await this._send(c, JSON.stringify({ type: 'file_chunk', fid, i, d: b64 }))
      onProg?.((i + 1) / total)
      if (i % 8 === 7) await sleep(4)
    }
    await this._send(c, JSON.stringify({ type: 'file_end', fid }))
    return fid
  }

  async sendFolder(pid, meta) {
    const c = this.conns.get(pid)
    if (!this._open(c)) return false
    await this._send(c, JSON.stringify({ type: 'folder_share', folder: meta }))
    return true
  }

  isConnected(pid) { return this._open(this.conns.get(pid)) }

  close(pid) { this.conns.get(pid)?.pc.close(); this.conns.delete(pid) }
  closeAll() { for (const [id] of this.conns) this.close(id) }

  // ── INTERNALS ─────────────────────────────────────────────────────────
  _mkPc() { return new RTCPeerConnection({ iceServers: ICE }) }

  _wirePc(pc, pid) {
    pc.oniceconnectionstatechange = () => {
      this.h.onState?.(pid, pc.iceConnectionState)
      if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        this.conns.delete(pid)
        this.h.onClose?.(pid)
      }
    }
  }

  _wireC(ch, pid) {
    ch.binaryType = 'arraybuffer'
    ch.onopen = () => this.h.onOpen?.(pid)
    ch.onclose = () => { this.conns.delete(pid); this.h.onClose?.(pid) }
    ch.onmessage = e => this._raw(e.data, pid)
  }

  async _raw(raw, pid) {
    const now = Date.now()
    const s = this._spam[pid] || { count: 0, r: now + 60000 }
    if (now > s.r) { s.count = 0; s.r = now + 60000 }
    s.count++; this._spam[pid] = s
    if (s.count > this._spamLimit) return
    const conn = this.conns.get(pid)
    try {
      let txt
      if (raw instanceof ArrayBuffer) {
        if (conn?.sharedKey) { const d = await decryptData(conn.sharedKey, new Uint8Array(raw)); txt = new TextDecoder().decode(d) }
        else txt = new TextDecoder().decode(raw)
      } else txt = raw
      this._dispatch(JSON.parse(txt), pid)
    } catch (e) { console.warn('[FTPS] dropped msg from', pid, e.message) }
  }

  _dispatch(msg, pid) {
    switch (msg.type) {
      case 'chat': this.h.onMsg?.(pid, msg); break
      case 'file_start':
        this._bufs[msg.fid] = { meta: msg, chunks: [] }
        this.h.onFileStart?.(pid, msg)
        break
      case 'file_chunk': {
        const b = this._bufs[msg.fid]
        if (b) { b.chunks.push({ i: msg.i, d: msg.d }); this.h.onFileProg?.(pid, msg.fid, b.chunks.length / b.meta.total) }
        break
      }
      case 'file_end': {
        const b = this._bufs[msg.fid]
        if (b) {
          b.chunks.sort((a, z) => a.i - z.i)
          const parts = b.chunks.map(c => fromB64(c.d))
          const len = parts.reduce((n, p) => n + p.length, 0)
          const out = new Uint8Array(len); let off = 0
          for (const p of parts) { out.set(p, off); off += p.length }
          this.h.onFileDone?.(pid, b.meta, new Blob([out], { type: b.meta.mime }))
          delete this._bufs[msg.fid]
        }
        break
      }
      case 'folder_share': this.h.onMsg?.(pid, msg); break
    }
  }

  async _send(c, payload) {
    if (c.sharedKey) { const enc = await encryptData(c.sharedKey, payload); c.ch.send(enc.buffer) }
    else c.ch.send(payload)
  }

  _open(c) { return c?.ch?.readyState === 'open' }

  _ice(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') { res(); return }
      const h = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', h); res() } }
      pc.addEventListener('icegatheringstatechange', h)
      setTimeout(res, 12000) // TURN needs more time than STUN
    })
  }
}
