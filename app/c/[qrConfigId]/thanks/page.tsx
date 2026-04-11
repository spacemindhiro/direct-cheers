"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { CheersCard } from "@/components/cheers-card";
import { PasskeySetup } from "@/components/passkey-setup";
import { Loader2, ArrowLeft, Wallet, PlusCircle } from "lucide-react";
import Link from "next/link";

const DEVICE_TOKEN_KEY = "dc_dt";
const CUSTOMER_EMAIL_COOKIE = "dc_ce";

type PaymentResult = {
  transaction_id: string;
  email: string | null;
  amount: number;
  artist_name: string | null;
  event_title: string | null;
  artist_avatar: string | null;
  product_name: string | null;
  stripe_customer_id: string | null;
  serial_number: number | null;
};

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
  // 既存アカウントの場合は「追加登録」モード
  const [hasExistingPasskey, setHasExistingPasskey] = useState(false);

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
      .then(async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setResult(data);

        const email = data.email ?? emailFromCookie();
        if (!email) return;

        // LocalStorage デバイストークンを発行・保存
        try {
          const tokenRes = await fetch("/api/account/device-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (tokenRes.ok) {
            const { token } = await tokenRes.json();
            if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token);
          }
        } catch {
          // トークン発行失敗は無視
        }

        // 既存パスキーの有無を確認（既存アカウントの場合は「このデバイスを追加」モード）
        try {
          const optRes = await fetch("/api/passkeys/register-options", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (optRes.ok) {
            const optData = await optRes.json();
            // excludeCredentials が1件以上 = 既存アカウント
            if (optData.options?.excludeCredentials?.length > 0) {
              setHasExistingPasskey(true);
            }
          }
        } catch {
          // パスキー確認失敗は無視
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

        {/* シリアルナンバー演出 */}
        {result.serial_number != null && (
          <div className="text-center space-y-1 py-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
              You are
            </p>
            <p className="text-5xl font-black text-pink-400 italic tracking-tighter tabular-nums leading-none">
              {"#" + String(result.serial_number).padStart(3, "0")}
            </p>
            <p className="text-sm font-bold text-slate-300">
              番目のサポーター
            </p>
            {result.serial_number <= 10 && (
              <p className="text-xs text-pink-500 font-black mt-1">
                🎉 Early Supporter！最初の10人に入りました
              </p>
            )}
          </div>
        )}

        {/* Cheers カード */}
        <CheersCard
          artistName={result.artist_name ?? "Artist"}
          eventTitle={result.event_title ?? ""}
          artistAvatar={result.artist_avatar}
          amount={result.amount}
          transactionId={result.transaction_id}
          serialNumber={result.serial_number}
        />

        {/* ウォレット登録セクション */}
        {email && !passkeyDone && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <div className="flex items-center gap-2">
                {hasExistingPasskey
                  ? <PlusCircle size={14} className="text-slate-600" />
                  : <Wallet size={14} className="text-slate-600" />
                }
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                  {hasExistingPasskey ? "このデバイスを追加" : "Wallet"}
                </p>
              </div>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              {hasExistingPasskey ? (
                <>
                  <div>
                    <p className="text-sm font-black text-white">
                      このデバイスでも顔パスを有効にする
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      既にパスキーが登録されています。
                      このデバイスにも追加登録すると、いつでもここからアクセスできます。
                    </p>
                  </div>
                  <PasskeySetup
                    email={email}
                    mode="register"
                    deviceName={getDeviceLabel()}
                    onSuccess={() => setPasskeyDone(true)}
                    buttonLabel="このデバイスを追加登録"
                  />
                </>
              ) : (
                <>
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
                    deviceName={getDeviceLabel()}
                    onSuccess={() => setPasskeyDone(true)}
                  />
                </>
              )}
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

// ブラウザ UA からデバイスラベルを推定
function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua) && /Mobile/.test(ua)) return "Android";
  if (/Android/.test(ua)) return "Androidタブレット";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "";
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
