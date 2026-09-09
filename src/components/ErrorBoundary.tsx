import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

interface State {
  error: Error | null;
}

/** Prevents a single failing page from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('UI error', error, info);
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl2 border border-line bg-card p-6 text-center">
        <p className="text-[17px] font-semibold text-ink">Bir şeyler ters gitti.</p>
        <p className="text-[14px] text-muted">Bu ekran yüklenemedi. Verileriniz güvende.</p>
        <Button variant="secondary" onClick={() => this.setState({ error: null })}>
          Tekrar Dene
        </Button>
      </div>
    );
  }
}
