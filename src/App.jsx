import { useState, useEffect, useRef, useCallback } from 'react'
import { TCPBridge } from './lib/tcpbridge.js'

// ── Design tokens & global styles ────────────────────────────────────────────
import { T } from './styles/theme.js'
import { G } from './styles/global.js'

// ── Utilities ────────────────────────────────────────────────────────────────
import {
  fmtSz, now8, makeId, phrase,
  IS_UNSUPPORTED_ARCH, IS_BARE_COMPRESSED,
  IS_IMG, IS_PDF, IS_DANGEROUS
} from './utils/format.js'
import { detectThreats, stripMetadata } from './utils/threats.js'

// ── Layout ───────────────────────────────────────────────────────────────────
import { Toast } from './components/layout/Toast.jsx'
import { TitleBar } from './components/layout/TitleBar.jsx'
import { Sidebar } from './components/layout/Sidebar.jsx'

// ── Modals ───────────────────────────────────────────────────────────────────
import { CloseConfirm } from './components/modals/CloseConfirm.jsx'
import { CodeEditor } from './components/modals/CodeEditor.jsx'
import { TofuWarning } from './components/modals/TofuWarning.jsx'
import { VerifyModal } from './components/modals/VerifyModal.jsx'
import { HelpModal } from './components/modals/HelpModal.jsx'
import { LinkConfirmDialog, ArchiveConfirmDialog, DangerFileConfirmDialog, RemovePeerConfirmDialog } from './components/modals/ConfirmDialogs.jsx'

// ── Archive / File / Folder viewers ──────────────────────────────────────────
import { SandboxPanel } from './components/archive/SandboxPanel.jsx'
import { ZipViewer } from './components/archive/ZipViewer.jsx'
import { OSSandbox } from './components/archive/OSSandbox.jsx'
import { FileViewer } from './components/file/FileViewer.jsx'
import { FolderViewer } from './components/folder/FolderViewer.jsx'

// ── Tab components ───────────────────────────────────────────────────────────
import { ConnectTab } from './components/tabs/ConnectTab.jsx'
import { PeersTab } from './components/tabs/PeersTab.jsx'
import { LogsTab } from './components/tabs/LogsTab.jsx'
import { RequestsTab } from './components/tabs/RequestsTab.jsx'
import { NetworkTab } from './components/tabs/NetworkTab.jsx'
import { StatsTab } from './components/tabs/StatsTab.jsx'
import { SettingsTab } from './components/tabs/SettingsTab.jsx'

// ── Error Boundary ───────────────────────────────────────────────────────────
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

// ── Session helpers ──────────────────────────────────────────────────────────
import { DEFAULT_SETTINGS, readSavedSession, saveSession, clearSavedSession, getInitialScreen, getInitialAccount, getInitialNodeId } from './lib/session.js'

// ── Custom hooks ─────────────────────────────────────────────────────────────
import { useMainProcessEvents } from './hooks/useMainProcessEvents.js'
import { useTimersAndPolling } from './hooks/useTimersAndPolling.js'

// ── Inline definitions removed — now imported from src/styles/, src/utils/, src/components/ ──

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
// Identity Password Panel — encrypt/decrypt persistent identity key
export default function App() {
  const [screen, setScreen] = useState(getInitialScreen)
  const [account, setAccount] = useState(getInitialAccount)
  const [form, setForm] = useState({ name: '', passphrase: '', password: '' })
  const [fErr, setFErr] = useState({})
  const [lockForm, setLockForm] = useState({ pp: '', pw: '' })
  const [lockErr, setLockErr] = useState('')
  const [lockTries, setLockTries] = useState(0)
  const [sett, setSett2Raw] = useState(() => ({ ...DEFAULT_SETTINGS }))
  const setSett2 = useCallback(updater => {
    setSett2Raw(prev => typeof updater === 'function' ? updater(prev) : updater)
  }, [])
  const [tab, setTab] = useState('connect')
  const [selPeer, setSelPeer] = useState(null)
  const [peers, setPeers] = useState([])
  const peersRef = useRef([])
  const peerIdentityKeysRef = useRef({})  // keeps in sync with peerIdentityKeys state for closure-safe dedup
  const [msgs, setMsgs] = useState({})
  const [input, setInput] = useState('')
  const [folderView, setFolderView] = useState(null)
  const [fileView, setFileView] = useState(null)
  const [showCode, setShowCode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [sandbox, setSandbox] = useState(null)
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [showVerify, setShowVerify] = useState(null)  // {fingerprint, peerName}
  const [showTofuWarn, setShowTofuWarn] = useState(null)  // {peerId, peerName, tofuDetail}
  const [showLinkConfirm, setShowLinkConfirm] = useState(null)
  const [showArchConfirm, setShowArchConfirm] = useState(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(null) // {peerId,peerName}
  const [renameCountThisSession, setRenameCountThisSession] = useState(0) // tracks renames used this session
  const [showDangerConfirm, setShowDangerConfirm] = useState(null) // holds File object for executable send confirmation
  const [peerFingerprints, setPeerFingerprints] = useState({})
  const [peerIdentityKeys, setPeerIdentityKeys] = useState({})  // peerId → identityKey for tofuAccept
  const myIdentityKeyRef = useRef('')   // own Ed25519 pub key — used for self-connection guard
  const myOnionAddrRef = useRef('')   // own .onion hostname — used for self-connection guard
  const [verifiedPeers, setVerifiedPeers] = useState(new Set())
  const [discoveredPeers, setDiscoveredPeers] = useState([])  // mDNS discovered peers
  const [pendingPeerRequests, setPendingPeerRequests] = useState([])
  const [sentPeerRequests, setSentPeerRequests] = useState(new Set())
  const [rejectedRequests, setRejectedRequests] = useState([])
  const sentPeerRequestsRef = useRef(new Set())
  // connection state
  const [listenPort, setListenPort] = useState('7900')
  const [listenActive, setListenActive] = useState(false)
  const [listenInfo, setListenInfo] = useState(null)
  const [connectAddr, setConnectAddr] = useState('')
  const [connState, setConnState] = useState('idle')
  const [connErr, setConnErr] = useState('')
  // Tor state
  const [torStatus, setTorStatus] = useState('off') // off|starting|running|error
  const [torBootstrap, setTorBootstrap] = useState(0) // 0–100 bootstrap %
  const [torBootstrapMsg, setTorBootstrapMsg] = useState('Initializing…')
  const [onionAddr, setOnionAddr] = useState('')
  const [onionInput, setOnionInput] = useState('')
  const [torError, setTorError] = useState('')  // specific Tor error message
  const [torConnState, setTorConnState] = useState('idle') // idle|connecting|done|error
  const [torConnErr, setTorConnErr] = useState('')
  // B4/C1: Blocked peers
  const [blockedPeers, setBlockedPeers] = useState([])
  // system
  const [netInfo, setNetInfo] = useState([])
  const [uptime, setUptime] = useState(0)
  const [lockTimer, setLockTimer] = useState(900)
  const [logs, setLogs] = useState([])
  const [unreadLogs, setUnreadLogs] = useState(0)  // clears when user opens Logs tab
  const [logSearch, setLogSearch] = useState('')   // search filter for logs tab
  const [editName, setEditName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [sysStats, setSysStats] = useState(null)
  const [netDetails, setNetDetails] = useState({ dnsServers: [], gateway: '…' })
  const [bwHistory, setBwHistory] = useState({ in: [], out: [] })
  const lastBw = useRef({ in: 0, out: 0 })

  const bridgeRef = useRef(null), chatEnd = useRef(null)
  const blockedPeerStateRef = useRef({})  // stores {name, msgs} when peer is blocked
  const fileInp = useRef(null), folderInp = useRef(null), lastAct = useRef(Date.now()), myId = useRef(getInitialNodeId())
  // Stores received folder file data keyed by folderFid — kept in ref to avoid re-renders per-chunk
  const folderDataRef = useRef({})  // {[folderFid]: {name, files:[{relPath,name,size,dataB64?,tmpPath?}]}}
  const removedByPeersRef = useRef(new Set())  // peerIds that have explicitly removed us
  // Stores shared folder File objects keyed by fid — sender keeps these until receiver pulls
  const sharedFoldersRef = useRef({})  // {[fid]: {name, files:[File]}}
  const folderPullFidsRef = useRef(new Set())  // tracks fids from folder-pull ops to suppress standalone FileMsg

  const [zipView, setZipView] = useState(null)   // msg to show in ZipViewer
  const [osSandbox, setOsSandbox] = useState(null)   // msg/file to show in OSSandbox

  const [toast, setToast] = useState(null)
  const notify = useCallback((msg, t = 'info') => { setToast({ msg, t }); setTimeout(() => setToast(null), 3200) }, [])
  const pushMsg = useCallback((pid, m) => setMsgs(p => ({ ...p, [pid]: [...(p[pid] || []), m] })), [])

  // A4: Keep peersRef in sync so async callbacks/closures always see current peers
  useEffect(() => { peersRef.current = peers }, [peers])
  useEffect(() => { peerIdentityKeysRef.current = peerIdentityKeys }, [peerIdentityKeys])
  useEffect(() => { sentPeerRequestsRef.current = sentPeerRequests }, [sentPeerRequests])
  const settRef = useRef(sett)
  useEffect(() => { settRef.current = sett }, [sett])
  const addLog = useCallback((level, msg, detail = '') => {
    setLogs(p => [{ ts: new Date().toTimeString().slice(0, 8), level, msg, detail }, ...p].slice(0, 300))
    setUnreadLogs(n => n + 1)
  }, [])

  // ── Timers, polling, mount-time data fetches ──
  useTimersAndPolling({
    screen, sett, tab, lastAct, lastBw,
    setUptime, setLockTimer, setScreen, setNetInfo, setNetDetails,
    setListenPort, setBlockedPeers, setSysStats, setBwHistory,
    rejectedRequests, setRejectedRequests,
    pendingPeerRequests, setPendingPeerRequests, setPeers,
    bridgeRef,
  })

  // ── Main process IPC event subscriptions ──
  useMainProcessEvents({
    screen, myId, myOnionAddrRef, blockedPeerStateRef,
    setTorStatus, setTorBootstrap, setTorBootstrapMsg, setOnionAddr, setTorError,
    setLogs, setUnreadLogs, setShowCloseConfirm, setDiscoveredPeers, setMsgs,
    setAccount, setScreen, setPeers, setSett2,
    addLog, notify,
  })

  // Load logs from main + sync Tor status
  useEffect(() => {
    window.ftps?.getLogs().then(l => setLogs((l || []).reverse().slice(0, 300))).catch(() => { })
    // Sync Tor status on mount (covers app reload, session restore)
    window.ftps?.getTorStatus().then(s => {
      if (s) {
        setTorStatus(s.running ? 'running' : 'off')
        if (s.onionAddress) setOnionAddr(s.onionAddress + ':' + (s.socksPort || 7000))
        if (s.enabled !== undefined) setSett2(p => ({ ...p, torEnabled: s.enabled }))
      }
    }).catch(() => { })
  }, [])

  useEffect(() => {
    if (screen !== 'restoring') return
    const saved = readSavedSession()
    if (!saved) { setScreen('setup'); return }
    // Pre-emptively clear stale session data so the UI starts clean.
    // If main process confirms the session is still active, we restore it below.
    clearSavedSession()
    window.ftps?.getSession().then(sess => {
      if (sess?.active && sess.nodeId === saved.nodeId) {
        // Session is genuinely alive (Refresh UI scenario) — restore it
        saveSession(saved.account, saved.nodeId)  // re-save since we cleared above
        setAccount(saved.account); myId.current = saved.nodeId
        window.ftps?.setIdentity(saved.account.name, saved.nodeId)
        setScreen('main'); addLog('OK', 'Session restored after UI refresh')
      } else {
        // Full restart — no active session in main process, go to setup
        setScreen('setup')
      }
    }).catch(() => { setScreen('setup') })
  }, [])  // eslint-disable-line
  useEffect(() => {
    bridgeRef.current = new TCPBridge({
      onOpen(pid, pn, fingerprint, tofu, tofuDetail, identityKey) {

        // ── SELF-CONNECTION GUARD ─────────────────────────────────────────────
        // If the connecting peer has our own identity key, we connected to ourselves.
        // Disconnect immediately — silently, no chat message needed.
        if (identityKey && myIdentityKeyRef.current && identityKey === myIdentityKeyRef.current) {
          bridgeRef.current?.disconnect(pid)
          notify('⚠ Cannot connect to yourself', 'err')
          addLog('WARN', 'Self-connection rejected', pid)
          return
        }

        setPendingPeerRequests(prev => {
          const mdnsMatch = prev.find(r => r.role === 'sender' && (r.peerName === pn || r.peerId !== pid))
          if (mdnsMatch && mdnsMatch.peerId !== pid) {
            setSentPeerRequests(s => { const n = new Set(s); n.delete(mdnsMatch.peerId); return n })
            return prev.filter(r => r.peerId !== mdnsMatch.peerId)
          }
          return prev
        })

        // ── MULTI-PATH DEDUPLICATION ──────────────────────────────────────────
        // Same person may connect via both mDNS/LAN and Tor simultaneously.
        // Identify them by their Ed25519 identity key (unique per session).
        // Keep only the newest connection; silently drop the older duplicate.
        if (identityKey) {
          const dupPeer = peersRef.current.find(p => {
            const existing = peerIdentityKeysRef.current[p.id]
            return existing === identityKey && p.id !== pid
          })
          if (dupPeer) {
            // Same person, different path — disconnect old, adopt new pid
            addLog('INFO', `Multi-path dedup: ${pn || pid} already connected as ${dupPeer.id} — switching to new path`)
            bridgeRef.current?.disconnect(dupPeer.id)
            // Migrate chat history from old pid to new pid
            setMsgs(p => {
              const old = p[dupPeer.id] || []
              const cur = p[pid] || []
              const n = { ...p }
              delete n[dupPeer.id]
              n[pid] = [...old, ...cur]
              return n
            })
            setPeers(ps => ps.filter(p => p.id !== dupPeer.id))
            pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🔄 Switched to faster path`, time: now8() })
          }
        }

        // keep a ref for dedup lookups without stale closure issues
        if (!window.__p2nIkRef) window.__p2nIkRef = {}
        if (identityKey) window.__p2nIkRef[pid] = identityKey

        setPeers(ps => {
          const ex = ps.find(p => p.id === pid)
          if (ex) return ps.map(p => p.id === pid ? { ...p, online: true, reconnecting: false, removedMe: false, name: p.name || pn, approved: true } : p)
          return [...ps, { id: pid, name: pn, online: true, reconnecting: false, removedMe: false, approved: true }]
        })
        removedByPeersRef.current.delete(pid)
        setPendingPeerRequests(p => p.filter(r => r.peerId !== pid))

        if (settRef.current.clearMsgsOnReconnect && tofu !== 'trusted') {
          setMsgs(p => { const n = { ...p }; delete n[pid]; return n })
        }
        if (fingerprint) setPeerFingerprints(fp => ({ ...fp, [pid]: fingerprint }))
        if (identityKey) setPeerIdentityKeys(ik => ({ ...ik, [pid]: identityKey }))
        if (tofu === 'changed') {
          // Only show modal and warning if the key CHANGED — genuine MITM concern
          setShowTofuWarn({ peerId: pid, peerName: pn, tofuDetail })
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `⚠️ WARNING: Peer key has changed! Verify identity before continuing.`, time: now8() })
        } else if (tofu === 'trusted') {
          // Reconnect within session — just a brief confirmation
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🔒 Reconnected · Trusted · E2E Encrypted`, time: now8() })
        } else {
          // 'new' — first time seeing this peer this session. Clean, non-alarming message.
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🔒 Connected · E2E Encrypted (ECDH P-256 · AES-256-GCM)`, time: now8() })
          // Only show fingerprint for new peers — useful for manual verification
          if (fingerprint) pushMsg(pid, { id: Date.now() + 1, from: 'sys', type: 'sys', text: `🔑 Verify fingerprint out-of-band: ${fingerprint}`, time: now8() })
        }
        addLog('OK', `Connected: ${pn || pid}`, fingerprint ? `FP: ${fingerprint}` : '')
        notify(`${pn || 'Peer'} connected`, 'ok')
        // For reconnects (tofu==='trusted'), restore the chat view.
        // For genuinely new first-time connections the user sees the chat once approved.
        setConnState('idle'); setConnErr('')
        setTorConnState('idle'); setTorConnErr('')
        setSelPeer({ id: pid, name: pn, online: true, reconnecting: false, approved: true })
        setTab('peers')
      },
      onRequested(peerId, peerName, fingerprint, tofu, tofuDetail, identityKey, role) {
        setPendingPeerRequests(p => {
          // The placeholder was added with dp.nodeId; now we have the real pid from HELLO
          const hasExact = p.some(r => r.peerId === peerId)
          if (hasExact) return p  // already have real entry, nothing to do
          // Check for a placeholder sender entry by name (from mDNS click)
          const placeholderIdx = role === 'sender'
            ? p.findIndex(r => r.role === 'sender' && r.peerName === peerName && r.peerId !== peerId)
            : -1
          if (placeholderIdx >= 0) {
            // Replace placeholder with real peerId
            const updated = [...p]
            updated[placeholderIdx] = { peerId, peerName, fingerprint, tofu, tofuDetail, identityKey, role, timestamp: Date.now() }
            // Clean up old nodeId from sentPeerRequests
            setSentPeerRequests(s => {
              const n = new Set(s)
              n.delete(p[placeholderIdx].peerId)
              n.add(peerId)
              return n
            })
            return updated
          }
          return [...p, { peerId, peerName, fingerprint, tofu, tofuDetail, identityKey, role, timestamp: Date.now() }];
        });
        if (role === 'receiver') notify(`📡 ${peerName || 'Peer'} wants to connect`, 'info');
      },
      onRejected(peerId) {
        const peerName = pendingPeerRequests.find(r => r.peerId === peerId)?.peerName || peerId
        setPendingPeerRequests(p => p.filter(r => r.peerId !== peerId));
        setSentPeerRequests(s => { const n = new Set(s); n.delete(peerId); return n })
        // Add to rejected list with 10-min expiry timer
        setRejectedRequests(r => [...r.filter(x => x.peerId !== peerId), {
          peerId, peerName, rejectedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000
        }])
        notify(`Your request was declined — blocked for 10 minutes`, 'err');
      },
      onWithdrawn(peerId) {
        setPendingPeerRequests(p => p.filter(r => r.peerId !== peerId));
        notify(`Connection request was withdrawn`, 'info');
      },
      onClose(pid) {
        const peer = peersRef.current.find(p => p.id === pid)
        setPeers(ps => ps.map(p => p.id === pid ? { ...p, online: false, reconnecting: false } : p))
        // Show reconnect hint if we were actively trying to reconnect
        const wasReconnecting = peer?.reconnecting
        pushMsg(pid, {
          id: Date.now(), from: 'sys', type: 'sys',
          text: wasReconnecting
            ? '⚠ Disconnected — peer may have blocked you or went offline'
            : '⚠ Disconnected',
          time: now8()
        })
        addLog('WARN', 'Disconnected', pid)
        notify('Peer disconnected', 'err')
      },
      onReconnecting(pid, attempt, maxAttempts) {
        setPeers(ps => ps.map(p => p.id === pid ? { ...p, reconnecting: true, reconnectAttempt: attempt } : p))
        const maxLabel = maxAttempts > 20 ? '∞' : maxAttempts
        addLog('INFO', `Reconnecting to ${pid}`, `attempt ${attempt}/${maxLabel}`)
      },
      onMsg(pid, msg) {
        // use peersRef.current instead of stale `peers` closure
        const pn = peersRef.current.find(p => p.id === pid)?.name || pid
        if (msg.type === 'chat') pushMsg(pid, { id: Date.now(), from: 'them', type: 'text', text: msg.text, time: now8() })
        else if (msg.type === 'folder_share') pushMsg(pid, { id: Date.now(), from: 'them', type: 'folder', folder: msg.folder, time: now8() })
        // Fix revoke — use msg.fid + '_in' to match receiver's message id
        else if (msg.type === 'revoke') {
          const receiverMsgId = msg.fid + '_in'
          setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === receiverMsgId ? { ...m, blob: null, tmpPath: null, type: 'revoked', revokedAt: new Date().toLocaleTimeString() } : m) }))
        }
        // (Messages removed: old peer_request, peer_accept, peer_reject)
        // New folder offer — receiver sees structure, can browse and pull
        else if (msg.type === 'folder_offer') pushMsg(pid, {
          id: 'fb_' + msg.fid, from: 'them', type: 'folder_browse',
          fid: msg.fid, name: msg.name, totalFiles: msg.totalFiles, totalBytes: msg.totalBytes,
          tree: msg.tree, status: 'available', time: now8(),
        })
        // Sender revoked the folder offer
        else if (msg.type === 'folder_offer_revoked') {
          setMsgs(p => ({
            ...p, [pid]: (p[pid] || []).map(m =>
              m.id === 'fb_' + msg.fid ? { ...m, status: 'revoked' } : m
            )
          }))
          notify(`${pn} revoked the folder offer`, 'info')
        }
        // Receiver gets folder_pull_done → mark both browse and recv card as done
        // Must also set complete:true on folder_recv card — FolderRecvMsg checks msg.complete, not status
        // Also flush any pending 250ms throttle timer so final receivedCount is accurate before marking complete
        else if (msg.type === 'folder_pull_done') {
          // Flush pending throttle timer for this folder so data is up-to-date
          const flushKey = pid + '|' + msg.fid
          if (folderDataRef.current._flushTimers?.[flushKey]) {
            clearTimeout(folderDataRef.current._flushTimers[flushKey])
            delete folderDataRef.current._flushTimers[flushKey]
            delete folderDataRef.current._pendingUpdates?.[flushKey]
          }
          const fd = folderDataRef.current[msg.fid]
          const finalCount = fd ? fd.files.filter(Boolean).length : (msg.fileCount || 0)
          const finalBytes = fd ? fd.files.filter(Boolean).reduce((s, f) => s + (f.size || 0), 0) : 0
          setMsgs(p => ({
            ...p, [pid]: (p[pid] || []).map(m => {
              if (m.id === 'fr_' + msg.fid) return { ...m, complete: true, status: 'done', receivedCount: finalCount, bytesSent: finalBytes, speedHistory: [] }
              if (m.id === 'fb_' + msg.fid) return { ...m, status: 'done' }
              return m
            })
          }))
          if (msg.failCount > 0) {
            notify(`Folder received with ${msg.failCount} failed file(s)`, 'info')
          }
        }
        // Other side removed us — mark in ref so send gives specific error
        else if (msg.type === 'peer_removed') {
          removedByPeersRef.current.add(pid)
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `🚫 ${pn} has removed you from their peer list. Messages cannot be sent.`, time: now8() })
          setPeers(ps => ps.map(p => p.id === pid ? { ...p, online: false, removedMe: true } : p))
          notify(`${pn} removed you — you can no longer message them`, 'info')
        }
        // Peer renamed — update peers list AND selPeer so ALL names refresh instantly
        // main.js now broadcasts type:'peer_rename'; also handle legacy 'name_update'
        else if (msg.type === 'peer_rename' || msg.type === 'name_update') {
          const newName = msg.newName
          const oldName = pn  // captured above from peersRef
          // Update peers list (sidebar + network tab)
          setPeers(ps => ps.map(p => p.id === pid ? { ...p, name: newName } : p))
          // Update selPeer so the chat header name changes immediately if this peer is open
          setSelPeer(sp => sp?.id === pid ? { ...sp, name: newName } : sp)
          pushMsg(pid, { id: Date.now(), from: 'sys', type: 'sys', text: `✎ ${oldName} renamed to "${newName}"`, time: now8() })
          notify(`${oldName} is now "${newName}"`, 'info')
          addLog('INFO', `Peer renamed: ${oldName} → ${newName}`, pid)
        }
        // Sender receives pull request → start sending files
        else if (msg.type === 'folder_pull') {
          const folder = sharedFoldersRef.current[msg.fid]
          if (!folder) return
          setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'sending' } : m) }))
          if (msg.fileIndex != null) {
            // use streaming sendFolderFile if available
            const file = folder.files[msg.fileIndex]
            if (file) {
              const singleFid = crypto.randomUUID()
              const relPath = file.webkitRelativePath || file.name
                ; (bridgeRef.current?.sendFolderFile
                  ? bridgeRef.current.sendFolderFile(pid, file, singleFid, msg.fid, relPath, msg.fileIndex, () => { })
                  : bridgeRef.current?.sendFile(pid, file, () => { })
                ).then(() => {
                  setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'offered' } : m) }))
                }).catch(() => { })
            }
          } else {
            // Reduced concurrency + adaptive completion fence
            const files = folder.files
            const CONCURRENCY = 5  // FIX: Increased from 3 — streaming path has no RAM overhead, 5 workers keep pipe full
              ; (async () => {
                const queue = files.map((file, i) => ({ file, i }))
                let failCount = 0
                const inFlight = new Set()
                const worker = async () => {
                  while (queue.length > 0) {
                    const { file, i } = queue.shift()
                    const fileFid = crypto.randomUUID()
                    const relPath = file.webkitRelativePath || file.name
                    inFlight.add(fileFid)
                    try {
                      if (bridgeRef.current?.sendFolderFile) {
                        await bridgeRef.current.sendFolderFile(pid, file, fileFid, msg.fid, relPath, i, () => { })
                      } else {
                        await bridgeRef.current?.sendFile(pid, file, () => { })
                      }
                    } catch { failCount++ } finally { inFlight.delete(fileFid) }
                  }
                }
                await Promise.allSettled(
                  Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker())
                )
                // Adaptive completion delay — more files need longer for TCP to flush
                const completionDelay = Math.min(2000, 800 + (files.length > 50 ? (files.length - 50) * 40 : 0))
                await new Promise(r => setTimeout(r, completionDelay))
                if (failCount > 0) {
                  setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'done', failCount } : m) }))
                } else {
                  setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'done' } : m) }))
                }
                // Send both folder_pull_done (message path) AND folder_complete (binary protocol path)
                // so receiver marks complete regardless of which handler fires first
                bridgeRef.current?.sendMsg(pid, { type: 'folder_pull_done', fid: msg.fid, failCount })
                window.ftps?.sendFolderComplete(pid, msg.fid, folder.name || 'Folder', files.length)
              })().catch(() => {
                setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === 'fo_' + msg.fid ? { ...m, status: 'offered' } : m) }))
              })
          }
        }
      },
      onFileStart(pid, meta) {
        if (meta.folderFid !== undefined) return
        if (folderPullFidsRef.current.has(meta.fid)) return
        pushMsg(pid, { id: meta.fid + '_in', from: 'them', type: 'file_in', meta, pct: 0, time: now8() })
      },
      onFileProg(pid, fid, pct, bytes) {
        setMsgs(p => ({
          ...p,
          [pid]: (p[pid] || []).map(m => m.id === fid + '_in' ? {
            ...m,
            pct,
            bytesSent: bytes,
            // Track speed over last 2 seconds
            speedHistory: [...(m.speedHistory || []).filter(h => Date.now() - h.t < 2000), { t: Date.now(), b: bytes }]
          } : m)
        }))
      },
      async onFileDone(pid, meta, blob, tmpPath) {
        // Don't create standalone FileMsg for folder files or folder-pull files
        if (meta.folderFid !== undefined) return
        if (folderPullFidsRef.current.has(meta.fid)) {
          folderPullFidsRef.current.delete(meta.fid)
          return
        }
        // Extract final byte count if we were tracking it
        setMsgs(p => {
          const peersMsgs = p[pid] || []
          const inMsg = peersMsgs.find(m => m.id === meta.fid + '_in')
          if (inMsg) {
            inMsg.bytesSent = meta.size
            inMsg.speedHistory = [] // clear history on done
          }
          return p
        })
        let threats = []
        // use settRef.current instead of stale `sett` closure
        try { if (blob && settRef.current.scanFiles) threats = await detectThreats(blob, meta.name || '') } catch { }
        // Strip metadata on receive if enabled
        let finalBlob = blob
        if (blob && settRef.current.exifStripRecv && (IS_IMG.test(meta.name || '') || IS_PDF.test(meta.name || ''))) {
          try { finalBlob = await stripMetadata(blob, meta.name || '') } catch { finalBlob = blob }
        }
        setMsgs(p => ({ ...p, [pid]: (p[pid] || []).map(m => m.id === meta.fid + '_in' ? { ...m, type: 'file_done', pct: 1, blob: finalBlob, tmpPath, large: !!tmpPath, threats } : m) }))
        addLog('OK', `Received: ${meta.name}`, fmtSz(meta.size || 0) + (threats.length ? ` ⚠ ${threats.length} threat(s)` : ''))
        if (threats.length) notify(`⚠ Threats in ${meta.name}: ${threats[0]}`, 'err')
        else notify(`Received: ${meta.name}`, 'ok')
      },
      // ── Folder receive ───────────────────────────────────────────────────
      onFolderManifest(pid, manifest) {
        // Initialise folderData store
        folderDataRef.current[manifest.fid] = { name: manifest.name, files: [], expectedCount: manifest.totalFiles }
        // Create receive-progress message in chat
        pushMsg(pid, {
          id: 'fr_' + manifest.fid,
          from: 'them',
          type: 'folder_recv',
          folderFid: manifest.fid,
          name: manifest.name,
          totalFiles: manifest.totalFiles,
          totalBytes: manifest.totalBytes,
          receivedCount: 0,
          complete: false,
          time: now8(),
        })
        addLog('INFO', `Folder incoming: ${manifest.name}`, `${manifest.totalFiles} files`)
      },
      onFolderFileDone(pid, folderFid, fileIndex, meta, blob, tmpPath) {
        // Store file data keyed by index — blob or tmpPath depending on file size
        if (!folderDataRef.current[folderFid]) {
          // Single-file browse-pull: create lightweight entry
          folderDataRef.current[folderFid] = { name: meta.name, files: [], expectedCount: 1, isBrowsePull: true }
        }
        const fd = folderDataRef.current[folderFid]
        if (fd) {
          fd.files[fileIndex] = {
            relPath: meta.folderRelPath || meta.name,
            name: meta.name,
            size: meta.size,
            blob: blob || null,
            tmpPath: tmpPath || null,
          }
        }

        // Throttle setMsgs to max 4/sec to prevent React state flooding
        // on massive folder transfers (1000s of tiny files). Data is already
        // safely stored in folderDataRef above — we just batch the UI update.
        if (!folderDataRef.current._flushTimers) folderDataRef.current._flushTimers = {}
        const flushKey = pid + '|' + folderFid

        // Pending update params for this folder
        if (!folderDataRef.current._pendingUpdates) folderDataRef.current._pendingUpdates = {}
        folderDataRef.current._pendingUpdates[flushKey] = { pid, folderFid, meta, blob, tmpPath }

        // If a timer is already scheduled, skip — it will pick up our latest data
        if (folderDataRef.current._flushTimers[flushKey]) return

        folderDataRef.current._flushTimers[flushKey] = setTimeout(() => {
          delete folderDataRef.current._flushTimers[flushKey]
          const pending = folderDataRef.current._pendingUpdates?.[flushKey]
          if (!pending) return
          delete folderDataRef.current._pendingUpdates[flushKey]
          const { pid: p, folderFid: ff, meta: m, blob: b, tmpPath: tp } = pending

          // Update the correct message type
          setMsgs(prev => {
            const peerMsgs = prev[p] || []
            const hasRecvMsg = peerMsgs.some(msg => msg.id === 'fr_' + ff)
            if (hasRecvMsg) {
              // Pull-all path: update progress in the folder_recv card
              const fdRef = folderDataRef.current[ff]
              const receivedCount = fdRef ? fdRef.files.filter(Boolean).length : 0
              const bytesSent = fdRef ? fdRef.files.filter(Boolean).reduce((s, f) => s + (f.size || 0), 0) : 0
              return {
                ...prev, [p]: peerMsgs.map(msg =>
                  msg.id === 'fr_' + ff
                    ? {
                      ...msg,
                      receivedCount,
                      bytesSent,
                      speedHistory: [...(msg.speedHistory || []).filter(h => Date.now() - h.t < 2000), { t: Date.now(), b: bytesSent }],
                      lastGotT: Date.now()
                    }
                    : msg
                )
              }
            } else {
              // Single-file pull via browse card: show received file inline in the browse card
              return {
                ...prev, [p]: peerMsgs.map(msg =>
                  msg.id === 'fb_' + ff
                    ? {
                      ...msg,
                      status: 'available',  // reset status so user can pull more
                      receivedFiles: [
                        ...(msg.receivedFiles || []).filter(f => f.name !== m.name),
                        { relPath: m.folderRelPath || m.name, name: m.name, size: m.size, blob: b, tmpPath: tp }
                      ]
                    }
                    : msg
                )
              }
            }
          })
        }, 250)  // batch every 250ms = max 4 React updates/sec
      },
      onFolderComplete(pid, fid, name, fileCount) {
        // Flush any pending throttle timer so receivedCount is accurate
        const flushKey = pid + '|' + fid
        if (folderDataRef.current._flushTimers?.[flushKey]) {
          clearTimeout(folderDataRef.current._flushTimers[flushKey])
          delete folderDataRef.current._flushTimers[flushKey]
          delete folderDataRef.current._pendingUpdates?.[flushKey]
        }
        const fd = folderDataRef.current[fid]
        const actualCount = fd ? fd.files.filter(Boolean).length : fileCount
        setMsgs(p => ({
          ...p, [pid]: (p[pid] || []).map(m =>
            m.id === 'fr_' + fid
              ? { ...m, complete: true, receivedCount: actualCount, speedHistory: [] }
              : m.id === 'fb_' + fid
                ? { ...m, status: 'done' }
                : m
          )
        }))
        addLog('OK', `Folder received: ${name}`, `${actualCount} files`)
        notify(`Folder received: ${name}`, 'ok')
      },
    })
    return () => bridgeRef.current?.destroy?.()
  }, [pushMsg, addLog, notify])

  // doSend — send chat message to selected peer
  const doSend = useCallback(async () => {
    if (!selPeer || !input.trim()) return
    const text = input.trim()
    setInput('')
    // Check if this peer has explicitly removed us before trying to send
    if (removedByPeersRef.current.has(selPeer.id)) {
      notify('❌ Cannot send — this peer has removed you from their list', 'err')
      setInput(text)  // restore the typed text so user doesn't lose it
      return
    }
    if (await bridgeRef.current?.sendMsg(selPeer.id, text)) {
      pushMsg(selPeer.id, { id: Date.now(), from: 'me', type: 'text', text, time: now8() })
    } else {
      // Peer is offline but didn't explicitly remove us — could be a crash/disconnect
      const wasRemoved = peersRef.current.find(p => p.id === selPeer.id)?.removedMe
      notify(wasRemoved
        ? '❌ Not delivered — this peer removed you from their list'
        : '⚠ Not delivered — peer appears to be offline or disconnected', 'err')
    }
  }, [selPeer, input, pushMsg, notify])

  // doSendFileInner — actual send logic (called directly or after danger confirmation)
  const doSendFileInner = useCallback(async (file) => {
    if (!selPeer) return
    // Use a single UUID as the fid for BOTH the UI message AND the wire transfer.
    // This ensures the revoke chain works: sender's message id (fid+'_out') strips '_out'
    // to get rawFid, receiver's message id (fid+'_in') matches on revoke receipt.
    const fid = crypto.randomUUID()
    pushMsg(selPeer.id, { id: fid + '_out', from: 'me', type: 'file_out', meta: { name: file.name, size: file.size }, pct: 0, time: now8() })
    addLog('INFO', `Sending: ${file.name}`, fmtSz(file.size))
    // EXIF strip: if enabled, strip metadata before sending
    let fileToSend = file
    if (settRef.current.exifStripSend && (IS_IMG.test(file.name) || IS_PDF.test(file.name))) {
      try {
        const stripped = await stripMetadata(file, file.name)
        fileToSend = new File([stripped], file.name, { type: file.type || stripped.type })
        addLog('INFO', `Metadata stripped: ${file.name}`)
      } catch { fileToSend = file }
    }
    const ok = await bridgeRef.current?.sendFile(selPeer.id, fileToSend, pct => {
      const bytesSent = Math.round((fileToSend.size || 0) * pct)
      const now = Date.now()
      setMsgs(p => ({
        ...p, [selPeer.id]: (p[selPeer.id] || []).map(m => {
          if (m.id !== fid + '_out') return m
          const hist = [...(m.speedHistory || []).filter(h => now - h.t < 2500), { t: now, b: bytesSent }]
          let calcSpeed = 0, calcEta = 0
          if (hist.length >= 2) {
            const dt = (hist[hist.length - 1].t - hist[0].t) / 1000
            if (dt > 0) {
              calcSpeed = (hist[hist.length - 1].b - hist[0].b) / dt
              const rem = (fileToSend.size || 0) - bytesSent
              calcEta = calcSpeed > 0 ? Math.round(rem / calcSpeed) : 0
            }
          }
          return { ...m, pct, bytesSent, speedHistory: hist, calcSpeed, calcEta }
        })
      }))
    }, fid, true)
    if (!ok) {
      notify(`Send failed: ${file.name}`, 'err')
      // Keep the message but mark as failed with retry option
      setMsgs(p => ({ ...p, [selPeer.id]: (p[selPeer.id] || []).map(m => m.id === fid + '_out' ? { ...m, pct: 0, sendFailed: true, failedFile: file, onRetry: (f) => doSendFileInner(f) } : m) }))
    } else {
      notify(`Sent: ${file.name}`, 'ok')
    }
  }, [selPeer, pushMsg, addLog, notify])

  // doSendFile — read a File and send it to the selected peer
  const doSendFile = useCallback(async (file) => {
    if (!selPeer) return
    if (removedByPeersRef.current.has(selPeer.id)) {
      notify('❌ Cannot send file — this peer has removed you from their list', 'err')
      return
    }
    // v4.1: Block sending unsupported archive formats
    if (IS_UNSUPPORTED_ARCH.test(file.name)) {
      notify(`❌ .${file.name.split('.').pop()} is not supported — only ZIP and TAR archives can be sent`, 'err')
      return
    }
    // Reject bare .bz2, .gz, .xz files (not wrapped in .tar)
    if (IS_BARE_COMPRESSED.test(file.name)) {
      notify(`❌ Standalone .${file.name.split('.').pop()} files are not supported — use .tar.${file.name.split('.').pop()} or .zip instead`, 'err')
      return
    }
    // Warn before sending dangerous/executable files
    if (IS_DANGEROUS.test(file.name)) {
      setShowDangerConfirm(file)
      return
    }
    await doSendFileInner(file)
  }, [selPeer, notify])

  // doSendFolder — advertise a folder offer to the peer (browse+pull model)
  const doSendFolder = useCallback(async (files) => {
    if (!selPeer || !files.length) return
    const fid = 'fd_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const folderName = files[0].webkitRelativePath?.split('/')[0] || 'Folder'
    // Build tree for remote preview
    const tree = files.map((f, idx) => ({
      relPath: f.webkitRelativePath || f.name,
      name: f.name,
      size: f.size,
      index: idx,
    }))
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    // Store files in ref so we can send on pull-request
    sharedFoldersRef.current[fid] = { name: folderName, files: Array.from(files) }
    // Show offer card in our own chat
    pushMsg(selPeer.id, {
      id: 'fo_' + fid, from: 'me', type: 'folder_offer',
      name: folderName, fid, totalFiles: files.length, totalBytes,
      status: 'offered', time: now8(),
    })
    // Notify peer of the folder offer so they can browse structure
    await bridgeRef.current?.sendMsg(selPeer.id, {
      type: 'folder_offer', fid, name: folderName,
      totalFiles: files.length, totalBytes, tree,
    })
    addLog('INFO', `Folder offered: ${folderName}`, `${files.length} files, ${fmtSz(totalBytes)}`)
    notify(`Folder offered: ${folderName}`, 'ok')
  }, [selPeer, pushMsg, addLog, notify])

  // doPullFolder — receiver side: request files from sender's shared folder
  // fileIndex: null = pull all, number = pull single file
  // folderMeta: { name, totalFiles, totalBytes } from the browse card
  // asZip: true = auto-ZIP when done
  const doPullFolder = useCallback(async (peerId, fid, fileIndex, folderMeta, asZip) => {
    if (fileIndex === null) {
      // Pull all — create a folder_recv progress message so the receiver sees progress
      if (!folderDataRef.current[fid]) {
        folderDataRef.current[fid] = { name: folderMeta?.name || 'Folder', files: [], expectedCount: folderMeta?.totalFiles || 0 }
      }
      // Create the receiving progress card below the browse card
      setMsgs(p => {
        const pid_msgs = p[peerId] || []
        const alreadyHasRecv = pid_msgs.some(m => m.id === 'fr_' + fid)
        if (alreadyHasRecv) return p
        return {
          ...p, [peerId]: [...pid_msgs, {
            id: 'fr_' + fid, from: 'them', type: 'folder_recv',
            folderFid: fid, name: folderMeta?.name || 'Folder',
            totalFiles: folderMeta?.totalFiles || 0, totalBytes: folderMeta?.totalBytes || 0,
            receivedCount: 0, complete: false, pullAsZip: !!asZip, time: now8()
          }]
        }
      })
      // Mark browse card as pulling
      setMsgs(p => ({
        ...p, [peerId]: (p[peerId] || []).map(m =>
          m.id === 'fb_' + fid ? { ...m, status: 'pulling' } : m
        )
      }))
    } else {
      // Single file pull — mark browse card as pulling (briefly) and track in receivedFiles
      // The file will arrive via onFolderFileDone which updates receivedFiles in the browse msg
      setMsgs(p => ({
        ...p, [peerId]: (p[peerId] || []).map(m =>
          m.id === 'fb_' + fid ? { ...m, status: 'pulling' } : m
        )
      }))
    }
    await bridgeRef.current?.sendMsg(peerId, {
      type: 'folder_pull', fid,
      fileIndex: fileIndex != null ? fileIndex : null,
    })
  }, [pushMsg])

  // doExtract — gate for archive extraction (shows warning if warnArch is on)
  const doExtract = useCallback((msg) => {
    if (!msg.blob && !msg.tmpPath) { notify('File not in memory — save first', 'err'); return }
    if (sett.warnArch) {
      setShowArchConfirm(msg)
    } else {
      doExtractAction(msg)
    }
  }, [sett.warnArch])

  // doExtractAction — actually extract archive into sandboxed temp dir
  const doExtractAction = useCallback(async (msg) => {
    setShowArchConfirm(null)
    // Support both blob (small files) and tmpPath (large files >32MB)
    if (!msg.blob && !msg.tmpPath) { notify('File not loaded in memory', 'err'); return }
    setSandboxLoading(true)
    try {
      let result
      if (msg.tmpPath) {
        // Large file: use path-based extraction to avoid memory spike
        result = await window.ftps?.extractArchiveFromPath(msg.meta?.name || 'archive', msg.tmpPath)
      } else {
        const r = new FileReader()
        const b64 = await new Promise((res, rej) => {
          r.onload = () => res(r.result.split(',')[1])
          r.onerror = rej
          r.readAsDataURL(msg.blob)
        })
        result = await window.ftps?.extractArchive(msg.meta?.name || 'archive', b64)
      }
      setSandboxLoading(false)
      if (result?.ok) {
        setSandbox({ name: msg.meta?.name, sandboxDir: result.sandboxDir, sandboxId: result.sandboxId, tree: result.tree })
        addLog('OK', `Archive extracted: ${msg.meta?.name}`, result.sandboxDir)
        notify('Archive ready in sandbox', 'ok')
      } else if (result?.passwordProtected) {
        notify('🔐 Archive is password-protected — cannot extract', 'err')
        addLog('WARN', 'Password-protected archive', msg.meta?.name)
      } else {
        notify('Extract failed: ' + (result?.error || 'Install 7-Zip for full format support'), 'err')
        addLog('ERR', 'Extract failed', result?.error || '')
      }
    } catch (e) {
      setSandboxLoading(false)
      notify('Extract error: ' + e.message, 'err')
      addLog('ERR', 'Extract error', e.message)
    }
  }, [addLog, notify])

  // doRevoke — fix targetId mismatch + cancel mid-send
  const doRevoke = useCallback(async (msgOrId) => {
    if (!selPeer) return
    const targetMsgId = typeof msgOrId === 'string' ? msgOrId : msgOrId?.id
    if (!targetMsgId) return
    const rawFid = targetMsgId.endsWith('_out') ? targetMsgId.slice(0, -4) : targetMsgId
    // If still sending (pct < 1), cancel the transfer first
    const currentMsg = (msgs[selPeer.id] || []).find(m => m.id === targetMsgId)
    if (currentMsg && currentMsg.pct !== undefined && currentMsg.pct < 1) {
      await window.ftps?.cancelSend(selPeer.id, rawFid)
    }
    setMsgs(p => ({
      ...p, [selPeer.id]: (p[selPeer.id] || []).map(m =>
        m.id === targetMsgId ? { ...m, blob: null, tmpPath: null, type: 'revoked', revokedAt: new Date().toLocaleTimeString() } : m
      )
    }))
    await bridgeRef.current?.sendMsg(selPeer.id, { type: 'revoke', fid: rawFid })
    notify('File access revoked', 'ok')
    addLog('INFO', 'File revoked', rawFid)
  }, [selPeer, msgs, addLog, notify])

  // doDeletePeer — disconnect and remove a peer from the list
  // Notify the other side before disconnecting
  // Clear chat history and removedByPeers flag on peer remove so re-add starts fresh
  const doDeletePeer = useCallback((peerId) => {
    setShowRemoveConfirm(null)
    // Send removal notification before disconnecting
    bridgeRef.current?.sendMsg(peerId, { type: 'peer_removed' })
    // Small delay to allow message to send before disconnect
    setTimeout(() => {
      bridgeRef.current?.disconnect(peerId)
      setPeers(ps => ps.filter(p => p.id !== peerId))
      // Always clear chat history on remove so re-adding shows a clean slate
      setMsgs(p => { const n = { ...p }; delete n[peerId]; return n })
      // Clear the removedByPeers flag so if this peer re-connects we don't
      // show "🚫 This peer removed you" — we removed THEM, not the other way around
      removedByPeersRef.current.delete(peerId)
      if (selPeer?.id === peerId) setSelPeer(null)
      addLog('INFO', 'Peer removed', peerId)
      notify('Peer removed', 'ok')
    }, 100)
  }, [selPeer, addLog, notify])

  // doBlockPeer — block a peer and disconnect
  const doBlockPeer = useCallback(async (peerId, peerName) => {
    // Save full peer state BEFORE removing from UI — restores on unblock
    setMsgs(currentMsgs => {
      blockedPeerStateRef.current[peerId] = {
        name: peerName,
        msgs: currentMsgs[peerId] || [],
        blockedAt: new Date().toISOString(),
        // Also save peer identity info for re-connection TOFU
        identityKey: peerIdentityKeys[peerId] || null,
        fingerprint: peerFingerprints[peerId] || null,
      }
      return currentMsgs
    })
    await window.ftps?.blockPeer(peerId, peerName, 'Manually blocked')
    bridgeRef.current?.disconnect(peerId)
    // Completely remove blocked peer from UI — they are INVISIBLE until unblocked
    // Only reachable via Settings > Blocked Peers
    setPeers(ps => ps.filter(p => p.id !== peerId))
    setMsgs(p => { const n = { ...p }; delete n[peerId]; return n })
    if (selPeer?.id === peerId) setSelPeer(null)
    setBlockedPeers(prev => [...prev.filter(b => b.id !== peerId), { id: peerId, name: peerName, blockedAt: new Date().toISOString() }])
    addLog('INFO', `Blocked peer: ${peerName || peerId}`)
    notify(`${peerName || 'Peer'} blocked — unblock in Settings to restore chat`, 'ok')
  }, [selPeer, addLog, notify])

  const onlinePeers = peers.filter(p => p.online)
  const peerMsgs = msgs[selPeer?.id] || []
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [peerMsgs.length])

  // Sidebar rename callback — avoids duplicating logic in Sidebar component
  const onRenameSave = useCallback(async (newName) => {
    if (newName && newName !== account?.name) {
      const res = await window.ftps?.updateName?.(newName)
      if (res?.limitReached) {
        notify(`Rename limit (${res.renameLimit || 3}/session) reached`, 'err')
        return
      }
      if (res?.renameCount) setRenameCountThisSession(res.renameCount)
      setAccount(a => ({ ...a, name: newName }))
      saveSession({ ...account, name: newName }, myId.current)
      addLog('INFO', `Name changed: ${account?.name} → ${newName}`)
      notify('Name updated — peers notified', 'ok')
    }
  }, [account, addLog, notify])

  // ── ACTIONS ──────────────────────────────────────────────────────────────────
  const doSetup = async () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.passphrase.trim()) e.passphrase = 'Required'
    const pw = form.password
    if (!pw || pw.length < 6) e.password = 'Min 6 chars'
    else if (!/[A-Z]/.test(pw)) e.password = 'Needs uppercase'
    else if (!/[a-z]/.test(pw)) e.password = 'Needs lowercase'
    else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) e.password = 'Needs special char'
    if (Object.keys(e).length) { setFErr(e); return }
    // keyRef/generateKeyPair removed — all crypto is in main.js
    myId.current = makeId(form.name)
    const res = await window.ftps?.setIdentity(form.name.trim(), myId.current)
    if (res?.nodeId) myId.current = res.nodeId
    if (res?.identityKey) myIdentityKeyRef.current = res.identityKey  // self-connection guard
    setAccount(form); lastAct.current = Date.now(); setLockTimer(sett.lockMin * 60)
    // save session to sessionStorage so Refresh UI can restore without re-setup
    saveSession(form, myId.current)
    addLog('OK', `Session started: ${form.name}`)
    setScreen('main'); notify('Session ready', 'ok')
    // main process auto-starts TCP server + Tor on identity set.
    // Listen for the one-time auto-listen event and update UI state.
    const unsubAutoListen = window.ftps?.on('ftps:listen-auto', d => {
      if (d?.ok) {
        setListenActive(true)
        setListenInfo({ port: d.port, localIPs: d.localIPs })
        addLog('OK', `TCP server auto-started on port ${d.port}`)
      }
      unsubAutoListen?.()
    })
  }

  const doUnlock = () => {
    if (lockForm.pp === account.passphrase && lockForm.pw === account.password) {
      setScreen('main'); setLockErr(''); setLockTries(0); setLockForm({ pp: '', pw: '' }); lastAct.current = Date.now()
      addLog('OK', 'Session unlocked')
    } else {
      const t = lockTries + 1; setLockTries(t); addLog('WARN', `Failed unlock attempt ${t}`)
      if (t >= sett.maxTries) {
        addLog('ERR', 'Max attempts — FULL WIPE initiated')
        // Full wipe — EVERYTHING cleared, no stale peers/data visible
        window.ftps?.fullWipe?.()   // wipe backend state immediately
        window.ftps?.stopTor()
        clearSavedSession()
        sessionStorage.clear()      // wipe any other session storage
        // Reset ALL frontend state to factory-clean
        setAccount(null); setScreen('setup')
        setMsgs({}); setPeers([])
        setForm({ name: '', passphrase: '', password: '' })
        setLockForm({ pp: '', pw: '' }); setLockTries(0); setLockErr('')
        setTorStatus('off'); setOnionAddr(''); setTorError(''); setTorBootstrap(0); setTorBootstrapMsg('Initializing…')
        setListenActive(false); setListenInfo(null)
        setDiscoveredPeers([]); setPeerFingerprints({}); setPeerIdentityKeys({})
        setVerifiedPeers(new Set()); setSysStats(null); setLogs([])
        setSelPeer(null); setTab('connect'); setInput('')
        setPendingPeerRequests([]); setSentPeerRequests(new Set())
        setBlockedPeers([])
        setConnState('idle'); setConnErr(''); setConnectAddr('')
        setTorConnState('idle'); setTorConnErr(''); setOnionInput('')
        setSett2Raw({ ...DEFAULT_SETTINGS })
        folderDataRef.current = {}; sharedFoldersRef.current = {}
        removedByPeersRef.current.clear(); folderPullFidsRef.current.clear()
        myIdentityKeyRef.current = ''; myOnionAddrRef.current = ''
        peerIdentityKeysRef.current = {}
        if (window.__p2nIkRef) window.__p2nIkRef = {}
      } else setLockErr(`Wrong · ${sett.maxTries - t} attempt${sett.maxTries - t !== 1 ? 's' : ''} left`)
    }
  }

  const doLock = () => { setScreen('locked'); setLockForm({ pp: '', pw: '' }); addLog('INFO', 'Session locked') }
  // doTerminate — complete session wipe, ALL state reset to clean slate
  const doTerminate = () => {
    clearSavedSession()
    sessionStorage.clear()          // wipe all sessionStorage
    window.ftps?.fullWipe?.()       // wipe backend in-memory state immediately
    window.ftps?.stopTor()
    addLog('INFO', 'Session ended — all data wiped')
    // Reset ALL frontend state
    setAccount(null); setScreen('setup'); setMsgs({}); setPeers([])
    setForm({ name: '', passphrase: '', password: '' })
    setLockForm({ pp: '', pw: '' }); setLockErr(''); setLockTries(0)
    setConnState('idle'); setConnErr(''); setConnectAddr('')
    setTorConnState('idle'); setTorConnErr(''); setOnionInput('')
    setTorStatus('off'); setOnionAddr(''); setTorError(''); setTorBootstrap(0); setTorBootstrapMsg('Initializing…')
    setListenActive(false); setListenInfo(null)
    setDiscoveredPeers([]); setPeerFingerprints({}); setPeerIdentityKeys({})
    setVerifiedPeers(new Set()); setSysStats(null); setLogs([])
    setSelPeer(null); setTab('connect'); setInput('')
    setPendingPeerRequests([]); setSentPeerRequests(new Set())
    setBlockedPeers([])
    setSett2Raw({ ...DEFAULT_SETTINGS })
    folderDataRef.current = {}; sharedFoldersRef.current = {}
    removedByPeersRef.current.clear(); folderPullFidsRef.current.clear()
    myIdentityKeyRef.current = ''; myOnionAddrRef.current = ''
    peerIdentityKeysRef.current = {}
    if (window.__p2nIkRef) window.__p2nIkRef = {}
    window.ftps?.getPort?.().then(r => { if (r?.port) setListenPort(String(r.port)) }).catch(() => { })
  }

  const doListen = async () => {
    const r = await window.ftps?.listen(parseInt(listenPort) || 0)
    if (!r) { notify('Electron API unavailable', 'err'); return }
    if (r.ok) { setListenActive(true); setListenInfo({ port: r.port, localIPs: r.localIPs }); addLog('OK', `TCP server port ${r.port}`); notify(`Listening on :${r.port}`, 'ok') }
    else { notify('Listen failed: ' + r.error, 'err') }
  }

  const doStopListen = async () => {
    const r = await window.ftps?.stopListen()
    if (r?.ok) { setListenActive(false); setListenInfo(null); notify('Stopped listening', 'ok'); addLog('OK', 'TCP server stopped') }
  }

  const doConnect = async () => {
    const t = connectAddr.trim(); if (!t) { notify('Enter IP:port', 'err'); return }
    const parts = t.split(':'); if (parts.length < 2 || !parts[0] || !parts[1]) { notify('Format: 192.168.x.x:7900', 'err'); return }
    const targetHost = parts[0].trim(), targetPort = parseInt(parts[1])
    // Self-connection guard: check if target matches any of our own local IPs + port
    if (listenInfo) {
      const myPort = listenInfo.port
      const myIPs = (listenInfo.localIPs || []).map(i => i.address)
      const selfIPs = [...myIPs, '127.0.0.1', 'localhost', '::1']
      if (selfIPs.includes(targetHost) && targetPort === myPort) {
        notify('⚠ That is your own address — cannot connect to yourself', 'err')
        addLog('WARN', 'Self-connect blocked (direct)')
        return
      }
    }
    setConnState('connecting'); setConnErr('')
    const r = await window.ftps?.connect(targetHost, String(targetPort))
    if (!r) { notify('Electron API unavailable', 'err'); setConnState('idle'); return }
    if (r.ok) {
      setConnState('done')
      notify('Request sent — waiting for approval…', 'ok')
      setTab('requests')
    }
    else { setConnState('error'); setConnErr(r.error || 'Failed'); addLog('ERR', 'Connect failed', r.error || ''); notify('Failed: ' + (r.error || ''), 'err') }
  }

  // ── Tor functions ─────────────────────────────────────────────────────
  const doStartTor = async () => {
    // If not listening yet, auto-start listening on the default port
    if (!listenInfo) {
      addLog('INFO', 'Auto-starting listener for Tor…')
      const lr = await window.ftps?.listen(parseInt(listenPort) || 7000)
      if (!lr) { notify('Electron API unavailable', 'err'); return }
      if (!lr.ok) { notify('Listen failed: ' + lr.error, 'err'); return }
      setListenActive(true); setListenInfo({ port: lr.port, localIPs: lr.localIPs })
      addLog('OK', `TCP server port ${lr.port}`)
      // Calling startTor again caused "Already running" errors.
      // Now startTor returns ok:true if Tor is already starting — handle gracefully.
      setTorStatus('starting'); setTorError(''); addLog('INFO', 'Starting Tor daemon…')
      const r = await window.ftps?.startTor(lr.port)
      if (r?.ok) {
        if (r.onionAddress) {
          setTorStatus('running'); setOnionAddr(r.onionAddress + ':' + r.port)
          addLog('OK', `Tor hidden service: ${r.onionAddress}`); notify('Onion link ready!', 'ok')
        } else {
          // Tor is still bootstrapping — ftps:tor-status events will update the UI
          addLog('INFO', 'Tor is bootstrapping — waiting for onion address…')
        }
      } else {
        setTorStatus('error'); setTorError(r?.error || 'Unknown error')
        addLog('ERR', 'Tor failed: ' + (r?.error || 'Unknown')); notify('Tor failed: ' + (r?.error || 'Unknown'), 'err')
      }
      return
    }
    setTorStatus('starting'); setTorError(''); addLog('INFO', 'Starting Tor daemon…')
    const r = await window.ftps?.startTor(listenInfo.port)
    if (r?.ok) {
      if (r.onionAddress) {
        setTorStatus('running'); setOnionAddr(r.onionAddress + ':' + r.port)
        addLog('OK', `Tor hidden service: ${r.onionAddress}`); notify('Onion link ready!', 'ok')
      } else {
        // Tor bootstrapping — ftps:tor-status events will update the UI
        addLog('INFO', 'Tor is bootstrapping — waiting for onion address…')
      }
    } else {
      setTorStatus('error'); setTorError(r?.error || 'Unknown error')
      addLog('ERR', 'Tor failed: ' + (r?.error || 'Unknown')); notify('Tor failed: ' + (r?.error || 'Unknown'), 'err')
    }
  }

  const doStopTor = async () => {
    const r = await window.ftps?.stopTor()
    if (r?.ok) { setTorStatus('off'); setOnionAddr(''); setTorError(''); addLog('OK', 'Tor daemon stopped'); notify('Tor stopped', 'ok') }
  }

  const doConnectOnion = async () => {
    const addr = onionInput.trim(); if (!addr) { notify('Enter .onion address', 'err'); return }
    const parts = addr.split(':')
    if (!parts[0].endsWith('.onion')) { notify('Address must end in .onion', 'err'); return }
    if (parts[0].length < 16) { notify('Invalid .onion address (too short)', 'err'); return }
    const port = parseInt(parts[1])
    if (!parts[1] || isNaN(port) || port < 1 || port > 65535) { notify('Invalid port — format: xxxx.onion:7900', 'err'); return }
    // Self-connection guard: compare against our own onion address
    if (myOnionAddrRef.current && parts[0] === myOnionAddrRef.current) {
      notify('⚠ That is your own onion address — cannot connect to yourself', 'err')
      addLog('WARN', 'Self-connect blocked (Tor)')
      return
    }
    setTorConnState('connecting'); setTorConnErr('')
    addLog('INFO', `Connecting via Tor to ${addr}`)
    const r = await window.ftps?.connectOnion(parts[0], port)
    if (!r) { notify('Electron API unavailable', 'err'); setTorConnState('idle'); return }
    if (r.ok) {
      setTorConnState('done')
      notify('Tor request sent — waiting for approval…', 'ok')
      setTab('requests')
    }
    else { setTorConnState('error'); setTorConnErr(r.error || 'Failed'); notify('Tor connect failed: ' + (r.error || ''), 'err') }
  }

  // ── RESTORING (Refresh UI in progress) ────────────────────────────────────
  if (screen === 'restoring') return (
    <div style={{ height: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{G}</style>
      <div style={{ textAlign: 'center' }} className="fadein">
        <div style={{ width: 50, height: 50, borderRadius: 13, background: T.accent + '16', border: `1px solid ${T.accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px' }}>🔐</div>
        <div style={{ fontSize: 18, color: T.text, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>P2N</div>
        <div style={{ fontSize: 11, color: T.accent, marginBottom: 16 }}>Peer-Networking</div>
        <div className="spin" style={{ width: 24, height: 24, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', margin: '0 auto 10px' }} />
        <div style={{ fontSize: 12, color: T.textDim }}>Restoring session…</div>
        <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Peer connections are unaffected</div>
      </div>
    </div>
  )

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (screen === 'setup') return (
    <div style={{ height: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{G}</style><Toast n={toast} />
      <div style={{ width: '100%', maxWidth: 390 }} className="fadeup">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 26, color: T.text, fontWeight: 800, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>P2N(Peer-Networking) <span style={{ fontSize: 28 }}>🔐</span></div>
          <div style={{ fontSize: 10, color: T.textDim, marginTop: 5, display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Direct TCP', 'ECDH P-256', 'Ed25519', 'AES-256-GCM', 'Tor', 'TOFU'].map(b => (
              <span key={b} style={{ background: T.panel, border: `1px solid ${T.accent}22`, borderRadius: 4, padding: '2px 7px', color: T.textDim }}>{b}</span>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div className="sh">New Session</div>
          {[{ k: 'name', l: 'Display Name', type: 'text', ph: 'Your alias' }, { k: 'passphrase', l: 'Passphrase (to unlock)', type: 'text', ph: 'Memorable phrase', extra: <button onClick={() => setForm(p => ({ ...p, passphrase: phrase() }))} className="btn btn-ghost btn-xs" title="Generate random passphrase">🎲</button> }, { k: 'password', l: 'Password (A-Z + special)', type: 'password', ph: 'Second factor' }].map(f => (
            <div key={f.k} style={{ marginBottom: 13 }}>
              <div style={{ fontSize: 11, marginBottom: 4, display: 'flex', justifyContent: 'space-between', color: fErr[f.k] ? T.red : T.textDim }}><span>{f.l}</span>{fErr[f.k] && <span style={{ color: T.red, fontSize: 10 }}>{fErr[f.k]}</span>}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form[f.k]} type={f.type} placeholder={f.ph} className={`inp${fErr[f.k] ? ' err' : ''}`}
                  onChange={e => { setForm(p => ({ ...p, [f.k]: e.target.value })); setFErr(p => ({ ...p, [f.k]: '' })) }}
                  onKeyDown={e => e.key === 'Enter' && doSetup()} style={{ flex: 1 }} />
                {f.extra}
              </div>
            </div>
          ))}
          <div style={{ background: T.panel, borderRadius: 6, padding: '9px 12px', marginBottom: 15, fontSize: 11, lineHeight: 1.8 }}>
            <div style={{ color: T.textDim }}>🔒 Auto-locks after {sett.lockMin} min inactivity</div>
            <div style={{ color: T.amber }}>⚠ {sett.maxTries} wrong unlock attempts = session reset</div>
          </div>
          <button onClick={doSetup} className="btn btn-primary" style={{ width: '100%', padding: 11, fontSize: 13, marginBottom: 7 }}>Start Session →</button>
          <button onClick={() => setShowHelp(true)} className="btn btn-ghost" style={{ width: '100%', padding: 9, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>📖</span> Help &amp; Documentation
          </button>
        </div>
      </div>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )



  // ── LOCK ──────────────────────────────────────────────────────────────────
  if (screen === 'locked') return (
    <div style={{ height: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{G}</style><Toast n={toast} />
      <div style={{ width: '100%', maxWidth: 330 }} className="fadeup">
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span>Session Locked</span>
            <span style={{ fontSize: 26, animation: 'lockpulse 2s ease-in-out infinite', display: 'inline-block' }}>🔒</span>
          </div>
          {lockTries > 0 && <div style={{ fontSize: 13, color: lockTries >= 3 ? T.red : T.amber, marginTop: 8, fontWeight: 600 }}>{lockTries} failed · {sett.maxTries - lockTries} left</div>}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 13 }}><div style={{ fontSize: 12, color: T.textMid, marginBottom: 5, fontWeight: 500 }}>Passphrase</div><input type="password" value={lockForm.pp} placeholder="Enter your passphrase" className="inp" style={{ fontSize: 13 }} onChange={e => setLockForm(p => ({ ...p, pp: e.target.value }))} onKeyDown={e => e.key === 'Enter' && doUnlock()} /></div>
          <div style={{ marginBottom: 15 }}><div style={{ fontSize: 12, color: T.textMid, marginBottom: 5, fontWeight: 500 }}>Password</div><input type="password" value={lockForm.pw} placeholder="Enter your password" className="inp" style={{ fontSize: 13 }} onChange={e => setLockForm(p => ({ ...p, pw: e.target.value }))} onKeyDown={e => e.key === 'Enter' && doUnlock()} /></div>
          {lockErr && <div style={{ fontSize: 12, color: T.red, marginBottom: 11, fontWeight: 600 }}>{lockErr}</div>}
          <button onClick={doUnlock} className="btn btn-amber" style={{ width: '100%', padding: 12, fontSize: 14, fontWeight: 700 }}>🔓 Unlock</button>
        </div>
      </div>
    </div>
  )

  // ── MAIN ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg }}>
      <style>{G}</style>
      <Toast n={toast} />
      {folderView && <FolderViewer folder={folderView} onClose={() => setFolderView(null)} />}
      {fileView && <FileViewer file={fileView} onClose={() => setFileView(null)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {zipView && <ZipViewer msg={zipView} onClose={() => setZipView(null)} onOSSandbox={m => { setZipView(null); setOsSandbox(m) }} />}
      {osSandbox && <OSSandbox file={osSandbox} onClose={() => setOsSandbox(null)} />}
      {showCode && selPeer && <CodeEditor onSend={async t => { if (!selPeer) return; if (await bridgeRef.current?.sendMsg(selPeer.id, t)) pushMsg(selPeer.id, { id: Date.now(), from: 'me', type: 'text', isCode: true, text: t, time: now8() }) }} onClose={() => setShowCode(false)} />}
      {showCloseConfirm && <CloseConfirm onCancel={() => setShowCloseConfirm(false)} onTerminate={doTerminate} />}
      {showVerify && <VerifyModal fingerprint={showVerify.fingerprint} peerName={showVerify.peerName} onClose={() => setShowVerify(null)} onVerified={() => { if (selPeer) setVerifiedPeers(s => { const n = new Set(s); n.add(selPeer.id); return n }) }} />}
      {showTofuWarn && <TofuWarning data={showTofuWarn} onReject={() => { bridgeRef.current?.disconnect(showTofuWarn.peerId); setShowTofuWarn(null); notify('Disconnected — key mismatch', 'err') }} onAccept={() => {
        window.ftps?.tofuAccept(showTofuWarn.peerId, peerIdentityKeys[showTofuWarn.peerId] || null, showTofuWarn.peerName)
        setShowTofuWarn(null); notify('New identity accepted — peer trusted', 'ok')
      }} />}
      {showLinkConfirm && <LinkConfirmDialog url={showLinkConfirm} onClose={() => setShowLinkConfirm(null)} />}
      {showArchConfirm && <ArchiveConfirmDialog onClose={() => setShowArchConfirm(null)} onExtract={() => doExtractAction(showArchConfirm)} />}
      {showDangerConfirm && <DangerFileConfirmDialog file={showDangerConfirm} onClose={() => setShowDangerConfirm(null)} onSendAnyway={async () => { const f = showDangerConfirm; setShowDangerConfirm(null); await doSendFileInner(f) }} />}
      {showRemoveConfirm && <RemovePeerConfirmDialog peerName={showRemoveConfirm.peerName} onClose={() => setShowRemoveConfirm(null)} onRemove={() => doDeletePeer(showRemoveConfirm.peerId)} />}
      {sandboxLoading && <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div className="spin" style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%' }} />
        <div style={{ color: T.textDim, fontSize: 13 }}>Extracting archive…</div>
      </div>}

      <TitleBar account={account} nodeId={myId.current} onlinePeers={onlinePeers.length} listenActive={listenActive} onLock={doLock} onTerminate={() => setShowCloseConfirm(true)} uptime={uptime} onHelp={() => setTab('docs')} lockTimer={lockTimer} lockMin={sett.lockMin} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── SIDEBAR ── */}
        <Sidebar
          account={account} myId={myId.current} editName={editName} setEditName={setEditName}
          nameInput={nameInput} setNameInput={setNameInput} tab={tab} setTab={setTab}
          setUnreadLogs={setUnreadLogs} setLogSearch={setLogSearch} unreadLogs={unreadLogs}
          pendingPeerRequests={pendingPeerRequests} rejectedRequests={rejectedRequests}
          peers={peers} msgs={msgs} selPeer={selPeer} setSelPeer={setSelPeer}
          uptime={uptime} onRenameSave={onRenameSave} notify={notify}
        />

        {/* ── CONTENT AREA (tabs + optional sandbox panel) ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* TAB CONTENT */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* ── CONNECT ── */}
            {tab === 'connect' && <ConnectTab
              listenPort={listenPort} listenActive={listenActive} listenInfo={listenInfo}
              connectAddr={connectAddr} setConnectAddr={setConnectAddr}
              connState={connState} setConnState={setConnState} connErr={connErr} setConnErr={setConnErr}
              torStatus={torStatus} torBootstrap={torBootstrap} torBootstrapMsg={torBootstrapMsg} torError={torError}
              onionAddr={onionAddr} onionInput={onionInput} setOnionInput={setOnionInput}
              torConnState={torConnState} setTorConnState={setTorConnState} torConnErr={torConnErr} setTorConnErr={setTorConnErr}
              doListen={doListen} doStopListen={doStopListen} doConnect={doConnect}
              doStartTor={doStartTor} doStopTor={doStopTor} doConnectOnion={doConnectOnion}
              notify={notify} setTab={setTab}
            />}

            {/* ── PEERS / CHAT ── */}
            {tab === 'peers' && <PeersTab
              selPeer={selPeer} setSelPeer={setSelPeer} peers={peers} setPeers={setPeers}
              peerMsgs={peerMsgs} setMsgs={setMsgs} input={input} setInput={setInput}
              lastAct={lastAct} doSend={doSend} doSendFile={doSendFile} doSendFolder={doSendFolder}
              doRevoke={doRevoke} doExtract={doExtract} doPullFolder={doPullFolder}
              sett={sett} setSett2={setSett2} peerFingerprints={peerFingerprints}
              verifiedPeers={verifiedPeers} setVerifiedPeers={setVerifiedPeers}
              setShowVerify={setShowVerify} setShowRemoveConfirm={setShowRemoveConfirm}
              doBlockPeer={doBlockPeer} setShowLinkConfirm={setShowLinkConfirm}
              setFileView={setFileView} setFolderView={setFolderView} setZipView={setZipView}
              setOsSandbox={setOsSandbox} setShowCode={setShowCode}
              fileInp={fileInp} folderInp={folderInp} sentPeerRequests={sentPeerRequests}
              blockedPeers={blockedPeers} sharedFoldersRef={sharedFoldersRef}
              folderDataRef={folderDataRef} bridgeRef={bridgeRef}
              notify={notify} chatEnd={chatEnd} setTab={setTab}
            />}

            {/* ── LOGS ── */}
            {tab === 'logs' && <LogsTab logs={logs} setLogs={setLogs} logSearch={logSearch} setLogSearch={setLogSearch} notify={notify} />}

            {/* ── REQUESTS ── */}
            {tab === 'requests' && <RequestsTab
              pendingPeerRequests={pendingPeerRequests} setPendingPeerRequests={setPendingPeerRequests}
              rejectedRequests={rejectedRequests} sentPeerRequests={sentPeerRequests}
              setSentPeerRequests={setSentPeerRequests} setPeers={setPeers}
              setTab={setTab} notify={notify}
            />}

            {/* ── MY NETWORK ── */}
            {tab === 'network' && <NetworkTab
              torStatus={torStatus} torBootstrap={torBootstrap} torBootstrapMsg={torBootstrapMsg}
              onionAddr={onionAddr} netInfo={netInfo} netDetails={netDetails}
              listenActive={listenActive} listenInfo={listenInfo} listenPort={listenPort}
              discoveredPeers={discoveredPeers} sentPeerRequests={sentPeerRequests}
              setSentPeerRequests={setSentPeerRequests} setPendingPeerRequests={setPendingPeerRequests}
              blockedPeers={blockedPeers} peers={peers} msgs={msgs}
              myNodeId={myId.current} notify={notify} setTab={setTab} peersRef={peersRef}
            />}

            {/* ── STATS ── */}
            {tab === 'stats' && <StatsTab bwHistory={bwHistory} sysStats={sysStats} onlinePeers={onlinePeers} uptime={uptime} logs={logs} />}

            {/* ── SETTINGS ── */}
            {tab === 'settings' && <SettingsTab
              sett={sett} setSett2={setSett2} lockTimer={lockTimer}
              listenPort={listenPort} setListenPort={setListenPort} listenActive={listenActive}
              torStatus={torStatus} setTorStatus={setTorStatus} setOnionAddr={setOnionAddr} setTorError={setTorError}
              blockedPeers={blockedPeers} setBlockedPeers={setBlockedPeers}
              notify={notify} doTerminate={doTerminate} setTab={setTab}
            />}

            {/* ── DOCS TAB (inline HelpModal) ── */}
            {tab === 'docs' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fadein">
                <HelpModal inline onClose={() => setTab('connect')} />
              </div>
            )}
          </div>{/* end tab content */}

          {/* ── SANDBOX PANEL (right, always visible when active) ── */}
          {sandbox && <SandboxPanel sandbox={sandbox} onClose={() => setSandbox(null)} />}

        </div>{/* end content area */}
      </div>{/* end main layout */}

      <input ref={fileInp} type="file" multiple
        accept=".zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz,application/zip,application/x-tar,application/gzip,application/x-bzip2,application/x-xz,text/*,image/*,application/pdf,video/*,audio/*,application/json,application/xml"
        style={{ display: 'none' }}
        onChange={e => { [...e.target.files].forEach(f => doSendFile(f)); e.target.value = '' }} />
      <input ref={folderInp} type="file" {...{ 'webkitdirectory': '' }} multiple style={{ display: 'none' }} onChange={e => { if (e.target.files.length) doSendFolder([...e.target.files]); e.target.value = '' }} />
    </div>
  )
}

// ── WRAPPED EXPORT ─────────────────────────────────────────────────────────────
export function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
