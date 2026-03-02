import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useIdentity } from '@/modules/identity/IdentityContext'
import { discoverPublicIP, type CapabilityFlags } from '@/modules/scct/scct'
import { createToken } from '@/modules/scct/pack'

export function TokenPanel() {
    const { identity } = useIdentity()
    const [token, setToken] = useState<string>('')
    const [expiresIn, setExpiresIn] = useState(900)
    const [loading, setLoading] = useState(false)
    const [qrVisible, setQrVisible] = useState(false)

    // Example Connect State
    const [connectToken, setConnectToken] = useState('')
    const [connectStatus, setConnectStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle')

    const generateNewToken = async () => {
        if (!identity) return
        setLoading(true)
        try {
            const ip = await discoverPublicIP()
            const capabilities: CapabilityFlags = {
                read: true,
                write: true,
                hasPath: false,
                inviteOnly: false
            }

            // Assume default FTPS port is 4001 or extracted from network layer eventually
            const t = await createToken(identity.privateKey, identity.publicKey, ip, 4001, capabilities)
            setToken(t)
            setExpiresIn(900) // Reset 15m timer
        } catch (err) {
            console.error('Failed to generate token', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        // Auto regenerate logic every 10 mins or if expired
        if (token && expiresIn > 0) {
            const timer = setInterval(() => setExpiresIn(prev => prev - 1), 1000)
            return () => clearInterval(timer)
        }
        if (expiresIn <= 0 && token) {
            generateNewToken()
        }
    }, [expiresIn, token])

    const handleConnect = async () => {
        setConnectStatus('connecting')
        // Connecting logic goes here via libp2p parsing token in later modules
        setTimeout(() => setConnectStatus('failed'), 2000) // stub
    }

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60)
        const s = sec % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-lg">
            <Card>
                <CardHeader>
                    <CardTitle>Your Connection Token</CardTitle>
                    <CardDescription>Share this token to allow a peer to connect directly to you.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!token ? (
                        <Button onClick={generateNewToken} disabled={loading} className="w-full">
                            {loading ? 'Discovering network...' : 'Generate Access Token'}
                        </Button>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-3 bg-muted rounded-md border font-mono text-xs break-all relative">
                                {token.length > 80 ? token.substring(0, 80) + '...' : token}
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span className={expiresIn < 120 ? "text-destructive font-bold" : "text-muted-foreground"}>
                                    Expires in: {formatTime(expiresIn)}
                                </span>
                                <div className="space-x-2">
                                    <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(token)}>
                                        Copy
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setQrVisible(!qrVisible)}>
                                        QR Code
                                    </Button>
                                    <Button variant="default" size="sm" onClick={generateNewToken}>
                                        Regenerate
                                    </Button>
                                </div>
                            </div>

                            {qrVisible && (
                                <div className="flex justify-center p-4 bg-white rounded-lg">
                                    <QRCodeSVG value={token} size={200} />
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Connect to Peer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        placeholder="Paste ftps:// token here..."
                        value={connectToken}
                        onChange={(e) => setConnectToken(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                        <Button onClick={handleConnect} disabled={!connectToken || connectStatus === 'connecting'}>
                            {connectStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                        </Button>
                        {connectStatus !== 'idle' && (
                            <span className={`text-sm font-medium ${connectStatus === 'connected' ? 'text-green-500' : 'text-destructive'
                                }`}>
                                {connectStatus.toUpperCase()}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
