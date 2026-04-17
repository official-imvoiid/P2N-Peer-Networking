import { useState, useEffect } from 'react'
import { T } from '../../styles/theme.js'
import { fmtSz } from '../../utils/format.js'

export function OSSandbox({ file, onClose }) {
  const [status, setStatus] = useState('idle')
  const [log, setLog] = useState([]), [platform, setPlatform] = useState(null)
  const fname = file?.meta?.name || file?.name || 'file'

  useEffect(() => { window.ftps?.getPlatform?.().then(p => setPlatform(p)) }, [])

  const addLog = msg => setLog(l => [...l, { t: new Date().toLocaleTimeString(), msg }])

  const launch = async () => {
    if (!file?.blob && !file?.tmpPath) { addLog('No file data in memory \u2014 save to disk first'); return }
    setStatus('launching'); addLog('Preparing isolated environment\u2026')
    try {
      let dataB64 = null
      if (file.blob) { const r = new FileReader(); dataB64 = await new Promise((res, rej) => { r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file.blob) }) }
      addLog(`Staging file: ${fname}`)
      const r = await window.ftps?.launchOSSandbox({ name: fname, dataB64, tmpPath: file.tmpPath || null })
      if (r?.ok) { setStatus('running'); addLog(r.message || 'Sandbox launched'); addLog('\u26a0 Do NOT trust files inside \u2014 do NOT save back to your system') }
      else if (r?.unsupported) { setStatus('unsupported'); addLog(r.message || 'OS sandbox not available on this system') }
      else { setStatus('error'); addLog(r?.error || 'Launch failed') }
    } catch (e) { setStatus('error'); addLog(e.message || 'Launch failed') }
  }

  const statusColor = { idle: T.textDim, launching: T.amber, running: T.green, error: T.red, unsupported: T.amber }[status]
  const statusIcon = { idle: '\u25cb', launching: '\u27f3', running: '\u25cf', error: '\u2717', unsupported: '\u26a0' }[status]

  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(560px,96vw)', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>\ud83d\udee1</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>OS Isolated Sandbox</div>
          <div style={{ fontSize: 10, color: T.textDim }}>Real OS-level isolation \u2014 file cannot affect your actual system</div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">\u2715</button>
      </div>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>\ud83d\udcc4</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>{fmtSz(file?.meta?.size || file?.size || 0)}</div>
        </div>
        <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{statusIcon} {status.toUpperCase()}</span>
      </div>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.textDim, lineHeight: 1.7 }}>
        {platform === 'win32' && <><div style={{ color: T.blue, fontWeight: 600, marginBottom: 4 }}>\ud83e\ude9f Windows Sandbox (Hyper-V VM)</div>
          <div>Creates a full Hyper-V virtual machine. Completely isolated from your real system. Everything inside is deleted when it closes.</div>
          <div style={{ marginTop: 4, color: T.amber }}>Requires: Windows 10/11 Pro/Enterprise &middot; virtualization enabled in BIOS</div></>}
        {platform === 'linux' && <><div style={{ color: T.orange, fontWeight: 600, marginBottom: 4 }}>\ud83d\udc27 Linux Sandbox (firejail / bubblewrap)</div>
          <div>Runs file in a restricted Linux namespace \u2014 isolated filesystem, network, and process tree. Cannot read home directory or affect system files.</div>
          <div style={{ marginTop: 4, color: T.amber }}>Requires: firejail or bubblewrap installed (sudo apt install firejail)</div></>}
        {platform === 'darwin' && <><div style={{ color: T.textMid, fontWeight: 600, marginBottom: 4 }}>\ud83c\udf4e macOS</div>
          <div style={{ color: T.amber }}>macOS sandbox not yet implemented. Use the archive viewer to inspect contents safely without extraction.</div></>}
        {!platform && <div style={{ color: T.textDim }}>Detecting platform\u2026</div>}
      </div>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, color: T.accent, letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>SECURITY TOOLS INSIDE SANDBOX</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {[
            { icon: '\ud83d\udd0d', name: 'View file contents', desc: 'Read-only inspection' },
            { icon: '\ud83e\udda0', name: 'ClamAV scan', desc: 'Open-source AV (if installed)' },
            { icon: '\ud83d\udcca', name: 'strings analysis', desc: 'Extract readable text strings' },
            { icon: '\ud83d\udd2c', name: 'file type check', desc: 'Verify actual magic-byte type' },
            { icon: '\ud83c\udf10', name: 'Network isolated', desc: 'No internet access from sandbox' },
            { icon: '\ud83d\udcbe', name: 'Temp filesystem', desc: 'Cannot write to real disk' },
          ].map((t, i) => <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '4px 6px', background: T.bg, borderRadius: 5, fontSize: 10 }}>
            <span style={{ flexShrink: 0 }}>{t.icon}</span>
            <div><div style={{ color: T.text, fontWeight: 600 }}>{t.name}</div><div style={{ color: T.textDim }}>{t.desc}</div></div>
          </div>)}
        </div>
      </div>
      {log.length > 0 && <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}`, maxHeight: 100, overflowY: 'auto', background: T.bg }}>
        {log.map((l, i) => <div key={i} style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace', lineHeight: 1.6 }}><span style={{ color: T.muted }}>{l.t}</span> {l.msg}</div>)}
      </div>}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Close</button>
        {status === 'unsupported' && <div style={{ flex: 2, fontSize: 11, color: T.amber, display: 'flex', alignItems: 'center', padding: '0 8px' }}>\u26a0 Not available on this system</div>}
        {status !== 'unsupported' && <button onClick={launch} className="btn btn-amber" style={{ flex: 2 }} disabled={status === 'launching' || status === 'running'}>
          {status === 'idle' ? '\ud83d\ude80 Launch Sandbox' : status === 'launching' ? '\u27f3 Launching\u2026' : '\u2713 Running \u2014 close the sandbox window when done'}
        </button>}
      </div>
      <div style={{ padding: '4px 16px 10px', fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
        \u26a0 Never enter passwords, banking details, or sensitive info inside the sandbox environment.
      </div>
    </div>
  </div>
}
