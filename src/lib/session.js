// Settings are ephemeral — reset on every restart. Only port persists to disk.
export const DEFAULT_SETTINGS = { lockMin: 15, md: true, warnLinks: true, warnArch: true, torEnabled: true, maxTries: 5, scanFiles: true, exifStripSend: false, exifStripRecv: false, clearMsgsOnReconnect: true }

// sessionStorage survives webContents.reload() (Refresh UI) but NOT app restart.
// This lets Refresh UI work without terminating the session.
export function readSavedSession() {
  try { return JSON.parse(sessionStorage.getItem('p2n_session') || 'null') } catch { return null }
}
export function saveSession(account, nodeId) {
  try { sessionStorage.setItem('p2n_session', JSON.stringify({ account, nodeId, at: Date.now() })) } catch { }
}
export function clearSavedSession() {
  try { sessionStorage.removeItem('p2n_session') } catch { }
}

// Determine initial screen synchronously (avoid flash of setup screen on reload)
export function getInitialScreen() {
  const s = readSavedSession()
  if (s?.nodeId && s?.account?.name) return 'restoring'
  return 'setup'
}
export function getInitialAccount() {
  const s = readSavedSession()
  return s?.account || null
}
export function getInitialNodeId() {
  const s = readSavedSession()
  return s?.nodeId || '#0000'
}
