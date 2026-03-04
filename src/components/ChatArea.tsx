import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Paperclip, FileIcon, Download, X, Eye, VolumeX } from 'lucide-react'
import { useNetwork } from '@/modules/network/NetworkContext'
import { useIdentity } from '@/modules/identity/IdentityContext'
import { useChat } from '@/modules/chat/chat'
import { useFileTransfer } from '@/modules/files/useFileTransfer'
import { sendFileToPeer } from '@/modules/files/transfer'
import { useConnection } from '@/modules/network/useConnection'
import { SandboxModal } from './SandboxModal'
import { ZipViewerModal } from './ZipViewerModal'
import { useMuteList } from '@/modules/chat/useMuteList'

function ImageThumbnail({ blob, alt }: { blob: Blob, alt: string }) {
    const [url, setUrl] = useState<string>('')
    useEffect(() => {
        const objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        return () => URL.revokeObjectURL(objectUrl)
    }, [blob])

    if (!url) return <FileIcon className="h-8 w-8 text-muted-foreground shrink-0" />
    return <img src={url} alt={alt} className="h-10 w-10 object-cover rounded-md shrink-0 border border-border bg-muted/50" />
}

export function ChatArea() {
    const { peersConnected, isStarting, node } = useNetwork()
    const { identity } = useIdentity()
    const { messages, sendMessage } = useChat()
    const { transfers, addOutgoingTransfer, updateOutgoingProgress, downloadBlob, clearTransfer } = useFileTransfer()
    const { connectToToken } = useConnection()
    const { isMuted, mutePeer } = useMuteList()

    const [inputValue, setInputValue] = useState('')
    const [sandboxBlob, setSandboxBlob] = useState<{ blob: Blob, name: string } | null>(null)
    const [zipBlob, setZipBlob] = useState<{ blob: Blob, name: string } | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSend = () => {
        if (!inputValue.trim()) return
        sendMessage(inputValue, identity?.displayName || 'Anonymous')
        setInputValue('')
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend()
        }
    }

    const handleMessageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement
        const tokenBlock = target.closest('.p2p-token-block')
        if (tokenBlock) {
            const tokenStr = tokenBlock.getAttribute('data-token')
            if (tokenStr) {
                await connectToToken(tokenStr)
            }
        }
    }

    // Auto-scroll to bottom on new message
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !node || !identity) return

        // 1. Module 4 Constraint: Block Dangerous Extensions
        const dangerousExtensions = /\.(exe|bat|sh|cmd|ps1|vbs|msi)$/i
        if (dangerousExtensions.test(file.name)) {
            alert(`For security reasons, executable files (${file.name}) cannot be transferred over FTPS.`)
            if (fileInputRef.current) fileInputRef.current.value = ''
            return
        }

        const peers = node.getPeers()
        if (peers.length === 0) {
            alert("No peers connected to receive the file.")
            if (fileInputRef.current) fileInputRef.current.value = ''
            return
        }

        const senderName = identity.displayName || 'Anonymous'

        // Mock a metadata object to track outgoing 
        const meta = {
            id: crypto.randomUUID(), // Local ID tracker just for the initial UI
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            senderName
        }

        // This is a naive broadcast. In a real scenario, you might select a specific peer
        addOutgoingTransfer(meta)

        let hasError = false
        for (const peerId of peers) {
            try {
                await sendFileToPeer(node as any, peerId.toString(), file, senderName, (bytesSent) => {
                    updateOutgoingProgress(meta.id, bytesSent, file.size)
                })
            } catch (err) {
                console.error('Failed sending to peer:', peerId.toString(), err)
                hasError = true
            }
        }

        if (hasError) {
            // Let the error show up in console for now
        }

        // Reset input so the same file can be selected again if needed
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <div className="flex-1 flex flex-col h-full relative">
            {/* Header */}
            <header className="h-14 border-b border-border flex items-center px-4 bg-background shrink-0">
                <div className="flex flex-col">
                    <span className="font-semibold text-sm">Global Chat</span>
                    <span className="text-xs text-muted-foreground">{peersConnected} peers connected</span>
                </div>
            </header>

            {/* Message History (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col" onClick={handleMessageClick}>
                {messages.length === 0 ? (
                    <div className="flex flex-col gap-1 items-center justify-center h-full text-muted-foreground">
                        <p>No messages yet.</p>
                        <p className="text-sm">
                            {!node && isStarting ? 'Connecting to the network...' : 'Ready to chat.'}
                        </p>
                    </div>
                ) : (
                    messages.filter(msg => !isMuted(msg.senderId)).map(msg => (
                        <div
                            key={msg.id}
                            className={`flex flex-col max-w-[80%] ${msg.isLocal ? 'self-end bg-primary text-primary-foreground rounded-l-lg rounded-tr-lg' : 'self-start bg-muted rounded-r-lg rounded-tl-lg'} p-3 group relative`}
                        >
                            <div className="flex items-baseline gap-2 mb-1 justify-between">
                                <div className="flex items-baseline gap-2">
                                    <span className="font-semibold text-xs opacity-90">{msg.senderName}</span>
                                    <span className="text-[10px] opacity-70">
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                {!msg.isLocal && (
                                    <button
                                        onClick={() => mutePeer(msg.senderId)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs float-right text-muted-foreground hover:text-destructive flex items-center gap-1 bg-background/50 rounded px-1"
                                        title="Mute User"
                                    >
                                        <VolumeX className="h-3 w-3" /> Mute
                                    </button>
                                )}
                            </div>
                            <div
                                className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:leading-snug prose-p:m-0 [&>p]:mb-0 break-words"
                                dangerouslySetInnerHTML={{ __html: msg.htmlContent }}
                            />
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>

            {/* File Transfer Overlays */}
            {transfers.filter(t => !t.isIncoming || !isMuted(t.metadata.senderName)).length > 0 && (
                <div className="p-3 bg-muted/30 border-t border-border space-y-2 shrink-0 max-h-40 overflow-y-auto">
                    {transfers.filter(t => !t.isIncoming || !isMuted(t.metadata.senderName)).map(t => (
                        <div key={t.id} className="flex items-center justify-between bg-background p-2 rounded-md border text-sm shadow-sm relative overflow-hidden">
                            {/* Progress Background */}
                            <div
                                className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-300"
                                style={{ width: `${t.progress}%` }}
                            />

                            <div className="flex items-center gap-3 relative z-10 truncate">
                                {t.blob && t.metadata.mimeType.startsWith('image/') ? (
                                    <ImageThumbnail blob={t.blob} alt={t.metadata.name} />
                                ) : (
                                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <div className="truncate flex flex-col">
                                    <span className="font-medium truncate">{t.metadata.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {t.isIncoming ? `From: ${t.metadata.senderName}` : 'Sending'} • {t.progress}%
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 relative z-10 shrink-0">
                                {t.isComplete && t.isIncoming && t.blob && (
                                    <>
                                        {(['text/html', 'application/pdf', 'text/plain', 'application/json'].includes(t.metadata.mimeType)) && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10" onClick={() => setSandboxBlob({ blob: t.blob!, name: t.metadata.name })} title="View in Sandbox">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {(['application/zip', 'application/x-zip-compressed', 'application/gzip', 'application/x-tar'].includes(t.metadata.mimeType) || t.metadata.name.endsWith('.zip')) && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-400 hover:text-orange-300 hover:bg-orange-400/10" onClick={() => setZipBlob({ blob: t.blob!, name: t.metadata.name })} title="Examine Archive">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => downloadBlob(t.blob!, t.metadata.name)}>
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => clearTransfer(t.id)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-background shrink-0">
                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} disabled={!node || peersConnected === 0}>
                        <Paperclip className="h-4 w-4" />
                    </Button>
                    <Input
                        placeholder="Type a message... (Markdown supported)"
                        className="flex-1"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={!node}
                    />
                    <Button size="icon" className="shrink-0" onClick={handleSend} disabled={!node || !inputValue.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Document Sandbox Modal */}
            <SandboxModal
                blob={sandboxBlob?.blob || null}
                filename={sandboxBlob?.name || ''}
                onClose={() => setSandboxBlob(null)}
            />

            {/* ZIP Archive Viewer Modal */}
            <ZipViewerModal
                blob={zipBlob?.blob || null}
                filename={zipBlob?.name || ''}
                onClose={() => setZipBlob(null)}
            />
        </div>
    )
}
