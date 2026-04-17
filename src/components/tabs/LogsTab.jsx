import { useState } from 'react'
import { T } from '../../styles/theme.js'

export function LogsTab({ logs, setLogs, logSearch, setLogSearch, notify }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fadein">
      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, flex: 1 }}>📋 SECURITY & EVENT LOG</span>
          <button onClick={() => {
            const txt = logs.map(l => `[${l.ts}] ${l.level}: ${l.msg} ${l.detail || ''}`).join('\n')
            navigator.clipboard.writeText(txt); notify('All logs copied!', 'ok')
          }} className="btn btn-ghost btn-xs">Copy All</button>
          <button onClick={() => {
            const txt = logs.map(l => `[${l.ts}] ${l.level}: ${l.msg} ${l.detail || ''}`).join('\n')
            const blob = new Blob([txt], { type: 'text/plain' })
            const url = URL.createObjectURL(blob); const a = document.createElement('a')
            a.href = url; a.download = 'security_logs.txt'; a.click(); URL.revokeObjectURL(url)
          }} className="btn btn-ghost btn-xs">⬇ security_logs.txt</button>
          <button onClick={async () => { await window.ftps?.clearLogs(); setLogs([]); notify('Logs cleared') }} className="btn btn-ghost btn-xs">Clear</button>
        </div>
        <input
          placeholder="🔍 Search logs…"
          onChange={e => {
            const q = e.target.value.toLowerCase()
            setLogSearch(q)
          }}
          className="inp"
          style={{ fontSize: 11, padding: '4px 8px' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {(() => {
          const filtered = logSearch ? logs.filter(l =>
            l.msg?.toLowerCase().includes(logSearch) ||
            l.level?.toLowerCase().includes(logSearch) ||
            l.detail?.toLowerCase().includes(logSearch) ||
            l.ts?.includes(logSearch)
          ) : logs
          if (!filtered.length) return <div style={{ textAlign: 'center', padding: 28, color: T.muted, fontSize: 12 }}>{logSearch ? `No logs matching "${logSearch}"` : 'No events yet'}</div>
          return filtered.map((l, i) => {
            const col = l.level === 'OK' ? T.green : l.level === 'ERR' ? T.red : l.level === 'WARN' ? T.amber : T.muted
            return <div key={i} className="log-row" style={{ cursor: 'pointer' }} title="Click to copy log line" onClick={() => { navigator.clipboard.writeText(`[${l.ts}] ${l.level}: ${l.msg} ${l.detail || ''}`); notify('Copied log line', 'ok') }}>
              <span style={{ color: T.muted }}>{l.ts}</span>
              <span style={{ color: col, fontWeight: 700 }}>{l.level}</span>
              <span style={{ color: T.textMid }}>{l.msg}{l.detail ? <span style={{ color: T.muted }}> — {l.detail}</span> : ''}</span>
            </div>
          })
        })()}
      </div>
    </div>
  )
}
