import { T } from '../../styles/theme.js'
import { fmt } from '../../utils/format.js'
import { Av } from './Av.jsx'

export function Sidebar({
  account, myId, editName, setEditName, nameInput, setNameInput,
  tab, setTab, setUnreadLogs, setLogSearch, unreadLogs,
  pendingPeerRequests, rejectedRequests,
  peers, msgs, selPeer, setSelPeer, uptime, onRenameSave, notify
}) {
  return (
    <div style={{ width: 158, background: T.surface, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '6px 5px' }}>
      {/* User */}
      <div className="glass" style={{ padding: '10px 10px', marginBottom: 10, borderRadius: 10 }}>
        {editName ? (
          <div>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter') { await onRenameSave(nameInput.trim()); setEditName(false) }
                if (e.key === 'Escape') setEditName(false)
              }}
              className="inp" style={{ fontSize: 11, padding: '4px 7px', marginBottom: 4 }} autoFocus />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={async () => { await onRenameSave(nameInput.trim()); setEditName(false) }} className="btn btn-green btn-xs" style={{ flex: 1 }}>✓</button>
              <button onClick={() => setEditName(false)} className="btn btn-ghost btn-xs" style={{ flex: 1 }}>✕</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Av name={account?.name} id={myId} size={26} online />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account?.name}</div>
              <div style={{ fontSize: 9, color: T.muted }}>{myId}</div>
            </div>
            <button onClick={() => { setNameInput(account?.name || ''); setEditName(true) }} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 10, cursor: 'pointer', padding: 2, flexShrink: 0 }}>✎</button>
          </div>
        )}
      </div>

      {/* Nav items */}
      {[
        { id: 'connect', icon: '⊕', label: 'Connect' },
        { id: 'peers', icon: '◉', label: 'Network' },
        { id: 'requests', icon: '📬', label: 'Requests', badge: pendingPeerRequests.length + rejectedRequests.filter(r => r.expiresAt > Date.now()).length },
        { id: 'logs', icon: '📋', label: 'Logs', badge: tab !== 'logs' ? unreadLogs : 0 },
        { id: 'network', icon: '⬡', label: 'My Network' },
        { id: 'stats', icon: '▲', label: 'Stats' },
        { id: 'settings', icon: '⚙', label: 'Settings' },
        { id: 'docs', icon: '📖', label: 'Docs' },
      ].map(it => (
        <button key={it.id} onClick={() => {
          setTab(it.id)
          if (it.id === 'logs') { setUnreadLogs(0) }
          else if (it.id !== 'logs') setLogSearch('')
        }} className={`nav-item${tab === it.id ? ' act' : ''}`}>
          <span style={{ width: 17, textAlign: 'center', fontSize: 13, flexShrink: 0 }}>{it.icon}</span>
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.badge > 0 && <span style={{ fontSize: 9, background: T.red, color: '#fff', borderRadius: 8, padding: '1px 4px', fontWeight: 700 }}>{it.badge}</span>}
        </button>
      ))}

      {/* Peer quick-list */}
      {peers.length > 0 && <div style={{ marginTop: 9, borderTop: `1px solid ${T.border}`, paddingTop: 7 }}>
        <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, fontWeight: 600, padding: '0 6px', marginBottom: 3 }}>PEERS</div>
        {peers.map(p => {
          const pMsgs = msgs[p.id] || []
          const lastMsg = pMsgs[pMsgs.length - 1]
          const hasUnread = selPeer?.id !== p.id && lastMsg && lastMsg.from !== 'me' && lastMsg.from !== 'sys'
          return (
            <button key={p.id} onClick={() => { setSelPeer(p); setTab('peers') }} className={`nav-item${selPeer?.id === p.id ? ' act' : ''}`} style={{ gap: 6 }}>
              <Av name={p.name} id={p.id} size={20} online={p.online} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: p.online ? T.text : T.textDim, flex: 1 }}>{p.name || p.id.slice(0, 8)}</span>
              {hasUnread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, flexShrink: 0 }} />}
              {p.reconnecting && <span style={{ fontSize: 9, color: T.amber }}>⟳</span>}
            </button>
          )
        })}
      </div>}
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 10, color: T.muted, textAlign: 'center', padding: '5px 0', fontVariantNumeric: 'tabular-nums' }}>{fmt(uptime)}</div>
    </div>
  )
}
