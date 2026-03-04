import { useState } from 'react'
import { IdentityProvider, useIdentity } from './modules/identity/IdentityContext'
import { IdentityOnboarding } from './modules/identity/IdentityOnboarding'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { RightPanel } from './components/RightPanel'
import { UnlockScreen } from './components/UnlockScreen'
import { SettingsPage } from './components/SettingsPage'
import { FilesPage } from './components/FilesPage'
import { NetworkProvider } from './modules/network/NetworkContext'
import { RefreshGuard } from './components/RefreshGuard'
import { useMobile } from './hooks/useMobile'
import { MessageSquare, Key, Menu } from 'lucide-react'

type Page = 'chat' | 'files' | 'settings'
type MobileTab = 'chat' | 'tokens' | 'menu'

function MainContent() {
  const { hasStoredIdentity, isLocked, isLoading } = useIdentity()
  const isMobile = useMobile()
  const [activePage, setActivePage] = useState<Page>('chat')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')

  // Show loading spinner while IndexedDB initialises
  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">FTPS</p>
            <p className="text-xs text-muted-foreground mt-1">Loading secure session...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!hasStoredIdentity) {
    return <IdentityOnboarding />
  }

  if (isLocked) {
    return <UnlockScreen />
  }

  const renderCenterContent = () => {
    if (activePage === 'settings') return <SettingsPage />
    if (activePage === 'files') return <FilesPage />
    return <ChatArea />
  }

  // Desktop 3-column layout
  if (!isMobile) {
    return (
      <NetworkProvider>
        <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
          <Sidebar onNavigate={setActivePage} activePage={activePage} />
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {renderCenterContent()}
          </div>
          {activePage === 'chat' && <RightPanel />}
        </div>
      </NetworkProvider>
    )
  }

  // Mobile layout
  return (
    <NetworkProvider>
      <div className="flex flex-col w-full h-full bg-background text-foreground">
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chat' && <ChatArea />}
          {mobileTab === 'tokens' && <div className="p-4 overflow-y-auto h-full"><RightPanel /></div>}
          {mobileTab === 'menu' && <Sidebar onNavigate={(page) => { setActivePage(page); setMobileTab('chat') }} activePage={activePage} />}
        </div>
        {/* Mobile Bottom Nav */}
        <div className="h-16 border-t border-border bg-muted/50 flex items-center justify-around shrink-0">
          <button
            onClick={() => setMobileTab('menu')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${mobileTab === 'menu' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px]">Menu</span>
          </button>
          <button
            onClick={() => setMobileTab('chat')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${mobileTab === 'chat' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[10px]">Chat</span>
          </button>
          <button
            onClick={() => setMobileTab('tokens')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${mobileTab === 'tokens' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Key className="h-5 w-5" />
            <span className="text-[10px]">Tokens</span>
          </button>
        </div>
      </div>
    </NetworkProvider>
  )
}

function App() {
  return (
    <IdentityProvider>
      <RefreshGuard />
      <MainContent />
    </IdentityProvider>
  )
}

export default App
