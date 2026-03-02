// IP discovery using fastest response strategy
export async function discoverPublicIP(): Promise<string> {
    const controllers = [new AbortController(), new AbortController(), new AbortController()]
    const requests = [
        fetch('https://api.ipify.org?format=json', { signal: controllers[0].signal }),
        fetch('https://api64.ipify.org?format=json', { signal: controllers[1].signal }),
        fetch('https://ifconfig.me/ip', { signal: controllers[2].signal })
    ]

    try {
        const response = await Promise.any(requests.map(async (req, i) => {
            try {
                const res = await req
                if (!res.ok) throw new Error('Bad response')

                const contentType = res.headers.get('content-type')
                let ip = ''
                if (contentType && contentType.includes('application/json')) {
                    const data = await res.json()
                    ip = data.ip
                } else {
                    ip = await res.text()
                }

                // Abort other requests once we have a winner
                controllers.forEach((c, idx) => { if (idx !== i) c.abort() })
                return ip.trim()
            } catch (err) {
                throw err
            }
        }))
        return response
    } catch (err) {
        console.warn('Failed to discover IP via APIs, falling back to WebRTC ICE')
        return await discoverIPViaWebRTC()
    }
}

// Fallback IP discovery via WebRTC ICE candidate gathering
async function discoverIPViaWebRTC(): Promise<string> {
    return new Promise((resolve, reject) => {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
        pc.createDataChannel('')
        pc.createOffer().then(offer => pc.setLocalDescription(offer))

        const timeout = setTimeout(() => {
            pc.close()
            reject(new Error('WebRTC IP discovery timed out'))
        }, 5000)

        pc.onicecandidate = (event) => {
            if (!event.candidate) return
            const ipMatch = event.candidate.candidate.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/)
            if (ipMatch) {
                clearTimeout(timeout)
                pc.close()
                resolve(ipMatch[0])
            }
        }
    })
}

// Convert IPv4 to IPv6 mapped format or parse IPv6
export function ipToBytes(ipStr: string): Uint8Array {
    const bytes = new Uint8Array(16)
    // Very basic check - if it has dots, it's IPv4
    if (ipStr.includes('.')) {
        const parts = ipStr.split('.').map(Number)
        // IPv4 mapped to IPv6: ::ffff:a.b.c.d
        bytes[10] = 0xff
        bytes[11] = 0xff
        bytes[12] = parts[0]
        bytes[13] = parts[1]
        bytes[14] = parts[2]
        bytes[15] = parts[3]
    } else {
        // Handle basic IPv6 (simplistic implementation for demo context)
        // In reality, you'd want a robust IPv6 parser here like `ipaddr.js`
        // For FTPS constraints, we'll zero pad failing complex compressions
        const blocks = ipStr.split(':')
        let cursor = 0
        for (const block of blocks) {
            if (!block) continue
            let num = parseInt(block, 16)
            if (isNaN(num)) num = 0
            bytes[cursor++] = (num >> 8) & 0xff
            bytes[cursor++] = num & 0xff
            if (cursor >= 16) break
        }
    }
    return bytes
}

export interface CapabilityFlags {
    read: boolean
    write: boolean
    hasPath: boolean
    inviteOnly: boolean
}

export interface SCCTPayload {
    publicKey: Uint8Array
    ip: string
    port: number
    timestamp: number
    capabilities: CapabilityFlags
    path?: string
}

export function packCapabilities(flags: CapabilityFlags): number {
    let cap = 0
    if (flags.read) cap |= 1
    if (flags.write) cap |= 2
    if (flags.hasPath) cap |= 4
    if (flags.inviteOnly) cap |= 8
    return cap
}

export function unpackCapabilities(flags: number): CapabilityFlags {
    return {
        read: (flags & 1) !== 0,
        write: (flags & 2) !== 0,
        hasPath: (flags & 4) !== 0,
        inviteOnly: (flags & 8) !== 0
    }
}
