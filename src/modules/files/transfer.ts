import { type Libp2p } from '@libp2p/interface'
import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { concat } from 'uint8arrays/concat'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { multiaddr } from '@multiformats/multiaddr'

export const FILE_TRANSFER_PROTOCOL = '/ftps/file/1.0.0'

export interface FileMetadata {
    id: string
    name: string
    size: number
    mimeType: string
    senderName: string
}

export interface IncomingFileStatus {
    metadata: FileMetadata
    bytesReceived: number
    blob?: Blob
}

// Call this when the node starts up
export function initFileHandler(
    node: Libp2p,
    onIncomingFileStart: (meta: FileMetadata) => void,
    onIncomingFileProgress: (id: string, bytesReceived: number) => void,
    onIncomingFileComplete: (id: string, blob: Blob) => void
) {

    node.handle(FILE_TRANSFER_PROTOCOL, async ({ stream }) => {
        let metadata: FileMetadata | null = null
        const chunks: Uint8Array[] = []
        let received = 0

        try {
            await pipe(
                stream,
                lp.decode,
                async function (source) {
                    for await (const msg of source) {
                        if (!metadata) {
                            // First message is metadata
                            const jsonStr = uint8ArrayToString(msg.subarray())
                            metadata = JSON.parse(jsonStr) as FileMetadata
                            onIncomingFileStart(metadata)
                        } else {
                            // Subsequent messages are file chunks
                            const chunk = msg.subarray() // Get the actual Uint8Array from Uint8ArrayList
                            chunks.push(chunk)
                            received += chunk.byteLength
                            onIncomingFileProgress(metadata!.id, received)
                        }
                    }
                }
            )

            const finalMeta = metadata as FileMetadata | null
            if (finalMeta) {
                // Ensure array shape holds perfectly for BlobPart standard without typescript SharedArrayBuffer throwing an anomaly.
                const combined = concat(chunks)
                const standardizedBuffer = new Uint8Array(combined).buffer
                const blob = new Blob([standardizedBuffer], { type: finalMeta.mimeType })
                onIncomingFileComplete(finalMeta.id, blob)
            }
        } catch (err) {
            console.error('Error receiving file stream:', err)
        }
    })
}

// Helper to chunk a File object (e.g. 64KB chunks)
const CHUNK_SIZE = 64 * 1024

async function* fileToChunks(file: File, metadata: FileMetadata, onProgress: (bytesSent: number) => void) {
    // 1. Yield Metadata explicitly as the first length-prefixed packet
    const metaBytes = uint8ArrayFromString(JSON.stringify(metadata))
    yield metaBytes

    // 2. Yield file chunks
    let offset = 0
    while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE)
        const buffer = await slice.arrayBuffer()
        const chunk = new Uint8Array(buffer)
        yield chunk
        offset += chunk.byteLength
        onProgress(offset)
    }
}

export async function sendFileToPeer(
    node: Libp2p,
    peerIdStr: string,
    file: File,
    senderName: string,
    onProgress: (bytesSent: number) => void
): Promise<void> {

    // Dial the specific protocol
    // Convert peer base58 string to a p2p multiaddr structure which libp2p expects
    const targetAddr = multiaddr(`/p2p/${peerIdStr}`)
    const stream = await node.dialProtocol(targetAddr, FILE_TRANSFER_PROTOCOL)

    const metadata: FileMetadata = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        senderName
    }

    try {
        await pipe(
            fileToChunks(file, metadata, onProgress),
            lp.encode,
            stream
        )
    } catch (err) {
        console.error('Failed to send file stream:', err)
        throw err
    }
}
