import { useState, useCallback } from 'react'
import { useNetwork } from './NetworkContext'
import { parseToken } from '../scct/unpack'
import { multiaddr } from '@multiformats/multiaddr'

export function useConnection() {
    const { node } = useNetwork()
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const connectToToken = useCallback(async (tokenStr: string) => {
        if (!node) {
            setError('Network node is not initialized yet.')
            return false
        }

        setIsConnecting(true)
        setError(null)

        try {
            const parsed = await parseToken(tokenStr)

            if (!parsed.isValid) {
                throw new Error('Invalid token signature.')
            }
            if (parsed.isExpired) {
                throw new Error('Token has expired.')
            }

            // Construct the multiaddr. For this module, we assume WebSockets are available 
            // on the peer's IP and Port for initial bootstrapping.
            // In a fully decentralized WebRTC environment, this might transit through a relay.
            const maStr = `/ip4/${parsed.ip}/tcp/${parsed.port}/ws/p2p/${parsed.peerId}`
            const ma = multiaddr(maStr)

            console.log(`Dialing peer at ${maStr}...`)
            await node.dial(ma)
            console.log(`[FTPS] Successfully connected to ${parsed.peerId}`)
            console.log(`[FTPS] Granted Capabilities:`, parsed.capabilities)
            if (parsed.capabilities.hasPath) {
                console.log(`[FTPS] Constrained Path: ${parsed.path}`)
            }

            setIsConnecting(false)
            return parsed

        } catch (err: any) {
            console.error('Connection failed:', err)
            setError(err.message || 'Failed to connect to peer.')
            setIsConnecting(false)
            return false
        }
    }, [node])

    return {
        connectToToken,
        isConnecting,
        error
    }
}
