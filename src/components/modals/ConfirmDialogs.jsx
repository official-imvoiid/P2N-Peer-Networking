import { T } from '../../styles/theme.js'

export function LinkConfirmDialog({ url, onClose }) {
  return (
    <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 320, padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Open External Link?</div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 18, lineHeight: 1.5, wordBreak: 'break-all' }}>This will open your browser to:<br /><span style={{ color: T.accent, fontWeight: 600 }}>{url}</span></div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        <button onClick={() => { window.ftps?.openExternal(url); onClose() }} className="btn btn-primary" style={{ flex: 1 }}>Open</button>
      </div>
    </div></div>
  )
}

export function ArchiveConfirmDialog({ onClose, onExtract }) {
  return (
    <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 340, padding: 22, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Sandbox Archive?</div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 18, lineHeight: 1.6 }}>This will extract the file to an isolated <strong>Sandbox</strong>. You should scan the contents for threats before opening any files.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        <button onClick={onExtract} className="btn btn-amber" style={{ flex: 1 }}>Extract to Sandbox</button>
      </div>
    </div></div>
  )
}

export function DangerFileConfirmDialog({ file, onClose, onSendAnyway }) {
  return (
    <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 380, padding: 22, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: T.red }}>Send Executable File?</div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10, lineHeight: 1.6 }}>You are about to send an <strong style={{ color: T.amber }}>executable file</strong>:</div>
      <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 10, padding: '6px 10px', background: T.panel, borderRadius: 6, border: `1px solid ${T.red}30`, wordBreak: 'break-all' }}>{file?.name}</div>
      <div style={{ fontSize: 11, color: T.amber, marginBottom: 18, lineHeight: 1.6 }}>⚠ Executable files (.exe, .dll, .msi, .bat, etc.) can be dangerous. The receiver will see a security warning. Only send executables you trust.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        <button onClick={onSendAnyway} className="btn btn-danger" style={{ flex: 1 }}>⚠ Send Anyway</button>
      </div>
    </div></div>
  )
}

export function RemovePeerConfirmDialog({ peerName, onClose, onRemove }) {
  return (
    <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 340, padding: 22, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🔌</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Remove {peerName || 'Peer'}?</div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10, lineHeight: 1.6 }}>This will <strong style={{ color: T.red }}>remove this peer from your list</strong> and close the connection on your side.</div>
      <div style={{ fontSize: 11, color: T.amber, marginBottom: 18, lineHeight: 1.5 }}>⚠ <strong>They will NOT be notified</strong> — on their screen, you will appear as disconnected but they will still see you in their peer list until they remove you or restart.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        <button onClick={onRemove} className="btn btn-danger" style={{ flex: 1 }}>Remove from My List</button>
      </div>
    </div></div>
  )
}

export function RenameConfirmDialog({ newName, renameCount, onClose, onRename }) {
  return (
    <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 380, padding: 22, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>✎</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Rename</div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 14, lineHeight: 1.6, textAlign: 'left' }}>Your new name <strong style={{ color: T.accent }}>{newName}</strong> will be broadcast to all connected peers. No disconnection required.</div>
      <div style={{ fontSize: 11, color: renameCount >= 2 ? T.amber : T.muted, marginBottom: 18, padding: '5px 10px', background: T.panel, borderRadius: 5 }}>
        ✎ {renameCount} / 3 renames used this session
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        <button onClick={onRename} className="btn btn-green" style={{ flex: 1 }}>Rename</button>
      </div>
    </div></div>
  )
}
