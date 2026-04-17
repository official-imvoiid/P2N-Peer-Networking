import { T } from '../../styles/theme.js'

export function TofuWarning({ data, onAccept, onReject }) {
  if (!data) return null
  return <div className="overlay">
    <div className="card fadeup" style={{ width: 'min(440px,95vw)', padding: 24, border: `1px solid ${T.red}40` }}>
      <div style={{ textAlign: 'center', fontSize: 28, marginBottom: 8 }}>&#9888;&#65039;</div>
      <div style={{ fontSize: 15, color: T.red, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>KEY CHANGED &mdash; Possible MITM Attack!</div>
      <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8, marginBottom: 14, textAlign: 'center' }}>
        The encryption key for <strong style={{ color: T.text }}>{data.peerName || data.peerId}</strong> has changed since the first connection.
        <br />This could mean someone is intercepting the connection.
      </div>
      <div style={{ background: T.panel, borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 11, lineHeight: 1.6 }}>
        <div style={{ color: T.textDim }}>Previously known as: <span style={{ color: T.amber }}>{data.tofuDetail?.previousName || 'Unknown'}</span></div>
        <div style={{ color: T.textDim }}>First seen: <span style={{ color: T.muted }}>{data.tofuDetail?.firstSeen?.slice(0, 10) || 'Unknown'}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onReject} className="btn btn-danger" style={{ flex: 1, padding: 10 }}>&#10005; Disconnect</button>
        <button onClick={onAccept} className="btn btn-amber" style={{ flex: 1, padding: 10 }}>Accept New Key</button>
      </div>
    </div>
  </div>
}
