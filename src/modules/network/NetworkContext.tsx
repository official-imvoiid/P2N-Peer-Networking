import React, { createContext, useContext, useState, useEffect } from 'react'
import { type Libp2p } from 'libp2p'
import { createPeerNode } from './network'
import { useIdentity } from '../identity/IdentityContext'

interface NetworkContextState {
    node: Libp2p | null
    isStarting: boolean
    peersConnected: number
    activePeers: string[] // List of base58 peer IDs
}

const NetworkContext = createContext<NetworkContextState | undefined>(undefined)

export function NetworkProvider({ children }: { children: React.ReactNode }) {
    const { identity } = useIdentity()
    const [node, setNode] = useState<Libp2p | null>(null)
    const [isStarting, setIsStarting] = useState(false)
    const [peersConnected, setPeersConnected] = useState(0)
    const [activePeers, setActivePeers] = useState<string[]>([])

    useEffect(() => {
        if (!identity) {
            // Stop node if identity is lost (e.g. logged out)
            if (node) {
                const stopNode = async () => {
                    await node.stop()
                    setNode(null)
                    setActivePeers([])
                    setPeersConnected(0)
                }
                stopNode()
            }
            return
        }

        let mounted = true
        let libp2pNode: any = null

        const updatePeers = () => {
            if (!libp2pNode || !mounted) return
            const peers = libp2pNode.getPeers()
            setPeersConnected(peers.length)
            setActivePeers(peers.map((p: any) => p.toString()))
        }

        const startNode = async () => {
            setIsStarting(true)
            try {
                libp2pNode = await createPeerNode(identity)
                await libp2pNode.start()

                if (mounted) {
                    setNode(libp2pNode)

                    libp2pNode.addEventListener('peer:connect', () => {
                        updatePeers()
                    })

                    libp2pNode.addEventListener('peer:disconnect', () => {
                        updatePeers()
                    })

                    // Initial update in case peers discover immediately (e.g. mDNS)
                    updatePeers()
                    const { initFileHandler } = await import('../files/transfer')
                    initFileHandler(
                        libp2pNode,
                        (metadata) => {
                            // File incoming start
                            console.log('Incoming file started:', metadata.name)
                            // We can use custom events to dispatch to UI components 
                            // to keep the context clean without rapid re-renders on chunks.
                            window.dispatchEvent(new CustomEvent('ftps:file:start', { detail: metadata }))
                        },
                        (id, received) => {
                            window.dispatchEvent(new CustomEvent('ftps:file:progress', { detail: { id, received } }))
                        },
                        (id, blob) => {
                            window.dispatchEvent(new CustomEvent('ftps:file:complete', { detail: { id, blob } }))
                        }
                    )
                } else {
                    await libp2pNode?.stop()
                }
            } catch (err) {
                console.error('Failed to start libp2p node:', err)
            } finally {
                if (mounted) setIsStarting(false)
            }
        }

        startNode()

        return () => {
            mounted = false
            if (libp2pNode) {
                // Ensure we don't return unhandled promises
                const stopNode = async () => {
                    try {
                        await libp2pNode?.stop()
                    } catch (e) {
                        console.error(e)
                    }
                }
                stopNode()
            }
        }
    }, [identity])

    return (
        <NetworkContext.Provider value={{ node, isStarting, peersConnected, activePeers }}>
            {children}
        </NetworkContext.Provider>
    )
}

export function useNetwork() {
    const context = useContext(NetworkContext)
    if (context === undefined) {
        throw new Error('useNetwork must be used within a NetworkProvider')
    }
    return context
}
