import { useState } from 'react'
import { T } from '../../styles/theme.js'

export function HelpModal({ onClose, inline = false }) {
  const [tab, setTab] = useState('connect')
  const R = ({ l, v, c, icon }) => <div style={{ display: 'grid', gridTemplateColumns: '20px 150px 1fr', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}15`, alignItems: 'center' }}><span style={{ fontSize: 13, textAlign: 'center' }}>{icon || '\u2022'}</span><span style={{ fontSize: 12, color: T.textDim, fontWeight: 500 }}>{l}</span><span style={{ fontSize: 12, color: c || T.text, fontWeight: 500 }}>{v}</span></div>
  const S = ({ n, col, title, body }) => <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${col}16`, border: `1.5px solid ${col}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: col }}>{n}</div>
    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: col, marginBottom: 3 }}>{title}</div><div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>{body}</div></div>
  </div>
  const tabs = ['connect', 'internet', 'security', 'sandbox']
  const content = <>
    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, background: `linear-gradient(135deg, ${T.panel}, ${T.surface})`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 18 }}>&#128737;&#65039;</span>
          <span style={{ fontSize: 15, color: T.accent, fontWeight: 800, letterSpacing: 1 }}>P2N Documentation</span>
        </div>
        <div style={{ fontSize: 10, color: T.textDim, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: T.green }}>&#9679;</span> Direct TCP &middot; ECDH P-256 &middot; AES-256-GCM &middot; TOFU Key Trust
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button onClick={() => window.ftps?.openExternal('https://github.com/official-imvoiid/P2N-Peer-Networking')} className="btn btn-ghost btn-sm">&#11088; GitHub</button>
        {!inline && <button onClick={onClose} className="btn btn-ghost btn-sm">&#10005;</button>}
      </div>
    </div>
    <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>
      {tabs.map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: tab === t ? T.accent : T.textDim, borderBottom: `2px solid ${tab === t ? T.accent : 'transparent'}`, cursor: 'pointer', fontWeight: tab === t ? 700 : 400, fontSize: 11, transition: 'all .12s', letterSpacing: .5 }}>
        {t === 'connect' ? '\ud83d\udd17 Connect' : t === 'internet' ? '\ud83c\udf10 Internet' : t === 'security' ? '\ud83d\udee1 Security' : '\ud83d\udce6 Sandbox'}
      </button>)}
    </div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
      {tab === 'connect' && <>
        <div style={{ background: `linear-gradient(135deg, ${T.accent}08, ${T.green}06)`, border: `1px solid ${T.accent}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>&#9889; Quick Start</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>One peer listens. The other dials. No servers required. Same network peers are <strong style={{ color: T.green }}>auto-discovered</strong> via mDNS. For internet connections, start Tor and share your onion address.</div>
        </div>
        <S n="1" col={T.blue} title="Start Listening" body="Connect tab \u2192 Start Listening (default port 7900). mDNS discovery starts automatically \u2014 nearby peers on the same network appear in the My Network tab." />
        <S n="2" col={T.green} title="Same Network" body="Open My Network tab \u2014 nearby peers appear automatically with a one-click Connect button. No IP typing needed. This uses mDNS multicast (like AirDrop/Bonjour), fully local." />
        <S n="3" col={T.purple} title="Different Network (Tor)" body="Connect tab \u2192 Different Network \u2192 Start Tor \u2192 copy your onion address \u2192 share via Discord/Signal/any platform \u2192 peer pastes it into Connect via Onion \u2192 encrypted session begins." />
        <S n="4" col={T.accent} title="Fully E2E Encrypted" body="ECDH P-256 + Ed25519 handshake. Fresh AES-256-GCM keys every session via HKDF. Every message and file chunk encrypted before leaving your machine. No server, no relay \u2014 direct peer-to-peer." />
      </>}
      {tab === 'internet' && <>
        <div style={{ background: T.purple + '08', border: `1px solid ${T.purple}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>\ud83c\udf10 Connecting Across the Internet</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>P2N uses Tor hidden services for cross-network connections. No port forwarding, no public IP, no server \u2014 just share your onion address via any platform.</div>
        </div>
        <S n="1" col={T.purple} title="Start Tor" body="Connect tab \u2192 Different Network section \u2192 click 'Start Tor & Generate Link'. Tor starts automatically and generates your unique onion address for this session." />
        <S n="2" col={T.accent} title="Share your address" body="Copy your onion address (e.g. abc123xyz.onion:7900) and send it to your peer via Discord, Signal, Telegram, email \u2014 any platform. The address is just a routing token, not secret." />
        <S n="3" col={T.green} title="Peer connects" body="Your peer pastes the onion address into the 'Connect via Onion' field and clicks connect. Tor routes the connection anonymously \u2014 neither side learns the other's real IP." />
        <S n="4" col={T.amber} title="New address each session" body="Tor generates a fresh onion address every time the app starts. You need to share the new address with your peer each session. This is by design \u2014 no permanent footprint." />
        <div style={{ marginTop: 10, padding: '10px 14px', background: T.green + '0a', border: `1px solid ${T.green}22`, borderRadius: 6, fontSize: 12, color: T.green, lineHeight: 1.7 }}>\ud83d\udca1 <strong>Same network?</strong> Open My Network tab \u2014 peers are auto-discovered via mDNS, no address needed.</div>
      </>}
      {tab === 'security' && <>
        <div style={{ background: T.green + '08', border: `1px solid ${T.green}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>\ud83d\udee1 Security Architecture</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>Zero-trust, serverless, end-to-end encrypted with forward secrecy.</div>
        </div>
        <R icon="\ud83d\udd11" l="Key Exchange" v="ECDH P-256 \u2014 fresh keypair each session" c={T.green} />
        <R icon="\ud83d\udd12" l="Encryption" v="AES-256-GCM \u2014 every message, every chunk" c={T.green} />
        <R icon="\ud83c\udfb2" l="Nonce" v="12-byte random IV per frame" c={T.green} />
        <R icon="\ud83d\udd22" l="Replay guard" v="8-byte monotonic sequence counter per frame" c={T.green} />
        <R icon="\u270d\ufe0f" l="Identity" v="Ed25519 \u2014 signs every handshake, MITM-proof" c={T.green} />
        <R icon="\u2713" l="Auth Tag" v="16-byte GCM \u2014 tamper detection per frame" c={T.green} />
        <R icon="\ud83d\udd0c" l="Transport" v="Direct TCP (no relay, no server)" c={T.blue} />
        <R icon="\u2298" l="Servers" v="None \u2014 fully serverless P2P" c={T.accent} />
        <R icon="\ud83d\udce1" l="mDNS" v="Local network auto-discovery \u2014 nothing relayed" />
        <R icon="\ud83d\udcdd" l="Log" v="In-memory only \u00b7 Click log line to copy" />
        <R icon="\u270e" l="Rename limit" v="3 renames per session \u2014 anti-impersonation" c={T.amber} />
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.accent + '08', border: `1px solid ${T.accent}18`, borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, marginBottom: 5 }}>\ud83d\udd11 TOFU \u2014 Trust-On-First-Use (session-scoped)</div>
          <div style={{ fontSize: 11, color: T.textMid, lineHeight: 1.7 }}>On first connect this session, P2N stores the peer's <em>Ed25519 public key</em> in memory. If they reconnect with the same key \u2014 trusted \u2713. If the key changes mid-session \u2014 <span style={{ color: T.red, fontWeight: 600 }}>MITM warning</span>. TOFU resets when the app closes \u2014 this is intentional. P2N is designed for ephemeral secure sessions.</div>
        </div>
      </>}
      {tab === 'sandbox' && <>
        <div style={{ background: T.amber + '08', border: `1px solid ${T.amber}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>\ud83d\udee1 Sandbox & Archive Security</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>P2N offers two levels of file inspection: an in-app archive viewer (ZIP/TAR) and OS-level sandboxing (Windows Sandbox / Linux firejail). Both keep suspicious files away from your real system.</div>
        </div>
        <S n="1" col={T.blue} title="In-App Archive Viewer" body="ZIP and TAR files can be browsed directly inside P2N \u2014 click '\ud83d\udcc2 Browse' on the file card. Read-only, in-memory, nothing is extracted to disk. Preview text, images, and PDFs safely." />
        <S n="2" col={T.amber} title="OS Sandbox (Windows / Linux)" body="Click '\ud83d\udee1 Sandbox' on any archive or executable file. On Windows, this launches Windows Sandbox (Hyper-V VM) \u2014 a full isolated virtual machine. On Linux, firejail/bubblewrap creates a restricted namespace. Everything is deleted when the sandbox closes." />
        <S n="3" col={T.green} title="Save selectively" body="After inspecting, click \u2b07 on individual files to save to a location you choose. Nothing is auto-saved or auto-extracted to your real filesystem." />
        <S n="4" col={T.purple} title="AV scan" body="Click 'Explorer' to open the temp folder in your OS file manager \u2014 Windows Defender / ClamAV scans on access automatically. P2N also runs its own threat scanner on every received file (magic byte checks, polyglot detection, PDF/image analysis)." />
        <div style={{ marginTop: 12, padding: '10px 14px', background: T.red + '0a', border: `1px solid ${T.red}22`, borderRadius: 6, fontSize: 12, color: T.red, lineHeight: 1.7 }}>\u26a0 <strong>Never</strong> run executables directly. Use the sandbox to inspect, AV scan, then save to disk only if trusted.</div>
        <div style={{ marginTop: 8, padding: '10px 14px', background: T.green + '0a', border: `1px solid ${T.green}22`, borderRadius: 6, fontSize: 12, color: T.green, lineHeight: 1.7 }}>\ud83d\udca1 <strong>Requirements:</strong> Windows Sandbox requires Windows 10/11 Pro/Enterprise with virtualization enabled. Linux requires firejail or bubblewrap (<code style={{ background: T.panel, padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 11 }}>sudo apt install firejail</code>).</div>
      </>}
    </div>
  </>

  if (inline) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: T.bg, padding: 16 }} className="fadein">
    <div className="glass" style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', border: `1px solid ${T.border}`, flex: 1, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
      {content}
    </div>
  </div>

  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: '95vw', maxWidth: 850, height: 'min(85vh,750px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: '0 auto' }}>
      {content}
    </div>
  </div>
}
