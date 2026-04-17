import { T } from '../../styles/theme.js'

export function Av({ name, id, size = 34, online }) {
  const hue = Math.abs([...(name || id || '?')].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360
  const raw = (name || '').trim(), ini = raw.length >= 2 ? (raw[0] + raw[raw.length - 1]).toUpperCase() : raw[0]?.toUpperCase() || '?'
  return <div style={{ width: size, height: size, borderRadius: '50%', background: `hsl(${hue},18%,15%)`, border: `2px solid ${online ? T.green : T.muted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: online ? `hsl(${hue},55%,65%)` : T.textDim, fontSize: Math.round(size * .35), flexShrink: 0, position: 'relative' }}>
    {ini}<div style={{ position: 'absolute', bottom: 0, right: 0, width: Math.round(size * .24), height: Math.round(size * .24), borderRadius: '50%', background: online ? T.green : T.muted, border: `1.5px solid ${T.bg}` }} />
  </div>
}
