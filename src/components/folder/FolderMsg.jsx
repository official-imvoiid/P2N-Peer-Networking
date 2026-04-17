import { T } from '../../styles/theme.js'

export function FolderMsg({ msg, onOpen, onRevoke }) {
  const e = Object.keys(msg.folder?.children || {})
  return <div onClick={onOpen} style={{ padding: '9px 11px', background: T.amber + '0b', border: `1px solid ${T.amber}28`, borderRadius: 8, maxWidth: '68%', cursor: 'pointer', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.amber + '15'} onMouseLeave={e => e.currentTarget.style.background = T.amber + '0b'}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
      <span style={{ fontSize: 18 }}>\ud83d\udcc2</span>
      <div><div style={{ fontSize: 11, color: T.amber, fontWeight: 700 }}>Shared Folder</div><div style={{ fontSize: 12, color: T.text }}>{msg.folder?.name}</div></div>
    </div>
    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 3 }}>{e.length} item{e.length !== 1 ? 's' : ''}{e.length ? ': ' + e.slice(0, 3).join(', ') + (e.length > 3 ? '\u2026' : '') : ''}</div>
    {msg.from === 'me' && <button onClick={ev => { ev.stopPropagation(); onRevoke?.(msg.id) }} className="btn btn-ghost btn-xs" style={{ color: T.amber, marginBottom: 3 }}>Revoke</button>}
    <div style={{ fontSize: 10, color: T.muted, textAlign: 'right' }}>{msg.time}</div>
  </div>
}
