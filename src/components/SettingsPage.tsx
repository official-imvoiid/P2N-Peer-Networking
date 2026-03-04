import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, Network, Download, Lock, Trash2 } from 'lucide-react'
import { useIdentity } from '@/modules/identity/IdentityContext'

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checked ? 'bg-primary' : 'bg-muted'}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    )
}

export function SettingsPage() {
    const { logout } = useIdentity()
    const [linkScanning, setLinkScanning] = useState(true)
    const [exifStripping, setExifStripping] = useState(true)
    const [autoLockMins, setAutoLockMins] = useState(15)

    const handleExportIdentity = useCallback(() => {
        alert('To export your identity, re-enter your passphrase. (Export feature coming soon)')
    }, [])

    const handleClearData = useCallback(() => {
        if (confirm('Clear all local data? This will permanently delete your identity and all session data.')) {
            indexedDB.deleteDatabase('ftps_db')
            localStorage.clear()
            window.location.reload()
        }
    }, [])

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
                <h2 className="text-xl font-bold mb-1">Settings</h2>
                <p className="text-sm text-muted-foreground">Configure your FTPS client</p>
            </div>

            {/* Security */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Security
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium">Auto-lock timer</div>
                            <div className="text-xs text-muted-foreground">Lock session after inactivity</div>
                        </div>
                        <select
                            value={autoLockMins}
                            onChange={e => setAutoLockMins(Number(e.target.value))}
                            className="bg-muted border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value={5}>5 minutes</option>
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>60 minutes</option>
                            <option value={0}>Never</option>
                        </select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium">Link safety scanning</div>
                            <div className="text-xs text-muted-foreground">Warn before opening external links</div>
                        </div>
                        <ToggleSwitch checked={linkScanning} onChange={setLinkScanning} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium">EXIF metadata stripping</div>
                            <div className="text-xs text-muted-foreground">Remove metadata from received images</div>
                        </div>
                        <ToggleSwitch checked={exifStripping} onChange={setExifStripping} />
                    </div>
                </CardContent>
            </Card>

            {/* Network */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Network className="h-4 w-4 text-primary" />
                        Network
                    </CardTitle>
                    <CardDescription className="text-xs">Bootstrap nodes used for peer discovery</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="space-y-1 font-mono text-xs text-muted-foreground bg-muted/50 rounded-md p-3 border border-border">
                        <div>/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN</div>
                        <div>/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa</div>
                        <div>/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb</div>
                    </div>
                    <p className="text-xs text-muted-foreground">Custom bootstrap node UI coming soon</p>
                </CardContent>
            </Card>

            {/* Transfer */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Download className="h-4 w-4 text-primary" />
                        Transfers
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Chunk size</div>
                        <select className="bg-muted border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                            <option>256 KB</option>
                            <option>512 KB</option>
                            <option>1 MB</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Max concurrent transfers</div>
                        <Input type="number" defaultValue={4} min={1} max={8} className="w-20 h-8 text-sm" />
                    </div>
                </CardContent>
            </Card>

            {/* Identity */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Lock className="h-4 w-4 text-primary" />
                        Identity
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={handleExportIdentity}>
                        Export Identity (encrypted backup)
                    </Button>
                    <Button variant="outline" size="sm" className="w-full" onClick={logout}>
                        Lock Session
                    </Button>
                    <Button variant="destructive" size="sm" className="w-full gap-2" onClick={handleClearData}>
                        <Trash2 className="h-3 w-3" />
                        Clear All Data
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
