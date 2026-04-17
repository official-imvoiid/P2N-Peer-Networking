'use strict'
const { app } = require('electron')
const path = require('path')
const net = require('net')
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const { S, emit } = require('./state')
const { secEntry } = require('./security')

// ── TOR HIDDEN SERVICE ───────────────────────────────────────────────────────

async function startTorHiddenService(localPort) {
  if (S.torProcess) {
    secEntry('INFO', 'Tor already running — deduplicating start request')
    if (S.onionAddress) return { ok: true, onionAddress: S.onionAddress, port: localPort }
    return { ok: true, starting: true }
  }
  try {
    const tmpBase = path.join(os.tmpdir(), 'p2n-tor-' + crypto.randomBytes(4).toString('hex'))
    fs.mkdirSync(tmpBase, { recursive: true })
    S.torDataDir = tmpBase
    const hsDir = path.join(tmpBase, 'hidden_service')
    fs.mkdirSync(hsDir, { recursive: true })
    S.torSocksPort = 19050 + Math.floor(Math.random() * 1000)
    const torrc = [
      `SocksPort ${S.torSocksPort}`,
      `DataDirectory ${tmpBase.replace(/\\/g, '/')}`,
      `HiddenServiceDir ${hsDir.replace(/\\/g, '/')}`,
      `HiddenServicePort ${localPort} 127.0.0.1:${localPort}`,
      'GeoIPFile ""', 'GeoIPv6File ""',
      'Log notice stderr',
    ].join('\n')
    const torrcPath = path.join(tmpBase, 'torrc')
    fs.writeFileSync(torrcPath, torrc)
    secEntry('INFO', `Tor starting on SOCKS ${S.torSocksPort}, forwarding port ${localPort}`)
    emit('ftps:tor-status', { status: 'starting' })

    return new Promise((resolve) => {
      const IS_PACKAGED = app.isPackaged
      const resourcesDir = process.resourcesPath || ''
      const devRoot = path.resolve(__dirname, '../..')
      const exe = process.platform === 'win32' ? 'tor.exe' : 'tor'

      const possibleBins = process.platform === 'win32'
        ? [
            path.join(resourcesDir, 'tor', exe),
            path.join(resourcesDir, 'app.asar.unpacked', 'tor', exe),
            path.join(devRoot, 'tor', exe),
            path.join(process.cwd(), 'tor', exe),
            path.join(process.env.APPDATA || '', 'tor', exe),
            path.join(process.env.LOCALAPPDATA || '', 'tor', exe),
          ]
        : [
            path.join(resourcesDir, 'tor', exe),
            path.join(resourcesDir, 'app.asar.unpacked', 'tor', exe),
            path.join(devRoot, 'tor', exe),
            path.join(process.cwd(), 'tor', exe),
            '/usr/bin/tor', '/usr/local/bin/tor', '/opt/homebrew/bin/tor',
          ]

      let torBin = null
      for (const b of possibleBins) { if (b && fs.existsSync(b)) { torBin = b; break } }

      const searchLog = possibleBins.filter(Boolean)
        .map(b => `${b} [${fs.existsSync(b) ? 'FOUND' : 'missing'}]`).join(' | ')
      secEntry('INFO', `Tor search paths: ${searchLog}`)

      if (!torBin) {
        const { execSync } = require('child_process')
        try {
          const whichCmd = process.platform === 'win32' ? 'where tor.exe' : 'which tor'
          const found = execSync(whichCmd, { timeout: 3000 }).toString().trim().split('\n')[0].trim()
          if (found && fs.existsSync(found)) {
            torBin = found
            secEntry('INFO', `Found tor in system PATH: ${torBin}`)
          }
        } catch { }
      }

      if (!torBin) {
        const hint = IS_PACKAGED
          ? `Run GetTorDaemon.py from the project folder then rebuild with "npm run dist:win".`
          : `Run GetTorDaemon.py to install tor.exe into the tor/ folder, then restart.`
        const msg = `Tor binary not found.\nSearched:\n${possibleBins.filter(Boolean).join('\n')}\n\n${hint}`
        secEntry('ERR', msg)
        emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg: msg.split('\n')[0] })
        emit('ftps:tor-status', { status: 'error', error: msg.split('\n')[0] })
        resolve({ ok: false, error: msg })
        return
      }

      secEntry('INFO', `Spawning Tor: ${torBin}`)
      let proc
      try {
        proc = require('child_process').spawn(torBin, ['-f', torrcPath], {
          windowsHide: true,
          env: { ...process.env, LD_LIBRARY_PATH: path.dirname(torBin) },
        })
      } catch (spawnErr) {
        const msg = `Failed to spawn Tor process: ${spawnErr.message}`
        secEntry('ERR', msg)
        emit('ftps:tor-status', { status: 'error', error: msg })
        resolve({ ok: false, error: msg })
        return
      }
      S.torProcess = proc
      let started = false
      let lineBuffer = ''

      const timeout = setTimeout(() => {
        if (!started) {
          started = true
          secEntry('ERR', 'Tor startup timed out (60s)')
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg: 'Tor startup timed out. Check if Tor is blocked by firewall or antivirus.' })
          emit('ftps:tor-status', { status: 'error', error: 'Tor startup timed out (60s)' })
          stopTorDaemon()
          resolve({ ok: false, error: 'Tor startup timed out' })
        }
      }, 60000)

      const onTorLog = (d) => {
        const chunk = d.toString()
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''
        lines.filter(l => l.trim()).forEach(l => {
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'INFO', msg: 'Tor: ' + l.trim() })
          const bootMatch = l.match(/Bootstrapped\s+(\d+)%/)
          if (bootMatch) emit('ftps:tor-status', { status: 'starting', progress: parseInt(bootMatch[1]) })
        })

        if (lines.some(l => l.includes('Bootstrapped 100%')) && !started) {
          started = true
          clearTimeout(timeout)
          lineBuffer = ''
          const hostnamePath = path.join(hsDir, 'hostname')
          let retries = 0
          const tryRead = () => {
            try {
              if (fs.existsSync(hostnamePath)) {
                S.onionAddress = fs.readFileSync(hostnamePath, 'utf8').trim()
                secEntry('OK', `Tor hidden service: ${S.onionAddress}`)
                emit('ftps:tor-status', { status: 'running', onionAddress: S.onionAddress, port: localPort })
                resolve({ ok: true, onionAddress: S.onionAddress, port: localPort })
              } else if (retries < 10) {
                retries++; setTimeout(tryRead, 500)
              } else { throw new Error('hostname file not created') }
            } catch (e) {
              secEntry('ERR', 'Tor: could not read hostname', e.message)
              emit('ftps:tor-status', { status: 'error' })
              resolve({ ok: false, error: 'Could not read onion hostname' })
            }
          }
          tryRead()
        }
      }

      proc.stdout.on('data', onTorLog)
      proc.stderr.on('data', onTorLog)

      proc.on('error', e => {
        if (!started) {
          started = true; clearTimeout(timeout)
          let msg
          if (e.code === 'ENOENT') {
            const hint = app.isPackaged
              ? `Run GetTorDaemon.py from the project source folder, then rebuild with "npm run dist:win".`
              : `Run GetTorDaemon.py to place tor.exe in the tor/ folder, then restart.`
            msg = `Tor binary not found at "${torBin}". ${hint}`
          } else if (e.code === 'EACCES') {
            msg = `Permission denied running Tor binary "${torBin}". Check file permissions.`
          } else {
            msg = `Tor process error: ${e.message} (code: ${e.code || 'unknown'})`
          }
          secEntry('ERR', 'Tor spawn error', msg)
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg })
          emit('ftps:tor-status', { status: 'error', error: msg })
          S.torProcess = null
          resolve({ ok: false, error: msg })
        }
      })

      proc.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
          const exitMsg = `Tor exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`
          secEntry('ERR', exitMsg)
          emit('p2n:log', { ts: new Date().toTimeString().slice(0, 8), level: 'ERR', msg: exitMsg })
        }
        S.torProcess = null; S.onionAddress = null; emit('ftps:tor-status', { status: 'off' })
      })
    })
  } catch (e) {
    secEntry('ERR', 'Tor init error', e.message)
    return { ok: false, error: e.message }
  }
}

function stopTorDaemon() {
  if (S.torProcess) { try { S.torProcess.kill() } catch { }; S.torProcess = null }
  S.onionAddress = null
  if (S.torDataDir) {
    try { fs.rmSync(S.torDataDir, { recursive: true, force: true }) } catch { }
    S.torDataDir = null
  }
  emit('ftps:tor-status', { status: 'off' })
  secEntry('OK', 'Tor daemon stopped')
}

// ── SOCKS5 CONNECT VIA TOR ──────────────────────────────────────────────────

function connectViaTor(onionHost, port) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket()
    let rxBuf = Buffer.alloc(0)
    let step = 'greeting'
    let settled = false

    const fail = (err) => {
      if (!settled) {
        settled = true
        try { sock.destroy() } catch { }
        let friendlyMsg = err.message
        if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
          friendlyMsg = 'Tor daemon not running — restart the app or enable Tor in Settings'
          if (S.tcpServer) {
            const srvPort = S.tcpServer.address()?.port
            const now = Date.now()
            if (!connectViaTor._restartCount) connectViaTor._restartCount = 0
            if (!connectViaTor._lastRestart) connectViaTor._lastRestart = 0
            const cooldownOk = now - connectViaTor._lastRestart > 60000
            const retriesOk = connectViaTor._restartCount < 3
            if (srvPort && cooldownOk && retriesOk) {
              connectViaTor._restartCount++
              connectViaTor._lastRestart = now
              secEntry('WARN', `Tor SOCKS port refused — attempting restart (${connectViaTor._restartCount}/3)`)
              emit('ftps:tor-status', { status: 'error', error: `Tor crashed — restarting (attempt ${connectViaTor._restartCount}/3)...` })
              stopTorDaemon()
              startTorHiddenService(srvPort).catch(() => {})
            } else if (!retriesOk) {
              secEntry('ERR', 'Tor restart limit reached (3/3) — manual restart required')
              emit('ftps:tor-status', { status: 'error', error: 'Tor failed to start after 3 attempts — restart the app' })
            } else {
              secEntry('WARN', `Tor restart cooldown active (${Math.round((60000 - (now - connectViaTor._lastRestart)) / 1000)}s remaining)`)
            }
          }
        } else if (err.message.includes('network unreachable')) {
          friendlyMsg = 'Network unreachable — check your internet connection'
        } else if (err.message.includes('host unreachable')) {
          friendlyMsg = 'Peer is offline or onion address has changed'
        } else if (err.message.includes('connection refused') && !err.message.includes('ECONNREFUSED')) {
          friendlyMsg = 'Peer is not listening — they may need to restart'
        } else if (err.message.includes('timeout') || err.message.includes('Timeout')) {
          friendlyMsg = 'Connection timed out — check internet connection and try again'
        }
        reject(new Error(friendlyMsg))
      }
    }

    const succeed = () => {
      if (!settled) {
        settled = true
        sock.setTimeout(0)
        sock.removeAllListeners('data')
        sock.removeAllListeners('timeout')
        resolve(sock)
      }
    }

    sock.setTimeout(120000, () => fail(new Error('SOCKS5 timeout — onion connections can be slow, try again')))
    sock.on('error', fail)

    sock.connect(S.torSocksPort, '127.0.0.1', () => {
      sock.write(Buffer.from([0x05, 0x01, 0x00]))
    })

    sock.on('data', chunk => {
      rxBuf = Buffer.concat([rxBuf, chunk])

      if (step === 'greeting') {
        if (rxBuf.length < 2) return
        if (rxBuf[0] !== 0x05 || rxBuf[1] !== 0x00) { fail(new Error(`SOCKS5 auth rejected (server method: ${rxBuf[1]})`)); return }
        rxBuf = rxBuf.slice(2)
        step = 'connect'
        const hostBuf = Buffer.from(onionHost, 'utf8')
        const req = Buffer.alloc(7 + hostBuf.length)
        req[0] = 0x05; req[1] = 0x01; req[2] = 0x00; req[3] = 0x03; req[4] = hostBuf.length
        hostBuf.copy(req, 5)
        req.writeUInt16BE(port, 5 + hostBuf.length)
        sock.write(req)
      } else if (step === 'connect') {
        if (rxBuf.length < 4) return
        if (rxBuf[0] !== 0x05 || rxBuf[1] !== 0x00) {
          const codes = {
            1: 'Tor internal error — try restarting', 2: 'Connection not allowed by ruleset',
            3: 'Network unreachable — check your internet connection',
            4: 'Peer is offline or onion address has changed',
            5: 'Peer is not listening on that port', 6: 'Connection timed out — network too slow',
            7: 'Command not supported', 8: 'Address type not supported'
          }
          fail(new Error(`SOCKS5 connect failed: ${codes[rxBuf[1]] || 'error code ' + rxBuf[1]}`))
          return
        }
        const atyp = rxBuf[3]
        let responseLen
        if (atyp === 0x01) responseLen = 10
        else if (atyp === 0x04) responseLen = 22
        else if (atyp === 0x03) {
          if (rxBuf.length < 5) return
          responseLen = 7 + rxBuf[4]
        } else { fail(new Error(`SOCKS5 unknown ATYP: ${atyp}`)); return }
        if (rxBuf.length < responseLen) return
        step = 'connected'
        const leftover = rxBuf.slice(responseLen)
        succeed()
        if (leftover.length > 0) {
          setImmediate(() => { if (!sock.destroyed) sock.emit('data', leftover) })
        }
      }
    })
  })
}

module.exports = { startTorHiddenService, stopTorDaemon, connectViaTor }
