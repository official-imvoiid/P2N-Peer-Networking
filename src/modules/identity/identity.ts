/**
 * Identity module — uses ONLY native Web Crypto API + @noble/ed25519
 * No libsodium, no argon2-browser, no WASM, no CJS issues.
 *
 * KDF:  PBKDF2-SHA256 (600k iterations for passphrase, 200k for PIN)
 * ENC:  AES-GCM-256
 * SIGN: Ed25519 (@noble/ed25519)
 * ID:   SHA-256 via crypto.subtle → base58 → fingerprint
 */
import * as ed from '@noble/ed25519'
import baseX from 'base-x'
// --- Standalone Sync SHA-512 Fallback for @noble/ed25519 ---
// ed25519 strictly requires a synchronous hash to derive public keys,
// but the native Web Crypto API is async. We provide a minimal,
// dependency-free JS implementation here avoiding bundler/WASM issues.
function sha512Sync(message: Uint8Array): Uint8Array {
    const K = [
        0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
        0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
        0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
        0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
        0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
        0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
        0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
        0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
        0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
        0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
        0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
        0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
        0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
        0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
        0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
        0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
        0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
        0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
        0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
        0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
    ];
    let H = [
        0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1,
        0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179
    ];

    const blocks = new Uint8Array(((message.length + 8 >> 6) + 1) * 128);
    blocks.set(message);
    blocks[message.length] = 0x80;

    const dataview = new DataView(blocks.buffer);
    const bits = message.length * 8;
    dataview.setUint32(blocks.length - 8, Math.floor(bits / 0x100000000), false);
    dataview.setUint32(blocks.length - 4, bits >>> 0, false);

    const W = new Int32Array(160);
    for (let i = 0; i < blocks.length; i += 128) {
        let [a, a1, b, b1, c, c1, d, d1, e, e1, f, f1, g, g1, h, h1] = H;

        for (let j = 0; j < 80; j++) {
            if (j < 16) {
                W[j * 2] = dataview.getInt32(i + j * 8, false);
                W[j * 2 + 1] = dataview.getInt32(i + j * 8 + 4, false);
            } else {
                const p0_1 = W[(j - 15) * 2], p0_2 = W[(j - 15) * 2 + 1];
                const s0_1 = (p0_1 >>> 1 | p0_2 << 31) ^ (p0_1 >>> 8 | p0_2 << 24) ^ (p0_1 >>> 7);
                const s0_2 = (p0_2 >>> 1 | p0_1 << 31) ^ (p0_2 >>> 8 | p0_1 << 24) ^ (p0_1 << 25 | p0_2 >>> 7);

                const p1_1 = W[(j - 2) * 2], p1_2 = W[(j - 2) * 2 + 1];
                const s1_1 = (p1_1 >>> 19 | p1_2 << 13) ^ (p1_1 << 3 | p1_2 >>> 29) ^ (p1_1 >>> 6);
                const s1_2 = (p1_2 >>> 19 | p1_1 << 13) ^ (p1_2 << 3 | p1_1 >>> 29) ^ (p1_1 << 26 | p1_2 >>> 6);

                const j7_1 = W[(j - 7) * 2], j7_2 = W[(j - 7) * 2 + 1];
                const j16_1 = W[(j - 16) * 2], j16_2 = W[(j - 16) * 2 + 1];

                let carry = 0;
                let L = (j16_2 >>> 0) + (s0_2 >>> 0); carry = (L / 0x100000000) | 0; L >>>= 0;
                L += (j7_2 >>> 0); carry = (carry + (L / 0x100000000)) | 0; L >>>= 0;
                L += (s1_2 >>> 0); carry = (carry + (L / 0x100000000)) | 0; W[j * 2 + 1] = L >>> 0;
                W[j * 2] = (j16_1 + s0_1 + j7_1 + s1_1 + carry) >>> 0;
            }

            const S1_1 = (e >>> 14 | e1 << 18) ^ (e >>> 18 | e1 << 14) ^ (e << 23 | e1 >>> 9);
            const S1_2 = (e1 >>> 14 | e << 18) ^ (e1 >>> 18 | e << 14) ^ (e1 << 23 | e >>> 9);
            const ch_1 = (e & f) ^ (~e & g), ch_2 = (e1 & f1) ^ (~e1 & g1);

            let temp1_1 = 0, temp1_2 = 0, carry = 0;
            let L = (h1 >>> 0) + (S1_2 >>> 0); temp1_2 = L >>> 0; carry = (L / 0x100000000) | 0;
            L = temp1_2 + (ch_2 >>> 0); temp1_2 = L >>> 0; carry = (carry + (L / 0x100000000)) | 0;
            L = temp1_2 + (K[j * 2 + 1] >>> 0); temp1_2 = L >>> 0; carry = (carry + (L / 0x100000000)) | 0;
            L = temp1_2 + (W[j * 2 + 1] >>> 0); temp1_2 = L >>> 0; carry = (carry + (L / 0x100000000)) | 0;
            temp1_1 = (h + S1_1 + ch_1 + K[j * 2] + W[j * 2] + carry) >>> 0;

            const S0_1 = (a >>> 28 | a1 << 4) ^ (a << 30 | a1 >>> 2) ^ (a << 25 | a1 >>> 7);
            const S0_2 = (a1 >>> 28 | a << 4) ^ (a1 << 30 | a >>> 2) ^ (a1 << 25 | a >>> 7);
            const maj_1 = (a & b) ^ (a & c) ^ (b & c), maj_2 = (a1 & b1) ^ (a1 & c1) ^ (b1 & c1);

            let temp2_1 = 0, temp2_2 = 0;
            carry = 0; L = (S0_2 >>> 0) + (maj_2 >>> 0); temp2_2 = L >>> 0; carry = (L / 0x100000000) | 0;
            temp2_1 = (S0_1 + maj_1 + carry) >>> 0;

            h = g; h1 = g1; g = f; g1 = f1; f = e; f1 = e1;
            carry = 0; L = (d1 >>> 0) + (temp1_2 >>> 0); e1 = L >>> 0; carry = (L / 0x100000000) | 0;
            e = (d + temp1_1 + carry) >>> 0;
            d = c; d1 = c1; c = b; c1 = b1; b = a; b1 = a1;
            carry = 0; L = (temp1_2 >>> 0) + (temp2_2 >>> 0); a1 = L >>> 0; carry = (L / 0x100000000) | 0;
            a = (temp1_1 + temp2_1 + carry) >>> 0;
        }

        let carry = 0;
        let L = (H[1] >>> 0) + (a1 >>> 0); H[1] = L >>> 0; carry = (L / 0x100000000) | 0; H[0] = (H[0] + a + carry) >>> 0;
        carry = 0; L = (H[3] >>> 0) + (b1 >>> 0); H[3] = L >>> 0; carry = (L / 0x100000000) | 0; H[2] = (H[2] + b + carry) >>> 0;
        carry = 0; L = (H[5] >>> 0) + (c1 >>> 0); H[5] = L >>> 0; carry = (L / 0x100000000) | 0; H[4] = (H[4] + c + carry) >>> 0;
        carry = 0; L = (H[7] >>> 0) + (d1 >>> 0); H[7] = L >>> 0; carry = (L / 0x100000000) | 0; H[6] = (H[6] + d + carry) >>> 0;
        carry = 0; L = (H[9] >>> 0) + (e1 >>> 0); H[9] = L >>> 0; carry = (L / 0x100000000) | 0; H[8] = (H[8] + e + carry) >>> 0;
        carry = 0; L = (H[11] >>> 0) + (f1 >>> 0); H[11] = L >>> 0; carry = (L / 0x100000000) | 0; H[10] = (H[10] + f + carry) >>> 0;
        carry = 0; L = (H[13] >>> 0) + (g1 >>> 0); H[13] = L >>> 0; carry = (L / 0x100000000) | 0; H[12] = (H[12] + g + carry) >>> 0;
        carry = 0; L = (H[15] >>> 0) + (h1 >>> 0); H[15] = L >>> 0; carry = (L / 0x100000000) | 0; H[14] = (H[14] + h + carry) >>> 0;
    }

    const digest = new Uint8Array(64);
    const dv = new DataView(digest.buffer);
    for (let i = 0; i < 16; i++) dv.setInt32(i * 4, H[i], false);
    return digest;
}

// @noble/ed25519 configuration
ed.hashes.sha512 = (...m: Uint8Array[]) => sha512Sync(ed.etc.concatBytes(...m))


const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const bs58 = baseX(BASE58)
const enc = new TextEncoder()
const dec = new TextDecoder()

export interface Identity {
    publicKey: Uint8Array
    privateKey: Uint8Array
    peerId: string
    fingerprint: string
    displayName?: string
}

/** Derive a raw 32-byte key using PBKDF2-SHA256 */
async function pbkdf2(
    secret: string,
    salt: Uint8Array,
    iterations: number
): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(secret) as BufferSource, 'PBKDF2', false, ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
        keyMaterial,
        256
    )
    return new Uint8Array(bits)
}

/** Import raw bytes as AES-GCM key */
async function importAES(keyBytes: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function generateIdentity(passphrase: string): Promise<Identity> {
    // Deterministic seed: PBKDF2-SHA256 with 600k iterations (matches NIST SP 800-132)
    const salt = enc.encode('FTPS_NETWORK_V1')
    const privateKey = await pbkdf2(passphrase, salt, 600_000)
    const publicKey = await ed.getPublicKey(privateKey)

    // PeerID = base58( sha256(publicKey) )
    const hashBuf = await crypto.subtle.digest('SHA-256', publicKey as BufferSource)
    const peerId = bs58.encode(new Uint8Array(hashBuf))
    const fingerprint = peerId.slice(0, 8)

    return { publicKey, privateKey, peerId, fingerprint }
}

export async function encryptIdentity(
    identity: Identity,
    pin: string
): Promise<{ encrypted: Uint8Array; salt: Uint8Array }> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const keyBytes = await pbkdf2(pin, salt, 200_000)
    const aesKey = await importAES(keyBytes)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const payload = enc.encode(JSON.stringify({
        publicKey: Array.from(identity.publicKey),
        privateKey: Array.from(identity.privateKey),
        peerId: identity.peerId,
        fingerprint: identity.fingerprint,
    }))

    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, payload as BufferSource))

    // Pack: [12 bytes IV][ciphertext]
    const out = new Uint8Array(iv.length + ciphertext.length)
    out.set(iv)
    out.set(ciphertext, iv.length)

    return { encrypted: out, salt }
}

export async function decryptIdentity(
    encryptedData: Uint8Array,
    salt: Uint8Array,
    pin: string
): Promise<Identity> {
    const keyBytes = await pbkdf2(pin, salt, 200_000)
    const aesKey = await importAES(keyBytes)
    const iv = encryptedData.slice(0, 12)
    const ciphertext = encryptedData.slice(12)

    let decrypted: ArrayBuffer
    try {
        decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext as BufferSource)
    } catch {
        throw new Error('Invalid PIN or corrupted data')
    }

    const parsed = JSON.parse(dec.decode(decrypted))
    return {
        publicKey: new Uint8Array(parsed.publicKey),
        privateKey: new Uint8Array(parsed.privateKey),
        peerId: parsed.peerId,
        fingerprint: parsed.fingerprint,
    }
}

/**
 * Encrypt the identity with a passphrase for JSON export backup.
 */
export async function exportIdentityBackup(identity: Identity, passphrase: string): Promise<string> {
    // 600k iterations for strong passphrase encryption
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const keyBytes = await pbkdf2(passphrase, salt, 600_000)
    const aesKey = await importAES(keyBytes)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const payload = enc.encode(JSON.stringify({
        publicKey: Array.from(identity.publicKey),
        privateKey: Array.from(identity.privateKey),
        peerId: identity.peerId,
        fingerprint: identity.fingerprint,
        displayName: identity.displayName
    }))

    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, payload as BufferSource))

    return JSON.stringify({
        version: 1,
        salt: Array.from(salt),
        iv: Array.from(iv),
        ciphertext: Array.from(ciphertext)
    })
}

/**
 * Decrypt an imported identity JSON backup.
 */
export async function importIdentityBackup(backupJson: string, passphrase: string): Promise<Identity> {
    const data = JSON.parse(backupJson)
    if (data.version !== 1) throw new Error('Unsupported backup version')

    const salt = new Uint8Array(data.salt)
    const iv = new Uint8Array(data.iv)
    const ciphertext = new Uint8Array(data.ciphertext)

    const keyBytes = await pbkdf2(passphrase, salt, 600_000)
    const aesKey = await importAES(keyBytes)

    let decrypted: ArrayBuffer
    try {
        decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext as BufferSource)
    } catch {
        throw new Error('Incorrect passphrase or corrupted backup')
    }

    const parsed = JSON.parse(dec.decode(decrypted))
    return {
        publicKey: new Uint8Array(parsed.publicKey),
        privateKey: new Uint8Array(parsed.privateKey),
        peerId: parsed.peerId,
        fingerprint: parsed.fingerprint,
        displayName: parsed.displayName
    }
}
