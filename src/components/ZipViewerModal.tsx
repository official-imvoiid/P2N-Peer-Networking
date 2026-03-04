import { useState, useEffect } from 'react'
import { unzipSync, strFromU8 } from 'fflate'
import { X, File, FileText, Image as ImageIcon, FolderArchive, ArrowLeft } from 'lucide-react'
import { Button } from './ui/button'

export interface ZipViewerModalProps {
    blob: Blob | null
    filename: string
    onClose: () => void
}

export function ZipViewerModal({ blob, filename, onClose }: ZipViewerModalProps) {
    const [files, setFiles] = useState<Record<string, Uint8Array>>({})
    const [selectedFile, setSelectedFile] = useState<string | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!blob) return

        const parseZip = async () => {
            try {
                const arrayBuffer = await blob.arrayBuffer()
                const data = new Uint8Array(arrayBuffer)
                const unzipped = unzipSync(data)

                // Filter out directories (usually end in / and have 0 bytes in fflate basic usage, 
                // but fflate actually just returns the flat list of file paths as keys)
                const validFiles: Record<string, Uint8Array> = {}
                for (const path in unzipped) {
                    if (unzipped[path].length > 0) {
                        validFiles[path] = unzipped[path]
                    }
                }

                setFiles(validFiles)
            } catch (err) {
                console.error("Zip parse error:", err)
                setError('Failed to extract archive. It may be corrupted or password protected.')
            }
        }

        parseZip()
    }, [blob])

    if (!blob) return null

    const renderFileContent = (path: string, data: Uint8Array) => {
        const ext = path.split('.').pop()?.toLowerCase() || ''

        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
            const blob = new Blob([data.buffer as ArrayBuffer], { type: `image/${ext === 'svg' ? 'svg+xml' : ext}` })
            const url = URL.createObjectURL(blob)
            return <img src={url} alt={path} className="max-w-full max-h-full object-contain mx-auto" onLoad={() => URL.revokeObjectURL(url)} />
        }

        if (['txt', 'md', 'json', 'csv', 'js', 'ts', 'html', 'css', 'yml', 'yaml'].includes(ext)) {
            const text = strFromU8(data)
            return <pre className="p-4 bg-muted/30 text-xs font-mono whitespace-pre-wrap overflow-auto h-full rounded">{text}</pre>
        }

        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
                <File className="w-16 h-16 opacity-50" />
                <p>Preview not available for .{ext} files</p>
                <Button onClick={() => {
                    const blob = new Blob([data.buffer as ArrayBuffer])
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = path.split('/').pop() || 'download'
                    a.click()
                    URL.revokeObjectURL(url)
                }}>
                    Download File Instead
                </Button>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8">
            <div className="bg-background border shadow-xl rounded-xl w-full h-full flex flex-col overflow-hidden max-w-4xl max-h-[85vh]">
                <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                        <FolderArchive className="w-4 h-4 text-orange-400" />
                        {selectedFile ? (
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-6 w-6 mr-1" onClick={() => setSelectedFile(null)}>
                                    <ArrowLeft className="w-3 h-3" />
                                </Button>
                                <span className="opacity-60">{filename} /</span>
                                <span className="truncate max-w-[200px]">{selectedFile.split('/').pop()}</span>
                            </div>
                        ) : (
                            <span className="truncate max-w-[300px]">{filename}</span>
                        )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-hidden relative bg-slate-950">
                    {error ? (
                        <div className="p-8 text-center text-destructive">{error}</div>
                    ) : selectedFile ? (
                        <div className="h-full w-full p-4 overflow-auto">
                            {renderFileContent(selectedFile, files[selectedFile])}
                        </div>
                    ) : (
                        <div className="p-2 overflow-auto h-full">
                            {Object.entries(files).length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground animate-pulse">Extracting contents...</div>
                            ) : (
                                <ul className="space-y-1 p-2">
                                    {Object.keys(files).sort().map(path => {
                                        const ext = path.split('.').pop()?.toLowerCase() || ''
                                        const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
                                        const isText = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'html', 'css', 'yml', 'yaml'].includes(ext)

                                        return (
                                            <li key={path}>
                                                <button
                                                    onClick={() => setSelectedFile(path)}
                                                    className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-900 flex items-center gap-3 text-sm transition-colors border border-transparent hover:border-slate-800"
                                                >
                                                    {isImg ? <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" /> :
                                                        isText ? <FileText className="w-4 h-4 text-green-400 shrink-0" /> :
                                                            <File className="w-4 h-4 text-slate-500 shrink-0" />}
                                                    <span className="truncate flex-1">{path}</span>
                                                    <span className="text-xs text-slate-500 shrink-0">
                                                        {(files[path].length / 1024).toFixed(1)} KB
                                                    </span>
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
