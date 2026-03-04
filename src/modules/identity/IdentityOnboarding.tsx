import { useState } from 'react'
import { generateIdentity, encryptIdentity } from './identity'
import { getDB } from '../storage/db'
import { useIdentity } from './IdentityContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, KeyRound, User, AlertTriangle } from 'lucide-react'

export function IdentityOnboarding() {
    const [passphrase, setPassphrase] = useState('')
    const [pin, setPin] = useState('')
    const [pinConfirm, setPinConfirm] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { completeOnboarding } = useIdentity()

    const handleCreate = async () => {
        setError('')
        if (!passphrase || !pin) return
        if (pin.length < 6) {
            setError('PIN must be at least 6 characters')
            return
        }
        if (pin !== pinConfirm) {
            setError('PINs do not match')
            return
        }

        setLoading(true)
        try {
            const identity = await generateIdentity(passphrase)
            const { encrypted, salt } = await encryptIdentity(identity, pin)

            const db = await getDB()
            await db.put('identity', {
                id: 'primary',
                encryptedKeypair: encrypted,
                salt,
                displayName
            })

            // Update context directly — no page reload needed
            completeOnboarding({ ...identity, displayName: displayName || undefined })
        } catch (err: any) {
            console.error('Failed to create identity', err)
            setError(`Error: ${err?.message || String(err)}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-center w-full h-full bg-background p-4">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />

            <div className="relative w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4 shadow-lg shadow-primary/10">
                        <Shield className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">FTPS</h1>
                    <p className="text-sm text-muted-foreground mt-1">Folder Transfer Privacy System</p>
                </div>

                {/* Card */}
                <div className="bg-card border border-border rounded-xl shadow-2xl p-6 space-y-5">
                    <div>
                        <h2 className="text-lg font-semibold">Create Your Identity</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Your passphrase deterministically generates your cryptographic identity. It is never stored.
                        </p>
                    </div>

                    {/* Warning */}
                    <div className="flex gap-2.5 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-200/80">
                            <strong className="text-yellow-300">Your identity IS your passphrase.</strong> If lost, your identity cannot be recovered. Write it down safely.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                <KeyRound className="h-3 w-3" />
                                Passphrase
                            </label>
                            <Input
                                type="password"
                                placeholder="e.g. sunset coffee thursday marble"
                                value={passphrase}
                                onChange={e => setPassphrase(e.target.value)}
                                className="bg-muted/50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Use a memorable phrase, not a password.</p>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                <Shield className="h-3 w-3" />
                                Local PIN (6+ characters)
                            </label>
                            <Input
                                type="password"
                                placeholder="Used to unlock your session"
                                value={pin}
                                onChange={e => setPin(e.target.value)}
                                className="bg-muted/50"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Confirm PIN</label>
                            <Input
                                type="password"
                                placeholder="Re-enter your PIN"
                                value={pinConfirm}
                                onChange={e => setPinConfirm(e.target.value)}
                                className="bg-muted/50"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                <User className="h-3 w-3" />
                                Display Name <span className="text-muted-foreground/60">(optional)</span>
                            </label>
                            <Input
                                type="text"
                                placeholder="Anonymous"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                className="bg-muted/50"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-xs text-destructive flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3" />
                            {error}
                        </p>
                    )}

                    <Button
                        className="w-full"
                        onClick={handleCreate}
                        disabled={loading || !passphrase || pin.length < 6 || pin !== pinConfirm}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Generating identity...
                            </span>
                        ) : 'Create Identity'}
                    </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-4">
                    100% local • No servers • Your keys never leave your device
                </p>
            </div>
        </div>
    )
}
