import React, { createContext, useContext, useState, useEffect } from 'react'
import { getDB } from '../storage/db'
import { type Identity, decryptIdentity } from './identity'

interface IdentityContextState {
    identity: Identity | null
    hasStoredIdentity: boolean
    isLocked: boolean
    isLoading: boolean
    setIdentity: (id: Identity | null) => void
    unlock: (pin: string) => Promise<boolean>
    logout: () => void
}

const IdentityContext = createContext<IdentityContextState | undefined>(undefined)

export function IdentityProvider({ children }: { children: React.ReactNode }) {
    const [identity, setIdentity] = useState<Identity | null>(null)
    const [hasStoredIdentity, setHasStoredIdentity] = useState(false)
    const [isLocked, setIsLocked] = useState(true)
    const [isLoading, setIsLoading] = useState(true)

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

    const logout = () => {
        setIdentity(null)
        setIsLocked(true)
    }

    return (
        <IdentityContext.Provider value={{ identity, hasStoredIdentity, isLocked, isLoading, setIdentity, unlock, logout }}>
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
