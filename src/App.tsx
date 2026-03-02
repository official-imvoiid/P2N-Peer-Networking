import { IdentityProvider, useIdentity } from './modules/identity/IdentityContext'
import { IdentityOnboarding } from './modules/identity/IdentityOnboarding'

function MainContent() {
  const { hasStoredIdentity, isLocked, identity } = useIdentity()

  if (!hasStoredIdentity) {
    return <IdentityOnboarding />
  }

  if (isLocked) {
    return (
      <div className="flex h-screen items-center justify-center">
        {/* Placeholder for unlock screen to be built next */}
        <p>Locked - Enter PIN</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Welcome, {identity?.displayName || 'Anonymous'}</h1>
      <p className="text-muted-foreground">Fingerprint: {identity?.fingerprint}</p>
    </div>
  )
}

function App() {
  return (
    <IdentityProvider>
      <div className="min-h-screen bg-background text-foreground">
        <MainContent />
      </div>
    </IdentityProvider>
  )
}

export default App
