import React, { createContext, useContext, useState, useEffect } from 'react'
import { getDB } from '../storage/db'
import { type Identity, decryptIdentity } from './identity'

interface IdentityContextState {
    identity: Identity | null
    hasStoredIdentity: boolean
    isLocked: boolean
    isLoading: boolean
    setIdentity: (id: Identity | null) => void
    completeOnboarding: (id: Identity) => void
    unlock: (pin: string) => Promise<boolean>
    logout: () => void
    clearIdentity: () => Promise<void>
}

const IdentityContext = createContext<IdentityContextState | undefined>(undefined)

export function IdentityProvider({ children }: { children: React.ReactNode }) {
    const [identity, setIdentity] = useState<Identity | null>(null)
    const [hasStoredIdentity, setHasStoredIdentity] = useState(false)
    const [isLocked, setIsLocked] = useState(true)
    const [isLoading, setIsLoading] = useState(true)

    // Auto-lock after 15 minutes of idle
    useEffect(() => {
        if (!identity || isLocked) return

        let timeout: NodeJS.Timeout
        const resetTimer = () => {
            clearTimeout(timeout)
            timeout = setTimeout(() => {
                logout()
            }, 15 * 60 * 1000) // 15 mins
        }

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
        events.forEach((val) => document.addEventListener(val, resetTimer))
        resetTimer()

        // Page visibility
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                // Optional: immediately lock on hide, but spec says "configurable". For now, just rely on timer.
            } else {
                resetTimer()
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            clearTimeout(timeout)
            events.forEach((val) => document.removeEventListener(val, resetTimer))
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [identity, isLocked])

    useEffect(() => {
        async function checkStorage() {
            try {
                const db = await getDB()
                const stored = await db.get('identity', 'primary')
                if (stored) {
                    setHasStoredIdentity(true)
                }
            } catch (err) {
                console.error('Failed to check storage', err)
            } finally {
                setIsLoading(false)
            }
        }
        checkStorage()
    }, [])

    const unlock = async (pin: string) => {
        try {
            const db = await getDB()
            const stored = await db.get('identity', 'primary')
            if (!stored) return false

            const decrypted = await decryptIdentity(stored.encryptedKeypair, stored.salt, pin)
            setIdentity(decrypted)
            setIsLocked(false)
            return true
        } catch (err) {
            console.error('Unlock failed', err)
            return false
        }
    }

    const completeOnboarding = (id: Identity) => {
        setIdentity(id)
        setHasStoredIdentity(true)
        setIsLocked(false)
    }

    const logout = () => {
        setIdentity(null)
        setIsLocked(true)
    }

    const clearIdentity = async () => {
        const db = await getDB()
        await db.delete('identity', 'primary')
        setIdentity(null)
        setHasStoredIdentity(false)
        setIsLocked(true)
    }

    return (
        <IdentityContext.Provider value={{ identity, hasStoredIdentity, isLocked, isLoading, setIdentity, completeOnboarding, unlock, logout, clearIdentity }}>
            {children}
        </IdentityContext.Provider>
    )
}

export function useIdentity() {
    const context = useContext(IdentityContext)
    if (context === undefined) {
        throw new Error('useIdentity must be used within an IdentityProvider')
    }
    return context
}
