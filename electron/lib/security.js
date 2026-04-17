'use strict'
const crypto = require('crypto')
const { S, emit, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX } = require('./state')

// ── SECURITY LOG (debounced emission) ────────────────────────────────────────
function _flushLogBatch() {
  if (S._logBatch.length === 0) return
  for (const entry of S._logBatch) emit('p2n:log', entry)
  S._logBatch = []
  S._logTimer = null
}

function secEntry(level, msg, detail = '') {
  const entry = { ts: new Date().toISOString().slice(11, 19), level, msg, detail }
  S.secLog.push(entry)
  if (S.secLog.length > 500) S.secLog.shift()
  S._logBatch.push(entry)
  if (!S._logTimer) S._logTimer = setTimeout(_flushLogBatch, 200)
}

// ── EPHEMERAL IDENTITY (Ed25519) ─────────────────────────────────────────────
function generateIdentityKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  S.myIdentityPrivKey = privateKey
  S.myIdentityPubKey = publicKey
  S.myIdentityPubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  secEntry('OK', 'Fresh Ed25519 identity keypair generated (session-scoped, not saved to disk)')
}

// ── TOFU ─────────────────────────────────────────────────────────────────────
function tofuCheck(nodeId, identityPubB64, name) {
  const existing = S.tofuStore.get(nodeId)
  if (!existing) {
    S.tofuStore.set(nodeId, { identityKey: identityPubB64, name, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() })
    return { status: 'new' }
  }
  if (existing.identityKey === identityPubB64) {
    existing.lastSeen = new Date().toISOString()
    existing.name = name || existing.name
    return { status: 'trusted' }
  }
  return { status: 'changed', previousName: existing.name, firstSeen: existing.firstSeen }
}

function tofuAcceptNewKey(nodeId, identityPubB64, name) {
  S.tofuStore.set(nodeId, { identityKey: identityPubB64, name, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() })
}

// ── BLOCKING & RATE LIMITING ─────────────────────────────────────────────────
function isBlocked(nodeId) {
  if (!S.blockedPeers.has(nodeId)) return false
  const data = S.blockedPeers.get(nodeId)
  if (data.expiry && Date.now() > data.expiry) {
    S.blockedPeers.delete(nodeId)
    return false
  }
  return true
}

function isBlockedIP(ip) { return S.blockedIPs.has(ip) }

function isRateLimited(ip) {
  const now = Date.now()
  const entry = S.connectionAttempts.get(ip)
  if (!entry) { S.connectionAttempts.set(ip, { count: 1, firstAttempt: now }); return false }
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) { S.connectionAttempts.set(ip, { count: 1, firstAttempt: now }); return false }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    secEntry('WARN', `Rate limited IP: ${ip}`, `${entry.count} attempts in ${Math.round((now - entry.firstAttempt) / 1000)}s`)
    return true
  }
  return false
}

module.exports = {
  secEntry, generateIdentityKeypair,
  tofuCheck, tofuAcceptNewKey,
  isBlocked, isBlockedIP, isRateLimited,
}
