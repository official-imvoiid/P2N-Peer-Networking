import { useState, useEffect, useRef, useCallback } from 'react'
import { generateKeyPair, exportPublicKey } from './lib/crypto.js'
import { P2PNode } from './lib/webrtc.js'

// ── THEME — Professional formal dark UI ──────────────────────────────────────
const T = {
  bg: '#0f1117', surface: '#161b22', panel: '#1c2330', border: '#253040',
  borderHi: '#30404f', accent: '#4a90d9', accentDim: '#2d6aa8', accentFaint: '#4a90d914',
  blue: '#58a6e8', amber: '#d4a017', red: '#e05555', green: '#3dba8a',
  purple: '#9b8ec4', text: '#c8d3dc', textDim: '#6e8496', textMid: '#8fa4b4', null_: '#3a4a58',
}

// ── GLOBAL CSS ────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;background:${T.bg}}
body{font-family:'Inter',system-ui,sans-serif;color:${T.text};overflow:hidden;font-size:14px}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:${T.bg}}
::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
input,textarea,button,select{font-family:inherit;font-size:inherit}
input:focus,textarea:focus,select:focus{outline:none}
button{cursor:pointer}
button:active:not(:disabled){transform:scale(.98)}

@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes spin{to{transform:rotate(360deg)}}

.fadeup{animation:fadeUp .22s ease both}
.fadein{animation:fadeIn .15s ease both}
.blinkAnim{animation:blink 1s step-end infinite}
.spin{animation:spin 1s linear infinite}

/* CARD */
.card{background:${T.surface};border:1px solid ${T.border};border-radius:8px}

/* INPUTS */
.inp{width:100%;background:${T.bg};border:1px solid ${T.border};border-radius:6px;padding:10px 13px;color:${T.text};font-size:13px;font-family:inherit;transition:border-color .15s;line-height:1.4}
.inp:focus{border-color:${T.accentDim}}
.inp.err{border-color:${T.red}!important}
.inp::placeholder{color:${T.null_}}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:6px;padding:9px 18px;font-size:12px;font-weight:500;letter-spacing:.2px;transition:opacity .12s,background .12s;cursor:pointer}
.btn:hover:not(:disabled){filter:brightness(1.08)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn-accent{background:${T.accent};color:#fff;font-weight:600}
.btn-ghost{background:transparent;border:1px solid ${T.border};color:${T.textDim}}
.btn-ghost:hover{border-color:${T.borderHi};color:${T.textMid}}
.btn-danger{background:${T.red}15;border:1px solid ${T.red}40;color:${T.red}}
.btn-blue{background:${T.blue}15;border:1px solid ${T.blue}40;color:${T.blue}}
.btn-amber{background:${T.amber}15;border:1px solid ${T.amber}40;color:${T.amber}}
.btn-green{background:${T.green}15;border:1px solid ${T.green}40;color:${T.green}}
.btn-purple{background:${T.purple}15;border:1px solid ${T.purple}40;color:${T.purple}}
.btn-sm{padding:5px 10px;font-size:11px}
.btn-xs{padding:3px 8px;font-size:10px}

/* SIDEBAR */
.sbtn{display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;background:transparent;border:none;border-left:3px solid transparent;color:${T.textDim};font-size:12px;font-weight:500;font-family:inherit;text-align:left;cursor:pointer;transition:all .12s}
.sbtn:hover{background:${T.panel};color:${T.text}}
.sbtn.act{background:${T.accentFaint};border-left-color:${T.accent};color:${T.accent}}

/* PEER ROW */
.prow{display:flex;align-items:center;gap:12px;padding:11px 14px;cursor:pointer;transition:background .12s;border-bottom:1px solid ${T.border}}
.prow:hover{background:${T.panel}}
.prow.sel{background:${T.accentFaint}}

/* MSG BUBBLES */
.bub{max-width:72%;border-radius:8px;padding:10px 14px;font-size:13px;line-height:1.6;word-break:break-word;position:relative}
.bub-me{background:${T.accent}18;border:1px solid ${T.accent}35}
.bub-them{background:${T.surface};border:1px solid ${T.border}}
.bub-sys{background:transparent;border:1px solid ${T.border};color:${T.textDim};font-size:11px;border-radius:20px;padding:4px 14px;max-width:100%;text-align:center}

/* CODE EDITOR */
.code-editor{background:#0a0e14;border:1px solid ${T.border};border-radius:6px;padding:12px;font-family:'Courier New',monospace;font-size:13px;color:#7ee787;resize:vertical;width:100%;min-height:260px;line-height:1.7;tab-size:2}
.code-editor:focus{border-color:${T.accentDim};outline:none}

/* CODE BLOCK IN CHAT */
.codeblock{background:#0a0e14;border:1px solid ${T.border};border-left:3px solid ${T.accentDim};border-radius:6px;padding:12px 14px;margin:6px 0;overflow-x:auto}
.codeblock pre{font-family:'Courier New',monospace;font-size:12px;color:#7ee787;white-space:pre;margin:0}
.codeblock-lang{font-size:9px;color:${T.textDim};text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px}
.icode{background:${T.panel};padding:1px 6px;border-radius:3px;color:${T.blue};font-size:12px}
.linkwarn{color:${T.amber};text-decoration:underline dashed;cursor:pointer}

/* TAB BAR */
.tabbar{display:flex;border-bottom:1px solid ${T.border};background:${T.surface}}
.tab{padding:10px 16px;font-size:12px;border:none;background:transparent;color:${T.textDim};border-bottom:2px solid transparent;cursor:pointer;font-weight:500;transition:all .12s}
.tab:hover{color:${T.text}}
.tab.act{color:${T.accent};border-bottom-color:${T.accent}}

/* STATUS DOT */
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot-on{background:${T.green}}
.dot-off{background:${T.null_}}

/* SANDBOX FRAME */
.sandbox-frame{border:0;width:100%;height:100%;background:#0a0e14;border-radius:6px}

/* PROGRESS BAR */
.prog-track{height:3px;background:${T.border};border-radius:2px;overflow:hidden}
.prog-fill{height:100%;border-radius:2px;transition:width .3s ease;background:${T.accent}}
.prog-fill-blue{background:${T.blue}}

/* ATTACH MENU */
.attach-item{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;font-size:13px;color:${T.text};border-bottom:1px solid ${T.border};background:transparent;border:none;width:100%;text-align:left}
.attach-item:hover{background:${T.panel}}
.attach-item:last-child{border-bottom:none}
.attach-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}

/* MODAL OVERLAY */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}

/* CODE COPY BUTTON */
.cbtn{background:${T.surface};border:1px solid ${T.border};color:${T.textDim};font-size:10px;padding:2px 8px;border-radius:3px;cursor:pointer;font-family:inherit}
.cbtn:hover{background:${T.panel};color:${T.text}}

/* STATUS TAGS */
.stag{font-size:10px;letter-spacing:.2px;padding:2px 7px;border-radius:4px;font-weight:500}

@media(max-width:900px){.hide-md{display:none!important}}
@media(max-width:640px){.hide-sm{display:none!important};.rpanel{position:absolute!important;z-index:40;inset-y:0;right:0;width:100%!important}}
`

// ── UTILS ─────────────────────────────────────────────────────────────────────
const fmt = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const fmtMin = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const fmtSz = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B'
const now8 = () => new Date().toTimeString().slice(0, 8)
const escH = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function renderMD(text) {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => {
      const id = 'cb_' + Math.random().toString(36).slice(2, 8)
      const escaped = escH(c.trim())
      return `<div class="codeblock"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span class="codeblock-lang">${l || 'code'}</span><button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent);this.textContent='✓ Copied';setTimeout(()=>this.textContent='⎘ Copy',1500)" class="cbtn">⎘ Copy</button></div><pre id="${id}">${escaped}</pre></div>`
    })
    .replace(/`([^`]+)`/g, '<code class="icode">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:${T.text}">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#{3}\s(.+)$/gm, '<div style="color:${T.accent};font-weight:700;margin:8px 0 4px">$1</div>')
    .replace(/^#{2}\s(.+)$/gm, '<div style="color:${T.accent};font-weight:700;font-size:15px;margin:8px 0 4px">$1</div>')
    .replace(/^#\s(.+)$/gm, '<div style="color:${T.accent};font-weight:700;font-size:16px;margin:8px 0 4px">$1</div>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<span class="linkwarn" title="⚠ External link — verify before opening">⚠ $1</span>')
    .replace(/\n/g, '<br>')
}

async function detectIP() {
  return new Promise(resolve => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pc.createDataChannel('')
      const ips = new Set()
      pc.onicecandidate = e => {
        if (!e?.candidate) {
          pc.close()
          resolve(ips.size ? [...ips].join(', ') : 'N/A')
          return
        }
        // Match IPv4 in candidate string
        const m = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(e.candidate.candidate)
        if (m) {
          const ip = m[1]
          // Keep private/LAN addresses only (not 127.x loopback)
          if (
            ip.startsWith('192.168.') ||
            ip.startsWith('10.') ||
            ip.startsWith('169.254.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
          ) ips.add(ip)
        }
      }
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => resolve('N/A'))
      // Fallback after 5 seconds
      setTimeout(() => { pc.close(); resolve(ips.size ? [...ips].join(', ') : 'N/A') }, 5000)
    } catch { resolve('N/A') }
  })
}

function makeNodeId(name) {
  const h = [...name].reduce((a, c, i) => ((a << 5) - a + c.charCodeAt(0) * (i + 7)) | 0, 0)
  return '#' + Math.abs(h).toString(16).padStart(4, '0').toUpperCase()
}

// ── MINI QR ───────────────────────────────────────────────────────────────────
function QR({ value, sz = 9 }) {
  const n = 19, seed = [...value].reduce((a, c, i) => a ^ (c.charCodeAt(0) * (i + 7)), 42)
  const cells = Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n), c = i % n
    const corner = (r < 5 && c < 5) || (r < 5 && c >= n - 5) || (r >= n - 5 && c < 5)
    if (corner) return (r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2)) ? 1 : 0
    return ((seed * (r + 3) ^ (c * 13)) % 3 === 0) ? 1 : 0
  })
  return <div style={{ background: '#fff', padding: 7, borderRadius: 5, display: 'inline-block' }}><div style={{ display: 'grid', gridTemplateColumns: `repeat(${n},${sz}px)` }}>{cells.map((b, i) => <div key={i} style={{ width: sz, height: sz, background: b ? '#020507' : '#fff' }} />)}</div></div>
}

// ── NOTIF ─────────────────────────────────────────────────────────────────────
function Notif({ n }) {
  if (!n) return null
  const c = n.t === 'ok' ? T.green : n.t === 'err' ? T.red : T.blue
  return <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 600, background: T.surface, border: `1px solid ${c}70`, borderRadius: 8, padding: '11px 16px', color: c, fontSize: 13, maxWidth: 320, animation: 'fadeIn .2s ease', boxShadow: '0 6px 24px rgba(0,0,0,.6)', lineHeight: 1.5 }}>{n.msg}</div>
}

// ── RANDOM PASSPHRASE GENERATOR ───────────────────────────────────────────
const WORDS = [
  'apple', 'bridge', 'cloud', 'delta', 'eagle', 'flint', 'grove', 'harbor', 'inlet', 'jade',
  'kite', 'lemon', 'maple', 'noble', 'orbit', 'pilot', 'quartz', 'river', 'stone', 'tiger',
  'umbra', 'vault', 'walnut', 'xenon', 'yield', 'zinc', 'amber', 'basin', 'cedar', 'drift',
  'ember', 'field', 'grain', 'haven', 'ivory', 'jewel', 'knoll', 'lunar', 'marsh', 'north',
  'ocean', 'prism', 'quest', 'ridge', 'solar', 'thorn', 'urban', 'vista', 'wheat', 'axiom',
  'bench', 'coral', 'depot', 'fable', 'glade', 'heron', 'ichor', 'jasper', 'kudos', 'lance',
  'merit', 'nexus', 'oaken', 'plaza', 'quota', 'realm', 'sigma', 'table', 'ultra', 'valor',
  'waves', 'xerus', 'yeoman', 'zonal', 'agate', 'bluff', 'chalk', 'dusky', 'epoch', 'fjord',
  'glint', 'haven', 'islet', 'joust', 'kyrie', 'ledge', 'manor', 'notch', 'optic', 'plum',
]
function genPhrase() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]
  return `${pick()}-${pick()}-${pick()}-${pick()}`
}

// ── AVATAR ──────────────────────────────────────────────────────────────────────
function Avatar({ name, id, size = 40, online, isUnknown }) {
  const raw = name?.trim() || ''
  const hasName = raw.length > 0
  // If no name set, show spy silhouette instead of initials
  if (!hasName || isUnknown) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: `hsl(220,15%,18%)`, border: `2px solid ${online !== undefined ? (online ? T.accent : T.null_) : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
        <img src="/spy-avatar.svg" alt="Anonymous peer" style={{ width: Math.round(size * 0.75), height: Math.round(size * 0.75), objectFit: 'contain', filter: 'invert(0.85) brightness(0.9)', opacity: 0.85 }} />
        {online !== undefined && <div className={`dot ${online ? 'dot-on' : 'dot-off'}`} style={{ position: 'absolute', bottom: 1, right: 1, width: Math.round(size * 0.22), height: Math.round(size * 0.22) }} />}
      </div>
    )
  }
  const initials = raw.length >= 2
    ? (raw[0] + raw[raw.length - 1]).toUpperCase()
    : raw[0].toUpperCase()
  const hue = Math.abs([...(name || id || 'X')].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `hsl(${hue},20%,20%)`, border: `2px solid ${online ? T.accent : T.null_}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: online ? `hsl(${hue},60%,72%)` : T.textDim, fontSize: Math.round(size * 0.36), flexShrink: 0, position: 'relative', letterSpacing: '-0.5px' }}>
      {initials}
      {online !== undefined && <div className={`dot ${online ? 'dot-on' : 'dot-off'}`} style={{ position: 'absolute', bottom: 1, right: 1, width: Math.round(size * 0.22), height: Math.round(size * 0.22) }} />}
    </div>
  )
}

// ── SANDBOX FOLDER BROWSER ────────────────────────────────────────────────────
function SandboxFolder({ folder, onClose }) {
  const [path, setPath] = useState([])
  const [sel, setSel] = useState(null)
  const extC = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, jpeg: T.purple, gif: T.purple, zip: '#f97316', gz: '#f97316', tar: '#f97316', rar: '#f97316', docx: '#3b82f6', xlsx: '#22c55e', pptx: '#f97316', txt: T.textMid, csv: T.green, html: T.amber, css: T.blue, json: T.amber, sh: T.red }
  const cur = path.reduce((node, seg) => node?.children?.[seg], folder)
  const entries = Object.entries(cur?.children ?? folder?.children ?? {})

  const download = (name, node) => {
    if (node.blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(node.blob); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href) }
    else if (node.content) { const b = new Blob([node.content], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href) }
    else alert('File data not available — only the file tree was shared, not the actual bytes.\nTo send actual file bytes, use "Send File" instead.')
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card fadeup" style={{ width: 'min(680px,96vw)', height: 'min(560px,90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.7)' }}>
        {/* Header */}
        <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, color: T.accent, fontWeight: 700 }}>🔒 SANDBOXED FOLDER BROWSER</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Read-only · Isolated · No scripts run · Only granted folder accessible</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
        </div>
        {/* Breadcrumb */}
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: T.surface, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.textDim, marginRight: 4 }}>📂</span>
          <button onClick={() => { setPath([]); setSel(null) }} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 13, cursor: 'pointer', padding: 0 }}>{folder.name || 'root'}</button>
          {path.map((seg, i) => (
            <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: T.null_, fontSize: 12 }}>›</span>
              <button onClick={() => { setPath(path.slice(0, i + 1)); setSel(null) }} style={{ background: 'none', border: 'none', color: i === path.length - 1 ? T.accent : T.blue, fontSize: 13, cursor: 'pointer', padding: 0 }}>{seg}</button>
            </span>
          ))}
        </div>
        {/* File list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {path.length > 0 && (
            <div onClick={() => { setPath(p => p.slice(0, -1)); setSel(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, color: T.textDim, fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.background = T.panel} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 18 }}>↩</span><span>..</span>
            </div>
          )}
          {entries.map(([name, node]) => {
            const ext = name.split('.').pop().toLowerCase()
            const col = extC[ext] || T.textDim
            const isDir = node.type === 'folder'
            const isSel = sel === name
            return (
              <div key={name} onClick={() => { if (isDir) { setPath(p => [...p, name]); setSel(null) } else setSel(isSel ? null : name) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, background: isSel ? T.accentFaint : 'transparent', border: `1px solid ${isSel ? T.accent + '40' : 'transparent'}` }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.panel }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontSize: 20 }}>{isDir ? '📂' : '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: isDir ? T.amber : T.text, fontWeight: isDir ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  {node.size && <div style={{ fontSize: 11, color: T.textDim }}>{node.size}</div>}
                </div>
                {!isDir && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, border: `1px solid ${col}40`, color: col }}>{ext.toUpperCase()}</span>}
                {!isDir && <button onClick={e => { e.stopPropagation(); download(name, node) }} className="btn btn-green btn-xs" style={{ flexShrink: 0 }}>⬇ Download</button>}
              </div>
            )
          })}
          {entries.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: T.null_, fontSize: 13 }}>Empty folder</div>}
        </div>
        {/* Security banner */}
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${T.border}`, background: T.panel, fontSize: 11, color: T.textDim, display: 'flex', gap: 16, flexShrink: 0 }}>
          <span style={{ color: T.green }}>🔒 Sandboxed</span>
          <span>|</span>
          <span>No scripts run</span>
          <span>|</span>
          <span>No external requests</span>
          <span>|</span>
          <span>Sender's other files: inaccessible</span>
        </div>
      </div>
    </div>
  )
}

// ── CODE EDITOR MODAL ─────────────────────────────────────────────────────────
function CodeEditor({ onSend, onClose }) {
  const [lang, setLang] = useState('python')
  const [code, setCode] = useState('')
  const langs = ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'rust', 'go', 'bash', 'sql', 'html', 'css', 'json', 'yaml', 'markdown']
  const send = () => { if (!code.trim()) return; onSend('```' + lang + '\n' + code + '\n```'); onClose() }
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card fadeup" style={{ width: 'min(700px,96vw)', height: 'min(520px,90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.7)' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: T.accent, fontWeight: 700, flex: 1 }}>{'</>'}  CODE EDITOR</div>
          <div style={{ fontSize: 11, color: T.red, background: T.red + '12', border: `1px solid ${T.red}30`, borderRadius: 4, padding: '3px 8px' }}>⚠ NOT EXECUTABLE — display only</div>
          <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5, padding: '5px 10px', color: T.text, fontSize: 12, cursor: 'pointer' }}>
            {langs.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div style={{ flex: 1, padding: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: T.textDim }}>Write code below · Tab = 2 spaces · Will be sent as a syntax-highlighted code block</div>
          <textarea className="code-editor" value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); const s = e.target.selectionStart, end = e.target.selectionEnd; const v = code.substring(0, s) + '  ' + code.substring(end); setCode(v); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2 }, 0) } }}
            placeholder={`// Start typing your ${lang} code here…\n// This will be sent as a formatted code block\n// The recipient cannot execute it`}
            style={{ flex: 1 }} />
        </div>
        <div style={{ padding: '10px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: T.textDim }}>{code.split('\n').length} lines · {code.length} chars</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCode('')} className="btn btn-ghost btn-sm">Clear</button>
            <button onClick={send} className="btn btn-accent btn-sm" disabled={!code.trim()}>Send Code Block</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── README MODAL ──────────────────────────────────────────────────────────────
function ReadmeModal({ onClose }) {
  const [tab, setTab] = useState('about')
  const Row = ({ label, value, col }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.textDim, letterSpacing: .3 }}>{label}</span>
      <span style={{ fontSize: 12, color: col || T.text }}>{value}</span>
    </div>
  )
  const Feature = ({ text }) => (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: `1px solid ${T.border}22` }}>
      <span style={{ color: T.accentDim, flexShrink: 0, fontSize: 11 }}>✓</span>
      <span style={{ fontSize: 12, color: T.textMid }}>{text}</span>
    </div>
  )
  const Step = ({ n, col, title, body }) => (
    <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${col}18`, border: `1px solid ${col}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: col }}>{n}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: col, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.7 }}>{body}</div>
      </div>
    </div>
  )
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card fadeup" style={{ width: 'min(680px,96vw)', height: 'min(74vh,660px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.7)' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, color: T.accent, fontWeight: 700, letterSpacing: .5 }}>FTPS — DOCUMENTATION</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>File Transfer Protocol Service · P2P · E2E-AES256 · No Server</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
        </div>
        <div className="tabbar" style={{ flexShrink: 0 }}>
          <button className={`tab ${tab === 'about' ? 'act' : ''}`} onClick={() => setTab('about')}>PROJECT DETAILS</button>
          <button className={`tab ${tab === 'connect' ? 'act' : ''}`} onClick={() => setTab('connect')}>HOW TO CONNECT PEERS</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }} className="fadein">
          {tab === 'about' && (
            <div>
              <p style={{ fontSize: 13, color: T.textMid, lineHeight: 1.8, marginBottom: 24 }}>
                FTPS is a serverless, domain-free peer-to-peer application for secure file transfer and chat. After an initial manual handshake, all data travels directly between browsers. No server ever sees your messages, files, or cryptographic keys.
              </p>

              <div style={{ fontSize: 11, color: T.accentDim, letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>SECURITY ARCHITECTURE</div>
              <div style={{ marginBottom: 24 }}>
                <Row label="Key Exchange" value="ECDH P-256 via WebCrypto API — ephemeral per session" col={T.green} />
                <Row label="Encryption" value="AES-GCM-256 — every message and every file chunk" col={T.green} />
                <Row label="IV / Nonce" value="12-byte random per message — replay-attack proof" col={T.green} />
                <Row label="Transport" value="WebRTC DataChannel — direct browser-to-browser" col={T.blue} />
                <Row label="STUN servers" value="NAT IP discovery only — never relay your data" col={T.textMid} />
                <Row label="Data storage" value="Memory only — no server, no database, no disk write" col={T.amber} />
              </div>

              <div style={{ fontSize: 11, color: T.accentDim, letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>FEATURES</div>
              <div style={{ marginBottom: 20 }}>
                {['All 3 setup fields required — name, passphrase, and password',
                  'Auto-lock on inactivity — timer resets on any mouse or keyboard activity',
                  'Configurable lock timeout (1–60 min) and max unlock attempts (1–10)',
                  '5 wrong unlock attempts (default) = full session data wipe',
                  'Browser warns before refresh or tab close (beforeunload protection)',
                  'Refresh or close tab = all data permanently gone — no persistence by design',
                  'Real WebRTC P2P DataChannel — no server relay after initial handshake',
                  'Real ECDH P-256 key exchange using browser WebCrypto API',
                  'Real AES-GCM-256 encryption on every message and every file byte',
                  'Chunked file transfer — no file size limit (16 KB chunks by default)',
                  'Folder sharing with sandboxed read-only file browser',
                  'Markdown rendering in chat — code displayed with syntax highlight, never executed',
                  'External link warnings — all URLs flagged before opening',
                  'Anti-spam configurable rate limit per peer',
                  'Archive file security warning on receipt',
                  'Fully customizable settings panel',
                  'Responsive layout — works on mobile',
                ].map((f, i) => <Feature key={i} text={f} />)}
              </div>

              <div style={{ background: T.panel, border: `1px solid ${T.amber}30`, borderRadius: 6, padding: '12px 16px', fontSize: 12, color: T.amber, lineHeight: 1.8 }}>
                <strong style={{ color: T.amber }}>MAC Address:</strong> All browsers permanently block MAC address access for user privacy. This applies to every web application — it is not a limitation of FTPS. Your MAC address is not required for any P2P function.
              </div>
            </div>
          )}
          {tab === 'connect' && (
            <div>
              <p style={{ fontSize: 13, color: T.textMid, lineHeight: 1.8, marginBottom: 24 }}>
                Since there is no signaling server, the initial WebRTC handshake is performed manually by exchanging two short strings between peers — via any channel (WhatsApp, email, SMS). After that single exchange, the connection is fully serverless and direct.
              </p>

              <div style={{ fontSize: 11, color: T.accentDim, letterSpacing: 2, fontWeight: 700, marginBottom: 18 }}>STEP-BY-STEP CONNECTION GUIDE</div>

              <Step n="1" col={T.blue} title="Person A — Generate Offer" body="Open the Connect tab → click Generate Offer. You receive a base64 string containing your SDP description and ECDH public key. Copy this string." />
              <Step n="2" col={T.amber} title="A sends offer to B" body="Send the string to Person B via any channel — WhatsApp, email, SMS, QR code. The string contains only your public key and connection description. It is safe to share." />
              <Step n="3" col={T.purple} title="Person B — Generate Answer" body="Person B opens the Connect tab → pastes the offer string → clicks Generate Answer. B receives their own base64 string. Copy it." />
              <Step n="4" col={T.amber} title="B sends answer to A" body="Person B sends the answer string back to Person A using any channel." />
              <Step n="5" col={T.green} title="Person A — Finalize" body="Person A pastes B's answer string → clicks Finalize Connection. The WebRTC DataChannel opens directly between both browsers. No server is involved from this point forward." />
              <Step n="6" col={T.accent} title="Connected" body="Both peers show as ONLINE. The shared AES-256 key is computed locally on each side using ECDH — it is never transmitted over any network. All subsequent traffic is encrypted direct P2P." />

              <div style={{ background: T.panel, border: `1px solid ${T.amber}30`, borderRadius: 6, padding: '12px 16px', marginTop: 8, fontSize: 12, color: T.amber, lineHeight: 1.8 }}>
                <strong>Note on strict NAT / firewalls:</strong> If both peers are behind symmetric NAT or strict corporate firewalls, the direct WebRTC connection may fail. In that case, a TURN relay server is required. Add TURN server credentials to <code style={{ color: T.blue, background: T.bg, padding: '1px 5px', borderRadius: 3 }}>ICE_SERVERS</code> in <code style={{ color: T.blue, background: T.bg, padding: '1px 5px', borderRadius: 3 }}>src/lib/webrtc.js</code>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CONFIRM MODAL ─────────────────────────────────────────────────────────────
function ConfirmModal({ confirm, onNo }) {
  const [typed, setTyped] = useState('')
  const isTypeConfirm = confirm.isTypeConfirm
  const canYes = !isTypeConfirm || typed === confirm.targetWord
  return (
    <div className="overlay">
      <div className="card fadeup" style={{ width: 'min(420px,96vw)', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,.9)', border: `1px solid ${T.red}40` }}>
        <div style={{ fontSize: 15, color: T.red, marginBottom: 20, lineHeight: 1.7, fontWeight: 600 }}>{confirm.msg}</div>

        {isTypeConfirm && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 8 }}>Please type <strong>{confirm.targetWord}</strong> to verify this destructive action:</div>
            <input type="text" value={typed} onChange={e => setTyped(e.target.value)} placeholder={confirm.targetWord} className="inp" style={{ width: '100%', fontSize: 14, textAlign: 'center', letterSpacing: 2, fontWeight: 700, background: T.red + '10', borderColor: T.red + '30', color: T.red }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onNo} className="btn btn-ghost">Cancel</button>
          <button onClick={confirm.onYes} className="btn btn-danger" disabled={!canYes}>Verify & Proceed</button>
        </div>
      </div>
    </div>
  )
}

// ── SANDBOX VIEWER — preview readable files, warn about archives ─────────────
const READABLE_TEXT = /\.(txt|md|log|json|xml|csv|html|htm|css|js|jsx|ts|tsx|py|java|c|cpp|h|hpp|cs|go|rs|rb|php|sh|bat|ps1|yaml|yml|toml|ini|cfg|conf|env|sql|r|swift|kt|scala|lua|pl|asm|vhdl|v|sv|makefile)$/i
const READABLE_IMG = /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|avif)$/i
const READABLE_PDF = /\.pdf$/i
const IS_ARCHIVE = /\.(zip|gz|tar|rar|7z|bz2|xz|tgz|tar\.gz|tar\.bz2|tar\.xz|cab|iso|dmg|deb|rpm|apk|jar|war|ear)$/i

function SandboxViewer({ file, onClose, notify }) {
  const [textContent, setTextContent] = React.useState(null)
  const [imgUrl, setImgUrl] = React.useState(null)
  const [pdfUrl, setPdfUrl] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [archivePw, setArchivePw] = React.useState('')
  const name = file.meta?.name || 'unknown'
  const isText = READABLE_TEXT.test(name)
  const isImg = READABLE_IMG.test(name)
  const isPdf = READABLE_PDF.test(name)
  const isArch = IS_ARCHIVE.test(name)

  React.useEffect(() => {
    if (!file.blob) { setLoading(false); return }
    if (isText) {
      file.blob.text().then(t => { setTextContent(t); setLoading(false) }).catch(() => { setTextContent('[Could not read file]'); setLoading(false) })
    } else if (isImg) {
      setImgUrl(URL.createObjectURL(file.blob)); setLoading(false)
    } else if (isPdf) {
      setPdfUrl(URL.createObjectURL(file.blob)); setLoading(false)
    } else {
      setLoading(false)
    }
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl); if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [])

  const dl = () => {
    if (file.blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(file.blob); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href) }
  }

  const ext = name.split('.').pop().toLowerCase()
  const typeLabel = isText ? `Text / Code (.${ext})` : isImg ? `Image (.${ext})` : isPdf ? 'PDF Document' : isArch ? `Archive (.${ext})` : `Binary (.${ext})`
  const typeIcon = isText ? '📝' : isImg ? '🖼️' : isPdf ? '📑' : isArch ? '📦' : '📄'

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card fadeup" style={{ width: isImg || isPdf ? 'min(800px,96vw)' : 'min(640px,96vw)', maxHeight: '88vh', padding: 0, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.7)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{typeIcon}</span>
            <div>
              <div style={{ fontSize: 13, color: T.accent, fontWeight: 600 }}>🔒 Sandbox Preview</div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 1 }}>{name} · {fmtSz(file.meta?.size || 0)} · {typeLabel}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={dl} className="btn btn-green btn-sm">⬇ Save</button>
            <button onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
          </div>
        </div>

        {/* Security strip */}
        <div style={{ background: T.panel, borderBottom: `1px solid ${T.border}`, padding: '6px 18px', fontSize: 10, color: T.textDim, display: 'flex', gap: 14 }}>
          <span>🔒 Read-only sandbox</span>
          <span>⊘ No script execution</span>
          <span>⊘ No file system access</span>
        </div>

        {/* Content body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading preview…</div>}

          {/* TEXT / CODE PREVIEW */}
          {!loading && isText && textContent !== null && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => { navigator.clipboard?.writeText(textContent); notify?.('File content copied', 'ok') }}
                style={{ position: 'absolute', top: 10, right: 14, background: T.surface, border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', zIndex: 2 }}>
                ⎘ Copy All
              </button>
              <pre style={{ margin: 0, padding: '16px 18px', fontSize: 12, lineHeight: 1.65, color: T.text, background: T.bg, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace', monospace", minHeight: 200 }}>
                {textContent}
              </pre>
            </div>
          )}

          {/* IMAGE PREVIEW */}
          {!loading && isImg && imgUrl && (
            <div style={{ padding: 20, textAlign: 'center', background: T.bg, minHeight: 200 }}>
              <img src={imgUrl} alt={name} style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 6, border: `1px solid ${T.border}` }} />
            </div>
          )}

          {/* PDF PREVIEW */}
          {!loading && isPdf && pdfUrl && (
            <iframe src={pdfUrl} title={name} style={{ width: '100%', height: '65vh', border: 'none', background: '#fff' }} />
          )}

          {/* ARCHIVE PREVIEW */}
          {!loading && isArch && (
            <div style={{ padding: 20 }}>
              <div style={{ background: T.amber + '0d', border: `1px solid ${T.amber}30`, borderRadius: 6, padding: '12px 16px', marginBottom: 14, fontSize: 12, color: T.amber, lineHeight: 1.7 }}>
                <strong>⚠ Security Notice:</strong> This is an archive file. Do not extract it on your system without scanning for malware first. FTPS cannot decompress or scan the contents.
              </div>

              <div style={{ background: T.red + '08', border: `1px solid ${T.red}25`, borderRadius: 6, padding: '12px 16px', marginBottom: 14, fontSize: 12, color: T.red, lineHeight: 1.7 }}>
                <strong>🔐 Encrypted / Password-Protected Archives:</strong> If this archive is encrypted or password-protected, FTPS cannot open or preview its contents. You will need to extract it locally using a tool like 7-Zip, WinRAR, or similar — <strong>inside a sandboxed / VM environment</strong>.
              </div>

              <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: '14px 18px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                  <span style={{ fontSize: 32 }}>📦</span>
                  <div>
                    <div style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 12, color: T.textDim }}>{fmtSz(file.meta?.size || 0)} · {file.meta?.mime || 'archive'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.8 }}>
                  Content cannot be listed in-browser — archive files need a local decompressor.<br />
                  Recommended: download and extract in a virtual machine or sandboxed environment.
                </div>
              </div>

              <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>ARCHIVE PASSWORD (if known)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={archivePw} onChange={e => setArchivePw(e.target.value)}
                    placeholder="Enter archive password if sender shared one…" className="inp" style={{ flex: 1, fontSize: 12 }} />
                  <button onClick={() => { if (archivePw) { navigator.clipboard?.writeText(archivePw); notify?.('Password copied — paste into your extractor', 'ok') } }}
                    className="btn btn-accent btn-sm" disabled={!archivePw}>⎘ Copy Password</button>
                </div>
                <div style={{ fontSize: 10, color: T.null_, marginTop: 6 }}>
                  FTPS cannot decrypt archives in-browser. Copy this password and use it when extracting with 7-Zip / WinRAR.
                </div>
              </div>
            </div>
          )}

          {/* UNKNOWN / BINARY FILE */}
          {!loading && !isText && !isImg && !isPdf && !isArch && (
            <div style={{ padding: 30, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 14, color: T.text, marginBottom: 6 }}>{name}</div>
              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 16 }}>{fmtSz(file.meta?.size || 0)} · Binary file — no preview available</div>
              <button onClick={dl} className="btn btn-green" style={{ padding: '10px 30px' }}>⬇ Save File</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FileMsg({ msg, onSandbox, onRevoke }) {
  const isMe = msg.from === 'me'
  const pct = msg.pct ?? 1
  const done = msg.type === 'file_done' || msg.type === 'file_out'
  const statusTxt = msg.type === 'file_out' ? 'Sent' : msg.type === 'file_done' ? 'Received' : msg.type === 'file_in' ? `Receiving… ${Math.round(pct * 100)}%` : 'Sending…'
  const statusCol = msg.type === 'file_done' || msg.type === 'file_out' ? T.green : T.amber
  const isArchive = /\.(zip|gz|tar|rar|7z|bz2|xz)$/i.test(msg.meta?.name || '')
  const dl = () => {
    if (msg.blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(msg.blob); a.download = msg.meta.name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href) }
  }
  return (
    <div style={{ padding: '10px 14px', background: isMe ? T.blue + '12' : T.surface, border: `1px solid ${isMe ? T.blue + '35' : T.border}`, borderRadius: 8, maxWidth: '68%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>{isArchive ? '📦' : '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteWhiteSpace: 'nowrap' }}>{msg.meta?.name}</div>
          <div style={{ fontSize: 11, color: T.textDim }}>{fmtSz(msg.meta?.size || 0)}{isArchive && <span style={{ marginLeft: 6, color: T.amber, fontSize: 10 }}>Archive</span>}</div>
        </div>
        <span className="stag" style={{ color: statusCol, background: statusCol + '15', border: `1px solid ${statusCol}35` }}>{statusTxt}</span>
      </div>
      {!done && (
        <div className="prog-track" style={{ marginBottom: 6 }}>
          <div className={`prog-fill ${isMe ? 'prog-fill-blue' : ''}`} style={{ width: `${pct * 100}%` }} />
        </div>
      )}
      {msg.type === 'file_done' && msg.blob && (
        <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
          {isArchive && (
            <div style={{ background: T.amber + '0d', border: `1px solid ${T.amber}30`, borderRadius: 6, padding: '7px 10px', fontSize: 11, color: T.amber, marginBottom: 4 }}>
              ⚠ Archive file — do not extract outside a sandbox. Potential malware risk.
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={dl} className="btn btn-green btn-sm" style={{ flex: 1 }}>⬇ Save File</button>
            <button onClick={() => onSandbox && onSandbox(msg)} className={`btn ${isArchive ? 'btn-amber' : 'btn-accent'} btn-sm`} style={{ flex: 1 }}>🔒 Preview in Sandbox</button>
          </div>
        </div>
      )}
      {isMe && done && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => onRevoke && onRevoke(msg.id)} className="btn btn-ghost btn-sm" style={{ flex: 1, padding: '4px 0', fontSize: 10, color: T.amber }}>🛑 Revoke Access</button>
        </div>
      )}
      <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, textAlign: 'right' }}>{msg.time}</div>
    </div>
  )
}

// ── FOLDER MSG COMPONENT ──────────────────────────────────────────────────────
function FolderMsg({ msg, onOpen, onRevoke }) {
  const entries = Object.keys(msg.folder?.children || {})
  return (
    <div onClick={onOpen} style={{ padding: '11px 14px', background: T.amber + '10', border: `1px solid ${T.amber}35`, borderRadius: 10, maxWidth: '68%', cursor: 'pointer', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = T.amber + '18'} onMouseLeave={e => e.currentTarget.style.background = T.amber + '10'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>📂</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: T.amber, fontWeight: 700 }}>Shared Folder</div>
          <div style={{ fontSize: 12, color: T.text }}>{msg.folder?.name}</div>
        </div>
        <div style={{ fontSize: 11, color: T.textDim, background: T.green + '18', border: `1px solid ${T.green}30`, padding: '2px 8px', borderRadius: 4 }}>🔒 Sandboxed</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>{entries.length} item{entries.length !== 1 ? 's' : ''}: {entries.slice(0, 3).join(', ')}{entries.length > 3 ? '…' : ''}</div>
        <div style={{ fontSize: 10, color: T.textDim }}>{msg.time}</div>
      </div>
      {msg.from === 'me' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onRevoke && onRevoke(msg.id)} className="btn btn-ghost btn-xs" style={{ width: '100%', color: T.amber }}>🛑 Revoke</button>
        </div>
      )}
      <div style={{ fontSize: 11, color: T.textMid, background: T.panel, borderRadius: 5, padding: '5px 8px' }}>Click to browse · Read-only · Isolated sandbox</div>
    </div>
  )
}

// ── ATTACH MENU ───────────────────────────────────────────────────────────────
function AttachMenu({ onFile, onFolder, onCode, onClose }) {
  const items = [
    { icon: '📄', label: 'Send File', sub: 'Any type, any size, unlimited', col: '#4db8ff', bg: '#4db8ff20', action: onFile },
    { icon: '📂', label: 'Share Folder', sub: 'Receiver browses in sandbox', col: T.amber, bg: T.amber + '20', action: onFolder },
    { icon: '</>', label: 'Send Code', sub: 'Syntax highlighted, not executable', col: T.green, bg: T.green + '20', action: onCode },
  ]
  return (
    <div className="card fadein" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, width: 290, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,.6)', zIndex: 50 }}>
      {items.map((it, i) => (
        <button key={i} className="attach-item" onClick={() => { it.action(); onClose() }}
          style={{ borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : 'none' }}>
          <div className="attach-icon" style={{ background: it.bg, color: it.col, fontSize: it.icon === '</>' ? 14 : 18 }}>{it.icon}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{it.label}</div>
            <div style={{ fontSize: 11, color: T.textDim }}>{it.sub}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('setup')
  const [account, setAccount] = useState(null)
  const [form, setForm] = useState({ name: '', passphrase: '', password: '' })
  const [formErr, setFormErr] = useState({})
  const [lockForm, setLockForm] = useState({ passphrase: '', password: '' })
  const [lockErr, setLockErr] = useState('')
  const [lockTries, setLockTries] = useState(0)
  const [settings, setSettings] = useState({ lockTimeout: 15, maxAttempts: 5, chunkSize: 16384, spamLimit: 200, mdRender: true, linkWarn: true, archiveWarn: true })
  const [tab, setTab] = useState('network')
  const [selPeer, setSelPeer] = useState(null)
  const [peers, setPeers] = useState([])
  const [msgs, setMsgs] = useState({})        // peerId → [msg]
  const [input, setInput] = useState('')
  const [showAttach, setShowAttach] = useState(false)
  const [folderView, setFolderView] = useState(null)
  const [showCode, setShowCode] = useState(false)
  const [showReadme, setShowReadme] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [offerBox, setOfferBox] = useState('')
  const [ansBox, setAnsBox] = useState('')
  const [pendId, setPendId] = useState(null)
  const [genMode, setGenMode] = useState('idle')
  const [genCode, setGenCode] = useState('')
  const [initiatorCode, setInitiatorCode] = useState('')   // offer string shown to initiator
  const [responderCode, setResponderCode] = useState('')   // answer string shown to responder
  const [transfers, setTransfers] = useState({})
  const [notif, setNotif] = useState(null)
  const [sideSmall, setSideSmall] = useState(false)
  const [localIP, setLocalIP] = useState('detecting…')
  const [publicIP, setPublicIP] = useState('detecting…')
  const [uptime, setUptime] = useState(0)
  const [lockTimer, setLockTimer] = useState(900)
  const [sandboxFile, setSandboxFile] = useState(null)

  const p2pRef = useRef(null)
  const keyRef = useRef(null)
  const chatEnd = useRef(null)
  const fileInp = useRef(null)
  const folderInp = useRef(null)
  const lastAct = useRef(Date.now())
  const myId = useRef('#0000')

  const notify = useCallback((msg, t = 'info') => { setNotif({ msg, t }); setTimeout(() => setNotif(null), 3500) }, [])
  const pushMsg = useCallback((pid, m) => setMsgs(prev => ({ ...prev, [pid]: [...(prev[pid] || []), m] })), [])
  const updMsg = useCallback((pid, id, patch) => setMsgs(prev => ({ ...prev, [pid]: (prev[pid] || []).map(m => m.id === id ? { ...m, ...patch } : m) })), [])

  // refresh protection
  const screenRef = useRef(screen)
  useEffect(() => { screenRef.current = screen }, [screen])
  useEffect(() => {
    const h = e => {
      if (screenRef.current === 'main' || screenRef.current === 'locked') {
        const msg = '⚠ WARNING: Leaving this page will permanently drop your P2P connections and wipe all unsaved chat / file data.'
        e.preventDefault()
        e.returnValue = msg
        return msg
      }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])  // mount-once — uses ref internally

  // fetch IPs
  useEffect(() => {
    detectIP().then(setLocalIP)
    // Fetch public IP since browsers obfuscate local IP
    fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => setPublicIP(d.ip)).catch(() => setPublicIP('Unavailable'))
  }, [])

  useEffect(() => {
    const r = () => { lastAct.current = Date.now() }
      ;['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => window.addEventListener(ev, r))
    return () => ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => window.removeEventListener(ev, r))
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      if (screen === 'main') {
        setUptime(u => u + 1)
        const rem = Math.max(0, settings.lockTimeout * 60 - (Date.now() - lastAct.current) / 1000)
        setLockTimer(Math.round(rem))
        if (rem <= 0) setScreen('locked')
      }
    }, 1000)
    return () => clearInterval(t)
  }, [screen, settings.lockTimeout, account])

  // init P2P
  useEffect(() => {
    p2pRef.current = new P2PNode({
      onOpen(pid) {
        setPeers(ps => {
          const ex = ps.find(p => p.id === pid)
          if (ex) return ps.map(p => p.id === pid ? { ...p, online: true, state: 'connected' } : p)
          return [...ps, { id: pid, name: '', online: true, since: now8(), state: 'connected' }]
        })
        pushMsg(pid, { id: Date.now(), from: 'sys', text: '🔒 P2P channel open. AES-GCM-256 E2E active.', time: now8(), type: 'sys' })
        notify('Peer connected — E2E encrypted', 'ok')
      },
      onClose(pid) {
        setPeers(ps => ps.map(p => p.id === pid ? { ...p, online: false, state: 'disconnected' } : p))
        pushMsg(pid, { id: Date.now(), from: 'sys', text: 'Peer disconnected.', time: now8(), type: 'sys' })
      },
      onState(pid, state) {
        // ICE connection state — show in peer row
        setPeers(ps => ps.map(p => p.id === pid ? { ...p, iceState: state } : p))
      },
      onConnState(pid, state) {
        // RTCPeerConnection overall state
        setPeers(ps => ps.map(p => p.id === pid ? { ...p, connState: state } : p))
      },
      onMsg(pid, msg) {
        if (msg.type === 'revoke') {
          // Peer asked us to revoke/delete a specific message (file/folder)
          setMsgs(prev => ({ ...prev, [pid]: (prev[pid] || []).map(m => m.id === msg.targetId ? { ...m, text: '🚫 Access revoked by sender.', type: 'text', revoked: true } : m) }))
          notify('A file/folder access was revoked by the sender', 'info')
        }
        else if (msg.type === 'folder_share') pushMsg(pid, { id: Date.now(), from: 'them', type: 'folder', folder: msg.folder, time: now8() })
        else pushMsg(pid, { id: Date.now(), from: 'them', text: msg.text, time: now8(), type: 'text' })
      },
      onFileStart(pid, meta) {
        const id = Date.now()
        setTransfers(t => ({ ...t, [meta.fid]: { name: meta.name, pct: 0, pid, size: meta.size, msgId: id } }))
        pushMsg(pid, { id, from: 'them', type: 'file_in', meta, pct: 0, time: now8() })
      },
      onFileProg(pid, fid, pct) {
        setTransfers(t => ({ ...t, [fid]: { ...t[fid], pct } }))
        setMsgs(prev => {
          const arr = prev[pid] || []
          const idx = arr.findIndex(m => m.type === 'file_in' && m.meta?.fid === fid)
          if (idx < 0) return prev
          const upd = [...arr]; upd[idx] = { ...upd[idx], pct }
          return { ...prev, [pid]: upd }
        })
      },
      onFileDone(pid, meta, blob) {
        setTransfers(t => { const n = { ...t }; delete n[meta.fid]; return n })
        setMsgs(prev => {
          const arr = prev[pid] || []
          const idx = arr.findIndex(m => m.type === 'file_in' && m.meta?.fid === meta.fid)
          if (idx < 0) return prev
          const upd = [...arr]; upd[idx] = { ...upd[idx], type: 'file_done', pct: 1, blob }
          return { ...prev, [pid]: upd }
        })
      },
    })
  }, [pushMsg, notify])

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, selPeer])

  // ── ACTIONS ───────────────────────────────────────────────────────────
  const doSetup = async () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.passphrase.trim()) e.passphrase = 'Required — use 🎲 to generate one'
    if (!form.password || form.password.length < 8) e.password = 'Min 8 chars'
    else if (!/[A-Z]/.test(form.password)) e.password = 'Needs 1 uppercase'
    else if (!/[a-z]/.test(form.password)) e.password = 'Needs 1 lowercase'
    else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(form.password)) e.password = 'Needs 1 special char'
    if (Object.keys(e).length) { setFormErr(e); return }
    const kp = await generateKeyPair()
    keyRef.current = { keyPair: kp, pub: await exportPublicKey(kp.publicKey) }
    myId.current = makeNodeId(form.name)
    setAccount(form); lastAct.current = Date.now(); setLockTimer(settings.lockTimeout * 60)
    setScreen('main')
    notify('Session initialized', 'ok')
  }

  const doLock = () => { setScreen('locked'); setLockForm({ passphrase: '', password: '' }); setLockErr('') }

  const doUnlock = () => {
    if (lockForm.passphrase === account.passphrase && lockForm.password === account.password) {
      setLockTries(0); lastAct.current = Date.now(); setLockTimer(settings.lockTimeout * 60)
      setScreen('main'); setLockForm({ passphrase: '', password: '' }); setLockErr('')
    } else {
      const t = lockTries + 1; setLockTries(t)
      if (t >= settings.maxAttempts) {
        p2pRef.current?.closeAll(); setAccount(null); setScreen('setup'); setLockTries(0)
        setMsgs({}); setPeers([]); setForm({ name: '', passphrase: '', password: '' })
        notify(`${settings.maxAttempts} attempts — wiped`, 'err')
      } else setLockErr(`Wrong credentials. ${settings.maxAttempts - t} attempt${settings.maxAttempts - t !== 1 ? 's' : ''} left before wipe.`)
    }
  }

  const doWipe = () => setConfirm({
    msg: '⚠ Wipe all session data and close all connections?', onYes: () => {
      p2pRef.current?.closeAll(); setAccount(null); setScreen('setup'); setMsgs({}); setPeers([]); setForm({ name: '', passphrase: '', password: '' }); setConfirm(null)
    }
  })

  const doOffer = async () => {
    setGenMode('loading')
    try {
      const { tempId, offerB64, fingerprint } = await p2pRef.current.createOffer(keyRef.current.keyPair, myId.current, account?.name)
      setPendId(tempId); setGenCode(offerB64); setInitiatorCode(offerB64); setGenMode('offering')
      // Add a pending peer entry with fingerprint
      setPeers(ps => [...ps.filter(p => p.id !== tempId), { id: tempId, name: '', online: false, since: now8(), state: 'offering', fingerprint }])
      notify('Offer ready — share with peer', 'info')
    } catch (e) { notify('Offer failed: ' + e.message, 'err'); setGenMode('idle') }
  }

  const doAnswer = async () => {
    if (!offerBox.trim()) { notify('Paste the offer first', 'err'); return }
    setGenMode('loading')
    try {
      const { peerId, peerName, answerB64, fingerprint } = await p2pRef.current.createAnswer(offerBox.trim(), keyRef.current.keyPair, myId.current, account?.name)
      setGenCode(answerB64); setResponderCode(answerB64)
      setPeers(ps => [...ps.filter(p => p.id !== peerId), { id: peerId, name: peerName, online: false, since: now8(), state: 'answering', fingerprint }])
      setGenMode('answering')
      notify('Answer ready — send back to peer', 'info')
    } catch (e) { notify('Answer failed: ' + e.message, 'err'); setGenMode('idle') }
  }

  const doFinalize = async () => {
    if (!ansBox.trim() || !pendId) { notify('Paste the answer first', 'err'); return }
    try {
      const { peerId, peerName } = await p2pRef.current.finalizeOffer(pendId, ansBox.trim())
      // Update any temp peer entry, or add the real peer if not yet listed
      setPeers(ps => {
        const ex = ps.find(p => p.id === pendId || p.id === peerId)
        if (ex) return ps.map(p => (p.id === pendId || p.id === peerId) ? { ...p, id: peerId, name: peerName || p.name, state: 'connecting' } : p)
        return [...ps, { id: peerId, name: peerName, online: false, since: now8(), state: 'connecting' }]
      })
      notify('Connection finalized! Waiting for channel to open…', 'ok'); setGenMode('done')
    } catch (e) { notify('Finalize failed: ' + e.message, 'err') }
  }

  // Reset entire connect flow — clears pending connections, codes, inputs
  const doResetConnect = () => {
    if (pendId) p2pRef.current?.close(pendId)
    setGenMode('idle'); setGenCode(''); setInitiatorCode(''); setResponderCode('')
    setOfferBox(''); setAnsBox(''); setPendId(null)
    notify('Connection flow reset', 'info')
  }

  // Delete a peer from the list and close their connection
  const doDeletePeer = (pid) => {
    setConfirm({
      msg: `Remove peer [${pid}] and close their connection? Their messages will still be in history.`,
      onYes: () => {
        p2pRef.current?.close(pid)
        setPeers(ps => ps.filter(p => p.id !== pid))
        if (selPeer?.id === pid) setSelPeer(null)
        setConfirm(null)
        notify('Peer removed', 'info')
      }
    })
  }

  const doSend = async () => {
    if (!input.trim() || !selPeer) return
    const text = input.trim(); setInput('')
    if (!await p2pRef.current.sendMsg(selPeer.id, text)) { notify('Peer not connected', 'err'); return }
    pushMsg(selPeer.id, { id: Date.now(), from: 'me', text, time: now8(), type: 'text' })
  }

  const doSendFile = async (file) => {
    if (!selPeer) return
    setShowAttach(false)
    if (settings.archiveWarn && /\.(zip|gz|tar|rar|7z)$/i.test(file.name)) notify(`⚠ Archive file — peer will see sandbox warning`, 'info')
    const msgId = Date.now()
    pushMsg(selPeer.id, { id: msgId, from: 'me', type: 'file_out', meta: { fid: 'pending', name: file.name, size: file.size }, pct: 0, time: now8() })
    const ok = await p2pRef.current.sendFile(selPeer.id, file, pct => {
      setMsgs(prev => { const arr = prev[selPeer.id] || []; const idx = arr.findIndex(m => m.id === msgId); if (idx < 0) return prev; const u = [...arr]; u[idx] = { ...u[idx], pct }; return { ...prev, [selPeer.id]: u } })
    })
    setMsgs(prev => { const arr = prev[selPeer.id] || []; const idx = arr.findIndex(m => m.id === msgId); if (idx < 0) return prev; const u = [...arr]; u[idx] = { ...u[idx], pct: 1 }; return { ...prev, [selPeer.id]: u } })
    ok ? notify(`Sent: ${file.name} (${fmtSz(file.size)})`, 'ok') : notify('Send failed', 'err')
  }

  const doSendFolder = async (files) => {
    if (!selPeer || !files.length) return
    setShowAttach(false)
    // Build folder tree from FileList
    const tree = {}
    for (const file of files) {
      const parts = file.webkitRelativePath.split('/')
      let node = tree
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i]
        if (!node[seg]) node[seg] = { type: 'dir', children: {} }
        node = node[seg].children
      }
      node[parts[parts.length - 1]] = { type: 'file', file }
    }
    const rootDirStr = Object.keys(tree)[0]
    const rootDir = tree[rootDirStr]
    if (!rootDir || rootDir.type !== 'dir') return notify('Invalid folder structure', 'err')

    // Read all files
    const loadNode = async (n) => {
      if (n.type === 'file') {
        const b64 = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result.split(',')[1]); rd.readAsDataURL(n.file) })
        return { type: 'file', size: n.file.size, mime: n.file.type, d: b64 }
      }
      const out = { type: 'dir', children: {} }
      for (const [k, v] of Object.entries(n.children)) out.children[k] = await loadNode(v)
      return out
    }
    const payload = { name: rootDirStr, children: (await loadNode(rootDir)).children }
    const msgId = Date.now()
    if (!await p2pRef.current.sendMsg(selPeer.id, { type: 'folder_share', folder: payload })) { notify('Send failed', 'err'); return }
    pushMsg(selPeer.id, { id: msgId, from: 'me', type: 'folder', folder: payload, time: now8() })
    notify(`Shared folder: ${rootDirStr}`, 'ok')
  }

  const doRevoke = async (msgId) => {
    if (!selPeer) return
    // Send revoke control message
    if (await p2pRef.current.sendMsg(selPeer.id, { type: 'revoke', targetId: msgId })) {
      setMsgs(prev => ({ ...prev, [selPeer.id]: (prev[selPeer.id] || []).map(m => m.id === msgId ? { ...m, text: '🚫 You revoked access to this item.', type: 'text', revoked: true } : m) }))
      notify('Access revoked', 'info')
    } else {
      notify('Failed to send revoke command', 'err')
    }
  }

  const doClearChat = () => {
    if (!selPeer) return
    setConfirm({
      msg: 'Soft Clear: Wipe chat history for this peer? (The connection will stay open)',
      onYes: () => {
        setMsgs(prev => ({ ...prev, [selPeer.id]: [] }))
        setConfirm(null)
      }
    })
  }

  const doSendCode = (codeBlock) => {
    if (!selPeer) return
    p2pRef.current.sendMsg(selPeer.id, codeBlock)
    pushMsg(selPeer.id, { id: Date.now(), from: 'me', text: codeBlock, time: now8(), type: 'text' })
  }

  const setPeerName = (id, name) => setPeers(ps => ps.map(p => p.id === id ? { ...p, name } : p))
  const setSett = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const onlinePeers = peers.filter(p => p.online)
  const peerMsgs = selPeer ? (msgs[selPeer.id] || []) : []
  const lockPct = (lockTimer / (settings.lockTimeout * 60)) * 100

  // ── SETUP ─────────────────────────────────────────────────────────────
  if (screen === 'setup') return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{CSS}</style>
      <Notif n={notif} />
      {showReadme && <ReadmeModal onClose={() => setShowReadme(false)} />}
      <div style={{ width: '100%', maxWidth: 420 }} className="fadeup">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: T.accent + '18', border: `1px solid ${T.accent} 40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔐</div>
            <div>
              <div style={{ fontSize: 22, color: T.text, fontWeight: 700, letterSpacing: 1 }}>FTPS</div>
              <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 2 }}>SECURE FILE TRANSFER</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.null_, letterSpacing: 1 }}>P2P · E2E-AES256 · No Server · No Domain</div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 11, color: T.textDim, fontWeight: 600, letterSpacing: 1, marginBottom: 18, textTransform: 'uppercase' }}>New Session</div>
          {/* Name — required */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, marginBottom: 5, fontWeight: 500, display: 'flex', justifyContent: 'space-between', color: formErr.name ? T.red : T.textDim }}>
              <span>Display Name <span style={{ color: T.red }}>*</span></span>
              {formErr.name && <span>{formErr.name}</span>}
            </div>
            <input value={form.name} type="text" placeholder="Your name or alias" className={`inp${formErr.name ? ' err' : ''} `}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setFormErr(p => ({ ...p, name: '' })) }}
              onKeyDown={e => e.key === 'Enter' && doSetup()} />
          </div>
          {/* Passphrase — optional */}
          {/* Passphrase — required */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, marginBottom: 5, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: formErr.passphrase ? T.red : T.textDim }}>
              <span>Passphrase <span style={{ color: T.red }}>*</span></span>
              {formErr.passphrase && <span style={{ fontSize: 10 }}>{formErr.passphrase}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={form.passphrase} type="text" placeholder="Memorable phrase — used to unlock session" className={`inp${formErr.passphrase ? ' err' : ''} `}
                onChange={e => { setForm(p => ({ ...p, passphrase: e.target.value })); setFormErr(p => ({ ...p, passphrase: '' })) }}
                onKeyDown={e => e.key === 'Enter' && doSetup()}
                style={{ flex: 1 }} />
              <button onClick={() => setForm(p => ({ ...p, passphrase: genPhrase() }))}
                className="btn btn-ghost btn-sm" title="Generate random 4-word passphrase" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>🎲 Random</button>
            </div>
            <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>Used to unlock the session after inactivity. Write it down.</div>
          </div>
          {/* Password — required */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, marginBottom: 5, fontWeight: 500, display: 'flex', justifyContent: 'space-between', color: formErr.password ? T.red : T.textDim }}>
              <span>Password <span style={{ color: T.red }}>*</span> <span style={{ fontWeight: 400, fontSize: 10 }}>(8+ chars: A-Z, a-z, @#$)</span></span>
              {formErr.password && <span style={{ fontSize: 10 }}>{formErr.password}</span>}
            </div>
            <input value={form.password} type="password" placeholder="Second authentication factor" className={`inp${formErr.password ? ' err' : ''} `}
              onChange={e => { setForm(p => ({ ...p, password: e.target.value })); setFormErr(p => ({ ...p, password: '' })) }}
              onKeyDown={e => e.key === 'Enter' && doSetup()} />
          </div>
          <div style={{ background: T.panel, border: `1px solid ${T.border} `, borderRadius: 6, padding: '10px 12px', marginBottom: 16, fontSize: 11, color: T.textDim, lineHeight: 1.8 }}>
            🔒 Auto-locks after {settings.lockTimeout} min inactivity · {settings.maxAttempts} wrong attempts = full session wipe
          </div>
          <div style={{ background: T.panel, border: `1px solid ${T.border} `, borderRadius: 6, padding: '10px 12px', marginBottom: 18, fontSize: 11, color: T.textDim }}>
            ⚠ Refresh or close tab = all session data is permanently gone
          </div>
          <button onClick={doSetup} className="btn btn-accent" style={{ width: '100%', padding: 12, fontSize: 13, marginBottom: 8 }}>Start Session →</button>
          <button onClick={() => setShowReadme(true)} className="btn btn-ghost" style={{ width: '100%', padding: 9, fontSize: 12 }}>Documentation</button>
        </div>
      </div>
    </div>
  )

  // ── LOCK ──────────────────────────────────────────────────────────────
  if (screen === 'locked') return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{CSS}</style>
      <Notif n={notif} />
      <div style={{ width: '100%', maxWidth: 360 }} className="fadeup">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 16, color: T.text, fontWeight: 600 }}>Session Locked</div>
          <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>Locked due to inactivity</div>
          {lockTries > 0 && <div style={{ fontSize: 12, color: lockTries >= 3 ? T.red : T.amber, marginTop: 7 }}>{lockTries} attempt{lockTries > 1 ? 's' : ''} · {settings.maxAttempts - lockTries} left before wipe</div>}
        </div>
        <div className="card" style={{ padding: 26 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5, fontWeight: 500 }}>Passphrase</div>
            <input type="password" value={lockForm.passphrase} placeholder="Enter passphrase" className="inp"
              onChange={e => setLockForm(p => ({ ...p, passphrase: e.target.value }))} onKeyDown={e => e.key === 'Enter' && doUnlock()} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5, fontWeight: 500 }}>Password</div>
            <input type="password" value={lockForm.password} placeholder="Enter password" className="inp"
              onChange={e => setLockForm(p => ({ ...p, password: e.target.value }))} onKeyDown={e => e.key === 'Enter' && doUnlock()} />
          </div>

          {lockErr && <div style={{ fontSize: 12, color: T.red, marginBottom: 14 }}>{lockErr}</div>}
          <button onClick={doUnlock} className="btn btn-amber" style={{ width: '100%', padding: 12, fontSize: 13, letterSpacing: 1 }}>UNLOCK SESSION</button>
        </div>
      </div>
    </div>
  )

  // ── MAIN ──────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{CSS}</style>
      <Notif n={notif} />
      {folderView && <SandboxFolder folder={folderView} onClose={() => setFolderView(null)} />}
      {showReadme && <ReadmeModal onClose={() => setShowReadme(false)} />}
      {showCode && selPeer && <CodeEditor onSend={doSendCode} onClose={() => setShowCode(false)} />}
      {confirm && <ConfirmModal confirm={confirm} onNo={() => setConfirm(null)} />}
      {sandboxFile && <SandboxViewer file={sandboxFile} onClose={() => setSandboxFile(null)} notify={notify} />}

      {/* TOP BAR */}
      <div style={{ height: 52, background: T.surface, borderBottom: `1px solid ${T.border} `, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12, flexShrink: 0, zIndex: 30 }}>
        <button onClick={() => setSideSmall(s => !s)} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 18, padding: '4px 6px', borderRadius: 4, lineHeight: 1 }}>☰</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.accent, letterSpacing: 4 }}>FTPS</div>
        <div style={{ width: 1, height: 18, background: T.border }} />
        <div style={{ fontSize: 12, color: T.textDim }}><span style={{ color: T.accent }}>{myId.current}</span> · <span style={{ color: T.text }}>{account?.name}</span></div>
        <div style={{ flex: 1 }} />
        {/* Lock countdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Inactivity lock countdown — resets on activity">
          <span style={{ fontSize: 12, color: lockTimer < 120 ? T.red : T.textDim, animation: lockTimer < 60 ? 'blink 1s infinite' : 'none', fontVariantNumeric: 'tabular-nums' }}>{fmtMin(lockTimer)}</span>
          <div style={{ width: 56, height: 3, background: T.border, borderRadius: 2 }}><div style={{ height: '100%', width: `${lockPct}% `, background: lockTimer < 120 ? T.red : T.accentDim, borderRadius: 2, transition: 'width 1s linear' }} /></div>
        </div>
        <div className="hide-md" style={{ fontSize: 12, color: onlinePeers.length ? T.green : T.null_ }}>
          {onlinePeers.length ? `● ${onlinePeers.length} peer${onlinePeers.length > 1 ? 's' : ''} ` : ' ○ no peers'}
        </div>
        <button onClick={doLock} className="btn btn-amber btn-sm" style={{ gap: 6 }}>🔒 Lock</button>
        <button onClick={() => setConfirm({ isTypeConfirm: true, targetWord: 'REFRESH', msg: '⚠ REFRESH PROGRAM? All peer connections and unsaved data will be permanently destroyed. This cannot be undone.', onYes: () => window.location.reload() })} className="btn btn-ghost btn-sm" title="Restart FTPS program">↻ Refresh</button>
        <button onClick={() => setShowReadme(true)} className="btn btn-ghost btn-sm">DOCS</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <div style={{ width: sideSmall ? 52 : 190, background: T.surface, borderRight: `1px solid ${T.border} `, display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width .18s ease', overflow: 'hidden' }}>
          {!sideSmall && (
            <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${T.border} ` }}>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 3 }}>NODE</div>
              <div style={{ fontSize: 14, color: T.accent, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account?.name}</div>
              <div style={{ fontSize: 10, color: T.null_ }}>{myId.current}</div>
            </div>
          )}
          {[{ id: 'network', icon: '⬡', l: 'P2P Network' }, { id: 'connect', icon: '⊕', l: 'Connect Peer' }, { id: 'history', icon: '◷', l: 'History' }, { id: 'details', icon: '◉', l: 'My Details' }, { id: 'uptime', icon: '▲', l: 'Up-Time' }, { id: 'dev', icon: '⚙', l: 'System/Dev' }, { id: 'settings', icon: '✦', l: 'Settings' }].map(item => (
            <button key={item.id} className={`sbtn ${tab === item.id ? 'act' : ''} `}
              style={sideSmall ? { justifyContent: 'center', padding: '13px 0', gap: 0 } : {}}
              onClick={() => { setTab(item.id); setSelPeer(null) }} title={item.l}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!sideSmall && <span>{item.l}</span>}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {!sideSmall && <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.border} `, fontSize: 10, color: T.null_, lineHeight: 1.8 }}>◈ WebRTC Direct P2P<br />◈ ECDH P-256 + AES-GCM-256</div>}
        </div>

        {/* CENTER — hidden when chat is open full-screen */}
        <div className="cpanel" style={{ flex: 1, display: selPeer ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* NETWORK */}
          {tab === 'network' && (
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="fadein">
              <div style={{ fontSize: 12, color: T.accentDim, letterSpacing: 3, marginBottom: 18, fontWeight: 700 }}>⬡ SYSTEM & NETWORK</div>

              {/* Identity */}
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8, fontWeight: 700 }}>NODE IDENTITY</div>
              <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                {[
                  { l: 'Node ID', v: myId.current, c: T.accent },
                  { l: 'Display Name', v: account?.name, c: T.text },
                  { l: 'Session Crypto', v: 'ECDH P-256 key exchange · AES-GCM-256 encryption', c: T.green },
                ].map(r => (
                  <div key={r.l} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16, padding: '11px 16px', borderBottom: `1px solid ${T.border} ` }}>
                    <span style={{ fontSize: 12, color: T.textDim }}>{r.l}</span>
                    <span style={{ fontSize: 12, color: r.c === T.accent ? T.accent : r.c || T.text, fontWeight: r.c === T.accent ? 700 : 400 }}>{r.v}</span>
                  </div>
                ))}
              </div>

              {/* Network */}
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8, fontWeight: 700 }}>NETWORK</div>
              <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                {[
                  { l: 'Public IP', v: publicIP === 'detecting…' ? 'Detecting via ipify.org…' : publicIP, c: publicIP === 'Unavailable' ? T.null_ : T.accent },
                  { l: 'Local IP', v: localIP === 'detecting…' ? 'Detecting via WebRTC…' : localIP, c: localIP === 'N/A' || localIP.includes('.local') ? T.null_ : T.text },
                  { l: 'MAC Address', v: 'Not accessible — blocked by all browsers (privacy protection)', c: T.null_ },
                  { l: 'Transport', v: 'WebRTC DataChannel (ordered SCTP, reliable)', c: T.blue },
                  { l: 'Server relay', v: 'None — traffic is direct peer-to-peer', c: T.accent },
                  { l: 'STUN servers', v: 'Google, Cloudflare, STUNProtocol (NAT discovery only)', c: T.textMid },
                ].map(r => (
                  <div key={r.l} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16, padding: '11px 16px', borderBottom: `1px solid ${T.border} ` }}>
                    <span style={{ fontSize: 12, color: T.textDim }}>{r.l}</span>
                    <span style={{ fontSize: 12, color: r.c }}>{r.v}</span>
                  </div>
                ))}
              </div>

              {/* Peers */}
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8, fontWeight: 700 }}>PEERS</div>
              <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                {[
                  { l: 'Online', v: `${onlinePeers.length} peer${onlinePeers.length !== 1 ? 's' : ''} `, c: onlinePeers.length ? T.green : T.null_ },
                  { l: 'Total known', v: `${peers.length} peer${peers.length !== 1 ? 's' : ''} `, c: T.textMid },
                  { l: 'Session uptime', v: fmt(uptime), c: T.textMid },
                ].map(r => (
                  <div key={r.l} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16, padding: '11px 16px', borderBottom: `1px solid ${T.border} ` }}>
                    <span style={{ fontSize: 12, color: T.textDim }}>{r.l}</span>
                    <span style={{ fontSize: 12, color: r.c, fontWeight: r.c === T.green ? 700 : 400 }}>{r.v}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: T.panel, border: `1px solid ${T.border} `, borderRadius: 6, padding: '11px 14px', fontSize: 12, color: T.textDim, lineHeight: 1.8 }}>
                <strong style={{ color: T.amber }}>About local IP:</strong> Detected using a silent WebRTC ICE probe — no external request is made. Shows your LAN address (e.g. 192.168.x.x). If shown as N/A, your browser's privacy settings block this.
              </div>
            </div>
          )}

          {/* CONNECT */}
          {tab === 'connect' && (
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="fadein">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: T.accentDim, letterSpacing: 3, fontWeight: 700 }}>⊕ P2P CONNECTION — NO SERVER</div>
                <button onClick={doResetConnect} className="btn btn-danger btn-sm" title="Reset all pending connections and start over">↺ Reset</button>
              </div>

              {/* Status banner */}
              {genMode !== 'idle' && (
                <div style={{
                  marginBottom: 14, padding: '10px 14px', borderRadius: 6, fontSize: 12, lineHeight: 1.6,
                  background: genMode === 'done' ? T.green + '14' : T.amber + '0a',
                  border: `1px solid ${genMode === 'done' ? T.green + '50' : T.amber + '30'} `,
                  color: genMode === 'done' ? T.green : T.amber
                }}>
                  {genMode === 'loading' && '⟳ Generating — gathering ICE candidates (STUN + TURN, up to 12 sec)…'}
                  {genMode === 'offering' && '① Offer ready. Share it with peer, then paste their answer below.'}
                  {genMode === 'answering' && '② Answer ready. Send it back to the initiator.'}
                  {genMode === 'done' && '✓ Handshake complete — connection is live.'}
                </div>
              )}

              {/* BOTH panels always visible */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

                {/* ── INITIATOR ── */}
                <div className="card" style={{ padding: 18, opacity: genMode === 'answering' ? .45 : 1, transition: 'opacity .2s' }}>
                  <div style={{ fontSize: 11, color: T.blue, letterSpacing: 2, marginBottom: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>① AS INITIATOR</span>
                    {(genMode === 'offering' || genMode === 'done') && (
                      <button onClick={doResetConnect} className="btn btn-xs btn-ghost" title="Clear and start over">✕ Clear</button>
                    )}
                  </div>

                  {(genMode === 'idle' || genMode === 'loading' || genMode === 'answering') && (
                    <button onClick={doOffer} className="btn btn-blue" style={{ width: '100%', padding: 11 }}
                      disabled={genMode === 'loading' || genMode === 'answering'}>
                      {genMode === 'loading' ? <span>⟳ Generating…</span> : 'Generate Offer →'}
                    </button>
                  )}

                  {(genMode === 'offering' || genMode === 'done') && genCode && initiatorCode && (
                    <div>
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>YOUR OFFER — copy & share this</div>
                      <textarea readOnly value={initiatorCode} rows={4}
                        style={{ width: '100%', background: T.bg, border: `1px solid ${T.border} `, borderRadius: 5, padding: '8px 10px', color: T.accentDim, fontSize: 10, resize: 'vertical', fontFamily: 'inherit', marginBottom: 4 }}
                        onClick={e => e.target.select()} />
                      <button onClick={() => { navigator.clipboard?.writeText(initiatorCode); notify('Copied!', 'ok') }}
                        className="btn btn-accent" style={{ marginBottom: 10, width: '100%', padding: 10, fontSize: 13, letterSpacing: 0.5 }}>
                        ⎘ Copy Offer Code
                      </button>
                      <div style={{ marginBottom: 12 }}><QR value={initiatorCode.slice(0, 180)} sz={8} /></div>
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>PASTE PEER'S ANSWER</div>
                      <textarea value={ansBox} onChange={e => setAnsBox(e.target.value)} rows={4}
                        placeholder="Paste peer's answer string here…"
                        style={{ width: '100%', background: T.bg, border: `1px solid ${T.border} `, borderRadius: 5, padding: '8px 10px', color: T.text, fontSize: 10, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} />
                      <button onClick={doFinalize} className="btn btn-green" style={{ width: '100%', padding: 10 }}
                        disabled={!ansBox.trim()}>
                        ✓ Finalize Connection
                      </button>
                    </div>
                  )}
                </div>

                {/* ── RESPONDER ── */}
                <div className="card" style={{ padding: 18, opacity: (genMode === 'offering' || genMode === 'done') ? .45 : 1, transition: 'opacity .2s' }}>
                  <div style={{ fontSize: 11, color: T.purple, letterSpacing: 2, marginBottom: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>② AS RESPONDER</span>
                    {genMode === 'answering' && (
                      <button onClick={doResetConnect} className="btn btn-xs btn-ghost" title="Clear and start over">✕ Clear</button>
                    )}
                  </div>

                  <div style={{ fontSize: 10, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>PASTE INITIATOR'S OFFER</div>
                  <textarea value={offerBox} onChange={e => setOfferBox(e.target.value)} rows={4}
                    placeholder="Paste offer string here…"
                    style={{ width: '100%', background: T.bg, border: `1px solid ${T.border} `, borderRadius: 5, padding: '8px 10px', color: T.text, fontSize: 10, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} />
                  <button onClick={doAnswer} className="btn btn-purple" style={{ width: '100%', padding: 10 }}
                    disabled={genMode === 'loading' || !offerBox.trim() || (genMode === 'offering' || genMode === 'done')}>
                    {genMode === 'loading' ? 'Generating…' : 'Generate Answer →'}
                  </button>

                  {genMode === 'answering' && genCode && responderCode && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>YOUR ANSWER — copy & send back</div>
                      <textarea readOnly value={responderCode} rows={4}
                        style={{ width: '100%', background: T.bg, border: `1px solid ${T.border} `, borderRadius: 5, padding: '8px 10px', color: T.purple, fontSize: 10, resize: 'vertical', fontFamily: 'inherit', marginBottom: 4 }}
                        onClick={e => e.target.select()} />
                      <button onClick={() => { navigator.clipboard?.writeText(responderCode); notify('Copied!', 'ok') }}
                        className="btn btn-accent" style={{ width: '100%', padding: 10, fontSize: 13, letterSpacing: 0.5 }}>
                        ⎘ Copy Answer Code
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* How it works + TURN explanation */}
              <div style={{ background: T.panel, border: `1px solid ${T.border} `, borderRadius: 6, padding: '12px 16px', fontSize: 12, color: T.textDim, lineHeight: 1.9 }}>
                <div style={{ color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Why this works across different networks</div>
                <div>The connection uses <span style={{ color: T.blue }}>WebRTC</span> with <span style={{ color: T.accent }}>STUN + TURN</span> servers.
                  STUN discovers your public IP. If direct P2P fails (strict NAT, mobile data, different ISPs),
                  <span style={{ color: T.accent }}> TURN relays traffic</span> — still end-to-end encrypted, just routed through a relay.
                  The SDP offer/answer exchange via copy-paste replaces a signaling server entirely.</div>
              </div>
            </div>
          )}

          {/* HISTORY */}
          {tab === 'history' && (
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="fadein">
              <div style={{ fontSize: 12, color: T.accentDim, letterSpacing: 3, marginBottom: 14, fontWeight: 700 }}>◷ SESSION HISTORY</div>
              <div style={{ fontSize: 12, color: T.amber, background: T.amber + '0a', border: `1px solid ${T.amber} 22`, borderRadius: 6, padding: 11, marginBottom: 16 }}>⚠ Memory only — data is permanently lost on refresh or tab close</div>
              {(() => {
                // Filter out chat text, folders, and standard files — show ONLY system, security, and errors
                const events = Object.entries(msgs)
                  .flatMap(([pid, ms]) => ms.map(m => ({ ...m, pid })))
                  .filter(m => m.type === 'sys' || m.type === 'err' || m.type === 'handshake')
                  .sort((a, b) => b.id - a.id)

                if (!events.length) return <div style={{ color: T.null_, fontSize: 13, textAlign: 'center', marginTop: 48 }}>No system or security logs yet.</div>

                return events.map((ev, i) => {
                  const dot = ev.type === 'err' ? T.red : T.accent
                  let label = ev.text || 'System event'
                  // If connection event, format cleanly:
                  if (ev.type === 'sys') {
                    if (label.includes('channel open')) label = `Connected + Authenticated`
                    else if (label.includes('disconnected') || label.includes('closed')) label = `Connection Dropped`
                  }
                  return (
                    <div key={i} className="card" style={{ display: 'flex', gap: 12, padding: '10px 16px', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: T.textDim, flexShrink: 0, width: 68, fontVariantNumeric: 'tabular-nums' }}>{ev.time}</span>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, marginTop: 5, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: T.textMid, flex: 1, wordBreak: 'break-word' }}>[Peer {ev.pid}] — {label}</span>
                    </div>
                  )
                })
              })()}
            </div>
          )}

          {/* DETAILS */}
          {tab === 'details' && (
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="fadein">
              <div style={{ fontSize: 12, color: T.accentDim, letterSpacing: 3, marginBottom: 16, fontWeight: 700 }}>◉ MY DETAILS</div>
              <div className="card" style={{ overflow: 'hidden' }}>
                {[
                  { l: 'Display Name', v: account?.name },
                  { l: 'Node ID', v: myId.current, c: T.accent },
                  { l: 'Public IP', v: publicIP === 'detecting…' ? 'Detecting…' : publicIP, c: T.accent },
                  { l: 'Local IP', v: localIP === 'detecting…' ? 'Detecting…' : localIP, c: T.text },
                  { l: 'MAC Address', v: 'N/A  (browsers block MAC access for privacy)', c: T.null_ },
                  { l: 'ECDH Public Key', v: (keyRef.current?.pub || '').slice(0, 52) + '…', c: T.textDim },
                  { l: 'Session Crypto', v: 'ECDH P-256 + AES-GCM-256', c: T.green },
                  { l: 'Passphrase', v: '✓ set (hidden)', c: T.green },
                  { l: 'Password', v: '✓ set (hidden)', c: T.green },
                  { l: 'Session started', v: new Date(Date.now() - uptime * 1000).toLocaleTimeString() },
                ].map(d => (
                  <div key={d.l} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 16, padding: '11px 16px', borderBottom: `1px solid ${T.border} ` }}>
                    <span style={{ fontSize: 12, color: T.textDim }}>{d.l}</span>
                    <span style={{ fontSize: 12, color: d.c || T.text, wordBreak: 'break-all' }}>{d.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPTIME */}
          {tab === 'uptime' && (
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="fadein">
              <div style={{ fontSize: 12, color: T.accentDim, letterSpacing: 3, marginBottom: 16, fontWeight: 700 }}>▲ UP-TIME MONITOR</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10 }}>
                {[{ l: 'SESSION UPTIME', v: fmt(uptime), c: T.accent, big: true }, { l: 'LOCK TIMER', v: fmtMin(lockTimer), c: lockTimer < 120 ? T.red : T.amber }, { l: 'PEERS ONLINE', v: String(onlinePeers.length), c: T.green }, { l: 'MSGS SENT', v: String(Object.values(msgs).flat().filter(m => m.from === 'me' && m.type === 'text').length) }, { l: 'FILES SENT', v: String(Object.values(msgs).flat().filter(m => m.from === 'me' && m.type === 'file_out').length) }, { l: 'ACTIVE TRANSFERS', v: String(Object.keys(transfers).length), c: Object.keys(transfers).length ? T.amber : T.textMid }].map(s => (
                  <div key={s.l} className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 6 }}>{s.l}</div>
                    <div style={{ fontSize: s.big ? 26 : 16, color: s.c || T.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                  </div>
                ))}
              </div>
              {Object.keys(transfers).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: T.accentDim, letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>ACTIVE TRANSFERS</div>
                  {Object.entries(transfers).map(([id, t]) => (
                    <div key={id} className="card" style={{ padding: '12px 16px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: T.text }}>{t.name}</span>
                        <span style={{ fontSize: 12, color: T.accent }}>{Math.round(t.pct * 100)}%</span>
                      </div>
                      <div className="prog-track"><div className="prog-fill" style={{ width: `${t.pct * 100}% ` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DEV */}
          {tab === 'dev' && (
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="fadein">
              <div style={{ fontSize: 12, color: T.accentDim, letterSpacing: 3, marginBottom: 16, fontWeight: 700 }}>⚙ SYSTEM / DEV INFO</div>
              <div className="card" style={{ padding: 18 }}>
                {[{ l: 'Browser', v: navigator.userAgent.slice(0, 60) + '…' }, { l: 'WebRTC', v: typeof RTCPeerConnection !== 'undefined' ? '✓ Supported' : '✗ Unsupported', c: typeof RTCPeerConnection !== 'undefined' ? T.green : T.red }, { l: 'WebCrypto', v: typeof crypto.subtle !== 'undefined' ? '✓ Supported' : '✗ Unsupported', c: typeof crypto.subtle !== 'undefined' ? T.green : T.red }, { l: 'DataChannel', v: 'Ordered SCTP (reliable)' }, { l: 'STUN Servers', v: 'Google, Cloudflare, STUNProtocol' }, { l: 'Chunk Size', v: fmtSz(settings.chunkSize) }, { l: 'Spam Limit', v: `${settings.spamLimit} msgs / min / peer` }, { l: 'Code Execution', v: 'Disabled — display only' }, { l: 'Persistence', v: 'None — memory only' }, { l: 'Archive Sandbox', v: settings.archiveWarn ? 'Enabled' : 'Disabled' }].map(d => (
                  <div key={d.l} style={{ display: 'flex', gap: 14, padding: '9px 0', borderBottom: `1px solid ${T.border} ` }}>
                    <div style={{ fontSize: 11, color: T.textDim, width: 150, flexShrink: 0 }}>{d.l}</div>
                    <div style={{ fontSize: 12, color: d.c || T.text }}>{d.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="fadein">
              <div style={{ fontSize: 12, color: T.accentDim, letterSpacing: 3, marginBottom: 16, fontWeight: 700 }}>✦ SETTINGS</div>
              <div className="card" style={{ padding: 18, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>SECURITY</div>
                {[{ k: 'lockTimeout', l: 'Auto-lock timeout (minutes)', min: 1, max: 60, step: 1 }, { k: 'maxAttempts', l: 'Max unlock attempts before wipe', min: 1, max: 10, step: 1 }].map(s => (
                  <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${T.border} ` }}>
                    <div style={{ flex: 1, fontSize: 13, color: T.text }}>{s.l}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => setSett(s.k, Math.max(s.min, settings[s.k] - s.step))} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 15 }}>−</button>
                      <span style={{ fontSize: 14, color: T.accent, width: 34, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{settings[s.k]}</span>
                      <button onClick={() => setSett(s.k, Math.min(s.max, settings[s.k] + s.step))} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 15 }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 18, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>TRANSFER</div>
                {[{ k: 'chunkSize', l: 'Chunk size', opts: [8192, 16384, 32768, 65536], fmt: v => fmtSz(v) }, { k: 'spamLimit', l: 'Spam limit (msgs/min/peer)', opts: [50, 100, 200, 500], fmt: v => String(v) }].map(s => (
                  <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${T.border} ` }}>
                    <div style={{ flex: 1, fontSize: 13, color: T.text }}>{s.l}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {s.opts.map(o => (
                        <button key={o} onClick={() => setSett(s.k, o)} className="btn btn-xs"
                          style={{ background: settings[s.k] === o ? T.accent + '22' : 'transparent', border: `1px solid ${settings[s.k] === o ? T.accent : T.border} `, color: settings[s.k] === o ? T.accent : T.textDim, minWidth: 44 }}>
                          {s.fmt(o)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 18, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>FEATURES</div>
                {[{ k: 'mdRender', l: 'Markdown rendering in chat' }, { k: 'linkWarn', l: 'External link warnings' }, { k: 'archiveWarn', l: 'Archive sandbox warnings' }].map(s => (
                  <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${T.border} ` }}>
                    <div style={{ flex: 1, fontSize: 13, color: T.text }}>{s.l}</div>
                    <button onClick={() => setSett(s.k, !settings[s.k])} className="btn btn-xs"
                      style={{ background: settings[s.k] ? T.accent + '18' : 'transparent', border: `1px solid ${settings[s.k] ? T.accent : T.border} `, color: settings[s.k] ? T.accent : T.textDim, minWidth: 44 }}>
                      {settings[s.k] ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={doWipe} className="btn btn-danger">✕ End Session & Wipe All</button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — full-screen when peer selected, narrow peer list otherwise */}
        <div className="rpanel" style={{ width: selPeer ? '100%' : 300, borderLeft: `1px solid ${T.border} `, display: 'flex', flexDirection: 'column', background: T.surface, transition: 'width .2s ease', overflow: 'hidden' }}>

          {/* PEERS LIST */}
          {!selPeer ? (
            <>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border} `, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: 13, color: T.accentDim, fontWeight: 700, letterSpacing: 1 }}>PEERS</div>
                <div style={{ fontSize: 11, color: T.textDim }}>{onlinePeers.length} online · {peers.length} total</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!peers.length && (
                  <div style={{ textAlign: 'center', padding: 40, color: T.null_, fontSize: 13, lineHeight: 2.2 }}>
                    No peers connected.<br />
                    <span style={{ fontSize: 12 }}>Use "Connect Peer" tab<br />to establish P2P.</span>
                  </div>
                )}
                {peers.map(peer => {
                  const iceCol = peer.iceState === 'connected' || peer.iceState === 'completed' ? T.green
                    : peer.iceState === 'checking' ? T.amber
                      : peer.iceState === 'failed' ? T.red
                        : peer.iceState === 'disconnected' ? T.amber
                          : T.null_
                  const stateLabel = peer.iceState || peer.state || 'idle'
                  return (
                    <div key={peer.id} className={`prow ${selPeer?.id === peer.id ? 'sel' : ''} `} style={{ position: 'relative' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => setSelPeer(peer)}>
                        <Avatar name={peer.name} id={peer.id} size={44} online={peer.online} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: peer.name ? T.text : T.null_, fontWeight: peer.name ? 600 : 400, fontStyle: peer.name ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {peer.name || 'Anonymous'}
                          </div>
                          <div style={{ fontSize: 10, color: iceCol, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ background: iceCol + '18', border: `1px solid ${iceCol} 40`, borderRadius: 3, padding: '1px 5px' }}>{stateLabel}</span>
                            {peer.fingerprint && <span style={{ color: T.null_, fontFamily: 'monospace', letterSpacing: 0 }}>🔑 {peer.fingerprint}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <div className={`dot ${peer.online ? 'dot-on' : 'dot-off'} `} />
                          <div style={{ fontSize: 10, color: peer.online ? T.green : T.null_ }}>{peer.online ? 'LIVE' : 'OFF'}</div>
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); doDeletePeer(peer.id) }}
                        title="Remove peer"
                        style={{ marginLeft: 8, background: 'transparent', border: `1px solid ${T.border} `, color: T.red, borderRadius: 4, padding: '3px 7px', fontSize: 11, flexShrink: 0, cursor: 'pointer', opacity: .7 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '.7'}>
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            /* CHAT PANEL — FULL WhatsApp STYLE */
            <>
              {/* Chat header */}
              <div style={{ padding: '11px 16px', borderBottom: `1px solid ${T.border} `, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: T.panel }}>
                <button onClick={() => setSelPeer(null)} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 20, padding: '2px 4px', lineHeight: 1 }}>←</button>
                <Avatar name={selPeer.name} id={selPeer.id} size={42} online={selPeer.online} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input value={selPeer.name} onChange={e => setPeerName(selPeer.id, e.target.value)}
                    placeholder="Click to name this peer…"
                    style={{ background: 'none', border: 'none', color: selPeer.name ? T.text : T.null_, fontFamily: 'inherit', fontSize: 14, fontStyle: selPeer.name ? 'normal' : 'italic', width: '100%', outline: 'none', fontWeight: 600, padding: 0 }} />
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{selPeer.id}</span>
                    <span style={{ color: T.null_ }}>·</span>
                    <span style={{ color: selPeer.online ? T.green : T.red }}>{selPeer.online ? '🔒 E2E · Direct P2P' : '⚠ Disconnected'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {selPeer.online && <div style={{ fontSize: 10, color: T.green, background: T.green + '12', border: `1px solid ${T.green} 30`, borderRadius: 4, padding: '3px 8px' }}>● LIVE</div>}
                  <button onClick={() => doDeletePeer(selPeer.id)}
                    title="Remove this peer"
                    className="btn btn-danger btn-sm"
                    style={{ padding: '4px 9px', fontSize: 11 }}>
                    ✕ Remove
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 8, background: T.bg }}>
                {peerMsgs.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'me' ? 'flex-end' : msg.from === 'sys' ? 'center' : 'flex-start' }} className="fadein">
                    {msg.type === 'sys' && <div className="bub bub-sys">{msg.text}</div>}
                    {msg.type === 'text' && (
                      <div className={`bub ${msg.from === 'me' ? 'bub-me' : 'bub-them'} `}>
                        <div style={{ color: T.text }} dangerouslySetInnerHTML={{ __html: settings.mdRender ? renderMD(msg.text) : escH(msg.text).replace(/\n/g, '<br>') }} />
                        <div style={{ fontSize: 10, color: T.textDim, marginTop: 5, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
                          {msg.time}
                          {msg.from === 'me' && <span style={{ color: T.accentDim }}>✓</span>}
                        </div>
                      </div>
                    )}
                    {['file_out', 'file_in', 'file_done'].includes(msg.type) && <FileMsg msg={msg} onSandbox={(m) => setSandboxFile(m)} onRevoke={doRevoke} />}
                    {msg.type === 'folder' && <FolderMsg msg={msg} onOpen={() => setFolderView(msg.folder)} onRevoke={doRevoke} />}
                  </div>
                ))}
                <div ref={chatEnd} />
              </div>

              {/* Active in-progress transfers for this peer */}
              {Object.values(transfers).filter(t => t.pid === selPeer?.id).map(t => (
                <div key={t.name} style={{ padding: '6px 14px', background: T.surface, borderTop: `1px solid ${T.border} ` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>{Math.round(t.pct * 100)}%</span>
                  </div>
                  <div className="prog-track"><div className="prog-fill" style={{ width: `${t.pct * 100}% ` }} /></div>
                </div>
              ))}

              {/* Input area */}
              <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.border} `, background: T.surface, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
                  {/* ATTACH BUTTON */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button onClick={() => setShowAttach(a => !a)}
                      style={{ width: 40, height: 40, borderRadius: 10, background: showAttach ? T.accent + '22' : T.panel, border: `1px solid ${showAttach ? T.accent : T.border} `, color: showAttach ? T.accent : T.textDim, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
                      ⊕
                    </button>
                    {showAttach && (
                      <AttachMenu
                        onFile={() => { setShowAttach(false); fileInp.current?.click() }}
                        onFolder={() => { setShowAttach(false); folderInp.current?.click() }}
                        onCode={() => { setShowAttach(false); setShowCode(true) }}
                        onClose={() => setShowAttach(false)} />
                    )}
                  </div>

                  {/* MESSAGE INPUT */}
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }}
                    placeholder="Message… Markdown supported · Shift+Enter for newline" rows={2}
                    style={{ flex: 1, background: T.bg, border: `1px solid ${T.border} `, borderRadius: 10, padding: '10px 14px', color: T.text, fontFamily: 'inherit', fontSize: 13, resize: 'none', lineHeight: 1.5, transition: 'border-color .15s' }}
                    onFocus={e => e.target.style.borderColor = T.accentDim} onBlur={e => e.target.style.borderColor = T.border} />

                  {/* SEND BUTTON */}
                  <button onClick={doSend}
                    style={{ width: 40, height: 40, borderRadius: 10, background: input.trim() ? T.accent : T.panel, border: `1px solid ${input.trim() ? T.accent : T.border} `, color: input.trim() ? T.bg : T.textDim, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s', fontWeight: 700 }}>
                    ↑
                  </button>
                </div>
                <div style={{ fontSize: 10, color: T.null_, marginTop: 6, textAlign: 'center' }}>
                  🔒 AES-GCM-256 E2E · No unsend · No code execution · No file size limit
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* HIDDEN INPUTS */}
      <input ref={fileInp} type="file" multiple style={{ display: 'none' }} onChange={e => { [...e.target.files].forEach(f => doSendFile(f)); e.target.value = '' }} />
      <input ref={folderInp} type="file" webkitdirectory="" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files.length) doSendFolder([...e.target.files]); e.target.value = '' }} />
    </div>
  )
}
