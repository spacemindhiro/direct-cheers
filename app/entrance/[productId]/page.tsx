"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2, Calendar, MapPin, Ticket, CreditCard, AlertCircle, CheckCircle, Clock
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Product = {
  product_id: string;
  name: string;
  payment_type: "A" | "B" | "C";
  min_amount: number;
  stock_limit: number | null;
  sold_count: number;
  event: {
    event_id: string;
    title: string;
    venue: string | null;
    start_at: string;
  };
};

const PAYMENT_TYPE_INFO = {
  A: {
    label: "5日前確定プラン",
    description: "今日カードを保存し、イベント5日前に自動決済されます",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
  },
  B: {
    label: "即時確定プラン",
    description: "今すぐ決済され、チケットが発行されます",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
  },
  C: {
    label: "当日決済プラン",
    description: "今日カードを保存し、当日チェックイン時に決済されます",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
};

function CheckoutFormAC({
  product,
  clientSecret,
  reservationId,
  isAuth,
  onComplete,
}: {
  product: Product;
  clientSecret: string;
  reservationId: string;
  isAuth: boolean;
  onComplete: (ticketCode: string) => void;
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
        body: JSON.stringify({
          reservation_id: reservationId,
          payment_intent_id: paymentIntent?.id,
        }),
      });

      const data = await res.json();
      setLoading(false);

      if (data.ok) {
        onComplete(data.ticket_code ?? "");
      } else {
        setError(data.error ?? "エラーが発生しました");
      }
      return;
    }

    // 通常パス: SetupIntent（5日以上先）
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
      body: JSON.stringify({
        reservation_id: reservationId,
        payment_method_id: setupIntent?.payment_method as string,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.ok) {
      onComplete(data.ticket_code ?? "");
    } else {
      setError(data.error ?? "エラーが発生しました");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "14px",
                color: "#e2e8f0",
                fontFamily: "ui-monospace, monospace",
                "::placeholder": { color: "#475569" },
              },
              invalid: { color: "#f87171" },
            },
          }}
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(99,102,241,0.25)] hover:brightness-110 transition-all disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin mx-auto" />
        ) : product.payment_type === "A" ? (
          "カードを保存して予約"
        ) : (
          "カードを保存"
        )}
      </button>
    </form>
  );
}

function EntrancePageContent() {
  const params = useParams<{ productId: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [holderName, setHolderName] = useState("");
  const [step, setStep] = useState<"form" | "card" | "done">("form");
  const [setupData, setSetupData] = useState<{
    clientSecret: string;
    reservationId: string;
    type: "A" | "B" | "C";
    isAuth: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ticketCode, setTicketCode] = useState("");

  useEffect(() => {
    fetch(`/api/entrance/product/${params.productId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.product) setProduct(data.product);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.productId]);

  const soldOut =
    product?.stock_limit != null && product.sold_count >= product.stock_limit;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !email) return;

    setSubmitting(true);
    setError("");

    const res = await fetch("/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: product.product_id,
        customer_email: email,
        holder_name: holderName || undefined,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (data.error === "SOLD_OUT") {
      setError("申し訳ありません。このチケットは完売しました。");
      return;
    }
    if (data.error) {
      setError(data.error);
      return;
    }

    // タイプB: Stripe Checkout にリダイレクト
    if (data.type === "B" && data.url) {
      window.location.href = data.url;
      return;
    }

    // タイプA/C: カード入力ステップへ
    setSetupData({
      clientSecret: data.client_secret,
      reservationId: data.reservation_id,
      type: data.type,
      isAuth: !!data.is_auth,
    });
    setStep("card");
  };

  const handleCardComplete = (code: string) => {
    setTicketCode(code);
    setStep("done");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={32} className="text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <p className="text-slate-500 text-sm">チケットが見つかりません</p>
      </div>
    );
  }

  const typeInfo = PAYMENT_TYPE_INFO[product.payment_type];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      <div className="max-w-md mx-auto px-6 py-10 space-y-8">

        {/* ヘッダー */}
        <div className="text-center space-y-1">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">
            Entrance Ticket
          </p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            {product.event.title}
          </h1>
          <p className="text-indigo-300 font-bold">{product.name}</p>
        </div>

        {/* イベント情報 */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-3">
          {product.event.start_at && (
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <Calendar size={14} className="text-indigo-400 shrink-0" />
              {new Date(product.event.start_at).toLocaleString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
          {product.event.venue && (
            <div className="flex items-center gap-2.5 text-sm text-slate-300">
              <MapPin size={14} className="text-indigo-400 shrink-0" />
              {product.event.venue}
            </div>
          )}

          {/* 決済タイプ */}
          <div className={`flex items-start gap-2.5 rounded-xl p-3 border ${typeInfo.bg}`}>
            <Clock size={13} className={`${typeInfo.color} shrink-0 mt-0.5`} />
            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${typeInfo.color}`}>
                {typeInfo.label}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{typeInfo.description}</p>
            </div>
          </div>

          {/* 価格・在庫 */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Price</p>
              <p className="text-2xl font-black text-white italic">¥{product.min_amount.toLocaleString()}</p>
            </div>
            {product.stock_limit != null && (
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">残席</p>
                <p className={`text-lg font-black ${soldOut ? "text-red-400" : "text-white"}`}>
                  {soldOut ? "SOLD OUT" : `${product.stock_limit - product.sold_count}`}
                </p>
              </div>
            )}
          </div>
        </div>

        {soldOut ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-center">
            <p className="text-red-400 font-black text-lg">完売しました</p>
            <p className="text-slate-500 text-sm mt-1">このチケットは販売終了です</p>
          </div>
        ) : step === "form" ? (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                メールアドレス <span className="text-pink-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                お名前（任意）
              </label>
              <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <AlertCircle size={12} />
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !email}
              className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(99,102,241,0.25)] hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Ticket size={16} />
                  {product.payment_type === "B" ? "今すぐ購入する" : "次へ（カード入力）"}
                </>
              )}
            </button>
          </form>
        ) : step === "card" && setupData ? (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-indigo-400" />
                <p className="text-sm font-black text-white">カード情報を入力</p>
              </div>
              <p className="text-xs text-slate-500">
                {product.payment_type === "C"
                  ? "当日チェックイン時に自動決済されます"
                  : "イベント5日前に自動決済されます"}
              </p>
              <Elements stripe={stripePromise} options={{ clientSecret: setupData.clientSecret }}>
                <CheckoutFormAC
                  product={product}
                  clientSecret={setupData.clientSecret}
                  reservationId={setupData.reservationId}
                  isAuth={setupData.isAuth}
                  onComplete={handleCardComplete}
                />
              </Elements>
            </div>
          </div>
        ) : step === "done" ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-[2rem] p-6 text-center space-y-3">
              <CheckCircle size={32} className="text-green-400 mx-auto" />
              <p className="text-xl font-black text-white">
                {product.payment_type === "C" ? "予約完了！" : product.payment_type === "A" ? "予約完了！" : "購入完了！"}
              </p>
              <p className="text-sm text-slate-400">
                {product.payment_type === "A" && setupData?.isAuth
                  ? "カードのオーソリ完了。チケットが発行されました。請求はイベント開催確認後に行われます"
                  : product.payment_type === "A"
                  ? "カードを保存しました。イベント5日前に自動決済・チケット発行されます"
                  : product.payment_type === "C"
                  ? "当日入場時にチェックインしてください"
                  : "チケットがウォレットに保存されました"}
              </p>
            </div>
            {ticketCode && (
              <button
                type="button"
                onClick={() => router.push("/tickets")}
                className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
              >
                チケットを確認する
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function EntrancePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={32} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <EntrancePageContent />
    </Suspense>
  );
}
