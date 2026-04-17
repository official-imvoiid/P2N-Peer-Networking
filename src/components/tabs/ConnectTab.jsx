import React from 'react';
import { T } from '../../styles/theme.js';

export function ConnectTab({
  listenPort, listenActive, listenInfo,
  connectAddr, setConnectAddr, connState, setConnState, connErr, setConnErr,
  torStatus, torBootstrap, torBootstrapMsg, torError,
  onionAddr, onionInput, setOnionInput, torConnState, setTorConnState, torConnErr, setTorConnErr,
  doListen, doStopListen, doConnect, doStartTor, doStopTor, doConnectOnion,
  notify, setTab,
}) {
  return (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">
                <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, marginBottom: 16, marginLeft: 4 }}>⊕ CONNECT PEER</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {/* SAME WIFI */}
                  <div className="card glass glow-blue" style={{ padding: 16 }}>
                    <div style={{ fontSize: 10, color: T.blue, letterSpacing: 1.5, marginBottom: 11, fontWeight: 700 }}>① SAME NETWORK</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 11, color: T.textDim }}>Port</div>
                      <button onClick={() => setTab('settings')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 10, cursor: 'pointer' }}>⚙ Change in Settings</button>
                    </div>
                    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 10px', marginBottom: 9, fontSize: 13, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{listenPort}</div>
                    {!listenActive
                      ? <button onClick={doListen} className="btn btn-blue" style={{ width: '100%', padding: 9 }}>▶ Start Listening</button>
                      : <button onClick={doStopListen} className="btn btn-danger" style={{ width: '100%', padding: 9 }}>■ Stop</button>}
                    {listenActive && listenInfo && <div style={{ marginTop: 9, background: T.green + '08', border: `1px solid ${T.green}20`, borderRadius: 6, padding: 9 }}>
                      <div style={{ fontSize: 9, color: T.green, fontWeight: 700, marginBottom: 7, letterSpacing: 1 }}>● LISTENING</div>
                      {listenInfo.localIPs.map(({ name, address }) => (
                        <div key={address} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <div><div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{address}:{listenInfo.port}</div><div style={{ fontSize: 11, color: T.textDim }}>{name}</div></div>
                          <button onClick={() => { navigator.clipboard?.writeText(`${address}:${listenInfo.port}`); notify('Copied!', 'ok') }} className="btn btn-ghost btn-xs">⎘</button>
                        </div>
                      ))}
                    </div>}
                    <div style={{ marginTop: 9, fontSize: 10, color: T.textDim, lineHeight: 1.5 }}>Share your IP:port with a peer on the <strong style={{ color: T.green }}>same WiFi network</strong>.</div>
                  </div>

                  {/* DIAL PEER */}
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 10, color: T.purple, letterSpacing: 1.5, marginBottom: 11, fontWeight: 700 }}>② CONNECT TO PEER</div>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 5, letterSpacing: 1, fontWeight: 600 }}>IP:PORT (Same Network)</div>
                    <input value={connectAddr} onChange={e => setConnectAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && doConnect()} className="inp" placeholder="192.168.1.x:7900" style={{ marginBottom: 7 }} disabled={connState === 'connecting'} />
                    {/* BUG 3 FIX: Clarify that no secret code is needed — just IP:PORT */}
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 7, lineHeight: 1.5 }}>
                      No password or secret code needed — encryption is automatic via ECDH key exchange. After connecting, verify your peer's fingerprint via the <strong style={{ color: T.accent }}>✔ Verify</strong> button.
                    </div>
                    <button onClick={doConnect} className="btn btn-purple" style={{ width: '100%', padding: 8 }} disabled={connState === 'connecting' || !connectAddr.trim()}>
                      {connState === 'connecting' ? '⟳ Connecting…' : '→ Connect'}
                    </button>
                    {connState === 'done' && <div style={{ marginTop: 7, padding: '6px 9px', background: T.green + '09', border: `1px solid ${T.green}22`, borderRadius: 5, fontSize: 11, color: T.green }}>✓ Connected — ECDH handshake active</div>}
                    {connState === 'error' && <div style={{ marginTop: 7, padding: '6px 9px', background: T.red + '09', border: `1px solid ${T.red}22`, borderRadius: 5, fontSize: 11, color: T.red }}>✕ {connErr || 'Failed'}</div>}
                    {connState !== 'idle' && <button onClick={() => { setConnState('idle'); setConnErr(''); setConnectAddr('') }} className="btn btn-ghost btn-xs" style={{ marginTop: 6, width: '100%' }}>Reset</button>}
                  </div>
                </div>

                {/* ── TOR ONION LINK (Different Network) ── */}
                <div className="card" style={{ padding: 16, marginBottom: 12, border: `1px solid ${T.purple}28` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <div style={{ fontSize: 10, color: T.purple, letterSpacing: 1.5, fontWeight: 700 }}>🧅 ONION LINK (Different Network)</div>
                    <div style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: torStatus === 'running' ? T.green + '16' : torStatus === 'starting' ? T.amber + '16' : T.muted + '16', color: torStatus === 'running' ? T.green : torStatus === 'starting' ? T.amber : T.muted, fontWeight: 700 }}>
                      {torStatus === 'running' ? '● TOR ACTIVE' : torStatus === 'starting' ? '⟳ STARTING' : '○ TOR OFF'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.6 }}>Connect peers on <strong>different networks</strong> via Tor hidden services. All traffic is E2E encrypted (ECDH P-256 + AES-256-GCM) — Tor adds transport anonymity.</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>GENERATE ONION LINK</div>
                      {torStatus !== 'running'
                        ? <button onClick={doStartTor} className="btn btn-purple" style={{ width: '100%', padding: 9 }} disabled={torStatus === 'starting'}>
                          {torStatus === 'starting' ? '⟳ Bootstrapping Tor…' : '🧅 Start Tor & Generate Link'}
                        </button>
                        : <button onClick={doStopTor} className="btn btn-danger" style={{ width: '100%', padding: 9 }}>■ Stop Tor</button>
                      }
                      {torStatus === 'starting' && (
                        <div style={{ marginTop: 8, padding: '10px 12px', background: '#1a1040', border: `1px solid ${T.purple}30`, borderRadius: 8 }}>
                          {/* Header row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div className="spin" style={{ width: 10, height: 10, border: `2px solid ${T.purple}40`, borderTopColor: T.purple, borderRadius: '50%', flexShrink: 0 }} />
                              <span style={{ fontSize: 10, color: T.purple, fontWeight: 700, letterSpacing: 1 }}>BOOTSTRAPPING</span>
                            </div>
                            <span style={{ fontSize: 11, color: T.purple, fontWeight: 700, fontFamily: 'monospace' }}>{torBootstrap}%</span>
                          </div>
                          {/* Progress track */}
                          <div style={{ height: 6, background: `${T.purple}18`, borderRadius: 6, overflow: 'hidden', marginBottom: 6, position: 'relative' }}>
                            <div style={{
                              height: '100%', borderRadius: 6,
                              width: `${torBootstrap}%`,
                              background: `linear-gradient(90deg, #6e40c9, ${T.purple}, #c084fc)`,
                              transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                              boxShadow: `0 0 8px ${T.purple}60`,
                            }} />
                            {/* Shimmer overlay */}
                            <div style={{
                              position: 'absolute', inset: 0, borderRadius: 6,
                              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                              animation: 'shimmer 1.8s infinite',
                            }} />
                          </div>
                          {/* Stage label */}
                          <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.4 }}>{torBootstrapMsg}</div>
                          {/* Milestone dots */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, position: 'relative' }}>
                            {[0, 25, 50, 75, 100].map(m => (
                              <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <div style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: torBootstrap >= m ? T.purple : `${T.purple}28`,
                                  boxShadow: torBootstrap >= m ? `0 0 4px ${T.purple}80` : 'none',
                                  transition: 'all 0.4s',
                                }} />
                                <span style={{ fontSize: 8, color: torBootstrap >= m ? T.purple : T.muted, fontFamily: 'monospace' }}>{m}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!listenActive && torStatus === 'off' && <div style={{ fontSize: 10, color: T.textDim, marginTop: 5 }}>Listening will start automatically</div>}
                      {onionAddr && <div style={{ marginTop: 8, padding: 8, background: T.purple + '08', border: `1px solid ${T.purple}22`, borderRadius: 5 }}>
                        <div style={{ fontSize: 9, color: T.purple, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>YOUR ONION ADDRESS</div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <input readOnly value={onionAddr} className="inp" style={{ flex: 1, fontSize: 10, padding: '3px 7px', fontFamily: 'monospace' }} />
                          <button onClick={() => { navigator.clipboard?.writeText(onionAddr); notify('Onion address copied!', 'ok') }} className="btn btn-ghost btn-xs">⎘</button>
                        </div>
                        <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Share this with your peer</div>
                      </div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>CONNECT VIA ONION</div>
                      <input value={onionInput} onChange={e => setOnionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && doConnectOnion()} className="inp" placeholder="xxxx.onion:7900" style={{ marginBottom: 6, fontSize: 11, fontFamily: 'monospace' }} />
                      <button onClick={doConnectOnion} className="btn btn-purple" style={{ width: '100%', padding: 8 }} disabled={torConnState === 'connecting' || !onionInput.trim()}>
                        {torConnState === 'connecting' ? '⟳ Connecting via Tor…' : '🧅 Connect via Onion'}
                      </button>
                      {torConnState === 'done' && <div style={{ marginTop: 6, padding: '6px 9px', background: T.green + '09', border: `1px solid ${T.green}22`, borderRadius: 5, fontSize: 11, color: T.green }}>✓ Connected via Tor — handshaking</div>}
                      {torConnState === 'error' && <div style={{ marginTop: 6, padding: '6px 9px', background: T.red + '09', border: `1px solid ${T.red}22`, borderRadius: 5, fontSize: 11, color: T.red }}>✕ {torConnErr || 'Failed'}</div>}
                      {torConnState !== 'idle' && <button onClick={() => { setTorConnState('idle'); setTorConnErr(''); setOnionInput('') }} className="btn btn-ghost btn-xs" style={{ marginTop: 5, width: '100%' }}>Reset</button>}
                    </div>
                  </div>
                  {torStatus === 'error' && <div style={{ padding: '8px 11px', background: T.red + '09', border: `1px solid ${T.red}22`, borderRadius: 5, fontSize: 11, color: T.red, marginTop: 6, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>✕ Tor Daemon Failed</div>
                    <div style={{ fontSize: 10, wordBreak: 'break-word' }}>{torError || 'Unknown error. Check Logs for details.'}</div>
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Run <code style={{ background: T.panel, padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace' }}>python GetTorDaemon.py</code> to install/verify the Tor daemon.</div>
                  </div>}
                </div>

                <div className="card" style={{ padding: 12, fontSize: 11, color: T.textDim, lineHeight: 1.8 }}>
                  <div style={{ color: T.textMid, fontWeight: 600, marginBottom: 4 }}>Quick reference</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 11px' }}>
                    <span style={{ color: T.green, fontWeight: 700 }}>Same network</span><span>Auto-discovered via mDNS — appears in My Network tab</span>
                    <span style={{ color: T.purple, fontWeight: 700 }}>Internet</span><span>Start Tor → copy onion address → share via Discord/Signal</span>
                    <span style={{ color: T.accent, fontWeight: 700 }}>Encryption</span><span>ECDH P-256 + Ed25519 + AES-256-GCM on all connections</span>
                    <span style={{ color: T.amber, fontWeight: 700 }}>Session</span><span>Fresh identity + new onion address every launch</span>
                  </div>
                </div>
              </div>
  );
}
