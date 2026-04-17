import { useState } from 'react'
import { T } from '../../styles/theme.js'

export function CloseConfirm({ onCancel, onTerminate }) {
  const [v, setV] = useState('')
  const go = () => { if (v !== 'TERMINATE') return; onTerminate?.(); window.ftps?.windowControl('close-confirmed') }
  return <div className="overlay"><div className="card fadeup" style={{ width: 'min(380px,95vw)', padding: 26, border: `1px solid ${T.red}35` }}>
    <div style={{ textAlign: 'center', fontSize: 22, marginBottom: 10 }}>&#9888;&#65039;</div>
    <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>End Session &amp; Close P2N?</div>
    <div style={{ fontSize: 12, color: T.textDim, marginBottom: 18, lineHeight: 1.7, textAlign: 'center' }}>All peer connections will close and your session will end.<br />Type <strong style={{ color: T.red }}>TERMINATE</strong> to confirm.</div>
    <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onCancel() }}
      placeholder="TERMINATE" autoFocus className="inp"
      style={{
        textAlign: 'center', fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: 14,
        borderColor: v === 'TERMINATE' ? T.red : T.border, color: v === 'TERMINATE' ? T.red : T.text, background: v === 'TERMINATE' ? T.red + '0d' : T.bg
      }} />
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
      <button onClick={go} className="btn btn-danger" disabled={v !== 'TERMINATE'}>Terminate Session</button>
    </div>
  </div></div>
}
