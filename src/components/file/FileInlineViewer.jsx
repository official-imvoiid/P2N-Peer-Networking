import { useState, useEffect, useRef } from 'react'
import { T } from '../../styles/theme.js'
import { IS_TEXT, IS_IMG, IS_PDF } from '../../utils/format.js'

export function FileInlineViewer({ file }) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const urlRef = useRef(null)
  const name = file.name || ''

  useEffect(() => () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null } }, [])

  const doOpen = async () => {
    setOpen(true)
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setContent(null)
    setLoading(true)
    try {
      if (!file.blob && file.tmpPath) {
        const r = await window.ftps?.readFileForPreview(file.tmpPath)
        if (!r?.ok) { setLoading(false); return }
        const buf = Uint8Array.from(atob(r.dataB64), c => c.charCodeAt(0))
        const blob = new Blob([buf], { type: file.type || 'application/octet-stream' })
        if (IS_IMG.test(name)) { const u = URL.createObjectURL(blob); urlRef.current = u; setContent({ type: 'img', url: u }) }
        else if (IS_TEXT.test(name)) { const tx = await blob.text(); setContent({ type: 'text', text: tx.slice(0, 80000) }) }
        else if (IS_PDF.test(name)) { const u = URL.createObjectURL(blob); urlRef.current = u; setContent({ type: 'pdf', url: u }) }
        else setContent({ type: 'bin' })
        setLoading(false)
        return
      }
      if (!file.blob) { setLoading(false); return }
      if (IS_IMG.test(name)) { const u = URL.createObjectURL(file.blob); urlRef.current = u; setContent({ type: 'img', url: u }) }
      else if (IS_TEXT.test(name)) { const tx = await file.blob.text(); setContent({ type: 'text', text: tx.slice(0, 80000) }) }
      else if (IS_PDF.test(name)) { const u = URL.createObjectURL(file.blob); urlRef.current = u; setContent({ type: 'pdf', url: u }) }
      else setContent({ type: 'bin' })
    } catch { setContent(null) }
    setLoading(false)
  }

  const doClose = () => {
    setOpen(false)
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setContent(null)
  }

  if (!open) return <button onClick={doOpen} className="btn btn-blue btn-xs" style={{ flexShrink: 0, padding: '2px 5px', fontSize: 9 }}>\ud83d\udc41</button>
  return <div className="overlay" style={{ zIndex: 700 }} onClick={doClose}>
    <div className="card fadeup" style={{ width: 'min(700px,95vw)', height: 'min(75vh,600px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{name}</span>
        <button onClick={doClose} className="btn btn-ghost btn-sm">\u2715</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
        {loading && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: T.textDim }}><div className="spin" style={{ width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />Loading\u2026</div>}
        {!loading && content?.type === 'img' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><img src={content.url} alt={name} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 5 }} /></div>}
        {!loading && content?.type === 'text' && <pre style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content.text}</pre>}
        {!loading && content?.type === 'pdf' && <iframe src={content.url} style={{ width: '100%', height: '100%', border: 'none' }} title={name} />}
        {!loading && content?.type === 'bin' && <div style={{ padding: 36, textAlign: 'center', color: T.textDim, fontSize: 12 }}>Binary file \u2014 save to disk to open</div>}
        {!loading && !content && <div style={{ padding: 36, textAlign: 'center', color: T.textDim, fontSize: 12 }}>Preview not available \u2014 file may still be loading</div>}
      </div>
    </div>
  </div>
}
