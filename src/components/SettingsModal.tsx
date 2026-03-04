import { useState, useRef } from 'react'
import { useIdentity } from '@/modules/identity/IdentityContext'
import { exportIdentityBackup, importIdentityBackup } from '@/modules/identity/identity'
import { getDB } from '@/modules/storage/db'
import { encryptIdentity } from '@/modules/identity/identity'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Download, Upload, AlertTriangle } from 'lucide-react'

export function SettingsModal({ children }: { children?: React.ReactNode }) {
    const { identity, completeOnboarding } = useIdentity()
    const [passphrase, setPassphrase] = useState('')
    const [importMode, setImportMode] = useState(false)
    const [importPin, setImportPin] = useState('')
    const [error, setError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleExport = async () => {
        if (!identity) return
        if (!passphrase) {
            setError('Provide a passphrase to encrypt your backup')
            return
        }
        setError('')
        try {
            const backupStr = await exportIdentityBackup(identity, passphrase)
            const blob = new Blob([backupStr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `ftps-identity-${identity.fingerprint}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            setPassphrase('')
        } catch (err) {
            setError('Export failed: ' + (err as Error).message)
        }
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !passphrase || !importPin) {
            setError('Passphrase and new PIN required to import')
            return
        }
        setError('')
        try {
            const text = await file.text()
            const importedId = await importIdentityBackup(text, passphrase)

            // Re-encrypt it locally using the new PIN
            const db = await getDB()
            const { encrypted, salt } = await encryptIdentity(importedId, importPin)
            await db.put('identity', { id: 'primary', encryptedKeypair: encrypted, salt }, 'primary')

            completeOnboarding(importedId)
            setImportMode(false)
            setPassphrase('')
            setImportPin('')
            if (fileInputRef.current) fileInputRef.current.value = ''
        } catch (err) {
            setError('Import failed: ' + (err as Error).message)
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                {children || (
                    <Button variant="ghost" size="icon">
                        <Settings className="w-5 h-5 text-muted-foreground mr-2" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-slate-900 text-slate-100 border-slate-800">
                <DialogHeader>
                    <DialogTitle>FTPS Settings & Identity Manager</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Manage your local peer-to-peer identity.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                    {/* Export Section */}
                    <div className="space-y-2 border border-slate-800 p-4 rounded-lg bg-slate-950/50">
                        <h4 className="font-semibold flex items-center gap-2">
                            <Download className="w-4 h-4" /> Export Identity
                        </h4>
                        <p className="text-xs text-slate-400">
                            Download a backup of your identity encrypted with a passphrase.
                        </p>
                        <div className="flex gap-2 items-center">
                            <Input
                                type="password"
                                placeholder="Backup Passphrase"
                                value={!importMode ? passphrase : ''}
                                onChange={(e) => {
                                    setImportMode(false)
                                    setPassphrase(e.target.value)
                                }}
                                className="bg-slate-900 border-slate-700"
                            />
                            <Button onClick={handleExport} disabled={!passphrase || importMode || !identity} variant="secondary">
                                Export
                            </Button>
                        </div>
                    </div>

                    {/* Import Section */}
                    <div className="space-y-4 border border-slate-800 p-4 rounded-lg bg-slate-950/50">
                        <h4 className="font-semibold flex items-center gap-2 text-yellow-500">
                            <AlertTriangle className="w-4 h-4" /> Import Identity
                        </h4>
                        <p className="text-xs text-slate-400">
                            Restore an identity backup. This overrides your current identity immediately!
                        </p>
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="Decryption Passphrase"
                                value={importMode ? passphrase : ''}
                                onChange={(e) => {
                                    setImportMode(true)
                                    setPassphrase(e.target.value)
                                }}
                                className="bg-slate-900 border-slate-700"
                            />
                            <Input
                                type="password"
                                placeholder="New Local PIN"
                                value={importPin}
                                onChange={(e) => setImportPin(e.target.value)}
                                className="bg-slate-900 border-slate-700"
                                maxLength={6}
                            />
                            <div className="flex justify-between items-center mt-2">
                                <Label htmlFor="import-file" className="text-xs text-muted-foreground cursor-pointer bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded">
                                    <Upload className="w-4 h-4 inline mr-2" /> Select JSON Backup
                                </Label>
                                <input
                                    id="import-file"
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleImport}
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 bg-red-950/30 p-2 rounded">{error}</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
