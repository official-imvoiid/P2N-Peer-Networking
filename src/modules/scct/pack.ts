import * as ed from '@noble/ed25519'
import baseX from 'base-x'
import { ipToBytes, packCapabilities, type CapabilityFlags } from './scct'

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const bs58 = baseX(BASE58)

export async function createToken(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
    ip: string,
    port: number,
    capabilities: CapabilityFlags,
    path?: string
): Promise<string> {
    const version = 1
    const ipBytes = ipToBytes(ip)

    // Allocate max possible payload
    const pathBytes = path ? new TextEncoder().encode(path) : new Uint8Array(0)
    if (pathBytes.length > 255) throw new Error('Path too long for SCCT token')
    capabilities.hasPath = pathBytes.length > 0

    // Buffer size: 1(ver) + 32(pubkey) + 16(ip) + 2(port) + 4(time) + 2(cap) = 57 bytes base head
    // + 1(pathlen)? + pathLen
    let bufferLen = 57
    if (capabilities.hasPath) {
        bufferLen += 1 + pathBytes.length
    }

    const payload = new Uint8Array(bufferLen)
    const view = new DataView(payload.buffer)

    view.setUint8(0, version)
    payload.set(publicKey, 1)
    payload.set(ipBytes, 33)

    view.setUint16(49, port, false)

    const timestamp = Math.floor(Date.now() / 1000)
    view.setUint32(51, timestamp, false)

    const capFlags = packCapabilities(capabilities)
    view.setUint16(55, capFlags, false)

    if (capabilities.hasPath) {
        view.setUint8(57, pathBytes.length)
        payload.set(pathBytes, 58)
    }

    const signature = await ed.signAsync(payload, privateKey)

    // Final token buffer is payload + 64 bytes signature
    const finalBuffer = new Uint8Array(payload.length + signature.length)
    finalBuffer.set(payload)
    finalBuffer.set(signature, payload.length)

    const encoded = bs58.encode(finalBuffer)
    return `ftps://${encoded}`
}
