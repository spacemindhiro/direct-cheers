"use client";

import { useState, useTransition, useEffect } from "react";
import { Heart, Loader2, Mail } from "lucide-react";

const CUSTOMER_EMAIL_COOKIE = "dc_ce";

type Product = {
  product_id: string;
  name: string;
  type: string;
  min_amount: number;
  max_amount: number;
};

function saveEmailCookie(email: string) {
  document.cookie = `${CUSTOMER_EMAIL_COOKIE}=${encodeURIComponent(email)};max-age=${60 * 60 * 24 * 30};path=/;SameSite=Lax`;
}

export function CheersPaymentForm({
  qrConfigId,
  products,
  recipientName,
  eventTitle,
}: {
  qrConfigId: string;
  products: Product[];
  recipientName: string;
  eventTitle: string;
}) {
  const selectedProduct = products[0];
  const [amount, setAmount] = useState(products[0]?.min_amount ?? 500);
  const [nickname, setNickname] = useState("");
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  // メール入力が必要な場合に、どの決済方法で進むか保持
  const [pendingMethod, setPendingMethod] = useState<"card" | "paypay" | null>(null);
  const [isPending, startTransition] = useTransition();

  // Cookie から返却ユーザーのメールを復元
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`${CUSTOMER_EMAIL_COOKIE}=([^;]+)`));
    if (match) setEmail(decodeURIComponent(match[1]));
  }, []);

  const proceedToCheckout = (paymentMethod: "card" | "paypay", confirmedEmail: string) => {
    startTransition(async () => {
      const res = await fetch("/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: selectedProduct.product_id,
          amount,
          payment_method: paymentMethod,
          customer_email: confirmedEmail,
          metadata: { nickname, comment, artist_name: recipientName, event_title: eventTitle },
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    });
  };

  const handleCheckout = (paymentMethod: "card" | "paypay") => {
    if (!email) {
      // メール未取得 → 入力画面を表示
      setPendingMethod(paymentMethod);
      return;
    }
    proceedToCheckout(paymentMethod, email);
  };

  const handleEmailConfirm = () => {
    if (!email || !pendingMethod) return;
    saveEmailCookie(email);
    const method = pendingMethod;
    setPendingMethod(null);
    proceedToCheckout(method, email);
  };

  // メール入力画面
  if (pendingMethod !== null) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
              <Mail size={16} className="text-pink-500" />
            </div>
            <div>
              <p className="text-sm font-black text-white">メールアドレスを入力</p>
              <p className="text-[10px] text-slate-500 mt-0.5">領収書・特典の送付に使用します</p>
            </div>
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEmailConfirm()}
            placeholder="your@email.com"
            autoFocus
            className="w-full h-12 bg-slate-950 border border-slate-600 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
          />

          <button
            type="button"
            onClick={handleEmailConfirm}
            disabled={!email || isPending}
            className={`w-full h-12 text-white rounded-xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all ${
              pendingMethod === "paypay"
                ? "bg-[#E52E2E] hover:brightness-110"
                : "bg-gradient-to-r from-pink-600 to-pink-500 hover:brightness-110 shadow-[0_0_20px_rgba(236,72,153,0.2)]"
            }`}
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : pendingMethod === "paypay" ? (
              "PayPay で支払う"
            ) : (
              <><Heart size={16} className="fill-current" />¥{amount.toLocaleString()} を応援する</>
            )}
          </button>

          <button
            type="button"
            onClick={() => setPendingMethod(null)}
            className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* 金額スライダー */}
      <div className="space-y-3">
        <div className="flex justify-between items-baseline">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">金額</p>
          <p className="text-3xl font-black text-white italic tracking-tighter">
            ¥{amount.toLocaleString()}
          </p>
        </div>
        <input
          type="range"
          min={selectedProduct.min_amount}
          max={selectedProduct.max_amount}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full accent-pink-500"
        />
        <div className="flex justify-between text-[10px] text-slate-600 font-bold">
          <span>¥{selectedProduct.min_amount.toLocaleString()}</span>
          <span>¥{selectedProduct.max_amount.toLocaleString()}</span>
        </div>
      </div>

      {/* メッセージ（message タイプのみ） */}
      {selectedProduct.type === "message" && (
        <div className="space-y-3">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="ニックネーム（任意）"
            className="w-full h-12 bg-slate-800 border border-slate-700 rounded-2xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={`${recipientName} へのメッセージ（任意）`}
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none resize-none"
          />
        </div>
      )}

      {/* メール表示（取得済みの場合） */}
      {email && (
        <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Mail size={12} className="text-slate-500" />
            <p className="text-xs text-slate-400 font-medium">{email}</p>
          </div>
          <button
            type="button"
            onClick={() => setEmail("")}
            className="text-[10px] text-slate-600 hover:text-pink-500 transition-colors font-bold"
          >
            変更
          </button>
        </div>
      )}

      {/* 決済ボタン */}
      <div className="space-y-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleCheckout("card")}
          className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.15em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>
              <Heart size={20} className="fill-current" />
              ¥{amount.toLocaleString()} を応援する
            </>
          )}
        </button>
        <p className="text-center text-[10px] text-slate-600">Apple Pay / Google Pay / クレジットカード 対応</p>

        <button
          type="button"
          disabled={isPending}
          onClick={() => handleCheckout("paypay")}
          className="w-full h-14 bg-[#E52E2E] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : "PayPay で支払う"}
        </button>
      </div>
    </div>
  );
}
