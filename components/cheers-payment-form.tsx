"use client";

import { useState, useTransition, useEffect } from "react";
import { Heart, Loader2, Mail, CreditCard, CheckCircle, AlertCircle } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
const CUSTOMER_EMAIL_COOKIE = "dc_ce";

type Product = {
  product_id: string;
  name: string;
  type: string;
  payment_type?: string | null;
  min_amount: number;
  max_amount: number;
  amount_step?: number;
};

function saveEmailCookie(email: string) {
  document.cookie = `${CUSTOMER_EMAIL_COOKIE}=${encodeURIComponent(email)};max-age=${60 * 60 * 24 * 30};path=/;SameSite=Lax`;
}

// タイプA: SetupIntent（または5日以内はPaymentIntentオーソリ）でカード入力
function EntranceTypeACardForm({
  clientSecret,
  reservationId,
  isAuth,
  onSuccess,
}: {
  clientSecret: string;
  reservationId: string;
  isAuth: boolean;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    if (isAuth) {
      // 5日以内: PaymentIntent オーソリ
      const { paymentIntent, error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (stripeError) {
        setError(stripeError.message ?? "カード情報の確認に失敗しました");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/entrance/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: reservationId, payment_intent_id: paymentIntent?.id }),
      });
      const data = await res.json();
      setLoading(false);
      if (data.ok) { onSuccess(); } else { setError(data.error ?? "エラーが発生しました"); }
      return;
    }

    // 通常パス: SetupIntent
    const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });
    if (stripeError) {
      setError(stripeError.message ?? "カード情報の確認に失敗しました");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, payment_method_id: setupIntent?.payment_method as string }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) { onSuccess(); } else { setError(data.error ?? "エラーが発生しました"); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <CardElement
          options={{
            style: {
              base: { fontSize: "14px", color: "#e2e8f0", fontFamily: "ui-monospace, monospace", "::placeholder": { color: "#475569" } },
              invalid: { color: "#f87171" },
            },
          }}
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : "カードを保存して予約"}
      </button>
    </form>
  );
}

export function CheersPaymentForm({
  qrConfigId,
  products,
  recipientName,
  eventTitle,
  paypayEnabled = false,
  deviceName,
}: {
  qrConfigId: string;
  products: Product[];
  recipientName: string;
  eventTitle: string;
  paypayEnabled?: boolean;
  deviceName?: string;
}) {
  const selectedProduct = products[0];
  const isTypeA = selectedProduct?.type === "entrance" && selectedProduct?.payment_type === "A";

  const [amount, setAmount] = useState(products[0]?.min_amount ?? 500);
  const [email, setEmail] = useState("");
  const [pendingMethod, setPendingMethod] = useState<"card" | "paypay" | null>(null);
  const [isPending, startTransition] = useTransition();

  // タイプA用
  const [setupData, setSetupData] = useState<{
    clientSecret: string;
    reservationId: string;
    isAuth: boolean;
  } | null>(null);
  const [entranceDone, setEntranceDone] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(new RegExp(`${CUSTOMER_EMAIL_COOKIE}=([^;]+)`));
    if (match) setEmail(decodeURIComponent(match[1]));
  }, []);

  // タイプA: SetupIntentフロー
  const proceedEntranceTypeA = (confirmedEmail: string) => {
    startTransition(async () => {
      const res = await fetch("/api/entrance/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProduct.product_id,
          customer_email: confirmedEmail,
          qr_config_id: qrConfigId,
        }),
      });
      const data = await res.json();
      if (data.error) return; // TODO: エラー表示
      setSetupData({
        clientSecret: data.client_secret,
        reservationId: data.reservation_id,
        isAuth: !!data.is_auth,
      });
    });
  };

  // 通常Checkoutフロー（B・C・チアーズ）
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
          metadata: { artist_name: recipientName, event_title: eventTitle, device_name: deviceName ?? "" },
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    });
  };

  const handleCheckout = (paymentMethod: "card" | "paypay") => {
    if (!email) { setPendingMethod(paymentMethod); return; }
    if (isTypeA) { proceedEntranceTypeA(email); return; }
    proceedToCheckout(paymentMethod, email);
  };

  const handleEmailConfirm = () => {
    if (!email || !pendingMethod) return;
    saveEmailCookie(email);
    const method = pendingMethod;
    setPendingMethod(null);
    if (isTypeA) { proceedEntranceTypeA(email); return; }
    proceedToCheckout(method, email);
  };

  // タイプA 完了
  if (entranceDone) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center space-y-3">
        <CheckCircle size={32} className="text-green-400 mx-auto" />
        <p className="text-lg font-black text-white">予約完了！</p>
        <p className="text-xs text-slate-400">カードを保存しました。イベント5日前に自動決済・チケット発行されます</p>
        <a
          href="/tickets"
          className="inline-block mt-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 underline"
        >
          チケットを確認する →
        </a>
      </div>
    );
  }

  // タイプA: カード入力ステップ
  if (isTypeA && setupData) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard size={14} className="text-pink-500" />
            <p className="text-sm font-black text-white">カード情報を入力</p>
          </div>
          <p className="text-xs text-slate-500">イベント5日前に自動決済されます</p>
          <Elements stripe={stripePromise} options={{ clientSecret: setupData.clientSecret }}>
            <EntranceTypeACardForm
              clientSecret={setupData.clientSecret}
              reservationId={setupData.reservationId}
              isAuth={setupData.isAuth}
              onSuccess={() => setEntranceDone(true)}
            />
          </Elements>
        </div>
      </div>
    );
  }

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
            autoComplete="email"
            inputMode="email"
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
            ) : selectedProduct?.type === "entrance" ? (
              <>¥{amount.toLocaleString()} を購入する</>
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

      {/* 金額 */}
      <div className="space-y-3">
        <div className="flex justify-between items-baseline">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">金額</p>
          <p className="text-3xl font-black text-white italic tracking-tighter">
            ¥{amount.toLocaleString()}
          </p>
        </div>
        {selectedProduct.min_amount !== selectedProduct.max_amount && (
          <>
            <input
              type="range"
              min={selectedProduct.min_amount}
              max={selectedProduct.max_amount}
              step={selectedProduct.amount_step ?? 100}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full accent-pink-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600 font-bold">
              <span>¥{selectedProduct.min_amount.toLocaleString()}</span>
              <span>¥{selectedProduct.max_amount.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

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
          ) : selectedProduct?.type === "entrance" ? (
            <>¥{amount.toLocaleString()} を購入する</>
          ) : (
            <>
              <Heart size={20} className="fill-current" />
              ¥{amount.toLocaleString()} を応援する
            </>
          )}
        </button>
        <p className="text-center text-[10px] text-slate-600">Apple Pay / Google Pay / クレジットカード 対応</p>

        {paypayEnabled && !isTypeA && (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleCheckout("paypay")}
              className="w-full h-14 bg-[#E52E2E] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isPending ? <Loader2 size={18} className="animate-spin" /> : "PayPay で支払う"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
