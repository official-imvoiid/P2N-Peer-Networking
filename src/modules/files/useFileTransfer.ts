import { useState, useEffect } from 'react'
import type { FileMetadata } from './transfer'

export interface TransferState {
    id: string
    metadata: FileMetadata
    progress: number // 0 to 100
    blob?: Blob
    isIncoming: boolean
    isComplete: boolean
}

export function useFileTransfer() {
    const [transfers, setTransfers] = useState<Record<string, TransferState>>({})

    useEffect(() => {
        const onStart = (e: any) => {
            const meta: FileMetadata = e.detail

            // 2. Module 4 Constraint: Block receiver from malicious files
            const dangerousExtensions = /\.(exe|bat|sh|cmd|ps1|vbs|msi)$/i
            if (dangerousExtensions.test(meta.name)) {
                console.warn(`Blocked incoming dangerous file: ${meta.name} from ${meta.senderName}`)
                return // Drop the transfer silently
            }

            setTransfers(prev => ({
                ...prev,
                [meta.id]: {
                    id: meta.id,
                    metadata: meta,
                    progress: 0,
                    isIncoming: true,
                    isComplete: false
                }
            }))
        }

        const onProgress = (e: any) => {
            const { id, received } = e.detail
            setTransfers(prev => {
                const xfer = prev[id]
                if (!xfer) return prev
                const progress = Math.round((received / xfer.metadata.size) * 100)
                return {
                    ...prev,
                    [id]: { ...xfer, progress }
                }
            })
        }

        const onComplete = (e: any) => {
            const { id, blob } = e.detail
            setTransfers(prev => {
                const xfer = prev[id]
                if (!xfer) return prev
                return {
                    ...prev,
                    [id]: { ...xfer, progress: 100, blob, isComplete: true }
                }
            })
        }

        window.addEventListener('ftps:file:start', onStart)
        window.addEventListener('ftps:file:progress', onProgress)
        window.addEventListener('ftps:file:complete', onComplete)

        return () => {
            window.removeEventListener('ftps:file:start', onStart)
            window.removeEventListener('ftps:file:progress', onProgress)
            window.removeEventListener('ftps:file:complete', onComplete)
        }
    }, [])

    const addOutgoingTransfer = (meta: FileMetadata) => {
        setTransfers(prev => ({
            ...prev,
            [meta.id]: {
                id: meta.id,
                metadata: meta,
                progress: 0,
                isIncoming: false,
                isComplete: false
            }
        }))
    }

    const updateOutgoingProgress = (id: string, sent: number, total: number) => {
        setTransfers(prev => {
            const xfer = prev[id]
            if (!xfer) return prev
            const progress = Math.round((sent / total) * 100)
            return {
                ...prev,
                [id]: { ...xfer, progress, isComplete: progress >= 100 }
            }
        })
    }

    // Helper to trigger a browser download
    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    return {
        transfers: Object.values(transfers),
        addOutgoingTransfer,
        updateOutgoingProgress,
        downloadBlob,
        clearTransfer: (id: string) => {
            setTransfers(prev => {
                const copy = { ...prev }
                delete copy[id]
                return copy
            })
        }
    }
}
