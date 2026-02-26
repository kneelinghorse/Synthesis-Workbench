"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import type { McpErrorLike } from "@/lib/mcp/retry";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ToolErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const error = this.state.error as McpErrorLike | null;
      const breadcrumb = error?.breadcrumb;
      const advice = error?.advice;

      return (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100 shadow-sm backdrop-blur">
          <div className="text-xs uppercase tracking-[0.3em] text-rose-100/50">
            Tool Error
          </div>
          <div className="mt-1 font-semibold text-rose-50">
            Something went wrong
          </div>
          <div className="mt-2 text-rose-100/80">
            {error?.message ?? "An unexpected error occurred."}
          </div>
          {breadcrumb ? (
            <div className="mt-2 text-xs text-rose-100/50">
              While: {breadcrumb}
            </div>
          ) : null}
          {advice ? (
            <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-100/70">
              {advice}
            </div>
          ) : null}
          <button
            onClick={this.handleRetry}
            className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-500/30"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
