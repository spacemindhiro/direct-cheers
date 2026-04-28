"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { CheersCard } from "@/components/cheers-card";
import type { PasskeySetup as PasskeySetupType } from "@/components/passkey-setup";
import { FollowButton } from "@/components/follow-button";
import { Loader2, ArrowLeft, PlusCircle, MessageSquare, Send, LayoutDashboard } from "lucide-react";
import Link from "next/link";

const DEVICE_TOKEN_KEY = "dc_dt";
const CUSTOMER_EMAIL_COOKIE = "dc_ce";

type PaymentResult = {
  transaction_id: string;
  email: string | null;
  amount: number;
  artist_name: string | null;
  artist_id: string | null;
  event_id: string | null;
  event_title: string | null;
  artist_avatar: string | null;
  product_name: string | null;
  product_type: string | null;
  stripe_customer_id: string | null;
  serial_number: number | null;
  qr_image_url: string | null;
  recipient_name: string | null;
  recipient_avatar: string | null;
  is_member: boolean;
};

type ThanksData = {
  thanks_message: string | null;
  thanks_link_url: string | null;
  thanks_media_url: string | null;
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
  const [hasExistingPasskey, setHasExistingPasskey] = useState(false);
  const [thanks, setThanks] = useState<ThanksData | null>(null);
  const [msgNickname, setMsgNickname] = useState("");
  const [msgComment, setMsgComment] = useState("");
  const [msgSent, setMsgSent] = useState(false);
  const [msgSending, setMsgSending] = useState(false);
  const [PasskeySetup, setPasskeySetup] = useState<typeof PasskeySetupType | null>(null);

  useEffect(() => {
    import("@/components/passkey-setup")
      .then(m => setPasskeySetup(() => m.PasskeySetup))
      .catch(() => {});
  }, []);

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

        // 会員かつパスキー登録済みの場合のみパスキーログインを表示
        if (data.is_member && data.has_passkey) {
          setHasExistingPasskey(true);
        }

        // サンクス特典を取得（QR単位）
        if (data.transaction_id) {
          try {
            const thanksRes = await fetch(
              `/api/qr/${params.qrConfigId}/thanks?transaction_id=${data.transaction_id}`
            );
            if (thanksRes.ok) {
              const thanksData = await thanksRes.json();
              if (thanksData.unlocked && thanksData.thanks) {
                setThanks(thanksData.thanks);
              }
            }
          } catch {
            // サンクス取得失敗は無視
          }
        }

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
            {result.recipient_name ?? result.artist_name ?? "アーティスト"} へのCheersが届きました
          </p>
          {email && (
            <p className="text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 inline-block">
              {email}
            </p>
          )}
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

        {/* Apple Wallet ボタン（iOS/macOS のみ） */}
        {isAppleDevice() && (
          <a
            href={`/api/wallet/pass/${result.transaction_id}`}
            className="flex items-center gap-3 w-full h-14 bg-black border border-white/20 rounded-2xl px-5 hover:border-white/40 transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white shrink-0">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <div className="flex-1">
              <p className="text-[10px] text-white/50 leading-none">このCheersカードを</p>
              <p className="text-base font-bold text-white leading-tight">Apple Walletに保存</p>
            </div>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white/40 shrink-0">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
            </svg>
          </a>
        )}

        {/* Cheers カード */}
        <CheersCard
          artistName={result.recipient_name ?? result.artist_name ?? "Artist"}
          eventTitle={result.event_title ?? ""}
          artistAvatar={result.recipient_avatar ?? result.artist_avatar}
          amount={result.amount}
          transactionId={result.transaction_id}
          serialNumber={result.serial_number}
          thanks={thanks}
          imageUrl={result.qr_image_url}
        />

        {/* メッセージ送信（message タイプのみ） */}
        {result.product_type === "message" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-slate-600" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Message</p>
              </div>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            {msgSent ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center space-y-1">
                <p className="text-sm font-black text-pink-400">メッセージを送りました！</p>
                <p className="text-xs text-slate-500">{result.artist_name ?? "アーティスト"} に届きます</p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div>
                  <p className="text-sm font-black text-white">メッセージを送る</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {result.artist_name ?? "アーティスト"} へ一言添えることができます（任意）
                  </p>
                </div>
                <input
                  type="text"
                  value={msgNickname}
                  onChange={(e) => setMsgNickname(e.target.value)}
                  placeholder="ニックネーム（任意）"
                  className="w-full h-11 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
                />
                <textarea
                  value={msgComment}
                  onChange={(e) => setMsgComment(e.target.value)}
                  placeholder={`${result.artist_name ?? "アーティスト"} へのメッセージ（任意）`}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none resize-none"
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={msgSending}
                    onClick={async () => {
                      setMsgSending(true);
                      await fetch("/api/pay/message", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          transaction_id: result.transaction_id,
                          nickname: msgNickname || undefined,
                          comment: msgComment || undefined,
                        }),
                      });
                      setMsgSending(false);
                      setMsgSent(true);
                    }}
                    className="flex-1 h-11 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-60"
                  >
                    {msgSending ? <Loader2 size={16} className="animate-spin" /> : <><Send size={14} /> 送る</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMsgSent(true)}
                    className="px-4 h-11 text-xs text-slate-600 hover:text-slate-400 transition-colors font-bold"
                  >
                    スキップ
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* アカウントセクション：新規→作成、既存→ログイン、完了後→コレクション */}
        {email && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <div className="flex items-center gap-2">
                <PlusCircle size={14} className="text-slate-600" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Account</p>
              </div>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              {passkeyDone ? (
                <>
                  <p className="text-sm font-black text-white">コレクションを確認する</p>
                  <Link
                    href="/dashboard/collection"
                    className="flex items-center justify-center gap-2 w-full h-11 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-black text-sm transition-all"
                  >
                    <LayoutDashboard size={15} />
                    コレクションを見る
                  </Link>
                </>
              ) : hasExistingPasskey ? (
                <>
                  <div>
                    <p className="text-sm font-black text-white">ログインしてコレクションを確認</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {email} でアカウントが登録されています。パスキーでログインして応援履歴を確認できます。
                    </p>
                  </div>
                  {PasskeySetup && <PasskeySetup
                    email={email}
                    mode="authenticate"
                    onSuccess={() => setPasskeyDone(true)}
                    buttonLabel="パスキーでログイン"
                  />}
                  <Link
                    href={`/auth/login?email=${encodeURIComponent(email)}&redirect=/dashboard/collection`}
                    className="block text-center text-xs text-slate-600 hover:text-slate-400 font-bold transition-colors"
                  >
                    パスワードでログイン
                  </Link>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-black text-white">応援履歴をアカウントに保存</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      顔認証・指紋認証でアカウントを作成し、応援コレクションをいつでも確認できます。
                    </p>
                  </div>
                  {PasskeySetup && <PasskeySetup
                    email={email}
                    mode="register"
                    deviceName={getDeviceLabel()}
                    onSuccess={() => setPasskeyDone(true)}
                    buttonLabel="パスキーでアカウント作成"
                  />}
                </>
              )}
            </div>
          </div>
        )}

        {/* アーティストフォロー */}
        {result.artist_id && result.artist_name && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Follow</p>
              <div className="h-px flex-1 bg-slate-800" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-white">{result.artist_name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">次のライブ情報をお届けします</p>
              </div>
              <FollowButton
                followeeId={result.artist_id}
                followeeName={result.artist_name}
                followeeRole="artist"
                size="sm"
              />
            </div>
          </div>
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

function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
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
