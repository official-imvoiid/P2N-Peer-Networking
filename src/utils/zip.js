// ── PURE-JS ZIP CREATOR ───────────────────────────────────────────────────────
// Creates a ZIP archive in memory from an array of {name, blob} objects.
// Uses STORE method (no compression) — fast, works for all file types.
// Compatible with all ZIP readers. No external dependencies.
export async function createZipBlob(files) {
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
