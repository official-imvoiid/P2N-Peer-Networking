import { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react'
// NOTE: generateKeyPair from crypto.js is intentionally NOT imported here.
// All cryptography (ECDH P-256 + AES-256-GCM) is handled in main.js via Node crypto.
// The renderer WebCrypto key was dead code (keyRef.current was never read). BUG-09 fixed.
import { TCPBridge } from './lib/tcpbridge.js'

// ── ERROR BOUNDARY ────────────────────────────────────────────────────────────
// Prevents any render crash from producing a completely blank screen.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e, info) { console.error('P2N render error:', e, info) }
  render() {
    if (this.state.error) {
      const T2 = { bg: '#0b0e14', text: '#e6edf3', border: '#30363d', surface: '#161b22' }
      return (
        <div style={{ height: '100vh', background: T2.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, color: T2.text, fontWeight: 700, marginBottom: 8 }}>UI Error — TCP connections are unaffected</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 16, background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: 6, padding: '8px 12px', textAlign: 'left', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {this.state.error?.message || String(this.state.error)}
            </div>
            <button onClick={() => this.setState({ error: null })} style={{ background: '#58a6ff', color: '#0d1117', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', marginRight: 8 }}>
              Retry
            </button>

          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg: '#0b0e14', surface: '#161b22', panel: '#1c2330cc', border: '#30363d',
  accent: '#58a6ff', accentDim: '#1f6feb', accentFaint: '#58a6ff10',
  blue: '#58a6ff', amber: '#d29922', red: '#f85149', green: '#3fb950', purple: '#bc8cff',
  orange: '#f97316',
  text: '#e6edf3', textDim: '#9ba8b5', textMid: '#c9d1d9', muted: '#6e7e8f',
  glass: 'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);',
}

const G = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;background:${T.bg};min-width:820px;min-height:540px}
body{font-family:'Inter',system-ui,sans-serif;color:${T.text};font-size:13px;-webkit-font-smoothing:antialiased;user-select:none;overflow:hidden}
input,textarea,select,button{font-family:inherit;font-size:inherit;user-select:text}
:focus{outline:none}
button{cursor:pointer}
button:active:not(:disabled){transform:scale(.97)}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px}::-webkit-scrollbar-track{background:transparent}

/* animations */
@keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadein{from{opacity:0}to{opacity:1}}
.fadeup{animation:fadeUp .16s ease both}
.fadein{animation:fadein .14s ease both}
.spin{animation:spin .7s linear infinite}

/* base atoms */
.card{background:${T.surface};border:1px solid ${T.border};border-radius:8px}
.inp{width:100%;background:${T.bg};border:1px solid ${T.border};border-radius:6px;padding:7px 10px;color:${T.text};transition:border-color .15s;line-height:1.4}
.inp:focus{border-color:${T.accentDim}}.inp.err{border-color:${T.red}!important}.inp::placeholder{color:${T.muted}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:none;border-radius:6px;padding:7px 13px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;transition:all .1s;line-height:1}
.btn:hover:not(:disabled){filter:brightness(1.14)}.btn:disabled{opacity:.38;cursor:default}
.btn-primary{background:${T.accent};color:#0d1117;font-weight:700}
.btn-ghost{background:transparent;border:1px solid ${T.border};color:${T.textDim}}
.btn-ghost:hover:not(:disabled){border-color:#444;color:${T.text}}
.btn-danger{background:${T.red}14;border:1px solid ${T.red}35;color:${T.red}}
.btn-blue{background:${T.blue}12;border:1px solid ${T.blue}32;color:${T.blue}}
.btn-green{background:${T.green}12;border:1px solid ${T.green}32;color:${T.green}}
.btn-amber{background:${T.amber}12;border:1px solid ${T.amber}32;color:${T.amber}}
.btn-purple{background:${T.purple}12;border:1px solid ${T.purple}32;color:${T.purple}}
.btn-sm{padding:5px 10px;font-size:11px}.btn-xs{padding:3px 7px;font-size:10px}

/* titlebar */
.tb{height:40px;background:${T.surface};border-bottom:1px solid ${T.border};display:flex;align-items:center;padding:0 8px;gap:2px;flex-shrink:0;-webkit-app-region:drag;position:relative;z-index:200}
.tb-no-drag{-webkit-app-region:no-drag}
.tb-btn{background:transparent;border:none;color:${T.textDim};font-size:11px;font-weight:500;padding:4px 8px;border-radius:5px;cursor:pointer;transition:all .1s;-webkit-app-region:no-drag;white-space:nowrap}
.tb-btn:hover{background:${T.panel};color:${T.text}}
.tb-close-btn{background:transparent;border:none;width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;color:${T.textDim};font-size:13px;cursor:pointer;transition:all .1s;-webkit-app-region:no-drag;flex-shrink:0}
.tb-close-btn:hover{background:#f8514920;color:${T.red}}
.tb-drop{position:absolute;top:calc(100% + 3px);left:0;background:${T.surface};border:1px solid ${T.border};border-radius:8px;min-width:215px;box-shadow:0 8px 32px #0008;z-index:999;padding:4px}
.tb-drop-item{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:7px 10px;border:none;background:transparent;color:${T.text};font-family:inherit;font-size:11px;border-radius:5px;cursor:pointer;transition:background .07s;text-align:left}
.tb-drop-item:hover{background:${T.panel}}
.tb-drop-sep{height:1px;background:${T.border};margin:3px 0}
.tb-shortcut{font-size:10px;color:${T.muted};font-family:monospace}
.tb-drag-fill{flex:1;height:100%;-webkit-app-region:drag}

/* sidebar nav */
.nav-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;background:transparent;border:none;border-radius:6px;color:${T.textDim};font-size:12px;font-weight:500;font-family:inherit;cursor:pointer;transition:all .1s;margin-bottom:1px;text-align:left}
.nav-item:hover{background:${T.panel};color:${T.text}}.nav-item.act{background:${T.accentFaint};color:${T.accent}}

/* chat */
.bub{border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.6;word-break:break-word;max-width:74%}
.bub-me{background:${T.accent}1a;border:1px solid ${T.accent}30;border-bottom-right-radius:3px}
.bub-them{background:${T.surface};border:1px solid ${T.border};border-bottom-left-radius:3px}
.bub-sys{background:transparent;border:1px solid ${T.border};color:${T.textDim};font-size:11px;border-radius:20px;padding:3px 12px;max-width:100%;text-align:center}
.prog{height:2px;background:${T.border};border-radius:2px;overflow:hidden}.prog-fill{height:100%;border-radius:2px;background:${T.accent};transition:width .3s}
.stag{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:500}

/* GFM markdown */
.md-h1{font-size:18px;font-weight:700;color:${T.text};margin:10px 0 6px;border-bottom:1px solid ${T.border};padding-bottom:6px}
.md-h2{font-size:15px;font-weight:700;color:${T.text};margin:8px 0 5px;border-bottom:1px solid ${T.border}60;padding-bottom:4px}
.md-h3{font-size:13px;font-weight:700;color:${T.textMid};margin:7px 0 4px}
.md-hr{border:none;border-top:1px solid ${T.border};margin:10px 0}
.md-bq{border-left:3px solid ${T.accentDim};padding:4px 10px;color:${T.textDim};margin:4px 0;background:${T.accentFaint};border-radius:0 4px 4px 0}
.md-li{display:flex;align-items:flex-start;gap:6px;margin-bottom:2px;font-size:13px}
.md-task{display:flex;align-items:center;gap:6px;margin-bottom:2px;font-size:13px}
.md-table-wrap{overflow-x:auto;margin:6px 0}.md-table{border-collapse:collapse;width:100%}
.md-table th{padding:6px 10px;border:1px solid ${T.border};background:${T.panel};text-align:left;font-weight:600;font-size:12px}
.md-table td{padding:5px 10px;border:1px solid ${T.border};font-size:12px;color:${T.textMid}}
.md-table tr:nth-child(even) td{background:${T.bg}30}
/* folder browser rows */
.fb-row{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:5px;font-size:11px;cursor:pointer;transition:background .07s;min-height:26px}
.fb-row:hover{background:${T.panel}}.fb-row.sel{background:${T.accent}12;border:1px solid ${T.accent}20}

/* code */
.codeblock{background:#010409;border:1px solid ${T.border};border-left:3px solid ${T.accentDim};border-radius:6px;padding:9px 12px;margin:3px 0;overflow-x:auto}
.codeblock pre{font-family:'Cascadia Code','Fira Code',monospace;font-size:12px;color:#7ee787;white-space:pre;margin:0}
.icode{background:${T.panel};padding:1px 5px;border-radius:3px;color:${T.blue};font-size:12px;font-family:monospace}
.cbtn{background:${T.panel};border:1px solid ${T.border};color:${T.textDim};font-size:10px;padding:2px 6px;border-radius:3px;cursor:pointer}
.code-ed{background:#010409;border:1px solid ${T.border};border-radius:6px;padding:12px;font-family:'Cascadia Code','Fira Code',monospace;font-size:13px;color:#7ee787;width:100%;min-height:200px;line-height:1.7;resize:vertical;tab-size:2}
.code-ed:focus{border-color:${T.accentDim}}

/* overlay */
.overlay{position:fixed;inset:0;background:#000c;z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)}

/* log */
.log-row{display:grid;grid-template-columns:72px 42px 1fr;gap:8px;padding:4px 10px;border-bottom:1px solid ${T.border}15;font-size:11px;font-family:monospace;align-items:baseline}
.log-row:hover{background:${T.panel}}

/* sandbox tree */
.sb-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:5px;cursor:pointer;margin-bottom:1px;transition:background .08s}
.sb-row:hover{background:${T.panel}}

/* misc */
.sh{font-size:10px;color:${T.textDim};letter-spacing:2px;font-weight:600;text-transform:uppercase;margin-bottom:9px}
.glass{background:${T.panel}; ${T.glass} border: 1px solid ${T.border}80; box-shadow: 0 4px 24px #0004;}
.glow-blue{box-shadow: 0 0 20px ${T.blue}15; border: 1px solid ${T.blue}30 !important;}
.glow-accent{box-shadow: 0 0 20px ${T.accent}15; border: 1px solid ${T.accent}30 !important;}

@keyframes pulse{0%{opacity:.4}50%{opacity:.8}100%{opacity:.4}}
@keyframes lockpulse{0%,100%{transform:scale(1);filter:drop-shadow(0 0 4px #d2992260)}50%{transform:scale(1.12);filter:drop-shadow(0 0 10px #d2992280)}}
@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
.pulse{animation:pulse 2s infinite ease-in-out}
`

// ── PURE-JS ZIP CREATOR ───────────────────────────────────────────────────────
// Creates a ZIP archive in memory from an array of {name, blob} objects.
// Uses STORE method (no compression) — fast, works for all file types.
// Compatible with all ZIP readers. No external dependencies.
async function createZipBlob(files) {
  const enc = new TextEncoder()
  const localHeaders = [], centralDir = [], fileData = []
  let offset = 0

  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b }
  const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b }

  // CRC-32 table
  const crcTable = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })()
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }

  for (const file of files) {
    const nameBuf = enc.encode(file.name)
    const dataBuf = file.blob ? new Uint8Array(await file.blob.arrayBuffer()) : new Uint8Array(0)
    const crc = crc32(dataBuf)
    const now = new Date()
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

    const localHeader = new Uint8Array([
      0x50, 0x4B, 0x03, 0x04, // local file header signature
      20, 0,                   // version needed
      0, 0,                   // general purpose bit flag
      0, 0,                   // compression method: STORE
      ...u16(dosTime), ...u16(dosDate),
      ...u32(crc),
      ...u32(dataBuf.length), // compressed size
      ...u32(dataBuf.length), // uncompressed size
      ...u16(nameBuf.length),
      0, 0,                   // extra field length
      ...nameBuf,
    ])

    const centralHeader = new Uint8Array([
      0x50, 0x4B, 0x01, 0x02, // central dir signature
      20, 0,                   // version made by
      20, 0,                   // version needed
      0, 0,                   // general purpose bit flag
      0, 0,                   // compression method: STORE
      ...u16(dosTime), ...u16(dosDate),
      ...u32(crc),
      ...u32(dataBuf.length),
      ...u32(dataBuf.length),
      ...u16(nameBuf.length),
      0, 0,                   // extra field length
      0, 0,                   // file comment length
      0, 0,                   // disk number start
      0, 0,                   // internal attributes
      0, 0, 0, 0,             // external attributes
      ...u32(offset),         // relative offset of local header
      ...nameBuf,
    ])

    localHeaders.push(localHeader)
    fileData.push(dataBuf)
    centralDir.push(centralHeader)
    offset += localHeader.length + dataBuf.length
  }

  const centralDirOffset = offset
  const centralDirSize = centralDir.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array([
    0x50, 0x4B, 0x05, 0x06, // end of central dir signature
    0, 0,                   // disk number
    0, 0,                   // disk with central dir
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralDirSize),
    ...u32(centralDirOffset),
    0, 0,                   // comment length
  ])

  const parts = []
  for (let i = 0; i < files.length; i++) {
    parts.push(localHeaders[i])
    parts.push(fileData[i])
  }
  centralDir.forEach(c => parts.push(c))
  parts.push(eocd)

  return new Blob(parts, { type: 'application/zip' })
}


// ── UTILS ─────────────────────────────────────────────────────────────────────
const fmt = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const fmtMin = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const fmtSz = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B'
const fmtTime = s => s > 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s > 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
const now8 = () => new Date().toTimeString().slice(0, 8)
const escH = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const makeId = n => '#' + Math.abs([...n].reduce((a, c, i) => ((a << 5) - a + c.charCodeAt(0) * (i + 7)) | 0, 0)).toString(16).padStart(8, '0').toUpperCase()
const WORDS = ['apple', 'bridge', 'cedar', 'delta', 'ember', 'flint', 'grove', 'harbor', 'iris', 'jade', 'kite', 'lemon', 'maple', 'noble', 'orbit', 'quartz', 'river', 'stone', 'tiger', 'vault', 'walnut', 'xenon', 'zinc']
const phrase = () => { const w = () => WORDS[Math.floor(Math.random() * WORDS.length)]; return `${w()}-${w()}-${w()}-${w()}` }
const IS_ARCH = /\.(zip|tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz)$/i
const IS_ZIP = /\.zip$/i
const IS_ARCH_VIEWABLE = /\.(zip|tar|tgz|tar\.gz|tar\.bz2|tar\.xz)$/i  // archives we can list/browse
const IS_UNSUPPORTED_ARCH = /\.(rar|7z|iso|dmg|apk|cab|pkg|deb|rpm|z|lz|lzma|lzo)$/i  // v4: Block unsupported archives
// BUG 7 FIX: Bare compressed files (.bz2, .gz, .xz without .tar prefix) are NOT valid archives
const IS_BARE_COMPRESSED = /(?<!\.tar)\.(bz2|gz|xz)$/i
// all git-tracked text / code types
const IS_TEXT = /\.(txt|md|markdown|rst|log|json|jsonc|json5|xml|csv|tsv|html|htm|css|scss|less|sass|js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|pyw|java|c|cpp|cc|cxx|h|hpp|sh|bash|zsh|fish|yaml|yml|toml|ini|cfg|conf|env|envrc|sql|rs|go|rb|rake|php|bat|ps1|psm1|psd1|lua|r|m|jl|hs|elm|ex|exs|erl|clj|cljs|cljc|zig|v|tf|tfvars|proto|graphql|gql|prisma|gradle|mk|makefile|cmake|dockerfile|containerfile|gitignore|gitattributes|npmrc|eslintrc|prettierrc|babelrc|editorconfig|lock|mod|sum|gradle|properties|plist|inf)$/i
const IS_IMG = /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff|avif)$/i
const IS_PDF = /\.pdf$/i
// viewable inline: all text + image + pdf
const IS_VIEWABLE = /\.(txt|md|markdown|rst|log|json|jsonc|xml|csv|html|htm|css|scss|less|js|mjs|jsx|ts|tsx|vue|svelte|py|java|c|cpp|h|hpp|sh|bash|yaml|yml|toml|ini|cfg|conf|env|sql|rs|go|rb|php|bat|ps1|lua|r|m|ex|exs|zig|tf|proto|graphql|prisma|gitignore|dockerfile|properties|lock|mod|vue|svelte|png|jpg|jpeg|gif|bmp|webp|svg|ico|pdf)$/i
// dangerous executables — warn sender, warn receiver
const IS_DANGEROUS = /\.(exe|dll|msi|vbs|vbe|wsf|wsh|scr|hta|jar|com|reg|lnk|iso|dmg|pkg|deb|rpm|apk|pif|cmd)$/i

// ── SECURITY SCANNER ─────────────────────────────────────────────────────────
// FIX #6: Enhanced security scanner — deep inspection for hidden attacks
async function detectThreats(blob, filename) {
  if (!blob) return []
  try {
    const threats = []
    const slice = blob.slice(0, 65536)
    const buf = await slice.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const text = new TextDecoder('latin1').decode(bytes)
    const ext = filename.toLowerCase().replace(/.*\./, '')
    const magic4 = Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Only flag EXE header inside a clearly non-executable extension (strong signal of spoofing)
    const SAFE_EXTS_WITH_EXE_MAGIC = new Set(['exe','dll','msi','com','scr','pif','sys','drv'])
    if (!SAFE_EXTS_WITH_EXE_MAGIC.has(ext) && magic4.startsWith('4d5a')) {
      threats.push(`Executable (EXE/DLL) header in .${ext} file — possible disguised executable`)
    }

    // PDF: only flag truly dangerous active content — not passive metadata like /AcroForm
    if (IS_PDF.test(filename)) {
      if ((/\/JavaScript\b/.test(text) || /\/JS\s/.test(text)) && /\/Action\b/.test(text))
        threats.push('JavaScript execution action in PDF')
      if (/\/Launch\b/.test(text) && /\/Action\b/.test(text))
        threats.push('Program launch action in PDF')
    }

    // Images: only actual code injection — not SVG styles or data attributes
    if (IS_IMG.test(filename)) {
      if (/<\?php\s/i.test(text)) threats.push('PHP code embedded in image file')
      if (/\.svg$/i.test(filename) && /<script[\s>]/i.test(text))
        threats.push('Executable script in SVG file')
    }

    // ZIP bomb: only flag very tiny archives (< 256 bytes is physically impossible without trickery)
    if (/\.(zip|gz|7z|rar)$/i.test(filename) && blob.size > 0 && blob.size < 256)
      threats.push('Extremely small archive — possible decompression bomb')

    return threats
  } catch { return [] }
}

// ── EXIF / METADATA STRIPPER ──────────────────────────────────────────────────
// Strips metadata from images (EXIF, XMP, IPTC, ICC) and PDFs (/Info dict)
// before sending. Pure JS, no native deps. Default OFF — user must enable.
async function stripMetadata(blob, filename) {
  try {
    const buf = await blob.arrayBuffer()
    const bytes = new Uint8Array(buf)

    // ── JPEG: Remove all APP0-APP15 segments except APP0 (JFIF) ──────────────
    if (/\.(jpg|jpeg)$/i.test(filename)) {
      const out = []
      let i = 0
      // Copy SOI marker
      if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return blob  // not JPEG
      out.push(0xFF, 0xD8)
      i = 2
      while (i < bytes.length - 1) {
        if (bytes[i] !== 0xFF) break
        const marker = bytes[i + 1]
        // Keep SOS (0xDA) and everything after (compressed image data)
        if (marker === 0xDA) {
          for (let j = i; j < bytes.length; j++) out.push(bytes[j])
          break
        }
        const segLen = (bytes[i + 2] << 8) | bytes[i + 3]
        // Drop APP1 (EXIF/XMP), APP2 (ICC), APP13 (IPTC), APP14, APP15
        const isMetaSeg = marker >= 0xE1 && marker <= 0xEF
        if (!isMetaSeg) {
          for (let j = i; j < i + 2 + segLen; j++) out.push(bytes[j])
        }
        i += 2 + segLen
      }
      return new Blob([new Uint8Array(out)], { type: 'image/jpeg' })
    }

    // ── PNG: Remove all non-critical chunks (tEXt, iTXt, zTXt, eXIf, etc.) ──
    if (/\.png$/i.test(filename)) {
      const KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'bKGD', 'pHYs', 'sBIT', 'hIST', 'sPLT', 'tIME'])
      const out = []
      // PNG signature
      for (let j = 0; j < 8; j++) out.push(bytes[j])
      let i = 8
      while (i < bytes.length) {
        const len = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0
        const name = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
        const totalChunk = 4 + 4 + len + 4
        if (KEEP.has(name)) {
          for (let j = i; j < i + totalChunk; j++) out.push(bytes[j])
        }
        i += totalChunk
        if (name === 'IEND') break
      }
      return new Blob([new Uint8Array(out)], { type: 'image/png' })
    }

    // ── PDF: Strip /Info dictionary and XMP metadata streams ─────────────────
    if (/\.pdf$/i.test(filename)) {
      let text = new TextDecoder('latin1').decode(bytes)
      // Remove /Info reference from trailer
      text = text.replace(/\/Info\s+\d+\s+\d+\s+R/g, '')
      // Remove XMP metadata streams
      text = text.replace(/<\?xpacket[\s\S]*?<\/x:xmpmeta>[\s\S]*?<\?xpacket.*?\?>/g, '')
      return new Blob([new TextEncoder().encode(text)], { type: 'application/pdf' })
    }

    // All other file types: return unchanged
    return blob
  } catch (e) {
    console.warn('stripMetadata failed:', e)
    return blob  // fail safe — return original
  }
}


function _fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('FileReader failed'))
    r.readAsDataURL(file)
  })
}

function renderMD(rawText) {
  if (!rawText) return ''
  const codeBlocks = [], inlineCodes = []
  let text = rawText.replace(/```(\w*)\r?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length; codeBlocks.push({ lang: lang || 'code', code: code.trim() }); return `\x00CB${idx}\x00`
  })
  text = text.replace(/`([^`\r\n]+)`/g, (_, c) => { const idx = inlineCodes.length; inlineCodes.push(c); return `\x00IC${idx}\x00` })
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = text.split(/\r?\n/), out = []
  let ulItems = [], olItems = [], listType = null
  const flushList = () => {
    if (ulItems.length) { out.push(`<div style="margin:4px 0">${ulItems.map(i => `<div style="display:flex;gap:5px;margin-bottom:2px;line-height:1.6"><span style="color:${T.accent};flex-shrink:0">•</span>${i}</div>`).join('')}</div>`); ulItems = [] }
    if (olItems.length) { out.push(`<div style="margin:4px 0">${olItems.map((i, n) => `<div style="display:flex;gap:5px;margin-bottom:2px;line-height:1.6"><span style="color:${T.accent};flex-shrink:0;min-width:16px">${n + 1}.</span>${i}</div>`).join('')}</div>`); olItems = [] }
    listType = null
  }
  // CHANGE 6: Fix URL unescaping — inline() runs on HTML-escaped text, so &amp; in URLs must be restored
  const inline = t => t
    .replace(/~~(.+?)~~/g, '<s style="opacity:.7">$1</s>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => {
      const cleanUrl = url.replace(/&amp;/g, '&')
      return `<span class="p2n-link" data-url="${cleanUrl}" style="color:${T.amber};text-decoration:underline dashed;cursor:pointer">⚠ ${label}</span>`
    })
    .replace(/(https?:\/\/[^\s<&"]+(?:&amp;[^\s<&"]*)*)/g, (_, url) => {
      const cleanUrl = url.replace(/&amp;/g, '&')
      return `<span class="p2n-link" data-url="${cleanUrl}" style="color:${T.amber};text-decoration:underline dashed;cursor:pointer">⚠ ${cleanUrl}</span>`
    })
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const h1 = line.match(/^# (.+)$/), h2 = line.match(/^## (.+)$/), h3 = line.match(/^### (.+)$/)
    if (h1 || h2 || h3) { flushList(); const c = (h1 || h2 || h3)[1]; out.push(`<div style="font-size:${h1 ? 18 : h2 ? 15 : 13}px;font-weight:700;color:${T.text};margin:${h1 ? 10 : 7}px 0 5px;${h1 || h2 ? `border-bottom:1px solid ${T.border};padding-bottom:4px` : ''};">${inline(c)}</div>`); i++; continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushList(); out.push(`<hr style="border:none;border-top:1px solid ${T.border};margin:10px 0"/>`); i++; continue }
    if (line.startsWith('&gt; ')) { flushList(); out.push(`<div style="border-left:3px solid ${T.accentDim};padding:4px 10px;color:${T.textDim};margin:4px 0;background:${T.accentFaint};border-radius:0 4px 4px 0">${inline(line.slice(5))}</div>`); i++; continue }
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s\-:|]+\|/.test(lines[i + 1])) {
      flushList()
      const cols = line.split('|').filter((_, ci, a) => ci > 0 && ci < a.length - 1).map(c => c.trim())
      const thead = `<tr>${cols.map(h => `<th style="padding:6px 10px;border:1px solid ${T.border};background:${T.panel};text-align:left;font-weight:600;font-size:12px">${inline(h)}</th>`).join('')}</tr>`
      i += 2; const tbody = []
      while (i < lines.length && lines[i].includes('|')) { const cells = lines[i].split('|').filter((_, ci, a) => ci > 0 && ci < a.length - 1).map(c => c.trim()); tbody.push(`<tr>${cols.map((_, ci) => `<td style="padding:5px 10px;border:1px solid ${T.border};font-size:12px;color:${T.textMid}">${inline(cells[ci] || '')}</td>`).join('')}</tr>`); i++ }
      out.push(`<div style="overflow-x:auto;margin:6px 0"><table style="border-collapse:collapse;width:100%"><thead>${thead}</thead><tbody>${tbody.join('')}</tbody></table></div>`)
      continue
    }
    const taskU = line.match(/^- \[ \] (.+)$/), taskC = line.match(/^- \[x\] (.+)$/)
    if (taskU || taskC) { flushList(); out.push(`<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;font-size:13px"><input type="checkbox" disabled ${taskC ? 'checked' : ''} style="accent-color:${T.accent};margin:0;cursor:default"/> ${inline((taskU || taskC)[1])}</div>`); i++; continue }
    const ulM = line.match(/^[-*+] (.+)$/)
    if (ulM) { if (listType !== 'ul') { flushList(); listType = 'ul' } ulItems.push(inline(ulM[1])); i++; continue }
    const olM = line.match(/^\d+\. (.+)$/)
    if (olM) { if (listType !== 'ol') { flushList(); listType = 'ol' } olItems.push(inline(olM[1])); i++; continue }
    flushList()
    if (!line.trim()) { out.push('<div style="height:6px"></div>'); i++; continue }
    out.push(`<div style="margin:1px 0;line-height:1.6">${inline(line)}</div>`)
    i++
  }
  flushList()
  let html = out.join('')
  inlineCodes.forEach((c, idx) => { html = html.split(`\x00IC${idx}\x00`).join(`<code class="icode">${c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`) })
  codeBlocks.forEach(({ lang, code }, idx) => { const id = 'cb' + Math.random().toString(36).slice(2, 7), esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); html = html.split(`\x00CB${idx}\x00`).join(`<div class="codeblock"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="font-size:9px;color:${T.textDim};letter-spacing:1px;text-transform:uppercase">${lang}</span><button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent);this.textContent='✓';setTimeout(()=>this.textContent='⎘',1500)" class="cbtn">⎘</button></div><pre id="${id}">${esc}</pre></div>`) })
  return html
}

// ── AVATAR ────────────────────────────────────────────────────────────────────
function Av({ name, id, size = 34, online }) {
  const hue = Math.abs([...(name || id || '?')].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360
  const raw = (name || '').trim(), ini = raw.length >= 2 ? (raw[0] + raw[raw.length - 1]).toUpperCase() : raw[0]?.toUpperCase() || '?'
  return <div style={{ width: size, height: size, borderRadius: '50%', background: `hsl(${hue},18%,15%)`, border: `2px solid ${online ? T.green : T.muted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: online ? `hsl(${hue},55%,65%)` : T.textDim, fontSize: Math.round(size * .35), flexShrink: 0, position: 'relative' }}>
    {ini}<div style={{ position: 'absolute', bottom: 0, right: 0, width: Math.round(size * .24), height: Math.round(size * .24), borderRadius: '50%', background: online ? T.green : T.muted, border: `1.5px solid ${T.bg}` }} />
  </div>
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function Toast({ n }) {
  if (!n) return null
  const c = n.t === 'ok' ? T.green : n.t === 'err' ? T.red : T.accent
  return <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, background: T.surface, border: `1px solid ${c}45`, borderRadius: 8, padding: '9px 14px', color: c, fontSize: 12, maxWidth: 300, animation: 'fadeUp .16s ease', boxShadow: '0 8px 24px #0008', lineHeight: 1.5, display: 'flex', gap: 8 }}>
    <span>{n.t === 'ok' ? '✓' : n.t === 'err' ? '✕' : 'ℹ'}</span><span>{n.msg}</span>
  </div>
}

// ── CLOSE CONFIRM ─────────────────────────────────────────────────────────────
function CloseConfirm({ onCancel, onTerminate }) {
  const [v, setV] = useState('')
  const go = () => { if (v !== 'TERMINATE') return; onTerminate?.(); window.ftps?.windowControl('close-confirmed') }
  return <div className="overlay"><div className="card fadeup" style={{ width: 'min(380px,95vw)', padding: 26, border: `1px solid ${T.red}35` }}>
    <div style={{ textAlign: 'center', fontSize: 22, marginBottom: 10 }}>⚠️</div>
    <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>End Session &amp; Close P2N?</div>
    <div style={{ fontSize: 12, color: T.textDim, marginBottom: 18, lineHeight: 1.7, textAlign: 'center' }}>All peer connections will close and your session will end.<br />Type <strong style={{ color: T.red }}>TERMINATE</strong> to confirm.</div>
    <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onCancel() }}
      placeholder="TERMINATE" autoFocus className="inp"
      style={{
        textAlign: 'center', fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: 14,
        borderColor: v === 'TERMINATE' ? T.red : T.border, color: v === 'TERMINATE' ? T.red : T.text, background: v === 'TERMINATE' ? T.red + '0d' : T.bg
      }} />
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
      <button onClick={go} className="btn btn-danger" disabled={v !== 'TERMINATE'}>Terminate Session</button>
    </div>
  </div></div>
}

// ── TITLE BAR ─────────────────────────────────────────────────────────────────
function TitleBar({ account, nodeId, onlinePeers, listenActive, onLock, onTerminate, uptime, onHelp, lockTimer, lockMin }) {
  const [vOpen, setVOpen] = useState(false)
  const vRef = useRef(null)
  const wc = a => window.ftps?.windowControl(a)

  useEffect(() => {
    const h = e => { if (vRef.current && !vRef.current.contains(e.target)) setVOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const VIEW = [
    { l: 'Minimize', k: 'minimize', s: 'Ctrl+M' },
    { l: 'Maximize', k: 'maximize', s: 'Ctrl+Shift+M' },
    { l: 'Toggle Fullscreen', k: 'fullscreen', s: 'F11' },
    { sep: true },
    { l: 'Zoom In', k: 'zoomin', s: 'Ctrl++' },
    { l: 'Actual Size', k: 'zoomreset', s: 'Ctrl+0' },
    { l: 'Zoom Out', k: 'zoomout', s: 'Ctrl+-' },
  ]

  return <div className="tb">
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', WebkitAppRegion: 'no-drag' }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: T.accent, letterSpacing: 2 }}>P2P</span>
    </span>
    <div style={{ width: 1, height: 14, background: T.border, margin: '0 2px' }} />
    <button className="tb-btn" onClick={onHelp} title="Open Documentation">Help</button>
    <div style={{ position: 'relative', WebkitAppRegion: 'no-drag' }} ref={vRef}>
      <button className="tb-btn" onClick={() => setVOpen(o => !o)}>View ▾</button>
      {vOpen && <div className="tb-drop">
        {VIEW.map((it, i) => it.sep
          ? <div key={i} className="tb-drop-sep" />
          : <button key={i} className="tb-drop-item" title={it.note || ''} onClick={() => { wc(it.k); setVOpen(false) }}>
            <span>{it.l}</span><span className="tb-shortcut">{it.s}</span>
          </button>
        )}
      </div>}
    </div>
    <div className="tb-drag-fill" />
    {/* Center info — non-interactive */}
    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
      <span style={{ color: T.textMid }}>{account?.name}</span>
      <span style={{ color: T.muted }}>·</span>
      <span style={{ color: T.accent, fontWeight: 600 }}>{nodeId}</span>
      <span style={{ color: T.muted }}>·</span>
      <span style={{ color: onlinePeers > 0 ? T.green : listenActive ? T.blue : T.muted }}>
        {onlinePeers > 0 ? `● ${onlinePeers} peer${onlinePeers !== 1 ? 's' : ''} online` : listenActive ? '◉ listening' : '○ offline'}
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, WebkitAppRegion: 'no-drag' }}>
      <span style={{ fontSize: 10, color: T.muted, fontVariantNumeric: 'tabular-nums', marginRight: 6 }}>{fmt(uptime)}</span>
      {/* BUG-05 fix: lock countdown timer — was computed but never displayed */}
      <span
        title={`Auto-locks after ${lockMin} min inactivity`}
        style={{
          fontSize: 10, color: lockTimer < 60 ? T.red : lockTimer < 180 ? T.amber : T.muted,
          fontVariantNumeric: 'tabular-nums', marginRight: 6,
          fontWeight: lockTimer < 60 ? 700 : 400,
        }}
      > {fmtMin(lockTimer)}</span>
      <button onClick={onLock} className="tb-btn" style={{ color: T.amber }}>🔒 Lock</button>
      <button onClick={onTerminate} className="tb-btn" style={{ color: T.red }}>End</button>
    </div>
  </div>
}

// ── CODE EDITOR ───────────────────────────────────────────────────────────────
function CodeEditor({ onSend, onClose }) {
  const [lang, setLang] = useState('python'), [code, setCode] = useState('')
  const langs = ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'rust', 'go', 'bash', 'sql', 'html', 'json', 'yaml', 'markdown']
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(680px,95vw)', height: 'min(500px,90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: T.accent, fontWeight: 700, flex: 1 }}>{'</>'} Code Block</span>
        <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 8px', color: T.text, fontSize: 12 }}>{langs.map(l => <option key={l}>{l}</option>)}</select>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
        <div style={{ fontSize: 10, color: T.textDim }}>Tab = 2 spaces · Shift+Enter to send</div>
        <textarea className="code-ed" value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1 }}
          onKeyDown={e => {
            if (e.key === 'Tab') { e.preventDefault(); const s = e.target.selectionStart; const v = code.slice(0, s) + '  ' + code.slice(e.target.selectionEnd); setCode(v); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2 }, 0) }
            if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); if (code.trim()) { onSend('```' + lang + '\n' + code + '\n```'); onClose() } }
          }} placeholder={`// ${lang} code…`} />
      </div>
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: T.textDim }}>{code.split('\n').length} lines</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCode('')} className="btn btn-ghost btn-sm">Clear</button>
          <button onClick={() => { if (code.trim()) { onSend('```' + lang + '\n' + code + '\n```'); onClose() } }} className="btn btn-primary btn-sm" disabled={!code.trim()}>Send</button>
        </div>
      </div>
    </div>
  </div>
}

// ── SANDBOX PANEL (right-side split) ─────────────────────────────────────────
function SandboxPanel({ sandbox, onClose }) {
  const { name, sandboxDir, sandboxId, tree } = sandbox
  const [crumbs, setCrumbs] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(null)
  const idRef = useRef(sandboxId)
  const previewUrlRef = useRef(null) // FIX: KNOWN-04 — track ObjectURL for revocation

  useEffect(() => { idRef.current = sandboxId }, [sandboxId])
  useEffect(() => { setCrumbs([]); setPreview(null) }, [sandboxId])
  useEffect(() => () => { if (idRef.current) window.ftps?.cleanupSandbox(idRef.current) }, [])
  // FIX: KNOWN-04 — revoke ObjectURL on unmount
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  const cur = crumbs.reduce((n, s) => n?.children?.[s], { children: tree })
  const entries = Object.entries(cur?.children || tree || {})
  const extCol = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, zip: '#f97316', json: T.amber, sh: T.red, txt: T.textMid }

  const openFile = async (fname, node) => {
    setLoading(fname)
    const res = await window.ftps?.readSandboxFile(sandboxDir, node.relPath)
    setLoading(null); if (!res?.ok) return
    // FIX: KNOWN-04 — revoke previous ObjectURL before creating new one
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
    {/* Header */}
    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.accent, fontWeight: 700 }}>📦 SANDBOX</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={openOS} className="btn btn-ghost btn-xs" title="Open in Windows Explorer / File Manager (AV will scan)">🗂 Explorer</button>
          <button onClick={onClose} className="btn btn-ghost btn-xs">✕</button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Isolated OS temp · Auto-cleaned · Never executed</div>
    </div>

    {/* Breadcrumb */}
    <div style={{ padding: '4px 8px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, background: T.panel }}>
      <button onClick={() => { setCrumbs([]); setPreview(null) }} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 3px', borderRadius: 3 }}>root</button>
      {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <span style={{ color: T.muted, fontSize: 10 }}>›</span>
        <button onClick={() => { setCrumbs(crumbs.slice(0, i + 1)); setPreview(null) }} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 3px', borderRadius: 3 }}>{s}</button>
      </span>)}
    </div>

    {/* File tree */}
    <div style={{ flex: preview ? '0 0 50%' : '1', overflowY: 'auto', padding: 4, borderBottom: preview ? `1px solid ${T.border}` : 'none' }}>
      {crumbs.length > 0 && <div className="sb-row" onClick={() => { setCrumbs(c => c.slice(0, -1)); setPreview(null) }} style={{ color: T.textDim, fontSize: 11 }}>↩ ..</div>}
      {entries.map(([fname, node]) => {
        const ext = fname.split('.').pop().toLowerCase(), col = extCol[ext] || T.textDim, isDir = node.type === 'dir', isLoading = loading === fname
        return <div key={fname} className="sb-row" onClick={() => isDir ? setCrumbs([...crumbs, fname]) : openFile(fname, node)}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{isDir ? '📂' : IS_ARCH.test(fname) ? '📦' : '📄'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: isDir ? T.amber : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</div>
            {node.size && <div style={{ fontSize: 9, color: T.muted }}>{fmtSz(node.size)}</div>}
          </div>
          {isLoading && <div className="spin" style={{ width: 11, height: 11, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', flexShrink: 0 }} />}
          {!isDir && !isLoading && <button onClick={e => { e.stopPropagation(); saveFile(fname, node) }} className="btn btn-green btn-xs" style={{ flexShrink: 0 }}>⬇</button>}
          {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>}
        </div>
      })}
      {!entries.length && <div style={{ textAlign: 'center', padding: 20, color: T.textDim, fontSize: 11 }}>Empty folder</div>}
    </div>

    {/* Preview */}
    {preview && <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <div style={{ padding: '5px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: T.surface }}>
        <span style={{ fontSize: 10, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</span>
        <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 11, flexShrink: 0 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {preview.type === 'pdf' && <iframe src={preview.url} style={{ width: '100%', height: '100%', border: 'none' }} title={preview.name} />}
        {preview.type === 'text' && <pre style={{ padding: 12, fontFamily: 'monospace', fontSize: 11, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{preview.content}</pre>}
        {preview.type === 'img' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}><img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: 4 }} /></div>}
        {preview.type === 'bin' && <div style={{ padding: 24, textAlign: 'center', color: T.textDim, fontSize: 12 }}><div style={{ fontSize: 28, marginBottom: 8 }}>📄</div><div>{fmtSz(preview.size)}</div><div style={{ marginTop: 4, fontSize: 11 }}>Binary — save to open</div></div>}
      </div>
    </div>}

    {/* AV tip */}
    <div style={{ padding: '7px 10px', borderTop: `1px solid ${T.border}`, background: T.panel, flexShrink: 0, fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
      🛡 <strong style={{ color: T.textDim }}>Isolated location:</strong> Files extracted to a temporary folder isolated from your system. Nothing auto-runs. Click "Explorer" to open — your AV scans on access.
    </div>
  </div>
}

// ── ZIP / RAR VIEWER (browse archive contents without extracting) ─────────────
function ZipViewer({ msg, onClose, onOSSandbox }) {
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
  const b64Ref = useRef(null) // cache base64 for re-use

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
      if (!msg.blob) { setError('File not in memory — save first then re-open'); setLoading(false); return }
      const b64 = await getB64()
      const result = await window.ftps?.listArchive(fname, b64, pw || null)
      if (result?.passwordProtected || result?.wrongPassword) {
        setNeedsPassword(true)
        if (pw) setPwError('Wrong password — try again')
        setLoading(false)
        setPwLoading(false)
        return
      }
      if (result?.error) {
        const hint = (result.error.includes('7-Zip') || result.error.includes('Unsupported') || result.error.includes('no longer supported'))
          ? '\n\n💡 Only ZIP and TAR archives are supported in P2N v4.' : ''
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
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 16 }}>{isUnsupportedArch ? '🗃' : '📦'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>Archive viewer — read-only · nothing extracted to disk</div>
        </div>
        <button onClick={() => onOSSandbox?.(msg)} className="btn btn-amber btn-sm" title="Open in OS isolated sandbox (Windows/Linux)">🛡 Sandbox</button>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      {/* Password prompt */}
      {needsPassword && <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🔐</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Password Required</div>
            <div style={{ fontSize: 11, color: T.textDim }}>This archive is encrypted. Enter the password to browse its contents.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setPwError('') }}
              onKeyDown={e => e.key === 'Enter' && submitPassword()}
              placeholder="Archive password…" className="inp" autoFocus style={{ marginBottom: pwError ? 4 : 0 }} />
            {pwError && <div style={{ fontSize: 11, color: T.red, marginTop: 3 }}>{pwError}</div>}
          </div>
          <button onClick={submitPassword} disabled={pwLoading} className="btn btn-primary" style={{ flexShrink: 0 }}>
            {pwLoading ? '⟳' : '🔓 Unlock'}
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.textDim }}>💡 Requires 7-Zip installed for encrypted RAR/7z. ZIP password is native.</div>
      </div>}
      {/* Breadcrumb (hide while locked) */}
      {!needsPassword && <div style={{ padding: '4px 10px', background: T.panel, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={() => { setCrumbs([]); setPreview(null) }} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>📦 root</button>
        {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <span style={{ color: T.muted, fontSize: 10 }}>›</span>
          <button onClick={() => { setCrumbs(crumbs.slice(0, i + 1)); setPreview(null) }} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>{s}</button>
        </span>)}
      </div>}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* File tree */}
        <div style={{ width: preview ? '38%' : '100%', overflowY: 'auto', borderRight: preview ? `1px solid ${T.border}` : 'none', transition: 'width .15s' }}>
          {loading && !needsPassword && <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontSize: 12 }}>
            <div className="spin" style={{ width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', margin: '0 auto 10px' }} />Reading archive…
          </div>}
          {error && <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 12, color: T.red, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{error}</div>
          </div>}
          {!loading && !error && !needsPassword && <>
            {crumbs.length > 0 && <div className="sb-row" onClick={() => { setCrumbs(c => c.slice(0, -1)); setPreview(null) }} style={{ color: T.textDim, fontSize: 11 }}>↩ ..</div>}
            {entries.map(([name, node]) => {
              const ext = name.split('.').pop().toLowerCase(), col = extCol[ext] || T.textDim
              const isDir = node.type === 'dir'
              const fullPath = [...crumbs, name].join('/')
              const canPreview = !isDir && IS_VIEWABLE.test(name)
              return <div key={name} className="sb-row" style={{ cursor: 'pointer' }} onClick={() => isDir ? (setCrumbs([...crumbs, name]), setPreview(null)) : (canPreview && openEntry(fullPath, name))}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{isDir ? '📂' : (IS_ARCH.test(name) ? '📦' : '📄')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: isDir ? T.amber : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  {node.size > 0 && <div style={{ fontSize: 9, color: T.muted }}>{fmtSz(node.size)}</div>}
                </div>
                {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>}
                {!isDir && canPreview && msg.blob && <button onClick={e => { e.stopPropagation(); openEntry(fullPath, name) }} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '1px 4px' }}>👁</button>}
                {!isDir && msg.blob && <button onClick={e => { e.stopPropagation(); saveEntry(fullPath, name) }} className="btn btn-green btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '1px 5px' }}>⬇</button>}
                {isDir && <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>▸</span>}
              </div>
            })}
            {!entries.length && !loading && <div style={{ textAlign: 'center', padding: 24, color: T.textDim, fontSize: 11 }}>Empty folder</div>}
          </>}
        </div>
        {/* Preview pane */}
        {preview && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.panel, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</span>
            <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>✕</button>
          </div>
          {previewLoading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: T.textDim }}>
            <div className="spin" style={{ width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />Loading…
          </div>}
          {!previewLoading && <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
            {preview.type === 'img' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 5 }} /></div>}
            {preview.type === 'pdf' && <iframe src={preview.url} style={{ width: '100%', height: '100%', border: 'none' }} title={preview.name} />}
            {preview.type === 'text' && <pre style={{ padding: 14, fontFamily: 'monospace', fontSize: 11, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{preview.text}</pre>}
            {preview.type === 'bin' && <div style={{ padding: 32, textAlign: 'center', color: T.textDim, fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>📄</div><div>Binary file · {fmtSz(preview.size)}</div><div style={{ marginTop: 6, fontSize: 11, color: T.muted }}>Save to disk to open in another app</div></div>}
            {preview.type === 'err' && <div style={{ padding: 32, textAlign: 'center', color: T.red, fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div><div>{preview.msg}</div></div>}
          </div>}
        </div>}
      </div>
    </div>
  </div>
}

// ── OS SANDBOX (Windows Sandbox / Linux firejail — real isolated VM/namespace) ─
function OSSandbox({ file, onClose }) {
  const [status, setStatus] = useState('idle') // idle|launching|running|error|unsupported
  const [log, setLog] = useState([]), [platform, setPlatform] = useState(null)
  const fname = file?.meta?.name || file?.name || 'file'

  useEffect(() => { window.ftps?.getPlatform?.().then(p => setPlatform(p)) }, [])

  const addLog = msg => setLog(l => [...l, { t: new Date().toLocaleTimeString(), msg }])

  const launch = async () => {
    if (!file?.blob && !file?.tmpPath) { addLog('No file data in memory — save to disk first'); return }
    setStatus('launching'); addLog('Preparing isolated environment…')
    try {
      let dataB64 = null
      if (file.blob) { const r = new FileReader(); dataB64 = await new Promise((res, rej) => { r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file.blob) }) }
      addLog(`Staging file: ${fname}`)
      const r = await window.ftps?.launchOSSandbox({ name: fname, dataB64, tmpPath: file.tmpPath || null })
      if (r?.ok) { setStatus('running'); addLog(r.message || 'Sandbox launched'); addLog('⚠ Do NOT trust files inside — do NOT save back to your system') }
      else if (r?.unsupported) { setStatus('unsupported'); addLog(r.message || 'OS sandbox not available on this system') }
      else { setStatus('error'); addLog(r?.error || 'Launch failed') }
    } catch (e) { setStatus('error'); addLog(e.message || 'Launch failed') }
  }

  const statusColor = { idle: T.textDim, launching: T.amber, running: T.green, error: T.red, unsupported: T.amber }[status]
  const statusIcon = { idle: '○', launching: '⟳', running: '●', error: '✗', unsupported: '⚠' }[status]

  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(560px,96vw)', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🛡</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>OS Isolated Sandbox</div>
          <div style={{ fontSize: 10, color: T.textDim }}>Real OS-level isolation — file cannot affect your actual system</div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>{fmtSz(file?.meta?.size || file?.size || 0)}</div>
        </div>
        <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{statusIcon} {status.toUpperCase()}</span>
      </div>
      {/* Platform-specific info */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.textDim, lineHeight: 1.7 }}>
        {platform === 'win32' && <><div style={{ color: T.blue, fontWeight: 600, marginBottom: 4 }}>🪟 Windows Sandbox (Hyper-V VM)</div>
          <div>Creates a full Hyper-V virtual machine. Completely isolated from your real system. Everything inside is deleted when it closes.</div>
          <div style={{ marginTop: 4, color: T.amber }}>Requires: Windows 10/11 Pro/Enterprise · virtualization enabled in BIOS</div></>}
        {platform === 'linux' && <><div style={{ color: T.orange, fontWeight: 600, marginBottom: 4 }}>🐧 Linux Sandbox (firejail / bubblewrap)</div>
          <div>Runs file in a restricted Linux namespace — isolated filesystem, network, and process tree. Cannot read home directory or affect system files.</div>
          <div style={{ marginTop: 4, color: T.amber }}>Requires: firejail or bubblewrap installed (sudo apt install firejail)</div></>}
        {platform === 'darwin' && <><div style={{ color: T.textMid, fontWeight: 600, marginBottom: 4 }}>🍎 macOS</div>
          <div style={{ color: T.amber }}>macOS sandbox not yet implemented. Use the archive viewer to inspect contents safely without extraction.</div></>}
        {!platform && <div style={{ color: T.textDim }}>Detecting platform…</div>}
      </div>
      {/* Security tools */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, color: T.accent, letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>SECURITY TOOLS INSIDE SANDBOX</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {[
            { icon: '🔍', name: 'View file contents', desc: 'Read-only inspection' },
            { icon: '🦠', name: 'ClamAV scan', desc: 'Open-source AV (if installed)' },
            { icon: '📊', name: 'strings analysis', desc: 'Extract readable text strings' },
            { icon: '🔬', name: 'file type check', desc: 'Verify actual magic-byte type' },
            { icon: '🌐', name: 'Network isolated', desc: 'No internet access from sandbox' },
            { icon: '💾', name: 'Temp filesystem', desc: 'Cannot write to real disk' },
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
        {status === 'unsupported' && <div style={{ flex: 2, fontSize: 11, color: T.amber, display: 'flex', alignItems: 'center', padding: '0 8px' }}>⚠ Not available on this system</div>}
        {status !== 'unsupported' && <button onClick={launch} className="btn btn-amber" style={{ flex: 2 }} disabled={status === 'launching' || status === 'running'}>
          {status === 'idle' ? '🚀 Launch Sandbox' : status === 'launching' ? '⟳ Launching…' : '✓ Running — close the sandbox window when done'}
        </button>}
      </div>
      <div style={{ padding: '4px 16px 10px', fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
        ⚠ Never enter passwords, banking details, or sensitive info inside the sandbox environment.
      </div>
    </div>
  </div>
}

// ── FILE MSG ──────────────────────────────────────────────────────────────────
function FileMsg({ msg, onExtract, onPreview, onRevoke, onZipView, onOSSandbox, warnArch }) {
  // Revoked state — shows instead of normal file card
  if (msg.type === 'revoked') return <div style={{ padding: '8px 11px', background: T.red + '06', border: `1px solid ${T.red}18`, borderRadius: 8, maxWidth: '68%', opacity: .75 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 15 }}>🚫</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>File Access Revoked</div>
        <div style={{ fontSize: 11, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.meta?.name || 'File'}</div>
      </div>
      <span style={{ fontSize: 9, color: T.muted }}>{msg.revokedAt || msg.time}</span>
    </div>
  </div>

  const isMe = msg.from === 'me', pct = msg.pct ?? 1, done = msg.type === 'file_done' || (msg.type === 'file_out' && pct >= 1)
  const isSending = msg.type === 'file_out' && pct < 1
  const statusTxt = isSending ? `${Math.round(pct * 100)}%` : msg.type === 'file_out' ? 'Sent' : msg.type === 'file_done' ? 'Received' : msg.type === 'file_in' ? `${Math.round(pct * 100)}%` : '…'
  const statusCol = done ? T.green : T.amber
  const fname = msg.meta?.name || ''
  const isArch = IS_ARCH.test(fname), isZipRar = IS_ARCH_VIEWABLE.test(fname), isDanger = IS_DANGEROUS.test(fname), isUnsupported = IS_UNSUPPORTED_ARCH.test(fname)
  const canView = !!(msg.blob) && !isArch && IS_VIEWABLE.test(fname)
  const save = async () => {
    if (msg.tmpPath && window.ftps) { await window.ftps.saveFileFromTemp(msg.tmpPath, msg.meta?.name || 'file'); return }
    if (!msg.blob) return
    if (window.ftps) { const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(msg.meta?.name || 'file', r.result.split(',')[1]); r.readAsDataURL(msg.blob) }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(msg.blob); a.download = msg.meta.name; document.body.appendChild(a); a.click(); document.body.removeChild(a) }
  }
  return <div style={{ padding: '9px 11px', background: isMe ? T.blue + '0b' : T.surface, border: `1px solid ${isMe ? T.blue + '26' : T.border}`, borderRadius: 8, maxWidth: '68%' }}>
    {msg.threats?.length > 0 && <div style={{ padding: '4px 8px', background: T.red + '12', border: `1px solid ${T.red}30`, borderRadius: 5, marginBottom: 6, fontSize: 10, color: T.red }}>
      ⚠ Security threats: {msg.threats.join(' · ')}
    </div>}
    {isDanger && <div style={{ padding: '4px 8px', background: T.amber + '10', border: `1px solid ${T.amber}28`, borderRadius: 5, marginBottom: 6, fontSize: 10, color: T.amber }}>⚠ Executable file — treat with caution</div>}
    {isUnsupported && <div style={{ padding: '4px 8px', background: T.red + '10', border: `1px solid ${T.red}28`, borderRadius: 5, marginBottom: 6, fontSize: 10, color: T.red }}>⚠ .{fname.split('.').pop()} is not supported — only ZIP and TAR archives can be browsed</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: done ? 7 : 5 }}>
      <span style={{ fontSize: 17 }}>{isArch ? '📦' : '📄'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.meta?.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{fmtSz(msg.meta?.size || 0)}</div>
      </div>
      <span className="stag" style={{ color: statusCol, background: statusCol + '12', border: `1px solid ${statusCol}28` }}>{statusTxt}</span>
    </div>
    {!done && <>
      <div className="prog" style={{ marginBottom: 3 }}><div className="prog-fill" style={{ width: `${pct * 100}%` }} /></div>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
        <span>{fmtSz(Math.round((msg.meta?.size || 0) * pct))} / {fmtSz(msg.meta?.size || 0)}</span>
        <span>{Math.round(pct * 100)}%</span>
      </div>
      {msg.calcSpeed > 0 && <div style={{ fontSize: 10, color: T.textDim, display: 'flex', justifyContent: 'space-between', marginTop: -3, marginBottom: 5 }}>
        <span>{isMe ? '↑' : '↓'} {fmtSz(msg.calcSpeed)}/s</span>
        <span>{msg.calcEta > 0 ? `~${fmtTime(msg.calcEta)} remaining` : ''}</span>
      </div>}
    </>}
    {/* CHANGE 3: Cancel button during active send */}
    {isMe && !done && msg.pct !== undefined && msg.pct < 1 && (
      <button onClick={() => onRevoke?.(msg)} className="btn btn-danger btn-xs" style={{ marginTop: 5, width: '100%' }}>
        ✕ Cancel Send
      </button>
    )}
    {msg.type === 'file_done' && (msg.blob || msg.tmpPath) && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      <button onClick={save} className="btn btn-green btn-xs" style={{ flex: 1 }}>⬇ Save</button>
      {/* Issue 7/12: Browse works for both in-memory (blob) and large (tmpPath) archives */}
      {isZipRar && msg.blob && <button onClick={() => onZipView?.(msg)} className="btn btn-blue btn-xs" style={{ flex: 1 }}>📂 Browse</button>}
      {isZipRar && !msg.blob && msg.tmpPath && <button onClick={async () => {
        // Large archive: load via IPC for listing without base64 overhead
        notify('Reading archive…', 'info')
        const result = await window.ftps?.extractArchiveFromPath(fname, msg.tmpPath)
        if (result?.ok) {
          // Create a synthetic blob-like msg with tree for ZipViewer (just tree, no full blob)
          onZipView?.({ ...msg, archivePath: msg.tmpPath, archiveTree: result.tree })
          notify('', 'ok')
        } else notify('Cannot browse large archive: ' + (result?.error || ''), 'err')
      }} className="btn btn-blue btn-xs" style={{ flex: 1 }}>📂 Browse</button>}
      {(isArch || isDanger) && <button onClick={() => onOSSandbox?.(msg)} className="btn btn-amber btn-xs" style={{ flex: 1 }}>🛡 Sandbox</button>}
      {!isArch && !isDanger && canView && <button onClick={() => onPreview?.(msg)} className="btn btn-blue btn-xs" style={{ flex: 1 }}>👁 View</button>}
      {msg.blob && !isArch && (IS_IMG.test(fname) || IS_PDF.test(fname)) && (
        <button onClick={async () => {
          try {
            const stripped = await stripMetadata(msg.blob, fname)
            const r = new FileReader(); r.onload = async () => await window.ftps?.saveFile(fname, r.result.split(',')[1]); r.readAsDataURL(stripped)
            notify('Metadata stripped — choose save location', 'ok')
          } catch (e) { notify('Strip failed: ' + e.message, 'err') }
        }} className="btn btn-purple btn-xs" style={{ flex: 1 }} title="Remove EXIF/XMP/metadata then save">🧹 Strip Meta</button>
      )}
    </div>}
    {/* CHANGE 3: Revoke Access button only after done */}
    {isMe && done && (
      <button onClick={() => onRevoke?.(msg)} className="btn btn-ghost btn-xs" style={{ marginTop: 5, width: '100%', color: T.red, fontSize: 10, border: `1px solid ${T.red}20` }}>🚫 Revoke Access</button>
    )}
    <div style={{ fontSize: 10, color: T.muted, marginTop: 5, textAlign: 'right' }}>{msg.time}</div>
  </div>
}

// ── FOLDER MSG (legacy single-shot share) ────────────────────────────────────
function FolderMsg({ msg, onOpen, onRevoke }) {
  const e = Object.keys(msg.folder?.children || {})
  return <div onClick={onOpen} style={{ padding: '9px 11px', background: T.amber + '0b', border: `1px solid ${T.amber}28`, borderRadius: 8, maxWidth: '68%', cursor: 'pointer', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.amber + '15'} onMouseLeave={e => e.currentTarget.style.background = T.amber + '0b'}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
      <span style={{ fontSize: 18 }}>📂</span>
      <div><div style={{ fontSize: 11, color: T.amber, fontWeight: 700 }}>Shared Folder</div><div style={{ fontSize: 12, color: T.text }}>{msg.folder?.name}</div></div>
    </div>
    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 3 }}>{e.length} item{e.length !== 1 ? 's' : ''}{e.length ? ': ' + e.slice(0, 3).join(', ') + (e.length > 3 ? '…' : '') : ''}</div>
    {msg.from === 'me' && <button onClick={ev => { ev.stopPropagation(); onRevoke?.(msg.id) }} className="btn btn-ghost btn-xs" style={{ color: T.amber, marginBottom: 3 }}>Revoke</button>}
    <div style={{ fontSize: 10, color: T.muted, textAlign: 'right' }}>{msg.time}</div>
  </div>
}

// ── FOLDER OFFER MSG (sender side — offered/sending/done + revoke) ─────────
function FolderOfferMsg({ msg, onRevoke }) {
  const statusMap = { offered: { c: T.blue, t: '📤 Offered' }, sending: { c: T.amber, t: '⟳ Sending…' }, done: { c: T.green, t: '✓ Sent' } }
  const s = statusMap[msg.status || 'offered'] || statusMap.offered
  return <div style={{ padding: '9px 11px', background: T.blue + '0b', border: `1px solid ${T.blue}26`, borderRadius: 8, maxWidth: '68%', minWidth: 210 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>📂</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{msg.totalFiles} files · {fmtSz(msg.totalBytes)}</div>
      </div>
      <span className="stag" style={{ color: s.c, background: s.c + '12', border: `1px solid ${s.c}28`, flexShrink: 0 }}>{s.t}</span>
    </div>
    {msg.status === 'sending' && <div className="prog" style={{ marginTop: 6 }}><div className="prog-fill" style={{ width: '100%', background: T.amber, animation: 'pulse 1s infinite' }} /></div>}
    {msg.status === 'sending' && msg.calcSpeed > 0 && <div style={{ fontSize: 10, color: T.textDim, display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
      <span>↑ {fmtSz(msg.calcSpeed)}/s</span>
      <span>{msg.calcEta > 0 ? `~${fmtTime(msg.calcEta)} remaining` : ''}</span>
    </div>}
    {/* Revoke: available while offered or sending */}
    {msg.status !== 'done' && <button onClick={ev => { ev.stopPropagation(); onRevoke?.(msg.fid) }} className="btn btn-ghost btn-xs" style={{ color: T.red, border: `1px solid ${T.red}20`, marginTop: 6, width: '100%' }}>🚫 Revoke Offer</button>}
    <div style={{ fontSize: 10, color: T.muted, marginTop: 6, textAlign: 'right' }}>{msg.time}</div>
  </div>
}

// ── FOLDER BROWSE MSG (receiver side — browse structure, pull to download) ─────
function FolderBrowseMsg({ msg, peerId, onPull, notify }) {
  const [expanded, setExpanded] = useState(false)
  const [crumbs, setCrumbs] = useState([])
  const [previewEntry, setPreviewEntry] = useState(null)
  const [loadingEntry, setLoadingEntry] = useState(null)
  const status = msg.status || 'available'

  // Build tree from flat file list, stripping the top-level folder name prefix
  const buildTree = (files, rootName) => {
    const root = {}
    files?.forEach(f => {
      let rp = f.relPath || f.name
      // Strip the root folder name prefix (e.g. "MyFolder/sub/file.txt" → "sub/file.txt")
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
    available: { c: T.green, t: '📬 Available' },
    pulling: { c: T.amber, t: '⟳ Receiving…' },
    done: { c: T.green, t: '✓ Received' }
  }
  const s = statusMap[status] || statusMap.available

  const pullAll = () => onPull?.(peerId, msg.fid, null, { name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes }, false)
  const pullAsZip = () => onPull?.(peerId, msg.fid, null, { name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes }, true)
  const pullFile = idx => onPull?.(peerId, msg.fid, idx, { name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes }, false)

  const extCol = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, json: T.amber, sh: T.red, rs: T.orange, go: T.green }

  // Preview a file entry from the archive via IPC (reads single file from sender's folder offer)
  const previewFile = async (node, name) => {
    if (!IS_VIEWABLE.test(name)) return
    setLoadingEntry(name)
    try {
      // Use the blob if we already received this file
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

  return <div style={{ background: T.green + '07', border: `1px solid ${T.green}20`, borderRadius: 8, maxWidth: '90%', minWidth: 240, overflow: 'hidden' }}>
    {/* Header */}
    <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>📂</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{msg.totalFiles} files · {fmtSz(msg.totalBytes)}</div>
      </div>
      <span className="stag" style={{ color: s.c, background: s.c + '12', border: `1px solid ${s.c}28`, flexShrink: 0 }}>{s.t}</span>
      <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
    </div>

    {/* Receive progress bar (only when actually receiving, not just browsing) */}
    {status === 'pulling' && <div style={{ padding: '0 11px 9px' }}>
      <div className="prog"><div className="prog-fill" style={{ width: '100%', background: T.amber, animation: 'pulse 1s infinite' }} /></div>
      <div style={{ fontSize: 10, color: T.textDim, marginTop: 3 }}>⟳ Receiving files…</div>
    </div>}

    {/* Received single files (single-file pulls) */}
    {(msg.receivedFiles || []).length > 0 && status !== 'done' && (
      <div style={{ padding: '4px 8px 6px', borderTop: `1px solid ${T.green}18`, background: T.green + '05' }}>
        <div style={{ fontSize: 10, color: T.green, fontWeight: 600, marginBottom: 3 }}>✓ Pulled files:</div>
        {(msg.receivedFiles || []).map((f, i) => {
          const canView = IS_VIEWABLE.test(f.name || '') && !!f.blob
          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
            <span style={{ fontSize: 10 }}>📄</span>
            <span style={{ fontSize: 10, flex: 1, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.relPath || f.name}</span>
            <span style={{ fontSize: 9, color: T.muted }}>{fmtSz(f.size || 0)}</span>
            {canView && <button onClick={async () => {
              const text = await f.blob.text()
              setPreviewEntry({ name: f.name, type: IS_IMG.test(f.name) ? 'img' : 'text', content: text, blob: f.blob })
            }} className="btn btn-ghost btn-xs" style={{ fontSize: 8, padding: '1px 4px' }}>👁</button>}
            <button onClick={async () => {
              if (f.tmpPath) { await window.ftps?.saveFileFromTemp(f.tmpPath, f.name); return }
              if (f.blob && window.ftps) { const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(f.name, r.result.split(',')[1]); r.readAsDataURL(f.blob) }
              else if (f.blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; a.click() }
            }} className="btn btn-green btn-xs" style={{ fontSize: 8, padding: '1px 4px' }}>⬇</button>
          </div>
        })}
      </div>
    )}

    {/* File preview overlay */}
    {previewEntry && <div style={{ position: 'relative', borderTop: `1px solid ${T.border}` }}>
      <div style={{ padding: '6px 8px', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{previewEntry.name}</span>
        <button onClick={() => setPreviewEntry(null)} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ maxHeight: 200, overflow: 'auto', padding: 8 }}>
        {previewEntry.type === 'loading' && <div style={{ color: T.textDim, fontSize: 11 }}>Loading…</div>}
        {previewEntry.type === 'text' && <pre style={{ fontSize: 11, color: T.text, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>{previewEntry.content?.slice(0, 50000)}</pre>}
        {previewEntry.type === 'img' && previewEntry.blob && <img src={URL.createObjectURL(previewEntry.blob)} style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }} alt={previewEntry.name} />}
      </div>
    </div>}

    {/* Expanded tree browser + pull actions */}
    {expanded && <div style={{ borderTop: `1px solid ${T.green}18` }}>
      {/* Toolbar */}
      <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5, background: T.surface, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: T.textDim, flex: 1 }}>
          {status === 'done' ? '✓ All files received' : `${msg.totalFiles} files — browse & pull`}
        </span>
        {status === 'available' && <>
          <button onClick={pullAll} className="btn btn-green btn-xs" title="Download all files preserving folder structure">📥 Pull All</button>
          <button onClick={pullAsZip} className="btn btn-blue btn-xs" title="Download all files as a single ZIP">📦 Pull as ZIP</button>
        </>}
        {status === 'pulling' && <span style={{ fontSize: 10, color: T.amber }}>⟳ Receiving…</span>}
        {status === 'done' && <span style={{ fontSize: 10, color: T.green }}>✓ Received</span>}
      </div>
      {/* Breadcrumb */}
      {crumbs.length > 0 && <div style={{ padding: '3px 8px', display: 'flex', gap: 3, alignItems: 'center', background: T.panel, borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
        <button onClick={() => setCrumbs([])} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>{msg.name}</button>
        {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <span style={{ color: T.muted, fontSize: 10 }}>›</span>
          <button onClick={() => setCrumbs(crumbs.slice(0, i + 1))} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer', padding: '1px 4px' }}>{s}</button>
        </span>)}
      </div>}
      {/* File/folder tree */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 6px' }}>
        {crumbs.length > 0 && <div className="sb-row" onClick={() => setCrumbs(c => c.slice(0, -1))} style={{ color: T.textDim, fontSize: 11, cursor: 'pointer' }}>↩ ..</div>}
        {entries.map(([name, node]) => {
          const isDir = node.type === 'dir'
          const ext = (name.split('.').pop() || '').toLowerCase()
          const col = extCol[ext] || T.textDim
          const isDang = IS_DANGEROUS.test(name)
          const canPreview = !isDir && IS_VIEWABLE.test(name)
          const pulledFile = !isDir ? (msg.receivedFiles || []).find(f => f.name === name || (f.relPath || '').endsWith('/' + name)) : null
          const alreadyPulled = !!pulledFile
          return <div key={name} className="sb-row" style={{ cursor: isDir ? 'pointer' : 'default' }} onClick={() => isDir && setCrumbs([...crumbs, name])}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{isDir ? '📂' : (isDang ? '⚠️' : alreadyPulled ? '✅' : '📄')}</span>
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDir ? T.amber : (alreadyPulled ? T.green : T.text) }}>{name}</span>
            {!isDir && <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>{fmtSz(node.size || 0)}</span>}
            {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>}
            {/* View: if already pulled show preview; if not pulled+viewable show pull-then-view */}
            {canPreview && alreadyPulled && pulledFile.blob && <button onClick={e => {
              e.stopPropagation()
              pulledFile.blob.text().then(text => setPreviewEntry({ name, type: IS_IMG.test(name) ? 'img' : 'text', content: text, blob: pulledFile.blob }))
            }} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '2px 5px', color: T.accent }} title="Preview file">👁</button>}
            {canPreview && !alreadyPulled && status === 'available' && <button onClick={e => {
              e.stopPropagation()
              // Pull this file then auto-preview once received
              pullFile(node.index)
              // Set a pending preview flag — will trigger once file arrives in receivedFiles
              setPreviewEntry({ name, type: 'loading', content: 'Pulling file…' })
            }} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '2px 5px', color: T.textDim }} title="Pull and preview">👁</button>}
            {!isDir && status === 'available' && !alreadyPulled && <button onClick={e => { e.stopPropagation(); pullFile(node.index) }} className="btn btn-blue btn-xs" style={{ flexShrink: 0, fontSize: 9, padding: '2px 5px' }} title="Download this file">📥</button>}
            {isDir && <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>▸</span>}
          </div>
        })}
        {!entries.length && <div style={{ textAlign: 'center', padding: 20, color: T.textDim, fontSize: 11 }}>Empty folder</div>}
      </div>
    </div>}
    <div style={{ padding: '0 11px 7px', fontSize: 10, color: T.muted, textAlign: 'right' }}>{msg.time}</div>
  </div>
}

// ── FOLDER RECV MSG (receiver side — shows received folder progress + save) ───
function FolderRecvMsg({ msg, folderDataRef, notify }) {
  const done = msg.complete
  const [expanded, setExpanded] = useState(false)
  const [autoZipping, setAutoZipping] = useState(false)

  // NOTE: folderDataRef is a ref — we read it lazily inside effects/handlers
  // NOT at render time, because the ref updates without causing re-renders.
  const getFiles = () => (folderDataRef?.current?.[msg.folderFid]?.files || []).filter(Boolean)

  // For the expanded file list we need to trigger a re-render when files arrive.
  // We use receivedCount from msg (which IS state-driven) as the trigger.
  const files = getFiles()

  // Pull-as-ZIP: trigger after all files received
  useEffect(() => {
    if (!done || !msg.pullAsZip || autoZipping) return
    // Read ref at effect-run-time (after state update settles)
    const freshFiles = getFiles()
    if (freshFiles.length === 0) return
    setAutoZipping(true)
    ;(async () => {
      try {
        notify('📦 Creating ZIP…', 'info')
        const zipFiles = freshFiles.map(f => ({ name: f.relPath || f.name, blob: f.blob || null }))
        const zipBlob = await createZipBlob(zipFiles)
        if (window.ftps) {
          const r = new FileReader()
          r.onload = async () => await window.ftps.saveFile(msg.name + '.zip', r.result.split(',')[1])
          r.readAsDataURL(zipBlob)
        } else {
          const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob); a.download = msg.name + '.zip'; a.click()
        }
        notify('📦 ZIP ready — choose save location', 'ok')
      } catch (e) {
        notify('ZIP failed: ' + e.message, 'err')
      } finally {
        setAutoZipping(false)
      }
    })()
  }, [done, msg.pullAsZip]) // intentionally omit autoZipping/files to avoid stale deps

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

  return <div style={{ background: T.green + '08', border: `1px solid ${T.green}22`, borderRadius: 8, maxWidth: '85%', minWidth: 220, overflow: 'hidden' }}>
    <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8, cursor: done ? 'pointer' : 'default' }} onClick={() => done && setExpanded(e => !e)}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>📂</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.name}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{msg.totalFiles} files · {fmtSz(msg.totalBytes || 0)}</div>
      </div>
      <span className="stag" style={{ color: done ? T.green : T.amber, background: (done ? T.green : T.amber) + '12', border: `1px solid ${(done ? T.green : T.amber)}28`, flexShrink: 0 }}>
        {autoZipping ? '📦 Zipping…' : done ? (msg.pullAsZip ? '📦 Saving ZIP…' : '✓ Received') : `${msg.receivedCount || 0}/${msg.totalFiles}`}
      </span>
      {done && !autoZipping && <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>}
    </div>
    {!done && <div style={{ padding: '0 11px 9px' }}>
      <div className="prog" style={{ marginBottom: 3 }}><div className="prog-fill" style={{ width: `${msg.totalFiles > 0 ? Math.round((msg.receivedCount || 0) / msg.totalFiles * 100) : 0}%`, background: T.green, transition: 'width .3s' }} /></div>
      <div style={{ fontSize: 11, color: T.textDim, marginTop: 1, display: 'flex', justifyContent: 'space-between' }}>
        <span>↓ {msg.receivedCount || 0} of {msg.totalFiles} files</span>
        <span>{msg.totalFiles > 0 ? Math.round((msg.receivedCount || 0) / msg.totalFiles * 100) : 0}%</span>
      </div>
      {/* Speed computation */}
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
        return <div style={{ fontSize: 10, color: T.textDim, display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span>↓ {fmtSz(speed)}/s</span>
          <span>{eta > 0 ? `~${fmtTime(eta)} remaining` : ''}</span>
        </div>
      })()}
      {/* Stall Detection */}
      {(() => {
        if (!msg.lastGotT) return null
        const stallMs = Date.now() - msg.lastGotT
        if (stallMs > 120000) return <div style={{ fontSize: 10, color: T.red, marginTop: 5 }}>❌ Transfer stalled — sender may have disconnected</div>
        if (stallMs > 30000) return <div style={{ fontSize: 10, color: T.amber, marginTop: 5 }}>⚠ Waiting… ({Math.floor(stallMs / 1000)}s) — large files may take longer</div>
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
            notify('Creating ZIP…', 'info')
            const zipFiles = freshFiles.map(f => ({ name: f.relPath || f.name, blob: f.blob || null }))
            const zipBlob = await createZipBlob(zipFiles)
            if (window.ftps) {
              const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(msg.name + '.zip', r.result.split(',')[1]); r.readAsDataURL(zipBlob)
            } else {
              const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob); a.download = msg.name + '.zip'; a.click()
            }
            notify('ZIP ready — choose save location', 'ok')
          } catch (e) { notify('ZIP failed: ' + e.message, 'err') }
        }} className="btn btn-blue btn-xs">📦 Save as ZIP</button>
        <button onClick={saveAll} className="btn btn-green btn-xs">⬇ Save All</button>
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 6px' }}>
        {files.map((f, i) => {
          const ext = (f.name || '').split('.').pop().toLowerCase()
          const col = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple, json: T.amber }[ext] || T.textDim
          const canView = IS_VIEWABLE.test(f.name || '') && !!f.blob
          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 3px', borderBottom: `1px solid ${T.border}15` }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}>{IS_DANGEROUS.test(f.name || '') ? '⚠️' : '📄'}</span>
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>{f.relPath || f.name}</span>
            <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>{fmtSz(f.size || 0)}</span>
            <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col, flexShrink: 0 }}>{ext.toUpperCase()}</span>
            {canView && <FileInlineViewer file={f} />}
            <button onClick={() => saveOne(f)} className="btn btn-green btn-xs" style={{ flexShrink: 0, padding: '2px 5px', fontSize: 9 }}>⬇</button>
          </div>
        })}
      </div>
    </div>}
    <div style={{ padding: '0 11px 7px', fontSize: 10, color: T.muted, textAlign: 'right' }}>{msg.time}</div>
  </div>
}
function FileInlineViewer({ file }) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const urlRef = useRef(null)  // track ObjectURL for safe revoke
  const name = file.name || ''

  // Revoke ObjectURL only on unmount, not on every content change (prevents stale URL bug)
  useEffect(() => () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null } }, [])

  const doOpen = async () => {
    setOpen(true)
    // Reset content on every open so stale/revoked URLs don't show
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setContent(null)
    setLoading(true)
    try {
      // Handle tmpPath (large file on disk) via IPC
      if (!file.blob && file.tmpPath) {
        const r = await window.ftps?.readFileForPreview(file.tmpPath)
        if (!r?.ok) { setLoading(false); return }
        const buf = Uint8Array.from(atob(r.dataB64), c => c.charCodeAt(0))
        const blob = new Blob([buf], { type: file.type || 'application/octet-stream' })
        if (IS_IMG.test(name)) { const u = URL.createObjectURL(blob); urlRef.current = u; setContent({ type: 'img', url: u }) }
        else if (IS_TEXT.test(name)) { const tx = await blob.text(); setContent({ type: 'text', text: tx.slice(0, 80000) }) }
        else if (IS_PDF.test(name)) { const u = URL.createObjectURL(blob); urlRef.current = u; setContent({ type: 'pdf', url: u }) }
        else setContent({ type: 'bin' })
        setLoading(false)
        return
      }
      // Handle in-memory blob
      if (!file.blob) { setLoading(false); return }
      if (IS_IMG.test(name)) { const u = URL.createObjectURL(file.blob); urlRef.current = u; setContent({ type: 'img', url: u }) }
      else if (IS_TEXT.test(name)) { const tx = await file.blob.text(); setContent({ type: 'text', text: tx.slice(0, 80000) }) }
      else if (IS_PDF.test(name)) { const u = URL.createObjectURL(file.blob); urlRef.current = u; setContent({ type: 'pdf', url: u }) }
      else setContent({ type: 'bin' })
    } catch { setContent(null) }
    setLoading(false)
  }

  const doClose = () => {
    setOpen(false)
    // Revoke URL when closing (not when setting new content) to avoid stale-URL third-click bug
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setContent(null)
  }

  if (!open) return <button onClick={doOpen} className="btn btn-blue btn-xs" style={{ flexShrink: 0, padding: '2px 5px', fontSize: 9 }}>👁</button>
  return <div className="overlay" style={{ zIndex: 700 }} onClick={doClose}>
    <div className="card fadeup" style={{ width: 'min(700px,95vw)', height: 'min(75vh,600px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{name}</span>
        <button onClick={doClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
        {loading && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: T.textDim }}><div className="spin" style={{ width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />Loading…</div>}
        {!loading && content?.type === 'img' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><img src={content.url} alt={name} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 5 }} /></div>}
        {!loading && content?.type === 'text' && <pre style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content.text}</pre>}
        {!loading && content?.type === 'pdf' && <iframe src={content.url} style={{ width: '100%', height: '100%', border: 'none' }} title={name} />}
        {!loading && content?.type === 'bin' && <div style={{ padding: 36, textAlign: 'center', color: T.textDim, fontSize: 12 }}>Binary file — save to disk to open</div>}
        {!loading && !content && <div style={{ padding: 36, textAlign: 'center', color: T.textDim, fontSize: 12 }}>Preview not available — file may still be loading</div>}
      </div>
    </div>
  </div>
}

// ── FOLDER VIEWER ─────────────────────────────────────────────────────────────
function FolderViewer({ folder, onClose }) {
  const [crumbs, setCrumbs] = useState([])
  const cur = crumbs.reduce((n, s) => n?.children?.[s], folder)
  const entries = Object.entries(cur?.children ?? folder?.children ?? {})
  const extC = { pdf: '#ff6b6b', md: T.blue, py: T.amber, js: '#fbbf24', ts: '#4db8ff', jpg: T.purple, png: T.purple }
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(560px,95vw)', height: 'min(500px,90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 15px', borderBottom: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div><div style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>📂 {folder.name}</div><div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>Sandboxed · Read-only</div></div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      <div style={{ padding: '4px 8px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 4, alignItems: 'center', background: T.panel, flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => setCrumbs([])} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer' }}>{folder.name}</button>
        {crumbs.map((s, i) => <span key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}><span style={{ color: T.muted, fontSize: 10 }}>›</span><button onClick={() => setCrumbs(crumbs.slice(0, i + 1))} style={{ background: 'none', border: 'none', color: i === crumbs.length - 1 ? T.accent : T.blue, fontSize: 11, cursor: 'pointer' }}>{s}</button></span>)}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 5 }}>
        {crumbs.length > 0 && <div className="sb-row" onClick={() => setCrumbs(c => c.slice(0, -1))} style={{ color: T.textDim, fontSize: 11 }}>↩ ..</div>}
        {entries.map(([name, node]) => {
          const ext = name.split('.').pop().toLowerCase(), col = extC[ext] || T.textDim, isDir = node.type === 'dir' || node.type === 'folder'
          return <div key={name} className="sb-row" onClick={() => isDir && setCrumbs([...crumbs, name])}>
            <span style={{ fontSize: 13 }}>{isDir ? '📂' : '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, color: isDir ? T.amber : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>{node.size && <div style={{ fontSize: 9, color: T.muted }}>{fmtSz(node.size)}</div>}</div>
            {!isDir && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, border: `1px solid ${col}38`, color: col }}>{ext.toUpperCase()}</span>}
          </div>
        })}
        {!entries.length && <div style={{ textAlign: 'center', padding: 24, color: T.textDim, fontSize: 11 }}>Empty</div>}
      </div>
    </div>
  </div>
}

// ── FILE VIEWER (non-archive) ─────────────────────────────────────────────────
function FileViewer({ file, onClose }) {
  const [content, setContent] = useState(null), [loading, setLoading] = useState(true)
  const name = file.meta?.name || 'file'
  const isText = IS_TEXT.test(name), isImg = IS_IMG.test(name), isPdf = IS_PDF.test(name)
  const isLarge = file.large && file.tmpPath

  useEffect(() => {
    // Hard timeout — never infinite loading
    const timeout = setTimeout(() => setLoading(false), 6000)
    if (isLarge || !file.blob) { setLoading(false); clearTimeout(timeout); return }
    if (isPdf) { const u = URL.createObjectURL(file.blob); setContent(u); setLoading(false); clearTimeout(timeout); return () => URL.revokeObjectURL(u) }
    if (isText) { file.blob.text().then(t => { let out = t; if (name.endsWith('.json') || name.endsWith('.jsonc')) { try { out = JSON.stringify(JSON.parse(t), null, 2) } catch { } } setContent(out); setLoading(false); clearTimeout(timeout) }).catch(() => { setLoading(false); clearTimeout(timeout) }); return () => clearTimeout(timeout) }
    if (isImg) { const u = URL.createObjectURL(file.blob); setContent(u); setLoading(false); clearTimeout(timeout); return () => URL.revokeObjectURL(u) }
    setLoading(false); clearTimeout(timeout)
    return () => clearTimeout(timeout)
  }, [file])

  const save = async () => {
    if (isLarge && file.tmpPath) { await window.ftps?.saveFileFromTemp(file.tmpPath, name); return }
    if (!file.blob) return
    if (window.ftps) { const r = new FileReader(); r.onload = async () => await window.ftps.saveFile(name, r.result.split(',')[1]); r.readAsDataURL(file.blob) }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file.blob); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a) }
  }
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(760px,95vw)', height: 'min(80vh,680px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{name}</span>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={save} className="btn btn-green btn-sm">⬇ Save</button><button onClick={onClose} className="btn btn-ghost btn-sm">✕</button></div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
        {loading && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.textDim }}>
          <div className="spin" style={{ width: 18, height: 18, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />Loading…
        </div>}
        {!loading && isPdf && content && <iframe src={content} style={{ width: '100%', height: '100%', border: 'none' }} title={name} />}
        {!loading && isText && !isPdf && content !== null && <pre style={{ padding: 18, fontFamily: 'monospace', fontSize: 12, color: T.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</pre>}
        {!loading && isImg && content && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><img src={content} alt={name} style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 5 }} /></div>}
        {!loading && !isText && !isImg && !isPdf && <div style={{ padding: 36, textAlign: 'center' }}><div style={{ fontSize: 36, marginBottom: 10 }}>📄</div><div style={{ fontSize: 13, color: T.text, marginBottom: 6 }}>{name}</div><div style={{ fontSize: 12, color: T.textDim, marginBottom: 16 }}>{fmtSz(file.meta?.size || 0)}{isLarge ? <span style={{ color: T.amber }}> · Large file — save to disk to open</span> : ''}</div><button onClick={save} className="btn btn-green">⬇ Save</button></div>}
      </div>
    </div>
  </div>
}

// ── TOFU WARNING MODAL ───────────────────────────────────────────────────────
function TofuWarning({ data, onAccept, onReject }) {
  if (!data) return null
  return <div className="overlay">
    <div className="card fadeup" style={{ width: 'min(440px,95vw)', padding: 24, border: `1px solid ${T.red}40` }}>
      <div style={{ textAlign: 'center', fontSize: 28, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontSize: 15, color: T.red, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>KEY CHANGED — Possible MITM Attack!</div>
      <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8, marginBottom: 14, textAlign: 'center' }}>
        The encryption key for <strong style={{ color: T.text }}>{data.peerName || data.peerId}</strong> has changed since the first connection.
        <br />This could mean someone is intercepting the connection.
      </div>
      <div style={{ background: T.panel, borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 11, lineHeight: 1.6 }}>
        <div style={{ color: T.textDim }}>Previously known as: <span style={{ color: T.amber }}>{data.tofuDetail?.previousName || 'Unknown'}</span></div>
        <div style={{ color: T.textDim }}>First seen: <span style={{ color: T.muted }}>{data.tofuDetail?.firstSeen?.slice(0, 10) || 'Unknown'}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onReject} className="btn btn-danger" style={{ flex: 1, padding: 10 }}>✕ Disconnect</button>
        <button onClick={onAccept} className="btn btn-amber" style={{ flex: 1, padding: 10 }}>Accept New Key</button>
      </div>
    </div>
  </div>
}

// ── VERIFY FINGERPRINT MODAL ─────────────────────────────────────────────────
function VerifyModal({ fingerprint, peerName, onClose, onVerified }) {
  if (!fingerprint) return null
  return <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="card fadeup" style={{ width: 'min(420px,95vw)', padding: 24 }}>
      <div style={{ textAlign: 'center', fontSize: 28, marginBottom: 6 }}>🔐</div>
      <div style={{ fontSize: 14, color: T.accent, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>Session Verification Code</div>
      <div style={{ fontSize: 11, color: T.textDim, textAlign: 'center', lineHeight: 1.7, marginBottom: 14 }}>Read this code aloud to <strong style={{ color: T.text }}>{peerName || 'your peer'}</strong>.<br />If they see the exact same code, the connection is secure.</div>
      <div style={{ background: '#010409', border: `1px solid ${T.accent}30`, borderRadius: 8, padding: '14px 18px', textAlign: 'center', marginBottom: 14, fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: T.green, letterSpacing: 3 }}>{fingerprint}</div>
      <div style={{ fontSize: 11, color: T.textDim, textAlign: 'center', marginBottom: 14, lineHeight: 1.6 }}>This code is derived from both peers' ECDH public keys.<br />A Man-in-the-Middle attacker would produce a different code.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1, padding: 9 }}>Close</button>
        <button onClick={() => { onVerified?.(); onClose() }} className="btn btn-green" style={{ flex: 1, padding: 9 }}>✓ Verified — Matches</button>
      </div>
    </div>
  </div>
}

// ── COMPONENTS ───────────────────────────────────────────────────────────────
function BandwidthGraph({ data, color, label }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    // BUG-18 fix: scale canvas buffer to devicePixelRatio for crisp rendering on HiDPI
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    const w = rect.width, h = rect.height
    ctx.clearRect(0, 0, w, h)
    if (!data.length) return
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    const step = w / Math.max(data.length - 1, 1)
    data.slice(-20).forEach((v, i) => {
      const x = i * step, y = h - (Math.min(1, v / 500000) * (h - 4)) - 2
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
    // gradient fill
    const lastX = (Math.min(data.length, 20) - 1) * step
    ctx.lineTo(lastX, h); ctx.lineTo(0, h); ctx.fillStyle = color + '15'; ctx.fill()
  }, [data, color])
  return <div style={{ flex: 1, height: 40, display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 9, color, fontWeight: 700 }}>{fmtSz(data[data.length - 1] || 0)}/s</span>
    </div>
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
  </div>
}

function ResourceBar({ label, val, max, col }) {
  const pct = Math.min(100, Math.round((val / max) * 100))
  return <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4, color: T.textDim }}>
      <span>{label}</span>
      <span style={{ color: col, fontWeight: 700 }}>{pct}%</span>
    </div>
    <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: col, transition: 'width .5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
    </div>
  </div>
}

// ── HELP ─────────────────────────────────────────────────────────────────────
function HelpModal({ onClose, inline = false }) {
  const [tab, setTab] = useState('connect')
  const R = ({ l, v, c, icon }) => <div style={{ display: 'grid', gridTemplateColumns: '20px 150px 1fr', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}15`, alignItems: 'center' }}><span style={{ fontSize: 13, textAlign: 'center' }}>{icon || '•'}</span><span style={{ fontSize: 12, color: T.textDim, fontWeight: 500 }}>{l}</span><span style={{ fontSize: 12, color: c || T.text, fontWeight: 500 }}>{v}</span></div>
  const S = ({ n, col, title, body }) => <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${col}16`, border: `1.5px solid ${col}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: col }}>{n}</div>
    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: col, marginBottom: 3 }}>{title}</div><div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>{body}</div></div>
  </div>
  const tabs = ['connect', 'internet', 'security', 'sandbox']
  const content = <>
    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, background: `linear-gradient(135deg, ${T.panel}, ${T.surface})`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <span style={{ fontSize: 15, color: T.accent, fontWeight: 800, letterSpacing: 1 }}>P2N Documentation</span>
        </div>
        <div style={{ fontSize: 10, color: T.textDim, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: T.green }}>●</span> Direct TCP · ECDH P-256 · AES-256-GCM · TOFU Key Trust
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button onClick={() => window.ftps?.openExternal('https://github.com/official-imvoiid/P2N-Peer-Networking')} className="btn btn-ghost btn-sm">⭐ GitHub</button>
        {!inline && <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>}
      </div>
    </div>
    <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>
      {tabs.map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: tab === t ? T.accent : T.textDim, borderBottom: `2px solid ${tab === t ? T.accent : 'transparent'}`, cursor: 'pointer', fontWeight: tab === t ? 700 : 400, fontSize: 11, transition: 'all .12s', letterSpacing: .5 }}>
        {t === 'connect' ? '🔗 Connect' : t === 'internet' ? '🌐 Internet' : t === 'security' ? '🛡 Security' : '📦 Sandbox'}
      </button>)}
    </div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
      {tab === 'connect' && <>
        <div style={{ background: `linear-gradient(135deg, ${T.accent}08, ${T.green}06)`, border: `1px solid ${T.accent}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>⚡ Quick Start</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>One peer listens. The other dials. No servers required. Same network peers are <strong style={{ color: T.green }}>auto-discovered</strong> via mDNS. For internet connections, start Tor and share your onion address.</div>
        </div>
        <S n="1" col={T.blue} title="Start Listening" body="Connect tab → Start Listening (default port 7900). mDNS discovery starts automatically — nearby peers on the same network appear in the My Network tab." />
        <S n="2" col={T.green} title="Same Network" body="Open My Network tab — nearby peers appear automatically with a one-click Connect button. No IP typing needed. This uses mDNS multicast (like AirDrop/Bonjour), fully local." />
        <S n="3" col={T.purple} title="Different Network (Tor)" body="Connect tab → Different Network → Start Tor → copy your onion address → share via Discord/Signal/any platform → peer pastes it into Connect via Onion → encrypted session begins." />
        <S n="4" col={T.accent} title="Fully E2E Encrypted" body="ECDH P-256 + Ed25519 handshake. Fresh AES-256-GCM keys every session via HKDF. Every message and file chunk encrypted before leaving your machine. No server, no relay — direct peer-to-peer." />
      </>}
      {tab === 'internet' && <>
        <div style={{ background: T.purple + '08', border: `1px solid ${T.purple}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>🌐 Connecting Across the Internet</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>P2N uses Tor hidden services for cross-network connections. No port forwarding, no public IP, no server — just share your onion address via any platform.</div>
        </div>
        <S n="1" col={T.purple} title="Start Tor" body="Connect tab → Different Network section → click 'Start Tor & Generate Link'. Tor starts automatically and generates your unique onion address for this session." />
        <S n="2" col={T.accent} title="Share your address" body="Copy your onion address (e.g. abc123xyz.onion:7900) and send it to your peer via Discord, Signal, Telegram, email — any platform. The address is just a routing token, not secret." />
        <S n="3" col={T.green} title="Peer connects" body="Your peer pastes the onion address into the 'Connect via Onion' field and clicks connect. Tor routes the connection anonymously — neither side learns the other's real IP." />
        <S n="4" col={T.amber} title="New address each session" body="Tor generates a fresh onion address every time the app starts. You need to share the new address with your peer each session. This is by design — no permanent footprint." />
        <div style={{ marginTop: 10, padding: '10px 14px', background: T.green + '0a', border: `1px solid ${T.green}22`, borderRadius: 6, fontSize: 12, color: T.green, lineHeight: 1.7 }}>💡 <strong>Same network?</strong> Open My Network tab — peers are auto-discovered via mDNS, no address needed.</div>
      </>}
      {tab === 'security' && <>
        <div style={{ background: T.green + '08', border: `1px solid ${T.green}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>🛡 Security Architecture</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>Zero-trust, serverless, end-to-end encrypted with forward secrecy.</div>
        </div>
        <R icon="🔑" l="Key Exchange" v="ECDH P-256 — fresh keypair each session" c={T.green} />
        <R icon="🔒" l="Encryption" v="AES-256-GCM — every message, every chunk" c={T.green} />
        <R icon="🎲" l="Nonce" v="12-byte random IV per frame" c={T.green} />
        <R icon="🔢" l="Replay guard" v="8-byte monotonic sequence counter per frame" c={T.green} />
        <R icon="✍️" l="Identity" v="Ed25519 — signs every handshake, MITM-proof" c={T.green} />
        <R icon="✓" l="Auth Tag" v="16-byte GCM — tamper detection per frame" c={T.green} />
        <R icon="🔌" l="Transport" v="Direct TCP (no relay, no server)" c={T.blue} />
        <R icon="⊘" l="Servers" v="None — fully serverless P2P" c={T.accent} />
        <R icon="📡" l="mDNS" v="Local network auto-discovery — nothing relayed" />
        <R icon="📝" l="Log" v="In-memory only · Click log line to copy" />
        <R icon="✎" l="Rename limit" v="3 renames per session — anti-impersonation" c={T.amber} />
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.accent + '08', border: `1px solid ${T.accent}18`, borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, marginBottom: 5 }}>🔑 TOFU — Trust-On-First-Use (session-scoped)</div>
          <div style={{ fontSize: 11, color: T.textMid, lineHeight: 1.7 }}>On first connect this session, P2N stores the peer's <em>Ed25519 public key</em> in memory. If they reconnect with the same key — trusted ✓. If the key changes mid-session — <span style={{ color: T.red, fontWeight: 600 }}>MITM warning</span>. TOFU resets when the app closes — this is intentional. P2N is designed for ephemeral secure sessions.</div>
        </div>
      </>}
      {tab === 'sandbox' && <>
        <div style={{ background: T.amber + '08', border: `1px solid ${T.amber}18`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>🛡 Sandbox & Archive Security</div>
          <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.8 }}>P2N offers two levels of file inspection: an in-app archive viewer (ZIP/TAR) and OS-level sandboxing (Windows Sandbox / Linux firejail). Both keep suspicious files away from your real system.</div>
        </div>
        <S n="1" col={T.blue} title="In-App Archive Viewer" body="ZIP and TAR files can be browsed directly inside P2N — click '📂 Browse' on the file card. Read-only, in-memory, nothing is extracted to disk. Preview text, images, and PDFs safely." />
        <S n="2" col={T.amber} title="OS Sandbox (Windows / Linux)" body="Click '🛡 Sandbox' on any archive or executable file. On Windows, this launches Windows Sandbox (Hyper-V VM) — a full isolated virtual machine. On Linux, firejail/bubblewrap creates a restricted namespace. Everything is deleted when the sandbox closes." />
        <S n="3" col={T.green} title="Save selectively" body="After inspecting, click ⬇ on individual files to save to a location you choose. Nothing is auto-saved or auto-extracted to your real filesystem." />
        <S n="4" col={T.purple} title="AV scan" body="Click 'Explorer' to open the temp folder in your OS file manager — Windows Defender / ClamAV scans on access automatically. P2N also runs its own threat scanner on every received file (magic byte checks, polyglot detection, PDF/image analysis)." />
        <div style={{ marginTop: 12, padding: '10px 14px', background: T.red + '0a', border: `1px solid ${T.red}22`, borderRadius: 6, fontSize: 12, color: T.red, lineHeight: 1.7 }}>⚠ <strong>Never</strong> run executables directly. Use the sandbox to inspect, AV scan, then save to disk only if trusted.</div>
        <div style={{ marginTop: 8, padding: '10px 14px', background: T.green + '0a', border: `1px solid ${T.green}22`, borderRadius: 6, fontSize: 12, color: T.green, lineHeight: 1.7 }}>💡 <strong>Requirements:</strong> Windows Sandbox requires Windows 10/11 Pro/Enterprise with virtualization enabled. Linux requires firejail or bubblewrap (<code style={{ background: T.panel, padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 11 }}>sudo apt install firejail</code>).</div>
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

// CHANGE 8: Settings are ephemeral — reset on every restart. Only port persists to disk.
const DEFAULT_SETTINGS = { lockMin: 15, md: true, warnLinks: true, warnArch: true, torEnabled: true, maxTries: 5, scanFiles: true, exifStripSend: false, exifStripRecv: false, clearMsgsOnReconnect: true }
// sessionStorage survives webContents.reload() (Refresh UI) but NOT app restart.
// This lets Refresh UI work without terminating the session.
function readSavedSession() {
  try { return JSON.parse(sessionStorage.getItem('p2n_session') || 'null') } catch { return null }
}
function saveSession(account, nodeId) {
  try { sessionStorage.setItem('p2n_session', JSON.stringify({ account, nodeId, at: Date.now() })) } catch { }
}
function clearSavedSession() {
  try { sessionStorage.removeItem('p2n_session') } catch { }
}

// Determine initial screen synchronously (avoid flash of setup screen on reload)
function getInitialScreen() {
  const s = readSavedSession()
  if (s?.nodeId && s?.account?.name) return 'restoring'
  return 'setup'
}
function getInitialAccount() {
  const s = readSavedSession()
  return s?.account || null
}
function getInitialNodeId() {
  const s = readSavedSession()
  return s?.nodeId || '#0000'
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
// FIX #10: Identity Password Panel — encrypt/decrypt persistent identity key
export default function App() {
  const [screen, setScreen] = useState(getInitialScreen)
  const [account, setAccount] = useState(getInitialAccount)
  const [form, setForm] = useState({ name: '', passphrase: '', password: '' })
  const [fErr, setFErr] = useState({})
  const [lockForm, setLockForm] = useState({ pp: '', pw: '' })
  const [lockErr, setLockErr] = useState('')
  const [lockTries, setLockTries] = useState(0)
  const [sett, setSett2Raw] = useState(() => ({ ...DEFAULT_SETTINGS }))
  const setSett2 = useCallback(updater => {
    setSett2Raw(prev => typeof updater === 'function' ? updater(prev) : updater)
  }, [])
  const [tab, setTab] = useState('connect')
  const [selPeer, setSelPeer] = useState(null)
  const [peers, setPeers] = useState([])
  const peersRef = useRef([])
  const peerIdentityKeysRef = useRef({})  // keeps in sync with peerIdentityKeys state for closure-safe dedup
  const [msgs, setMsgs] = useState({})
  const [input, setInput] = useState('')
  const [folderView, setFolderView] = useState(null)
  const [fileView, setFileView] = useState(null)
  const [showCode, setShowCode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [sandbox, setSandbox] = useState(null)
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [showVerify, setShowVerify] = useState(null)  // {fingerprint, peerName}
  const [showTofuWarn, setShowTofuWarn] = useState(null)  // {peerId, peerName, tofuDetail}
  const [showLinkConfirm, setShowLinkConfirm] = useState(null)
  const [showArchConfirm, setShowArchConfirm] = useState(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(null) // {peerId,peerName}
  const [showRenameConfirm, setShowRenameConfirm] = useState(null) // holds new name string when pending (CHANGE 1)
  const [renameCountThisSession, setRenameCountThisSession] = useState(0) // tracks renames used this session
  const [showDangerConfirm, setShowDangerConfirm] = useState(null) // holds File object for executable send confirmation
  // BUG-14 fix: showAttach was dead state (never used in UI) — removed
  const [peerFingerprints, setPeerFingerprints] = useState({})
  const [peerIdentityKeys, setPeerIdentityKeys] = useState({})  // peerId → identityKey for tofuAccept
  const myIdentityKeyRef = useRef('')   // own Ed25519 pub key — used for self-connection guard
  const myOnionAddrRef   = useRef('')   // own .onion hostname — used for self-connection guard
  const [verifiedPeers, setVerifiedPeers] = useState(new Set())
  const [discoveredPeers, setDiscoveredPeers] = useState([])  // mDNS discovered peers
  const [pendingPeerRequests, setPendingPeerRequests] = useState([]) // CHANGE 7b
  const [sentPeerRequests, setSentPeerRequests] = useState(new Set()) // CHANGE 7b
  const [rejectedRequests, setRejectedRequests] = useState([]) // Edit 5: track rejections with timer
  const sentPeerRequestsRef = useRef(new Set()) // FIX: ref mirror to avoid stale closure in onOpen
  // connection state
  const [listenPort, setListenPort] = useState('7900')
  const [listenActive, setListenActive] = useState(false)
  const [listenInfo, setListenInfo] = useState(null)
  const [connectAddr, setConnectAddr] = useState('')
  const [connState, setConnState] = useState('idle')
  const [connErr, setConnErr] = useState('')
  // Tor state
  const [torStatus, setTorStatus] = useState('off') // off|starting|running|error
  const [torBootstrap, setTorBootstrap] = useState(0) // 0–100 bootstrap %
  const [torBootstrapMsg, setTorBootstrapMsg] = useState('Initializing…')
  const [onionAddr, setOnionAddr] = useState('')
  const [onionInput, setOnionInput] = useState('')
  const [torError, setTorError] = useState('')  // specific Tor error message
  // FIX: Separate connection state for Tor vs local — they must not block each other
  const [torConnState, setTorConnState] = useState('idle') // idle|connecting|done|error
  const [torConnErr, setTorConnErr] = useState('')
  // B4/C1: Blocked peers
  const [blockedPeers, setBlockedPeers] = useState([])
  // system
  const [netInfo, setNetInfo] = useState([])
  const [uptime, setUptime] = useState(0)
  const [lockTimer, setLockTimer] = useState(900)
  const [logs, setLogs] = useState([])
  const [unreadLogs, setUnreadLogs] = useState(0)  // clears when user opens Logs tab
  const [logSearch, setLogSearch] = useState('')   // search filter for logs tab
  const [editName, setEditName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [sysStats, setSysStats] = useState(null)
  const [netDetails, setNetDetails] = useState({ dnsServers: [], gateway: '…' })
  const [bwHistory, setBwHistory] = useState({ in: [], out: [] })
  const lastBw = useRef({ in: 0, out: 0 })

  const bridgeRef = useRef(null), chatEnd = useRef(null)
  const blockedPeerStateRef = useRef({})  // Edit 7: stores {name, msgs} when peer is blocked
  const fileInp = useRef(null), folderInp = useRef(null), lastAct = useRef(Date.now()), myId = useRef(getInitialNodeId())
  // Stores received folder file data keyed by folderFid — kept in ref to avoid re-renders per-chunk
  const folderDataRef = useRef({})  // {[folderFid]: {name, files:[{relPath,name,size,dataB64?,tmpPath?}]}}
  const removedByPeersRef = useRef(new Set())  // peerIds that have explicitly removed us
  // Stores shared folder File objects keyed by fid — sender keeps these until receiver pulls
  const sharedFoldersRef = useRef({})  // {[fid]: {name, files:[File]}}
  const folderPullFidsRef = useRef(new Set())  // tracks fids from folder-pull ops to suppress standalone FileMsg

  const [zipView, setZipView] = useState(null)   // msg to show in ZipViewer
  const [osSandbox, setOsSandbox] = useState(null)   // msg/file to show in OSSandbox

  const [toast, setToast] = useState(null)
  const notify = useCallback((msg, t = 'info') => { setToast({ msg, t }); setTimeout(() => setToast(null), 3200) }, [])
  const pushMsg = useCallback((pid, m) => setMsgs(p => ({ ...p, [pid]: [...(p[pid] || []), m] })), [])

  // A4 FIX: Keep peersRef in sync so async callbacks/closures always see current peers
  useEffect(() => { peersRef.current = peers }, [peers])
  useEffect(() => { peerIdentityKeysRef.current = peerIdentityKeys }, [peerIdentityKeys])
  // FIX: Keep sentPeerRequestsRef in sync so TCPBridge onOpen always reads current state
  useEffect(() => { sentPeerRequestsRef.current = sentPeerRequests }, [sentPeerRequests])
  // B10 FIX: Keep settRef in sync so TCPBridge handlers always see current settings
  const settRef = useRef(sett)
  useEffect(() => { settRef.current = sett }, [sett])
  const addLog = useCallback((level, msg, detail = '') => {
    setLogs(p => [{ ts: new Date().toTimeString().slice(0, 8), level, msg, detail }, ...p].slice(0, 300))
    setUnreadLogs(n => n + 1)
  }, [])

  // Activity tracking for auto-lock
  useEffect(() => {
    const r = () => lastAct.current = Date.now()
      ;['mousemove', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, r))
    return () => ['mousemove', 'keydown', 'click'].forEach(ev => window.removeEventListener(ev, r))
  }, [])

  // Uptime + auto-lock tick
  useEffect(() => {
    const t = setInterval(() => {
      if (screen === 'main') {
        setUptime(u => u + 1)
        const rem = Math.max(0, sett.lockMin * 60 - (Date.now() - lastAct.current) / 1000)
        setLockTimer(Math.round(rem))
        if (rem <= 0) setScreen('locked')
      }
    }, 1000)
    return () => clearInterval(t)
  }, [screen, sett.lockMin])

  // Network info fetch
  const refreshNet = useCallback(() => {
    window.ftps?.getLocalIPs().then(r => setNetInfo(r || [])).catch(() => { })
    window.ftps?.getNetDetails().then(r => setNetDetails(r || { dnsServers: [], gateway: 'Unknown' })).catch(() => { })
  }, [])
  useEffect(() => { refreshNet() }, [refreshNet])
  // CHANGE 8: Load saved port from main process on mount
  useEffect(() => {
    window.ftps?.getPort?.().then(r => { if (r?.port) setListenPort(String(r.port)) }).catch(() => { })
  }, [])
  // B4/C1: Load blocked peers on mount + keep in sync via ftps:peer-blocked event
  useEffect(() => {
    const refresh = () => window.ftps?.getBlocked?.().then(r => { if (Array.isArray(r)) setBlockedPeers(r) }).catch(() => {})
    refresh()
    const unsub = window.ftps?.on('ftps:peer-blocked', () => refresh())
    return () => unsub?.()
  }, [])

  // Edit 5: Refresh rejection timers every second for live countdown display
  useEffect(() => {
    if (rejectedRequests.length === 0) return
    const t = setInterval(() => {
      const now = Date.now()
      setRejectedRequests(r => r.filter(x => x.expiresAt > now))
    }, 1000)
    return () => clearInterval(t)
  }, [rejectedRequests.length])

  // Issue 11: Auto-expire pending mDNS connection requests after 30 seconds
  useEffect(() => {
    if (pendingPeerRequests.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      setPendingPeerRequests(prev => {
        const expired = prev.filter(r => now - r.timestamp >= 30000)
        const remaining = prev.filter(r => now - r.timestamp < 30000)
        // Auto-decline expired requests
        expired.forEach(r => {
          bridgeRef.current?.sendMsg(r.peerId, { type: 'peer_reject' })
          bridgeRef.current?.disconnect(r.peerId)
          setPeers(ps => ps.filter(p => p.id !== r.peerId))
        })
        return remaining
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [pendingPeerRequests.length])

  // Periodic stats poller
  useEffect(() => {
    if (screen !== 'main' || tab !== 'stats') return
    const poller = setInterval(async () => {
      const stats = await window.ftps?.getSysStats()
      if (stats) {
        setSysStats(stats)
        const diffIn = stats.bytesReceived - lastBw.current.in
        const diffOut = stats.bytesSent - lastBw.current.out
        setBwHistory(p => ({
          in: [...p.in, diffIn].slice(-20),
          out: [...p.out, diffOut].slice(-20)
        }))
        lastBw.current = { in: stats.bytesReceived, out: stats.bytesSent }
      }
    }, 1500)
    return () => clearInterval(poller)
  }, [screen, tab])

  // Main process events
  useEffect(() => {
    const us = [
      window.ftps?.on('ftps:tor-status', d => {
        setTorStatus(d.status)
        // Bootstrap progress (0–100) — main.js emits this during startup
        if (d.progress !== undefined) {
          setTorBootstrap(d.progress)
          const labels = {
            5:  'Connecting to directory server…',
            14: 'Fetching network consensus…',
            40: 'Loading relay descriptors…',
            60: 'Building circuits…',
            75: 'Establishing guard connections…',
            80: 'Connecting to entry guard…',
            90: 'Almost there…',
            100:'Connected to Tor network!',
          }
          const best = Object.keys(labels).reverse().find(k => d.progress >= parseInt(k))
          if (best) setTorBootstrapMsg(labels[best])
        }
        if (d.status === 'starting' && d.progress === undefined) {
          setTorBootstrap(0); setTorBootstrapMsg('Starting Tor process…')
        }
        if (d.onionAddress) {
          setOnionAddr(d.onionAddress + ':' + (d.port || 7000))
          myOnionAddrRef.current = d.onionAddress   // self-connection guard
        }
        if (d.error) setTorError(d.error)
        if (d.status === 'running') { setTorError(''); setTorBootstrap(100); setTorBootstrapMsg('Connected!') }
        if (d.status === 'off')     { setOnionAddr(''); setTorError(''); setTorBootstrap(0); setTorBootstrapMsg('Initializing…'); myOnionAddrRef.current = '' }
      }),
      // FIX: KNOWN-02 — removed dead subscriptions: ftps:upnp-status, ftps:pairing-status, ftps:stun-result
      // None of these channels are emitted by main.js
      window.ftps?.on('p2n:log', e => {
        setLogs(p => [{ ts: e.ts || '', level: e.level, msg: e.msg, detail: e.detail || '' }, ...p].slice(0, 300))
        setUnreadLogs(n => n + 1)
      }),
      window.ftps?.on('app:request-close', () => setShowCloseConfirm(true)),
      // FIX: mDNS discovered peers
      window.ftps?.on('ftps:peers-discovered', list => setDiscoveredPeers(list || [])),
      // CHANGE 3: Subscribe to file-aborted events
      window.ftps?.on('ftps:file-aborted', ({ peerId, fid }) => {
        setMsgs(p => ({ ...p, [peerId]: (p[peerId] || []).map(m => m.id === fid + '_in' ? { ...m, type: 'revoked', revokedAt: new Date().toLocaleTimeString(), pct: 0 } : m) }))
      }),
      window.ftps?.on('app:session-active', sess => {
        if (screen === 'restoring' || screen === 'setup') {
          const saved = readSavedSession()
          if (saved && sess.nodeId === saved.nodeId) {
            setAccount(saved.account); myId.current = saved.nodeId
            window.ftps?.setIdentity(saved.account.name, saved.nodeId)
            setScreen('main'); addLog('OK', 'Session restored after UI refresh')
          }
        }
      }),
      // Reconnect UI Events
      window.ftps?.on('ftps:peer-reconnecting', ({ peerId, attempt, maxAttempts }) => {
        setPeers(ps => ps.map(p => p.id === peerId ? { ...p, reconnecting: true, reconnectAttempt: attempt, reconnectMax: maxAttempts } : p))
      }),
      window.ftps?.on('ftps:peer-connected', ({ peerId }) => {
        setPeers(ps => {
          const wasReconn = ps.find(p => p.id === peerId)?.reconnecting
          if (wasReconn) {
             setTimeout(() => setPeers(ps2 => ps2.map(p2 => p2.id === peerId ? { ...p2, newlyConnected: false } : p2)), 3000)
             return ps.map(p => p.id === peerId ? { ...p, reconnecting: false, newlyConnected: true } : p)
          }
          return ps.map(p => p.id === peerId ? { ...p, reconnecting: false } : p)
        })
      }),
      // Issue 5/11: Network status — notify user when offline/online and reconnecting
      window.ftps?.on('ftps:network-status', ({ online }) => {
        if (online) {
          addLog('OK', 'Network back online — reconnecting peers…')
          notify('🌐 Network restored — reconnecting…', 'ok')
        } else {
          addLog('WARN', 'Network offline — transfers paused')
          notify('📡 Network offline — will reconnect when available', 'err')
        }
      }),
      // BUG 5C FIX: On unblock, reconnect but DON'T auto-approve.
      // Mark as needing re-approval so unblocked peers go through the request flow.
      window.ftps?.on('ftps:peer-unblocked', ({ peerId }) => {
        // Edit 7: Restore peer's previous state when unblocking
        const saved = blockedPeerStateRef.current[peerId]
        if (saved) {
          // Restore the peer in the peers list (offline, unblocked)
          setPeers(ps => {
            const existing = ps.find(p => p.id === peerId)
            if (existing) {
              return ps.map(p => p.id === peerId
                ? { ...p, online: false, blocked: false, reconnecting: false }
                : p
              )
            }
            // Peer was removed from list — re-add them
            return [...ps, { id: peerId, name: saved.name, online: false, blocked: false, reconnecting: false }]
          })
          // Restore their chat messages
          if (saved.msgs?.length > 0) {
            setMsgs(p => ({ ...p, [peerId]: saved.msgs }))
          }
          delete blockedPeerStateRef.current[peerId]
          addLog('OK', `Peer ${peerId} unblocked — previous chat restored, awaiting their reconnect`)
          notify(`${saved.name || peerId} unblocked — previous chat restored. They will reconnect via mDNS.`, 'ok')
        } else {
          addLog('OK', `Peer ${peerId} unblocked — they can now rediscover and send a new request`)
          notify(`Peer unblocked — they must send a new connection request`, 'ok')
        }
        // Do NOT auto-approve — peer must still go through the request flow
      }),
    ]
    return () => us.forEach(u => u?.())
  }, [screen])

  // Load logs from main + sync Tor status
  useEffect(() => {
    window.ftps?.getLogs().then(l => setLogs((l || []).reverse().slice(0, 300))).catch(() => { })
    // Sync Tor status on mount (covers app reload, session restore)
    window.ftps?.getTorStatus().then(s => {
      if (s) {
        setTorStatus(s.running ? 'running' : 'off')
        if (s.onionAddress) setOnionAddr(s.onionAddress + ':' + (s.socksPort || 7000))
        if (s.enabled !== undefined) setSett2(p => ({ ...p, torEnabled: s.enabled }))
      }
    }).catch(() => { })
  }, [])

  // FIX BUG-04: Session restore on mount — check main process for active session.
  // We call clearSavedSession() IMMEDIATELY so if getSession() is slow or fails,
  // we don't show stale peer/account data from a previous run.
  useEffect(() => {
    if (screen !== 'restoring') return
    const saved = readSavedSession()
    if (!saved) { setScreen('setup'); return }
    // Pre-emptively clear stale session data so the UI starts clean.
    // If main process confirms the session is still active, we restore it below.
    clearSavedSession()
    window.ftps?.getSession().then(sess => {
      if (sess?.active && sess.nodeId === saved.nodeId) {
        // Session is genuinely alive (Refresh UI scenario) — restore it
        saveSession(saved.account, saved.nodeId)  // re-save since we cleared above
        setAccount(saved.account); myId.current = saved.nodeId
        window.ftps?.setIdentity(saved.account.name, saved.nodeId)
        setScreen('main'); addLog('OK', 'Session restored after UI refresh')
      } else {
        // Full restart — no active session in main process, go to setup
        setScreen('setup')
      }
    }).catch(() => { setScreen('setup') })
  }, [])  // eslint-disable-line
  useEffect(() => {
    bridgeRef.current = new TCPBridge({
      onOpen(pid, pn, fingerprint, tofu, tofuDetail, identityKey) {

        // ── SELF-CONNECTION GUARD ─────────────────────────────────────────────
        // If the connecting peer has our own identity key, we connected to ourselves.
        // Disconnect immediately — silently, no chat message needed.
        if (identityKey && myIdentityKeyRef.current && identityKey === myIdentityKeyRef.current) {
          bridgeRef.current?.disconnect(pid)
          notify('⚠ Cannot connect to yourself', 'err')
          addLog('WARN', 'Self-connection rejected', pid)
          return
        }

        // FIX 6: mDNS request reconciliation — nodeId from mDNS may differ from real pid in HELLO
        // When mDNS "Add +" is clicked, we stored dp.nodeId as the pending request peerId.
        // Now that HELLO arrived with real pid, find and clean up the nodeId-based entry.
        setPendingPeerRequests(prev => {
          // Find any sender-role request whose peerName matches the newly connected peer
          const mdnsMatch = prev.find(r => r.role === 'sender' && (r.peerName === pn || r.peerId !== pid))
          if (mdnsMatch && mdnsMatch.peerId !== pid) {
            // Remove the nodeId-based entry (it will be replaced by real flow)
            setSentPeerRequests(s => { const n = new Set(s); n.delete(mdnsMatch.peerId); return n })
            return prev.filter(r => r.peerId !== mdnsMatch.peerId)
          }
          return prev
        })

        // ── MULTI-PATH DEDUPLICATION ──────────────────────────────────────────
        // Same person may connect via both mDNS/LAN and Tor simultaneously.
        // Identify them by their Ed25519 identity key (unique per session).
        // Keep only the newest connection; silently drop the older duplicate.
        if (identityKey) {
          const dupPeer = peersRef.current.find(p => {
            const existing = peerIdentityKeysRef.current[p.id]
            return existing === identityKey && p.id !== pid
          })
          if (dupPeer) {
            // Same person, different path — disconnect old, adopt new pid
            addLog('INFO', `Multi-path dedup: ${pn || pid} already connected as ${dupPeer.id} — switching to new path`)
            bridgeRef.current?.disconnect(dupPeer.id)
            // Migrate chat history from old pid to new pid
            setMsgs(p => {
              const old = p[dupPeer.id] || []
              const cur = p[pid] || []
              const n = { ...p }
              delete n[dupPeer.id]
              n[pid] = [...old, ...cur]
              return n
            })
            setPeers(ps => ps.filter(p => p.id !== dupPeer.id))
            pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🔄 Switched to faster path`, time: now8() })
          }
        }

        // keep a ref for dedup lookups without stale closure issues
        if (!window.__p2nIkRef) window.__p2nIkRef = {}
        if (identityKey) window.__p2nIkRef[pid] = identityKey

        setPeers(ps => {
          const ex = ps.find(p => p.id === pid)
          if (ex) return ps.map(p => p.id === pid ? { ...p, online: true, reconnecting: false, removedMe: false, name: p.name || pn, approved: true } : p)
          return [...ps, { id: pid, name: pn, online: true, reconnecting: false, removedMe: false, approved: true }]
        })
        removedByPeersRef.current.delete(pid)
        setPendingPeerRequests(p => p.filter(r => r.peerId !== pid))
        
        if (settRef.current.clearMsgsOnReconnect && tofu !== 'trusted') {
          setMsgs(p => { const n = { ...p }; delete n[pid]; return n })
        }
        if (fingerprint) setPeerFingerprints(fp => ({ ...fp, [pid]: fingerprint }))
        if (identityKey) setPeerIdentityKeys(ik => ({ ...ik, [pid]: identityKey }))
        if (tofu === 'changed') {
          // Only show modal and warning if the key CHANGED — genuine MITM concern
          setShowTofuWarn({ peerId: pid, peerName: pn, tofuDetail })
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `⚠️ WARNING: Peer key has changed! Verify identity before continuing.`, time: now8() })
        } else if (tofu === 'trusted') {
          // Reconnect within session — just a brief confirmation
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🔒 Reconnected · Trusted · E2E Encrypted`, time: now8() })
        } else {
          // 'new' — first time seeing this peer this session. Clean, non-alarming message.
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🔒 Connected · E2E Encrypted (ECDH P-256 · AES-256-GCM)`, time: now8() })
          // Only show fingerprint for new peers — useful for manual verification
          if (fingerprint) pushMsg(pid, { id: Date.now() + 1, from: 'sys', type: 'sys', text: `🔑 Verify fingerprint out-of-band: ${fingerprint}`, time: now8() })
        }
        addLog('OK', `Connected: ${pn || pid}`, fingerprint ? `FP: ${fingerprint}` : '')
        notify(`${pn || 'Peer'} connected`, 'ok')
        // Edit 5: Only navigate to chat when a NEW peer is fully approved and connected.
        // For reconnects (tofu==='trusted'), restore the chat view.
        // For genuinely new first-time connections the user sees the chat once approved.
        setConnState('idle'); setConnErr('')
        setTorConnState('idle'); setTorConnErr('')
        setSelPeer({ id: pid, name: pn, online: true, reconnecting: false, approved: true })
        setTab('peers')
      },
      onRequested(peerId, peerName, fingerprint, tofu, tofuDetail, identityKey, role) {
        setPendingPeerRequests(p => {
          // FIX 6: Replace any existing placeholder entry (added from mDNS click) with real peerId
          // The placeholder was added with dp.nodeId; now we have the real pid from HELLO
          const hasExact = p.some(r => r.peerId === peerId)
          if (hasExact) return p  // already have real entry, nothing to do
          // Check for a placeholder sender entry by name (from mDNS click)
          const placeholderIdx = role === 'sender'
            ? p.findIndex(r => r.role === 'sender' && r.peerName === peerName && r.peerId !== peerId)
            : -1
          if (placeholderIdx >= 0) {
            // Replace placeholder with real peerId
            const updated = [...p]
            updated[placeholderIdx] = { peerId, peerName, fingerprint, tofu, tofuDetail, identityKey, role, timestamp: Date.now() }
            // Clean up old nodeId from sentPeerRequests
            setSentPeerRequests(s => {
              const n = new Set(s)
              n.delete(p[placeholderIdx].peerId)
              n.add(peerId)
              return n
            })
            return updated
          }
          return [...p, { peerId, peerName, fingerprint, tofu, tofuDetail, identityKey, role, timestamp: Date.now() }];
        });
        if (role === 'receiver') notify(`📡 ${peerName || 'Peer'} wants to connect`, 'info');
      },
      onRejected(peerId) {
        const peerName = pendingPeerRequests.find(r => r.peerId === peerId)?.peerName || peerId
        setPendingPeerRequests(p => p.filter(r => r.peerId !== peerId));
        setSentPeerRequests(s => { const n = new Set(s); n.delete(peerId); return n })
        // Edit 5: Add to rejected list with 10-min expiry timer
        setRejectedRequests(r => [...r.filter(x => x.peerId !== peerId), {
          peerId, peerName, rejectedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000
        }])
        notify(`Your request was declined — blocked for 10 minutes`, 'err');
      },
      onWithdrawn(peerId) {
        setPendingPeerRequests(p => p.filter(r => r.peerId !== peerId));
        notify(`Connection request was withdrawn`, 'info');
      },
      onClose(pid) {
        const peer = peersRef.current.find(p => p.id === pid)
        setPeers(ps => ps.map(p => p.id === pid ? { ...p, online: false, reconnecting: false } : p))
        // Show reconnect hint if we were actively trying to reconnect
        const wasReconnecting = peer?.reconnecting
        pushMsg(pid, {
          id: Date.now(), from: 'sys', type: 'sys',
          text: wasReconnecting
            ? '⚠ Disconnected — peer may have blocked you or went offline'
            : '⚠ Disconnected',
          time: now8()
        })
        addLog('WARN', 'Disconnected', pid)
        notify('Peer disconnected', 'err')
      },
      onReconnecting(pid, attempt, maxAttempts) {
        setPeers(ps => ps.map(p => p.id === pid ? { ...p, reconnecting: true, reconnectAttempt: attempt } : p))
        const maxLabel = maxAttempts > 20 ? '∞' : maxAttempts
        addLog('INFO', `Reconnecting to ${pid}`, `attempt ${attempt}/${maxLabel}`)
      },
      onMsg(pid, msg) {
        // A4 FIX: use peersRef.current instead of stale `peers` closure
        const pn = peersRef.current.find(p => p.id === pid)?.name || pid
        if (msg.type === 'chat') pushMsg(pid, { id: Date.now(), from: 'them', type: 'text', text: msg.text, time: now8() })
        else if (msg.type === 'folder_share') pushMsg(pid, { id: Date.now(), from: 'them', type: 'folder', folder: msg.folder, time: now8() })
        // CHANGE 3: Fix revoke — use msg.fid + '_in' to match receiver's message id
        else if (msg.type === 'revoke') {
          const receiverMsgId = msg.fid + '_in'
          setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === receiverMsgId ? { ...m, blob: null, tmpPath: null, type: 'revoked', revokedAt: new Date().toLocaleTimeString() } : m) }))
        }
        // (Messages removed: old peer_request, peer_accept, peer_reject)
        // New folder offer — receiver sees structure, can browse and pull
        else if (msg.type === 'folder_offer') pushMsg(pid, {
          id: 'fb_' + msg.fid, from: 'them', type: 'folder_browse',
          fid: msg.fid, name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes,
          tree: msg.tree, status: 'available', time: now8(),
        })
        // Sender revoked the folder offer
        else if (msg.type === 'folder_offer_revoked') {
          setMsgs(p => ({
            ...p, [pid]: (p[pid] || []).map(m =>
              m.id === 'fb_' + msg.fid ? { ...m, status: 'revoked' } : m
            )
          }))
          notify(`${pn} revoked the folder offer`, 'info')
        }
        // A5 FIX: Receiver gets folder_pull_done → mark both browse and recv card as done
        else if (msg.type === 'folder_pull_done') {
          setMsgs(p => ({
            ...p, [pid]: (p[pid] || []).map(m =>
              (m.id === 'fb_' + msg.fid || m.id === 'fr_' + msg.fid)
                ? { ...m, status: 'done' }
                : m
            )
          }))
        }
        // B2 FIX: Other side removed us — mark in ref so send gives specific error
        else if (msg.type === 'peer_removed') {
          removedByPeersRef.current.add(pid)
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🚫 ${pn} has removed you from their peer list. Messages cannot be sent.`, time: now8() })
          setPeers(ps => ps.map(p => p.id === pid ? { ...p, online: false, removedMe: true } : p))
          notify(`${pn} removed you — you can no longer message them`, 'info')
        }
        // B7 FIX: Peer renamed — update peers list AND selPeer so ALL names refresh instantly
        // FIX #3: main.js now broadcasts type:'peer_rename'; also handle legacy 'name_update'
        else if (msg.type === 'peer_rename' || msg.type === 'name_update') {
          const newName = msg.newName
          const oldName = pn  // captured above from peersRef
          // Update peers list (sidebar + network tab)
          setPeers(ps => ps.map(p => p.id === pid ? { ...p, name: newName } : p))
          // Update selPeer so the chat header name changes immediately if this peer is open
          setSelPeer(sp => sp?.id === pid ? { ...sp, name: newName } : sp)
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `✎ ${oldName} renamed to "${newName}"`, time: now8() })
          notify(`${oldName} is now "${newName}"`, 'info')
          addLog('INFO', `Peer renamed: ${oldName} → ${newName}`, pid)
        }
        // Sender receives pull request → start sending files
        else if (msg.type === 'folder_pull') {
          const folder = sharedFoldersRef.current[msg.fid]
          if (!folder) return
          setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'sending' } : m) }))
          if (msg.fileIndex != null) {
            // Pull single file — FIX #5: use streaming sendFolderFile if available
            const file = folder.files[msg.fileIndex]
            if (file) {
              const singleFid = crypto.randomUUID()
              const relPath = file.webkitRelativePath || file.name
                ; (bridgeRef.current?.sendFolderFile
                  ? bridgeRef.current.sendFolderFile(pid, file, singleFid, msg.fid, relPath, msg.fileIndex, () => { })
                  : bridgeRef.current?.sendFile(pid, file, () => { })
                ).then(() => {
                  setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'offered' } : m) }))
                }).catch(() => { })
            }
          } else {
            // FIXED: Higher concurrency + completion fence to prevent 16281/16283 stall bug
            const files = folder.files
            const CONCURRENCY = 6  // More workers = faster parallel sends on LAN
              ; (async () => {
                const queue = files.map((file, i) => ({ file, i }))
                let failCount = 0
                const inFlight = new Set()
                const worker = async () => {
                  while (queue.length > 0) {
                    const { file, i } = queue.shift()
                    const fileFid = crypto.randomUUID()
                    const relPath = file.webkitRelativePath || file.name
                    inFlight.add(fileFid)
                    try {
                      if (bridgeRef.current?.sendFolderFile) {
                        await bridgeRef.current.sendFolderFile(pid, file, fileFid, msg.fid, relPath, i, () => { })
                      } else {
                        await bridgeRef.current?.sendFile(pid, file, () => { })
                      }
                    } catch { failCount++ } finally { inFlight.delete(fileFid) }
                  }
                }
                await Promise.allSettled(
                  Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker())
                )
                // Completion fence: wait 800ms after all workers finish so the last file_end
                // frames can clear the TCP send buffer before folder_pull_done is sent.
                // This prevents the 16281/16283 "last 2 files missing" stall bug.
                await new Promise(r => setTimeout(r, 800))
                if (failCount > 0) {
                  setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'done', failCount } : m) }))
                } else {
                  setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'done' } : m) }))
                }
                bridgeRef.current?.sendMsg(pid, { type: 'folder_pull_done', fid: msg.fid, failCount })
              })().catch(() => {
                setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'offered' } : m) }))
              })
          }
        }
      },
      // B6 FIX: Skip standalone FileMsg for files belonging to a folder transfer
      onFileStart(pid, meta) {
        // Skip if this file belongs to a manifest-based folder transfer (has folderFid)
        if (meta.folderFid !== undefined) return
        // Skip if this file's fid is tracked as part of a folder-pull operation
        if (folderPullFidsRef.current.has(meta.fid)) return
        // Check if there's an active folder browse card in 'pulling' state for this peer
        // If so, this file is part of a pull operation — suppress standalone card
        pushMsg(pid, { id: meta.fid + '_in', from: 'them', type: 'file_in', meta, pct: 0, time: now8() })
      },
      onFileProg(pid, fid, pct, bytes) { 
        setMsgs(p => ({ 
          ...p, 
          [pid]: (p[pid] || []).map(m => m.id === fid + '_in' ? { 
            ...m, 
            pct, 
            bytesSent: bytes,
            // Track speed over last 2 seconds
            speedHistory: [...(m.speedHistory || []).filter(h => Date.now() - h.t < 2000), { t: Date.now(), b: bytes }]
          } : m) 
        })) 
      },
      async onFileDone(pid, meta, blob, tmpPath) {
        // B6 FIX: Don't create standalone FileMsg for folder files or folder-pull files
        if (meta.folderFid !== undefined) return
        if (folderPullFidsRef.current.has(meta.fid)) {
          folderPullFidsRef.current.delete(meta.fid)
          return
        }
        // Extract final byte count if we were tracking it
        setMsgs(p => {
          const peersMsgs = p[pid] || []
          const inMsg = peersMsgs.find(m => m.id === meta.fid + '_in')
          if (inMsg) {
             inMsg.bytesSent = meta.size
             inMsg.speedHistory = [] // clear history on done
          }
          return p
        })
        let threats = []
        // A1/B10 FIX: use settRef.current instead of stale `sett` closure
        try { if (blob && settRef.current.scanFiles) threats = await detectThreats(blob, meta.name || '') } catch { }
        // Issue 2: Strip metadata on receive if enabled
        let finalBlob = blob
        if (blob && settRef.current.exifStripRecv && (IS_IMG.test(meta.name || '') || IS_PDF.test(meta.name || ''))) {
          try { finalBlob = await stripMetadata(blob, meta.name || '') } catch { finalBlob = blob }
        }
        setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === meta.fid + '_in' ? { ...m, type: 'file_done', pct: 1, blob: finalBlob, tmpPath, large: !!tmpPath, threats } : m) }))
        addLog('OK', `Received: ${meta.name}`, fmtSz(meta.size || 0) + (threats.length ? ` ⚠ ${threats.length} threat(s)` : ''))
        if (threats.length) notify(`⚠ Threats in ${meta.name}: ${threats[0]}`, 'err')
        else notify(`Received: ${meta.name}`, 'ok')
      },
      // ── Folder receive ───────────────────────────────────────────────────
      onFolderManifest(pid, manifest) {
        // Initialise folderData store
        folderDataRef.current[manifest.fid] = { name: manifest.name, files: [], expectedCount: manifest.totalFiles }
        // Create receive-progress message in chat
        pushMsg(pid, {
          id: 'fr_' + manifest.fid,
          from: 'them',
          type: 'folder_recv',
          folderFid: manifest.fid,
          name: manifest.name,
          totalFiles: manifest.totalFiles,
          totalBytes: manifest.totalBytes,
          receivedCount: 0,
          complete: false,
          time: now8(),
        })
        addLog('INFO', `Folder incoming: ${manifest.name}`, `${manifest.totalFiles} files`)
      },
      onFolderFileDone(pid, folderFid, fileIndex, meta, blob, tmpPath) {
        // Store file data keyed by index — blob or tmpPath depending on file size
        if (!folderDataRef.current[folderFid]) {
          // Single-file browse-pull: create lightweight entry
          folderDataRef.current[folderFid] = { name: meta.name, files: [], expectedCount: 1, isBrowsePull: true }
        }
        const fd = folderDataRef.current[folderFid]
        if (fd) {
          fd.files[fileIndex] = {
            relPath: meta.folderRelPath || meta.name,
            name: meta.name,
            size: meta.size,
            blob: blob || null,
            tmpPath: tmpPath || null,
          }
        }
        // Update the correct message type
        setMsgs(p => {
          const peerMsgs = p[pid] || []
          const hasRecvMsg = peerMsgs.some(m => m.id === 'fr_' + folderFid)
          if (hasRecvMsg) {
            // Pull-all path: update progress in the folder_recv card
            return {
              ...p, [pid]: peerMsgs.map(m =>
                m.id === 'fr_' + folderFid
                  ? {
                    ...m,
                    receivedCount: (m.receivedCount || 0) + 1,
                    bytesSent: (m.bytesSent || 0) + (meta.size || 0),
                    speedHistory: [...(m.speedHistory || []).filter(h => Date.now() - h.t < 2000), { t: Date.now(), b: (m.bytesSent || 0) + (meta.size || 0) }],
                    lastGotT: Date.now()
                  }
                  : m
              )
            }
          } else {
            // Single-file pull via browse card: show received file inline in the browse card
            return {
              ...p, [pid]: peerMsgs.map(m =>
                m.id === 'fb_' + folderFid
                  ? {
                    ...m,
                    status: 'available',  // reset status so user can pull more
                    receivedFiles: [
                      ...(m.receivedFiles || []).filter(f => f.name !== meta.name),
                      { relPath: meta.folderRelPath || meta.name, name: meta.name, size: meta.size, blob, tmpPath }
                    ]
                  }
                  : m
              )
            }
          }
        })
      },
      onFolderComplete(pid, fid, name, fileCount) {
        setMsgs(p => ({
          ...p, [pid]: (p[pid] || []).map(m =>
            m.id === 'fr_' + fid
              ? { ...m, complete: true, receivedCount: fileCount, speedHistory: [] }
              : m.id === 'fb_' + fid
                ? { ...m, status: 'done' }
                : m
          )
        }))
        addLog('OK', `Folder received: ${name}`, `${fileCount} files`)
        notify(`Folder received: ${name}`, 'ok')
      },
    })
    return () => bridgeRef.current?.destroy?.()
  }, [pushMsg, addLog, notify])

  // ── BUG-01 FIX: 8 missing action functions that were called in JSX but never defined ──

  // doSend — send chat message to selected peer
  const doSend = useCallback(async () => {
    if (!selPeer || !input.trim()) return
    const text = input.trim()
    setInput('')
    // Check if this peer has explicitly removed us before trying to send
    if (removedByPeersRef.current.has(selPeer.id)) {
      notify('❌ Cannot send — this peer has removed you from their list', 'err')
      setInput(text)  // restore the typed text so user doesn't lose it
      return
    }
    if (await bridgeRef.current?.sendMsg(selPeer.id, text)) {
      pushMsg(selPeer.id, { id: Date.now(), from: 'me', type: 'text', text, time: now8() })
    } else {
      // Peer is offline but didn't explicitly remove us — could be a crash/disconnect
      const wasRemoved = peersRef.current.find(p => p.id === selPeer.id)?.removedMe
      notify(wasRemoved
        ? '❌ Not delivered — this peer removed you from their list'
        : '⚠ Not delivered — peer appears to be offline or disconnected', 'err')
    }
  }, [selPeer, input, pushMsg, notify])

  // doSendFileInner — actual send logic (called directly or after danger confirmation)
  const doSendFileInner = useCallback(async (file) => {
    if (!selPeer) return
    // Use a single UUID as the fid for BOTH the UI message AND the wire transfer.
    // This ensures the revoke chain works: sender's message id (fid+'_out') strips '_out'
    // to get rawFid, receiver's message id (fid+'_in') matches on revoke receipt.
    const fid = crypto.randomUUID()
    pushMsg(selPeer.id, { id: fid + '_out', from: 'me', type: 'file_out', meta: { name: file.name, size: file.size }, pct: 0, time: now8() })
    addLog('INFO', `Sending: ${file.name}`, fmtSz(file.size))
    // EXIF strip: if enabled, strip metadata before sending
    let fileToSend = file
    if (settRef.current.exifStripSend && (IS_IMG.test(file.name) || IS_PDF.test(file.name))) {
      try {
        const stripped = await stripMetadata(file, file.name)
        fileToSend = new File([stripped], file.name, { type: file.type || stripped.type })
        addLog('INFO', `Metadata stripped: ${file.name}`)
      } catch { fileToSend = file }
    }
    const ok = await bridgeRef.current?.sendFile(selPeer.id, fileToSend, pct => {
      const bytesSent = Math.round((fileToSend.size || 0) * pct)
      const now = Date.now()
      setMsgs(p => ({
        ...p, [selPeer.id]: (p[selPeer.id] || []).map(m => {
          if (m.id !== fid + '_out') return m
          const hist = [...(m.speedHistory || []).filter(h => now - h.t < 2500), { t: now, b: bytesSent }]
          let calcSpeed = 0, calcEta = 0
          if (hist.length >= 2) {
            const dt = (hist[hist.length - 1].t - hist[0].t) / 1000
            if (dt > 0) {
              calcSpeed = (hist[hist.length - 1].b - hist[0].b) / dt
              const rem = (fileToSend.size || 0) - bytesSent
              calcEta = calcSpeed > 0 ? Math.round(rem / calcSpeed) : 0
            }
          }
          return { ...m, pct, bytesSent, speedHistory: hist, calcSpeed, calcEta }
        })
      }))
    }, fid, true)
    if (!ok) {
      notify(`Send failed: ${file.name}`, 'err')
      setMsgs(p => ({ ...p, [selPeer.id]: (p[selPeer.id] || []).filter(m => m.id !== fid + '_out') }))
    } else {
      notify(`Sent: ${file.name}`, 'ok')
    }
  }, [selPeer, pushMsg, addLog, notify])

  // doSendFile — read a File and send it to the selected peer
  const doSendFile = useCallback(async (file) => {
    if (!selPeer) return
    if (removedByPeersRef.current.has(selPeer.id)) {
      notify('❌ Cannot send file — this peer has removed you from their list', 'err')
      return
    }
    // v4.1: Block sending unsupported archive formats
    if (IS_UNSUPPORTED_ARCH.test(file.name)) {
      notify(`❌ .${file.name.split('.').pop()} is not supported — only ZIP and TAR archives can be sent`, 'err')
      return
    }
    // BUG 7 FIX: Reject bare .bz2, .gz, .xz files (not wrapped in .tar)
    if (IS_BARE_COMPRESSED.test(file.name)) {
      notify(`❌ Standalone .${file.name.split('.').pop()} files are not supported — use .tar.${file.name.split('.').pop()} or .zip instead`, 'err')
      return
    }
    // Issue 4: Warn before sending dangerous/executable files
    if (IS_DANGEROUS.test(file.name)) {
      setShowDangerConfirm(file)
      return
    }
    await doSendFileInner(file)
  }, [selPeer, notify])

  // doSendFolder — advertise a folder offer to the peer (browse+pull model)
  const doSendFolder = useCallback(async (files) => {
    if (!selPeer || !files.length) return
    const fid = 'fd_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const folderName = files[0].webkitRelativePath?.split('/')[0] || 'Folder'
    // Build tree for remote preview
    const tree = files.map((f, idx) => ({
      relPath: f.webkitRelativePath || f.name,
      name: f.name,
      size: f.size,
      index: idx,
    }))
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    // Store files in ref so we can send on pull-request
    sharedFoldersRef.current[fid] = { name: folderName, files: Array.from(files) }
    // Show offer card in our own chat
    pushMsg(selPeer.id, {
      id: 'fo_' + fid, from: 'me', type: 'folder_offer',
      name: folderName, fid, totalFiles: files.length, totalBytes,
      status: 'offered', time: now8(),
    })
    // Notify peer of the folder offer so they can browse structure
    await bridgeRef.current?.sendMsg(selPeer.id, {
      type: 'folder_offer', fid, name: folderName,
      totalFiles: files.length, totalBytes, tree,
    })
    addLog('INFO', `Folder offered: ${folderName}`, `${files.length} files, ${fmtSz(totalBytes)}`)
    notify(`Folder offered: ${folderName}`, 'ok')
  }, [selPeer, pushMsg, addLog, notify])

  // doPullFolder — receiver side: request files from sender's shared folder
  // fileIndex: null = pull all, number = pull single file
  // folderMeta: { name, totalFiles, totalBytes } from the browse card
  // asZip: true = auto-ZIP when done
  const doPullFolder = useCallback(async (peerId, fid, fileIndex, folderMeta, asZip) => {
    if (fileIndex === null) {
      // Pull all — create a folder_recv progress message so the receiver sees progress
      if (!folderDataRef.current[fid]) {
        folderDataRef.current[fid] = { name: folderMeta?.name || 'Folder', files: [], expectedCount: folderMeta?.totalFiles || 0 }
      }
      // Create the receiving progress card below the browse card
      setMsgs(p => {
        const pid_msgs = p[peerId] || []
        const alreadyHasRecv = pid_msgs.some(m => m.id === 'fr_' + fid)
        if (alreadyHasRecv) return p
        return {
          ...p, [peerId]: [...pid_msgs, {
            id: 'fr_' + fid, from: 'them', type: 'folder_recv',
            folderFid: fid, name: folderMeta?.name || 'Folder',
            totalFiles: folderMeta?.totalFiles || 0, totalBytes: folderMeta?.totalBytes || 0,
            receivedCount: 0, complete: false, pullAsZip: !!asZip, time: now8()
          }]
        }
      })
      // Mark browse card as pulling
      setMsgs(p => ({
        ...p, [peerId]: (p[peerId] || []).map(m =>
          m.id === 'fb_' + fid ? { ...m, status: 'pulling' } : m
        )
      }))
    } else {
      // Single file pull — mark browse card as pulling (briefly) and track in receivedFiles
      // The file will arrive via onFolderFileDone which updates receivedFiles in the browse msg
      setMsgs(p => ({
        ...p, [peerId]: (p[peerId] || []).map(m =>
          m.id === 'fb_' + fid ? { ...m, status: 'pulling' } : m
        )
      }))
    }
    await bridgeRef.current?.sendMsg(peerId, {
      type: 'folder_pull', fid,
      fileIndex: fileIndex != null ? fileIndex : null,
    })
  }, [pushMsg])

  // doExtract — gate for archive extraction (shows warning if warnArch is on)
  const doExtract = useCallback((msg) => {
    if (!msg.blob && !msg.tmpPath) { notify('File not in memory — save first', 'err'); return }
    if (sett.warnArch) {
      setShowArchConfirm(msg)
    } else {
      doExtractAction(msg)
    }
  }, [sett.warnArch])

  // doExtractAction — actually extract archive into sandboxed temp dir
  const doExtractAction = useCallback(async (msg) => {
    setShowArchConfirm(null)
    // Support both blob (small files) and tmpPath (large files >32MB)
    if (!msg.blob && !msg.tmpPath) { notify('File not loaded in memory', 'err'); return }
    setSandboxLoading(true)
    try {
      let result
      if (msg.tmpPath) {
        // Large file: use path-based extraction to avoid memory spike
        result = await window.ftps?.extractArchiveFromPath(msg.meta?.name || 'archive', msg.tmpPath)
      } else {
        const r = new FileReader()
        const b64 = await new Promise((res, rej) => {
          r.onload = () => res(r.result.split(',')[1])
          r.onerror = rej
          r.readAsDataURL(msg.blob)
        })
        result = await window.ftps?.extractArchive(msg.meta?.name || 'archive', b64)
      }
      setSandboxLoading(false)
      if (result?.ok) {
        setSandbox({ name: msg.meta?.name, sandboxDir: result.sandboxDir, sandboxId: result.sandboxId, tree: result.tree })
        addLog('OK', `Archive extracted: ${msg.meta?.name}`, result.sandboxDir)
        notify('Archive ready in sandbox', 'ok')
      } else if (result?.passwordProtected) {
        notify('🔐 Archive is password-protected — cannot extract', 'err')
        addLog('WARN', 'Password-protected archive', msg.meta?.name)
      } else {
        notify('Extract failed: ' + (result?.error || 'Install 7-Zip for full format support'), 'err')
        addLog('ERR', 'Extract failed', result?.error || '')
      }
    } catch (e) {
      setSandboxLoading(false)
      notify('Extract error: ' + e.message, 'err')
      addLog('ERR', 'Extract error', e.message)
    }
  }, [addLog, notify])

  // CHANGE 3: doRevoke — fix targetId mismatch + cancel mid-send
  const doRevoke = useCallback(async (msgOrId) => {
    if (!selPeer) return
    const targetMsgId = typeof msgOrId === 'string' ? msgOrId : msgOrId?.id
    if (!targetMsgId) return
    const rawFid = targetMsgId.endsWith('_out') ? targetMsgId.slice(0, -4) : targetMsgId
    // If still sending (pct < 1), cancel the transfer first
    const currentMsg = (msgs[selPeer.id] || []).find(m => m.id === targetMsgId)
    if (currentMsg && currentMsg.pct !== undefined && currentMsg.pct < 1) {
      await window.ftps?.cancelSend(selPeer.id, rawFid)
    }
    setMsgs(p => ({
      ...p, [selPeer.id]: (p[selPeer.id] || []).map(m =>
        m.id === targetMsgId ? { ...m, blob: null, tmpPath: null, type: 'revoked', revokedAt: new Date().toLocaleTimeString() } : m
      )
    }))
    await bridgeRef.current?.sendMsg(selPeer.id, { type: 'revoke', fid: rawFid })
    notify('File access revoked', 'ok')
    addLog('INFO', 'File revoked', rawFid)
  }, [selPeer, msgs, addLog, notify])

  // doDeletePeer — disconnect and remove a peer from the list
  // B2 FIX: Notify the other side before disconnecting
  // FIX #7: Clear chat history and removedByPeers flag on peer remove so re-add starts fresh
  const doDeletePeer = useCallback((peerId) => {
    setShowRemoveConfirm(null)
    // B2 FIX: Send removal notification before disconnecting
    bridgeRef.current?.sendMsg(peerId, { type: 'peer_removed' })
    // Small delay to allow message to send before disconnect
    setTimeout(() => {
      bridgeRef.current?.disconnect(peerId)
      setPeers(ps => ps.filter(p => p.id !== peerId))
      // FIX #7: Always clear chat history on remove so re-adding shows a clean slate
      setMsgs(p => { const n = { ...p }; delete n[peerId]; return n })
      // FIX #7: Clear the removedByPeers flag so if this peer re-connects we don't
      // show "🚫 This peer removed you" — we removed THEM, not the other way around
      removedByPeersRef.current.delete(peerId)
      if (selPeer?.id === peerId) setSelPeer(null)
      addLog('INFO', 'Peer removed', peerId)
      notify('Peer removed', 'ok')
    }, 100)
  }, [selPeer, addLog, notify])

  // B4/C1: doBlockPeer — block a peer and disconnect
  const doBlockPeer = useCallback(async (peerId, peerName) => {
    // FIX 4/7: Save full peer state BEFORE removing from UI — restores on unblock
    setMsgs(currentMsgs => {
      blockedPeerStateRef.current[peerId] = {
        name: peerName,
        msgs: currentMsgs[peerId] || [],
        blockedAt: new Date().toISOString(),
        // Also save peer identity info for re-connection TOFU
        identityKey: peerIdentityKeys[peerId] || null,
        fingerprint: peerFingerprints[peerId] || null,
      }
      return currentMsgs
    })
    await window.ftps?.blockPeer(peerId, peerName, 'Manually blocked')
    bridgeRef.current?.disconnect(peerId)
    // FIX 4: Completely remove blocked peer from UI — they are INVISIBLE until unblocked
    // Only reachable via Settings > Blocked Peers
    setPeers(ps => ps.filter(p => p.id !== peerId))
    setMsgs(p => { const n = { ...p }; delete n[peerId]; return n })
    if (selPeer?.id === peerId) setSelPeer(null)
    setBlockedPeers(prev => [...prev.filter(b => b.id !== peerId), { id: peerId, name: peerName, blockedAt: new Date().toISOString() }])
    addLog('INFO', `Blocked peer: ${peerName || peerId}`)
    notify(`${peerName || 'Peer'} blocked — unblock in Settings to restore chat`, 'ok')
  }, [selPeer, addLog, notify])

  // ── END BUG-01 FIX ──────────────────────────────────────────────────────────

  const onlinePeers = peers.filter(p => p.online)
  const peerMsgs = msgs[selPeer?.id] || []
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [peerMsgs.length])

  // ── ACTIONS ──────────────────────────────────────────────────────────────────
  const doSetup = async () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.passphrase.trim()) e.passphrase = 'Required'
    const pw = form.password
    if (!pw || pw.length < 6) e.password = 'Min 6 chars'
    else if (!/[A-Z]/.test(pw)) e.password = 'Needs uppercase'
    else if (!/[a-z]/.test(pw)) e.password = 'Needs lowercase'
    else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) e.password = 'Needs special char'
    if (Object.keys(e).length) { setFErr(e); return }
    // BUG-09 fix: keyRef/generateKeyPair removed — all crypto is in main.js
    myId.current = makeId(form.name)
    const res = await window.ftps?.setIdentity(form.name.trim(), myId.current)
    if (res?.nodeId) myId.current = res.nodeId
    if (res?.identityKey) myIdentityKeyRef.current = res.identityKey  // self-connection guard
    setAccount(form); lastAct.current = Date.now(); setLockTimer(sett.lockMin * 60)
    // FIX: save session to sessionStorage so Refresh UI can restore without re-setup
    saveSession(form, myId.current)
    addLog('OK', `Session started: ${form.name}`)
    setScreen('main'); notify('Session ready', 'ok')
    // FIX: main process auto-starts TCP server + Tor on identity set.
    // Listen for the one-time auto-listen event and update UI state.
    const unsubAutoListen = window.ftps?.on('ftps:listen-auto', d => {
      if (d?.ok) {
        setListenActive(true)
        setListenInfo({ port: d.port, localIPs: d.localIPs })
        addLog('OK', `TCP server auto-started on port ${d.port}`)
      }
      unsubAutoListen?.()
    })
  }

  const doUnlock = () => {
    if (lockForm.pp === account.passphrase && lockForm.pw === account.password) {
      setScreen('main'); setLockErr(''); setLockTries(0); setLockForm({ pp: '', pw: '' }); lastAct.current = Date.now()
      addLog('OK', 'Session unlocked')
    } else {
      const t = lockTries + 1; setLockTries(t); addLog('WARN', `Failed unlock attempt ${t}`)
      if (t >= sett.maxTries) {
        addLog('ERR', 'Max attempts — FULL WIPE initiated')
        // Edit 8: Full wipe — EVERYTHING cleared, no stale peers/data visible
        window.ftps?.fullWipe?.()   // wipe backend state immediately
        window.ftps?.stopTor()
        clearSavedSession()
        sessionStorage.clear()      // wipe any other session storage
        // Reset ALL frontend state to factory-clean
        setAccount(null); setScreen('setup')
        setMsgs({}); setPeers([])
        setForm({ name: '', passphrase: '', password: '' })
        setLockForm({ pp: '', pw: '' }); setLockTries(0); setLockErr('')
        setTorStatus('off'); setOnionAddr(''); setTorError(''); setTorBootstrap(0); setTorBootstrapMsg('Initializing…')
        setListenActive(false); setListenInfo(null)
        setDiscoveredPeers([]); setPeerFingerprints({}); setPeerIdentityKeys({})
        setVerifiedPeers(new Set()); setSysStats(null); setLogs([])
        setSelPeer(null); setTab('connect'); setInput('')
        setPendingPeerRequests([]); setSentPeerRequests(new Set())
        setBlockedPeers([])
        setConnState('idle'); setConnErr(''); setConnectAddr('')
        setTorConnState('idle'); setTorConnErr(''); setOnionInput('')
        setSett2Raw({ ...DEFAULT_SETTINGS })
        folderDataRef.current = {}; sharedFoldersRef.current = {}
        removedByPeersRef.current.clear(); folderPullFidsRef.current.clear()
        myIdentityKeyRef.current = ''; myOnionAddrRef.current = ''
        peerIdentityKeysRef.current = {}
        if (window.__p2nIkRef) window.__p2nIkRef = {}
      } else setLockErr(`Wrong · ${sett.maxTries - t} attempt${sett.maxTries - t !== 1 ? 's' : ''} left`)
    }
  }

  const doLock = () => { setScreen('locked'); setLockForm({ pp: '', pw: '' }); addLog('INFO', 'Session locked') }
  // doTerminate — complete session wipe, ALL state reset to clean slate
  const doTerminate = () => {
    // Edit 9: Immediately wipe ALL state — nothing lingers after session end
    clearSavedSession()
    sessionStorage.clear()          // wipe all sessionStorage
    window.ftps?.fullWipe?.()       // wipe backend in-memory state immediately
    window.ftps?.stopTor()
    addLog('INFO', 'Session ended — all data wiped')
    // Reset ALL frontend state
    setAccount(null); setScreen('setup'); setMsgs({}); setPeers([])
    setForm({ name: '', passphrase: '', password: '' })
    setLockForm({ pp: '', pw: '' }); setLockErr(''); setLockTries(0)
    setConnState('idle'); setConnErr(''); setConnectAddr('')
    setTorConnState('idle'); setTorConnErr(''); setOnionInput('')
    setTorStatus('off'); setOnionAddr(''); setTorError(''); setTorBootstrap(0); setTorBootstrapMsg('Initializing…')
    setListenActive(false); setListenInfo(null)
    setDiscoveredPeers([]); setPeerFingerprints({}); setPeerIdentityKeys({})
    setVerifiedPeers(new Set()); setSysStats(null); setLogs([])
    setSelPeer(null); setTab('connect'); setInput('')
    setPendingPeerRequests([]); setSentPeerRequests(new Set())
    setBlockedPeers([])
    setSett2Raw({ ...DEFAULT_SETTINGS })
    folderDataRef.current = {}; sharedFoldersRef.current = {}
    removedByPeersRef.current.clear(); folderPullFidsRef.current.clear()
    myIdentityKeyRef.current = ''; myOnionAddrRef.current = ''
    peerIdentityKeysRef.current = {}
    if (window.__p2nIkRef) window.__p2nIkRef = {}
    window.ftps?.getPort?.().then(r => { if (r?.port) setListenPort(String(r.port)) }).catch(() => { })
  }

  const doListen = async () => {
    // A10 FIX: Removed dead second argument
    const r = await window.ftps?.listen(parseInt(listenPort) || 0)
    if (!r) { notify('Electron API unavailable', 'err'); return }
    if (r.ok) { setListenActive(true); setListenInfo({ port: r.port, localIPs: r.localIPs }); addLog('OK', `TCP server port ${r.port}`); notify(`Listening on :${r.port}`, 'ok') }
    else { notify('Listen failed: ' + r.error, 'err') }
  }

  const doStopListen = async () => {
    const r = await window.ftps?.stopListen()
    if (r?.ok) { setListenActive(false); setListenInfo(null); notify('Stopped listening', 'ok'); addLog('OK', 'TCP server stopped') }
  }

  const doConnect = async () => {
    const t = connectAddr.trim(); if (!t) { notify('Enter IP:port', 'err'); return }
    const parts = t.split(':'); if (parts.length < 2 || !parts[0] || !parts[1]) { notify('Format: 192.168.x.x:7900', 'err'); return }
    const targetHost = parts[0].trim(), targetPort = parseInt(parts[1])
    // Self-connection guard: check if target matches any of our own local IPs + port
    if (listenInfo) {
      const myPort = listenInfo.port
      const myIPs = (listenInfo.localIPs || []).map(i => i.address)
      const selfIPs = [...myIPs, '127.0.0.1', 'localhost', '::1']
      if (selfIPs.includes(targetHost) && targetPort === myPort) {
        notify('⚠ That is your own address — cannot connect to yourself', 'err')
        addLog('WARN', 'Self-connect blocked (direct)')
        return
      }
    }
    setConnState('connecting'); setConnErr('')
    const r = await window.ftps?.connect(targetHost, String(targetPort))
    if (!r) { notify('Electron API unavailable', 'err'); setConnState('idle'); return }
    if (r.ok) {
      setConnState('done')
      notify('Request sent — waiting for approval…', 'ok')
      // Edit 5: Navigate to requests tab so sender sees their pending request
      setTab('requests')
    }
    else { setConnState('error'); setConnErr(r.error || 'Failed'); addLog('ERR', 'Connect failed', r.error || ''); notify('Failed: ' + (r.error || ''), 'err') }
  }

  // ── Tor functions ─────────────────────────────────────────────────────
  const doStartTor = async () => {
    // If not listening yet, auto-start listening on the default port
    if (!listenInfo) {
      addLog('INFO', 'Auto-starting listener for Tor…')
      // A10 FIX: Removed dead second argument
      const lr = await window.ftps?.listen(parseInt(listenPort) || 7000)
      if (!lr) { notify('Electron API unavailable', 'err'); return }
      if (!lr.ok) { notify('Listen failed: ' + lr.error, 'err'); return }
      setListenActive(true); setListenInfo({ port: lr.port, localIPs: lr.localIPs })
      addLog('OK', `TCP server port ${lr.port}`)
      // FIX: listen() in main.js already auto-starts Tor when torEnabled.
      // Calling startTor again caused "Already running" errors.
      // Now startTor returns ok:true if Tor is already starting — handle gracefully.
      setTorStatus('starting'); setTorError(''); addLog('INFO', 'Starting Tor daemon…')
      const r = await window.ftps?.startTor(lr.port)
      if (r?.ok) {
        if (r.onionAddress) {
          setTorStatus('running'); setOnionAddr(r.onionAddress + ':' + r.port)
          addLog('OK', `Tor hidden service: ${r.onionAddress}`); notify('Onion link ready!', 'ok')
        } else {
          // Tor is still bootstrapping — ftps:tor-status events will update the UI
          addLog('INFO', 'Tor is bootstrapping — waiting for onion address…')
        }
      } else {
        setTorStatus('error'); setTorError(r?.error || 'Unknown error')
        addLog('ERR', 'Tor failed: ' + (r?.error || 'Unknown')); notify('Tor failed: ' + (r?.error || 'Unknown'), 'err')
      }
      return
    }
    setTorStatus('starting'); setTorError(''); addLog('INFO', 'Starting Tor daemon…')
    const r = await window.ftps?.startTor(listenInfo.port)
    if (r?.ok) {
      if (r.onionAddress) {
        setTorStatus('running'); setOnionAddr(r.onionAddress + ':' + r.port)
        addLog('OK', `Tor hidden service: ${r.onionAddress}`); notify('Onion link ready!', 'ok')
      } else {
        // Tor bootstrapping — ftps:tor-status events will update the UI
        addLog('INFO', 'Tor is bootstrapping — waiting for onion address…')
      }
    } else {
      setTorStatus('error'); setTorError(r?.error || 'Unknown error')
      addLog('ERR', 'Tor failed: ' + (r?.error || 'Unknown')); notify('Tor failed: ' + (r?.error || 'Unknown'), 'err')
    }
  }

  const doStopTor = async () => {
    const r = await window.ftps?.stopTor()
    if (r?.ok) { setTorStatus('off'); setOnionAddr(''); setTorError(''); addLog('OK', 'Tor daemon stopped'); notify('Tor stopped', 'ok') }
  }

  const doConnectOnion = async () => {
    const addr = onionInput.trim(); if (!addr) { notify('Enter .onion address', 'err'); return }
    const parts = addr.split(':')
    if (!parts[0].endsWith('.onion')) { notify('Address must end in .onion', 'err'); return }
    if (parts[0].length < 16) { notify('Invalid .onion address (too short)', 'err'); return }
    const port = parseInt(parts[1])
    if (!parts[1] || isNaN(port) || port < 1 || port > 65535) { notify('Invalid port — format: xxxx.onion:7900', 'err'); return }
    // Self-connection guard: compare against our own onion address
    if (myOnionAddrRef.current && parts[0] === myOnionAddrRef.current) {
      notify('⚠ That is your own onion address — cannot connect to yourself', 'err')
      addLog('WARN', 'Self-connect blocked (Tor)')
      return
    }
    setTorConnState('connecting'); setTorConnErr('')
    addLog('INFO', `Connecting via Tor to ${addr}`)
    const r = await window.ftps?.connectOnion(parts[0], port)
    if (!r) { notify('Electron API unavailable', 'err'); setTorConnState('idle'); return }
    if (r.ok) {
      setTorConnState('done')
      notify('Tor request sent — waiting for approval…', 'ok')
      // Edit 5: Navigate to requests tab
      setTab('requests')
    }
    else { setTorConnState('error'); setTorConnErr(r.error || 'Failed'); notify('Tor connect failed: ' + (r.error || ''), 'err') }
  }

  // ── RESTORING (Refresh UI in progress) ────────────────────────────────────
  if (screen === 'restoring') return (
    <div style={{ height: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{G}</style>
      <div style={{ textAlign: 'center' }} className="fadein">
        <div style={{ width: 50, height: 50, borderRadius: 13, background: T.accent + '16', border: `1px solid ${T.accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px' }}>🔐</div>
        <div style={{ fontSize: 18, color: T.text, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>P2N</div>
        <div style={{ fontSize: 11, color: T.accent, marginBottom: 16 }}>Peer-Networking</div>
        <div className="spin" style={{ width: 24, height: 24, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', margin: '0 auto 10px' }} />
        <div style={{ fontSize: 12, color: T.textDim }}>Restoring session…</div>
        <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Peer connections are unaffected</div>
      </div>
    </div>
  )

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (screen === 'setup') return (
    <div style={{ height: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{G}</style><Toast n={toast} />
      <div style={{ width: '100%', maxWidth: 390 }} className="fadeup">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 26, color: T.text, fontWeight: 800, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>P2N(Peer-Networking) <span style={{ fontSize: 28 }}>🔐</span></div>
          <div style={{ fontSize: 10, color: T.textDim, marginTop: 5, display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Direct TCP', 'ECDH P-256', 'Ed25519', 'AES-256-GCM', 'Tor', 'TOFU'].map(b => (
              <span key={b} style={{ background: T.panel, border: `1px solid ${T.accent}22`, borderRadius: 4, padding: '2px 7px', color: T.textDim }}>{b}</span>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div className="sh">New Session</div>
          {[{ k: 'name', l: 'Display Name', type: 'text', ph: 'Your alias' }, { k: 'passphrase', l: 'Passphrase (to unlock)', type: 'text', ph: 'Memorable phrase', extra: <button onClick={() => setForm(p => ({ ...p, passphrase: phrase() }))} className="btn btn-ghost btn-xs" title="Generate random passphrase">🎲</button> }, { k: 'password', l: 'Password (A-Z + special)', type: 'password', ph: 'Second factor' }].map(f => (
            <div key={f.k} style={{ marginBottom: 13 }}>
              <div style={{ fontSize: 11, marginBottom: 4, display: 'flex', justifyContent: 'space-between', color: fErr[f.k] ? T.red : T.textDim }}><span>{f.l}</span>{fErr[f.k] && <span style={{ color: T.red, fontSize: 10 }}>{fErr[f.k]}</span>}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form[f.k]} type={f.type} placeholder={f.ph} className={`inp${fErr[f.k] ? ' err' : ''}`}
                  onChange={e => { setForm(p => ({ ...p, [f.k]: e.target.value })); setFErr(p => ({ ...p, [f.k]: '' })) }}
                  onKeyDown={e => e.key === 'Enter' && doSetup()} style={{ flex: 1 }} />
                {f.extra}
              </div>
            </div>
          ))}
          <div style={{ background: T.panel, borderRadius: 6, padding: '9px 12px', marginBottom: 15, fontSize: 11, lineHeight: 1.8 }}>
            <div style={{ color: T.textDim }}>🔒 Auto-locks after {sett.lockMin} min inactivity</div>
            <div style={{ color: T.amber }}>⚠ {sett.maxTries} wrong unlock attempts = session reset</div>
          </div>
          <button onClick={doSetup} className="btn btn-primary" style={{ width: '100%', padding: 11, fontSize: 13, marginBottom: 7 }}>Start Session →</button>
          <button onClick={() => setShowHelp(true)} className="btn btn-ghost" style={{ width: '100%', padding: 9, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>📖</span> Help &amp; Documentation
          </button>
        </div>
      </div>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )



  // ── LOCK ──────────────────────────────────────────────────────────────────
  if (screen === 'locked') return (
    <div style={{ height: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{G}</style><Toast n={toast} />
      <div style={{ width: '100%', maxWidth: 330 }} className="fadeup">
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span>Session Locked</span>
            <span style={{ fontSize: 26, animation: 'lockpulse 2s ease-in-out infinite', display: 'inline-block' }}>🔒</span>
          </div>
          {lockTries > 0 && <div style={{ fontSize: 13, color: lockTries >= 3 ? T.red : T.amber, marginTop: 8, fontWeight: 600 }}>{lockTries} failed · {sett.maxTries - lockTries} left</div>}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 13 }}><div style={{ fontSize: 12, color: T.textMid, marginBottom: 5, fontWeight: 500 }}>Passphrase</div><input type="password" value={lockForm.pp} placeholder="Enter your passphrase" className="inp" style={{ fontSize: 13 }} onChange={e => setLockForm(p => ({ ...p, pp: e.target.value }))} onKeyDown={e => e.key === 'Enter' && doUnlock()} /></div>
          <div style={{ marginBottom: 15 }}><div style={{ fontSize: 12, color: T.textMid, marginBottom: 5, fontWeight: 500 }}>Password</div><input type="password" value={lockForm.pw} placeholder="Enter your password" className="inp" style={{ fontSize: 13 }} onChange={e => setLockForm(p => ({ ...p, pw: e.target.value }))} onKeyDown={e => e.key === 'Enter' && doUnlock()} /></div>
          {lockErr && <div style={{ fontSize: 12, color: T.red, marginBottom: 11, fontWeight: 600 }}>{lockErr}</div>}
          <button onClick={doUnlock} className="btn btn-amber" style={{ width: '100%', padding: 12, fontSize: 14, fontWeight: 700 }}>🔓 Unlock</button>
        </div>
      </div>
    </div>
  )

  // ── MAIN ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg }}>
      <style>{G}</style>
      <Toast n={toast} />
      {folderView && <FolderViewer folder={folderView} onClose={() => setFolderView(null)} />}
      {fileView && <FileViewer file={fileView} onClose={() => setFileView(null)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {zipView && <ZipViewer msg={zipView} onClose={() => setZipView(null)} onOSSandbox={m => { setZipView(null); setOsSandbox(m) }} />}
      {osSandbox && <OSSandbox file={osSandbox} onClose={() => setOsSandbox(null)} />}
      {showCode && selPeer && <CodeEditor onSend={async t => { if (!selPeer) return; if (await bridgeRef.current?.sendMsg(selPeer.id, t)) pushMsg(selPeer.id, { id: Date.now(), from: 'me', type: 'text', isCode: true, text: t, time: now8() }) }} onClose={() => setShowCode(false)} />}
      {showCloseConfirm && <CloseConfirm onCancel={() => setShowCloseConfirm(false)} onTerminate={doTerminate} />}
      {showVerify && <VerifyModal fingerprint={showVerify.fingerprint} peerName={showVerify.peerName} onClose={() => setShowVerify(null)} onVerified={() => { if (selPeer) setVerifiedPeers(s => { const n = new Set(s); n.add(selPeer.id); return n }) }} />}
      {showTofuWarn && <TofuWarning data={showTofuWarn} onReject={() => { bridgeRef.current?.disconnect(showTofuWarn.peerId); setShowTofuWarn(null); notify('Disconnected — key mismatch', 'err') }} onAccept={() => {
        window.ftps?.tofuAccept(showTofuWarn.peerId, peerIdentityKeys[showTofuWarn.peerId] || null, showTofuWarn.peerName)
        setShowTofuWarn(null); notify('New identity accepted — peer trusted', 'ok')
      }} />}
      {showLinkConfirm && <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 320, padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Open External Link?</div>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 18, lineHeight: 1.5, wordBreak: 'break-all' }}>This will open your browser to:<br /><span style={{ color: T.accent, fontWeight: 600 }}>{showLinkConfirm}</span></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowLinkConfirm(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={() => { window.ftps?.openExternal(showLinkConfirm); setShowLinkConfirm(null) }} className="btn btn-primary" style={{ flex: 1 }}>Open</button>
        </div>
      </div></div>}
      {showArchConfirm && <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 340, padding: 22, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Sandbox Archive?</div>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 18, lineHeight: 1.6 }}>This will extract the file to an isolated <strong>Sandbox</strong>. You should scan the contents for threats before opening any files.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowArchConfirm(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={() => doExtractAction(showArchConfirm)} className="btn btn-amber" style={{ flex: 1 }}>Extract to Sandbox</button>
        </div>
      </div></div>}
      {/* Issue 4: Executable file send warning */}
      {showDangerConfirm && <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 380, padding: 22, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: T.red }}>Send Executable File?</div>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10, lineHeight: 1.6 }}>You are about to send an <strong style={{ color: T.amber }}>executable file</strong>:</div>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 10, padding: '6px 10px', background: T.panel, borderRadius: 6, border: `1px solid ${T.red}30`, wordBreak: 'break-all' }}>{showDangerConfirm.name}</div>
        <div style={{ fontSize: 11, color: T.amber, marginBottom: 18, lineHeight: 1.6 }}>⚠ Executable files (.exe, .dll, .msi, .bat, etc.) can be dangerous. The receiver will see a security warning. Only send executables you trust.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowDangerConfirm(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={async () => { const f = showDangerConfirm; setShowDangerConfirm(null); await doSendFileInner(f) }} className="btn btn-danger" style={{ flex: 1 }}>⚠ Send Anyway</button>
        </div>
      </div></div>}
      {/* Peer remove confirm — with immediate disconnect note */}
      {/* CHANGE 7a: Clarify remove is one-sided */}
      {showRemoveConfirm && <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 340, padding: 22, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔌</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Remove {showRemoveConfirm.peerName || 'Peer'}?</div>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10, lineHeight: 1.6 }}>This will <strong style={{ color: T.red }}>remove this peer from your list</strong> and close the connection on your side.</div>
        <div style={{ fontSize: 11, color: T.amber, marginBottom: 18, lineHeight: 1.5 }}>⚠ <strong>They will NOT be notified</strong> — on their screen, you will appear as disconnected but they will still see you in their peer list until they remove you or restart.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowRemoveConfirm(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={() => doDeletePeer(showRemoveConfirm.peerId)} className="btn btn-danger" style={{ flex: 1 }}>Remove from My List</button>
        </div>
      </div></div>}
      {/* B7 FIX: Rename modal — broadcasts name update instead of disconnecting */}
      {showRenameConfirm && <div className="overlay" style={{ zIndex: 600 }}><div className="card fadeup" style={{ width: 380, padding: 22, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✎</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Rename</div>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 14, lineHeight: 1.6, textAlign: 'left' }}>Your new name <strong style={{ color: T.accent }}>{showRenameConfirm}</strong> will be broadcast to all connected peers. No disconnection required.</div>
        <div style={{ fontSize: 11, color: renameCountThisSession >= 2 ? T.amber : T.muted, marginBottom: 18, padding: '5px 10px', background: T.panel, borderRadius: 5 }}>
          ✎ {renameCountThisSession} / 3 renames used this session
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowRenameConfirm(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={async () => {
            const n = showRenameConfirm
            // FIX #3: Use updateName (NOT setIdentity) — avoids TCP server restart and peer disconnect.
            // Main.js updateName broadcasts peer_rename to all connected peers automatically.
            const res = await window.ftps?.updateName?.(n)
            if (res?.limitReached) {
              notify(`Rename limit (${res.renameLimit || 3}/session) reached`, 'err')
              setShowRenameConfirm(null)
              return
            }
            if (res?.renameCount) setRenameCountThisSession(res.renameCount)
            setAccount(a => ({ ...a, name: n }))
            saveSession({ ...account, name: n }, myId.current)
            setEditName(false); setShowRenameConfirm(null)
            notify('Name updated — peers notified', 'ok')
          }} className="btn btn-green" style={{ flex: 1 }}>Rename</button>
        </div>
      </div></div>}
      {sandboxLoading && <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div className="spin" style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />
        <div style={{ color: T.textDim, fontSize: 13 }}>Extracting archive…</div>
      </div>}

      <TitleBar account={account} nodeId={myId.current} onlinePeers={onlinePeers.length} listenActive={listenActive} onLock={doLock} onTerminate={() => setShowCloseConfirm(true)} uptime={uptime} onHelp={() => setTab('docs')} lockTimer={lockTimer} lockMin={sett.lockMin} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── SIDEBAR ── */}
        <div style={{ width: 158, background: T.surface, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '6px 5px' }}>
          {/* User */}
          <div className="glass" style={{ padding: '10px 10px', marginBottom: 10, borderRadius: 10 }}>
            {editName ? (
              <div>
                <input value={nameInput} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      const n = nameInput.trim()
                      if (n && n !== account?.name) {
                        // FIX #3: updateName only — no setIdentity, no disconnect
                        const res = await window.ftps?.updateName?.(n)
                        if (res?.limitReached) {
                          notify(`Rename limit (${res.renameLimit || 3}/session) reached`, 'err')
                          setEditName(false); return
                        }
                        if (res?.renameCount) setRenameCountThisSession(res.renameCount)
                        setAccount(a => ({ ...a, name: n }))
                        saveSession({ ...account, name: n }, myId.current)
                        addLog('INFO', `Name changed: ${account?.name} → ${n}`)
                        notify('Name updated — peers notified', 'ok')
                      }
                      setEditName(false)
                    }
                    if (e.key === 'Escape') setEditName(false)
                  }}
                  className="inp" style={{ fontSize: 11, padding: '4px 7px', marginBottom: 4 }} autoFocus />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={async () => {
                    const n = nameInput.trim()
                    if (n && n !== account?.name) {
                      // FIX #3: updateName only — no setIdentity, no disconnect
                      const res = await window.ftps?.updateName?.(n)
                      if (res?.limitReached) {
                        notify(`Rename limit (${res.renameLimit || 3}/session) reached`, 'err')
                        setEditName(false); return
                      }
                      setAccount(a => ({ ...a, name: n }))
                      saveSession({ ...account, name: n }, myId.current)
                      addLog('INFO', `Name changed: ${account?.name} → ${n}`)
                      notify('Name updated — peers notified', 'ok')
                    }
                    setEditName(false)
                  }} className="btn btn-green btn-xs" style={{ flex: 1 }}>✓</button>
                  <button onClick={() => setEditName(false)} className="btn btn-ghost btn-xs" style={{ flex: 1 }}>✕</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Av name={account?.name} id={myId.current} size={26} online />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account?.name}</div>
                  <div style={{ fontSize: 9, color: T.muted }}>{myId.current}</div>
                </div>
                <button onClick={() => { setNameInput(account?.name || ''); setEditName(true) }} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 10, cursor: 'pointer', padding: 2, flexShrink: 0 }}>✎</button>
              </div>
            )}
          </div>

          {/* Nav items */}
          {[
            { id: 'connect', icon: '⊕', label: 'Connect' },
            { id: 'peers', icon: '◉', label: 'Network' },
            { id: 'requests', icon: '📬', label: 'Requests', badge: pendingPeerRequests.length + rejectedRequests.filter(r => r.expiresAt > Date.now()).length },
            { id: 'logs', icon: '📋', label: 'Logs', badge: tab !== 'logs' ? unreadLogs : 0 },
            { id: 'network', icon: '⬡', label: 'My Network' },
            { id: 'stats', icon: '▲', label: 'Stats' },
            { id: 'settings', icon: '⚙', label: 'Settings' },
            { id: 'docs', icon: '📖', label: 'Docs' },
          ].map(it => (
            <button key={it.id} onClick={() => {
              setTab(it.id)
              // Never clear selPeer on tab switch — peer stays selected so chat is preserved
              if (it.id === 'logs') { setUnreadLogs(0) }
              else if (it.id !== 'logs') setLogSearch('')
            }} className={`nav-item${tab === it.id ? ' act' : ''}`}>
              <span style={{ width: 17, textAlign: 'center', fontSize: 13, flexShrink: 0 }}>{it.icon}</span>
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge > 0 && <span style={{ fontSize: 9, background: T.red, color: '#fff', borderRadius: 8, padding: '1px 4px', fontWeight: 700 }}>{it.badge}</span>}
            </button>
          ))}

          {/* Peer quick-list */}
          {peers.length > 0 && <div style={{ marginTop: 9, borderTop: `1px solid ${T.border}`, paddingTop: 7 }}>
            <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, fontWeight: 600, padding: '0 6px', marginBottom: 3 }}>PEERS</div>
            {peers.map(p => {
              const pMsgs = msgs[p.id] || []
              const lastMsg = pMsgs[pMsgs.length - 1]
              const hasUnread = selPeer?.id !== p.id && lastMsg && lastMsg.from !== 'me' && lastMsg.from !== 'sys'
              return (
                <button key={p.id} onClick={() => { setSelPeer(p); setTab('peers') }} className={`nav-item${selPeer?.id === p.id ? ' act' : ''}`} style={{ gap: 6 }}>
                  <Av name={p.name} id={p.id} size={20} online={p.online} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: p.online ? T.text : T.textDim, flex: 1 }}>{p.name || p.id.slice(0, 8)}</span>
                  {hasUnread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, flexShrink: 0 }} />}
                  {p.reconnecting && <span style={{ fontSize: 9, color: T.amber }}>⟳</span>}
                </button>
              )
            })}
          </div>}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 10, color: T.muted, textAlign: 'center', padding: '5px 0', fontVariantNumeric: 'tabular-nums' }}>{fmt(uptime)}</div>
        </div>

        {/* ── CONTENT AREA (tabs + optional sandbox panel) ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* TAB CONTENT */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* ── CONNECT ── */}
            {tab === 'connect' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">
                <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, marginBottom: 16, marginLeft: 4 }}>⊕ CONNECT PEER</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {/* SAME WIFI */}
                  <div className="card glass glow-blue" style={{ padding: 16 }}>
                    <div style={{ fontSize: 10, color: T.blue, letterSpacing: 1.5, marginBottom: 11, fontWeight: 700 }}>① SAME NETWORK</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 11, color: T.textDim }}>Port</div>
                      <button onClick={() => setTab('settings')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 10, cursor: 'pointer' }}>⚙ Change in Settings</button>
                    </div>
                    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 10px', marginBottom: 9, fontSize: 13, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{listenPort}</div>
                    {!listenActive
                      ? <button onClick={doListen} className="btn btn-blue" style={{ width: '100%', padding: 9 }}>▶ Start Listening</button>
                      : <button onClick={doStopListen} className="btn btn-danger" style={{ width: '100%', padding: 9 }}>■ Stop</button>}
                    {listenActive && listenInfo && <div style={{ marginTop: 9, background: T.green + '08', border: `1px solid ${T.green}20`, borderRadius: 6, padding: 9 }}>
                      <div style={{ fontSize: 9, color: T.green, fontWeight: 700, marginBottom: 7, letterSpacing: 1 }}>● LISTENING</div>
                      {listenInfo.localIPs.map(({ name, address }) => (
                        <div key={address} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <div><div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{address}:{listenInfo.port}</div><div style={{ fontSize: 11, color: T.textDim }}>{name}</div></div>
                          <button onClick={() => { navigator.clipboard?.writeText(`${address}:${listenInfo.port}`); notify('Copied!', 'ok') }} className="btn btn-ghost btn-xs">⎘</button>
                        </div>
                      ))}
                    </div>}
                    <div style={{ marginTop: 9, fontSize: 10, color: T.textDim, lineHeight: 1.5 }}>Share your IP:port with a peer on the <strong style={{ color: T.green }}>same WiFi network</strong>.</div>
                  </div>

                  {/* DIAL PEER */}
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 10, color: T.purple, letterSpacing: 1.5, marginBottom: 11, fontWeight: 700 }}>② CONNECT TO PEER</div>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 5, letterSpacing: 1, fontWeight: 600 }}>IP:PORT (Same Network)</div>
                    <input value={connectAddr} onChange={e => setConnectAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && doConnect()} className="inp" placeholder="192.168.1.x:7900" style={{ marginBottom: 7 }} disabled={connState === 'connecting'} />
                    {/* BUG 3 FIX: Clarify that no secret code is needed — just IP:PORT */}
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 7, lineHeight: 1.5 }}>
                      No password or secret code needed — encryption is automatic via ECDH key exchange. After connecting, verify your peer's fingerprint via the <strong style={{ color: T.accent }}>✔ Verify</strong> button.
                    </div>
                    <button onClick={doConnect} className="btn btn-purple" style={{ width: '100%', padding: 8 }} disabled={connState === 'connecting' || !connectAddr.trim()}>
                      {connState === 'connecting' ? '⟳ Connecting…' : '→ Connect'}
                    </button>
                    {connState === 'done' && <div style={{ marginTop: 7, padding: '6px 9px', background: T.green + '09', border: `1px solid ${T.green}22`, borderRadius: 5, fontSize: 11, color: T.green }}>✓ Connected — ECDH handshake active</div>}
                    {connState === 'error' && <div style={{ marginTop: 7, padding: '6px 9px', background: T.red + '09', border: `1px solid ${T.red}22`, borderRadius: 5, fontSize: 11, color: T.red }}>✕ {connErr || 'Failed'}</div>}
                    {connState !== 'idle' && <button onClick={() => { setConnState('idle'); setConnErr(''); setConnectAddr('') }} className="btn btn-ghost btn-xs" style={{ marginTop: 6, width: '100%' }}>Reset</button>}
                  </div>
                </div>

                {/* ── TOR ONION LINK (Different Network) ── */}
                <div className="card" style={{ padding: 16, marginBottom: 12, border: `1px solid ${T.purple}28` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <div style={{ fontSize: 10, color: T.purple, letterSpacing: 1.5, fontWeight: 700 }}>🧅 ONION LINK (Different Network)</div>
                    <div style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: torStatus === 'running' ? T.green + '16' : torStatus === 'starting' ? T.amber + '16' : T.muted + '16', color: torStatus === 'running' ? T.green : torStatus === 'starting' ? T.amber : T.muted, fontWeight: 700 }}>
                      {torStatus === 'running' ? '● TOR ACTIVE' : torStatus === 'starting' ? '⟳ STARTING' : '○ TOR OFF'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.6 }}>Connect peers on <strong>different networks</strong> via Tor hidden services. All traffic is E2E encrypted (ECDH P-256 + AES-256-GCM) — Tor adds transport anonymity.</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>GENERATE ONION LINK</div>
                      {torStatus !== 'running'
                        ? <button onClick={doStartTor} className="btn btn-purple" style={{ width: '100%', padding: 9 }} disabled={torStatus === 'starting'}>
                          {torStatus === 'starting' ? '⟳ Bootstrapping Tor…' : '🧅 Start Tor & Generate Link'}
                        </button>
                        : <button onClick={doStopTor} className="btn btn-danger" style={{ width: '100%', padding: 9 }}>■ Stop Tor</button>
                      }
                      {torStatus === 'starting' && (
                        <div style={{ marginTop: 8, padding: '10px 12px', background: '#1a1040', border: `1px solid ${T.purple}30`, borderRadius: 8 }}>
                          {/* Header row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div className="spin" style={{ width: 10, height: 10, border: `2px solid ${T.purple}40`, borderTopColor: T.purple, borderRadius: '50%', flexShrink: 0 }} />
                              <span style={{ fontSize: 10, color: T.purple, fontWeight: 700, letterSpacing: 1 }}>BOOTSTRAPPING</span>
                            </div>
                            <span style={{ fontSize: 11, color: T.purple, fontWeight: 700, fontFamily: 'monospace' }}>{torBootstrap}%</span>
                          </div>
                          {/* Progress track */}
                          <div style={{ height: 6, background: `${T.purple}18`, borderRadius: 6, overflow: 'hidden', marginBottom: 6, position: 'relative' }}>
                            <div style={{
                              height: '100%', borderRadius: 6,
                              width: `${torBootstrap}%`,
                              background: `linear-gradient(90deg, #6e40c9, ${T.purple}, #c084fc)`,
                              transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                              boxShadow: `0 0 8px ${T.purple}60`,
                            }} />
                            {/* Shimmer overlay */}
                            <div style={{
                              position: 'absolute', inset: 0, borderRadius: 6,
                              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                              animation: 'shimmer 1.8s infinite',
                            }} />
                          </div>
                          {/* Stage label */}
                          <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.4 }}>{torBootstrapMsg}</div>
                          {/* Milestone dots */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, position: 'relative' }}>
                            {[0, 25, 50, 75, 100].map(m => (
                              <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <div style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: torBootstrap >= m ? T.purple : `${T.purple}28`,
                                  boxShadow: torBootstrap >= m ? `0 0 4px ${T.purple}80` : 'none',
                                  transition: 'all 0.4s',
                                }} />
                                <span style={{ fontSize: 8, color: torBootstrap >= m ? T.purple : T.muted, fontFamily: 'monospace' }}>{m}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!listenActive && torStatus === 'off' && <div style={{ fontSize: 10, color: T.textDim, marginTop: 5 }}>Listening will start automatically</div>}
                      {onionAddr && <div style={{ marginTop: 8, padding: 8, background: T.purple + '08', border: `1px solid ${T.purple}22`, borderRadius: 5 }}>
                        <div style={{ fontSize: 9, color: T.purple, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>YOUR ONION ADDRESS</div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <input readOnly value={onionAddr} className="inp" style={{ flex: 1, fontSize: 10, padding: '3px 7px', fontFamily: 'monospace' }} />
                          <button onClick={() => { navigator.clipboard?.writeText(onionAddr); notify('Onion address copied!', 'ok') }} className="btn btn-ghost btn-xs">⎘</button>
                        </div>
                        <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Share this with your peer</div>
                      </div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>CONNECT VIA ONION</div>
                      <input value={onionInput} onChange={e => setOnionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && doConnectOnion()} className="inp" placeholder="xxxx.onion:7900" style={{ marginBottom: 6, fontSize: 11, fontFamily: 'monospace' }} />
                      <button onClick={doConnectOnion} className="btn btn-purple" style={{ width: '100%', padding: 8 }} disabled={torConnState === 'connecting' || !onionInput.trim()}>
                        {torConnState === 'connecting' ? '⟳ Connecting via Tor…' : '🧅 Connect via Onion'}
                      </button>
                      {torConnState === 'done' && <div style={{ marginTop: 6, padding: '6px 9px', background: T.green + '09', border: `1px solid ${T.green}22`, borderRadius: 5, fontSize: 11, color: T.green }}>✓ Connected via Tor — handshaking</div>}
                      {torConnState === 'error' && <div style={{ marginTop: 6, padding: '6px 9px', background: T.red + '09', border: `1px solid ${T.red}22`, borderRadius: 5, fontSize: 11, color: T.red }}>✕ {torConnErr || 'Failed'}</div>}
                      {torConnState !== 'idle' && <button onClick={() => { setTorConnState('idle'); setTorConnErr(''); setOnionInput('') }} className="btn btn-ghost btn-xs" style={{ marginTop: 5, width: '100%' }}>Reset</button>}
                    </div>
                  </div>
                  {torStatus === 'error' && <div style={{ padding: '8px 11px', background: T.red + '09', border: `1px solid ${T.red}22`, borderRadius: 5, fontSize: 11, color: T.red, marginTop: 6, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>✕ Tor Daemon Failed</div>
                    <div style={{ fontSize: 10, wordBreak: 'break-word' }}>{torError || 'Unknown error. Check Logs for details.'}</div>
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Run <code style={{ background: T.panel, padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace' }}>python GetTorDaemon.py</code> to install/verify the Tor daemon.</div>
                  </div>}
                </div>

                <div className="card" style={{ padding: 12, fontSize: 11, color: T.textDim, lineHeight: 1.8 }}>
                  <div style={{ color: T.textMid, fontWeight: 600, marginBottom: 4 }}>Quick reference</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 11px' }}>
                    <span style={{ color: T.green, fontWeight: 700 }}>Same network</span><span>Auto-discovered via mDNS — appears in My Network tab</span>
                    <span style={{ color: T.purple, fontWeight: 700 }}>Internet</span><span>Start Tor → copy onion address → share via Discord/Signal</span>
                    <span style={{ color: T.accent, fontWeight: 700 }}>Encryption</span><span>ECDH P-256 + Ed25519 + AES-256-GCM on all connections</span>
                    <span style={{ color: T.amber, fontWeight: 700 }}>Session</span><span>Fresh identity + new onion address every launch</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── PEERS / CHAT ── */}
            {tab === 'peers' && (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {!selPeer && (
                  <div style={{ flex: 1, overflowY: 'auto', padding: 14 }} className="fadein">
                    <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>◉ NETWORK</div>
                    {!peers.length ? (
                      <div style={{ textAlign: 'center', padding: '46px 20px', color: T.textDim }}>
                        <div style={{ fontSize: 34, marginBottom: 11 }}>⬡</div>
                        <div style={{ fontSize: 14, marginBottom: 10, color: T.text }}>No peers yet</div>
                        <button onClick={() => setTab('connect')} className="btn btn-primary">⊕ Connect Peer</button>
                      </div>
                    ) : peers.map(p => (
                      <div key={p.id} onClick={() => setSelPeer(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', marginBottom: 1, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.panel} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <Av name={p.name} id={p.id} size={36} online={p.online} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || <span style={{ color: T.muted, fontStyle: 'italic' }}>Unnamed</span>}</div>
                          <div style={{ fontSize: 11, color: p.online ? T.green : T.muted, marginTop: 1 }}>{p.online ? '● Online' : '○ Offline'} · {p.id}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selPeer && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '8px 13px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, background: T.surface }}>
                      <button onClick={() => setSelPeer(null)} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 16, cursor: 'pointer', padding: '2px 5px', borderRadius: 4 }}>‹</button>
                      <Av name={selPeer.name} id={selPeer.id} size={32} online={selPeer.online} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input value={selPeer.name || ''} onChange={e => { const n = e.target.value; setPeers(ps => ps.map(p => p.id === selPeer.id ? { ...p, name: n } : p)); setSelPeer(p => ({ ...p, name: n })) }} placeholder="Name this peer…" style={{ background: 'none', border: 'none', color: selPeer.name ? T.text : T.muted, fontFamily: 'inherit', fontSize: 13, fontStyle: selPeer.name ? 'normal' : 'italic', width: '100%', outline: 'none', fontWeight: 600, padding: 0 }} />
                        <div style={{ fontSize: 10, color: selPeer.removedMe ? T.red : selPeer.reconnecting ? T.amber : selPeer.online ? T.green : T.red, marginTop: 1 }}>
                          {selPeer.removedMe ? '🚫 This peer has removed you — messages cannot be sent'
                            : selPeer.reconnecting ? '⟳ Reconnecting…'
                              : selPeer.online ? `🔒 E2E Encrypted${verifiedPeers.has(selPeer.id) ? ' · ✓ Verified' : ''}`
                                : '⚠ Disconnected'}
                        </div>
                      </div>
                      {selPeer.online && <button onClick={() => setShowVerify({ fingerprint: peerFingerprints[selPeer.id], peerName: selPeer.name })} className="btn btn-xs" style={{ background: verifiedPeers.has(selPeer.id) ? T.green + '16' : T.accent + '12', border: `1px solid ${verifiedPeers.has(selPeer.id) ? T.green : T.accent}30`, color: verifiedPeers.has(selPeer.id) ? T.green : T.accent, flexShrink: 0 }}>{verifiedPeers.has(selPeer.id) ? '✓ Verified' : 'Verify'}</button>}
                      <button
                        onClick={() => { setMsgs(p => ({ ...p, [selPeer.id]: [] })); notify('Cleared locally — sender still has their copy', 'info') }}
                        className="btn btn-ghost btn-xs"
                        title="⚠ Clears only on YOUR screen — the sender still has their copy of this conversation"
                      >Clear ⓘ</button>
                      <button onClick={() => setShowRemoveConfirm({ peerId: selPeer.id, peerName: selPeer.name })} className="btn btn-danger btn-xs">Remove</button>
                      <button onClick={() => doBlockPeer(selPeer.id, selPeer.name)} className="btn btn-xs" style={{ background: T.red + '16', color: T.red, border: `1px solid ${T.red}30` }} title="Block this peer permanently">🚫 Block</button>
                    </div>
                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '11px 13px 7px', display: 'flex', flexDirection: 'column', gap: 7, background: T.bg }}>
                      {peerMsgs.map(msg => (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'me' ? 'flex-end' : msg.from === 'sys' ? 'center' : 'flex-start' }} className="fadein">
                          {msg.type === 'sys' && <div className="bub bub-sys">{msg.text}</div>}
                          {msg.type === 'text' && <div className={`bub bub-${msg.from === 'me' ? 'me' : 'them'}`}>
                            <div style={{ color: T.text }}
                              onClick={e => {
                                const link = e.target.closest('.p2n-link');
                                if (link) {
                                  const url = link.dataset.url;
                                  if (sett.warnLinks) setShowLinkConfirm(url);
                                  else window.ftps?.openExternal(url);
                                }
                              }}
                              dangerouslySetInnerHTML={{
                                __html:
                                  // FIX #1: Code-block messages (sent via CodeEditor or containing ``` fences)
                                  // ALWAYS render with full MD so syntax highlighting is preserved regardless
                                  // of the sett.md toggle. Only plain prose text respects the toggle.
                                  (msg.isCode || /```/.test(msg.text))
                                    ? renderMD(msg.text)
                                    : sett.md
                                      ? renderMD(msg.text)
                                      : escH(msg.text.replace(/\*\*\*(.+?)\*\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^#+\s/gm, '')).replace(/\n/g, '<br>')
                              }} />
                            <div style={{ fontSize: 10, color: T.muted, marginTop: 3, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                              {/* BUG 5B FIX: Show blocked badge if this peer is in blocked list */}
                              {msg.from === 'them' && blockedPeers.some(bp => bp.id === selPeer?.id) && <span style={{ color: T.red, fontWeight: 700, fontSize: 9, padding: '0 4px', background: T.red + '12', borderRadius: 3, border: `1px solid ${T.red}25` }}>🚫 Blocked</span>}
                              {msg.time}{msg.from === 'me' && <span style={{ color: T.accentDim }}>✓</span>}
                            </div>
                          </div>}
                          {['file_out', 'file_in', 'file_done', 'revoked'].includes(msg.type) && <FileMsg msg={msg} onExtract={doExtract} onPreview={m => setFileView(m)} onRevoke={doRevoke} onZipView={m => setZipView(m)} onOSSandbox={m => setOsSandbox(m)} warnArch={sett.warnArch} />}
                          {msg.type === 'folder' && <FolderMsg msg={msg} onOpen={() => setFolderView(msg.folder)} onRevoke={doRevoke} />}
                          {msg.type === 'folder_offer' && <FolderOfferMsg msg={msg} onRevoke={fid => {
                            // Revoke the offer: remove from sharedFolders so sender ignores future pulls
                            if (sharedFoldersRef.current[fid]) delete sharedFoldersRef.current[fid]
                            setMsgs(p => ({ ...p, [selPeer.id]: (p[selPeer.id] || []).map(m => m.id === 'fo_' + fid ? { ...m, status: 'done' } : m) }))
                            // Notify peer the offer is revoked
                            bridgeRef.current?.sendMsg(selPeer.id, { type: 'folder_offer_revoked', fid })
                            notify('Folder offer revoked', 'ok')
                          }} />}
                          {msg.type === 'folder_browse' && <FolderBrowseMsg msg={msg} peerId={selPeer?.id} onPull={doPullFolder} notify={notify} />}
                          {msg.type === 'folder_recv' && <FolderRecvMsg msg={msg} folderDataRef={folderDataRef} notify={notify} />}
                        </div>
                      ))}
                      <div ref={chatEnd} />
                    </div>
                    {/* Quick send */}
                    {selPeer.online && <div style={{ padding: '4px 11px', borderTop: `1px solid ${T.border}`, background: T.surface, display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: T.textDim, marginRight: 3 }}>Quick:</span>
                      <button onClick={() => fileInp.current?.click()} className="btn btn-ghost btn-xs">📄 File</button>
                      <button onClick={() => folderInp.current?.click()} className="btn btn-ghost btn-xs">📂 Folder</button>
                      <button onClick={() => setShowCode(true)} className="btn btn-ghost btn-xs">{'</>'} Code</button>
                      <div style={{ flex: 1 }} />
                      <span
                        title={sett.md ? 'Markdown ON — **bold**, *italic*, `code`, ```blocks```' : 'Markdown OFF — toggle in Settings'}
                        style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: sett.md ? T.accent + '16' : T.panel, color: sett.md ? T.accent : T.muted, border: `1px solid ${sett.md ? T.accent + '30' : T.border}`, cursor: 'pointer' }}
                        onClick={() => setSett2(p => ({ ...p, md: !p.md }))}
                      >MD {sett.md ? 'ON' : 'OFF'}</span>
                    </div>}
                    {/* Input — disabled if peer hasn't accepted yet */}
                    <div style={{ padding: '8px 11px', borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                      {sentPeerRequests.has(selPeer.id) && !selPeer.approved ? (
                        <div style={{ padding: '10px 12px', background: T.amber + '0a', border: `1px solid ${T.amber}25`, borderRadius: 8, fontSize: 11, color: T.amber, textAlign: 'center' }}>
                          ⟳ Waiting for {selPeer.name || 'peer'} to accept your connection request…
                        </div>
                      ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                        <textarea value={input} onChange={e => { setInput(e.target.value); lastAct.current = Date.now() }} onKeyDown={e => { lastAct.current = Date.now(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }} placeholder={selPeer.removedMe ? '🚫 Cannot send — this peer removed you' : 'Message… Shift+Enter = newline'} disabled={!!selPeer.removedMe} rows={2} style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 11px', color: T.text, fontFamily: 'inherit', fontSize: 13, resize: 'none', lineHeight: 1.5, transition: 'border-color .12s' }} onFocus={e => e.target.style.borderColor = T.accentDim} onBlur={e => e.target.style.borderColor = T.border} />
                        <button onClick={doSend} style={{ width: 34, height: 34, borderRadius: 8, background: input.trim() ? T.accent : T.panel, border: `1px solid ${input.trim() ? T.accent : T.border}`, color: input.trim() ? '#0d1117' : T.textDim, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .12s', fontWeight: 700 }}>↑</button>
                      </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── LOGS ── */}
            {tab === 'logs' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fadein">
                <div style={{ padding: '9px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, flex: 1 }}>📋 SECURITY & EVENT LOG</span>
                    <button onClick={() => {
                      const txt = logs.map(l => `[${l.ts}] ${l.level}: ${l.msg} ${l.detail || ''}`).join('\n')
                      navigator.clipboard.writeText(txt); notify('All logs copied!', 'ok')
                    }} className="btn btn-ghost btn-xs">Copy All</button>
                    <button onClick={() => {
                      const txt = logs.map(l => `[${l.ts}] ${l.level}: ${l.msg} ${l.detail || ''}`).join('\n')
                      const blob = new Blob([txt], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob); const a = document.createElement('a')
                      a.href = url; a.download = 'security_logs.txt'; a.click(); URL.revokeObjectURL(url)
                    }} className="btn btn-ghost btn-xs">⬇ security_logs.txt</button>
                    <button onClick={async () => { await window.ftps?.clearLogs(); setLogs([]); notify('Logs cleared') }} className="btn btn-ghost btn-xs">Clear</button>
                  </div>
                  <input
                    placeholder="🔍 Search logs…"
                    onChange={e => {
                      const q = e.target.value.toLowerCase()
                      setLogSearch(q)
                    }}
                    className="inp"
                    style={{ fontSize: 11, padding: '4px 8px' }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(() => {
                    const filtered = logSearch ? logs.filter(l =>
                      l.msg?.toLowerCase().includes(logSearch) ||
                      l.level?.toLowerCase().includes(logSearch) ||
                      l.detail?.toLowerCase().includes(logSearch) ||
                      l.ts?.includes(logSearch)
                    ) : logs
                    if (!filtered.length) return <div style={{ textAlign: 'center', padding: 28, color: T.muted, fontSize: 12 }}>{logSearch ? `No logs matching "${logSearch}"` : 'No events yet'}</div>
                    return filtered.map((l, i) => {
                      const col = l.level === 'OK' ? T.green : l.level === 'ERR' ? T.red : l.level === 'WARN' ? T.amber : T.muted
                      return <div key={i} className="log-row" style={{ cursor: 'pointer' }} title="Click to copy log line" onClick={() => { navigator.clipboard.writeText(`[${l.ts}] ${l.level}: ${l.msg} ${l.detail || ''}`); notify('Copied log line', 'ok') }}>
                        <span style={{ color: T.muted }}>{l.ts}</span>
                        <span style={{ color: col, fontWeight: 700 }}>{l.level}</span>
                        <span style={{ color: T.textMid }}>{l.msg}{l.detail ? <span style={{ color: T.muted }}> — {l.detail}</span> : ''}</span>
                      </div>
                    })
                  })()}
                </div>
              </div>
            )}

            {/* ── REQUESTS ── */}
            {tab === 'requests' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">
                <div style={{ fontSize: 10, color: T.amber, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>📬 CONNECTION REQUESTS</div>

                {/* INCOMING — peers wanting to connect to you */}
                {(() => {
                  const incoming = pendingPeerRequests.filter(r => r.role !== 'sender')
                  return incoming.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>INCOMING REQUESTS</div>
                      <div className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${T.green}30` }}>
                        {incoming.map((req, i) => (
                          <div key={req.peerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < incoming.length - 1 ? `1px solid ${T.border}20` : 'none' }}>
                            <div style={{ width: 42, height: 42, borderRadius: '50%', background: T.green + '18', border: `2px solid ${T.green}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: T.green, fontWeight: 700 }}>
                              {(req.peerName || '?')[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{req.peerName || req.peerId}</div>
                              <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace' }}>{req.peerId}</div>
                              <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>📡 Wants to connect with you</div>
                              {req.fingerprint && <div style={{ fontSize: 9, color: T.muted, marginTop: 1, fontFamily: 'monospace' }}>FP: {req.fingerprint}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button onClick={() => {
                                window.ftps?.acceptRequest(req.peerId)
                                setPendingPeerRequests(p => p.filter(r => r.peerId !== req.peerId))
                                setTab('peers')
                              }} className="btn btn-green btn-sm" style={{ padding: '7px 16px', fontWeight: 700 }}>✓ Accept</button>
                              <button onClick={() => {
                                window.ftps?.rejectRequest(req.peerId)
                                setPendingPeerRequests(p => p.filter(r => r.peerId !== req.peerId))
                                notify(`Request declined — ${req.peerName || 'Peer'} blocked for 10 minutes`, 'info')
                              }} className="btn btn-danger btn-sm" style={{ padding: '7px 14px' }}>✕ Decline</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* OUTGOING — sent requests waiting for approval */}
                {(() => {
                  const outgoing = pendingPeerRequests.filter(r => r.role === 'sender')
                  return outgoing.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>SENT REQUESTS</div>
                      <div className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${T.blue}30` }}>
                        {outgoing.map((req, i) => (
                          <div key={req.peerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < outgoing.length - 1 ? `1px solid ${T.border}20` : 'none' }}>
                            <div style={{ width: 42, height: 42, borderRadius: '50%', background: T.blue + '18', border: `2px solid ${T.blue}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: T.blue, fontWeight: 700 }}>
                              {(req.peerName || '?')[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{req.peerName || req.peerId}</div>
                              <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace' }}>{req.peerId}</div>
                              <div style={{ fontSize: 10, color: T.amber, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span className="spin" style={{ display: 'inline-block', width: 8, height: 8, border: `1.5px solid ${T.amber}40`, borderTopColor: T.amber, borderRadius: '50%' }}/>
                                Waiting for them to accept…
                              </div>
                            </div>
                            <button onClick={() => {
                              window.ftps?.withdrawRequest(req.peerId)
                              setPendingPeerRequests(p => p.filter(r => r.peerId !== req.peerId))
                              setSentPeerRequests(s => { const n = new Set(s); n.delete(req.peerId); return n })
                              notify('Request withdrawn', 'ok')
                            }} className="btn btn-ghost btn-sm" style={{ padding: '6px 14px', color: T.textDim, flexShrink: 0 }}>Withdraw</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* DECLINED — with 10-min countdown so sender knows when they can retry */}
                {(() => {
                  const now = Date.now()
                  const active = rejectedRequests.filter(r => r.expiresAt > now)
                  return active.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>DECLINED</div>
                      <div className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${T.red}20` }}>
                        {active.map((r, i) => {
                          const remaining = Math.max(0, Math.ceil((r.expiresAt - now) / 1000))
                          const mins = Math.floor(remaining / 60), secs = remaining % 60
                          return (
                            <div key={r.peerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < active.length - 1 ? `1px solid ${T.border}15` : 'none', opacity: 0.75 }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.red + '10', border: `2px solid ${T.red}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0, color: T.red, fontWeight: 700 }}>
                                {(r.peerName || '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>{r.peerName || r.peerId}</div>
                                <div style={{ fontSize: 10, color: T.red }}>✕ Declined — retry in {mins}:{String(secs).padStart(2,'0')}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {pendingPeerRequests.length === 0 && rejectedRequests.filter(r => r.expiresAt > Date.now()).length === 0 && (
                  <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                    <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginBottom: 6 }}>No pending requests</div>
                    <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
                      Incoming requests appear here when someone wants to connect.<br/>
                      Your sent requests also appear here so you can withdraw them.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MY NETWORK ── */}
            {tab === 'network' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">

                {/* Tor Bootstrap Card — shown in Network tab while Tor is starting */}
                {torStatus === 'starting' && (
                  <div style={{ marginBottom: 14, padding: '14px 16px', background: 'linear-gradient(135deg, #1a1040 0%, #0d1117 100%)', border: `1px solid ${T.purple}40`, borderRadius: 10, boxShadow: `0 0 24px ${T.purple}18` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ fontSize: 20 }}>🧅</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: T.purple, fontWeight: 700, letterSpacing: 0.5 }}>Tor Network — Bootstrapping</div>
                        <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>Building anonymous circuits through the Tor network…</div>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: T.purple, fontFamily: 'monospace' }}>{torBootstrap}%</div>
                    </div>
                    {/* Main progress bar */}
                    <div style={{ height: 8, background: `${T.purple}15`, borderRadius: 8, overflow: 'hidden', position: 'relative', marginBottom: 10 }}>
                      <div style={{
                        height: '100%', borderRadius: 8,
                        width: `${torBootstrap}%`,
                        background: `linear-gradient(90deg, #4c1d95, ${T.purple}, #c084fc)`,
                        transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
                        boxShadow: `0 0 12px ${T.purple}50`,
                        position: 'relative', overflow: 'hidden',
                      }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)', animation: 'shimmer 1.6s infinite' }} />
                      </div>
                    </div>
                    {/* Stage message */}
                    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 10, minHeight: 16 }}>
                      <span style={{ color: T.purple }}>›</span> {torBootstrapMsg}
                    </div>
                    {/* Milestone track */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
                      {/* Connector line */}
                      <div style={{ position: 'absolute', top: 5, left: 5, right: 5, height: 1, background: `${T.purple}20` }} />
                      {[
                        { pct: 0,   label: 'Start' },
                        { pct: 14,  label: 'Consensus' },
                        { pct: 40,  label: 'Relays' },
                        { pct: 75,  label: 'Circuits' },
                        { pct: 100, label: 'Ready' },
                      ].map(({ pct, label }) => (
                        <div key={pct} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 1 }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: torBootstrap >= pct ? T.purple : '#1a1040',
                            border: `2px solid ${torBootstrap >= pct ? T.purple : `${T.purple}40`}`,
                            boxShadow: torBootstrap >= pct ? `0 0 6px ${T.purple}80` : 'none',
                            transition: 'all 0.5s ease',
                          }} />
                          <span style={{ fontSize: 8, color: torBootstrap >= pct ? T.purple : T.muted, fontWeight: torBootstrap >= pct ? 700 : 400 }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tor running banner in network tab */}
                {torStatus === 'running' && onionAddr && (
                  <div style={{ marginBottom: 14, padding: '10px 14px', background: 'linear-gradient(135deg, #1a1040 0%, #0d1117 100%)', border: `1px solid ${T.purple}40`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 18 }}>🧅</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: T.purple, fontWeight: 700 }}>Tor Hidden Service Active</div>
                      <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{onionAddr}</div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.purple, boxShadow: `0 0 8px ${T.purple}`, flexShrink: 0, animation: 'pulse 2s infinite' }} />
                  </div>
                )}
                <div className="card glass glow-accent" style={{ padding: 16, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, marginBottom: 15 }}>NETWORK TOPOLOGY</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px 0' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>🏠</div>
                      <div style={{ fontSize: 9, color: T.textDim }}>ROUTER</div>
                      <div style={{ fontSize: 10, color: T.blue, fontWeight: 600 }}>{netDetails.gateway}</div>
                    </div>
                    <div style={{ height: 1, flex: 1, background: T.border, margin: '0 10px', position: 'relative' }}>
                      <div className="pulse" style={{ position: 'absolute', top: -4, left: '50%', width: 8, height: 8, borderRadius: '50%', background: T.accent }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>💻</div>
                      <div style={{ fontSize: 9, color: T.textDim }}>LOCAL IP</div>
                      <div style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>{netInfo[0]?.address || '…'}</div>
                    </div>
                    <div style={{ height: 1, flex: 1, background: T.border, margin: '0 10px', position: 'relative' }}>
                      <div className="pulse" style={{ position: 'absolute', top: -4, left: '50%', width: 8, height: 8, borderRadius: '50%', background: T.purple }} />
                    </div>
                    <div style={{ textAlign: 'center', background: T.bg, padding: 8, borderRadius: 8, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>🌐</div>
                      <div style={{ fontSize: 9, color: T.textDim }}>REACHABILITY</div>
                      <div style={{ fontSize: 10, color: torStatus === 'running' ? T.purple : (listenActive ? T.green : T.amber), fontWeight: 600 }}>{torStatus === 'running' ? '🧥 Tor Network' : (listenActive ? '🏠 Local Network' : '🚫 Inactive')}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="card" style={{ padding: 14 }}>
                    <div className="sh">DNS & Gateway</div>
                    {[
                      { l: 'Network Mode', v: torStatus === 'running' ? 'Tor (Global)' : (listenActive ? 'LAN (Local)' : 'Offline'), c: torStatus === 'running' ? T.purple : (listenActive ? T.green : T.amber) },
                      { l: 'Gateway', v: netDetails.gateway, c: T.blue },
                      { l: 'Primary DNS', v: netDetails.dnsServers[0] || 'Auto', c: T.purple },
                      { l: 'Secondary DNS', v: netDetails.dnsServers[1] || '—' },
                      { l: 'Onion Address', v: onionAddr ? onionAddr.split(':')[0].slice(0, 16) + '…' : 'Not running', c: torStatus === 'running' ? T.green : T.muted }
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 4 ? `1px solid ${T.border}30` : 'none' }}>
                        <span style={{ fontSize: 11, color: T.textDim }}>{r.l}</span>
                        <span style={{ fontSize: 11, color: r.c || T.text, fontFamily: 'monospace', fontWeight: 600 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="card" style={{ padding: 14 }}>
                    <div className="sh">Protocol Info</div>
                    {[
                      { l: 'Transport', v: 'Direct TCP' },
                      { l: 'Encryption', v: 'AES-256-GCM' },
                      { l: 'Key Exchange', v: 'ECDH P-256' },
                      { l: 'Identity', v: 'TOFU Hash Verified', c: T.green }
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 3 ? `1px solid ${T.border}30` : 'none' }}>
                        <span style={{ fontSize: 11, color: T.textDim }}>{r.l}</span>
                        <span style={{ fontSize: 11, color: r.c || T.text, fontWeight: 600 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, color: T.textDim, fontWeight: 700, letterSpacing: 2, marginBottom: 12, marginLeft: 4 }}>INTERFACE DETAILS</div>
                  {netInfo.map((iface, i) => (
                    <div key={i} className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `3px solid ${iface.address ? T.green : T.muted}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                        <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, letterSpacing: .5 }}>{iface.name}</div>
                        <span style={{ fontSize: 9, color: iface.address ? T.green : T.muted, fontWeight: 800, padding: '2px 6px', background: iface.address ? T.green + '15' : T.muted + '15', borderRadius: 4 }}>{iface.address ? 'ACTIVE' : 'DISCONNECTED'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                          { l: 'IPv4', v: iface.address || '—' },
                          { l: 'Netmask', v: iface.netmask || '—' },
                          { l: 'MAC Addr', v: iface.mac || '—' }
                        ].map((r, idx) => (
                          <div key={idx} style={{ fontSize: 11 }}>
                            <div style={{ color: T.textDim, fontSize: 9, marginBottom: 2 }}>{r.l}</div>
                            <div style={{ fontFamily: 'monospace', color: T.text }}>{r.v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* mDNS Discovered Peers */}
                {discoveredPeers.length > 0 && (
                  <div className="card" style={{ padding: 0, marginBottom: 10, overflow: 'hidden', border: `1px solid ${T.green}30` }}>
                    <div style={{ padding: '10px 14px', background: T.green + '08', borderBottom: `1px solid ${T.green}20`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>📡</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>NEARBY PEERS — SAME NETWORK</div>
                        <div style={{ fontSize: 10, color: T.textDim }}>Auto-discovered via mDNS · approval required to chat</div>
                      </div>
                    </div>

                    {/* Discovered peers list */}
                    {discoveredPeers.length > 0 && <div style={{ padding: '8px 14px' }}>
                      {discoveredPeers.map((dp, i) => {
                        // Check if we already sent a request to this node
                        const alreadySent = sentPeerRequests.has(dp.nodeId) || peersRef.current.some(p => p.online && (msgs[p.id]?.length > 0))
                        const alreadyConnected = peersRef.current.some(p => p.online && p.name === dp.name && p.id !== myId.current)
                        // FIX 4: Hide blocked peers from mDNS discovery list too
                        const isBlockedPeer = blockedPeers.some(b => b.name === dp.name || b.id === dp.nodeId)
                        if (isBlockedPeer) return null
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < discoveredPeers.length - 1 ? `1px solid ${T.border}20` : 'none' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.green + '15', border: `2px solid ${T.green}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                              {(dp.name || '?')[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{dp.name || 'Unknown'}</div>
                              <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace' }}>{dp.nodeId || 'mDNS'} · Port {dp.port}</div>
                            </div>
                            {alreadyConnected ? (
                              <span style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>● Connected</span>
                            ) : sentPeerRequests.has(dp.nodeId) ? (
                              <span style={{ fontSize: 10, color: T.amber }}>⟳ Pending…</span>
                            ) : (
                              <button onClick={async () => {
                                // Self-connect guard
                                if (listenInfo) {
                                  const myIPs = (listenInfo.localIPs || []).map(i => i.address)
                                  if ([...myIPs, '127.0.0.1'].includes(dp.address) && dp.port === listenInfo.port) {
                                    notify('⚠ That is your own device', 'err'); return
                                  }
                                }
                                try {
                                  notify(`Request sent to ${dp.name || dp.address}…`, 'ok')
                                  const r = await window.ftps?.connect(dp.address, String(dp.port))
                                  if (r?.ok) {
                                    // Mark as sent immediately using nodeId (stable before peerId arrives)
                                    setSentPeerRequests(s => new Set([...s, dp.nodeId]))
                                    // Edit 5: Add to pendingPeerRequests as sender so Requests tab shows it
                                    setPendingPeerRequests(p => {
                                      if (p.some(req => req.peerId === dp.nodeId)) return p
                                      return [...p, {
                                        peerId: dp.nodeId, peerName: dp.name, fingerprint: null,
                                        tofu: null, tofuDetail: null, identityKey: null,
                                        role: 'sender', timestamp: Date.now()
                                      }]
                                    })
                                    // Navigate to requests tab so sender can see their pending request
                                    setTab('requests')
                                  } else { notify('Connect failed: ' + (r?.error || ''), 'err') }
                                } catch (err) { notify('Error: ' + (err?.message || ''), 'err') }
                              }} className="btn btn-ghost btn-sm" style={{ color: T.green, border: `1px solid ${T.green}30`, flexShrink: 0 }}>
                                Add ＋
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>}
                    <div style={{ padding: '6px 14px', fontSize: 10, color: T.textDim, borderTop: `1px solid ${T.border}15`, background: T.bg + '80' }}>
                      Peers must accept your request before you can chat · requests expire after 60s
                    </div>
                  </div>
                )}
                {discoveredPeers.length === 0 && listenActive && (
                  <div style={{ padding: '10px 12px', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, color: T.textDim, marginBottom: 10, lineHeight: 1.7 }}>
                    <div>📡 Scanning for nearby peers on local network… (mDNS port 7476)</div>
                    <div style={{ marginTop: 4, color: T.amber, fontSize: 10 }}>
                      ⚠ If no peers appear: both devices must be on the same WiFi/LAN.
                      On Windows, allow the app through Windows Defender Firewall, or run:
                    </div>
                    {/* BUG 4 FIX: Copyable firewall rules with click-to-copy and copy button */}
                    {[
                      `netsh advfirewall firewall add rule name="P2N mDNS" dir=in action=allow protocol=UDP localport=7476`,
                      `netsh advfirewall firewall add rule name="P2N TCP" dir=in action=allow protocol=TCP localport=${listenPort}`,
                    ].map((rule, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, background: T.bg, padding: '4px 7px', borderRadius: 4, cursor: 'pointer' }} onClick={() => { navigator.clipboard?.writeText(rule); notify('Copied!', 'ok') }}>
                        <code style={{ flex: 1, fontFamily: 'monospace', fontSize: 10, color: T.blue, wordBreak: 'break-all' }}>{rule}</code>
                        <button onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(rule); notify('Copied!', 'ok') }} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 12 }}>⎘</button>
                      </div>
                    ))}
                  </div>
                )}
                {discoveredPeers.length === 0 && !listenActive && (
                  <div style={{ padding: '10px 12px', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, color: T.textDim, marginBottom: 10 }}>
                    📡 mDNS discovery starts automatically when you click "Start Listening" in the Connect tab.
                  </div>
                )}
              </div>
            )}

            {/* ── STATS ── */}
            {tab === 'stats' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2 }}>▲ TECHNICAL DASHBOARD</div>
                  <div style={{ fontSize: 11, color: T.textDim }}>Real-time frequency: 1,500ms</div>
                </div>

                <div className="card glass glow-blue" style={{ background: `linear-gradient(180deg, ${T.panel}, ${T.bg})`, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: 2, marginBottom: 15 }}>LIVE BITRATE MONITOR</div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <BandwidthGraph data={bwHistory.out} color={T.blue} label="OUTBOUND DATA" />
                    <BandwidthGraph data={bwHistory.in} color={T.green} label="INBOUND DATA" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="sh" style={{ marginBottom: 15 }}>System Resources</div>
                    <ResourceBar label="Process RAM (RSS)" val={sysStats?.rss || 0} max={1024 * 1024 * 1024} col={T.purple} />
                    <ResourceBar label="CPU Load Avg" val={sysStats?.cpuPercent || (sysStats?.loadAvg || 0) * 100} max={100} col={T.blue} />
                    <ResourceBar label="Heap Used" val={sysStats?.heapUsed || 0} max={sysStats?.heapTotal || 1} col={T.accent} />
                    <div style={{ marginTop: 10, background: T.bg, padding: 8, borderRadius: 6, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase', marginBottom: 4 }}>Internal Node Engine</div>
                      <div style={{ fontSize: 11, color: T.textMid, fontFamily: 'monospace' }}>{sysStats?.nodeVer || '…'}</div>
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="sh" style={{ marginBottom: 15 }}>OS & Hardware</div>
                    {[
                      { l: 'Architecture', v: sysStats?.arch || '…' },
                      { l: 'Platform', v: sysStats?.platform || '…' },
                      { l: 'OS Release', v: sysStats?.osRelease || '…' },
                      { l: 'Host Uptime', v: Math.floor((sysStats?.osUptime || 0) / 3600) + ' hrs' },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 3 ? `1px solid ${T.border}20` : 'none' }}>
                        <span style={{ fontSize: 11, color: T.textDim }}>{r.l}</span>
                        <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
                  {[
                    { l: 'Bytes Sent', v: fmtSz(sysStats?.bytesSent || 0), c: T.blue },
                    { l: 'Bytes Recv', v: fmtSz(sysStats?.bytesReceived || 0), c: T.green },
                    { l: 'Online Peers', v: onlinePeers.length, c: T.accent },
                    { l: 'Session Time', v: fmt(uptime), c: T.purple }
                  ].map((s, i) => (
                    <div key={i} className="card" style={{ padding: 12, background: `linear-gradient(45deg, ${T.surface}, ${T.panel})` }}>
                      <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{s.l}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
                    </div>
                  ))}
                </div>

                <div className="card" style={{ padding: 12, background: T.panel + '80' }}>
                  <div className="sh" style={{ marginBottom: 10 }}>LIVE CONNECTIVITY FEED</div>
                  <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 11, fontFamily: 'monospace' }}>
                    {logs.slice(0, 5).map((l, i) => (
                      <div key={i} style={{ marginBottom: 4, borderLeft: `2px solid ${l.level === 'OK' ? T.green : l.level === 'ERR' ? T.red : T.muted}`, paddingLeft: 8 }}>
                        <span style={{ color: T.muted }}>[{l.ts}]</span> <span style={{ color: l.level === 'OK' ? T.green : T.text }}>{l.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── SETTINGS ── */}
            {tab === 'settings' && (
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
                  {/* A1 FIX: scanFiles toggle */}
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
                {/* B4/C1: Blocked Peers management */}
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
            )}

            {/* ── DOCS TAB (inline HelpModal) ── */}
            {tab === 'docs' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fadein">
                <HelpModal inline onClose={() => setTab('connect')} />
              </div>
            )}
          </div>{/* end tab content */}

          {/* ── SANDBOX PANEL (right, always visible when active) ── */}
          {sandbox && <SandboxPanel sandbox={sandbox} onClose={() => setSandbox(null)} />}

        </div>{/* end content area */}
      </div>{/* end main layout */}

      <input ref={fileInp} type="file" multiple
        accept=".zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz,application/zip,application/x-tar,application/gzip,application/x-bzip2,application/x-xz,text/*,image/*,application/pdf,video/*,audio/*,application/json,application/xml"
        style={{ display: 'none' }}
        onChange={e => { [...e.target.files].forEach(f => doSendFile(f)); e.target.value = '' }} />
      <input ref={folderInp} type="file" {...{ 'webkitdirectory': '' }} multiple style={{ display: 'none' }} onChange={e => { if (e.target.files.length) doSendFolder([...e.target.files]); e.target.value = '' }} />
    </div>
  )
}

// ── WRAPPED EXPORT ─────────────────────────────────────────────────────────────
export function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
