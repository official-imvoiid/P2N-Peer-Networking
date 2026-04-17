import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e, info) { console.error('P2N render error:', e, info) }
  render() {
    if (this.state.error) {
      const T2 = { bg: '#0b0e14', text: '#e6edf3', border: '#30363d', surface: '#161b22' }
      return (
        <div style={{ height: '100vh', background: T2.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, color: T2.text, fontWeight: 700, marginBottom: 8 }}>UI Error — TCP connections are unaffected</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 16, background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: 6, padding: '8px 12px', textAlign: 'left', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {this.state.error?.message || String(this.state.error)}
            </div>
            <button onClick={() => this.setState({ error: null })} style={{ background: '#58a6ff', color: '#0d1117', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', marginRight: 8 }}>
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
