import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui/button'

export interface SandboxModalProps {
    blob: Blob | null
    filename: string
    onClose: () => void
}

export function SandboxModal({ blob, filename, onClose }: SandboxModalProps) {
    const [url, setUrl] = useState<string>('')

    useEffect(() => {
        if (blob) {
            const objectUrl = URL.createObjectURL(blob)
            setUrl(objectUrl)
            return () => URL.revokeObjectURL(objectUrl)
        }
    }, [blob])

    if (!blob || !url) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in-0 p-4 sm:p-8">
            <div className="bg-background border shadow-xl rounded-xl w-full h-full flex flex-col overflow-hidden max-w-6xl max-h-[90vh] animate-in zoom-in-95">
                {/* Header Container isolated from iframe */}
                <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                    <div className="flex flex-col">
                        <span className="font-semibold text-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></span>
                            Secure Sandbox Environment
                        </span>
                        <span className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-sm">
                            {filename}
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* The Isolated Iframe */}
                {/* Important constraints: No 'allow-same-origin', ensuring zero access to parent Contexts, cookies, IndexedDB, or localStorage. */}
                <div className="flex-1 w-full bg-white relative">
                    <iframe
                        src={url}
                        className="w-full h-full border-0 absolute inset-0 text-black"
                        sandbox="allow-scripts allow-forms allow-popups"
                        title="Sandboxed content"
                    />
                </div>
            </div>
        </div>
    )
}
