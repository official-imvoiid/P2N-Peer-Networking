import { T } from '../../styles/theme.js'
import { fmtSz, fmtTime, IS_ARCH, IS_ARCH_VIEWABLE, IS_UNSUPPORTED_ARCH, IS_VIEWABLE, IS_DANGEROUS, IS_IMG, IS_PDF } from '../../utils/format.js'
import { stripMetadata } from '../../utils/threats.js'

export function FileMsg({ msg, onExtract, onPreview, onRevoke, onZipView, onOSSandbox, warnArch, notify }) {
  if (msg.type === 'revoked') return <div style={{ padding: '8px 11px', background: T.red + '06', border: `1px solid ${T.red}18`, borderRadius: 8, maxWidth: '68%', opacity: .75 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 15 }}>\ud83d\udeab</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>File Access Revoked</div>
        <div style={{ fontSize: 11, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.meta?.name || 'File'}</div>
      </div>
      <span style={{ fontSize: 9, color: T.muted }}>{msg.revokedAt || msg.time}</span>
    </div>
  </div>

  const isMe = msg.from === 'me', pct = msg.pct ?? 1, done = msg.type === 'file_done' || (msg.type === 'file_out' && pct >= 1)
  const isSending = msg.type === 'file_out' && pct < 1
  const isReceiving = msg.type === 'file_in'
  const isFailed = !!msg.sendFailed
  const statusTxt = isFailed ? '\u2717 Failed' : isSending ? `${Math.round(pct * 100)}%` : msg.type === 'file_out' ? '\u2713 Sent' : msg.type === 'file_done' ? '\u2713 Received' : msg.type === 'file_in' ? `${Math.round(pct * 100)}%` : '\u2026'
  const statusCol = isFailed ? T.red : done ? T.green : T.amber
  const fname = msg.meta?.name || ''
  const isArch = IS_ARCH.test(fname), isZipRar = IS_ARCH_VIEWABLE.test(fname), isDanger = IS_DANGEROUS.test(fname), isUnsupported = IS_UNSUPPORTED_ARCH.test(fname)
  const canView = !!(msg.blob) && !isArch && IS_VIEWABLE.test(fname)
  const cardClass = `file-card ${isFailed ? 'file-card-failed' : isSending ? 'file-card-sending' : done && isMe ? 'file-card-done' : done ? 'file-card-recv' : ''} slide-in`
  const save = async () => {
    if (msg.tmpPath && window.ftps) { await window.ftps.saveFileFromTemp(msg.tmpPath, msg.meta?.name || 'file'); return }
    if (!msg.blob) return
    if (window.ftps) { const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(msg.meta?.name || 'file', r.result.split(',')[1]); r.readAsDataURL(msg.blob) }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(msg.blob); a.download = msg.meta.name; document.body.appendChild(a); a.click(); document.body.removeChild(a) }
  }
  return <div className={cardClass} style={{ padding: '10px 12px', background: isFailed ? T.red + '08' : isMe ? T.blue + '0a' : T.surface, border: `1px solid ${isFailed ? T.red + '30' : isMe ? T.blue + '22' : T.border}`, maxWidth: '68%' }}>
    {msg.threats?.length > 0 && <div style={{ padding: '4px 8px', background: T.red + '12', border: `1px solid ${T.red}30`, borderRadius: 5, marginBottom: 6, fontSize: 10, color: T.red }}>
      \u26a0 Security threats: {msg.threats.join(' \u00b7 ')}
    </div>}
    {isDanger && <div style={{ padding: '4px 8px', background: T.amber + '10', border: `1px solid ${T.amber}28`, borderRadius: 5, marginBottom: 6, fontSize: 10, color: T.amber }}>\u26a0 Executable file \u2014 treat with caution</div>}
    {isUnsupported && <div style={{ padding: '4px 8px', background: T.red + '10', border: `1px solid ${T.red}28`, borderRadius: 5, marginBottom: 6, fontSize: 10, color: T.red }}>\u26a0 .{fname.split('.').pop()} is not supported \u2014 only ZIP and TAR archives can be browsed</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: done ? 7 : 5 }}>
      <span style={{ fontSize: 18, filter: isFailed ? 'grayscale(0.5)' : 'none' }}>{isFailed ? '\u26a0\ufe0f' : isArch ? '\ud83d\udce6' : '\ud83d\udcc4'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: isFailed ? T.red : T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.meta?.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{fmtSz(msg.meta?.size || 0)}</div>
      </div>
      <span className={`stag ${(isSending || isReceiving) ? 'stag-pulse' : ''}`} style={{ color: statusCol, background: statusCol + '14', border: `1px solid ${statusCol}30` }}>{statusTxt}</span>
    </div>
    {!done && !isFailed && <>
      <div className={`prog ${(isSending || isReceiving) ? 'prog-active' : ''}`} style={{ marginBottom: 4 }}><div className="prog-fill" style={{ width: `${pct * 100}%` }} /></div>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{fmtSz(Math.round((msg.meta?.size || 0) * pct))} / {fmtSz(msg.meta?.size || 0)}</span>
        <span style={{ fontWeight: 600 }}>{Math.round(pct * 100)}%</span>
      </div>
      {msg.calcSpeed > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: -2, marginBottom: 5 }}>
        <span className="speed-badge" style={{ color: T.accent }}>{isMe ? '\u2191' : '\u2193'} {fmtSz(msg.calcSpeed)}/s</span>
        <span style={{ fontSize: 10, color: T.muted }}>{msg.calcEta > 0 ? `~${fmtTime(msg.calcEta)} left` : ''}</span>
      </div>}
    </>}
    {isFailed && <div className="prog prog-fail" style={{ marginBottom: 4 }}><div className="prog-fill" style={{ width: '100%' }} /></div>}
    {isMe && !done && msg.pct !== undefined && msg.pct < 1 && (
      <button onClick={() => onRevoke?.(msg)} className="btn btn-danger btn-xs" style={{ marginTop: 5, width: '100%' }}>
        \u2715 Cancel Send
      </button>
    )}
    {isMe && msg.sendFailed && msg.failedFile && (
      <button onClick={() => msg.onRetry?.(msg.failedFile)} className="btn btn-retry btn-xs" style={{ marginTop: 5, width: '100%' }}>
        \ud83d\udd04 Retry Send
      </button>
    )}
    {msg.type === 'file_done' && (msg.blob || msg.tmpPath) && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      <button onClick={save} className="btn btn-green btn-xs" style={{ flex: 1 }}>\u2b07 Save</button>
      {isZipRar && msg.blob && <button onClick={() => onZipView?.(msg)} className="btn btn-blue btn-xs" style={{ flex: 1 }}>\ud83d\udcc2 Browse</button>}
      {isZipRar && !msg.blob && msg.tmpPath && <button onClick={async () => {
        notify('Reading archive\u2026', 'info')
        try {
          const result = await window.ftps?.extractArchiveFromPath(fname, msg.tmpPath)
          if (result?.ok) {
            onZipView?.({ ...msg, archivePath: msg.tmpPath, archiveTree: result.tree })
            notify('', 'ok')
          } else notify('Cannot browse large archive: ' + (result?.error || ''), 'err')
        } catch (e) {
          notify('Archive read failed: ' + (e.message || 'unknown error'), 'err')
        }
      }} className="btn btn-blue btn-xs" style={{ flex: 1 }}>\ud83d\udcc2 Browse</button>}
      {(isArch || isDanger) && <button onClick={() => onOSSandbox?.(msg)} className="btn btn-amber btn-xs" style={{ flex: 1 }}>\ud83d\udee1 Sandbox</button>}
      {!isArch && !isDanger && canView && <button onClick={() => onPreview?.(msg)} className="btn btn-blue btn-xs" style={{ flex: 1 }}>\ud83d\udc41 View</button>}
      {msg.blob && !isArch && (IS_IMG.test(fname) || IS_PDF.test(fname)) && (
        <button onClick={async () => {
          try {
            const stripped = await stripMetadata(msg.blob, fname)
            const r = new FileReader(); r.onload = async () => await window.ftps?.saveFile(fname, r.result.split(',')[1]); r.readAsDataURL(stripped)
            notify('Metadata stripped \u2014 choose save location', 'ok')
          } catch (e) { notify('Strip failed: ' + e.message, 'err') }
        }} className="btn btn-purple btn-xs" style={{ flex: 1 }} title="Remove EXIF/XMP/metadata then save">\ud83e\uddf9 Strip Meta</button>
      )}
    </div>}
    {isMe && done && (
      <button onClick={() => onRevoke?.(msg)} className="btn btn-ghost btn-xs" style={{ marginTop: 5, width: '100%', color: T.red, fontSize: 10, border: `1px solid ${T.red}20` }}>\ud83d\udeab Revoke Access</button>
    )}
    <div style={{ fontSize: 10, color: T.muted, marginTop: 5, textAlign: 'right' }}>{msg.time}</div>
  </div>
}
