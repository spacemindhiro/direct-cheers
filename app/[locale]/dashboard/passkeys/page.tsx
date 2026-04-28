"use client";

import { useState, useEffect } from "react";
import { Fingerprint, Trash2, Pencil, Check, X, PlusCircle, Loader2, ShieldCheck, Cloud, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PasskeySetup } from "@/components/passkey-setup";
import { createBrowserClient } from "@supabase/ssr";

type Credential = {
  credential_id: string;
  device_name: string | null;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  updated_at: string;
};

function deviceIcon(cred: Credential) {
  if (cred.backed_up) return <Cloud size={14} className="text-blue-400" />;
  return <Fingerprint size={14} className="text-pink-400" />;
}

export default function PasskeysPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);

      const res = await fetch("/api/passkeys/credentials");
      if (res.ok) {
        const { credentials: creds } = await res.json();
        setCredentials(creds ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (credentialId: string) => {
    if (!confirm("このデバイスのパスキーを削除しますか？")) return;
    try {
      const res = await fetch(`/api/passkeys/credentials/${credentialId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCredentials((prev) => prev.filter((c) => c.credential_id !== credentialId));
      }
    } catch {
      setError("削除に失敗しました。再度お試しください。");
    }
  };

  const handleRename = async (credentialId: string) => {
    if (!editName.trim()) return;
    const res = await fetch(`/api/passkeys/credentials/${credentialId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_name: editName }),
    });
    if (res.ok) {
      setCredentials((prev) =>
        prev.map((c) =>
          c.credential_id === credentialId ? { ...c, device_name: editName } : c
        )
      );
      setEditingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-pink-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> ダッシュボードに戻る
        </Link>
        <h1 className="text-xl font-black text-white">パスキー管理</h1>
        <p className="text-xs text-slate-500 mt-1">登録済みデバイスの確認・削除・追加</p>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* 登録済みデバイス一覧 */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          登録済みデバイス（{credentials.length}件）
        </p>

        {credentials.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center">
            <p className="text-sm text-slate-500">パスキーが登録されていません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.credential_id}
                className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="w-9 h-9 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
                  {deviceIcon(cred)}
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === cred.credential_id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(cred.credential_id)}
                        className="flex-1 h-8 bg-slate-950 border border-slate-600 rounded-lg px-3 text-sm text-white outline-none focus:border-pink-500"
                        autoFocus
                      />
                      <button onClick={() => handleRename(cred.credential_id)}>
                        <Check size={16} className="text-green-400" />
                      </button>
                      <button onClick={() => setEditingId(null)}>
                        <X size={16} className="text-slate-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-white truncate">
                        {cred.device_name || "名称未設定のデバイス"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {cred.backed_up && (
                          <span className="flex items-center gap-1 text-[10px] text-blue-400">
                            <ShieldCheck size={10} />クラウド同期
                          </span>
                        )}
                        <span className="text-[10px] text-slate-600">
                          {new Date(cred.created_at).toLocaleDateString("ja-JP")} 登録
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {editingId !== cred.credential_id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingId(cred.credential_id);
                        setEditName(cred.device_name ?? "");
                      }}
                      className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(cred.credential_id)}
                      className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors"
                      disabled={credentials.length <= 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新しいデバイスを追加 */}
      <div className="space-y-3">
        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-2 h-12 bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-2xl text-sm text-slate-400 hover:text-white font-bold transition-all"
          >
            <PlusCircle size={16} />
            このデバイスを追加登録
          </button>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-white">このデバイスを追加</p>
              <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {userEmail ? (
              <PasskeySetup
                email={userEmail}
                mode="register"
                buttonLabel="パスキーを追加登録"
                onSuccess={() => {
                  setShowAdd(false);
                  load();
                }}
              />
            ) : (
              <p className="text-xs text-slate-500">メールアドレスが取得できませんでした</p>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-600 leading-relaxed">
        iCloud キーチェーンや Google パスワードマネージャーを使っている場合、同じアカウントの端末では自動的に同期されます。
      </p>
    </div>
  );
}
