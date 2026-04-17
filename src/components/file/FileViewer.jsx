import { useState, useEffect } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz, IS_TEXT, IS_IMG, IS_PDF } from '../../utils/format.js'

export function FileViewer({ file, onClose }) {
  const [content, setContent] = useState(null), [loading, setLoading] = useState(true)
  const name = file.meta?.name || 'file'
  const isText = IS_TEXT.test(name), isImg = IS_IMG.test(name), isPdf = IS_PDF.test(name)
  const isLarge = file.large && file.tmpPath

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 6000)
    if (isLarge || !file.blob) { setLoading(false); clearTimeout(timeout); return }
    if (isPdf) { const u = URL.createObjectURL(file.blob); setContent(u); setLoading(false); clearTimeout(timeout); return () => URL.revokeObjectURL(u) }
    if (isText) { file.blob.text().then(t => { let out = t; if (name.endsWith('.json') || name.endsWith('.jsonc')) { try { out = JSON.stringify(JSON.parse(t), null, 2) } catch { } } setContent(out); setLoading(false); clearTimeout(timeout) }).catch(() => { setLoading(false); clearTimeout(timeout) }); return () => clearTimeout(timeout) }
    if (isImg) { const u = URL.createObjectURL(file.blob); setContent(u); setLoading(false); clearTimeout(timeout); return () => URL.revokeObjectURL(u) }
    setLoading(false); clearTimeout(timeout)
    return () => clearTimeout(timeout)
  }, [file])

  const save = async () => {
    if (isLarge && file.tmpPath) { await window.ftps?.saveFileFromTemp(file.tmpPath, name); return }
    if (!file.blob) return
    if (window.ftps) { const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(name, r.result.split(',')[1]); r.readAsDataURL(file.blob) }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file.blob); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a) }
  }
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(760px,95vw)', height: 'min(80vh,680px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{name}</span>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={save} className="btn btn-green btn-sm">\u2b07 Save</button><button onClick={onClose} className="btn btn-ghost btn-sm">\u2715</button></div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
        {loading && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.textDim }}>
          <div className="spin" style={{ width: 18, height: 18, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />Loading\u2026
        </div>}
        {!loading && isPdf && content && <iframe src={content} style={{ width: '100%', height: '100%', border: 'none' }} title={name} />}
        {!loading && isText && !isPdf && content !== null && <pre style={{ padding: 18, fontFamily: 'monospace', fontSize: 12, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</pre>}
        {!loading && isImg && content && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><img src={content} alt={name} style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 5 }} /></div>}
        {!loading && !isText && !isImg && !isPdf && <div style={{ padding: 36, textAlign: 'center' }}><div style={{ fontSize: 36, marginBottom: 10 }}>\ud83d\udcc4</div><div style={{ fontSize: 13, color: T.text, marginBottom: 6 }}>{name}</div><div style={{ fontSize: 12, color: T.textDim, marginBottom: 16 }}>{fmtSz(file.meta?.size || 0)}{isLarge ? <span style={{ color: T.amber }}> &middot; Large file \u2014 save to disk to open</span> : ''}</div><button onClick={save} className="btn btn-green">\u2b07 Save</button></div>}
      </div>
    </div>
  </div>
}
