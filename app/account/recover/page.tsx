"use client";

import { useState, useEffect, Suspense } from "react";
import { Search, Mail, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

const DEVICE_TOKEN_KEY = "dc_dt";

type RecoveryResult = {
  transaction_id: string;
  masked_email: string | null;
  event_title: string | null;
};

function RecoverContent() {
  const [step, setStep] = useState<"welcome" | "search" | "result" | "migrate" | "done">("welcome");
  const [returningMasked, setReturningMasked] = useState<string | null>(null);

  // 検索フォーム
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RecoveryResult[]>([]);

  // メール移行
  const [newEmail, setNewEmail] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState("");

  // localStorage デバイストークン確認
  useEffect(() => {
    const token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) return;

    fetch(`/api/account/recover?device_token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.found && data.masked_email) {
          setReturningMasked(data.masked_email);
          setStep("welcome");
        }
      })
      .catch(() => {});
  }, []);

  const handleSearch = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || !date) {
      setSearchError("金額と日付を入力してください");
      return;
    }
    setSearching(true);
    setSearchError("");

    const res = await fetch("/api/account/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, date }),
    });
    const data = await res.json();
    setSearching(false);

    if (data.error) {
      setSearchError(data.error);
    } else {
      setResults(data.results ?? []);
      setStep("result");
    }
  };

  const handleMigrate = async (targetEmail?: string) => {
    const email = targetEmail ?? newEmail;
    if (!email.includes("@")) {
      setMigrateError("有効なメールアドレスを入力してください");
      return;
    }
    setMigrating(true);
    setMigrateError("");

    const amt = parseInt(amount, 10);
    const res = await fetch("/api/account/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, date, new_email: email }),
    });
    const data = await res.json();
    setMigrating(false);

    if (data.error) {
      setMigrateError(data.error);
    } else {
      setStep("done");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 px-6 py-10">
      <div className="max-w-sm mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-500 hover:text-white">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-lg font-black text-white">アカウント復旧</h1>
        </div>

        {/* おかえりなさいバナー（LocalStorageトークンで検知） */}
        {step === "welcome" && returningMasked && (
          <div className="bg-pink-500/10 border border-pink-500/20 rounded-2xl p-5 space-y-3">
            <p className="text-sm font-black text-pink-400">おかえりなさい👋</p>
            <p className="text-xs text-slate-400">
              以前このデバイスで決済した履歴が見つかりました。
            </p>
            <p className="text-sm font-bold text-white">{returningMasked}</p>
            <button
              onClick={() => setStep("migrate")}
              className="w-full h-11 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm"
            >
              このメアドにマジックリンクを送る
            </button>
            <button
              onClick={() => { setReturningMasked(null); setStep("search"); }}
              className="w-full text-xs text-slate-600 hover:text-slate-400"
            >
              別のメールアドレスで検索する
            </button>
          </div>
        )}

        {/* 検索フォーム */}
        {(step === "search" || (step === "welcome" && !returningMasked)) && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
                <Search size={16} className="text-pink-500" />
              </div>
              <div>
                <p className="text-sm font-black text-white">決済情報で検索</p>
                <p className="text-[10px] text-slate-500 mt-0.5">金額と日付でメールアドレスを特定します</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  決済金額（円）
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="例: 3000"
                  className="w-full h-12 mt-1 bg-slate-950 border border-slate-600 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  決済日
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-12 mt-1 bg-slate-950 border border-slate-600 rounded-xl px-4 text-sm text-white focus:border-pink-500 outline-none"
                />
              </div>
            </div>

            {searchError && <p className="text-xs text-red-400">{searchError}</p>}

            <button
              onClick={handleSearch}
              disabled={searching}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <><Search size={16} />検索する</>}
            </button>
          </div>
        )}

        {/* 検索結果 */}
        {step === "result" && (
          <div className="space-y-4">
            {results.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                該当する決済が見つかりませんでした
              </div>
            ) : (
              <>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  検索結果 {results.length}件
                </p>
                {results.map((r) => (
                  <div key={r.transaction_id} className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">登録メール</span>
                      <span className="text-white font-bold">{r.masked_email ?? "取得不可"}</span>
                    </div>
                    {r.event_title && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">イベント</span>
                        <span className="text-white">{r.event_title}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-600">このメールアドレスは今も受け取れますか？</p>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 h-10 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-colors"
                        onClick={() => {
                          // メールが使える場合はマジックリンクを直接送る
                          setStep("migrate");
                        }}
                      >
                        使えない
                      </button>
                      <button
                        className="flex-1 h-10 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl text-xs font-bold"
                        onClick={() => setStep("migrate")}
                      >
                        新しいメールに移行
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            <button
              onClick={() => setStep("search")}
              className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              検索条件を変更する
            </button>
          </div>
        )}

        {/* 新メールへの移行 */}
        {step === "migrate" && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
                <Mail size={16} className="text-pink-500" />
              </div>
              <div>
                <p className="text-sm font-black text-white">新しいメールアドレスへ移行</p>
                <p className="text-[10px] text-slate-500 mt-0.5">確実に受け取れるメールアドレスを入力</p>
              </div>
            </div>

            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleMigrate()}
              placeholder="新しいメールアドレス"
              className="w-full h-12 bg-slate-950 border border-slate-600 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
              autoFocus
            />

            {migrateError && <p className="text-xs text-red-400">{migrateError}</p>}

            <button
              onClick={() => handleMigrate()}
              disabled={migrating || !newEmail}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {migrating ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={16} />パスキー登録メールを送る</>}
            </button>
          </div>
        )}

        {/* 完了 */}
        {step === "done" && (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <h2 className="text-xl font-black text-white">メールを送信しました</h2>
            <p className="text-sm text-slate-400">
              {newEmail} にパスキー登録用のメールを送りました。
              メール内のリンクからパスキーを登録すると、次回から顔認証でログインできます。
            </p>
            <Link href="/" className="inline-block text-xs text-slate-600 hover:text-white mt-4">
              ホームへ
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecoverPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={24} className="text-pink-500 animate-spin" />
      </div>
    }>
      <RecoverContent />
    </Suspense>
  );
}
