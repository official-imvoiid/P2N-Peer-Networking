import React from 'react';
import { T } from '../../styles/theme.js';
import { escH } from '../../utils/format.js';
import { renderMD } from '../../utils/markdown.js';
import { Av } from '../layout/Av.jsx';
import { FileMsg } from '../file/FileMsg.jsx';
import { FolderMsg } from '../folder/FolderMsg.jsx';
import { FolderOfferMsg } from '../folder/FolderOfferMsg.jsx';
import { FolderBrowseMsg } from '../folder/FolderBrowseMsg.jsx';
import { FolderRecvMsg } from '../folder/FolderRecvMsg.jsx';

export function PeersTab({ selPeer, setSelPeer, peers, setPeers, peerMsgs, setMsgs, input, setInput, lastAct, doSend, doSendFile, doSendFolder, doRevoke, doExtract, doPullFolder, sett, setSett2, peerFingerprints, verifiedPeers, setVerifiedPeers, setShowVerify, setShowRemoveConfirm, doBlockPeer, setShowLinkConfirm, setFileView, setFolderView, setZipView, setOsSandbox, setShowCode, fileInp, folderInp, sentPeerRequests, blockedPeers, sharedFoldersRef, folderDataRef, bridgeRef, notify, chatEnd, setTab }) {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {!selPeer && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }} className="fadein">
          <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>◉ NETWORK</div>
          {!peers.length ? (
            <div style={{ textAlign: 'center', padding: '46px 20px', color: T.textDim }}>
              <div style={{ fontSize: 34, marginBottom: 11 }}>⬡</div>
              <div style={{ fontSize: 14, marginBottom: 10, color: T.text }}>No peers yet</div>
              <button onClick={() => setTab('connect')} className="btn btn-primary">⊕ Connect Peer</button>
            </div>
          ) : peers.map(p => (
            <div key={p.id} onClick={() => setSelPeer(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', marginBottom: 1, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.panel} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <Av name={p.name} id={p.id} size={36} online={p.online} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || <span style={{ color: T.muted, fontStyle: 'italic' }}>Unnamed</span>}</div>
                <div style={{ fontSize: 11, color: p.online ? T.green : T.muted, marginTop: 1 }}>{p.online ? '● Online' : '○ Offline'} · {p.id}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {selPeer && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '8px 13px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, background: T.surface }}>
            <button onClick={() => setSelPeer(null)} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 16, cursor: 'pointer', padding: '2px 5px', borderRadius: 4 }}>‹</button>
            <Av name={selPeer.name} id={selPeer.id} size={32} online={selPeer.online} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input value={selPeer.name || ''} onChange={e => { const n = e.target.value; setPeers(ps => ps.map(p => p.id === selPeer.id ? { ...p, name: n } : p)); setSelPeer(p => ({ ...p, name: n })) }} placeholder="Name this peer…" style={{ background: 'none', border: 'none', color: selPeer.name ? T.text : T.muted, fontFamily: 'inherit', fontSize: 13, fontStyle: selPeer.name ? 'normal' : 'italic', width: '100%', outline: 'none', fontWeight: 600, padding: 0 }} />
              <div style={{ fontSize: 10, color: selPeer.removedMe ? T.red : selPeer.reconnecting ? T.amber : selPeer.online ? T.green : T.red, marginTop: 1 }}>
                {selPeer.removedMe ? '🚫 This peer has removed you — messages cannot be sent'
                  : selPeer.reconnecting ? '⟳ Reconnecting…'
                    : selPeer.online ? `🔒 E2E Encrypted${verifiedPeers.has(selPeer.id) ? ' · ✓ Verified' : ''}`
                      : '⚠ Disconnected'}
              </div>
            </div>
            {selPeer.online && <button onClick={() => setShowVerify({ fingerprint: peerFingerprints[selPeer.id], peerName: selPeer.name })} className="btn btn-xs" style={{ background: verifiedPeers.has(selPeer.id) ? T.green + '16' : T.accent + '12', border: `1px solid ${verifiedPeers.has(selPeer.id) ? T.green : T.accent}30`, color: verifiedPeers.has(selPeer.id) ? T.green : T.accent, flexShrink: 0 }}>{verifiedPeers.has(selPeer.id) ? '✓ Verified' : 'Verify'}</button>}
            <button
              onClick={() => { setMsgs(p => ({ ...p, [selPeer.id]: [] })); notify('Cleared locally — sender still has their copy', 'info') }}
              className="btn btn-ghost btn-xs"
              title="⚠ Clears only on YOUR screen — the sender still has their copy of this conversation"
            >Clear ⓘ</button>
            <button onClick={() => setShowRemoveConfirm({ peerId: selPeer.id, peerName: selPeer.name })} className="btn btn-danger btn-xs">Remove</button>
            <button onClick={() => doBlockPeer(selPeer.id, selPeer.name)} className="btn btn-xs" style={{ background: T.red + '16', color: T.red, border: `1px solid ${T.red}30` }} title="Block this peer permanently">🚫 Block</button>
          </div>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '11px 13px 7px', display: 'flex', flexDirection: 'column', gap: 7, background: T.bg }}>
            {peerMsgs.map(msg => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'me' ? 'flex-end' : msg.from === 'sys' ? 'center' : 'flex-start' }} className="fadein">
                {msg.type === 'sys' && <div className="bub bub-sys">{msg.text}</div>}
                {msg.type === 'text' && <div className={`bub bub-${msg.from === 'me' ? 'me' : 'them'}`}>
                  <div style={{ color: T.text }}
                    onClick={e => {
                      const link = e.target.closest('.p2n-link');
                      if (link) {
                        const url = link.dataset.url;
                        if (sett.warnLinks) setShowLinkConfirm(url);
                        else window.ftps?.openExternal(url);
                      }
                    }}
                    dangerouslySetInnerHTML={{
                      __html:
                        // Code-block messages (sent via CodeEditor or containing ``` fences)
                        // ALWAYS render with full MD so syntax highlighting is preserved regardless
                        // of the sett.md toggle. Only plain prose text respects the toggle.
                        (msg.isCode || /```/.test(msg.text))
                          ? renderMD(msg.text)
                          : sett.md
                            ? renderMD(msg.text)
                            : escH(msg.text.replace(/\*\*\*(.+?)\*\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^#+\s/gm, '')).replace(/\n/g, '<br>')
                    }} />
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 3, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    {/* Show blocked badge if this peer is in blocked list */}
                    {msg.from === 'them' && blockedPeers.some(bp => bp.id === selPeer?.id) && <span style={{ color: T.red, fontWeight: 700, fontSize: 9, padding: '0 4px', background: T.red + '12', borderRadius: 3, border: `1px solid ${T.red}25` }}>🚫 Blocked</span>}
                    {msg.time}{msg.from === 'me' && <span style={{ color: T.accentDim }}>✓</span>}
                  </div>
                </div>}
                {['file_out', 'file_in', 'file_done', 'revoked'].includes(msg.type) && <FileMsg msg={msg} onExtract={doExtract} onPreview={m => setFileView(m)} onRevoke={doRevoke} onZipView={m => setZipView(m)} onOSSandbox={m => setOsSandbox(m)} warnArch={sett.warnArch} notify={notify} />}
                {msg.type === 'folder' && <FolderMsg msg={msg} onOpen={() => setFolderView(msg.folder)} onRevoke={doRevoke} />}
                {msg.type === 'folder_offer' && <FolderOfferMsg msg={msg} onRevoke={fid => {
                  // Revoke the offer: remove from sharedFolders so sender ignores future pulls
                  if (sharedFoldersRef.current[fid]) delete sharedFoldersRef.current[fid]
                  setMsgs(p => ({ ...p, [selPeer.id]: (p[selPeer.id] || []).map(m => m.id === 'fo_' + fid ? { ...m, status: 'done' } : m) }))
                  // Notify peer the offer is revoked
                  bridgeRef.current?.sendMsg(selPeer.id, { type: 'folder_offer_revoked', fid })
                  notify('Folder offer revoked', 'ok')
                }} />}
                {msg.type === 'folder_browse' && <FolderBrowseMsg msg={msg} peerId={selPeer?.id} onPull={doPullFolder} notify={notify} />}
                {msg.type === 'folder_recv' && <FolderRecvMsg msg={msg} folderDataRef={folderDataRef} notify={notify} />}
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          {/* Quick send */}
          {selPeer.online && <div style={{ padding: '4px 11px', borderTop: `1px solid ${T.border}`, background: T.surface, display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: T.textDim, marginRight: 3 }}>Quick:</span>
            <button onClick={() => fileInp.current?.click()} className="btn btn-ghost btn-xs">📄 File</button>
            <button onClick={() => folderInp.current?.click()} className="btn btn-ghost btn-xs">📂 Folder</button>
            <button onClick={() => setShowCode(true)} className="btn btn-ghost btn-xs">{'</>'} Code</button>
            <div style={{ flex: 1 }} />
            <span
              title={sett.md ? 'Markdown ON — **bold**, *italic*, `code`, ```blocks```' : 'Markdown OFF — toggle in Settings'}
              style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: sett.md ? T.accent + '16' : T.panel, color: sett.md ? T.accent : T.muted, border: `1px solid ${sett.md ? T.accent + '30' : T.border}`, cursor: 'pointer' }}
              onClick={() => setSett2(p => ({ ...p, md: !p.md }))}
            >MD {sett.md ? 'ON' : 'OFF'}</span>
          </div>}
          {/* Input — disabled if peer hasn't accepted yet */}
          <div style={{ padding: '8px 11px', borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
            {sentPeerRequests.has(selPeer.id) && !selPeer.approved ? (
              <div style={{ padding: '10px 12px', background: T.amber + '0a', border: `1px solid ${T.amber}25`, borderRadius: 8, fontSize: 11, color: T.amber, textAlign: 'center' }}>
                ⟳ Waiting for {selPeer.name || 'peer'} to accept your connection request…
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <textarea value={input} onChange={e => { setInput(e.target.value); lastAct.current = Date.now() }} onKeyDown={e => { lastAct.current = Date.now(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }} placeholder={selPeer.removedMe ? '🚫 Cannot send — this peer removed you' : 'Message… Shift+Enter = newline'} disabled={!!selPeer.removedMe} rows={2} style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 11px', color: T.text, fontFamily: 'inherit', fontSize: 13, resize: 'none', lineHeight: 1.5, transition: 'border-color .12s' }} onFocus={e => e.target.style.borderColor = T.accentDim} onBlur={e => e.target.style.borderColor = T.border} />
                <button onClick={doSend} style={{ width: 34, height: 34, borderRadius: 8, background: input.trim() ? T.accent : T.panel, border: `1px solid ${input.trim() ? T.accent : T.border}`, color: input.trim() ? '#0d1117' : T.textDim, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .12s', fontWeight: 700 }}>↑</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
