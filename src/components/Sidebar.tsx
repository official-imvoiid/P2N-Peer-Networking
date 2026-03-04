import { useIdentity } from '@/modules/identity/IdentityContext'
import { useNetwork } from '@/modules/network/NetworkContext'
import { FolderKanban, Settings, MessageSquare, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SidebarProps {
    onNavigate?: (page: 'chat' | 'files' | 'settings') => void
    activePage?: string
}

export function Sidebar({ onNavigate, activePage = 'chat' }: SidebarProps) {
    const { identity } = useIdentity()
    const { peersConnected, isStarting } = useNetwork()

    return (
        <div className="w-full md:w-64 border-r-0 md:border-r border-border bg-muted/30 flex flex-col h-full">
            <div className="p-4 border-b border-border">
                <h1 className="text-xl font-bold tracking-tight mb-1 text-primary cursor-default">FTPS</h1>
                <p className="text-xs text-muted-foreground">Folder Transfer Privacy System</p>
            </div>

            {/* Connection status */}
            <div className="px-4 py-2 border-b border-border">
                <div className="flex items-center gap-2 text-xs">
                    {isStarting ? (
                        <span className="flex items-center gap-1.5 text-yellow-400">
                            <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                            Connecting to network...
                        </span>
                    ) : peersConnected > 0 ? (
                        <span className="flex items-center gap-1.5 text-green-400">
                            <Wifi className="h-3 w-3" />
                            {peersConnected} peer{peersConnected !== 1 ? 's' : ''} connected
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                            <WifiOff className="h-3 w-3" />
                            No peers connected
                        </span>
                    )}
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                <Button
                    variant={activePage === 'chat' ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2"
                    onClick={() => onNavigate?.('chat')}
                >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                </Button>
                <Button
                    variant={activePage === 'files' ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2"
                    onClick={() => onNavigate?.('files')}
                >
                    <FolderKanban className="h-4 w-4" />
                    Files
                </Button>
                <Button
                    variant={activePage === 'settings' ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2"
                    onClick={() => onNavigate?.('settings')}
                >
                    <Settings className="h-4 w-4" />
                    Settings
                </Button>
            </nav>

            {/* Identity card at bottom */}
            <div className="p-4 border-t border-border mt-auto space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your Identity</div>
                <div className="text-sm font-medium truncate" title={identity?.displayName || 'Anonymous'}>
                    {identity?.displayName || 'Anonymous'}
                </div>
                <div className="text-xs text-muted-foreground font-mono select-all break-all" title="Your Fingerprint">
                    {identity?.fingerprint || '—'}
                </div>
            </div>
        </div>
    )
}
