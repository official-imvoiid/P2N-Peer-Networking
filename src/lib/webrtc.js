/**
 * FTPS — WebRTC P2P Layer (v3)
 *
 * Connection architecture:
 *   STUN  → discovers your public IP (works on most home/office networks)
 *   TURN  → relays traffic when direct P2P is blocked (symmetric NAT, corporate firewalls)
 *   ECDH  → each session generates a fresh P-256 key pair → unique shared secret
 *   AES-GCM → every message + every file chunk encrypted with a per-message random IV
 *
 * P2P Connection depends on:
 *   ① Same LAN  → works with local ICE candidates, no TURN needed
 *   ② Different ISPs → STUN finds public IP, direct P2P usually works
 *   ③ Symmetric NAT or strict firewall → TURN relay required
 *   ④ Both peers behind symmetric NAT → TURN relay required (always)
 */

import {
  exportPublicKey, importPublicKey,
  deriveSharedKey, encryptData, decryptData,
  fromB64, keyFingerprint
} from './crypto.js'

// ── ICE SERVERS ───────────────────────────────────────────────────────────────
// STUN: discovers public IP for direct P2P (usually enough on most networks)
// TURN: relay fallback — needed for symmetric NAT / VPNs / strict firewalls
const ICE = [
  // ── STUN (no credentials needed) ──────────────────────────────────────────
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },  // NEW — metered.ca new endpoint

  // ── TURN relay (UDP + TCP fallback) ───────────────────────────────────────
  // metered.ca open-relay (current working endpoint, higher limits than old openrelay)
  { urls: 'turn:a.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:a.relay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:a.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },

  // expressturn free TURN (no signup, global anycast nodes)
  { urls: 'turn:relay1.expressturn.com:3478', username: 'efUN6MFIBNJRTCRYZP', credential: 'eTHbVm9qiwSlv76U' },

  // Xirsys free STUN (reliable, widely used)
  { urls: 'stun:fr-turn1.xirsys.com' },
]

const CHUNK = 65536            // 64 KB chunks — best throughput/latency tradeoff
const HWM = 1 * 1024 * 1024 // 1 MB buffered-amount high-water mark (backpressure)

const toB64J = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))))
const fromB64J = b => JSON.parse(decodeURIComponent(escape(atob(b))))

/** Pause sending until the channel's buffered data drops below HWM */
function waitDrain(ch) {
  if (ch.bufferedAmount < HWM) return Promise.resolve()
  ch.bufferedAmountLowThreshold = HWM / 2
  return new Promise(res => {
    const h = () => { ch.removeEventListener('bufferedamountlow', h); res() }
    ch.addEventListener('bufferedamountlow', h)
    setTimeout(res, 8000)  // safety net — never hang forever
  })
}

// ── P2PNode ───────────────────────────────────────────────────────────────────
export class P2PNode {
  constructor(handlers = {}) {
    this.h = handlers
    this.conns = new Map()  // peerId → { pc, ch, sharedKey, kp, fingerprint }
    this._bufs = {}         // fileId → { meta, chunks[] }
    this._spam = {}
    this._spamLimit = 200
  }

  setSpamLimit(n) { this._spamLimit = n }

  // ── INITIATOR ─────────────────────────────────────────────────────────────
  async createOffer(kp, myNodeId) {
    const pc = this._mkPc()
    // ordered=true: chunks arrive in order (critical for file reassembly)
    const ch = pc.createDataChannel('ftps', { ordered: true })
    const tmp = 'tmp_' + Date.now().toString(36)
    this.conns.set(tmp, { pc, ch, sharedKey: null, kp, fingerprint: null })
    this._wireChannel(ch, tmp)
    this._wirePeerConn(pc, tmp)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this._gatherICE(pc)
    const pub = await exportPublicKey(kp.publicKey)
    const fp = await keyFingerprint(pub)
    this.conns.get(tmp).fingerprint = fp
    return {
      tempId: tmp,
      offerB64: toB64J({ sdp: pc.localDescription, pub, nid: myNodeId, v: '3' }),
      fingerprint: fp,
    }
  }

  // ── RESPONDER ─────────────────────────────────────────────────────────────
  async createAnswer(offerB64, kp, myNodeId) {
    const od = fromB64J(offerB64)
    const pc = this._mkPc()
    const peerId = od.nid || ('peer_' + Date.now().toString(36))
    const conn = { pc, ch: null, sharedKey: null, kp, fingerprint: null }
    this.conns.set(peerId, conn)
    this._wirePeerConn(pc, peerId)

    pc.ondatachannel = async e => {
      conn.ch = e.channel
      this._wireChannel(e.channel, peerId)
    }

    await pc.setRemoteDescription(od.sdp)
    const ans = await pc.createAnswer()
    await pc.setLocalDescription(ans)
    await this._gatherICE(pc)

    // Derive shared key from peer's ECDH public key
    const peerPub = await importPublicKey(od.pub)
    conn.sharedKey = await deriveSharedKey(kp.privateKey, peerPub)
    const pub = await exportPublicKey(kp.publicKey)
    const fp = await keyFingerprint(pub)
    conn.fingerprint = fp

    return {
      peerId,
      answerB64: toB64J({ sdp: pc.localDescription, pub, nid: myNodeId, v: '3' }),
      fingerprint: fp,
    }
  }

  // ── FINALIZE (Initiator receives the answer) ───────────────────────────────
  async finalizeOffer(tempId, answerB64) {
    const conn = this.conns.get(tempId)
    if (!conn) throw new Error('No pending connection: ' + tempId)

    const ad = fromB64J(answerB64)
    const peerId = ad.nid || tempId

    // Rename the map entry to the real peer ID BEFORE setRemoteDescription
    // so that any ICE/channel events that fire during or after see the real ID
    if (peerId !== tempId) {
      this.conns.set(peerId, conn)
      this.conns.delete(tempId)
    }

    await conn.pc.setRemoteDescription(ad.sdp)

    // Derive shared encryption key
    const peerPub = await importPublicKey(ad.pub)
    conn.sharedKey = await deriveSharedKey(conn.kp.privateKey, peerPub)
    conn.peerNodeId = peerId

    // If the channel already opened during ICE (race: same-LAN fast connect),
    // manually fire onOpen so the app knows the connection is live
    if (conn.ch?.readyState === 'open') {
      this.h.onOpen?.(peerId)
    }

    return peerId
  }

  // ── SEND ──────────────────────────────────────────────────────────────────
  async sendMsg(pid, text) {
    const c = this.conns.get(pid)
    if (!this._isOpen(c)) return false
    await this._send(c, JSON.stringify({ type: 'chat', text, t: Date.now() }))
    return true
  }

  async sendFile(pid, file, onProg) {
    const c = this.conns.get(pid)
    if (!this._isOpen(c)) return false
    const fid = crypto.randomUUID()
    const total = Math.ceil(file.size / CHUNK)
    await this._send(c, JSON.stringify({
      type: 'file_start', fid, name: file.name,
      size: file.size, total, mime: file.type || 'application/octet-stream'
    }))
    const buf = await file.arrayBuffer()
    for (let i = 0; i < total; i++) {
      await waitDrain(c.ch)
      if (!this._isOpen(c)) return false
      const sl = buf.slice(i * CHUNK, (i + 1) * CHUNK)
      const b64 = btoa(String.fromCharCode(...new Uint8Array(sl)))
      await this._send(c, JSON.stringify({ type: 'file_chunk', fid, i, d: b64 }))
      onProg?.((i + 1) / total)
    }
    await this._send(c, JSON.stringify({ type: 'file_end', fid }))
    return fid
  }

  async sendFolder(pid, meta) {
    const c = this.conns.get(pid)
    if (!this._isOpen(c)) return false
    await this._send(c, JSON.stringify({ type: 'folder_share', folder: meta }))
    return true
  }

  getFingerprint(pid) { return this.conns.get(pid)?.fingerprint ?? null }
  isConnected(pid) { return this._isOpen(this.conns.get(pid)) }
  close(pid) { this.conns.get(pid)?.pc.close(); this.conns.delete(pid) }
  closeAll() { for (const [id] of this.conns) this.close(id) }

  // ── INTERNALS ─────────────────────────────────────────────────────────────
  _mkPc() {
    return new RTCPeerConnection({
      iceServers: ICE,
      iceTransportPolicy: 'all',  // try direct first, TURN as fallback
    })
  }

  _wirePeerConn(pc, pid) {
    pc.oniceconnectionstatechange = () => {
      this.h.onState?.(pid, pc.iceConnectionState)
      if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        // Don't immediately delete — 'disconnected' can recover
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
          this.conns.delete(pid)
          this.h.onClose?.(pid)
        }
      }
    }
    pc.onconnectionstatechange = () => {
      this.h.onConnState?.(pid, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.conns.delete(pid)
        this.h.onClose?.(pid)
      }
    }
  }

  /** Wire a DataChannel to a peerId. Uses _findPidFor to handle ID renames. */
  _wireChannel(ch, pid) {
    ch.binaryType = 'arraybuffer'
    ch.onopen = () => {
      // Always look up real current peerId in case it was renamed after offer/answer
      const realPid = this._findPidFor(ch) || pid
      this.h.onOpen?.(realPid)
    }
    ch.onclose = () => {
      const realPid = this._findPidFor(ch) || pid
      this.conns.delete(realPid)
      this.h.onClose?.(realPid)
    }
    ch.onmessage = e => {
      const realPid = this._findPidFor(ch) || pid
      this._raw(e.data, realPid)
    }
  }

  /** Find which peerId owns this DataChannel object */
  _findPidFor(ch) {
    for (const [pid, conn] of this.conns) {
      if (conn.ch === ch) return pid
    }
    return null
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
        if (conn?.sharedKey) {
          const d = await decryptData(conn.sharedKey, new Uint8Array(raw))
          txt = new TextDecoder().decode(d)
        } else {
          txt = new TextDecoder().decode(raw)
        }
      } else {
        txt = raw
      }
      this._dispatch(JSON.parse(txt), pid)
    } catch (e) {
      console.warn('[FTPS] dropped msg from', pid, e.message)
    }
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
    if (c.sharedKey) {
      const enc = await encryptData(c.sharedKey, payload)
      c.ch.send(enc.buffer)
    } else {
      c.ch.send(payload)
    }
  }

  _isOpen(c) { return c?.ch?.readyState === 'open' }

  _gatherICE(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') { res(); return }
      const h = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', h)
          res()
        }
      }
      pc.addEventListener('icegatheringstatechange', h)
      // Allow up to 14 seconds: STUN is ~1s, TURN can be 5-8s on slow networks
      setTimeout(res, 14000)
    })
  }
}
