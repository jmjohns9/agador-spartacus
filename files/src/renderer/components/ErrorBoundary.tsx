import React from 'react';
import { Button } from './ui/controls';
import { FONTS, TYPE, NUMERIC, RADIUS } from '../theme/theme';

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
      <div role="alert" style={{
        height: '100vh', background: 'var(--window)', color: 'var(--label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONTS.ui, ...TYPE.body, padding: 40,
      }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <i className="ti ti-alert-octagon" style={{ fontSize: 28, color: 'var(--crit)' }} aria-hidden />
            <h1 style={{ margin: 0, ...TYPE.title2 }}>This screen hit an error</h1>
          </div>
          <p style={{ margin: 0, color: 'var(--label-2)' }}>
            The connection to the vehicle keeps running in the background. Reload to bring the
            screens back; they pick up the current connection. If this keeps happening, copy the
            error below and include it in a bug report.
          </p>
          <pre className="selectable" style={{
            background: 'var(--fill)', borderRadius: RADIUS.control, padding: 12,
            ...NUMERIC, ...TYPE.caption, color: 'var(--crit-text)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 240, overflowY: 'auto', marginTop: 16,
          }}>
            {err.message}
            {err.stack && `\n\n${err.stack}`}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="primary" icon="ti-refresh" onClick={this.reload}>Reload</Button>
            <Button variant="secondary" onClick={this.reset}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }
}
