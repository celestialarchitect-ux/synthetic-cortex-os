"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class CortexErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Don't log sensitive data — stack only
    // eslint-disable-next-line no-console
    console.error("[CortexBrain3D] render error:", error.message, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center">
          <div className="text-red-400 text-sm font-mono uppercase tracking-wider mb-2">
            WebGL context error
          </div>
          <div className="text-slate-400 text-xs mb-4 max-w-md">
            The 3D brain observatory failed to render. This usually indicates a WebGL
            context loss or GPU driver issue.
          </div>
          <button
            onClick={this.reset}
            className="px-4 py-2 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
