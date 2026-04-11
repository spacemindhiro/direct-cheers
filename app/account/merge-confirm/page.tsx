"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Merge, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

type TokenInfo = {
  target_email: string;
  requester_email: string | null;
  expires_at: string;
};

function MergeConfirmContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "confirming" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("トークンが指定されていません");
      return;
    }

    fetch(`/api/account/merge-confirm?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setErrorMsg(data.error);
          setStatus("error");
        } else {
          setTokenInfo(data);
          setStatus("ready");
        }
      })
      .catch(() => {
        setErrorMsg("通信エラーが発生しました");
        setStatus("error");
      });
  }, [token]);

  const handleConfirm = async () => {
    setStatus("confirming");
    const res = await fetch("/api/account/merge-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (data.error) {
      setErrorMsg(data.error);
      setStatus("error");
    } else {
      setStatus("done");
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-pink-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="max-w-sm w-full space-y-6">

        {status === "done" ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <h1 className="text-2xl font-black text-white">統合完了！</h1>
            <p className="text-sm text-slate-400">
              {tokenInfo?.target_email} の応援履歴が統合されました。
            </p>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm"
            >
              ホームへ
            </Link>
          </div>
        ) : status === "error" ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <h1 className="text-xl font-black text-white">エラー</h1>
            <p className="text-sm text-red-400">{errorMsg}</p>
            <Link href="/" className="text-sm text-slate-500 hover:text-white transition-colors">
              ホームへ戻る
            </Link>
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
                <Merge size={18} className="text-pink-500" />
              </div>
              <div>
                <p className="text-sm font-black text-white">アカウント統合の確認</p>
                <p className="text-[10px] text-slate-500 mt-0.5">以下の内容を確認してください</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">統合元のメール</span>
                <span className="text-white font-bold">{tokenInfo?.target_email}</span>
              </div>
              {tokenInfo?.requester_email && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">統合先のアカウント</span>
                  <span className="text-white font-bold">{tokenInfo.requester_email}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              統合元のメールアドレスで決済した応援履歴が、統合先のアカウントに移動します。この操作は取り消せません。
            </p>

            {errorMsg && (
              <p className="text-xs text-red-400">{errorMsg}</p>
            )}

            <button
              onClick={handleConfirm}
              disabled={status === "confirming"}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === "confirming" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                "統合を承認する"
              )}
            </button>

            <p className="text-center text-[10px] text-slate-600">
              心当たりがない場合はこのページを閉じてください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MergeConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={24} className="text-pink-500 animate-spin" />
      </div>
    }>
      <MergeConfirmContent />
    </Suspense>
  );
}
