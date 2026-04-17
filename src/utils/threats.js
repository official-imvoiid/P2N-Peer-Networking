import { IS_PDF, IS_IMG } from './format'

// ── SECURITY SCANNER ─────────────────────────────────────────────────────────
// Enhanced security scanner — deep inspection for hidden attacks
export async function detectThreats(blob, filename) {
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
    const SAFE_EXTS_WITH_EXE_MAGIC = new Set(['exe', 'dll', 'msi', 'com', 'scr', 'pif', 'sys', 'drv'])
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
export async function stripMetadata(blob, filename) {
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
