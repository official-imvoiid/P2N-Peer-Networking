/**
 * FTPS — Real End-to-End Encryption
 * 
 * Algorithm:
 *   Key Exchange : ECDH P-256
 *   Symmetric    : AES-GCM 256-bit
 *   Each message : unique random 96-bit IV
 *   No key ever  : leaves the browser unencrypted
 */

export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
}

export async function exportPublicKey(publicKey) {
  const raw = await crypto.subtle.exportKey('spki', publicKey)
  return toB64(new Uint8Array(raw))
}

export async function importPublicKey(b64) {
  const raw = fromB64(b64)
  return crypto.subtle.importKey(
    'spki', raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  )
}

export async function deriveSharedKey(privateKey, peerPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt any data (string or Uint8Array) with AES-GCM-256
 * Returns: Uint8Array — [12-byte IV | ciphertext]
 */
export async function encryptData(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const out = new Uint8Array(12 + ct.byteLength)
  out.set(iv)
  out.set(new Uint8Array(ct), 12)
  return out
}

/**
 * Decrypt a [IV | ciphertext] Uint8Array
 * Returns: Uint8Array of plaintext
 */
export async function decryptData(key, data) {
  const arr = data instanceof Uint8Array ? data : new Uint8Array(data)
  const iv = arr.slice(0, 12)
  const ct = arr.slice(12)
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  )
}

export const toB64 = (buf) =>
  btoa(String.fromCharCode(...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))))

export const fromB64 = (b64) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0))

/**
 * Compute a short SHA-256 fingerprint of an exported ECDH public key (base-64).
 * Returned as "XX:XX:XX:XX:XX:XX:XX:XX" (first 8 bytes of sha-256, colon-separated hex).
 * Every session generates a fresh key pair → the fingerprint is always unique.
 */
export async function keyFingerprint(pubKeyB64) {
  const raw = fromB64(pubKeyB64)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  const bytes = Array.from(new Uint8Array(digest)).slice(0, 8)
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':')
}
