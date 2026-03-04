import { useEffect } from 'react'
import { useIdentity } from '../modules/identity/IdentityContext'

export function RefreshGuard() {
    const { hasStoredIdentity, logout } = useIdentity()

    useEffect(() => {
        if (!hasStoredIdentity) return

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Cancel the event
            e.preventDefault()
            // Chrome requires returnValue to be set
            e.returnValue = ''
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            // 8D: Lock Mode on Refresh Attempt (Module 8 constraint)
            if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r') || (e.metaKey && e.key.toLowerCase() === 'r')) {
                logout()
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [hasStoredIdentity, logout])

    return null
}
