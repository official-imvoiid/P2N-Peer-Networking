import { T } from '../../styles/theme.js'

export function ResourceBar({ label, val, max, col }) {
  const pct = Math.min(100, Math.round((val / max) * 100))
  return <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4, color: T.textDim }}>
      <span>{label}</span>
      <span style={{ color: col, fontWeight: 700 }}>{pct}%</span>
    </div>
    <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: col, transition: 'width .5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
    </div>
  </div>
}
