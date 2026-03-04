import { useState } from 'react'
import { useIdentity } from '@/modules/identity/IdentityContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Lock } from 'lucide-react'

export function UnlockScreen() {
    const { unlock, clearIdentity } = useIdentity()
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [attempts, setAttempts] = useState(0)
    const MAX_ATTEMPTS = 5

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!pin) return

        setIsLoading(true)
        setError('')

        const success = await unlock(pin)
        if (!success) {
            const newAttempts = attempts + 1
            setAttempts(newAttempts)
            if (newAttempts >= MAX_ATTEMPTS) {
                await clearIdentity()
                // App will re-render and take user back to onboarding
            } else {
                setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempts remaining.`)
                setPin('')
            }
        }
        setIsLoading(false)
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Lock className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Session Locked</CardTitle>
                    <CardDescription>Enter your PIN to resume your session.</CardDescription>
                </CardHeader>
                <form onSubmit={handleUnlock}>
                    <CardContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="Enter PIN"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                disabled={isLoading}
                                className="text-center text-lg tracking-widest"
                                autoFocus
                            />
                            {error && <p className="text-sm text-destructive text-center">{error}</p>}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={!pin || isLoading}
                        >
                            {isLoading ? 'Unlocking...' : 'Unlock'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
