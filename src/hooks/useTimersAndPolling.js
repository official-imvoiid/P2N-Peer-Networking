import { useEffect, useCallback } from 'react'

/**
 * Handles all recurring timers, polling, and mount-time data fetches.
 * Extracted from App.jsx to reduce root component size.
 */
export function useTimersAndPolling({
  screen, sett, tab, lastAct, lastBw,
  setUptime, setLockTimer, setScreen, setNetInfo, setNetDetails,
  setListenPort, setBlockedPeers, setSysStats, setBwHistory,
  rejectedRequests, setRejectedRequests,
  pendingPeerRequests, setPendingPeerRequests, setPeers,
  bridgeRef,
}) {
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

  // Load saved port from main process on mount
  useEffect(() => {
    window.ftps?.getPort?.().then(r => { if (r?.port) setListenPort(String(r.port)) }).catch(() => { })
  }, [])

  // Load blocked peers on mount + keep in sync via ftps:peer-blocked event
  useEffect(() => {
    const refresh = () => window.ftps?.getBlocked?.().then(r => { if (Array.isArray(r)) setBlockedPeers(r) }).catch(() => {})
    refresh()
    const unsub = window.ftps?.on('ftps:peer-blocked', () => refresh())
    return () => unsub?.()
  }, [])

  // Refresh rejection timers every second for live countdown display
  useEffect(() => {
    if (rejectedRequests.length === 0) return
    const t = setInterval(() => {
      const now = Date.now()
      setRejectedRequests(r => r.filter(x => x.expiresAt > now))
    }, 1000)
    return () => clearInterval(t)
  }, [rejectedRequests.length])

  // Auto-expire pending mDNS connection requests after 30 seconds
  useEffect(() => {
    if (pendingPeerRequests.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      setPendingPeerRequests(prev => {
        const expired = prev.filter(r => now - r.timestamp >= 30000)
        const remaining = prev.filter(r => now - r.timestamp < 30000)
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
}
