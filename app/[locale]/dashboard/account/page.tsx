"use client";

import { useState } from "react";
import { Mail, Merge, CheckCircle2, Loader2, ChevronRight, ArrowLeft, KeyRound, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const [targetEmail, setTargetEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwStatus, setPwStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [pwError, setPwError] = useState("");

  const handleSetPassword = async () => {
    if (newPassword.length < 8) { setPwError("8文字以上で設定してください"); return; }
    if (newPassword !== confirmPassword) { setPwError("パスワードが一致しません"); return; }
    setPwStatus("loading");
    setPwError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwError(error.message);
      setPwStatus("error");
    } else {
      setPwStatus("done");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

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

      {/* パスワード設定 */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
            <KeyRound size={16} className="text-pink-500" />
          </div>
          <div>
            <p className="text-sm font-black text-white">パスワードを設定・変更</p>
            <p className="text-[10px] text-slate-500 mt-0.5">パスキー未対応の端末でもログインできます</p>
          </div>
        </div>

        {pwStatus === "done" ? (
          <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <CheckCircle2 size={18} className="text-green-400 shrink-0" />
            <p className="text-sm font-bold text-green-400">パスワードを設定しました</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="新しいパスワード（8文字以上）"
                className="w-full h-12 bg-slate-950 border border-slate-600 rounded-xl px-4 pr-12 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="パスワードを再入力"
              className="w-full h-12 bg-slate-950 border border-slate-600 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
            />
            {pwError && <p className="text-xs text-red-400">{pwError}</p>}
            <button
              onClick={handleSetPassword}
              disabled={!newPassword || !confirmPassword || pwStatus === "loading"}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pwStatus === "loading" ? <Loader2 size={16} className="animate-spin" /> : "パスワードを設定する"}
            </button>
          </div>
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
