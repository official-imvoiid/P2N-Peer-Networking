import { useState, useEffect, useRef } from 'react'
import { T } from '../../styles/theme.js'
import { fmt, fmtMin } from '../../utils/format.js'

export function TitleBar({ account, nodeId, onlinePeers, listenActive, onLock, onTerminate, uptime, onHelp, lockTimer, lockMin }) {
  const [vOpen, setVOpen] = useState(false)
  const vRef = useRef(null)
  const wc = a => window.ftps?.windowControl(a)

  useEffect(() => {
    const h = e => { if (vRef.current && !vRef.current.contains(e.target)) setVOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const VIEW = [
    { l: 'Minimize', k: 'minimize', s: 'Ctrl+M' },
    { l: 'Maximize', k: 'maximize', s: 'Ctrl+Shift+M' },
    { l: 'Toggle Fullscreen', k: 'fullscreen', s: 'F11' },
    { sep: true },
    { l: 'Zoom In', k: 'zoomin', s: 'Ctrl++' },
    { l: 'Actual Size', k: 'zoomreset', s: 'Ctrl+0' },
    { l: 'Zoom Out', k: 'zoomout', s: 'Ctrl+-' },
  ]

  return <div className="tb">
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', WebkitAppRegion: 'no-drag' }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: T.accent, letterSpacing: 2 }}>P2P</span>
    </span>
    <div style={{ width: 1, height: 14, background: T.border, margin: '0 2px' }} />
    <button className="tb-btn" onClick={onHelp} title="Open Documentation">Help</button>
    <div style={{ position: 'relative', WebkitAppRegion: 'no-drag' }} ref={vRef}>
      <button className="tb-btn" onClick={() => setVOpen(o => !o)}>View &#9662;</button>
      {vOpen && <div className="tb-drop">
        {VIEW.map((it, i) => it.sep
          ? <div key={i} className="tb-drop-sep" />
          : <button key={i} className="tb-drop-item" title={it.note || ''} onClick={() => { wc(it.k); setVOpen(false) }}>
            <span>{it.l}</span><span className="tb-shortcut">{it.s}</span>
          </button>
        )}
      </div>}
    </div>
    <div className="tb-drag-fill" />
    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
      <span style={{ color: T.textMid }}>{account?.name}</span>
      <span style={{ color: T.muted }}>&middot;</span>
      <span style={{ color: T.accent, fontWeight: 600 }}>{nodeId}</span>
      <span style={{ color: T.muted }}>&middot;</span>
      <span style={{ color: onlinePeers > 0 ? T.green : listenActive ? T.blue : T.muted }}>
        {onlinePeers > 0 ? `\u25CF ${onlinePeers} peer${onlinePeers !== 1 ? 's' : ''} online` : listenActive ? '\u25C9 listening' : '\u25CB offline'}
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, WebkitAppRegion: 'no-drag' }}>
      <span style={{ fontSize: 10, color: T.muted, fontVariantNumeric: 'tabular-nums', marginRight: 6 }}>{fmt(uptime)}</span>
      <span
        title={`Auto-locks after ${lockMin} min inactivity`}
        style={{
          fontSize: 10, color: lockTimer < 60 ? T.red : lockTimer < 180 ? T.amber : T.muted,
          fontVariantNumeric: 'tabular-nums', marginRight: 6,
          fontWeight: lockTimer < 60 ? 700 : 400,
        }}
      > {fmtMin(lockTimer)}</span>
      <button onClick={onLock} className="tb-btn" style={{ color: T.amber }}>&#128274; Lock</button>
      <button onClick={onTerminate} className="tb-btn" style={{ color: T.red }}>End</button>
    </div>
  </div>
}
