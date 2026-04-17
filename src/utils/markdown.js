import { escH } from './format'
import { T } from '../styles/theme'

export function renderMD(rawText) {
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
  // URL unescaping — inline() runs on HTML-escaped text, so &amp; in URLs must be restored
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
