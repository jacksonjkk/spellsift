import React from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportError } from '../../utils/monitoring';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <div className="card card-glow-primary">
          <h1>Something went wrong</h1>
          <p>
            SpellSift hit an unexpected error. Reload the page to try again. If it keeps
            happening, contact support.
          </p>
          <p className="error-boundary-detail">{this.state.message}</p>
          <div className="flex gap-2" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <a className="btn btn-outline" href="mailto:support@spellsift.app">
              Contact support
            </a>
          </div>
        </div>
      </div>
    );
  }
}
