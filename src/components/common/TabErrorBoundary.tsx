import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — used to clear the error on tab switch. */
  resetKey: string;
}

interface State {
  error: Error | null;
}

/**
 * Isolates a crash to the tab that caused it: the shell, tab bar and command
 * palette stay usable so the user can navigate away without losing the session.
 */
export class TabErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Reported to the console only — this app has no telemetry and never sends
    // errors anywhere. Deliberately logs the component stack, not tab content.
    console.error('[dev-xray] tab crashed:', error.message, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;

    if (error !== null) {
      return (
        <div className="flex-1 flex min-h-0 flex-col items-center justify-center gap-4 overflow-auto p-6 text-center dx-scrollbar">
          <AlertTriangle className="h-8 w-8 text-danger" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-fg">This tool stopped responding</h2>
            <p className="max-w-md text-sm text-fg-muted">
              Something went wrong while rendering. Your other tabs are unaffected.
            </p>
          </div>
          <pre className="max-w-full overflow-x-auto rounded border border-line bg-surface-sunken px-3 py-2 text-left font-mono text-xs text-fg-muted dx-scrollbar">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-raised"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Clear and restart
          </button>
        </div>
      );
    }

    return (
      <div className="flex-1 flex min-h-0 flex-col overflow-hidden">{this.props.children}</div>
    );
  }
}
