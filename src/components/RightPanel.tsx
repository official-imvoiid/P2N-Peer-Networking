import { TokenPanel } from '@/components/TokenPanel'
import { useNetwork } from '@/modules/network/NetworkContext'

export function RightPanel() {
    const { activePeers } = useNetwork()

    return (
        <div className="w-full md:w-80 border-l-0 md:border-l border-border bg-muted/10 h-full overflow-y-auto">
            <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-sm">Connections</h2>
            </div>

            <div className="p-4 space-y-6">
                <TokenPanel />

                {/* Connected Peers List */}
                <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Known Peers</h3>

                    {activePeers.length === 0 ? (
                        <div className="text-sm text-muted-foreground flex items-center justify-center p-4 border rounded-md border-dashed border-slate-700 bg-slate-900/50">
                            No peers connected
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {activePeers.map((peerId: string) => {
                                // Consistent avatar color based on peerId string
                                const num = peerId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)
                                const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500']
                                const colorClass = colors[num % colors.length]
                                const fingerprint = peerId.slice(-8)

                                return (
                                    <div key={peerId} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors cursor-pointer">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-inner ${colorClass}`}>
                                            {fingerprint.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-200 truncate" title={peerId}>
                                                Peer {fingerprint}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                <span className="text-xs text-slate-400">Online</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
