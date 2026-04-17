import { useRef, useEffect } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz } from '../../utils/format.js'

export function BandwidthGraph({ data, color, label }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    const w = rect.width, h = rect.height
    ctx.clearRect(0, 0, w, h)
    if (!data.length) return
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    const step = w / Math.max(data.length - 1, 1)
    data.slice(-20).forEach((v, i) => {
      const x = i * step, y = h - (Math.min(1, v / 500000) * (h - 4)) - 2
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
    const lastX = (Math.min(data.length, 20) - 1) * step
    ctx.lineTo(lastX, h); ctx.lineTo(0, h); ctx.fillStyle = color + '15'; ctx.fill()
  }, [data, color])
  return <div style={{ flex: 1, height: 40, display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 9, color, fontWeight: 700 }}>{fmtSz(data[data.length - 1] || 0)}/s</span>
    </div>
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
  </div>
}
