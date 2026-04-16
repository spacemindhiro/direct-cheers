"use client";

import { useState } from "react";
import { Mail, Merge, CheckCircle2, Loader2, ChevronRight, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AccountPage() {
  const [targetEmail, setTargetEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleMergeRequest = async () => {
    if (!targetEmail.includes("@")) {
      setErrorMsg("有効なメールアドレスを入力してください");
      return;
    }
    setStatus("loading");
    setErrorMsg("");

    const res = await fetch("/api/account/merge-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_email: targetEmail }),
    });
    const data = await res.json();

    if (data.error) {
      setErrorMsg(data.error);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> ダッシュボードに戻る
        </Link>
        <h1 className="text-xl font-black text-white">アカウント管理</h1>
        <p className="text-xs text-slate-500 mt-1">別メールアドレスの応援履歴をまとめる</p>
      </div>

      {/* アカウント統合 */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
            <Merge size={16} className="text-pink-500" />
          </div>
          <div>
            <p className="text-sm font-black text-white">応援履歴を統合</p>
            <p className="text-[10px] text-slate-500 mt-0.5">別のメールアドレスで決済した履歴をこのアカウントにまとめます</p>
          </div>
        </div>

        {status === "sent" ? (
          <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <CheckCircle2 size={20} className="text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-400">確認メールを送信しました</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {targetEmail} にメールを送りました。メール内のリンクをタップすると統合が完了します（有効期限10分）。
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                統合したいメールアドレス
              </label>
              <input
                type="email"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMergeRequest()}
                placeholder="以前使っていたメールアドレス"
                className="w-full h-12 bg-slate-950 border border-slate-600 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400">{errorMsg}</p>
            )}

            <button
              onClick={handleMergeRequest}
              disabled={!targetEmail || status === "loading"}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === "loading" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Mail size={16} />
                  確認メールを送る
                </>
              )}
            </button>

            <p className="text-[10px] text-slate-600 leading-relaxed">
              入力したメールアドレス宛に確認メールを送ります。メール内のリンクをクリックすると、そのメアドで決済した応援履歴がこのアカウントに統合されます。
            </p>
          </>
        )}
      </div>

      {/* リカバリー */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        <Link
          href="/account/recover"
          className="flex items-center justify-between p-5 hover:bg-slate-700 transition-colors"
        >
          <div>
            <p className="text-sm font-bold text-white">メールアドレスを忘れた</p>
            <p className="text-[10px] text-slate-500 mt-0.5">決済金額・日付からアカウントを復旧</p>
          </div>
          <ChevronRight size={16} className="text-slate-500" />
        </Link>
      </div>
    </div>
  );
}
