import { useState, useEffect, useRef, useCallback } from 'react'
import { generateKeyPair } from './lib/crypto.js'
import { TCPBridge } from './lib/tcpbridge.js'

// ── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:'#0b0e14', surface:'#161b22', panel:'#1c2330cc', border:'#30363d',
  accent:'#58a6ff', accentDim:'#1f6feb', accentFaint:'#58a6ff10',
  blue:'#58a6ff', amber:'#d29922', red:'#f85149', green:'#3fb950', purple:'#bc8cff',
  text:'#e6edf3', textDim:'#8b949e', textMid:'#b1bac4', muted:'#30363d',
  glass:'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);',
}

const G = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;overflow:hidden;background:${T.bg}}
body{font-family:'Inter',system-ui,sans-serif;color:${T.text};font-size:13px;-webkit-font-smoothing:antialiased;user-select:none}
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
.pulse{animation:pulse 2s infinite ease-in-out}
`

// ── UTILS ─────────────────────────────────────────────────────────────────────
const fmt     = s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
const fmtMin  = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
const fmtSz   = b=>b>=1e9?(b/1e9).toFixed(2)+' GB':b>=1e6?(b/1e6).toFixed(1)+' MB':b>=1e3?(b/1e3).toFixed(0)+' KB':b+' B'
const now8    = ()=>new Date().toTimeString().slice(0,8)
const escH    = s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const makeId  = n=>'#'+Math.abs([...n].reduce((a,c,i)=>((a<<5)-a+c.charCodeAt(0)*(i+7))|0,0)).toString(16).padStart(4,'0').toUpperCase()
const WORDS   = ['apple','bridge','cedar','delta','ember','flint','grove','harbor','iris','jade','kite','lemon','maple','noble','orbit','quartz','river','stone','tiger','vault','walnut','xenon','zinc']
const phrase  = ()=>{const w=()=>WORDS[Math.floor(Math.random()*WORDS.length)];return`${w()}-${w()}-${w()}-${w()}`}
const IS_ARCH = /\.(zip|gz|tar|rar|7z|bz2|xz|tgz)$/i
const IS_TEXT = /\.(txt|md|log|json|xml|csv|html|css|js|jsx|ts|tsx|py|java|c|cpp|sh|yaml|yml|toml|ini|sql|rs|go|rb|php|bat|ps1|conf|env)$/i
const IS_IMG  = /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico)$/i

function renderMD(text) {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g,(_,l,c)=>{
      const id='cb'+Math.random().toString(36).slice(2,7),esc=escH(c.trim())
      return`<div class="codeblock"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="font-size:9px;color:${T.textDim};letter-spacing:1px;text-transform:uppercase">${l||'code'}</span><button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent);this.textContent='✓';setTimeout(()=>this.textContent='⎘',1500)" class="cbtn">⎘</button></div><pre id="${id}">${esc}</pre></div>`
    })
    .replace(/`([^`]+)`/g,'<code class="icode">$1</code>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/(https?:\/\/[^\s<]+)/g,`<span class="p2n-link" data-url="$1" style="color:${T.amber};text-decoration:underline dashed;cursor:pointer">⚠ $1</span>`)
    .replace(/\n/g,'<br>')
}

// ── AVATAR ────────────────────────────────────────────────────────────────────
function Av({name,id,size=34,online}){
  const hue=Math.abs([...(name||id||'?')].reduce((a,c)=>a+c.charCodeAt(0),0))%360
  const raw=(name||'').trim(), ini=raw.length>=2?(raw[0]+raw[raw.length-1]).toUpperCase():raw[0]?.toUpperCase()||'?'
  return<div style={{width:size,height:size,borderRadius:'50%',background:`hsl(${hue},18%,15%)`,border:`2px solid ${online?T.green:T.muted}`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,color:online?`hsl(${hue},55%,65%)`:T.textDim,fontSize:Math.round(size*.35),flexShrink:0,position:'relative'}}>
    {ini}<div style={{position:'absolute',bottom:0,right:0,width:Math.round(size*.24),height:Math.round(size*.24),borderRadius:'50%',background:online?T.green:T.muted,border:`1.5px solid ${T.bg}`}}/>
  </div>
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function Toast({n}){
  if(!n)return null
  const c=n.t==='ok'?T.green:n.t==='err'?T.red:T.accent
  return<div style={{position:'fixed',bottom:20,right:20,zIndex:9999,background:T.surface,border:`1px solid ${c}45`,borderRadius:8,padding:'9px 14px',color:c,fontSize:12,maxWidth:300,animation:'fadeUp .16s ease',boxShadow:'0 8px 24px #0008',lineHeight:1.5,display:'flex',gap:8}}>
    <span>{n.t==='ok'?'✓':n.t==='err'?'✕':'ℹ'}</span><span>{n.msg}</span>
  </div>
}

// ── CLOSE CONFIRM ─────────────────────────────────────────────────────────────
function CloseConfirm({onCancel}){
  const[v,setV]=useState('')
  const go=()=>{ if(v==='TERMINATE') window.ftps?.windowControl('close-confirmed') }
  return<div className="overlay"><div className="card fadeup" style={{width:'min(380px,95vw)',padding:26,border:`1px solid ${T.red}35`}}>
    <div style={{textAlign:'center',fontSize:22,marginBottom:10}}>⚠️</div>
    <div style={{fontSize:14,color:T.text,fontWeight:600,marginBottom:6,textAlign:'center'}}>Close P2N?</div>
    <div style={{fontSize:12,color:T.textDim,marginBottom:18,lineHeight:1.7,textAlign:'center'}}>All peer connections will close.<br/>Type <strong style={{color:T.red}}>TERMINATE</strong> to confirm.</div>
    <input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')go();if(e.key==='Escape')onCancel()}}
      placeholder="TERMINATE" autoFocus className="inp"
      style={{textAlign:'center',fontSize:14,fontWeight:700,letterSpacing:1,marginBottom:14,
        borderColor:v==='TERMINATE'?T.red:T.border,color:v==='TERMINATE'?T.red:T.text,background:v==='TERMINATE'?T.red+'0d':T.bg}}/>
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
      <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
      <button onClick={go} className="btn btn-danger" disabled={v!=='TERMINATE'}>Close App</button>
    </div>
  </div></div>
}

// ── TITLE BAR ─────────────────────────────────────────────────────────────────
function TitleBar({account,nodeId,onlinePeers,onLock,onTerminate,uptime,onClose,onHelp}){
  const[vOpen,setVOpen]=useState(false)
  const vRef=useRef(null)
  const wc=a=>window.ftps?.windowControl(a)
  const openGH=()=>window.ftps?.openExternal('https://github.com/official-imvoiid/P2N-Peer-Networking')

  useEffect(()=>{
    const h=e=>{if(vRef.current&&!vRef.current.contains(e.target))setVOpen(false)}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])

  const VIEW=[
    {l:'Refresh UI',        k:'reload',    s:'Ctrl+R', note:'Refreshes the interface only — all connections and data persist'},
    {sep:true},
    {l:'Minimize',          k:'minimize',  s:'Ctrl+M'},
    {l:'Maximize',          k:'maximize',  s:'Ctrl+Shift+M'},
    {l:'Toggle Fullscreen', k:'fullscreen',s:'F11'},
    {sep:true},
    {l:'Zoom In',           k:'zoomin',    s:'Ctrl++'},
    {l:'Actual Size',       k:'zoomreset', s:'Ctrl+0'},
    {l:'Zoom Out',          k:'zoomout',   s:'Ctrl+-'},
    {sep:true},
    {l:'Toggle Dev Tools',  k:'devtools',  s:'Ctrl+Shift+I'},
  ]

  return<div className="tb">
    <span style={{display:'flex',alignItems:'center',gap:6,padding:'0 8px',WebkitAppRegion:'no-drag'}}>
      <span style={{fontSize:13,fontWeight:800,color:T.accent,letterSpacing:2}}>P2P</span>
    </span>
    <div style={{width:1,height:14,background:T.border,margin:'0 2px'}}/>
    <button className="tb-btn" onClick={onHelp} title="Open Documentation">Help</button>
    <div style={{position:'relative',WebkitAppRegion:'no-drag'}} ref={vRef}>
      <button className="tb-btn" onClick={()=>setVOpen(o=>!o)}>View ▾</button>
      {vOpen&&<div className="tb-drop">
        {VIEW.map((it,i)=>it.sep
          ?<div key={i} className="tb-drop-sep"/>
          :<button key={i} className="tb-drop-item" title={it.note||''} onClick={()=>{wc(it.k);setVOpen(false)}}>
            <span>{it.l}</span><span className="tb-shortcut">{it.s}</span>
          </button>
        )}
      </div>}
    </div>
    <div className="tb-drag-fill"/>
    {/* Center info — non-interactive */}
    <div style={{position:'absolute',left:'50%',transform:'translateX(-50%)',pointerEvents:'none',display:'flex',gap:8,fontSize:11,alignItems:'center'}}>
      <span style={{color:T.textMid}}>{account?.name}</span>
      <span style={{color:T.muted}}>·</span>
      <span style={{color:T.accent,fontWeight:600}}>{nodeId}</span>
      <span style={{color:T.muted}}>·</span>
      <span style={{color:onlinePeers>0?T.green:T.muted}}>{onlinePeers>0?`● ${onlinePeers} online`:'○ offline'}</span>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:3,WebkitAppRegion:'no-drag'}}>
      <span style={{fontSize:10,color:T.muted,fontVariantNumeric:'tabular-nums',marginRight:6}}>{fmt(uptime)}</span>
      <button onClick={onLock} className="tb-btn" style={{color:T.amber}}>🔒 Lock</button>
      <button onClick={onTerminate} className="tb-btn" style={{color:T.red}}>End</button>
      <div style={{width:1,height:14,background:T.border,margin:'0 3px'}}/>
      <button onClick={onClose} className="tb-close-btn" title="Close P2N">✕</button>
    </div>
  </div>
}

// ── CODE EDITOR ───────────────────────────────────────────────────────────────
function CodeEditor({onSend,onClose}){
  const[lang,setLang]=useState('python'), [code,setCode]=useState('')
  const langs=['python','javascript','typescript','java','c','cpp','rust','go','bash','sql','html','json','yaml','markdown']
  return<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="card fadeup" style={{width:'min(680px,95vw)',height:'min(500px,90vh)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'10px 14px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <span style={{fontSize:13,color:T.accent,fontWeight:700,flex:1}}>{'</>'} Code Block</span>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:5,padding:'3px 8px',color:T.text,fontSize:12}}>{langs.map(l=><option key={l}>{l}</option>)}</select>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      <div style={{flex:1,padding:12,display:'flex',flexDirection:'column',gap:6,overflow:'hidden'}}>
        <div style={{fontSize:10,color:T.textDim}}>Tab = 2 spaces · Shift+Enter to send</div>
        <textarea className="code-ed" value={code} onChange={e=>setCode(e.target.value)} style={{flex:1}}
          onKeyDown={e=>{
            if(e.key==='Tab'){e.preventDefault();const s=e.target.selectionStart;const v=code.slice(0,s)+'  '+code.slice(e.target.selectionEnd);setCode(v);setTimeout(()=>{e.target.selectionStart=e.target.selectionEnd=s+2},0)}
            if(e.key==='Enter'&&e.shiftKey){e.preventDefault();if(code.trim()){onSend('```'+lang+'\n'+code+'\n```');onClose()}}
          }} placeholder={`// ${lang} code…`}/>
      </div>
      <div style={{padding:'8px 14px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <span style={{fontSize:10,color:T.textDim}}>{code.split('\n').length} lines</span>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setCode('')} className="btn btn-ghost btn-sm">Clear</button>
          <button onClick={()=>{if(code.trim()){onSend('```'+lang+'\n'+code+'\n```');onClose()}}} className="btn btn-primary btn-sm" disabled={!code.trim()}>Send</button>
        </div>
      </div>
    </div>
  </div>
}

// ── SANDBOX PANEL (right-side split) ─────────────────────────────────────────
function SandboxPanel({sandbox,onClose}){
  const{name,sandboxDir,sandboxId,tree}=sandbox
  const[crumbs,setCrumbs]=useState([])
  const[preview,setPreview]=useState(null)
  const[loading,setLoading]=useState(null)
  const idRef=useRef(sandboxId)

  useEffect(()=>{idRef.current=sandboxId},[sandboxId])
  useEffect(()=>{setCrumbs([]);setPreview(null)},[sandboxId])
  useEffect(()=>()=>{if(idRef.current)window.ftps?.cleanupSandbox(idRef.current)},[])

  const cur=crumbs.reduce((n,s)=>n?.children?.[s],{children:tree})
  const entries=Object.entries(cur?.children||tree||{})
  const extCol={pdf:'#ff6b6b',md:T.blue,py:T.amber,js:'#fbbf24',ts:'#4db8ff',jpg:T.purple,png:T.purple,zip:'#f97316',json:T.amber,sh:T.red,txt:T.textMid}

  const openFile=async(fname,node)=>{
    setLoading(fname)
    const res=await window.ftps?.readSandboxFile(sandboxDir,node.relPath)
    setLoading(null); if(!res?.ok)return
    const buf=Uint8Array.from(atob(res.dataB64),c=>c.charCodeAt(0))
    if(IS_TEXT.test(fname)) setPreview({name:fname,type:'text',content:new TextDecoder().decode(buf)})
    else if(IS_IMG.test(fname)){const blob=new Blob([buf],{type:'image/'+fname.split('.').pop()});setPreview({name:fname,type:'img',url:URL.createObjectURL(blob)})}
    else setPreview({name:fname,type:'bin',size:buf.length})
  }
  const saveFile=async(fname,node)=>{await window.ftps?.saveSandboxFile(sandboxDir,node.relPath,fname)}
  const openOS=()=>window.ftps?.openSandboxFolder(sandboxDir)

  return<div style={{width:320,borderLeft:`1px solid ${T.border}`,background:T.surface,display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0}}>
    {/* Header */}
    <div style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,background:T.panel,flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:11,color:T.accent,fontWeight:700}}>📦 SANDBOX</span>
        <div style={{display:'flex',gap:4}}>
          <button onClick={openOS} className="btn btn-ghost btn-xs" title="Open in Windows Explorer / File Manager (AV will scan)">🗂 Explorer</button>
          <button onClick={onClose} className="btn btn-ghost btn-xs">✕</button>
        </div>
      </div>
      <div style={{fontSize:10,color:T.textDim,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
      <div style={{fontSize:9,color:T.muted,marginTop:2}}>Isolated OS temp · Auto-cleaned · Never executed</div>
    </div>

    {/* Breadcrumb */}
    <div style={{padding:'4px 8px',borderBottom:`1px solid ${T.border}`,display:'flex',gap:3,flexWrap:'wrap',alignItems:'center',flexShrink:0,background:T.panel}}>
      <button onClick={()=>{setCrumbs([]);setPreview(null)}} style={{background:'none',border:'none',color:T.blue,fontSize:11,cursor:'pointer',padding:'1px 3px',borderRadius:3}}>root</button>
      {crumbs.map((s,i)=><span key={i} style={{display:'flex',gap:3,alignItems:'center'}}>
        <span style={{color:T.muted,fontSize:10}}>›</span>
        <button onClick={()=>{setCrumbs(crumbs.slice(0,i+1));setPreview(null)}} style={{background:'none',border:'none',color:i===crumbs.length-1?T.accent:T.blue,fontSize:11,cursor:'pointer',padding:'1px 3px',borderRadius:3}}>{s}</button>
      </span>)}
    </div>

    {/* File tree */}
    <div style={{flex:preview?'0 0 50%':'1',overflowY:'auto',padding:4,borderBottom:preview?`1px solid ${T.border}`:'none'}}>
      {crumbs.length>0&&<div className="sb-row" onClick={()=>{setCrumbs(c=>c.slice(0,-1));setPreview(null)}} style={{color:T.textDim,fontSize:11}}>↩ ..</div>}
      {entries.map(([fname,node])=>{
        const ext=fname.split('.').pop().toLowerCase(), col=extCol[ext]||T.textDim, isDir=node.type==='dir', isLoading=loading===fname
        return<div key={fname} className="sb-row" onClick={()=>isDir?setCrumbs([...crumbs,fname]):openFile(fname,node)}>
          <span style={{fontSize:13,flexShrink:0}}>{isDir?'📂':IS_ARCH.test(fname)?'📦':'📄'}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,color:isDir?T.amber:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fname}</div>
            {node.size&&<div style={{fontSize:9,color:T.muted}}>{fmtSz(node.size)}</div>}
          </div>
          {isLoading&&<div className="spin" style={{width:11,height:11,border:`2px solid ${T.border}`,borderTopColor:T.accent,borderRadius:'50%',flexShrink:0}}/>}
          {!isDir&&!isLoading&&<button onClick={e=>{e.stopPropagation();saveFile(fname,node)}} className="btn btn-green btn-xs" style={{flexShrink:0}}>⬇</button>}
          {!isDir&&<span style={{fontSize:8,fontWeight:700,padding:'1px 3px',borderRadius:3,border:`1px solid ${col}38`,color:col,flexShrink:0}}>{ext.toUpperCase()}</span>}
        </div>
      })}
      {!entries.length&&<div style={{textAlign:'center',padding:20,color:T.muted,fontSize:11}}>Empty folder</div>}
    </div>

    {/* Preview */}
    {preview&&<div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',background:T.bg}}>
      <div style={{padding:'5px 10px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:T.surface}}>
        <span style={{fontSize:10,color:T.text,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{preview.name}</span>
        <button onClick={()=>setPreview(null)} style={{background:'none',border:'none',color:T.textDim,cursor:'pointer',fontSize:11,flexShrink:0}}>✕</button>
      </div>
      <div style={{flex:1,overflow:'auto'}}>
        {preview.type==='text'&&<pre style={{padding:12,fontFamily:'monospace',fontSize:11,color:T.textMid,whiteSpace:'pre-wrap',wordBreak:'break-word',lineHeight:1.5}}>{preview.content}</pre>}
        {preview.type==='img'&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:12}}><img src={preview.url} alt={preview.name} style={{maxWidth:'100%',maxHeight:'40vh',objectFit:'contain',borderRadius:4}}/></div>}
        {preview.type==='bin'&&<div style={{padding:24,textAlign:'center',color:T.textDim,fontSize:12}}><div style={{fontSize:28,marginBottom:8}}>📄</div><div>{fmtSz(preview.size)}</div><div style={{marginTop:4,fontSize:11}}>Binary — save to open</div></div>}
      </div>
    </div>}

    {/* AV tip */}
    <div style={{padding:'7px 10px',borderTop:`1px solid ${T.border}`,background:T.panel,flexShrink:0,fontSize:10,color:T.muted,lineHeight:1.5}}>
      🛡 <strong style={{color:T.textDim}}>AV scan:</strong> Click "Explorer" — Windows Defender / ClamAV scans automatically on access.
    </div>
  </div>
}

// ── FILE MSG ──────────────────────────────────────────────────────────────────
function FileMsg({msg,onExtract,onPreview,onRevoke,warnArch}){
  const isMe=msg.from==='me', pct=msg.pct??1, done=msg.type==='file_done'||msg.type==='file_out'
  const statusTxt=msg.type==='file_out'?'Sent':msg.type==='file_done'?'Received':msg.type==='file_in'?`${Math.round(pct*100)}%`:'…'
  const statusCol=done?T.green:T.amber, isArch=IS_ARCH.test(msg.meta?.name||'')
  const save=async()=>{
    if(!msg.blob)return
    if(window.ftps){const r=new FileReader();r.onload=async()=>await window.ftps.saveFile(msg.meta?.name||'file',r.result.split(',')[1]);r.readAsDataURL(msg.blob)}
    else{const a=document.createElement('a');a.href=URL.createObjectURL(msg.blob);a.download=msg.meta.name;document.body.appendChild(a);a.click();document.body.removeChild(a)}
  }
  return<div style={{padding:'9px 11px',background:isMe?T.blue+'0b':T.surface,border:`1px solid ${isMe?T.blue+'26':T.border}`,borderRadius:8,maxWidth:'68%'}}>
    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:done?7:5}}>
      <span style={{fontSize:17}}>{isArch?'📦':'📄'}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:T.text,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{msg.meta?.name}</div>
        <div style={{fontSize:11,color:T.textDim}}>{fmtSz(msg.meta?.size||0)}</div>
      </div>
      <span className="stag" style={{color:statusCol,background:statusCol+'12',border:`1px solid ${statusCol}28`}}>{statusTxt}</span>
    </div>
    {!done&&<div className="prog" style={{marginBottom:6}}><div className="prog-fill" style={{width:`${pct*100}%`}}/></div>}
    {msg.type==='file_done'&&msg.blob&&<div style={{display:'flex',gap:5}}>
      <button onClick={save} className="btn btn-green btn-xs" style={{flex:1}}>⬇ Save</button>
      {isArch
        ?<button onClick={()=>{
          const r=new FileReader();
          r.onload=()=>{
            const data={name:msg.meta?.name, dataB64:r.result.split(',')[1]}
            onExtract?.(data)
          };
          r.readAsDataURL(msg.blob)
        }} className="btn btn-amber btn-xs" style={{flex:1}}>📦 Extract</button>
        :<button onClick={()=>onPreview?.(msg)} className="btn btn-ghost btn-xs" style={{flex:1}}>🔍 View</button>
      }
    </div>}
    {isMe&&done&&<button onClick={()=>onRevoke?.(msg.id)} className="btn btn-ghost btn-xs" style={{marginTop:5,width:'100%',color:T.amber,fontSize:10}}>Revoke</button>}
    <div style={{fontSize:10,color:T.muted,marginTop:5,textAlign:'right'}}>{msg.time}</div>
  </div>
}

// ── FOLDER MSG ────────────────────────────────────────────────────────────────
function FolderMsg({msg,onOpen,onRevoke}){
  const e=Object.keys(msg.folder?.children||{})
  return<div onClick={onOpen} style={{padding:'9px 11px',background:T.amber+'0b',border:`1px solid ${T.amber}28`,borderRadius:8,maxWidth:'68%',cursor:'pointer',transition:'background .1s'}} onMouseEnter={e=>e.currentTarget.style.background=T.amber+'15'} onMouseLeave={e=>e.currentTarget.style.background=T.amber+'0b'}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
      <span style={{fontSize:18}}>📂</span>
      <div><div style={{fontSize:11,color:T.amber,fontWeight:700}}>Shared Folder</div><div style={{fontSize:12,color:T.text}}>{msg.folder?.name}</div></div>
    </div>
    <div style={{fontSize:11,color:T.textDim,marginBottom:3}}>{e.length} item{e.length!==1?'s':''}{e.length?': '+e.slice(0,3).join(', ')+(e.length>3?'…':''):''}</div>
    {msg.from==='me'&&<button onClick={ev=>{ev.stopPropagation();onRevoke?.(msg.id)}} className="btn btn-ghost btn-xs" style={{color:T.amber,marginBottom:3}}>Revoke</button>}
    <div style={{fontSize:10,color:T.muted,textAlign:'right'}}>{msg.time}</div>
  </div>
}

// ── FOLDER VIEWER ─────────────────────────────────────────────────────────────
function FolderViewer({folder,onClose}){
  const[crumbs,setCrumbs]=useState([])
  const cur=crumbs.reduce((n,s)=>n?.children?.[s],folder)
  const entries=Object.entries(cur?.children??folder?.children??{})
  const extC={pdf:'#ff6b6b',md:T.blue,py:T.amber,js:'#fbbf24',ts:'#4db8ff',jpg:T.purple,png:T.purple}
  return<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="card fadeup" style={{width:'min(560px,95vw)',height:'min(500px,90vh)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'10px 15px',borderBottom:`1px solid ${T.border}`,background:T.panel,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div><div style={{fontSize:12,color:T.accent,fontWeight:700}}>📂 {folder.name}</div><div style={{fontSize:10,color:T.textDim,marginTop:2}}>Sandboxed · Read-only</div></div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      <div style={{padding:'4px 8px',borderBottom:`1px solid ${T.border}`,display:'flex',gap:4,alignItems:'center',background:T.panel,flexShrink:0,flexWrap:'wrap'}}>
        <button onClick={()=>setCrumbs([])} style={{background:'none',border:'none',color:T.blue,fontSize:11,cursor:'pointer'}}>{folder.name}</button>
        {crumbs.map((s,i)=><span key={i} style={{display:'flex',gap:3,alignItems:'center'}}><span style={{color:T.muted,fontSize:10}}>›</span><button onClick={()=>setCrumbs(crumbs.slice(0,i+1))} style={{background:'none',border:'none',color:i===crumbs.length-1?T.accent:T.blue,fontSize:11,cursor:'pointer'}}>{s}</button></span>)}
      </div>
      <div style={{flex:1,overflowY:'auto',padding:5}}>
        {crumbs.length>0&&<div className="sb-row" onClick={()=>setCrumbs(c=>c.slice(0,-1))} style={{color:T.textDim,fontSize:11}}>↩ ..</div>}
        {entries.map(([name,node])=>{
          const ext=name.split('.').pop().toLowerCase(),col=extC[ext]||T.textDim,isDir=node.type==='dir'||node.type==='folder'
          return<div key={name} className="sb-row" onClick={()=>isDir&&setCrumbs([...crumbs,name])}>
            <span style={{fontSize:13}}>{isDir?'📂':'📄'}</span>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:isDir?T.amber:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>{node.size&&<div style={{fontSize:9,color:T.muted}}>{fmtSz(node.size)}</div>}</div>
            {!isDir&&<span style={{fontSize:8,fontWeight:700,padding:'1px 3px',borderRadius:3,border:`1px solid ${col}38`,color:col}}>{ext.toUpperCase()}</span>}
          </div>
        })}
        {!entries.length&&<div style={{textAlign:'center',padding:24,color:T.muted,fontSize:11}}>Empty</div>}
      </div>
    </div>
  </div>
}

// ── FILE VIEWER (non-archive) ─────────────────────────────────────────────────
function FileViewer({file,onClose}){
  const[content,setContent]=useState(null), [loading,setLoading]=useState(true)
  const name=file.meta?.name||'file', isText=IS_TEXT.test(name), isImg=IS_IMG.test(name)
  useEffect(()=>{
    if(file.blob){
      if(isText)file.blob.text().then(t=>{setContent(t);setLoading(false)})
      else if(isImg){const u=URL.createObjectURL(file.blob);setContent(u);setLoading(false);return()=>URL.revokeObjectURL(u)}
      else setLoading(false)
    }else setLoading(false)
  },[file])
  const save=async()=>{
    if(!file.blob)return
    if(window.ftps){const r=new FileReader();r.onload=async()=>await window.ftps.saveFile(name,r.result.split(',')[1]);r.readAsDataURL(file.blob)}
    else{const a=document.createElement('a');a.href=URL.createObjectURL(file.blob);a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a)}
  }
  return<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="card fadeup" style={{width:'min(760px,95vw)',height:'min(80vh,680px)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'9px 14px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <span style={{fontSize:13,fontWeight:600,color:T.text}}>{name}</span>
        <div style={{display:'flex',gap:8}}><button onClick={save} className="btn btn-green btn-sm">⬇ Save</button><button onClick={onClose} className="btn btn-ghost btn-sm">✕</button></div>
      </div>
      <div style={{flex:1,overflow:'auto',background:T.bg}}>
        {loading&&<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:T.textDim}}>Loading…</div>}
        {!loading&&isText&&content!==null&&<pre style={{padding:18,fontFamily:'monospace',fontSize:12,color:T.textMid,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{content}</pre>}
        {!loading&&isImg&&content&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><img src={content} alt={name} style={{maxWidth:'100%',maxHeight:'55vh',objectFit:'contain',borderRadius:5}}/></div>}
        {!loading&&!isText&&!isImg&&<div style={{padding:36,textAlign:'center'}}><div style={{fontSize:36,marginBottom:10}}>📄</div><div style={{fontSize:13,color:T.text,marginBottom:6}}>{name}</div><div style={{fontSize:12,color:T.textDim,marginBottom:16}}>{fmtSz(file.meta?.size||0)}</div><button onClick={save} className="btn btn-green">⬇ Save</button></div>}
      </div>
    </div>
  </div>
}

// ── TOFU WARNING MODAL ───────────────────────────────────────────────────────
function TofuWarning({data,onAccept,onReject}){
  if(!data)return null
  return<div className="overlay">
    <div className="card fadeup" style={{width:'min(440px,95vw)',padding:24,border:`1px solid ${T.red}40`}}>
      <div style={{textAlign:'center',fontSize:28,marginBottom:8}}>⚠️</div>
      <div style={{fontSize:15,color:T.red,fontWeight:700,textAlign:'center',marginBottom:6}}>KEY CHANGED — Possible MITM Attack!</div>
      <div style={{fontSize:12,color:T.textMid,lineHeight:1.8,marginBottom:14,textAlign:'center'}}>
        The encryption key for <strong style={{color:T.text}}>{data.peerName||data.peerId}</strong> has changed since the first connection.
        <br/>This could mean someone is intercepting the connection.
      </div>
      <div style={{background:T.panel,borderRadius:6,padding:'10px 12px',marginBottom:14,fontSize:11,lineHeight:1.6}}>
        <div style={{color:T.textDim}}>Previously known as: <span style={{color:T.amber}}>{data.tofuDetail?.previousName||'Unknown'}</span></div>
        <div style={{color:T.textDim}}>First seen: <span style={{color:T.muted}}>{data.tofuDetail?.firstSeen?.slice(0,10)||'Unknown'}</span></div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onReject} className="btn btn-danger" style={{flex:1,padding:10}}>✕ Disconnect</button>
        <button onClick={onAccept} className="btn btn-amber" style={{flex:1,padding:10}}>Accept New Key</button>
      </div>
    </div>
  </div>
}

// ── VERIFY FINGERPRINT MODAL ─────────────────────────────────────────────────
function VerifyModal({fingerprint,peerName,onClose,onVerified}){
  if(!fingerprint)return null
  return<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="card fadeup" style={{width:'min(420px,95vw)',padding:24}}>
      <div style={{textAlign:'center',fontSize:28,marginBottom:6}}>🔐</div>
      <div style={{fontSize:14,color:T.accent,fontWeight:700,textAlign:'center',marginBottom:4}}>Session Verification Code</div>
      <div style={{fontSize:11,color:T.textDim,textAlign:'center',lineHeight:1.7,marginBottom:14}}>Read this code aloud to <strong style={{color:T.text}}>{peerName||'your peer'}</strong>.<br/>If they see the exact same code, the connection is secure.</div>
      <div style={{background:'#010409',border:`1px solid ${T.accent}30`,borderRadius:8,padding:'14px 18px',textAlign:'center',marginBottom:14,fontFamily:'monospace',fontSize:18,fontWeight:700,color:T.green,letterSpacing:3}}>{fingerprint}</div>
      <div style={{fontSize:10,color:T.muted,textAlign:'center',marginBottom:14,lineHeight:1.6}}>This code is derived from both peers' ECDH public keys.<br/>A Man-in-the-Middle attacker would produce a different code.</div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onClose} className="btn btn-ghost" style={{flex:1,padding:9}}>Close</button>
        <button onClick={()=>{onVerified?.();onClose()}} className="btn btn-green" style={{flex:1,padding:9}}>✓ Verified — Matches</button>
      </div>
    </div>
  </div>
}

// ── COMPONENTS ───────────────────────────────────────────────────────────────
function BandwidthGraph({data, color, label}){
  const canvasRef = useRef(null)
  useEffect(()=>{
    const c = canvasRef.current, ctx = c.getContext('2d'), w = c.width, h = c.height
    ctx.clearRect(0,0,w,h)
    if(!data.length) return
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    const step = w / 20
    data.slice(-20).forEach((v,i)=>{
      const x = i * step, y = h - (Math.min(1, v/500000) * (h-4)) - 2
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y)
    })
    ctx.stroke()
    // gradient fill
    ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.fillStyle = color+'15'; ctx.fill()
  },[data, color])
  return <div style={{flex:1, height:40, display:'flex', flexDirection:'column'}}>
    <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
      <span style={{fontSize:9, color:T.textDim, textTransform:'uppercase'}}>{label}</span>
      <span style={{fontSize:9, color, fontWeight:700}}>{fmtSz(data[data.length-1]||0)}/s</span>
    </div>
    <canvas ref={canvasRef} width={240} height={40} style={{width:'100%', height:'100%'}}/>
  </div>
}

function ResourceBar({label, val, max, col}){
  const pct = Math.min(100, Math.round((val/max)*100))
  return <div style={{marginBottom:12}}>
    <div style={{display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:4, color:T.textDim}}>
      <span>{label}</span>
      <span style={{color:col, fontWeight:700}}>{pct}%</span>
    </div>
    <div style={{height:4, background:T.border, borderRadius:2, overflow:'hidden'}}>
      <div style={{height:'100%', width:`${pct}%`, background:col, transition:'width .5s cubic-bezier(0.4, 0, 0.2, 1)'}}/>
    </div>
  </div>
}

// ── HELP ─────────────────────────────────────────────────────────────────────
function HelpModal({onClose, inline=false}){
  const[tab,setTab]=useState('connect')
  const R=({l,v,c,icon})=><div style={{display:'grid',gridTemplateColumns:'20px 150px 1fr',gap:10,padding:'9px 0',borderBottom:`1px solid ${T.border}15`,alignItems:'center'}}><span style={{fontSize:13,textAlign:'center'}}>{icon||'•'}</span><span style={{fontSize:12,color:T.textDim,fontWeight:500}}>{l}</span><span style={{fontSize:12,color:c||T.text,fontWeight:500}}>{v}</span></div>
  const S=({n,col,title,body})=><div style={{display:'flex',gap:12,marginBottom:18}}>
    <div style={{width:28,height:28,borderRadius:'50%',background:`${col}16`,border:`1.5px solid ${col}40`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:11,fontWeight:800,color:col}}>{n}</div>
    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:col,marginBottom:3}}>{title}</div><div style={{fontSize:12,color:T.textMid,lineHeight:1.8}}>{body}</div></div>
  </div>
  const tabs=['connect','internet','security','sandbox']
  const content=<>
    <div style={{padding:'14px 20px',borderBottom:`1px solid ${T.border}`,background:`linear-gradient(135deg, ${T.panel}, ${T.surface})`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
      <div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
          <span style={{fontSize:18}}>🛡️</span>
          <span style={{fontSize:15,color:T.accent,fontWeight:800,letterSpacing:1}}>P2N Documentation</span>
        </div>
        <div style={{fontSize:10,color:T.textDim,display:'flex',gap:6,alignItems:'center'}}>
          <span style={{color:T.green}}>●</span> Direct TCP · ECDH P-256 · AES-256-GCM · TOFU Key Trust
        </div>
      </div>
      <div style={{display:'flex',gap:7}}>
        <button onClick={()=>window.ftps?.openExternal('https://github.com/official-imvoiid/P2N-Peer-Networking')} className="btn btn-ghost btn-sm">⭐ GitHub</button>
        {!inline && <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>}
      </div>
    </div>
    <div style={{display:'flex',borderBottom:`1px solid ${T.border}`,flexShrink:0,background:T.surface}}>
      {tabs.map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:'9px 16px',border:'none',background:'transparent',color:tab===t?T.accent:T.textDim,borderBottom:`2px solid ${tab===t?T.accent:'transparent'}`,cursor:'pointer',fontWeight:tab===t?700:400,fontSize:11,transition:'all .12s',letterSpacing:.5}}>
        {t==='connect'?'🔗 Connect':t==='internet'?'🌐 Internet':t==='security'?'🛡 Security':'📦 Sandbox'}
      </button>)}
    </div>
    <div style={{flex:1,overflowY:'auto',padding:'18px 22px'}}>
      {tab==='connect'&&<>
        <div style={{background:`linear-gradient(135deg, ${T.accent}08, ${T.green}06)`,border:`1px solid ${T.accent}18`,borderRadius:8,padding:'12px 16px',marginBottom:18}}>
          <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:4}}>⚡ Quick Start</div>
          <div style={{fontSize:12,color:T.textMid,lineHeight:1.8}}>One peer listens. The other dials. No servers, no codes required for same WiFi — peers are <strong style={{color:T.green}}>auto-discovered</strong> via mDNS. For internet connections, use pairing codes.</div>
        </div>
        <S n="1" col={T.blue}   title="Start Listening" body="Connect tab → set port 7000 → Start Listening. UPnP auto-maps port on your router. mDNS discovery starts automatically for same-network peers."/>
        <S n="2" col={T.green}  title="Same Network" body="Open My Network tab — nearby peers appear automatically with a one-click Connect button. No IP typing needed. This uses mDNS multicast (like AirDrop/Bonjour), fully local."/>
        <S n="3" col={T.purple} title="Get Pairing Code (Internet)" body="Click 'Get Code' — P2N discovers your external IP via UPnP → STUN → HTTP fallback. Share the code by any means. Peer pastes it and clicks Connect."/>
        <S n="4" col={T.accent} title="Secure" body="ECDH P-256 handshake derives a fresh AES-256-GCM key. Everything encrypted before leaving the machine. Persistent identity key enables TOFU — warns if peer identity changes."/>
      </>}
      {tab==='internet'&&<>
        <div style={{background:T.accent+'08',border:`1px solid ${T.accent}18`,borderRadius:8,padding:'12px 16px',marginBottom:18}}>
          <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:4}}>🌐 How P2N Connects Over the Internet</div>
          <div style={{fontSize:12,color:T.textMid,lineHeight:1.8}}>Three-layer fallback system — tries UPnP first, then STUN, then HTTP lookup. All fully automatic.</div>
        </div>
        <S n="1" col={T.green}  title="UPnP — Fully automatic" body="P2N sends a SOAP/UPnP request to your router to open the port. Works on most home routers. Enable UPnP in your router admin panel (192.168.1.1) if it shows failed."/>
        <S n="2" col={T.accent} title="STUN — Automatic fallback" body="If UPnP fails, P2N uses STUN (RFC 5389) — the same protocol used by WebRTC. It probes multiple servers (Google, Cloudflare, Nextcloud) simultaneously. Not a 3rd party relay — just IP discovery."/>
        <S n="3" col={T.blue}   title="HTTP Fallback" body="If STUN also fails, P2N queries api.ipify.org and api4.my-ip.io to get your public IP. This always works as long as you have basic internet."/>
        <S n="4" col={T.amber}  title="Tailscale — For CG-NAT / strict networks" body="If you're behind CG-NAT (common with mobile/ISP networks) direct connections won't work. Both peers install Tailscale (free, tailscale.com) and connect via 100.x.x.x addresses."/>
        <div style={{marginTop:10,padding:'10px 14px',background:T.green+'0a',border:`1px solid ${T.green}22`,borderRadius:6,fontSize:12,color:T.green,lineHeight:1.7}}>💡 <strong>Same WiFi?</strong> Open My Network tab — peers appear automatically, no IP entry needed.</div>
      </>}
      {tab==='security'&&<>
        <div style={{background:T.green+'08',border:`1px solid ${T.green}18`,borderRadius:8,padding:'12px 16px',marginBottom:18}}>
          <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:4}}>🛡 Security Architecture</div>
          <div style={{fontSize:12,color:T.textMid,lineHeight:1.8}}>Zero-trust, serverless, end-to-end encrypted with forward secrecy.</div>
        </div>
        <R icon="🔑" l="Key Exchange"    v="ECDH P-256 — fresh keypair each session" c={T.green}/>
        <R icon="🔒" l="Encryption"      v="AES-256-GCM — every message, every chunk" c={T.green}/>
        <R icon="🎲" l="Nonce"           v="12-byte random per frame — replay-proof" c={T.green}/>
        <R icon="✓"  l="Auth Tag"        v="16-byte GCM — tamper detection per frame" c={T.green}/>
        <R icon="🔌" l="Transport"       v="TCP.FTPS (Files/Text Peer Stream)" c={T.blue}/>
        <R icon="⊘"  l="Servers"         v="None — fully serverless P2P" c={T.accent}/>
        <R icon="📡" l="STUN/mDNS"      v="IP discovery + local discovery only — nothing relayed"/>
        <R icon="📝" l="Log"             v="In-memory only · Click log line to copy"/>
        <R icon="🔄" l="Refresh UI"      v="TCP.FTPS survives · session auto-restores" c={T.green}/>
        <div style={{marginTop:14,padding:'10px 14px',background:T.accent+'08',border:`1px solid ${T.accent}18`,borderRadius:6}}>
          <div style={{fontSize:11,color:T.accent,fontWeight:700,marginBottom:5}}>🔑 TOFU — Trust-On-First-Use</div>
          <div style={{fontSize:11,color:T.textMid,lineHeight:1.7}}>Like SSH known_hosts. P2N stores each peer's <em>persistent identity key</em> (not the ephemeral ECDH key — so reconnections never trigger false MITM warnings). If a key change is detected, P2N shows a <span style={{color:T.red,fontWeight:600}}>MITM warning</span>.</div>
        </div>
      </>}
      {tab==='sandbox'&&<>
        <div style={{background:T.amber+'08',border:`1px solid ${T.amber}18`,borderRadius:8,padding:'12px 16px',marginBottom:18}}>
          <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:4}}>📦 Sandboxed Archive Extraction</div>
          <div style={{fontSize:12,color:T.textMid,lineHeight:1.8}}>Archives extracted to an isolated OS temp folder — never your Desktop or Documents.</div>
        </div>
        <S n="1" col={T.blue}  title="Receive archive" body="When a ZIP/TAR/GZ arrives, click '📦 Extract' on the file message."/>
        <S n="2" col={T.amber} title="Sandbox panel opens" body="Browse the file tree, preview text and images safely inside the sandbox."/>
        <S n="3" col={T.green} title="Save selectively" body="Click ⬇ on any individual file to save it to a location you choose. Nothing is auto-saved."/>
        <S n="4" col={T.purple}title="AV scan via OS" body="Click 'Explorer' — OS file manager opens the temp folder. Windows Defender / ClamAV scans on access automatically."/>
        <div style={{marginTop:12,padding:'10px 14px',background:T.red+'0a',border:`1px solid ${T.red}22`,borderRadius:6,fontSize:12,color:T.red,lineHeight:1.7}}>⚠ <strong>Never</strong> run executables from the sandbox. Preview → AV scan → save to disk if trusted.</div>
      </>}
    </div>
  </>

  if(inline) return <div style={{flex:1,display:'flex',flexDirection:'column',overflowY:'auto',background:T.bg, padding:16}} className="fadein">
    <div className="glass" style={{width:'100%',maxWidth:1200,display:'flex',flexDirection:'column', border:`1px solid ${T.border}`, flex:1, borderRadius:12, overflow:'hidden', flexShrink:0}}>
      {content}
    </div>
  </div>

  return<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="card fadeup" style={{width:'95vw',maxWidth:850,height:'min(85vh,750px)',display:'flex',flexDirection:'column',overflow:'hidden',margin:'0 auto'}}>
      {content}
    </div>
  </div>
}

// ── SESSION RESTORE ───────────────────────────────────────────────────────────
// sessionStorage survives webContents.reload() (Refresh UI) but NOT app restart.
// This lets Refresh UI work without terminating the session.
function readSavedSession() {
  try { return JSON.parse(sessionStorage.getItem('p2n_session') || 'null') } catch { return null }
}
function saveSession(account, nodeId) {
  try { sessionStorage.setItem('p2n_session', JSON.stringify({ account, nodeId, at: Date.now() })) } catch {}
}
function clearSavedSession() {
  try { sessionStorage.removeItem('p2n_session') } catch {}
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
export default function App(){
  const[screen,setScreen]           =useState(getInitialScreen)
  const[account,setAccount]         =useState(getInitialAccount)
  const[form,setForm]               =useState({name:'',passphrase:'',password:''})
  const[fErr,setFErr]               =useState({})
  const[lockForm,setLockForm]       =useState({pp:'',pw:''})
  const[lockErr,setLockErr]         =useState('')
  const[lockTries,setLockTries]     =useState(0)
  const[sett,setSett2]              =useState({lockMin:15,maxTries:5,md:true,useUpnp:true,warnLinks:true,warnArch:true,useStun:true})
  const[tab,setTab]                 =useState('connect')
  const[selPeer,setSelPeer]         =useState(null)
  const[peers,setPeers]             =useState([])
  const[msgs,setMsgs]               =useState({})
  const[input,setInput]             =useState('')
  const[folderView,setFolderView]   =useState(null)
  const[fileView,setFileView]       =useState(null)
  const[showCode,setShowCode]       =useState(false)
  const[showHelp,setShowHelp]       =useState(false)
  const[showCloseConfirm,setShowCloseConfirm]=useState(false)
  const[sandbox,setSandbox]         =useState(null)
  const[sandboxLoading,setSandboxLoading]=useState(false)
  const[showVerify,setShowVerify]   =useState(null)  // {fingerprint, peerName}
  const[showTofuWarn,setShowTofuWarn]=useState(null)  // {peerId, peerName, tofuDetail}
  const[showLinkConfirm,setShowLinkConfirm]=useState(null)
  const[showArchConfirm,setShowArchConfirm]=useState(null)
  const[peerFingerprints,setPeerFingerprints]=useState({})
  const[peerIdentityKeys,setPeerIdentityKeys]=useState({})  // peerId → identityKey for tofuAccept
  const[verifiedPeers,setVerifiedPeers]=useState(new Set())
  const[discoveredPeers,setDiscoveredPeers]=useState([])  // mDNS discovered peers
  // connection state
  const[listenPort,setListenPort]   =useState('7000')
  const[listenActive,setListenActive]=useState(false)
  const[listenInfo,setListenInfo]   =useState(null)
  const[pairingCode,setPairingCode] =useState('')
  const[pairingInfo,setPairingInfo] =useState(null)
  const[pairingInput,setPairingInput]=useState('')
  const[connectAddr,setConnectAddr] =useState('')
  const[connState,setConnState]     =useState('idle')
  const[connErr,setConnErr]         =useState('')
  const[upnpSt,setUpnpSt]          =useState(null)
  // system
  const[netInfo,setNetInfo]         =useState([])
  const[publicIP,setPublicIP]       =useState('…')
  const[uptime,setUptime]           =useState(0)
  const[lockTimer,setLockTimer]     =useState(900)
  const[logs,setLogs]               =useState([])
  const[editName,setEditName]       =useState(false)
  const[nameInput,setNameInput]     =useState('')
  const[sysStats,setSysStats]       =useState(null)
  const[netDetails,setNetDetails]   =useState({dnsServers:[],gateway:'…'})
  const[bwHistory,setBwHistory]     =useState({in:[], out:[]})
  const lastBw = useRef({in:0, out:0})

  const bridgeRef=useRef(null), keyRef=useRef(null), chatEnd=useRef(null)
  const fileInp=useRef(null), folderInp=useRef(null), lastAct=useRef(Date.now()), myId=useRef(getInitialNodeId())

  const[toast,setToast]=useState(null)
  const notify=useCallback((msg,t='info')=>{setToast({msg,t});setTimeout(()=>setToast(null),3200)},[])
  const pushMsg=useCallback((pid,m)=>setMsgs(p=>({...p,[pid]:[...(p[pid]||[]),m]})),[])
  const addLog=useCallback((level,msg,detail='')=>setLogs(p=>[{ts:new Date().toTimeString().slice(0,8),level,msg,detail},...p].slice(0,300)),[])

  // Activity tracking for auto-lock
  useEffect(()=>{
    const r=()=>lastAct.current=Date.now()
    ;['mousemove','keydown','click'].forEach(ev=>window.addEventListener(ev,r))
    return()=>['mousemove','keydown','click'].forEach(ev=>window.removeEventListener(ev,r))
  },[])

  // Uptime + auto-lock tick
  useEffect(()=>{
    const t=setInterval(()=>{
      if(screen==='main'){
        setUptime(u=>u+1)
        const rem=Math.max(0,sett.lockMin*60-(Date.now()-lastAct.current)/1000)
        setLockTimer(Math.round(rem))
        if(rem<=0)setScreen('locked')
      }
    },1000)
    return()=>clearInterval(t)
  },[screen,sett.lockMin])

  // Network info fetch
  const refreshNet=useCallback(()=>{
    window.ftps?.getLocalIPs().then(r=>setNetInfo(r||[])).catch(()=>{})
    window.ftps?.getPublicIP().then(r=>setPublicIP(r?.ip||'Unavailable')).catch(()=>{})
    window.ftps?.getNetDetails().then(r=>setNetDetails(r||{dnsServers:[],gateway:'Unknown'})).catch(()=>{})
  },[])
  useEffect(()=>{ refreshNet() },[refreshNet])

  // Periodic stats poller
  useEffect(()=>{
    if(screen!=='main'||tab!=='stats') return
    const poller = setInterval(async () => {
      const stats = await window.ftps?.getSysStats()
      if(stats){
        setSysStats(stats)
        const diffIn = stats.bytesReceived - lastBw.current.in
        const diffOut = stats.bytesSent - lastBw.current.out
        setBwHistory(p=>({
          in: [...p.in, diffIn].slice(-20),
          out: [...p.out, diffOut].slice(-20)
        }))
        lastBw.current = {in: stats.bytesReceived, out: stats.bytesSent}
      }
    }, 1500)
    return () => clearInterval(poller)
  },[screen, tab])

  // Main process events
  useEffect(()=>{
    const us=[
      window.ftps?.on('ftps:upnp-status',d=>setUpnpSt(d)),
      window.ftps?.on('p2n:log',e=>setLogs(p=>[{ts:e.ts||'',level:e.level,msg:e.msg,detail:e.detail||''},...p].slice(0,300))),
      window.ftps?.on('app:request-close',()=>setShowCloseConfirm(true)),
      window.ftps?.on('ftps:pairing-status',d=>{if(d.status==='ready')setPairingInfo({ip:d.ip,method:d.method})}),
      // FIX: mDNS discovered peers
      window.ftps?.on('ftps:peers-discovered',list=>setDiscoveredPeers(list||[])),
      // FIX: Session restore signal from main process (sent after renderer reload)
      window.ftps?.on('app:session-active', sess=>{
        if(screen==='restoring'||screen==='setup'){
          const saved=readSavedSession()
          if(saved&&sess.nodeId===saved.nodeId){
            setAccount(saved.account); myId.current=saved.nodeId
            window.ftps?.setIdentity(saved.account.name, saved.nodeId)
            setScreen('main'); addLog('OK','Session restored after UI refresh')
          }
        }
      }),
    ]
    return()=>us.forEach(u=>u?.())
  },[screen])

  // Load logs from main
  useEffect(()=>{window.ftps?.getLogs().then(l=>setLogs((l||[]).reverse().slice(0,300))).catch(()=>{})},[])

  // FIX: Session restore on mount — if sessionStorage has session data AND main process confirms
  // an active session, skip the setup screen (handles Refresh UI without losing session)
  useEffect(()=>{
    if(screen!=='restoring')return
    const saved=readSavedSession()
    if(!saved){setScreen('setup');return}
    window.ftps?.getSession().then(sess=>{
      if(sess?.active&&sess.nodeId===saved.nodeId){
        setAccount(saved.account); myId.current=saved.nodeId
        // Re-announce identity to main process (in case it lost it — shouldn't happen but safe)
        window.ftps?.setIdentity(saved.account.name, saved.nodeId)
        setScreen('main'); addLog('OK','Session restored after UI refresh')
      } else {
        // Main process has no active session (full restart, not reload) — go to setup
        clearSavedSession(); setScreen('setup')
      }
    }).catch(()=>{ clearSavedSession(); setScreen('setup') })
  },[])  // eslint-disable-line
  useEffect(()=>{
    bridgeRef.current=new TCPBridge({
      onOpen(pid, pn, fingerprint, tofu, tofuDetail, identityKey){
        setPeers(ps=>{const ex=ps.find(p=>p.id===pid);if(ex)return ps.map(p=>p.id===pid?{...p,online:true,reconnecting:false,name:p.name||pn}:p);return[...ps,{id:pid,name:pn,online:true,reconnecting:false}]})
        if(fingerprint) setPeerFingerprints(fp=>({...fp,[pid]:fingerprint}))
        if(identityKey)  setPeerIdentityKeys(ik=>({...ik,[pid]:identityKey}))  // store for tofuAccept
        // TOFU status
        if(tofu==='changed'){
          setShowTofuWarn({peerId:pid, peerName:pn, tofuDetail})
          pushMsg(pid,{id:Date.now(),from:'sys',type:'sys',text:`⚠️ WARNING: Peer key has changed! Verify identity before continuing.`,time:now8()})
        } else if(tofu==='trusted'){
          pushMsg(pid,{id:Date.now(),from:'sys',type:'sys',text:`🔒 Connected · Trusted peer · ECDH P-256 · AES-256-GCM`,time:now8()})
        } else {
          pushMsg(pid,{id:Date.now(),from:'sys',type:'sys',text:`🔒 Connected · New peer · ECDH P-256 · AES-256-GCM`,time:now8()})
        }
        if(fingerprint) pushMsg(pid,{id:Date.now()+1,from:'sys',type:'sys',text:`🔑 Session fingerprint: ${fingerprint}`,time:now8()})
        addLog('OK',`Connected: ${pn||pid}`,fingerprint?`FP: ${fingerprint}`:'')
        notify(`${pn||'Peer'} connected`,'ok')
        setTab('peers')
      },
      onClose(pid){
        // Only show disconnected after all reconnect attempts are exhausted
        setPeers(ps=>ps.map(p=>p.id===pid?{...p,online:false,reconnecting:false}:p))
        pushMsg(pid,{id:Date.now(),from:'sys',type:'sys',text:'⚠ Disconnected',time:now8()})
        addLog('WARN','Disconnected',pid)
        notify('Peer disconnected','err')
      },
      onReconnecting(pid, attempt, maxAttempts){
        // Invisible to user — just mark peer as reconnecting, don't show disconnect
        setPeers(ps=>ps.map(p=>p.id===pid?{...p,reconnecting:true}:p))
        addLog('INFO',`Reconnecting to ${pid}`,`attempt ${attempt}/${maxAttempts}`)
      },
      onMsg(pid,msg){
        if(msg.type==='chat')pushMsg(pid,{id:Date.now(),from:'them',type:'text',text:msg.text,time:now8()})
        else if(msg.type==='folder_share')pushMsg(pid,{id:Date.now(),from:'them',type:'folder',folder:msg.folder,time:now8()})
        else if(msg.type==='revoke')setMsgs(p=>({...p,[pid]:(p[pid]||[]).map(m=>m.id===msg.targetId?{...m,text:'🚫 Revoked',type:'text'}:m)}))
      },
      onFileStart(pid,meta){pushMsg(pid,{id:meta.fid+'_in',from:'them',type:'file_in',meta,pct:0,time:now8()})},
      onFileProg(pid,fid,pct){setMsgs(p=>({...p,[pid]:(p[pid]||[]).map(m=>m.id===fid+'_in'?{...m,pct}:m)}))},
      onFileDone(pid,meta,blob){
        setMsgs(p=>({...p,[pid]:(p[pid]||[]).map(m=>m.id===meta.fid+'_in'?{...m,type:'file_done',pct:1,blob}:m)}))
        addLog('OK',`Received: ${meta.name}`,fmtSz(meta.size||0))
        notify(`Received: ${meta.name}`,'ok')
      },
    })
    return()=>bridgeRef.current?.destroy?.()
  },[pushMsg,addLog,notify])

  const onlinePeers=peers.filter(p=>p.online)
  const peerMsgs=msgs[selPeer?.id]||[]
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'})},[peerMsgs.length])

  // ── ACTIONS ──────────────────────────────────────────────────────────────────
  const doSetup=async()=>{
    const e={}
    if(!form.name.trim())e.name='Required'
    if(!form.passphrase.trim())e.passphrase='Required'
    const pw=form.password
    if(!pw||pw.length<6)e.password='Min 6 chars'
    else if(!/[A-Z]/.test(pw))e.password='Needs uppercase'
    else if(!/[a-z]/.test(pw))e.password='Needs lowercase'
    else if(!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw))e.password='Needs special char'
    if(Object.keys(e).length){setFErr(e);return}
    keyRef.current=await generateKeyPair()
    myId.current=makeId(form.name)
    const res = await window.ftps?.setIdentity(form.name.trim(),myId.current)
    if(res?.nodeId) myId.current = res.nodeId
    setAccount(form); lastAct.current=Date.now(); setLockTimer(sett.lockMin*60)
    // FIX: save session to sessionStorage so Refresh UI can restore without re-setup
    saveSession(form, myId.current)
    addLog('OK',`Session started: ${form.name}`)
    setScreen('main'); notify('Session ready','ok')
  }

  const doUnlock=()=>{
    if(lockForm.pp===account.passphrase&&lockForm.pw===account.password){
      setScreen('main'); setLockErr(''); setLockTries(0); setLockForm({pp:'',pw:''}); lastAct.current=Date.now()
      addLog('OK','Session unlocked')
    } else {
      const t=lockTries+1; setLockTries(t); addLog('WARN',`Failed unlock attempt ${t}`)
      if(t>=sett.maxTries){
        addLog('ERR','Max attempts — session wiped')
        bridgeRef.current?.closeAll(); setAccount(null); setScreen('setup')
        setMsgs({}); setPeers([]); setForm({name:'',passphrase:'',password:''}); setLockTries(0); setLockErr('')
      } else setLockErr(`Wrong · ${sett.maxTries-t} attempt${sett.maxTries-t!==1?'s':''} left`)
    }
  }

  const doLock=()=>{ setScreen('locked'); setLockForm({pp:'',pw:''}); addLog('INFO','Session locked') }
  const doTerminate=()=>{ clearSavedSession(); window.ftps?.clearSession(); addLog('INFO','Session ended'); bridgeRef.current?.closeAll(); setAccount(null); setScreen('setup'); setMsgs({}); setPeers([]); setForm({name:'',passphrase:'',password:''}) }

  const doListen=async()=>{
    setUpnpSt({status:'discovering'}); setPairingCode(''); setPairingInfo(null)
    const r=await window.ftps?.listen(parseInt(listenPort)||0,sett.useUpnp)
    if(!r){notify('Electron API unavailable','err');setUpnpSt(null);return}
    if(r.ok){setListenActive(true);setListenInfo({port:r.port,localIPs:r.localIPs});addLog('OK',`TCP server port ${r.port}`);notify(`Listening on :${r.port}`,'ok')}
    else{notify('Listen failed: '+r.error,'err');setUpnpSt(null)}
  }

  const doGetPairingCode=async()=>{
    if(!listenInfo)return
    notify('Discovering external IP…')
    const r=await window.ftps?.getPairingCode(listenInfo.port, sett.useStun)
    if(r?.ok){
      setPairingCode(r.code); setPairingInfo({ip:r.ip,method:r.method||'?'})
      navigator.clipboard?.writeText(r.code)
      addLog('OK',`Pairing code: ${r.ip}:${r.port}`,r.method)
      notify('Pairing code copied to clipboard!','ok')
    }
  }

  const doConnect=async()=>{
    const t=connectAddr.trim(); if(!t){notify('Enter IP:port','err');return}
    const parts=t.split(':'); if(parts.length<2||!parts[0]||!parts[1]){notify('Format: 192.168.x.x:7474','err');return}
    setConnState('connecting'); setConnErr('')
    const r=await window.ftps?.connect(parts[0],parts[1])
    if(!r){notify('Electron API unavailable','err');setConnState('idle');return}
    if(r.ok){setConnState('done');notify('Connected — handshaking…')}
    else{setConnState('error');setConnErr(r.error||'Failed');addLog('ERR','Connect failed',r.error||'');notify('Failed: '+(r.error||''),'err')}
  }

  const doConnectCode=async()=>{
    if(!pairingInput.trim()){notify('Enter pairing code','err');return}
    setConnState('connecting'); setConnErr('')
    const r=await window.ftps?.connectPairingCode(pairingInput.trim())
    if(!r){notify('Electron API unavailable','err');setConnState('idle');return}
    if(r.ok){setConnState('done');notify('Connected — handshaking…')}
    else{setConnState('error');setConnErr(r.error||'Invalid code');notify('Failed: '+(r.error||''),'err')}
  }

  const doSend=async()=>{
    if(!input.trim()||!selPeer)return
    const text=input.trim(); setInput('')
    if(!await bridgeRef.current?.sendMsg(selPeer.id,text)){notify('Peer not connected','err');return}
    pushMsg(selPeer.id,{id:Date.now(),from:'me',type:'text',text,time:now8()})
  }

  const doSendFile=async file=>{
    if(!selPeer)return; setShowAttach(false)
    const mid=Date.now()
    pushMsg(selPeer.id,{id:mid,from:'me',type:'file_out',meta:{name:file.name,size:file.size},pct:0,time:now8()})
    addLog('INFO',`Sending: ${file.name}`,fmtSz(file.size))
    const ok=await bridgeRef.current?.sendFile(selPeer.id,file,pct=>setMsgs(p=>({...p,[selPeer.id]:(p[selPeer.id]||[]).map(m=>m.id===mid?{...m,pct}:m)})))
    setMsgs(p=>({...p,[selPeer.id]:(p[selPeer.id]||[]).map(m=>m.id===mid?{...m,pct:1}:m)}))
    ok?notify(`Sent: ${file.name}`,'ok'):notify('Send failed','err')
  }

  const doSendFolder=async files=>{
    if(!selPeer||!files.length)return; setShowAttach(false)
    const tree={}
    for(const f of files){const parts=f.webkitRelativePath.split('/');let n=tree;for(let i=0;i<parts.length-1;i++){if(!n[parts[i]])n[parts[i]]={type:'dir',children:{}};n=n[parts[i]].children}n[parts[parts.length-1]]={type:'file',file:f}}
    const rn=Object.keys(tree)[0]; if(!rn)return
    const load=async n=>{
      if(n.type==='file'){const b64=await new Promise(r=>{const rd=new FileReader();rd.onload=()=>r(rd.result.split(',')[1]);rd.readAsDataURL(n.file)});return{type:'file',size:n.file.size,mime:n.file.type,d:b64}}
      const out={type:'dir',children:{}}; for(const[k,v]of Object.entries(n.children))out.children[k]=await load(v); return out
    }
    const payload={name:rn,children:(await load(tree[rn])).children}
    if(!await bridgeRef.current?.sendMsg(selPeer.id,{type:'folder_share',folder:payload})){notify('Send failed','err');return}
    pushMsg(selPeer.id,{id:Date.now(),from:'me',type:'folder',folder:payload,time:now8()})
    notify(`Shared: ${rn}`,'ok')
  }

  const doExtract=async data=>{
    if(sett.warnArch) setShowArchConfirm(data)
    else doExtractAction(data)
  }
  const doExtractAction=async({name,dataB64})=>{
    setShowArchConfirm(null); setSandboxLoading(true)
    const r=await window.ftps?.extractArchive(name,dataB64)
    setSandboxLoading(false)
    if(r?.ok){setSandbox({name:r.name,sandboxDir:r.sandboxDir,sandboxId:r.sandboxId,tree:r.tree});notify('Archive extracted','ok')}
    else notify('Extract failed: '+(r?.error||'Unknown'),'err')
  }

  const doRevoke=async mid=>{
    if(!selPeer)return
    if(await bridgeRef.current?.sendMsg(selPeer.id,{type:'revoke',targetId:mid}))
      setMsgs(p=>({...p,[selPeer.id]:(p[selPeer.id]||[]).map(m=>m.id===mid?{...m,text:'🚫 Revoked',type:'text'}:m)}))
  }

  const doDeletePeer=pid=>{ bridgeRef.current?.disconnect(pid); setPeers(ps=>ps.filter(p=>p.id!==pid)); if(selPeer?.id===pid)setSelPeer(null); notify('Peer removed') }

  const upnpBadge=()=>{
    if(!upnpSt)return null
    const MAP={discovering:{c:T.amber,t:'🔍 Scanning for UPnP router…'},connecting:{c:T.amber,t:'⟳ Requesting port mapping…'},mapped:{c:T.green,t:`✓ UPnP mapped · ${upnpSt.port}${upnpSt.externalIp?' · '+upnpSt.externalIp:''}`},failed:{c:T.muted,t:'○ UPnP not available — STUN fallback active'}}
    const m=MAP[upnpSt.status]; if(!m)return null
    return<div style={{marginTop:8,padding:'6px 9px',background:m.c+'0e',border:`1px solid ${m.c}22`,borderRadius:6,fontSize:11,color:m.c}}>{m.t}</div>
  }

  // ── RESTORING (Refresh UI in progress) ────────────────────────────────────
  if(screen==='restoring')return(
    <div style={{height:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <style>{G}</style>
      <div style={{textAlign:'center'}} className="fadein">
        <div style={{width:50,height:50,borderRadius:13,background:T.accent+'16',border:`1px solid ${T.accent}28`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 14px'}}>🔐</div>
        <div style={{fontSize:18,color:T.text,fontWeight:700,letterSpacing:2,marginBottom:4}}>P2N</div>
        <div style={{fontSize:11,color:T.accent,marginBottom:16}}>Peer-Networking</div>
        <div className="spin" style={{width:24,height:24,border:`2px solid ${T.border}`,borderTopColor:T.accent,borderRadius:'50%',margin:'0 auto 10px'}}/>
        <div style={{fontSize:12,color:T.textDim}}>Restoring session…</div>
        <div style={{fontSize:10,color:T.muted,marginTop:4}}>Peer connections are unaffected</div>
      </div>
    </div>
  )

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if(screen==='setup')return(
    <div style={{height:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <style>{G}</style><Toast n={toast}/>
      <div style={{width:'100%',maxWidth:390}} className="fadeup">
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{width:54,height:54,borderRadius:14,background:`linear-gradient(135deg,${T.accent}22,${T.accentDim}18)`,border:`1.5px solid ${T.accent}35`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,margin:'0 auto 12px',boxShadow:`0 0 24px ${T.accent}18`}}>🔐</div>
          <div style={{fontSize:26,color:T.text,fontWeight:800,letterSpacing:1}}>P2N-Peer-Networking</div>
          <div style={{fontSize:10,color:T.textDim,marginTop:5,display:'flex',gap:5,justifyContent:'center',flexWrap:'wrap'}}>
            <span style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,padding:'1px 6px'}}>Direct TCP</span>
            <span style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,padding:'1px 6px'}}>ECDH P-256</span>
            <span style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,padding:'1px 6px'}}>AES-256-GCM</span>
            <span style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:4,padding:'1px 6px'}}>TOFU</span>
          </div>
        </div>
        <div className="card" style={{padding:22}}>
          <div className="sh">New Session</div>
          {[{k:'name',l:'Display Name',type:'text',ph:'Your alias'},{k:'passphrase',l:'Passphrase (to unlock)',type:'text',ph:'Memorable phrase',extra:<button onClick={()=>setForm(p=>({...p,passphrase:phrase()}))} className="btn btn-ghost btn-xs" title="Generate random passphrase">🎲</button>},{k:'password',l:'Password (A-Z + special)',type:'password',ph:'Second factor'}].map(f=>(
            <div key={f.k} style={{marginBottom:13}}>
              <div style={{fontSize:11,marginBottom:4,display:'flex',justifyContent:'space-between',color:fErr[f.k]?T.red:T.textDim}}><span>{f.l}</span>{fErr[f.k]&&<span style={{color:T.red,fontSize:10}}>{fErr[f.k]}</span>}</div>
              <div style={{display:'flex',gap:6}}>
                <input value={form[f.k]} type={f.type} placeholder={f.ph} className={`inp${fErr[f.k]?' err':''}`}
                  onChange={e=>{setForm(p=>({...p,[f.k]:e.target.value}));setFErr(p=>({...p,[f.k]:''}))} }
                  onKeyDown={e=>e.key==='Enter'&&doSetup()} style={{flex:1}}/>
                {f.extra}
              </div>
            </div>
          ))}
          <div style={{background:T.panel,borderRadius:6,padding:'9px 12px',marginBottom:15,fontSize:11,lineHeight:1.8}}>
            <div style={{color:T.textDim}}>🔒 Auto-locks after {sett.lockMin} min inactivity</div>
            <div style={{color:T.amber}}>⚠ {sett.maxTries} wrong unlock attempts = session reset</div>
          </div>
          <button onClick={doSetup} className="btn btn-primary" style={{width:'100%',padding:11,fontSize:13,marginBottom:7}}>Start Session →</button>
          <button onClick={()=>setShowHelp(true)} className="btn btn-ghost" style={{width:'100%',padding:9,fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <span>📖</span> Help &amp; Documentation
          </button>
        </div>
      </div>
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
    </div>
  )



  // ── LOCK ──────────────────────────────────────────────────────────────────
  if(screen==='locked')return(
    <div style={{height:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <style>{G}</style><Toast n={toast}/>
      <div style={{width:'100%',maxWidth:330}} className="fadeup">
        <div style={{textAlign:'center',marginBottom:22}}>
          <div style={{fontSize:36,marginBottom:8}}>🔒</div>
          <div style={{fontSize:15,color:T.text,fontWeight:600}}>Session Locked</div>
          {lockTries>0&&<div style={{fontSize:12,color:lockTries>=3?T.red:T.amber,marginTop:6}}>{lockTries} failed · {sett.maxTries-lockTries} left</div>}
        </div>
        <div className="card" style={{padding:22}}>
          <div style={{marginBottom:11}}><div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Passphrase</div><input type="password" value={lockForm.pp} placeholder="Enter passphrase" className="inp" onChange={e=>setLockForm(p=>({...p,pp:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&doUnlock()}/></div>
          <div style={{marginBottom:15}}><div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Password</div><input type="password" value={lockForm.pw} placeholder="Enter password" className="inp" onChange={e=>setLockForm(p=>({...p,pw:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&doUnlock()}/></div>
          {lockErr&&<div style={{fontSize:12,color:T.red,marginBottom:11}}>{lockErr}</div>}
          <button onClick={doUnlock} className="btn btn-amber" style={{width:'100%',padding:10,fontSize:13}}>Unlock</button>
        </div>
      </div>
    </div>
  )

  // ── MAIN ──────────────────────────────────────────────────────────────────
  return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden',background:T.bg}}>
      <style>{G}</style>
      <Toast n={toast}/>
      {folderView&&<FolderViewer folder={folderView} onClose={()=>setFolderView(null)}/>}
      {fileView&&<FileViewer file={fileView} onClose={()=>setFileView(null)}/>}
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
      {showCode&&selPeer&&<CodeEditor onSend={async t=>{if(!selPeer)return;if(await bridgeRef.current?.sendMsg(selPeer.id,t))pushMsg(selPeer.id,{id:Date.now(),from:'me',type:'text',text:t,time:now8()})}} onClose={()=>setShowCode(false)}/>}
      {showCloseConfirm&&<CloseConfirm onCancel={()=>setShowCloseConfirm(false)}/>}
      {showVerify&&<VerifyModal fingerprint={showVerify.fingerprint} peerName={showVerify.peerName} onClose={()=>setShowVerify(null)} onVerified={()=>{if(selPeer)setVerifiedPeers(s=>{const n=new Set(s);n.add(selPeer.id);return n})}}/>}
      {showTofuWarn&&<TofuWarning data={showTofuWarn} onReject={()=>{bridgeRef.current?.disconnect(showTofuWarn.peerId);setShowTofuWarn(null);notify('Disconnected — key mismatch','err')}} onAccept={()=>{
        window.ftps?.tofuAccept(showTofuWarn.peerId, peerIdentityKeys[showTofuWarn.peerId]||null, showTofuWarn.peerName)
        setShowTofuWarn(null);notify('New identity accepted — peer trusted','ok')
      }}/>}
      {showLinkConfirm&&<div className="overlay" style={{zIndex:600}}><div className="card fadeup" style={{width:320,padding:20,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>🌐</div>
        <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Open External Link?</div>
        <div style={{fontSize:12,color:T.textDim,marginBottom:18,lineHeight:1.5,wordBreak:'break-all'}}>This will open your browser to:<br/><span style={{color:T.accent,fontWeight:600}}>{showLinkConfirm}</span></div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setShowLinkConfirm(null)} className="btn btn-ghost" style={{flex:1}}>Cancel</button>
          <button onClick={()=>{window.ftps?.openExternal(showLinkConfirm);setShowLinkConfirm(null)}} className="btn btn-primary" style={{flex:1}}>Open</button>
        </div>
      </div></div>}
      {showArchConfirm&&<div className="overlay" style={{zIndex:600}}><div className="card fadeup" style={{width:340,padding:22,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>📦</div>
        <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Sandbox Archive?</div>
        <div style={{fontSize:12,color:T.textDim,marginBottom:18,lineHeight:1.6}}>This will extract the file to an isolated <strong>Sandbox</strong>. You should scan the contents for threats before opening any files.</div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setShowArchConfirm(null)} className="btn btn-ghost" style={{flex:1}}>Cancel</button>
          <button onClick={()=>doExtractAction(showArchConfirm)} className="btn btn-amber" style={{flex:1}}>Extract to Sandbox</button>
        </div>
      </div></div>}
      {sandboxLoading&&<div style={{position:'fixed',inset:0,background:'#000a',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
        <div className="spin" style={{width:32,height:32,border:`3px solid ${T.border}`,borderTopColor:T.accent,borderRadius:'50%'}}/>
        <div style={{color:T.textDim,fontSize:13}}>Extracting archive…</div>
      </div>}

      <TitleBar account={account} nodeId={myId.current} onlinePeers={onlinePeers.length} onLock={doLock} onTerminate={doTerminate} uptime={uptime} onClose={()=>setShowCloseConfirm(true)} onHelp={()=>setTab('docs')}/>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* ── SIDEBAR ── */}
        <div style={{width:158,background:T.surface,borderRight:`1px solid ${T.border}`,display:'flex',flexDirection:'column',flexShrink:0,padding:'6px 5px'}}>
          {/* User */}
          <div className="glass" style={{padding:'10px 10px',marginBottom:10,borderRadius:10}}>
            {editName?(
              <div>
                <input value={nameInput} onChange={e=>setNameInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){const n=nameInput.trim();if(n){setAccount(a=>({...a,name:n}));myId.current=makeId(n);window.ftps?.setIdentity(n,myId.current);setEditName(false);notify('Name updated','ok')}};if(e.key==='Escape')setEditName(false)}}
                  className="inp" style={{fontSize:11,padding:'4px 7px',marginBottom:4}} autoFocus/>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>{const n=nameInput.trim();if(n){setAccount(a=>({...a,name:n}));myId.current=makeId(n);window.ftps?.setIdentity(n,myId.current);setEditName(false);notify('Name updated','ok')}}} className="btn btn-green btn-xs" style={{flex:1}}>✓</button>
                  <button onClick={()=>setEditName(false)} className="btn btn-ghost btn-xs" style={{flex:1}}>✕</button>
                </div>
              </div>
            ):(
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <Av name={account?.name} id={myId.current} size={26} online/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{account?.name}</div>
                  <div style={{fontSize:9,color:T.muted}}>{myId.current}</div>
                </div>
                <button onClick={()=>{setNameInput(account?.name||'');setEditName(true)}} style={{background:'none',border:'none',color:T.textDim,fontSize:10,cursor:'pointer',padding:2,flexShrink:0}}>✎</button>
              </div>
            )}
          </div>

          {/* Nav items */}
          {[
            {id:'connect',icon:'⊕',label:'Connect'},
            {id:'peers',  icon:'◉',label:'Network'},
            {id:'logs',   icon:'📋',label:'Logs',badge:logs.filter(l=>l.level==='ERR').length},
            {id:'network',icon:'⬡',label:'My Network'},
            {id:'stats',  icon:'▲',label:'Stats'},
            {id:'settings',icon:'⚙',label:'Settings'},
            {id:'docs',   icon:'📖',label:'Docs'},
          ].map(it=>(
            <button key={it.id} onClick={()=>{setTab(it.id);if(it.id!=='peers')setSelPeer(null)}} className={`nav-item${tab===it.id?' act':''}`}>
              <span style={{width:17,textAlign:'center',fontSize:13,flexShrink:0}}>{it.icon}</span>
              <span style={{flex:1}}>{it.label}</span>
              {it.badge>0&&<span style={{fontSize:9,background:T.red,color:'#fff',borderRadius:8,padding:'1px 4px',fontWeight:700}}>{it.badge}</span>}
            </button>
          ))}

          {/* Peer quick-list */}
          {peers.length>0&&<div style={{marginTop:9,borderTop:`1px solid ${T.border}`,paddingTop:7}}>
            <div style={{fontSize:9,color:T.muted,letterSpacing:1.5,fontWeight:600,padding:'0 6px',marginBottom:3}}>PEERS</div>
            {peers.map(p=>(
              <button key={p.id} onClick={()=>{setSelPeer(p);setTab('peers')}} className={`nav-item${selPeer?.id===p.id?' act':''}`} style={{gap:6}}>
                <Av name={p.name} id={p.id} size={20} online={p.online}/>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11,color:p.online?T.text:T.textDim}}>{p.name||p.id.slice(0,8)}</span>
              </button>
            ))}
          </div>}
          <div style={{flex:1}}/>
          <div style={{fontSize:10,color:T.muted,textAlign:'center',padding:'5px 0',fontVariantNumeric:'tabular-nums'}}>{fmt(uptime)}</div>
        </div>

        {/* ── CONTENT AREA (tabs + optional sandbox panel) ── */}
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* TAB CONTENT */}
          <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>

            {/* ── CONNECT ── */}
            {tab==='connect'&&(
              <div style={{flex:1,overflowY:'auto',padding:16}} className="fadein">
                <div style={{fontSize:10,color:T.accent,fontWeight:700,letterSpacing:2,marginBottom:16, marginLeft:4}}>⊕ CONNECT PEER</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                  {/* LISTEN */}
                  <div className="card glass glow-blue" style={{padding:16}}>
                    <div style={{fontSize:10,color:T.blue,letterSpacing:1.5,marginBottom:11,fontWeight:700}}>① LISTEN</div>
                    <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>Port</div>
                    <input value={listenPort} onChange={e=>setListenPort(e.target.value)} className="inp" placeholder="7474" style={{marginBottom:9}} disabled={listenActive}/>
                    {!listenActive
                      ?<button onClick={doListen} className="btn btn-blue" style={{width:'100%',padding:9}}>▶ Start Listening</button>
                      :<button onClick={doStopListen} className="btn btn-danger" style={{width:'100%',padding:9}}>■ Stop</button>}
                    {upnpBadge()}
                    {listenActive&&listenInfo&&<div style={{marginTop:9,background:T.green+'08',border:`1px solid ${T.green}20`,borderRadius:6,padding:9}}>
                      <div style={{fontSize:9,color:T.green,fontWeight:700,marginBottom:7,letterSpacing:1}}>● LISTENING</div>
                      {listenInfo.localIPs.map(({name,address})=>(
                        <div key={address} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                          <div><div style={{fontSize:12,color:T.text,fontWeight:600}}>{address}:{listenInfo.port}</div><div style={{fontSize:10,color:T.muted}}>{name}</div></div>
                          <button onClick={()=>{navigator.clipboard?.writeText(`${address}:${listenInfo.port}`);notify('Copied!','ok')}} className="btn btn-ghost btn-xs">⎘</button>
                        </div>
                      ))}
                      {upnpSt?.status==='mapped'&&upnpSt.externalIp&&(
                        <div style={{marginTop:7,padding:'6px 8px',background:T.green+'09',border:`1px solid ${T.green}28`,borderRadius:5}}>
                          <div style={{fontSize:9,color:T.green,fontWeight:700,marginBottom:3}}>✓ UPnP · INTERNET ADDRESS</div>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{fontSize:12,color:T.text,fontWeight:600}}>{upnpSt.externalIp}:{listenInfo.port}</span>
                            <button onClick={()=>{navigator.clipboard?.writeText(`${upnpSt.externalIp}:${listenInfo.port}`);notify('Copied!','ok')}} className="btn btn-green btn-xs">⎘</button>
                          </div>
                        </div>
                      )}
                      <button onClick={doGetPairingCode} className="btn btn-green btn-sm" style={{width:'100%',marginTop:9}}>🔑 Generate Pairing Code</button>
                      {pairingCode&&<div style={{marginTop:8,padding:'8px',background:T.accent+'08',border:`1px solid ${T.accent}22`,borderRadius:5}}>
                        <div style={{fontSize:9,color:T.accent,fontWeight:700,marginBottom:4,letterSpacing:1}}>PAIRING CODE {pairingInfo&&<span style={{color:T.muted,fontWeight:400}}>via {pairingInfo.method} · {pairingInfo.ip}</span>}</div>
                        <div style={{display:'flex',gap:5}}>
                          <input readOnly value={pairingCode} className="inp" style={{flex:1,fontSize:11,padding:'3px 7px'}}/>
                          <button onClick={()=>{navigator.clipboard?.writeText(pairingCode);notify('Copied!','ok')}} className="btn btn-ghost btn-xs">⎘</button>
                        </div>
                        <div style={{fontSize:10,color:T.muted,marginTop:4}}>Share this code — other peer pastes it below</div>
                      </div>}
                    </div>}
                  </div>

                  {/* DIAL */}
                  <div className="card" style={{padding:14}}>
                    <div style={{fontSize:10,color:T.purple,letterSpacing:1.5,marginBottom:11,fontWeight:700}}>② DIAL PEER</div>
                    <div style={{marginBottom:11,padding:'9px',background:T.purple+'08',border:`1px solid ${T.purple}18`,borderRadius:6}}>
                      <div style={{fontSize:9,color:T.purple,fontWeight:700,marginBottom:6,letterSpacing:1}}>PAIRING CODE</div>
                      <input value={pairingInput} onChange={e=>setPairingInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doConnectCode()} className="inp" placeholder="Paste code from peer…" style={{marginBottom:6,fontSize:11}}/>
                      <button onClick={doConnectCode} className="btn btn-purple" style={{width:'100%',padding:8}} disabled={connState==='connecting'||!pairingInput.trim()}>
                        {connState==='connecting'?'⟳ Connecting…':'→ Connect via Code'}
                      </button>
                    </div>
                    <div style={{fontSize:10,color:T.textDim,marginBottom:5,letterSpacing:1,fontWeight:600}}>OR MANUAL IP:PORT</div>
                    <input value={connectAddr} onChange={e=>setConnectAddr(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doConnect()} className="inp" placeholder="192.168.1.x:7474" style={{marginBottom:7}} disabled={connState==='connecting'}/>
                    <button onClick={doConnect} className="btn btn-ghost" style={{width:'100%',padding:8}} disabled={connState==='connecting'||!connectAddr.trim()}>→ Connect</button>
                    {connState==='done'&&<div style={{marginTop:7,padding:'6px 9px',background:T.green+'09',border:`1px solid ${T.green}22`,borderRadius:5,fontSize:11,color:T.green}}>✓ Connected — ECDH handshake active</div>}
                    {connState==='error'&&<div style={{marginTop:7,padding:'6px 9px',background:T.red+'09',border:`1px solid ${T.red}22`,borderRadius:5,fontSize:11,color:T.red}}>✕ {connErr||'Failed'}</div>}
                    {connState!=='idle'&&<button onClick={()=>{setConnState('idle');setConnErr('');setConnectAddr('');setPairingInput('')}} className="btn btn-ghost btn-xs" style={{marginTop:6,width:'100%'}}>Reset</button>}
                  </div>
                </div>

                <div className="card" style={{padding:12,fontSize:11,color:T.textDim,lineHeight:1.8}}>
                  <div style={{color:T.textMid,fontWeight:600,marginBottom:4}}>Quick reference</div>
                  <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'2px 11px'}}>
                    <span style={{color:T.green,fontWeight:700}}>Same WiFi</span><span>Local IP (192.168.x.x) — always works</span>
                    <span style={{color:T.accent,fontWeight:700}}>Internet</span><span>Start Listening → UPnP maps port → Get Code → share</span>
                    <span style={{color:T.amber,fontWeight:700}}>UPnP fails?</span><span>STUN auto-detects IP anyway · see Help › Internet</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── PEERS / CHAT ── */}
            {tab==='peers'&&(
              <div style={{flex:1,display:'flex',overflow:'hidden'}}>
                {!selPeer&&(
                  <div style={{flex:1,overflowY:'auto',padding:14}} className="fadein">
                    <div style={{fontSize:10,color:T.accent,fontWeight:700,letterSpacing:2,marginBottom:12}}>◉ NETWORK</div>
                    {!peers.length?(
                      <div style={{textAlign:'center',padding:'46px 20px',color:T.textDim}}>
                        <div style={{fontSize:34,marginBottom:11}}>⬡</div>
                        <div style={{fontSize:14,marginBottom:10,color:T.text}}>No peers yet</div>
                        <button onClick={()=>setTab('connect')} className="btn btn-primary">⊕ Connect Peer</button>
                      </div>
                    ):peers.map(p=>(
                      <div key={p.id} onClick={()=>setSelPeer(p)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 11px',borderRadius:7,cursor:'pointer',marginBottom:1,transition:'background .1s'}} onMouseEnter={e=>e.currentTarget.style.background=T.panel} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Av name={p.name} id={p.id} size={36} online={p.online}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name||<span style={{color:T.muted,fontStyle:'italic'}}>Unnamed</span>}</div>
                          <div style={{fontSize:11,color:p.online?T.green:T.muted,marginTop:1}}>{p.online?'● Online':'○ Offline'} · {p.id}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selPeer&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                    {/* Header */}
                    <div style={{padding:'8px 13px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:9,flexShrink:0,background:T.surface}}>
                      <button onClick={()=>setSelPeer(null)} style={{background:'none',border:'none',color:T.textDim,fontSize:16,cursor:'pointer',padding:'2px 5px',borderRadius:4}}>‹</button>
                      <Av name={selPeer.name} id={selPeer.id} size={32} online={selPeer.online}/>
                      <div style={{flex:1,minWidth:0}}>
                        <input value={selPeer.name||''} onChange={e=>{const n=e.target.value;setPeers(ps=>ps.map(p=>p.id===selPeer.id?{...p,name:n}:p));setSelPeer(p=>({...p,name:n}))}} placeholder="Name this peer…" style={{background:'none',border:'none',color:selPeer.name?T.text:T.muted,fontFamily:'inherit',fontSize:13,fontStyle:selPeer.name?'normal':'italic',width:'100%',outline:'none',fontWeight:600,padding:0}}/>
                        <div style={{fontSize:10,color:selPeer.reconnecting?T.amber:selPeer.online?T.green:T.red,marginTop:1}}>{selPeer.reconnecting?'⟳ Reconnecting…':selPeer.online?`🔒 E2E Encrypted${verifiedPeers.has(selPeer.id)?' · ✓ Verified':''}`:"⚠ Disconnected"}</div>
                      </div>
                      {selPeer.online&&<button onClick={()=>setShowVerify({fingerprint:peerFingerprints[selPeer.id],peerName:selPeer.name})} className="btn btn-xs" style={{background:verifiedPeers.has(selPeer.id)?T.green+'16':T.accent+'12',border:`1px solid ${verifiedPeers.has(selPeer.id)?T.green:T.accent}30`,color:verifiedPeers.has(selPeer.id)?T.green:T.accent,flexShrink:0}}>{verifiedPeers.has(selPeer.id)?'✓ Verified':'Verify'}</button>}
                      <button onClick={()=>setMsgs(p=>({...p,[selPeer.id]:[]}))} className="btn btn-ghost btn-xs">Clear</button>
                      <button onClick={()=>doDeletePeer(selPeer.id)} className="btn btn-danger btn-xs">Remove</button>
                    </div>
                    {/* Messages */}
                    <div style={{flex:1,overflowY:'auto',padding:'11px 13px 7px',display:'flex',flexDirection:'column',gap:7,background:T.bg}}>
                      {peerMsgs.map(msg=>(
                        <div key={msg.id} style={{display:'flex',flexDirection:'column',alignItems:msg.from==='me'?'flex-end':msg.from==='sys'?'center':'flex-start'}} className="fadein">
                          {msg.type==='sys'&&<div className="bub bub-sys">{msg.text}</div>}
                          {msg.type==='text'&&<div className={`bub bub-${msg.from==='me'?'me':'them'}`}>
                            <div style={{color:T.text}}
                                 onClick={e=>{
                                   const link = e.target.closest('.p2n-link');
                                   if(link){
                                     const url = link.dataset.url;
                                     if(sett.warnLinks) setShowLinkConfirm(url);
                                     else window.ftps?.openExternal(url);
                                   }
                                 }}
                                 dangerouslySetInnerHTML={{__html:sett.md?renderMD(msg.text):escH(msg.text).replace(/\n/g,'<br>')}}/>
                            <div style={{fontSize:10,color:T.muted,marginTop:3,textAlign:'right',display:'flex',justifyContent:'flex-end',gap:4}}>{msg.time}{msg.from==='me'&&<span style={{color:T.accentDim}}>✓</span>}</div>
                          </div>}
                          {['file_out','file_in','file_done'].includes(msg.type)&&<FileMsg msg={msg} onExtract={doExtract} onPreview={m=>setFileView(m)} onRevoke={doRevoke} warnArch={sett.warnArch}/>}
                          {msg.type==='folder'&&<FolderMsg msg={msg} onOpen={()=>setFolderView(msg.folder)} onRevoke={doRevoke}/>}
                        </div>
                      ))}
                      <div ref={chatEnd}/>
                    </div>
                    {/* Quick send */}
                    {selPeer.online&&<div style={{padding:'4px 11px',borderTop:`1px solid ${T.border}`,background:T.surface,display:'flex',gap:5,alignItems:'center',flexShrink:0}}>
                      <span style={{fontSize:10,color:T.muted,marginRight:3}}>Quick:</span>
                      <button onClick={()=>fileInp.current?.click()} className="btn btn-ghost btn-xs">📄 File</button>
                      <button onClick={()=>folderInp.current?.click()} className="btn btn-ghost btn-xs">📂 Folder</button>
                      <button onClick={()=>setShowCode(true)} className="btn btn-ghost btn-xs">{'</>'} Code</button>
                    </div>}
                    {/* Input */}
                    <div style={{padding:'8px 11px',borderTop:`1px solid ${T.border}`,background:T.surface,flexShrink:0}}>
                      <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend()}}} placeholder="Message… Shift+Enter = newline" rows={2} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:'7px 11px',color:T.text,fontFamily:'inherit',fontSize:13,resize:'none',lineHeight:1.5,transition:'border-color .12s'}} onFocus={e=>e.target.style.borderColor=T.accentDim} onBlur={e=>e.target.style.borderColor=T.border}/>
                        <button onClick={doSend} style={{width:34,height:34,borderRadius:8,background:input.trim()?T.accent:T.panel,border:`1px solid ${input.trim()?T.accent:T.border}`,color:input.trim()?'#0d1117':T.textDim,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .12s',fontWeight:700}}>↑</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── LOGS ── */}
            {tab==='logs'&&(
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}} className="fadein">
                <div style={{padding:'9px 14px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  <span style={{fontSize:10,color:T.accent,fontWeight:700,letterSpacing:2,flex:1}}>📋 SECURITY & EVENT LOG</span>
                  <button onClick={()=>{
                    const txt = logs.map(l=>`[${l.ts}] ${l.level}: ${l.msg} ${l.detail||''}`).join('\n')
                    navigator.clipboard.writeText(txt); notify('All logs copied!','ok')
                  }} className="btn btn-ghost btn-xs">Copy All</button>
                  <button onClick={()=>{
                    const txt = logs.map(l=>`[${l.ts}] ${l.level}: ${l.msg} ${l.detail||''}`).join('\n')
                    const blob = new Blob([txt], {type:'text/plain'})
                    const url = URL.createObjectURL(blob); const a = document.createElement('a')
                    a.href=url; a.download='p2n_security_log.txt'; a.click(); URL.revokeObjectURL(url)
                  }} className="btn btn-ghost btn-xs">Download .txt</button>
                  <button onClick={async()=>{await window.ftps?.clearLogs();setLogs([]);notify('Logs cleared')}} className="btn btn-ghost btn-xs">Clear</button>
                </div>
                <div style={{flex:1,overflowY:'auto'}}>
                  {!logs.length&&<div style={{textAlign:'center',padding:28,color:T.muted,fontSize:12}}>No events yet</div>}
                  {logs.map((l,i)=>{
                    const col=l.level==='OK'?T.green:l.level==='ERR'?T.red:l.level==='WARN'?T.amber:T.muted
                    return<div key={i} className="log-row" style={{cursor:'pointer'}} title="Click to copy log line" onClick={()=>{navigator.clipboard.writeText(`[${l.ts}] ${l.level}: ${l.msg} ${l.detail||''}`);notify('Copied log line','ok')}}>
                      <span style={{color:T.muted}}>{l.ts}</span>
                      <span style={{color:col,fontWeight:700}}>{l.level}</span>
                      <span style={{color:T.textMid}}>{l.msg}{l.detail?<span style={{color:T.muted}}> — {l.detail}</span>:''}</span>
                    </div>
                  })}
                </div>
              </div>
            )}

            {/* ── MY NETWORK ── */}
            {tab==='network'&&(
              <div style={{flex:1,overflowY:'auto',padding:16}} className="fadein">
                <div className="card glass glow-accent" style={{padding:16, marginBottom:16, position:'relative', overflow:'hidden'}}>
                  <div style={{fontSize:10, color:T.accent, fontWeight:700, letterSpacing:2, marginBottom:15}}>NETWORK TOPOLOGY</div>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-around', padding:'10px 0'}}>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:20, marginBottom:4}}>🏠</div>
                      <div style={{fontSize:9, color:T.textDim}}>ROUTER</div>
                      <div style={{fontSize:10, color:T.blue, fontWeight:600}}>{netDetails.gateway}</div>
                    </div>
                    <div style={{height:1, flex:1, background:T.border, margin:'0 10px', position:'relative'}}>
                      <div className="pulse" style={{position:'absolute', top:-4, left:'50%', width:8, height:8, borderRadius:'50%', background:T.accent}}/>
                    </div>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:20, marginBottom:4}}>💻</div>
                      <div style={{fontSize:9, color:T.textDim}}>LOCAL IP</div>
                      <div style={{fontSize:10, color:T.green, fontWeight:600}}>{netInfo[0]?.address || '…'}</div>
                    </div>
                    <div style={{height:1, flex:1, background:T.border, margin:'0 10px', position:'relative'}}>
                      <div className="pulse" style={{position:'absolute', top:-4, left:'50%', width:8, height:8, borderRadius:'50%', background:T.purple}}/>
                    </div>
                    <div style={{textAlign:'center', background:T.bg, padding:8, borderRadius:8, border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:20, marginBottom:4}}>🌐</div>
                      <div style={{fontSize:9, color:T.textDim}}>INTERNET</div>
                      <div style={{fontSize:10, color:T.amber, fontWeight:600}}>{publicIP}</div>
                    </div>
                  </div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                  <div className="card" style={{padding:14}}>
                    <div className="sh">DNS & Gateway</div>
                    {[
                      {l:'Gateway', v:netDetails.gateway, c:T.blue},
                      {l:'Primary DNS', v:netDetails.dnsServers[0] || 'Auto', c:T.purple},
                      {l:'Secondary DNS', v:netDetails.dnsServers[1] || '—'},
                      {l:'Public IP', v:publicIP, c:T.amber}
                    ].map((r,i)=>(
                      <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:i<3?`1px solid ${T.border}30`:'none'}}>
                        <span style={{fontSize:11, color:T.textDim}}>{r.l}</span>
                        <span style={{fontSize:11, color:r.c||T.text, fontFamily:'monospace', fontWeight:600}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="card" style={{padding:14}}>
                    <div className="sh">Protocol Info</div>
                    {[
                      {l:'Term', v:'TCP.FTPS (Files/Text)'},
                      {l:'Encryption', v:'AES-256-GCM'},
                      {l:'Key Exchange', v:'ECDH P-256'},
                      {l:'Identity', v:'TOFU Hash Verified', c:T.green}
                    ].map((r,i)=>(
                      <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:i<3?`1px solid ${T.border}30`:'none'}}>
                        <span style={{fontSize:11, color:T.textDim}}>{r.l}</span>
                        <span style={{fontSize:11, color:r.c||T.text, fontWeight:600}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{marginTop:16}}>
                  <div style={{fontSize:10, color:T.textDim, fontWeight:700, letterSpacing:2, marginBottom:12, marginLeft:4}}>INTERFACE DETAILS</div>
                  {netInfo.map((iface,i)=>(
                    <div key={i} className="card" style={{padding:14,marginBottom:10, borderLeft:`3px solid ${iface.address?T.green:T.muted}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9}}>
                        <div style={{fontSize:11,color:T.accent,fontWeight:700,letterSpacing:.5}}>{iface.name}</div>
                        <span style={{fontSize:9,color:iface.address?T.green:T.muted,fontWeight:800, padding:'2px 6px', background:iface.address?T.green+'15':T.muted+'15', borderRadius:4}}>{iface.address?'ACTIVE':'DISCONNECTED'}</span>
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                        {[
                          {l:'IPv4', v:iface.address || '—'},
                          {l:'Netmask', v:iface.netmask || '—'},
                          {l:'MAC Addr', v:iface.mac || '—'}
                        ].map((r,idx)=>(
                          <div key={idx} style={{fontSize:11}}>
                            <div style={{color:T.textDim, fontSize:9, marginBottom:2}}>{r.l}</div>
                            <div style={{fontFamily:'monospace', color:T.text}}>{r.v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* mDNS Discovered Peers */}
                {discoveredPeers.length>0&&(
                  <div className="card" style={{padding:14,marginBottom:10}}>
                    <div style={{fontSize:10,color:T.green,fontWeight:700,letterSpacing:1,marginBottom:9}}>📡 NEARBY PEERS (AUTO-DISCOVERED)</div>
                    {discoveredPeers.map((dp,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:`1px solid ${T.border}`}}>
                        <div>
                          <div style={{fontSize:12,color:T.text,fontWeight:600}}>{dp.name||'Unknown'}</div>
                          <div style={{fontSize:10,color:T.textDim,fontFamily:'monospace'}}>{dp.address}:{dp.port}</div>
                        </div>
                        <button onClick={async()=>{
                          notify(`Connecting to ${dp.name||dp.address}…`,'ok')
                          const r=await window.ftps?.connect(dp.address,dp.port)
                          if(r?.ok){notify('Connected!','ok')}else{notify('Failed: '+(r?.error||'unknown'),'err')}
                        }} className="btn btn-ghost btn-sm" style={{color:T.green,border:`1px solid ${T.green}30`}}>⚡ Connect</button>
                      </div>
                    ))}
                    <div style={{fontSize:10,color:T.muted,marginTop:8}}>📡 Peers auto-discovered via mDNS on your local network</div>
                  </div>
                )}
                {discoveredPeers.length===0&&listenActive&&(
                  <div style={{padding:'10px 12px',background:T.panel,border:`1px solid ${T.border}`,borderRadius:6,fontSize:11,color:T.textDim,marginBottom:10}}>
                    📡 Scanning for nearby peers… (mDNS discovery active)
                  </div>
                )}
              </div>
            )}

            {/* ── STATS ── */}
            {tab==='stats'&&(
              <div style={{flex:1,overflowY:'auto',padding:16}} className="fadein">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:16}}>
                  <div style={{fontSize:10,color:T.accent,fontWeight:700,letterSpacing:2}}>▲ TECHNICAL DASHBOARD</div>
                  <div style={{fontSize:9,color:T.muted}}>Real-time frequency: 1,500ms</div>
                </div>

                <div className="card glass glow-blue" style={{background:`linear-gradient(180deg, ${T.panel}, ${T.bg})`, padding:16, marginBottom:16}}>
                  <div style={{fontSize:10, color:T.blue, fontWeight:700, letterSpacing:2, marginBottom:15}}>LIVE BITRATE MONITOR</div>
                  <div style={{display:'flex', gap:20}}>
                    <BandwidthGraph data={bwHistory.out} color={T.blue} label="OUTBOUND DATA"/>
                    <BandwidthGraph data={bwHistory.in} color={T.green} label="INBOUND DATA"/>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <div className="card" style={{padding:16}}>
                    <div className="sh" style={{marginBottom:15}}>System Resources</div>
                    <ResourceBar label="Process RAM (RSS)" val={sysStats?.rss||0} max={1024*1024*1024} col={T.purple}/>
                    <ResourceBar label="CPU Load Avg" val={(sysStats?.loadAvg||0)*100} max={100} col={T.blue}/>
                    <ResourceBar label="Heap Used" val={sysStats?.heapUsed||0} max={sysStats?.heapTotal||1} col={T.accent}/>
                    <div style={{marginTop:10, background:T.bg, padding:8, borderRadius:6, border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:9, color:T.muted, textTransform:'uppercase', marginBottom:4}}>Internal Node Engine</div>
                      <div style={{fontSize:11, color:T.textMid, fontFamily:'monospace'}}>{sysStats?.nodeVer || '…'}</div>
                    </div>
                  </div>
                  <div className="card" style={{padding:16}}>
                    <div className="sh" style={{marginBottom:15}}>OS & Hardware</div>
                    {[
                      {l:'Architecture', v:sysStats?.arch || '…'},
                      {l:'Platform', v:sysStats?.platform || '…'},
                      {l:'OS Release', v:sysStats?.osRelease || '…'},
                      {l:'Host Uptime', v:Math.floor((sysStats?.osUptime||0)/3600) + ' hrs'},
                    ].map((r,i)=>(
                      <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:i<3?`1px solid ${T.border}20`:'none'}}>
                        <span style={{fontSize:11, color:T.textDim}}>{r.l}</span>
                        <span style={{fontSize:11, color:T.text, fontWeight:600}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:16}}>
                   {[
                     {l:'Bytes Sent',v:fmtSz(sysStats?.bytesSent||0), c:T.blue},
                     {l:'Bytes Recv',v:fmtSz(sysStats?.bytesReceived||0), c:T.green},
                     {l:'Online Peers',v:onlinePeers.length, c:T.accent},
                     {l:'Session Time',v:fmt(uptime), c:T.purple}
                   ].map((s,i)=>(
                    <div key={i} className="card" style={{padding:12, background:`linear-gradient(45deg, ${T.surface}, ${T.panel})`}}>
                      <div style={{fontSize:9, color:T.textDim, textTransform:'uppercase', letterSpacing:1, marginBottom:4}}>{s.l}</div>
                      <div style={{fontSize:15, fontWeight:800, color:s.c}}>{s.v}</div>
                    </div>
                   ))}
                </div>

                <div className="card" style={{padding:12, background:T.panel+'80'}}>
                  <div className="sh" style={{marginBottom:10}}>LIVE CONNECTIVITY FEED</div>
                  <div style={{maxHeight:120, overflowY:'auto', fontSize:11, fontFamily:'monospace'}}>
                    {logs.slice(0,5).map((l,i)=>(
                      <div key={i} style={{marginBottom:4, borderLeft:`2px solid ${l.level==='OK'?T.green:l.level==='ERR'?T.red:T.muted}`, paddingLeft:8}}>
                        <span style={{color:T.muted}}>[{l.ts}]</span> <span style={{color:l.level==='OK'?T.green:T.text}}>{l.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── SETTINGS ── */}
            {tab==='settings'&&(
              <div style={{flex:1,overflowY:'auto',padding:16}} className="fadein">
                <div style={{fontSize:10,color:T.accent,fontWeight:700,letterSpacing:2,marginBottom:16}}>⚙ SETTINGS</div>
                <div className="card" style={{padding:14,marginBottom:11}}>
                  <div className="sh">Security & System</div>
                  {[{k:'lockMin',l:'Auto-lock (minutes)',min:1,max:60},{k:'maxTries',l:'Max unlock attempts',min:1,max:10}].map(s=>(
                    <div key={s.k} style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                      <div style={{flex:1,fontSize:12,color:T.text}}>{s.l}</div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <button onClick={()=>setSett2(p=>({...p,[s.k]:Math.max(s.min,p[s.k]-1)}))} className="btn btn-ghost" style={{padding:'2px 8px',fontSize:14}}>−</button>
                        <span style={{fontSize:13,color:T.accent,width:24,textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{sett[s.k]}</span>
                        <button onClick={()=>setSett2(p=>({...p,[s.k]:Math.min(s.max,p[s.k]+1)}))} className="btn btn-ghost" style={{padding:'2px 8px',fontSize:14}}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card" style={{padding:14,marginBottom:11}}>
                  <div className="sh">Network</div>
                  <div style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                    <div style={{flex:1,fontSize:12,color:T.text}}>Default Listen Port</div>
                    <input type="number" min="1024" max="65535" value={listenPort} onChange={e=>setListenPort(e.target.value)} className="inp" style={{width:80,padding:'4px 8px',fontSize:12,textAlign:'center'}} disabled={listenActive}/>
                  </div>
                  <div style={{display:'flex',alignItems:'center',padding:'8px 0'}}>
                    <div style={{flex:1,fontSize:12,color:T.text}}>UPnP Auto-forwarding</div>
                    <button onClick={()=>setSett2(p=>({...p,useUpnp:!p.useUpnp}))} className="btn btn-xs" style={{background:sett.useUpnp?T.green+'16':T.panel,border:`1px solid ${sett.useUpnp?T.green:T.border}`,color:sett.useUpnp?T.green:T.textDim,minWidth:36}}>
                      {sett.useUpnp?'ON':'OFF'}
                    </button>
                  </div>
                </div>
                <div className="card" style={{padding:14,marginBottom:11}}>
                  <div className="sh">Preferences</div>
                  <div style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                    <div style={{flex:1,fontSize:12,color:T.text}}>Warning on external links</div>
                    <button onClick={()=>setSett2(p=>({...p,warnLinks:!p.warnLinks}))} className="btn btn-xs" style={{background:sett.warnLinks?T.accent+'16':T.panel,border:`1px solid ${sett.warnLinks?T.accent:T.border}`,color:sett.warnLinks?T.accent:T.textDim,minWidth:36}}>
                      {sett.warnLinks?'ON':'OFF'}
                    </button>
                  </div>
                  <div style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                    <div style={{flex:1,fontSize:12,color:T.text}}>Archive security warnings</div>
                    <button onClick={()=>setSett2(p=>({...p,warnArch:!p.warnArch}))} className="btn btn-xs" style={{background:sett.warnArch?T.accent+'16':T.panel,border:`1px solid ${sett.warnArch?T.accent:T.border}`,color:sett.warnArch?T.accent:T.textDim,minWidth:36}}>
                      {sett.warnArch?'ON':'OFF'}
                    </button>
                  </div>
                  <div style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                    <div style={{flex:1,fontSize:12,color:T.text}}>STUN Discovery</div>
                    <button onClick={()=>setSett2(p=>({...p,useStun:!p.useStun}))} className="btn btn-xs" style={{background:sett.useStun?T.accent+'16':T.panel,border:`1px solid ${sett.useStun?T.accent:T.border}`,color:sett.useStun?T.accent:T.textDim,minWidth:36}}>
                      {sett.useStun?'ON':'OFF'}
                    </button>
                  </div>
                  <div style={{display:'flex',alignItems:'center',padding:'8px 0'}}>
                    <div style={{flex:1,fontSize:12,color:T.text}}>Markdown rendering</div>
                    <button onClick={()=>setSett2(p=>({...p,md:!p.md}))} className="btn btn-xs" style={{background:sett.md?T.accent+'16':T.panel,border:`1px solid ${sett.md?T.accent:T.border}`,color:sett.md?T.accent:T.textDim,minWidth:36}}>
                      {sett.md?'ON':'OFF'}
                    </button>
                  </div>
                </div>
                <div style={{padding:'10px 14px',background:T.panel,borderRadius:8,fontSize:12,color:T.textDim,lineHeight:1.7}}>
                  <div>🔒 Session data is memory-only — never written to disk</div>
                  <div style={{marginTop:3}}>🛡 Archives extracted to isolated OS temp directory</div>
                  <div style={{marginTop:3}}>🔑 Persistence.TCP.FTPS handshake every session</div>
                </div>
              </div>
            )}

            {/* ── DOCS TAB (inline HelpModal) ── */}
            {tab==='docs'&&(
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}} className="fadein">
                <HelpModal inline onClose={()=>setTab('connect')}/>
              </div>
            )}
          </div>{/* end tab content */}

          {/* ── SANDBOX PANEL (right, always visible when active) ── */}
          {sandbox&&<SandboxPanel sandbox={sandbox} onClose={()=>setSandbox(null)}/>}

        </div>{/* end content area */}
      </div>{/* end main layout */}

      <input ref={fileInp} type="file" multiple style={{display:'none'}} onChange={e=>{[...e.target.files].forEach(f=>doSendFile(f));e.target.value=''}}/>
      <input ref={folderInp} type="file" {...{'webkitdirectory':''}} multiple style={{display:'none'}} onChange={e=>{if(e.target.files.length)doSendFolder([...e.target.files]);e.target.value=''}}/>
    </div>
  )
}
