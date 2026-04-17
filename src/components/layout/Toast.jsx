import { T } from '../../styles/theme.js'

export function Toast({ n }) {
  if (!n) return null
  const c = n.t === 'ok' ? T.green : n.t === 'err' ? T.red : T.accent
  return <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, background: T.surface, border: `1px solid ${c}45`, borderRadius: 8, padding: '9px 14px', color: c, fontSize: 12, maxWidth: 300, animation: 'fadeUp .16s ease', boxShadow: '0 8px 24px #0008', lineHeight: 1.5, display: 'flex', gap: 8 }}>
    <span>{n.t === 'ok' ? '\u2713' : n.t === 'err' ? '\u2715' : '\u2139'}</span><span>{n.msg}</span>
  </div>
}
