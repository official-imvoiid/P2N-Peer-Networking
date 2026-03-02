import * as ed from '@noble/ed25519'

import argon2 from 'argon2-browser'
import baseX from 'base-x'
import _sodium from 'libsodium-wrappers'

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const bs58 = baseX(BASE58)

const FIXED_SALT = new TextEncoder().encode('FTPS_NETWORK_V1')

export interface Identity {
    publicKey: Uint8Array
    privateKey: Uint8Array
    peerId: string
    fingerprint: string
    displayName?: string
}

export async function generateIdentity(passphrase: string): Promise<Identity> {
    const result = await argon2.hash({
        pass: passphrase,
        salt: FIXED_SALT,
        time: 3,
        mem: 65536,
        hashLen: 32,
        parallelism: 1,
        type: argon2.ArgonType.Argon2id,
    })

    const privateKey = result.hash
    const publicKey = await ed.getPublicKey(privateKey)

    await _sodium.ready
    const sodium = _sodium

    // Generate SHA256 using libsodium
    const peerIdBytes = sodium.crypto_hash_sha256(publicKey)

    // Convert to regular Uint8Array for base-x
    const peerId = bs58.encode(new Uint8Array(peerIdBytes))
    const fingerprint = peerId.slice(0, 8)

    return { publicKey, privateKey, peerId, fingerprint, displayName: undefined }
}

export async function encryptIdentity(
    identity: Identity,
    pin: string
): Promise<{ encrypted: Uint8Array; salt: Uint8Array }> {
    await _sodium.ready
    const sodium = _sodium

    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
    const key = sodium.crypto_pwhash(
        sodium.crypto_secretbox_KEYBYTES,
        pin,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_ARGON2ID13
    )

    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

    // Serialize Identity to JSON string, then encrypt
    const serialized = JSON.stringify({
        publicKey: Array.from(identity.publicKey),
        privateKey: Array.from(identity.privateKey),
        peerId: identity.peerId,
        fingerprint: identity.fingerprint,
    })

    const ciphertext = sodium.crypto_secretbox_easy(
        new TextEncoder().encode(serialized),
        nonce,
        key
    )

    const encryptedData = new Uint8Array(nonce.length + ciphertext.length)
    encryptedData.set(nonce)
    encryptedData.set(ciphertext, nonce.length)

    return { encrypted: encryptedData, salt }
}

export async function decryptIdentity(
    encryptedData: Uint8Array,
    salt: Uint8Array,
    pin: string
): Promise<Identity> {
    await _sodium.ready
    const sodium = _sodium

    const key = sodium.crypto_pwhash(
        sodium.crypto_secretbox_KEYBYTES,
        pin,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_ARGON2ID13
    )

    const nonce = encryptedData.slice(0, sodium.crypto_secretbox_NONCEBYTES)
    const ciphertext = encryptedData.slice(sodium.crypto_secretbox_NONCEBYTES)

    const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key)

    if (!decryptedBytes) {
        throw new Error('Invalid PIN or corrupted data')
    }

    const decryptedString = new TextDecoder().decode(decryptedBytes)
    const parsed = JSON.parse(decryptedString)

    return {
        publicKey: new Uint8Array(parsed.publicKey),
        privateKey: new Uint8Array(parsed.privateKey),
        peerId: parsed.peerId,
        fingerprint: parsed.fingerprint,
    }
}
