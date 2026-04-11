"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { CheersCard } from "@/components/cheers-card";
import { PasskeySetup } from "@/components/passkey-setup";
import { Loader2, ArrowLeft, Wallet } from "lucide-react";
import Link from "next/link";

type PaymentResult = {
  transaction_id: string;
  email: string | null;
  amount: number;
  artist_name: string | null;
  event_title: string | null;
  artist_avatar: string | null;
  product_name: string | null;
  stripe_customer_id: string | null;
};

const CUSTOMER_EMAIL_COOKIE = "dc_ce";

function emailFromCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`${CUSTOMER_EMAIL_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function ThanksContent() {
  const params = useParams<{ qrConfigId: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [result, setResult] = useState<PaymentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [passkeyDone, setPasskeyDone] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError("セッションIDがありません");
      setLoading(false);
      return;
    }

    fetch("/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setResult(data);
        }
      })
      .catch(() => setError("通信エラーが発生しました"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={32} className="text-pink-500 animate-spin mx-auto" />
          <p className="text-slate-500 text-sm font-bold">決済を確認中...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-red-400 text-sm">{error || "エラーが発生しました"}</p>
          <Link
            href={`/c/${params.qrConfigId}`}
            className="inline-flex items-center gap-2 text-pink-500 text-sm font-bold"
          >
            <ArrowLeft size={16} />
            戻る
          </Link>
        </div>
      </div>
    );
  }

  const email = result.email ?? emailFromCookie();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-20">
      <div className="px-6 py-10 max-w-md mx-auto space-y-8">

        {/* 完了ヘッダー */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">
            Payment Complete
          </p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            応援ありがとう！
          </h1>
          <p className="text-sm text-slate-400">
            {result.artist_name ?? "アーティスト"} へのCheersが届きました
          </p>
        </div>

        {/* Cheers カード */}
        <CheersCard
          artistName={result.artist_name ?? "Artist"}
          eventTitle={result.event_title ?? ""}
          artistAvatar={result.artist_avatar}
          amount={result.amount}
          transactionId={result.transaction_id}
        />

        {/* ウォレット登録セクション */}
        {email && !passkeyDone && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-slate-600" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                  Wallet
                </p>
              </div>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div>
                <p className="text-sm font-black text-white">
                  ウォレットに保存する
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  パスキー（顔認証・指紋認証）でアカウントを作成し、
                  応援履歴をウォレットに保存できます。
                </p>
              </div>
              <PasskeySetup
                email={email}
                mode="register"
                onSuccess={() => setPasskeyDone(true)}
              />
            </div>
          </div>
        )}

        {passkeyDone && (
          <p className="text-center text-xs text-slate-500">
            ウォレットでいつでも応援履歴を確認できます
          </p>
        )}

        {/* 戻るリンク */}
        <div className="text-center">
          <Link
            href={`/c/${params.qrConfigId}`}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-400 text-xs font-bold transition-colors"
          >
            <ArrowLeft size={14} />
            もう一度応援する
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ThanksPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 size={32} className="text-pink-500 animate-spin" />
        </div>
      }
    >
      <ThanksContent />
    </Suspense>
  );
}
