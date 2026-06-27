"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class LoginErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 space-y-2 text-center">
          <p className="text-sm font-black text-red-400">ページの読み込みに失敗しました</p>
          <p className="text-xs text-slate-500 break-all">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
