import { useState, useCallback, useEffect } from 'react'

const MUTE_LIST_KEY = 'ftps_mutelist'

export function useMuteList() {
    const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set())

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(MUTE_LIST_KEY)
            if (raw) {
                const arr = JSON.parse(raw)
                if (Array.isArray(arr)) {
                    setMutedPeers(new Set(arr))
                }
            }
        } catch (e) {
            console.error('Failed to load mute list', e)
        }
    }, [])

    // Sync to localStorage
    const saveList = (newSet: Set<string>) => {
        try {
            localStorage.setItem(MUTE_LIST_KEY, JSON.stringify(Array.from(newSet)))
        } catch (e) {
            console.error('Failed to save mute list', e)
        }
    }

    const mutePeer = useCallback((peerId: string) => {
        setMutedPeers(prev => {
            const next = new Set(prev)
            next.add(peerId)
            saveList(next)
            return next
        })
    }, [])

    const unmutePeer = useCallback((peerId: string) => {
        setMutedPeers(prev => {
            const next = new Set(prev)
            next.delete(peerId)
            saveList(next)
            return next
        })
    }, [])

    const isMuted = useCallback((peerId: string) => {
        return mutedPeers.has(peerId)
    }, [mutedPeers])

    return {
        mutedPeers,
        mutePeer,
        unmutePeer,
        isMuted
    }
}
