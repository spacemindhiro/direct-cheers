"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

// 子機（QR表示）画面専用のエラーバウンダリ。
// 描画中に例外が起きても画面全体がクラッシュして「couldn't load」のような
// ブラウザ任せの失敗表示にならないよう、その場でエラー内容を表示し、
// 手動リロード不要で自動的に再試行する。
export class QrBoardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[QrBoardErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (!prevState.error && this.state.error) {
      // 10秒後に自動で再試行する(スタッフが画面前にいなくても自己復帰させるため)
      this.retryTimer = setTimeout(() => this.setState({ error: null }), 10_000);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center px-6 text-center gap-3">
          <p className="text-sm font-black text-red-400">画面の表示に失敗しました</p>
          <p className="text-xs text-slate-500 break-all max-w-md">{this.state.error.message}</p>
          <p className="text-[10px] text-slate-600">10秒後に自動で再試行します</p>
        </div>
      );
    }
    return this.props.children;
  }
}
