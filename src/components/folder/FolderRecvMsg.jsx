import { useState, useEffect } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz, fmtTime, IS_VIEWABLE, IS_DANGEROUS } from '../../utils/format.js'
import { createZipBlob } from '../../utils/zip.js'
import { FileInlineViewer } from '../file/FileInlineViewer.jsx'

export function FolderRecvMsg({ msg, folderDataRef, notify }) {
  const done = msg.complete
  const [expanded, setExpanded] = useState(false)
  const [autoZipping, setAutoZipping] = useState(false)

  const getFiles = () => (folderDataRef?.current?.[msg.folderFid]?.files || []).filter(Boolean)
  const files = getFiles()

  useEffect(() => {
    if (!done || !msg.pullAsZip || autoZipping) return
    const freshFiles = getFiles()
    if (freshFiles.length === 0) return
    setAutoZipping(true)
    ;(async () => {
      try {
        notify('\ud83d\udce6 Creating ZIP\u2026', 'info')
        const zipFiles = freshFiles.map(f => ({ name: f.relPath || f.name, blob: f.blob || null }))
        const zipBlob = await createZipBlob(zipFiles)
        if (window.ftps) {
          const r = new FileReader()
          r.onload = async () => await window.ftps.saveFile(msg.name + '.zip', r.result.split(',')[1])
          r.readAsDataURL(zipBlob)
        } else {
          const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob); a.download = msg.name + '.zip'; a.click()
        }
        notify('\ud83d\udce6 ZIP ready \u2014 choose save location', 'ok')
      } catch (e) {
        notify('ZIP failed: ' + e.message, 'err')
      } finally {
        setAutoZipping(false)
      }
    })()
  }, [done, msg.pullAsZip])

  const blobToB64 = f => new Promise((res, rej) => { if (!f.blob) { res(null); return }; const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f.blob) })
  const saveAll = async () => {
    const freshFiles = getFiles()
    if (freshFiles.length === 0) { notify('No files received yet', 'err'); return }
    const payload = await Promise.all(freshFiles.map(async f => ({ relPath: f.relPath || f.name, name: f.name, dataB64: f.blob ? await blobToB64(f) : null, tmpPath: f.tmpPath || null })))
    const r = await window.ftps?.saveToDir(payload, msg.name)
    if (r?.ok) notify?.(`Saved to ${r.dir}`, 'ok'); else if (!r?.canceled) notify?.('Save failed', 'err')
  }
  const saveOne = async f => {
    if (f.tmpPath) { await window.ftps?.saveFileFromTemp(f.tmpPath, f.name); return }
    if (!f.blob) return
    if (window.ftps) { const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(f.name, r.result.split(',')[1]); r.readAsDataURL(f.blob) }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; document.body.appendChild(a); a.click(); document.body.removeChild(a) }
  }

  return <div className="slide-in" style={{ background: T.green + '08', border: `1px solid ${T.green}22`, borderRadius: 10, maxWidth: '85%', minWidth: 220, overflow: 'hidden' }}>
    <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8, cursor: done ? 'pointer' : 'default' }} onClick={() => done && setExpanded(e => !e)}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>\ud83d\udcc2</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{msg.totalFiles} files \u00b7 {fmtSz(msg.totalBytes || 0)}</div>
      </div>
      <span className="stag" style={{ color: done ? T.green : T.amber, background: (done ? T.green : T.amber) + '12', border: `1px solid ${(done ? T.green : T.amber)}28`, flexShrink: 0 }}>
        {autoZipping ? '\ud83d\udce6 Zipping\u2026' : done ? (msg.pullAsZip ? '\ud83d\udce6 Saving ZIP\u2026' : '\u2713 Received') : `${msg.receivedCount || 0}/${msg.totalFiles}`}
      </span>
      {done && !autoZipping && <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0 }}>{expanded ? '\u25be' : '\u25b8'}</span>}
    </div>
    {!done && <div style={{ padding: '0 11px 9px' }}>
      <div className="prog prog-active" style={{ marginBottom: 3 }}><div className="prog-fill" style={{ width: `${msg.totalFiles > 0 ? Math.round((msg.receivedCount || 0) / msg.totalFiles * 100) : 0}%`, transition: 'width .3s' }} /></div>
      <div style={{ fontSize: 11, color: T.textDim, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>\u2193 {msg.receivedCount || 0} of {msg.totalFiles} files</span>
        <span>{msg.totalFiles > 0 ? Math.round((msg.receivedCount || 0) / msg.totalFiles * 100) : 0}%</span>
      </div>
      {(() => {
        const hist = msg.speedHistory || []
        if (hist.length < 2) return null
        const first = hist[0], last = hist[hist.length - 1]
        const dt = (last.t - first.t) / 1000
        if (dt <= 0) return null
        const speed = (last.b - first.b) / dt
        if (speed <= 0) return null
        const remBytes = (msg.totalBytes || 0) - (msg.bytesSent || 0)
        const eta = remBytes > 0 ? Math.round(remBytes / speed) : 0
        return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
          <span className="speed-badge" style={{ color: T.green }}>\u2193 {fmtSz(speed)}/s</span>
          <span style={{ fontSize: 10, color: T.muted }}>{eta > 0 ? `~${fmtTime(eta)} left` : ''}</span>
        </div>
      })()}
      {(() => {
        if (!msg.lastGotT) return null
        const stallMs = Date.now() - msg.lastGotT
        if (stallMs > 120000) return <div style={{ fontSize: 10, color: T.red, marginTop: 5 }}>\u274c Transfer stalled \u2014 sender may have disconnected</div>
        if (stallMs > 30000) return <div style={{ fontSize: 10, color: T.amber, marginTop: 5 }}>\u26a0 Waiting\u2026 ({Math.floor(stallMs / 1000)}s) \u2014 large files may take longer</div>
        return null
      })()}
    </div>}
    {done && expanded && <div style={{ borderTop: `1px solid ${T.green}20` }}>
      <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5, background: T.surface }}>
        <span style={{ fontSize: 10, color: T.textDim, flex: 1 }}>{files.length} file{files.length !== 1 ? 's' : ''} received</span>
        <button onClick={async () => {
          try {
            const freshFiles = getFiles()
            if (freshFiles.length === 0) { notify('No files to ZIP', 'err'); return }
            notify('Creating ZIP\u2026', 'info')
            const zipFiles = freshFiles.map(f => ({ name: f.relPath || f.name, blob: f.blob || null }))
            const zipBlob = await createZipBlob(zipFiles)
            if (window.ftps) {
              const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(msg.name + '.zip', r.result.split(',')[1]); r.readAsDataURL(zipBlob)
            } else {
              const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob); a.download = msg.name + '.zip'; a.click()
            }
            notify('ZIP ready \u2014 choose save location', 'ok')
          } catch (e) { notify('ZIP failed: ' + e.message, 'err') }
        }} className="btn btn-blue btn-xs">\ud83d\udce6 Save as ZIP</button>
        <button onClick={saveAll} className="btn btn-green btn-xs">\u2b07 Save All</button>
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 6px' }}>
        {files.map((f, i) => {
          const ext = (f.name || '').split('.').pop().toLowerCase()
          const col = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, json: T.amber }[ext] || T.textDim
          const canView = IS_VIEWABLE.test(f.name || '') && !!f.blob
          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 3px', borderBottom: `1px solid ${T.border}15` }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}>{IS_DANGEROUS.test(f.name || '') ? '\u26a0\ufe0f' : '\ud83d\udcc4'}</span>
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>{f.relPath || f.name}</span>
            <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>{fmtSz(f.size || 0)}</span>
            <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>
            {canView && <FileInlineViewer file={f} />}
            <button onClick={() => saveOne(f)} className="btn btn-green btn-xs" style={{ flexShrink: 0, padding: '2px 5px', fontSize: 9 }}>\u2b07</button>
          </div>
        })}
      </div>
    </div>}
    <div style={{ padding: '0 11px 7px', fontSize: 10, color: T.muted, textAlign: 'right' }}>{msg.time}</div>
  </div>
}
