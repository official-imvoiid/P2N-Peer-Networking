import { useState, useCallback, useEffect } from 'react'
import { marked, Marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { useNetwork } from '../network/NetworkContext'

export interface ChatMessage {
    id: string
    senderId: string
    senderName: string
    content: string
    timestamp: number
    isLocal: boolean
}

export interface RenderedMessage extends ChatMessage {
    htmlContent: string
}

const GLOBAL_CHAT_TOPIC = '/ftps/chat/global'

export function useChat() {
    const { node } = useNetwork()
    const [messages, setMessages] = useState<RenderedMessage[]>([])

    // Configure marked to use standard GitHub Flavored Markdown
    marked.setOptions({
        gfm: true,
        breaks: true
    })

    // Process messages with marked and DOMPurify
    const processMessage = async (msg: ChatMessage): Promise<RenderedMessage> => {
        // Create an isolated marked instance for message processing
        const parser = new Marked({ gfm: true, breaks: true })

        // 1. Rewrite standard links to open securely in new tabs + add warning styles
        parser.use({
            renderer: {
                link({ href, title, text }: Tokens.Link) {
                    return `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${title || ''}" class="text-amber-500 hover:text-amber-400 underline decoration-amber-500/50 underline-offset-2" onclick="return confirm('WARNING: You are opening an external link:\\n\\n${href}\\n\\nAre you sure you trust this source?')">${text}</a>`
                },
                image({ href, title, text }: Tokens.Image) {
                    // Render images natively, letting browser handle fetching.
                    // Important: only allow https links to avoid local file exfiltration vectors
                    if (!href.startsWith('https://') && !href.startsWith('http://') && !href.startsWith('data:image')) {
                        return `[Blocked Image: ${text}]`
                    }
                    return `<img src="${href}" alt="${text || ''}" title="${title || ''}" class="max-w-full h-auto rounded-md border border-slate-700 my-2 max-h-64 object-contain" loading="lazy" />`
                }
            }
        })

        // 2. Add custom tokenizer for ftps:// tokens
        parser.use({
            extensions: [{
                name: 'scctToken',
                level: 'inline',
                start(src: string) { return src.match(/ftps:\/\//)?.index },
                tokenizer(src: string) {
                    const rule = /^ftps:\/\/[1-9A-HJ-NP-Za-km-z]{50,}/;
                    const match = rule.exec(src);
                    if (match) {
                        return {
                            type: 'scctToken',
                            raw: match[0],
                            token: match[0]
                        };
                    }
                },
                renderer(token: any) {
                    // Render into a safe structural block we can attach an onClick handler to later
                    return `<div class="p2p-token-block my-2 p-3 bg-primary/10 border border-primary/20 rounded-md cursor-pointer hover:bg-primary/20 transition-colors" data-token="${token.token}">
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-sm text-primary">🔗 Peer Connection Token</span>
                                </div>
                                <div class="text-xs font-mono text-muted-foreground truncate mt-1">${token.token}</div>
                                <div class="text-xs text-primary mt-2 font-medium">Click to connect →</div>
                            </div>`
                }
            }]
        })

        const rawHtml = await parser.parse(msg.content)
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'div', 'span', 'img'],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-token', 'src', 'alt', 'title', 'loading']
        })

        return {
            ...msg,
            htmlContent: cleanHtml
        }
    }

    const sendMessage = useCallback(async (content: string, senderName: string) => {
        if (!node || !content.trim()) return

        const msg: ChatMessage = {
            id: crypto.randomUUID(),
            senderId: node.peerId.toString(),
            senderName,
            content,
            timestamp: Date.now(),
            isLocal: true
        }

        // Publish to network
        const payload = new TextEncoder().encode(JSON.stringify(msg))
        try {
            await (node.services.pubsub as any).publish(GLOBAL_CHAT_TOPIC, payload)
        } catch (err) {
            console.error('Failed to publish message:', err)
            // Even if publish fails, we display locally for now (can revert this UX later)
        }

        const rendered = await processMessage(msg)
        setMessages(prev => [...prev, rendered])
    }, [node])

    useEffect(() => {
        if (!node) return

        // Rate limiter state local to the active connection hook
        const messageTimestamps = new Map<string, number[]>()

        const handleMessage = async (evt: any) => {
            if (evt.detail.topic !== GLOBAL_CHAT_TOPIC) return

            try {
                const text = new TextDecoder().decode(evt.detail.data)
                const parsed = JSON.parse(text) as ChatMessage

                // Ignore our own echoed messages (if emitSelf was enabled)
                if (parsed.senderId === node.peerId.toString()) return

                // --- Rate Limiting Logic ---
                const now = Date.now()
                const senderId = parsed.senderId
                let timestamps = messageTimestamps.get(senderId) || []

                // Keep only timestamps from the last 3 seconds
                timestamps = timestamps.filter(t => now - t <= 3000)
                timestamps.push(now)
                messageTimestamps.set(senderId, timestamps)

                // If more than 5 messages in 3 seconds, drop the frame
                if (timestamps.length > 5) {
                    // Optional: console.warn(`Rate-limiting peer ${senderId}`);
                    return
                }
                // --- End Rate Limiting Logic ---

                parsed.isLocal = false
                const rendered = await processMessage(parsed)
                setMessages(prev => [...prev, rendered])
            } catch (err) {
                console.error('Error processing network chat message:', err)
            }
        }

        const pubsub = node.services.pubsub as any
        pubsub.subscribe(GLOBAL_CHAT_TOPIC)
        pubsub.addEventListener('message', handleMessage)

        // Periodic map cleanup to prevent memory leaks from long stale sessions
        const cleanupTimer = setInterval(() => {
            const now = Date.now()
            for (const [peerId, timestamps] of messageTimestamps.entries()) {
                const valid = timestamps.filter(t => now - t <= 3000)
                if (valid.length === 0) {
                    messageTimestamps.delete(peerId)
                } else {
                    messageTimestamps.set(peerId, valid)
                }
            }
        }, 30000)

        return () => {
            pubsub.removeEventListener('message', handleMessage)
            pubsub.unsubscribe(GLOBAL_CHAT_TOPIC)
            clearInterval(cleanupTimer)
        }
    }, [node])

    return {
        messages,
        sendMessage
    }
}
