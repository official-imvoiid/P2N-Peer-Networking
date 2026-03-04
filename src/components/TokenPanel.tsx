import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useIdentity } from '@/modules/identity/IdentityContext'
import { discoverPublicIP, type CapabilityFlags } from '@/modules/scct/scct'
import { createToken } from '@/modules/scct/pack'
import { useConnection } from '@/modules/network/useConnection'

export function TokenPanel() {
    const { identity } = useIdentity()
    const { connectToToken, isConnecting, error: connectError } = useConnection()
    const [token, setToken] = useState<string>('')
    const [expiresIn, setExpiresIn] = useState(900)
    const [loading, setLoading] = useState(false)
    const [qrVisible, setQrVisible] = useState(false)

    // Connect State
    const [connectTokenText, setConnectTokenText] = useState('')
    const [connectStatus, setConnectStatus] = useState<'idle' | 'connected'>('idle')

    // Capability State
    const [allowRead, setAllowRead] = useState(true)
    const [allowWrite, setAllowWrite] = useState(true)
    const [inviteOnly, setInviteOnly] = useState(false)
    const [requirePath, setRequirePath] = useState(false)
    const [targetPath, setTargetPath] = useState('')

    const generateNewToken = async () => {
        if (!identity) return
        setLoading(true)
        try {
            const ip = await discoverPublicIP()
            const capabilities: CapabilityFlags = {
                read: allowRead,
                write: allowWrite,
                hasPath: requirePath,
                inviteOnly: inviteOnly
            }

            // Assume default FTPS port is 4001 or extracted from network layer eventually
            // pack.ts createToken will need to support 'path' argument in the future, 
            // for now we encode the basic boolean flags.
            const t = await createToken(identity.privateKey, identity.publicKey, ip, 4001, capabilities, requirePath ? targetPath : undefined)
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
        if (!connectTokenText.trim()) return

        const success = await connectToToken(connectTokenText.trim())
        if (success) {
            setConnectStatus('connected')
            setConnectTokenText('') // clear on success
            setTimeout(() => setConnectStatus('idle'), 3000)
        }
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
                        <div className="space-y-4">
                            <div className="space-y-3 p-3 border rounded-md bg-muted/20">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capabilities</span>

                                <div className="space-y-2 text-sm">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={allowRead} onChange={(e) => setAllowRead(e.target.checked)} className="rounded border-input text-primary focus:ring-primary h-4 w-4" />
                                        Allow Read (Chat/Receive Files)
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} className="rounded border-input text-primary focus:ring-primary h-4 w-4" />
                                        Allow Write (Send Files)
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={inviteOnly} onChange={(e) => setInviteOnly(e.target.checked)} className="rounded border-input text-primary focus:ring-primary h-4 w-4" />
                                        Invite Only (Cannot relay)
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={requirePath} onChange={(e) => setRequirePath(e.target.checked)} className="rounded border-input text-primary focus:ring-primary h-4 w-4" />
                                        Restrict to specific path/room
                                    </label>
                                </div>

                                {requirePath && (
                                    <div className="pt-2">
                                        <Input
                                            placeholder="/room-name or /shared-folder"
                                            value={targetPath}
                                            onChange={(e) => setTargetPath(e.target.value)}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                )}
                            </div>

                            <Button onClick={generateNewToken} disabled={loading} className="w-full">
                                {loading ? 'Discovering network...' : 'Generate Access Token'}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-3 bg-muted rounded-md border font-mono text-xs break-all relative">
                                {token.length > 80 ? token.substring(0, 80) + '...' : token}
                            </div>

                            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center text-sm gap-3">
                                <span className={expiresIn < 120 ? "text-destructive font-bold" : "text-muted-foreground"}>
                                    Expires in: {formatTime(expiresIn)}
                                </span>
                                <div className="space-x-2 flex flex-wrap gap-y-2">
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
                        value={connectTokenText}
                        onChange={(e) => setConnectTokenText(e.target.value)}
                        disabled={isConnecting}
                    />
                    {connectError && (
                        <p className="text-xs text-destructive">{connectError}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                        <Button onClick={handleConnect} disabled={!connectTokenText || isConnecting}>
                            {isConnecting ? 'Connecting...' : 'Connect'}
                        </Button>
                        {connectStatus === 'connected' && (
                            <span className="text-sm font-medium text-green-500">
                                CONNECTED
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
