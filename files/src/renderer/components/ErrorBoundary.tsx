import React from 'react';

// ─── ErrorBoundary — last-line defense so the app never goes black ───────────
//
// If any screen or shared component throws during render, React unmounts the
// whole tree by default. This boundary catches that, shows a useful message,
// and gives the user a way to recover (Reload, or jump back to Connect).

interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });
  reload = () => window.location.reload();

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    const err = this.state.error;
    return (
      <div style={{
        height: '100vh', background: '#0D0F12', color: '#EEF1F5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Barlow', sans-serif", padding: 40,
      }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <i className="ti ti-alert-octagon" style={{ fontSize: 32, color: '#FF8000' }} />
            <h1 style={{ margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Project Agador Spartacus crashed
            </h1>
          </div>
          <p style={{ color: '#7A8496', fontSize: 13, lineHeight: 1.7 }}>
            Something in the renderer threw an error and React unmounted the screen. The session is intact —
            reloading should restore it. If this keeps happening, copy the error below and share it with the dev.
          </p>
          <pre style={{
            background: '#07080A', border: '1px solid #1C2128', borderRadius: 3,
            padding: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: '#FF2440', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 240, overflowY: 'auto', marginTop: 16,
          }}>
            {err.message}
            {err.stack && `\n\n${err.stack}`}
          </pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button
              onClick={this.reload}
              style={{
                background: 'rgba(255,128,0,0.1)', border: '1px solid #FF8000', color: '#FF8000',
                borderRadius: 3, padding: '10px 20px', cursor: 'pointer',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 12,
              }}
            >
              <i className="ti ti-refresh" style={{ marginRight: 6 }} />
              Reload renderer
            </button>
            <button
              onClick={this.reset}
              style={{
                background: '#181C22', border: '1px solid #1C2128', color: '#EEF1F5',
                borderRadius: 3, padding: '10px 20px', cursor: 'pointer',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 12,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
