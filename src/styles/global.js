import { T } from './theme'

export const G = `
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
.prog{height:3px;background:${T.border};border-radius:3px;overflow:hidden;position:relative}
.prog-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,${T.accent},${T.blue});transition:width .3s ease}
.prog-active .prog-fill{background:linear-gradient(90deg,${T.accent},${T.blue},${T.accent});background-size:200% 100%;animation:progShimmer 1.5s ease infinite}
.prog-fail .prog-fill{background:${T.red};opacity:0.7}
.stag{font-size:10px;padding:2px 7px;border-radius:5px;font-weight:600;transition:all .2s ease}
.stag-pulse{animation:stagPulse 1.8s ease-in-out infinite}

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
@keyframes progShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes stagPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.85;transform:scale(1.03)}}
@keyframes retryBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes glowPulse{0%,100%{box-shadow:0 0 8px ${T.accent}15}50%{box-shadow:0 0 16px ${T.accent}30}}
.pulse{animation:pulse 2s infinite ease-in-out}
.slide-in{animation:slideIn .2s ease both}

/* Enhanced file transfer cards */
.file-card{border-radius:10px;overflow:hidden;transition:all .15s ease;position:relative}
.file-card:hover{box-shadow:0 2px 12px #0003}
.file-card-sending{border-left:3px solid ${T.blue}}
.file-card-done{border-left:3px solid ${T.green}}
.file-card-failed{border-left:3px solid ${T.red};background:${T.red}08 !important}
.file-card-recv{border-left:3px solid ${T.green}}

/* Retry button animation */
.btn-retry{background:linear-gradient(135deg,${T.amber}18,${T.orange}12);border:1px solid ${T.amber}40;color:${T.amber};font-weight:600;transition:all .15s ease}
.btn-retry:hover{background:linear-gradient(135deg,${T.amber}28,${T.orange}22);transform:translateY(-1px);box-shadow:0 3px 12px ${T.amber}20}
.btn-retry:active{transform:translateY(0)}

/* Transfer speed badge */
.speed-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:600;background:${T.surface};border:1px solid ${T.border}}

/* Folder card hover */
.folder-card{transition:all .12s ease;position:relative;overflow:hidden}
.folder-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${T.green}00,${T.green}80,${T.green}00);opacity:0;transition:opacity .2s}
.folder-card:hover::before{opacity:1}

/* Better peer connected indicator */
.peer-online{position:relative}
.peer-online::after{content:'';position:absolute;right:-2px;bottom:-1px;width:8px;height:8px;border-radius:50%;background:${T.green};border:2px solid ${T.bg};animation:glowPulse 2s infinite}
`
