import { useState } from 'react'
import { T } from '../../styles/theme.js'

export function CodeEditor({ onSend, onClose }) {
  const [lang, setLang] = useState('python'), [code, setCode] = useState('')
  const langs = ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'rust', 'go', 'bash', 'sql', 'html', 'json', 'yaml', 'markdown']
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(680px,95vw)', height: 'min(500px,90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: T.accent, fontWeight: 700, flex: 1 }}>{'</>'} Code Block</span>
        <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 8px', color: T.text, fontSize: 12 }}>{langs.map(l => <option key={l}>{l}</option>)}</select>
        <button onClick={onClose} className="btn btn-ghost btn-sm">&#10005;</button>
      </div>
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
        <div style={{ fontSize: 10, color: T.textDim }}>Tab = 2 spaces &middot; Shift+Enter to send</div>
        <textarea className="code-ed" value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1 }}
          onKeyDown={e => {
            if (e.key === 'Tab') { e.preventDefault(); const s = e.target.selectionStart; const v = code.slice(0, s) + '  ' + code.slice(e.target.selectionEnd); setCode(v); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2 }, 0) }
            if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); if (code.trim()) { onSend('```' + lang + '\n' + code + '\n```'); onClose() } }
          }} placeholder={`// ${lang} code\u2026`} />
      </div>
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: T.textDim }}>{code.split('\n').length} lines</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCode('')} className="btn btn-ghost btn-sm">Clear</button>
          <button onClick={() => { if (code.trim()) { onSend('```' + lang + '\n' + code + '\n```'); onClose() } }} className="btn btn-primary btn-sm" disabled={!code.trim()}>Send</button>
        </div>
      </div>
    </div>
  </div>
}
