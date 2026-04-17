import { useState, useEffect, useRef } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz } from '../../utils/format.js'
import { IS_ARCH, IS_TEXT, IS_IMG, IS_PDF } from '../../utils/format.js'

export function SandboxPanel({ sandbox, onClose }) {
  const { name, sandboxDir, sandboxId, tree } = sandbox
  const [crumbs, setCrumbs] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(null)
  const idRef = useRef(sandboxId)
  const previewUrlRef = useRef(null)

  useEffect(() => { idRef.current = sandboxId }, [sandboxId])
  useEffect(() => { setCrumbs([]); setPreview(null) }, [sandboxId])
  useEffect(() => () => { if (idRef.current) window.ftps?.cleanupSandbox(idRef.current) }, [])
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  const cur = crumbs.reduce((n, s) => n?.children?.[s], { children: tree })
  const entries = Object.entries(cur?.children || tree || {})
  const extCol = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, zip: '#f97316', json: T.amber, sh: T.red, txt: T.textMid }

  const openFile = async (fname, node) => {
    setLoading(fname)
    const res = await window.ftps?.readSandboxFile(sandboxDir, node.relPath)
    setLoading(null); if (!res?.ok) return
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null }
    const buf = Uint8Array.from(atob(res.dataB64), c => c.charCodeAt(0))
    if (IS_PDF.test(fname)) { const blob = new Blob([buf], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); previewUrlRef.current = url; setPreview({ name: fname, type: 'pdf', url }) }
    else if (IS_TEXT.test(fname)) {
      let content = new TextDecoder().decode(buf)
      if (fname.endsWith('.json') || fname.endsWith('.jsonc')) { try { content = JSON.stringify(JSON.parse(content), null, 2) } catch { } }
      setPreview({ name: fname, type: 'text', content })
    }
    else if (IS_IMG.test(fname)) { const blob = new Blob([buf], { type: 'image/' + fname.split('.').pop() }); const url = URL.createObjectURL(blob); previewUrlRef.current = url; setPreview({ name: fname, type: 'img', url }) }
    else setPreview({ name: fname, type: 'bin', size: buf.length })
  }
  const saveFile = async (fname, node) => { await window.ftps?.saveSandboxFile(sandboxDir, node.relPath, fname) }
  const openOS = () => window.ftps?.openSandboxFolder(sandboxDir)

  return <div style={{ width: 320, borderLeft: `1px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.accent, fontWeight: 700 }}>\ud83d\udce6 SANDBOX</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={openOS} className="btn btn-ghost btn-xs" title="Open in Windows Explorer / File Manager (AV will scan)">\ud83d\uddc2 Explorer</button>
          <button onClick={onClose} className="btn btn-ghost btn-xs">\u2715</button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Isolated OS temp &middot; Auto-cleaned &middot; Never executed</div>
    </div>

    <div style={{ padding: '4px 8px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, background: T.panel }}>
      <button onClick={() => { setCrumbs([]); setPreview(null) }} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 3px', borderRadius: 3 }}>root</button>
      {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <span style={{ color: T.muted, fontSize: 10 }}>\u203a</span>
        <button onClick={() => { setCrumbs(crumbs.slice(0, i + 1)); setPreview(null) }} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 3px', borderRadius: 3 }}>{s}</button>
      </span>)}
    </div>

    <div style={{ flex: preview ? '0 0 50%' : '1', overflowY: 'auto', padding: 4, borderBottom: preview ? `1px solid ${T.border}` : 'none' }}>
      {crumbs.length > 0 && <div className="sb-row" onClick={() => { setCrumbs(c => c.slice(0, -1)); setPreview(null) }} style={{ color: T.textDim, fontSize: 11 }}>\u21a9 ..</div>}
      {entries.map(([fname, node]) => {
        const ext = fname.split('.').pop().toLowerCase(), col = extCol[ext] || T.textDim, isDir = node.type === 'dir', isLoading = loading === fname
        return <div key={fname} className="sb-row" onClick={() => isDir ? setCrumbs([...crumbs, fname]) : openFile(fname, node)}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{isDir ? '\ud83d\udcc2' : IS_ARCH.test(fname) ? '\ud83d\udce6' : '\ud83d\udcc4'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: isDir ? T.amber : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</div>
            {node.size && <div style={{ fontSize: 9, color: T.muted }}>{fmtSz(node.size)}</div>}
          </div>
          {isLoading && <div className="spin" style={{ width: 11, height: 11, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', flexShrink: 0 }} />}
          {!isDir && !isLoading && <button onClick={e => { e.stopPropagation(); saveFile(fname, node) }} className="btn btn-green btn-xs" style={{ flexShrink: 0 }}>\u2b07</button>}
          {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>}
        </div>
      })}
      {!entries.length && <div style={{ textAlign: 'center', padding: 20, color: T.textDim, fontSize: 11 }}>Empty folder</div>}
    </div>

    {preview && <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <div style={{ padding: '5px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: T.surface }}>
        <span style={{ fontSize: 10, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</span>
        <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 11, flexShrink: 0 }}>\u2715</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {preview.type === 'pdf' && <iframe src={preview.url} style={{ width: '100%', height: '100%', border: 'none' }} title={preview.name} />}
        {preview.type === 'text' && <pre style={{ padding: 12, fontFamily: 'monospace', fontSize: 11, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{preview.content}</pre>}
        {preview.type === 'img' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}><img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: 4 }} /></div>}
        {preview.type === 'bin' && <div style={{ padding: 24, textAlign: 'center', color: T.textDim, fontSize: 12 }}><div style={{ fontSize: 28, marginBottom: 8 }}>\ud83d\udcc4</div><div>{fmtSz(preview.size)}</div><div style={{ marginTop: 4, fontSize: 11 }}>Binary \u2014 save to open</div></div>}
      </div>
    </div>}

    <div style={{ padding: '7px 10px', borderTop: `1px solid ${T.border}`, background: T.panel, flexShrink: 0, fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
      \ud83d\udee1 <strong style={{ color: T.textDim }}>Isolated location:</strong> Files extracted to a temporary folder isolated from your system. Nothing auto-runs. Click "Explorer" to open \u2014 your AV scans on access.
    </div>
  </div>
}
