"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PasskeySetup } from "@/components/passkey-setup";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

function RecoverCompleteContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [done, setDone] = useState(false);

  if (!email) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <p className="text-red-400 text-sm">メールアドレスが指定されていません</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Account Recovery</p>
          <h1 className="text-2xl font-black text-white">パスキーを登録</h1>
          <p className="text-sm text-slate-400">
            このデバイスに顔認証・指紋認証を設定します
          </p>
        </div>

        {!done ? (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <PasskeySetup
              email={email}
              mode="register"
              onSuccess={() => setDone(true)}
              buttonLabel="パスキーを登録する"
            />
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-green-400 font-black">登録完了！</p>
            <p className="text-sm text-slate-400">次回からはこのデバイスで顔認証でログインできます</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm"
            >
              ホームへ
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecoverCompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={24} className="text-pink-500 animate-spin" />
      </div>
    }>
      <RecoverCompleteContent />
    </Suspense>
  );
}
