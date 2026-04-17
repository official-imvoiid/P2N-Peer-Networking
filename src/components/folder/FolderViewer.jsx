import { useState } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz } from '../../utils/format.js'

export function FolderViewer({ folder, onClose }) {
  const [crumbs, setCrumbs] = useState([])
  const cur = crumbs.reduce((n, s) => n?.children?.[s], folder)
  const entries = Object.entries(cur?.children ?? folder?.children ?? {})
  const extC = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple }
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(560px,95vw)', height: 'min(500px,90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 15px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div><div style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>\ud83d\udcc2 {folder.name}</div><div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>Sandboxed \u00b7 Read-only</div></div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">\u2715</button>
      </div>
      <div style={{ padding: '4px 8px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 4, alignItems: 'center', background: T.panel, flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => setCrumbs([])} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer' }}>{folder.name}</button>
        {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}><span style={{ color: T.muted, fontSize: 10 }}>\u203a</span><button onClick={() => setCrumbs(crumbs.slice(0, i + 1))} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer' }}>{s}</button></span>)}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 5 }}>
        {crumbs.length > 0 && <div className="sb-row" onClick={() => setCrumbs(c => c.slice(0, -1))} style={{ color: T.textDim, fontSize: 11 }}>\u21a9 ..</div>}
        {entries.map(([name, node]) => {
          const ext = name.split('.').pop().toLowerCase(), col = extC[ext] || T.textDim, isDir = node.type === 'dir' || node.type === 'folder'
          return <div key={name} className="sb-row" onClick={() => isDir && setCrumbs([...crumbs, name])}>
            <span style={{ fontSize: 13 }}>{isDir ? '\ud83d\udcc2' : '\ud83d\udcc4'}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, color: isDir ? T.amber : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>{node.size && <div style={{ fontSize: 9, color: T.muted }}>{fmtSz(node.size)}</div>}</div>
            {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col }}>{ext.toUpperCase()}</span>}
          </div>
        })}
        {!entries.length && <div style={{ textAlign: 'center', padding: 24, color: T.textDim, fontSize: 11 }}>Empty</div>}
      </div>
    </div>
  </div>
}
