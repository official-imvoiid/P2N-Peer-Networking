'use strict'
const path = require('path')
const fs = require('fs')
const { execFile, exec, execSync } = require('child_process')
const { S } = require('./state')
const { secEntry } = require('./security')

// ── FILE TREE BUILDER ────────────────────────────────────────────────────────
function buildFileTree(dir, base) {
  const out = {}
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name)
      if (e.isDirectory()) out[e.name] = { type: 'dir', children: buildFileTree(fp, base) }
      else if (e.isFile()) { const s = fs.statSync(fp); out[e.name] = { type: 'file', size: s.size, relPath: path.relative(base, fp) } }
    }
  } catch { }
  return out
}

// ── 7-ZIP BINARY SEARCH ─────────────────────────────────────────────────────
function find7zBin() {
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\7-Zip\\7z.exe')
    ]
    for (const p of paths) if (fs.existsSync(p)) return p
  } else {
    try { execSync('which 7z', { stdio: 'ignore' }); return '7z' } catch {}
  }
  return null
}

// ── ARCHIVE LISTING (fast, no extraction) ────────────────────────────────────
async function listArchive(src, password) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase(), files = []
    const _7z = find7zBin()
    const pwArgs = (password && password.length > 0) ? ['-p' + password] : []

    if (_7z && /\.(zip|tar(\.gz|\.bz2|\.xz)?|tgz|tbz2)$/i.test(e)) {
      if (/\.(rar|7z)$/i.test(e)) return reject(new Error('RAR and 7z formats are no longer supported. Please use ZIP or TAR.'))
      execFile(_7z, ['l', '-slt', ...pwArgs, src], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const combined = ((stdout || '') + (stderr || '')).toLowerCase()
          if (combined.includes('wrong password') || combined.includes('cannot open encrypted') || combined.includes('data error')) {
            return reject(Object.assign(new Error('Wrong password'), { isWrongPassword: true }))
          }
          return reject(new Error('7-Zip list failed: ' + err.message))
        }
        const blocks = stdout.split('\n\n')
        let anyEncrypted = false
        for (const block of blocks) {
          const dict = {}
          for (const line of block.split('\n')) {
            const m = line.match(/^([^=]+)\s+=\s+(.*)$/)
            if (m) dict[m[1].trim()] = m[2].trim()
          }
          if (dict.Encrypted === '+') anyEncrypted = true
          if (dict.Path && dict.Path !== src && dict.Attributes !== 'D') {
            const size = parseInt(dict.Size || '0', 10)
            files.push({ path: dict.Path.replace(/\\/g, '/'), size: isNaN(size) ? 0 : size, encrypted: dict.Encrypted === '+' })
          }
        }
        if (!password && anyEncrypted) return reject(Object.assign(new Error('Archive is password-protected'), { isEncrypted: true }))
        resolve(files)
      })
    } else if (process.platform === 'win32' && e.endsWith('.zip')) {
      execFile('tar', ['-tf', src], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('tar list failed'))
        stdout.split('\n').filter(Boolean).forEach(l => {
          const p = l.trim().replace(/\\/g, '/')
          if (p && !p.endsWith('/')) files.push({ path: p, size: 0 })
        })
        resolve(files)
      })
    } else if (process.platform !== 'win32' && e.endsWith('.zip')) {
      execFile('unzip', ['-l', src], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('unzip list failed'))
        const lines = stdout.split('\n')
        for (let i = 3; i < lines.length - 2; i++) {
          const m = lines[i].match(/^\s*\d+\s+[\d-]+\s+[\d:]+\s+(.+)$/)
          if (m && !m[1].endsWith('/')) files.push({ path: m[1], size: 0 })
        }
        resolve(files)
      })
    } else if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2)$/.test(e)) {
      const args = ['-tvf', src]
      if (/\.(gz|tgz)$/.test(e)) args.splice(1, 0, '-z')
      if (/\.(bz2|tbz2)$/.test(e)) args.splice(1, 0, '-j')
      execFile('tar', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('tar list failed'))
        stdout.split('\n').filter(Boolean).forEach(l => {
          const parts = l.trim().split(/\s+/)
          if (parts.length >= 6 && !parts[0].startsWith('d')) {
            const size = parseInt(parts[2] || '0', 10)
            const p = parts.slice(5).join(' ')
            if (p) files.push({ path: p, size: isNaN(size) ? 0 : size })
          }
        })
        resolve(files)
      })
    } else {
      reject(new Error('Unsupported archive format OR 7-Zip not installed'))
    }
  })
}

// ── SINGLE FILE EXTRACTION ───────────────────────────────────────────────────
function extractSingleFile(src, fileRelPath, destDir, password = null) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase(), _7z = find7zBin()
    if (_7z) {
      const args = ['e', src, `-o${destDir}`, fileRelPath, '-y', '-r']
      if (password) args.push(`-p${password}`)
      execFile(_7z, args, { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else if (process.platform === 'win32' && /\.(zip|tar|tgz|tar\.gz|tar\.bz2)$/.test(e)) {
      if (password) return reject(new Error('Password extraction requires 7-Zip installed'))
      execFile('tar', ['-xf', src, '-C', destDir, fileRelPath], { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else if (process.platform !== 'win32' && e.endsWith('.zip')) {
      const args = ['-j', '-o', src, fileRelPath, '-d', destDir]
      if (password) args.push('-P', password)
      execFile('unzip', args, { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else if (process.platform !== 'win32' && /\.(tar|tgz|tar\.gz|tbz2|tar\.bz2)$/.test(e)) {
      if (password) return reject(new Error('Password extraction requires 7-Zip installed'))
      execFile('tar', ['-xf', src, '-C', destDir, fileRelPath], { timeout: 60000 }, err => err ? reject(err) : resolve())
    } else {
      reject(new Error('Unsupported format for extraction OR 7-Zip missing'))
    }
  })
}

// ── FULL ARCHIVE EXTRACTION ──────────────────────────────────────────────────
function extractArchive(src, destDir) {
  return new Promise((resolve, reject) => {
    const e = src.toLowerCase()
    const _7z = find7zBin()

    if (/\.(rar|7z)$/i.test(e)) {
      return reject(new Error('RAR and 7z formats are no longer supported. Please use ZIP or TAR.'))
    }

    if (_7z) {
      execFile(_7z, ['x', src, `-o${destDir}`, '-y', '-r'], { timeout: 300000, maxBuffer: 8 * 1024 * 1024 }, err => {
        if (err) reject(new Error('7-Zip extraction failed: ' + err.message))
        else resolve()
      })
    } else if (process.platform !== 'win32' && e.endsWith('.zip')) {
      execFile('unzip', ['-o', src, '-d', destDir], { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else if (process.platform === 'win32' && e.endsWith('.zip')) {
      execFile('tar', ['-xf', src, '-C', destDir], { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz)$/i.test(e)) {
      execFile('tar', ['-xf', src, '-C', destDir], { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else if (e.endsWith('.gz') && !e.endsWith('.tar.gz')) {
      const outFile = path.join(destDir, path.basename(src, '.gz'))
      exec(`gzip -cd "${src}" > "${outFile}"`, { timeout: 300000 }, err => err ? reject(err) : resolve())
    } else {
      reject(new Error('Unsupported archive format. Install 7-Zip for full support (zip, rar, 7z, tar, etc.)'))
    }
  })
}

// ── SANDBOX CLEANUP ──────────────────────────────────────────────────────────
function cleanupAllSandboxes() {
  for (const [, dir] of S.sandboxes) try { fs.rmSync(path.dirname(dir), { recursive: true, force: true }) } catch { }
  S.sandboxes.clear()
}

module.exports = {
  buildFileTree, find7zBin, listArchive,
  extractSingleFile, extractArchive, cleanupAllSandboxes,
}
