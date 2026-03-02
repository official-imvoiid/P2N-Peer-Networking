// Unpack logic
import * as ed from '@noble/ed25519'
import baseX from 'base-x'
import { unpackCapabilities, type CapabilityFlags } from './scct'

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const bs58 = baseX(BASE58)

export interface ParsedToken {
    publicKey: Uint8Array
    ip: string
    port: number
    timestamp: number
    capabilities: CapabilityFlags
    path?: string
    isValid: boolean
    isExpired: boolean
    peerId: string
    fingerprint: string
}

function bytesToIp(bytes: Uint8Array): string {
    // Check if IPv4-mapped IPv6
    if (bytes[10] === 0xff && bytes[11] === 0xff) {
        return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`
    }
    // Else simple IPv6 string parsing (rudimentary)
    const blocks: string[] = []
    for (let i = 0; i < 16; i += 2) {
        const val = (bytes[i] << 8) | bytes[i + 1]
        blocks.push(val.toString(16))
    }
    return blocks.join(':')
}

export async function parseToken(tokenStr: string): Promise<ParsedToken> {
    if (!tokenStr.startsWith('ftps://')) {
        throw new Error('Invalid token scheme')
    }

    const encoded = tokenStr.replace('ftps://', '')
    const bytes = bs58.decode(encoded)

    if (bytes.length < 57 + 64) {
        throw new Error('Token payload too short')
    }

    const payloadLength = bytes.length - 64
    const payload = bytes.slice(0, payloadLength)
    const signature = bytes.slice(payloadLength)

    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
    const version = view.getUint8(0)
    if (version !== 1) throw new Error('Unsupported token version')

    const publicKey = new Uint8Array(payload.slice(1, 33))
    const ipBytes = new Uint8Array(payload.slice(33, 49))
    const port = view.getUint16(49, false)
    const timestamp = view.getUint32(51, false)
    const capFlags = view.getUint16(55, false)

    const capabilities = unpackCapabilities(capFlags)
    let path: string | undefined

    if (capabilities.hasPath) {
        const pathLen = view.getUint8(57)
        const pathBytes = new Uint8Array(payload.slice(58, 58 + pathLen))
        path = new TextDecoder().decode(pathBytes)
    }

    // Verify signature
    const isValid = await ed.verifyAsync(signature, payload, publicKey)

    // Check expiry (15 mins = 900 seconds)
    const now = Math.floor(Date.now() / 1000)
    const isExpired = (now - timestamp) > 900

    // Reconstruct PeerId hash (we import this algorithm from identity standard)
    // using sodium for consistency or sha256 natively depending on what we configured
    let peerId = ''
    let fingerprint = ''
    try {
        const { sha256 } = await import('@noble/hashes/sha2')
        peerId = bs58.encode(sha256(publicKey))
        fingerprint = peerId.slice(0, 8)
    } catch {
        // if libsodium
        const sodium = (await import('libsodium-wrappers')).default
        await sodium.ready
        peerId = bs58.encode(new Uint8Array(sodium.crypto_hash_sha256(publicKey)))
        fingerprint = peerId.slice(0, 8)
    }

    return {
        publicKey,
        ip: bytesToIp(ipBytes),
        port,
        timestamp,
        capabilities,
        path,
        isValid,
        isExpired,
        peerId,
        fingerprint
    }
}
