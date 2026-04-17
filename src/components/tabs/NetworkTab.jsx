import { useRef } from 'react'
import { T } from '../../styles/theme.js'

export function NetworkTab({
  torStatus, torBootstrap, torBootstrapMsg, onionAddr,
  netInfo, netDetails,
  listenActive, listenInfo, listenPort,
  discoveredPeers, sentPeerRequests, setSentPeerRequests, setPendingPeerRequests,
  blockedPeers, peers, msgs, myNodeId, notify, setTab, peersRef
}) {
  return (
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
              const alreadyConnected = peersRef.current.some(p => p.online && p.name === dp.name && p.id !== myNodeId)
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
  )
}
