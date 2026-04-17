import { T } from '../../styles/theme.js'
import { fmtSz, fmtTime } from '../../utils/format.js'

export function FolderOfferMsg({ msg, onRevoke }) {
  const statusMap = { offered: { c: T.blue, t: '\ud83d\udce4 Offered' }, sending: { c: T.amber, t: '\u27f3 Sending\u2026' }, done: { c: T.green, t: '\u2713 Sent' } }
  const s = statusMap[msg.status || 'offered'] || statusMap.offered
  return <div style={{ padding: '9px 11px', background: T.blue + '0b', border: `1px solid ${T.blue}26`, borderRadius: 8, maxWidth: '68%', minWidth: 210 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>\ud83d\udcc2</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{msg.totalFiles} files \u00b7 {fmtSz(msg.totalBytes)}</div>
      </div>
      <span className="stag" style={{ color: s.c, background: s.c + '12', border: `1px solid ${s.c}28`, flexShrink: 0 }}>{s.t}</span>
    </div>
    {msg.status === 'sending' && <div className="prog" style={{ marginTop: 6 }}><div className="prog-fill" style={{ width: '100%', background: T.amber, animation: 'pulse 1s infinite' }} /></div>}
    {msg.status === 'sending' && msg.calcSpeed > 0 && <div style={{ fontSize: 10, color: T.textDim, display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
      <span>\u2191 {fmtSz(msg.calcSpeed)}/s</span>
      <span>{msg.calcEta > 0 ? `~${fmtTime(msg.calcEta)} remaining` : ''}</span>
    </div>}
    {msg.status !== 'done' && <button onClick={ev => { ev.stopPropagation(); onRevoke?.(msg.fid) }} className="btn btn-ghost btn-xs" style={{ color: T.red, border: `1px solid ${T.red}20`, marginTop: 6, width: '100%' }}>\ud83d\udeab Revoke Offer</button>}
    <div style={{ fontSize: 10, color: T.muted, marginTop: 6, textAlign: 'right' }}>{msg.time}</div>
  </div>
}
