import { useState } from 'react'
import { generateIdentity, encryptIdentity } from './identity'
import { getDB } from '../storage/db'
import { useIdentity } from './IdentityContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function IdentityOnboarding() {
    const [passphrase, setPassphrase] = useState('')
    const [pin, setPin] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [loading, setLoading] = useState(false)
    const { setIdentity } = useIdentity()

    const handleCreate = async () => {
        if (!passphrase || !pin) return
        if (pin.length < 6) {
            alert('PIN must be at least 6 characters')
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

            setIdentity(identity)
            window.location.reload() // Refresh to load locked state properly
        } catch (err) {
            console.error('Failed to create identity', err)
            alert('Error creating identity')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full max-w-md mx-auto mt-20">
            <CardHeader>
                <CardTitle>Create Identity</CardTitle>
                <CardDescription>
                    Enter a highly secure passphrase to generate your FTPS identity.
                    This IS your identity. If lost, you cannot recover it.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <label className="text-sm font-medium">Passphrase</label>
                    <Input
                        type="password"
                        placeholder="e.g. sunset coffee thursday..."
                        value={passphrase}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassphrase(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Local PIN (for daily unlock)</label>
                    <Input
                        type="password"
                        placeholder="6+ characters"
                        value={pin}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Display Name (Optional)</label>
                    <Input
                        type="text"
                        placeholder="Anonymous"
                        value={displayName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                    />
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={loading || !passphrase || pin.length < 6}>
                    {loading ? 'Generating...' : 'Create Identity'}
                </Button>
            </CardContent>
        </Card>
    )
}
