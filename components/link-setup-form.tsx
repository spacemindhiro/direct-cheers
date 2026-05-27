"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  LinkAuthenticationElement,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function Form() {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");

    const { error: confirmError } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/link-setup/complete`,
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "エラーが発生しました");
      setLoading(false);
    }
    // 成功時は return_url にリダイレクトされるためここには戻らない
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</p>
        <LinkAuthenticationElement />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Card</p>
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : "Stripe Linkに登録する"}
      </button>

      <p className="text-center text-[10px] text-slate-600">
        カード情報はStripeが安全に保管します。Direct Cheersには送信されません。
      </p>
    </form>
  );
}

export function LinkSetupForm() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    fetch("/api/stripe/link-setup", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.client_secret) setClientSecret(d.client_secret);
        else setFetchError(true);
      })
      .catch(() => setFetchError(true));
  }, []);

  if (fetchError) {
    return (
      <div className="flex items-center gap-2 text-red-400 text-sm">
        <AlertCircle size={16} />
        読み込みに失敗しました。ページを再読み込みしてください。
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={24} className="animate-spin text-slate-600" />
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorBackground: "#0f172a",
            colorText: "#e2e8f0",
            colorTextPlaceholder: "#475569",
            colorPrimary: "#ec4899",
            borderRadius: "12px",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          },
        },
      }}
    >
      <Form />
    </Elements>
  );
}

export function LinkSetupComplete() {
  return (
    <div className="text-center space-y-4 py-10">
      <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 mx-auto">
        <CheckCircle2 size={32} className="text-emerald-400" />
      </div>
      <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">登録完了</h2>
      <p className="text-sm text-slate-400">
        Stripe Linkにカードを登録しました。<br />
        次回からはメールアドレスだけでワンタッチ決済できます。
      </p>
    </div>
  );
}
