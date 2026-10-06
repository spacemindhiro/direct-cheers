"use client";

import { DISPLAY_TZ } from "@/lib/display-tz";
import { useState } from "react";
import {
  Loader2, CheckCircle, AlertCircle, CreditCard, Calendar, MapPin, MailCheck,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export type UpdateCardView =
  | { kind: "invalid" }
  | { kind: "cancelled" }
  | { kind: "not_needed" }
  | {
      kind: "ready";
      eventTitle: string;
      venue: string | null;
      startAt: string | null;
      productName: string;
      amount: number;
    };

function CardForm({
  reservationId,
  clientSecret,
  isAuth,
  onSuccess,
}: {
  reservationId: string;
  clientSecret: string;
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

    let body: Record<string, string | undefined>;
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
      body = { reservation_id: reservationId, payment_intent_id: paymentIntent?.id };
    } else {
      // 5日より前: SetupIntent でカード登録のみ（オーソリは cron）
      const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (stripeError) {
        setError(stripeError.message ?? "カード情報の確認に失敗しました");
        setLoading(false);
        return;
      }
      body = { reservation_id: reservationId, payment_method_id: setupIntent?.payment_method as string };
    }

    const res = await fetch("/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) { onSuccess(); } else { setError(data.error ?? "更新に失敗しました"); }
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
        <p className="text-red-400 text-xs flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full h-11 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <><CreditCard size={14} /> カードを登録する</>}
      </button>
    </form>
  );
}

function ResendLink({ reservationId }: { reservationId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const handleResend = async () => {
    setState("sending");
    await fetch(`/api/entrance/reservations/${reservationId}/card-update-link`, { method: "POST" }).catch(() => {});
    setState("sent");
  };

  if (state === "sent") {
    return (
      <div className="flex items-start gap-2 text-green-400 text-xs font-bold leading-relaxed">
        <MailCheck size={14} className="shrink-0 mt-0.5" />
        <span>カードの再登録が必要なご予約であれば、ご予約時のメールアドレスに新しいリンクをお送りしました。メールをご確認ください。</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={state === "sending"}
      className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {state === "sending" ? <Loader2 size={14} className="animate-spin" /> : "新しいリンクをメールで受け取る"}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      <div className="max-w-md mx-auto px-6 py-10 space-y-8">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Card Update</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">カードの再登録</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function UpdateCardClient({
  reservationId,
  token,
  view,
}: {
  reservationId: string;
  token: string;
  view: UpdateCardView;
}) {
  const [intent, setIntent] = useState<{ clientSecret: string; isAuth: boolean } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [done, setDone] = useState(false);

  if (view.kind === "invalid") {
    return (
      <Shell>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            このリンクは無効です。カードの登録がすでに完了しているか、新しいリンクが発行されています。
          </p>
          <ResendLink reservationId={reservationId} />
        </div>
      </Shell>
    );
  }

  if (view.kind === "cancelled") {
    return (
      <Shell>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6">
          <p className="text-sm text-slate-300 leading-relaxed">このチケットは無効になっています。お手数ですが、新しくご購入ください。</p>
        </div>
      </Shell>
    );
  }

  if (view.kind === "not_needed") {
    return (
      <Shell>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6">
          <p className="text-sm text-slate-300 leading-relaxed">このご予約はカードの再登録が不要です。</p>
        </div>
      </Shell>
    );
  }

  const handleStart = async () => {
    setStarting(true);
    setStartError("");
    try {
      const res = await fetch("/api/entrance/update-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: reservationId, token }),
      });
      const data = await res.json();
      if (data.client_secret) {
        setIntent({ clientSecret: data.client_secret, isAuth: !!data.is_auth });
      } else {
        setStartError(data.error === "account_incomplete"
          ? "主催者側の準備が整っていないため、現在カードを登録できません。時間をおいてお試しください。"
          : data.error ?? "カード登録を開始できませんでした");
      }
    } catch {
      setStartError("通信に失敗しました。時間をおいてお試しください。");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Shell>
      <div className="bg-slate-900 border border-red-500/30 rounded-[2rem] p-5 space-y-4">
        <div>
          <p className="font-black text-white text-base">{view.eventTitle}</p>
          <p className="text-indigo-300 text-sm font-bold">{view.productName}</p>
        </div>
        <div className="space-y-1.5">
          {view.startAt && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar size={11} className="text-indigo-400" />
              {new Date(view.startAt).toLocaleString("ja-JP", {
                timeZone: DISPLAY_TZ,
                month: "long",
                day: "numeric",
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
          {view.venue && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <MapPin size={11} className="text-indigo-400" />
              {view.venue}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">お支払い金額</p>
          <p className="text-white font-black text-sm">¥{view.amount.toLocaleString()}</p>
        </div>

        {done ? (
          <div className="flex items-center gap-2 text-green-400 text-sm font-bold">
            <CheckCircle size={14} /> カードを登録しました。チケットは有効に戻りました。
          </div>
        ) : intent ? (
          <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret }}>
            <CardForm
              reservationId={reservationId}
              clientSecret={intent.clientSecret}
              isAuth={intent.isAuth}
              onSuccess={() => setDone(true)}
            />
          </Elements>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              ご登録のカードに問題があったため、チケットが一時的に無効になっています。新しいカードを登録すると有効に戻ります。
            </p>
            {startError && (
              <p className="text-red-400 text-xs flex items-center gap-1.5">
                <AlertCircle size={12} /> {startError}
              </p>
            )}
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="w-full h-11 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <><CreditCard size={14} /> 新しいカードを登録する</>}
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
