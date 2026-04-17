import { useState, useEffect, useRef } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz, IS_ARCH, IS_UNSUPPORTED_ARCH, IS_IMG, IS_PDF, IS_TEXT, IS_VIEWABLE } from '../../utils/format.js'

export function ZipViewer({ msg, onClose, onOSSandbox }) {
  const [tree, setTree] = useState(null), [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null), [previewLoading, setPreviewLoading] = useState(false)
  const [crumbs, setCrumbs] = useState([]), [error, setError] = useState(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState(''), [pwError, setPwError] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const previewUrlRef = useRef(null)
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])
  const fname = msg.meta?.name || ''
  const isUnsupportedArch = IS_UNSUPPORTED_ARCH.test(fname)
  const b64Ref = useRef(null)

  const getB64 = async () => {
    if (b64Ref.current) return b64Ref.current
    const r = new FileReader()
    const b64 = await new Promise((res, rej) => { r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(msg.blob) })
    b64Ref.current = b64
    return b64
  }

  const loadTree = async (pw) => {
    try {
      if (msg.archiveTree) { setTree(msg.archiveTree); setLoading(false); return }
      if (!msg.blob) { setError('File not in memory \u2014 save first then re-open'); setLoading(false); return }
      const b64 = await getB64()
      const result = await window.ftps?.listArchive(fname, b64, pw || null)
      if (result?.passwordProtected || result?.wrongPassword) {
        setNeedsPassword(true)
        if (pw) setPwError('Wrong password \u2014 try again')
        setLoading(false)
        setPwLoading(false)
        return
      }
      if (result?.error) {
        const hint = (result.error.includes('7-Zip') || result.error.includes('Unsupported') || result.error.includes('no longer supported'))
          ? '\n\n\ud83d\udca1 Only ZIP and TAR archives are supported in P2N v4.' : ''
        setError(result.error + hint)
        setLoading(false)
        setPwLoading(false)
        return
      }
      setNeedsPassword(false); setPwError(''); setPassword('')
      setTree(result?.tree || {}); setLoading(false); setPwLoading(false)
    } catch (e) { setError(e.message || 'Failed to read archive'); setLoading(false); setPwLoading(false) }
  }

  useEffect(() => { loadTree(null) }, [])

  const submitPassword = async () => {
    if (!password.trim()) { setPwError('Enter a password'); return }
    setPwLoading(true); setPwError('')
    await loadTree(password.trim())
  }

  const cur = crumbs.reduce((n, s) => n?.children?.[s], { children: tree || {} })
  const entries = Object.entries(cur?.children || {})
  const extCol = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, json: T.amber, sh: T.red, txt: T.textMid, zip: T.amber, tar: T.amber, rs: T.orange, go: T.green, rb: T.red }

  const openEntry = async (entryPath, entryName) => {
    if (!msg.blob) return; setPreviewLoading(true)
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null }
    const b64 = await getB64()
    const result = await window.ftps?.readArchiveEntry(fname, b64, entryPath, password || null)
    setPreviewLoading(false)
    if (!result?.ok) { setPreview({ name: entryName, type: 'err', msg: result?.error || 'Cannot read file' }); return }
    const buf = Uint8Array.from(atob(result.dataB64), c => c.charCodeAt(0))
    if (IS_IMG.test(entryName)) { const blob = new Blob([buf]); const url = URL.createObjectURL(blob); previewUrlRef.current = url; setPreview({ name: entryName, type: 'img', url }) }
    else if (IS_PDF.test(entryName)) { const blob = new Blob([buf], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); previewUrlRef.current = url; setPreview({ name: entryName, type: 'pdf', url }) }
    else if (IS_TEXT.test(entryName) || IS_VIEWABLE.test(entryName)) { let text = new TextDecoder().decode(buf); if (entryName.endsWith('.json') || entryName.endsWith('.jsonc')) { try { text = JSON.stringify(JSON.parse(text), null, 2) } catch { } } setPreview({ name: entryName, type: 'text', text: text.slice(0, 200000) }) }
    else setPreview({ name: entryName, type: 'bin', size: buf.length })
  }

  const saveEntry = async (entryPath, entryName) => {
    if (!msg.blob) return
    const b64 = await getB64()
    const result = await window.ftps?.readArchiveEntry(fname, b64, entryPath, password || null)
    if (result?.ok) await window.ftps?.saveFile(entryName, result.dataB64)
  }

  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(820px,97vw)', height: 'min(84vh,700px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 16 }}>{isUnsupportedArch ? '\ud83d\uddc3' : '\ud83d\udce6'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>Archive viewer \u2014 read-only \u00b7 nothing extracted to disk</div>
        </div>
        <button onClick={() => onOSSandbox?.(msg)} className="btn btn-amber btn-sm" title="Open in OS isolated sandbox (Windows/Linux)">\ud83d\udee1 Sandbox</button>
        <button onClick={onClose} className="btn btn-ghost btn-sm">\u2715</button>
      </div>
      {needsPassword && <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>\ud83d\udd10</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Password Required</div>
            <div style={{ fontSize: 11, color: T.textDim }}>This archive is encrypted. Enter the password to browse its contents.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setPwError('') }}
              onKeyDown={e => e.key === 'Enter' && submitPassword()}
              placeholder="Archive password\u2026" className="inp" autoFocus style={{ marginBottom: pwError ? 4 : 0 }} />
            {pwError && <div style={{ fontSize: 11, color: T.red, marginTop: 3 }}>{pwError}</div>}
          </div>
          <button onClick={submitPassword} disabled={pwLoading} className="btn btn-primary" style={{ flexShrink: 0 }}>
            {pwLoading ? '\u27f3' : '\ud83d\udd13 Unlock'}
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.textDim }}>\ud83d\udca1 Requires 7-Zip installed for encrypted RAR/7z. ZIP password is native.</div>
      </div>}
      {!needsPassword && <div style={{ padding: '4px 10px', background: T.panel, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={() => { setCrumbs([]); setPreview(null) }} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>\ud83d\udce6 root</button>
        {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <span style={{ color: T.muted, fontSize: 10 }}>\u203a</span>
          <button onClick={() => { setCrumbs(crumbs.slice(0, i + 1)); setPreview(null) }} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>{s}</button>
        </span>)}
      </div>}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: preview ? '38%' : '100%', overflowY: 'auto', borderRight: preview ? `1px solid ${T.border}` : 'none', transition: 'width .15s' }}>
          {loading && !needsPassword && <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontSize: 12 }}>
            <div className="spin" style={{ width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', margin: '0 auto 10px' }} />Reading archive\u2026
          </div>}
          {error && <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>\u26a0\ufe0f</div>
            <div style={{ fontSize: 12, color: T.red, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{error}</div>
          </div>}
          {!loading && !error && !needsPassword && <>
            {crumbs.length > 0 && <div className="sb-row" onClick={() => { setCrumbs(c => c.slice(0, -1)); setPreview(null) }} style={{ color: T.textDim, fontSize: 11 }}>\u21a9 ..</div>}
            {entries.map(([name, node]) => {
              const ext = name.split('.').pop().toLowerCase(), col = extCol[ext] || T.textDim
              const isDir = node.type === 'dir'
              const fullPath = [...crumbs, name].join('/')
              const canPreview = !isDir && IS_VIEWABLE.test(name)
              return <div key={name} className="sb-row" style={{ cursor: 'pointer' }} onClick={() => isDir ? (setCrumbs([...crumbs, name]), setPreview(null)) : (canPreview && openEntry(fullPath, name))}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{isDir ? '\ud83d\udcc2' : (IS_ARCH.test(name) ? '\ud83d\udce6' : '\ud83d\udcc4')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: isDir ? T.amber : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  {node.size > 0 && <div style={{ fontSize: 9, color: T.muted }}>{fmtSz(node.size)}</div>}
                </div>
                {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>}
                {!isDir && canPreview && msg.blob && <button onClick={e => { e.stopPropagation(); openEntry(fullPath, name) }} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '1px 4px' }}>\ud83d\udc41</button>}
                {!isDir && msg.blob && <button onClick={e => { e.stopPropagation(); saveEntry(fullPath, name) }} className="btn btn-green btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '1px 5px' }}>\u2b07</button>}
                {isDir && <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>\u25b8</span>}
              </div>
            })}
            {!entries.length && !loading && <div style={{ textAlign: 'center', padding: 24, color: T.textDim, fontSize: 11 }}>Empty folder</div>}
          </>}
        </div>
        {preview && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.panel, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</span>
            <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>\u2715</button>
          </div>
          {previewLoading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: T.textDim }}>
            <div className="spin" style={{ width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />Loading\u2026
          </div>}
          {!previewLoading && <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
            {preview.type === 'img' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 5 }} /></div>}
            {preview.type === 'pdf' && <iframe src={preview.url} style={{ width: '100%', height: '100%', border: 'none' }} title={preview.name} />}
            {preview.type === 'text' && <pre style={{ padding: 14, fontFamily: 'monospace', fontSize: 11, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{preview.text}</pre>}
            {preview.type === 'bin' && <div style={{ padding: 32, textAlign: 'center', color: T.textDim, fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>\ud83d\udcc4</div><div>Binary file \u00b7 {fmtSz(preview.size)}</div><div style={{ marginTop: 6, fontSize: 11, color: T.muted }}>Save to disk to open in another app</div></div>}
            {preview.type === 'err' && <div style={{ padding: 32, textAlign: 'center', color: T.red, fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>\u26a0\ufe0f</div><div>{preview.msg}</div></div>}
          </div>}
        </div>}
      </div>
    </div>
  </div>
}
