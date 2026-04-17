import { useEffect } from 'react'
import { readSavedSession } from '../lib/session.js'

/**
 * Subscribes to all main-process IPC events (Tor status, logs, mDNS, reconnect, etc.)
 * Extracted from App.jsx to reduce root component size.
 */
export function useMainProcessEvents({
  screen, myId, myOnionAddrRef, blockedPeerStateRef,
  setTorStatus, setTorBootstrap, setTorBootstrapMsg, setOnionAddr, setTorError,
  setLogs, setUnreadLogs, setShowCloseConfirm, setDiscoveredPeers, setMsgs,
  setAccount, setScreen, setPeers, setSett2,
  addLog, notify,
}) {
  useEffect(() => {
    const us = [
      window.ftps?.on('ftps:tor-status', d => {
        setTorStatus(d.status)
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
          myOnionAddrRef.current = d.onionAddress
        }
        if (d.error) setTorError(d.error)
        if (d.status === 'running') { setTorError(''); setTorBootstrap(100); setTorBootstrapMsg('Connected!') }
        if (d.status === 'off')     { setOnionAddr(''); setTorError(''); setTorBootstrap(0); setTorBootstrapMsg('Initializing…'); myOnionAddrRef.current = '' }
      }),
      window.ftps?.on('p2n:log', e => {
        setLogs(p => [{ ts: e.ts || '', level: e.level, msg: e.msg, detail: e.detail || '' }, ...p].slice(0, 300))
        setUnreadLogs(n => n + 1)
      }),
      window.ftps?.on('app:request-close', () => setShowCloseConfirm(true)),
      window.ftps?.on('ftps:peers-discovered', list => setDiscoveredPeers(list || [])),
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
      window.ftps?.on('ftps:network-status', ({ online }) => {
        if (online) {
          addLog('OK', 'Network back online — reconnecting peers…')
          notify('🌐 Network restored — reconnecting…', 'ok')
        } else {
          addLog('WARN', 'Network offline — transfers paused')
          notify('📡 Network offline — will reconnect when available', 'err')
        }
      }),
      window.ftps?.on('ftps:peer-unblocked', ({ peerId }) => {
        const saved = blockedPeerStateRef.current[peerId]
        if (saved) {
          setPeers(ps => {
            const existing = ps.find(p => p.id === peerId)
            if (existing) {
              return ps.map(p => p.id === peerId
                ? { ...p, online: false, blocked: false, reconnecting: false }
                : p
              )
            }
            return [...ps, { id: peerId, name: saved.name, online: false, blocked: false, reconnecting: false }]
          })
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
      }),
    ]
    return () => us.forEach(u => u?.())
  }, [screen])
}
