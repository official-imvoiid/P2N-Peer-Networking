import { createLibp2p } from 'libp2p'
import type { Libp2p } from '@libp2p/interface'
import { webSockets } from '@libp2p/websockets'
import { webRTC, webRTCDirect } from '@libp2p/webrtc'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { kadDHT } from '@libp2p/kad-dht'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { createFromPrivKey } from '@libp2p/peer-id-factory'
import { autoNAT } from '@libp2p/autonat'
import { ping } from '@libp2p/ping'
import { mdns } from '@libp2p/mdns'
import { bootstrap } from '@libp2p/bootstrap'
import { type Identity } from '../identity/identity'

// Standard libp2p public bootstrap nodes for testing/discovery (user-configurable later)
export const DEFAULT_BOOTSTRAP_NODES = [
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
]

export async function createPeerNode(identity: Identity, customBootstrapNodes?: string[]): Promise<Libp2p> {

    // Convert to unencrypted mock object if needed or map directly.  
    const peerId = await createFromPrivKey({
        type: 'Ed25519',
        key: identity.privateKey
    } as any)

    const node = await createLibp2p({
        privateKey: peerId as any,
        addresses: {
            listen: [
                '/webrtc',
                '/wss',
                '/ws'
            ]
        },
        transports: [
            webSockets(),
            webRTC(),
            webRTCDirect()
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        peerDiscovery: [
            mdns() as any,
            bootstrap({
                list: customBootstrapNodes || DEFAULT_BOOTSTRAP_NODES
            }) as any
        ],
        services: {
            identify: identify(),
            ping: ping(),
            autoNAT: autoNAT(),
            dht: kadDHT({
                clientMode: true,
                protocol: '/ftps/kad/1.0.0'
            }),
            pubsub: gossipsub({
                allowPublishToZeroTopicPeers: true,
                fallbackToFloodsub: true,
                emitSelf: false
            }) as any // Hack to bypass strict TS issues across dependency versions until unified
        },
        connectionManager: {
            maxConnections: 50
        }
    })

    return node as unknown as Libp2p
}
