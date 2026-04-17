import { T } from '../../styles/theme.js'
import { fmt, fmtSz } from '../../utils/format.js'
import { BandwidthGraph } from '../stats/BandwidthGraph.jsx'
import { ResourceBar } from '../stats/ResourceBar.jsx'

export function StatsTab({ bwHistory, sysStats, onlinePeers, uptime, logs }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="fadein">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, letterSpacing: 2 }}>▲ TECHNICAL DASHBOARD</div>
        <div style={{ fontSize: 11, color: T.textDim }}>Real-time frequency: 1,500ms</div>
      </div>

      <div className="card glass glow-blue" style={{ background: `linear-gradient(180deg, ${T.panel}, ${T.bg})`, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: 2, marginBottom: 15 }}>LIVE BITRATE MONITOR</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <BandwidthGraph data={bwHistory.out} color={T.blue} label="OUTBOUND DATA" />
          <BandwidthGraph data={bwHistory.in} color={T.green} label="INBOUND DATA" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="sh" style={{ marginBottom: 15 }}>System Resources</div>
          <ResourceBar label="Process RAM (RSS)" val={sysStats?.rss || 0} max={1024 * 1024 * 1024} col={T.purple} />
          <ResourceBar label="CPU Load Avg" val={sysStats?.cpuPercent || (sysStats?.loadAvg || 0) * 100} max={100} col={T.blue} />
          <ResourceBar label="Heap Used" val={sysStats?.heapUsed || 0} max={sysStats?.heapTotal || 1} col={T.accent} />
          <div style={{ marginTop: 10, background: T.bg, padding: 8, borderRadius: 6, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase', marginBottom: 4 }}>Internal Node Engine</div>
            <div style={{ fontSize: 11, color: T.textMid, fontFamily: 'monospace' }}>{sysStats?.nodeVer || '…'}</div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="sh" style={{ marginBottom: 15 }}>OS & Hardware</div>
          {[
            { l: 'Architecture', v: sysStats?.arch || '…' },
            { l: 'Platform', v: sysStats?.platform || '…' },
            { l: 'OS Release', v: sysStats?.osRelease || '…' },
            { l: 'Host Uptime', v: Math.floor((sysStats?.osUptime || 0) / 3600) + ' hrs' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 3 ? `1px solid ${T.border}20` : 'none' }}>
              <span style={{ fontSize: 11, color: T.textDim }}>{r.l}</span>
              <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { l: 'Bytes Sent', v: fmtSz(sysStats?.bytesSent || 0), c: T.blue },
          { l: 'Bytes Recv', v: fmtSz(sysStats?.bytesReceived || 0), c: T.green },
          { l: 'Online Peers', v: onlinePeers.length, c: T.accent },
          { l: 'Session Time', v: fmt(uptime), c: T.purple }
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: 12, background: `linear-gradient(45deg, ${T.surface}, ${T.panel})` }}>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 12, background: T.panel + '80' }}>
        <div className="sh" style={{ marginBottom: 10 }}>LIVE CONNECTIVITY FEED</div>
        <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 11, fontFamily: 'monospace' }}>
          {logs.slice(0, 5).map((l, i) => (
            <div key={i} style={{ marginBottom: 4, borderLeft: `2px solid ${l.level === 'OK' ? T.green : l.level === 'ERR' ? T.red : T.muted}`, paddingLeft: 8 }}>
              <span style={{ color: T.muted }}>[{l.ts}]</span> <span style={{ color: l.level === 'OK' ? T.green : T.text }}>{l.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
