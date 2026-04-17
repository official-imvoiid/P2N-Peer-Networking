import React from 'react';
import { T } from '../../styles/theme.js';
import { fmtMin } from '../../utils/format.js';

export function SettingsTab({ sett, setSett2, lockTimer, listenPort, setListenPort, listenActive, torStatus, setTorStatus, setOnionAddr, setTorError, blockedPeers, setBlockedPeers, notify, doTerminate, setTab }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">
      <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>⚙ SETTINGS</div>
      <div className="card" style={{ padding: 14, marginBottom: 11 }}>
        <div className="sh">Security</div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, fontSize: 12, color: T.text }}>Auto-lock after inactivity (minutes)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSett2(p => ({ ...p, lockMin: Math.max(1, p.lockMin - 1) }))} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 14 }}>−</button>
            <span style={{ fontSize: 13, color: T.accent, width: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sett.lockMin}</span>
            <button onClick={() => setSett2(p => ({ ...p, lockMin: Math.min(60, p.lockMin + 1) }))} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 14 }}>+</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: lockTimer < 60 ? T.red : lockTimer < 180 ? T.amber : T.muted, padding: '4px 0 2px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>🔒 Locks in {fmtMin(lockTimer)}</div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text }}>Max unlock attempts</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Session wipes after this many wrong tries</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => { const v = Math.max(3, sett.maxTries - 1); setSett2(p => ({ ...p, maxTries: v })); window.ftps?.setMaxRetries(v) }} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 14 }}>−</button>
            <span style={{ fontSize: 13, color: T.accent, width: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sett.maxTries}</span>
            <button onClick={() => { const v = Math.min(10, sett.maxTries + 1); setSett2(p => ({ ...p, maxTries: v })); window.ftps?.setMaxRetries(v) }} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 14 }}>+</button>
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 11 }}>
        <div className="sh">Network</div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text }}>Listen Port</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
              {listenActive ? '⚠ Stop listening first to change port' : 'Enter port → Save. Takes effect on next session start.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min="1024" max="65535"
              value={listenPort}
              onChange={e => setListenPort(e.target.value)}
              className="inp"
              style={{ width: 80, padding: '4px 8px', fontSize: 12, textAlign: 'center' }}
              disabled={listenActive}
            />
            <button
              onClick={async () => {
                const p = Math.max(1024, Math.min(65535, parseInt(listenPort) || 7000))
                setListenPort(String(p))
                const r = await window.ftps?.savePort(p)
                if (r?.ok) notify(`Port ${r.port} saved — takes effect on next session start`, 'ok')
              }}
              className="btn btn-green btn-xs"
              disabled={listenActive}
              title="Save port permanently"
            >💾 Save</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text }}>Tor Daemon</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{torStatus === 'running' ? '● Running' : torStatus === 'starting' ? '⟳ Starting — please wait…' : '○ Off'}</div>
          </div>
          <button onClick={async () => {
            if (torStatus === 'starting') { notify('Please wait — Tor is still initializing', 'info'); return }
            const next = !sett.torEnabled
            setSett2(p => ({ ...p, torEnabled: next }))
            await window.ftps?.setTorEnabled(next)
            if (next) {
              const s = await window.ftps?.getTorStatus()
              if (s) { setTorStatus(s.running ? 'running' : 'off'); if (s.onionAddress) setOnionAddr(s.onionAddress + ':' + (s.socksPort || 7000)) }
            } else { setTorStatus('off'); setOnionAddr(''); setTorError('') }
          }} className="btn btn-xs" title={torStatus === 'starting' ? 'Please wait — Tor is initializing' : ''} disabled={torStatus === 'starting'} style={{ background: sett.torEnabled ? T.purple + '16' : T.panel, border: `1px solid ${sett.torEnabled ? T.purple : T.border}`, color: sett.torEnabled ? T.purple : T.textDim, minWidth: 36, opacity: torStatus === 'starting' ? 0.5 : 1 }}>
            {sett.torEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 11 }}>
        <div className="sh">Preferences</div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text }}>Warning on external links</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Applies to URLs and markdown [links] sent in chat</div>
          </div>
          <button onClick={() => setSett2(p => ({ ...p, warnLinks: !p.warnLinks }))} className="btn btn-xs" style={{ background: sett.warnLinks ? T.accent + '16' : T.panel, border: `1px solid ${sett.warnLinks ? T.accent : T.border}`, color: sett.warnLinks ? T.accent : T.textDim, minWidth: 36 }}>
            {sett.warnLinks ? 'ON' : 'OFF'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, fontSize: 12, color: T.text }}>Archive security warnings</div>
          <button onClick={() => setSett2(p => ({ ...p, warnArch: !p.warnArch }))} className="btn btn-xs" style={{ background: sett.warnArch ? T.accent + '16' : T.panel, border: `1px solid ${sett.warnArch ? T.accent : T.border}`, color: sett.warnArch ? T.accent : T.textDim, minWidth: 36 }}>
            {sett.warnArch ? 'ON' : 'OFF'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, fontSize: 12, color: T.text }}>Markdown rendering</div>
          <button onClick={() => setSett2(p => ({ ...p, md: !p.md }))} className="btn btn-xs" style={{ background: sett.md ? T.accent + '16' : T.panel, border: `1px solid ${sett.md ? T.accent : T.border}`, color: sett.md ? T.accent : T.textDim, minWidth: 36 }}>
            {sett.md ? 'ON' : 'OFF'}
          </button>
        </div>
        {/* scanFiles toggle */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text }}>Security scan incoming files</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Detect threats in PDFs, images, polyglot files</div>
          </div>
          <button onClick={() => setSett2(p => ({ ...p, scanFiles: !p.scanFiles }))} className="btn btn-xs" style={{ background: sett.scanFiles ? T.green + '16' : T.panel, border: `1px solid ${sett.scanFiles ? T.green : T.border}`, color: sett.scanFiles ? T.green : T.textDim, minWidth: 36 }}>
            {sett.scanFiles ? 'ON' : 'OFF'}
          </button>
        </div>
        {/* EXIF / Metadata strip on send */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text }}>Strip metadata before sending</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Removes EXIF, XMP, IPTC from JPG/PNG · /Info from PDF</div>
          </div>
          <button onClick={() => setSett2(p => ({ ...p, exifStripSend: !p.exifStripSend }))} className="btn btn-xs" style={{ background: sett.exifStripSend ? T.green + '16' : T.panel, border: `1px solid ${sett.exifStripSend ? T.green : T.border}`, color: sett.exifStripSend ? T.green : T.textDim, minWidth: 36 }}>
            {sett.exifStripSend ? 'ON' : 'OFF'}
          </button>
        </div>
        {/* EXIF / Metadata strip on receive */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text }}>Strip metadata on receive</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Auto-strips EXIF/XMP from received images &amp; PDFs before saving</div>
          </div>
          <button onClick={() => setSett2(p => ({ ...p, exifStripRecv: !p.exifStripRecv }))} className="btn btn-xs" style={{ background: sett.exifStripRecv ? T.green + '16' : T.panel, border: `1px solid ${sett.exifStripRecv ? T.green : T.border}`, color: sett.exifStripRecv ? T.green : T.textDim, minWidth: 36 }}>
            {sett.exifStripRecv ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      {/* Blocked Peers management */}
      <div className="card" style={{ padding: 14, marginBottom: 11 }}>
        <div className="sh">Blocked Peers</div>
        {blockedPeers.length === 0 ? (
          <div style={{ fontSize: 11, color: T.textDim, padding: '8px 0' }}>No blocked peers</div>
        ) : blockedPeers.map(bp => (
          <div key={bp.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${T.border}30`, gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{bp.name || bp.id}</div>
              <div style={{ fontSize: 10, color: T.textDim }}>{bp.id} · Blocked {bp.blockedAt?.slice(0, 10) || ''}</div>
            </div>
            <button onClick={async () => {
              await window.ftps?.unblockPeer(bp.id)
              setBlockedPeers(prev => prev.filter(b => b.id !== bp.id))
              notify(`${bp.name || bp.id} unblocked — they can now connect again`, 'ok')
              setTimeout(() => setTab('network'), 400)
            }} className="btn btn-ghost btn-xs" style={{ color: T.green }}>Unblock</button>
          </div>
        ))}
      </div>
      {/* Session Model — ephemeral by design */}
      <div className="card" style={{ padding: 14, marginBottom: 11, border: `1px solid ${T.green}30`, background: `${T.green}05` }}>
        <div className="sh" style={{ color: T.green }}>Session Model</div>
        <div style={{ fontSize: 12, color: T.text, marginBottom: 8, fontWeight: 600 }}>🔒 Ephemeral by design — nothing stored between sessions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['🔑', 'Identity keypair', 'Fresh ED25519 keys generated every launch — in memory only'],
            ['🤝', 'TOFU peer trust', 'Verified this session only — resets on close'],
            ['🚫', 'Blocked peers', 'Session-only — cleared on close'],
            ['💬', 'Messages & files', 'Never written to disk by P2N'],
            ['🧅', 'Onion address', 'New address each session — share via Signal/Discord each time'],
          ].map(([icon, label, desc]) => (
            <div key={label} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13, marginTop: 1 }}>{icon}</span>
              <div>
                <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{label}: </span>
                <span style={{ fontSize: 11, color: T.textDim }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: '7px 10px', background: T.accent + '0a', border: `1px solid ${T.accent}18`, borderRadius: 6, fontSize: 11, color: T.textDim, lineHeight: 1.6 }}>
          💡 <strong style={{ color: T.text }}>Workflow:</strong> Start app → Tor generates onion address → share it via Discord / Signal → peer pastes and connects → encrypted session begins. Every session is fresh.
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 11 }}>
        <div className="sh">Session</div>
        <button onClick={doTerminate} className="btn btn-danger" style={{ width: '100%', padding: 11, fontSize: 13, marginTop: 6 }}>🚪 End Session</button>
        <div style={{ fontSize: 11, color: T.textDim, marginTop: 6, textAlign: 'center' }}>Disconnects all peers and wipes all session data</div>
      </div>
      <div style={{ padding: '10px 14px', background: T.panel, borderRadius: 8, fontSize: 12, color: T.textDim, lineHeight: 1.7 }}>
        <div>🔒 Zero persistence — identity, peers, messages never written to disk</div>
        <div style={{ marginTop: 3 }}>🧅 Share your onion address each session via any platform</div>
        <div style={{ marginTop: 3 }}>🛡 Archives extracted to isolated OS temp folder</div>
        <div style={{ marginTop: 3 }}>🔑 ECDH P-256 + Ed25519 + AES-256-GCM — fresh keys every session</div>
      </div>
    </div>
  );
}
