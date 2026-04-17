import { useState, useEffect, useRef, useMemo } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz, IS_VIEWABLE, IS_IMG, IS_DANGEROUS } from '../../utils/format.js'

export function FolderBrowseMsg({ msg, peerId, onPull, notify }) {
  const [expanded, setExpanded] = useState(false)
  const [crumbs, setCrumbs] = useState([])
  const [previewEntry, setPreviewEntry] = useState(null)
  const [loadingEntry, setLoadingEntry] = useState(null)
  const status = msg.status || 'available'

  const hasAutoExpanded = useRef(false)
  useEffect(() => {
    if (!hasAutoExpanded.current && msg.tree?.length > 0) {
      hasAutoExpanded.current = true
      setExpanded(true)
    }
  }, [msg.tree])

  useEffect(() => {
    if (!previewEntry || previewEntry.type !== 'loading') return
    const recv = (msg.receivedFiles || []).find(f =>
      f.name === previewEntry.name ||
      (f.relPath || '').endsWith('/' + previewEntry.name) ||
      f.relPath === previewEntry.name
    )
    if (recv?.blob) {
      recv.blob.text().then(text => {
        setPreviewEntry({
          name: previewEntry.name,
          type: IS_IMG.test(previewEntry.name) ? 'img' : 'text',
          content: text,
          blob: recv.blob
        })
      }).catch(() => {
        setPreviewEntry({ name: previewEntry.name, type: 'text', content: '[Failed to read file]' })
      })
    }
  }, [msg.receivedFiles, previewEntry])

  const buildTree = (files, rootName) => {
    const root = {}
    files?.forEach(f => {
      let rp = f.relPath || f.name
      if (rootName && rp.startsWith(rootName + '/')) rp = rp.slice(rootName.length + 1)
      const parts = rp.split('/').filter(Boolean)
      let node = root
      parts.forEach((p, i) => {
        if (!node[p]) node[p] = i === parts.length - 1
          ? { type: 'file', name: f.name, size: f.size, index: f.index }
          : { type: 'dir', children: {} }
        if (i < parts.length - 1) node = node[p].children
      })
    })
    return root
  }

  const tree = useMemo(() => buildTree(msg.tree), [msg.tree])
  const cur = crumbs.reduce((n, s) => n?.[s]?.children ?? n?.[s] ?? null, tree) || tree
  const entries = Object.entries(cur || {})

  const statusMap = {
    available: { c: T.green, t: '\ud83d\udcec Available' },
    pulling: { c: T.amber, t: '\u27f3 Receiving\u2026' },
    done: { c: T.green, t: '\u2713 Received' }
  }
  const s = statusMap[status] || statusMap.available

  const pullAll = () => onPull?.(peerId, msg.fid, null, { name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes }, false)
  const pullAsZip = () => onPull?.(peerId, msg.fid, null, { name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes }, true)
  const pullFile = idx => onPull?.(peerId, msg.fid, idx, { name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes }, false)

  const extCol = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, json: T.amber, sh: T.red, rs: T.orange, go: T.green }

  const previewFile = async (node, name) => {
    if (!IS_VIEWABLE.test(name)) return
    setLoadingEntry(name)
    try {
      const recv = (msg.receivedFiles || []).find(f => f.name === name || (f.relPath || '').endsWith('/' + name) || f.relPath === name)
      if (recv?.blob) {
        const text = await recv.blob.text()
        setPreviewEntry({ name, type: IS_IMG.test(name) ? 'img' : 'text', content: text, blob: recv.blob })
        setLoadingEntry(null)
        return
      }
      setPreviewEntry({ name, type: 'loading' })
    } finally {
      setLoadingEntry(null)
    }
  }

  return <div className="folder-card slide-in" style={{ background: T.green + '07', border: `1px solid ${T.green}20`, borderRadius: 10, maxWidth: '90%', minWidth: 240, overflow: 'hidden' }}>
    <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>\ud83d\udcc2</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{msg.totalFiles} files \u00b7 {fmtSz(msg.totalBytes)}</div>
      </div>
      <span className="stag" style={{ color: s.c, background: s.c + '12', border: `1px solid ${s.c}28`, flexShrink: 0 }}>{s.t}</span>
      <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0 }}>{expanded ? '\u25be' : '\u25b8'}</span>
    </div>

    {status === 'pulling' && <div style={{ padding: '0 11px 9px' }}>
      <div className="prog"><div className="prog-fill" style={{ width: '100%', background: T.amber, animation: 'pulse 1s infinite' }} /></div>
      <div style={{ fontSize: 10, color: T.textDim, marginTop: 3 }}>\u27f3 Receiving files\u2026</div>
    </div>}

    {(msg.receivedFiles || []).length > 0 && status !== 'done' && (
      <div style={{ padding: '4px 8px 6px', borderTop: `1px solid ${T.green}18`, background: T.green + '05' }}>
        <div style={{ fontSize: 10, color: T.green, fontWeight: 600, marginBottom: 3 }}>\u2713 Pulled files:</div>
        {(msg.receivedFiles || []).map((f, i) => {
          const canView = IS_VIEWABLE.test(f.name || '') && !!f.blob
          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
            <span style={{ fontSize: 10 }}>\ud83d\udcc4</span>
            <span style={{ fontSize: 10, flex: 1, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.relPath || f.name}</span>
            <span style={{ fontSize: 9, color: T.muted }}>{fmtSz(f.size || 0)}</span>
            {canView && <button onClick={async () => {
              const text = await f.blob.text()
              setPreviewEntry({ name: f.name, type: IS_IMG.test(f.name) ? 'img' : 'text', content: text, blob: f.blob })
            }} className="btn btn-ghost btn-xs" style={{ fontSize: 8, padding: '1px 4px' }}>\ud83d\udc41</button>}
            <button onClick={async () => {
              if (f.tmpPath) { await window.ftps?.saveFileFromTemp(f.tmpPath, f.name); return }
              if (f.blob && window.ftps) { const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(f.name, r.result.split(',')[1]); r.readAsDataURL(f.blob) }
              else if (f.blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; a.click() }
            }} className="btn btn-green btn-xs" style={{ fontSize: 8, padding: '1px 4px' }}>\u2b07</button>
          </div>
        })}
      </div>
    )}

    {previewEntry && <div style={{ position: 'relative', borderTop: `1px solid ${T.border}` }}>
      <div style={{ padding: '6px 8px', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{previewEntry.name}</span>
        <button onClick={() => setPreviewEntry(null)} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>\u00d7</button>
      </div>
      <div style={{ maxHeight: 200, overflow: 'auto', padding: 8 }}>
        {previewEntry.type === 'loading' && <div style={{ color: T.textDim, fontSize: 11 }}>Loading\u2026</div>}
        {previewEntry.type === 'text' && <pre style={{ fontSize: 11, color: T.text, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>{previewEntry.content?.slice(0, 50000)}</pre>}
        {previewEntry.type === 'img' && previewEntry.blob && <img src={URL.createObjectURL(previewEntry.blob)} style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }} alt={previewEntry.name} />}
      </div>
    </div>}

    {expanded && <div style={{ borderTop: `1px solid ${T.green}18` }}>
      <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5, background: T.surface, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: T.textDim, flex: 1 }}>
          {status === 'done' ? '\u2713 All files received' : `${msg.totalFiles} files \u2014 browse & pull`}
        </span>
        {status === 'available' && <>
          <button onClick={pullAll} className="btn btn-green btn-xs" title="Download all files preserving folder structure">\ud83d\udce5 Pull All</button>
          <button onClick={pullAsZip} className="btn btn-blue btn-xs" title="Download all files as a single ZIP">\ud83d\udce6 Pull as ZIP</button>
        </>}
        {status === 'pulling' && <span style={{ fontSize: 10, color: T.amber }}>\u27f3 Receiving\u2026</span>}
        {status === 'done' && <span style={{ fontSize: 10, color: T.green }}>\u2713 Received</span>}
      </div>
      {crumbs.length > 0 && <div style={{ padding: '3px 8px', display: 'flex', gap: 3, alignItems: 'center', background: T.panel, borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
        <button onClick={() => setCrumbs([])} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>{msg.name}</button>
        {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <span style={{ color: T.muted, fontSize: 10 }}>\u203a</span>
          <button onClick={() => setCrumbs(crumbs.slice(0, i + 1))} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>{s}</button>
        </span>)}
      </div>}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 6px' }}>
        {crumbs.length > 0 && <div className="sb-row" onClick={() => setCrumbs(c => c.slice(0, -1))} style={{ color: T.textDim, fontSize: 11, cursor: 'pointer' }}>\u21a9 ..</div>}
        {entries.map(([name, node]) => {
          const isDir = node.type === 'dir'
          const ext = (name.split('.').pop() || '').toLowerCase()
          const col = extCol[ext] || T.textDim
          const isDang = IS_DANGEROUS.test(name)
          const canPreview = !isDir && IS_VIEWABLE.test(name)
          const pulledFile = !isDir ? (msg.receivedFiles || []).find(f => f.name === name || (f.relPath || '').endsWith('/' + name)) : null
          const alreadyPulled = !!pulledFile
          return <div key={name} className="sb-row" style={{ cursor: isDir ? 'pointer' : 'default' }} onClick={() => isDir && setCrumbs([...crumbs, name])}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{isDir ? '\ud83d\udcc2' : (isDang ? '\u26a0\ufe0f' : alreadyPulled ? '\u2705' : '\ud83d\udcc4')}</span>
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDir ? T.amber : (alreadyPulled ? T.green : T.text) }}>{name}</span>
            {!isDir && <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>{fmtSz(node.size || 0)}</span>}
            {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>}
            {canPreview && alreadyPulled && pulledFile.blob && <button onClick={e => {
              e.stopPropagation()
              pulledFile.blob.text().then(text => setPreviewEntry({ name, type: IS_IMG.test(name) ? 'img' : 'text', content: text, blob: pulledFile.blob }))
            }} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '2px 5px', color: T.accent }} title="Preview file">\ud83d\udc41</button>}
            {canPreview && !alreadyPulled && status === 'available' && <button onClick={e => {
              e.stopPropagation()
              pullFile(node.index)
              setPreviewEntry({ name, type: 'loading', content: 'Pulling file\u2026' })
            }} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '2px 5px', color: T.textDim }} title="Pull and preview">\ud83d\udc41</button>}
            {!isDir && status === 'available' && !alreadyPulled && <button onClick={e => { e.stopPropagation(); pullFile(node.index) }} className="btn btn-blue btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '2px 5px' }} title="Download this file">\ud83d\udce5</button>}
            {isDir && <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>\u25b8</span>}
          </div>
        })}
        {!entries.length && <div style={{ textAlign: 'center', padding: 20, color: T.textDim, fontSize: 11 }}>Empty folder</div>}
      </div>
    </div>}
    <div style={{ padding: '0 11px 7px', fontSize: 10, color: T.muted, textAlign: 'right' }}>{msg.time}</div>
  </div>
}
