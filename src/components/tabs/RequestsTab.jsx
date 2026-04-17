import { T } from '../../styles/theme.js'

export function RequestsTab({ pendingPeerRequests, setPendingPeerRequests, rejectedRequests, sentPeerRequests, setSentPeerRequests, setPeers, setTab, notify }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">
      <div style={{ fontSize: 10, color: T.amber, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>📬 CONNECTION REQUESTS</div>

      {/* INCOMING — peers wanting to connect to you */}
      {(() => {
        const incoming = pendingPeerRequests.filter(r => r.role !== 'sender')
        return incoming.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>INCOMING REQUESTS</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${T.green}30` }}>
              {incoming.map((req, i) => (
                <div key={req.peerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < incoming.length - 1 ? `1px solid ${T.border}20` : 'none' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: T.green + '18', border: `2px solid ${T.green}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: T.green, fontWeight: 700 }}>
                    {(req.peerName || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{req.peerName || req.peerId}</div>
                    <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace' }}>{req.peerId}</div>
                    <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>📡 Wants to connect with you</div>
                    {req.fingerprint && <div style={{ fontSize: 9, color: T.muted, marginTop: 1, fontFamily: 'monospace' }}>FP: {req.fingerprint}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => {
                      window.ftps?.acceptRequest(req.peerId)
                      setPendingPeerRequests(p => p.filter(r => r.peerId !== req.peerId))
                      setTab('peers')
                    }} className="btn btn-green btn-sm" style={{ padding: '7px 16px', fontWeight: 700 }}>✓ Accept</button>
                    <button onClick={() => {
                      window.ftps?.rejectRequest(req.peerId)
                      setPendingPeerRequests(p => p.filter(r => r.peerId !== req.peerId))
                      notify(`Request declined — ${req.peerName || 'Peer'} blocked for 10 minutes`, 'info')
                    }} className="btn btn-danger btn-sm" style={{ padding: '7px 14px' }}>✕ Decline</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* OUTGOING — sent requests waiting for approval */}
      {(() => {
        const outgoing = pendingPeerRequests.filter(r => r.role === 'sender')
        return outgoing.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>SENT REQUESTS</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${T.blue}30` }}>
              {outgoing.map((req, i) => (
                <div key={req.peerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < outgoing.length - 1 ? `1px solid ${T.border}20` : 'none' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: T.blue + '18', border: `2px solid ${T.blue}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: T.blue, fontWeight: 700 }}>
                    {(req.peerName || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{req.peerName || req.peerId}</div>
                    <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace' }}>{req.peerId}</div>
                    <div style={{ fontSize: 10, color: T.amber, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="spin" style={{ display: 'inline-block', width: 8, height: 8, border: `1.5px solid ${T.amber}40`, borderTopColor: T.amber, borderRadius: '50%' }}/>
                      Waiting for them to accept…
                    </div>
                  </div>
                  <button onClick={() => {
                    window.ftps?.withdrawRequest(req.peerId)
                    setPendingPeerRequests(p => p.filter(r => r.peerId !== req.peerId))
                    setSentPeerRequests(s => { const n = new Set(s); n.delete(req.peerId); return n })
                    notify('Request withdrawn', 'ok')
                  }} className="btn btn-ghost btn-sm" style={{ padding: '6px 14px', color: T.textDim, flexShrink: 0 }}>Withdraw</button>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* DECLINED — with 10-min countdown so sender knows when they can retry */}
      {(() => {
        const now = Date.now()
        const active = rejectedRequests.filter(r => r.expiresAt > now)
        return active.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>DECLINED</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${T.red}20` }}>
              {active.map((r, i) => {
                const remaining = Math.max(0, Math.ceil((r.expiresAt - now) / 1000))
                const mins = Math.floor(remaining / 60), secs = remaining % 60
                return (
                  <div key={r.peerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < active.length - 1 ? `1px solid ${T.border}15` : 'none', opacity: 0.75 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.red + '10', border: `2px solid ${T.red}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0, color: T.red, fontWeight: 700 }}>
                      {(r.peerName || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>{r.peerName || r.peerId}</div>
                      <div style={{ fontSize: 10, color: T.red }}>✕ Declined — retry in {mins}:{String(secs).padStart(2,'0')}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {pendingPeerRequests.length === 0 && rejectedRequests.filter(r => r.expiresAt > Date.now()).length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginBottom: 6 }}>No pending requests</div>
          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
            Incoming requests appear here when someone wants to connect.<br/>
            Your sent requests also appear here so you can withdraw them.
          </div>
        </div>
      )}
    </div>
  )
}
