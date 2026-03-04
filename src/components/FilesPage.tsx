import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderOpen, HardDrive, File, AlertCircle } from 'lucide-react'

export function FilesPage() {
    const [directoryHandle, setDirectoryHandle] = useState<any>(null)
    const [files, setFiles] = useState<{ name: string, size: number }[]>([])
    const [error, setError] = useState<string>('')

    const handleSelectFolder = async () => {
        try {
            if (!('showDirectoryPicker' in window)) {
                setError('Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.')
                return
            }

            // @ts-ignore
            const dirHandle = await window.showDirectoryPicker()
            setDirectoryHandle(dirHandle)
            setError('')

            const fileList = []
            // @ts-ignore
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile()
                    fileList.push({ name: file.name, size: file.size })
                }
            }
            // Sort alphabetically
            fileList.sort((a, b) => a.name.localeCompare(b.name))
            setFiles(fileList)

        } catch (err: any) {
            console.error('Failed to open directory:', err)
            // AbortError is fully expected if user cancels the picker
            if (err.name !== 'AbortError') {
                setError(err.message || 'Failed to open folder. Permissions may have been denied.')
            }
        }
    }

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">File System Manager</h1>
                    <p className="text-muted-foreground mt-1">Manage local folders shared directly to peers via FTPS capability tokens.</p>
                </div>

                {error && (
                    <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 flex gap-3 text-destructive">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <HardDrive className="h-5 w-5 text-primary" />
                            Local Directory Serving
                        </CardTitle>
                        <CardDescription>
                            Select a local folder on your computer to expose to authorized peers.
                            Folders remain shared only as long as this tab is open.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!directoryHandle ? (
                            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer" onClick={handleSelectFolder}>
                                <FolderOpen className="h-10 w-10 text-muted-foreground mb-4" />
                                <h3 className="font-medium">Click to Share a Local Folder</h3>
                                <p className="text-xs text-muted-foreground mt-1text-center">Browsers require explicit permission to read local files.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-muted rounded-md border">
                                    <div className="flex items-center gap-2 font-medium">
                                        <FolderOpen className="h-4 w-4 text-primary" />
                                        /{directoryHandle.name}
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => {
                                        setDirectoryHandle(null)
                                        setFiles([])
                                    }}>Stop Sharing</Button>
                                </div>

                                <div className="border rounded-md overflow-hidden">
                                    <div className="bg-muted px-4 py-2 border-b text-xs font-semibold text-muted-foreground grid grid-cols-[1fr_100px]">
                                        <div>Name</div>
                                        <div className="text-right">Size</div>
                                    </div>
                                    <div className="max-h-96 overflow-y-auto">
                                        {files.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-muted-foreground italic">Folder is empty.</div>
                                        ) : (
                                            files.map((f, i) => (
                                                <div key={i} className="px-4 py-2 text-sm border-b last:border-0 grid grid-cols-[1fr_100px] hover:bg-muted/50 items-center">
                                                    <div className="flex items-center gap-2 truncate pr-4">
                                                        <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        <span className="truncate">{f.name}</span>
                                                    </div>
                                                    <div className="text-right text-muted-foreground text-xs">
                                                        {formatBytes(f.size)}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>
        </div>
    )
}
