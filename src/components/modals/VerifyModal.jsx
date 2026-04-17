import { T } from '../../styles/theme.js'

export function VerifyModal({ fingerprint, peerName, onClose, onVerified }) {
  if (!fingerprint) return null
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(420px,95vw)', padding: 24 }}>
      <div style={{ textAlign: 'center', fontSize: 28, marginBottom: 6 }}>&#128272;</div>
      <div style={{ fontSize: 14, color: T.accent, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>Session Verification Code</div>
      <div style={{ fontSize: 11, color: T.textDim, textAlign: 'center', lineHeight: 1.7, marginBottom: 14 }}>Read this code aloud to <strong style={{ color: T.text }}>{peerName || 'your peer'}</strong>.<br />If they see the exact same code, the connection is secure.</div>
      <div style={{ background: '#010409', border: `1px solid ${T.accent}30`, borderRadius: 8, padding: '14px 18px', textAlign: 'center', marginBottom: 14, fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: T.green, letterSpacing: 3 }}>{fingerprint}</div>
      <div style={{ fontSize: 11, color: T.textDim, textAlign: 'center', marginBottom: 14, lineHeight: 1.6 }}>This code is derived from both peers' ECDH public keys.<br />A Man-in-the-Middle attacker would produce a different code.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1, padding: 9 }}>Close</button>
        <button onClick={() => { onVerified?.(); onClose() }} className="btn btn-green" style={{ flex: 1, padding: 9 }}>&#10003; Verified &mdash; Matches</button>
      </div>
    </div>
  </div>
}
