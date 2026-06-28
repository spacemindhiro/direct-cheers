"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function Form({ userEmail }: { userEmail: string | null }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      // 3DS認証が必要な場合のみリダイレクトする（不要な場合はその場で完了させる）。
      // デフォルト（redirect未指定="always"）だと3DS不要でも常にリダイレクトに
      // 依存してしまい、リダイレクト自体が何らかの理由で失敗すると
      // ローディング画面のまま戻ってこなくなる障害が発生していた。
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/link-setup/complete`,
        ...(userEmail ? {
          payment_method_data: {
            billing_details: { email: userEmail },
          },
        } : {}),
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "エラーが発生しました");
      setLoading(false);
      return;
    }

    if (setupIntent?.status === "succeeded") {
      // 3DS不要だったケース。リダイレクトされないためここで完了表示に切り替える
      setIsComplete(true);
      setLoading(false);
    }
    // 3DS認証が必要な場合はここで return_url にリダイレクトされ、このコンポーネントは離脱する
  };

  if (isComplete) {
    return <LinkSetupComplete />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Card</p>
        <PaymentElement options={{
        layout: "tabs",
        defaultValues: userEmail ? { billingDetails: { email: userEmail } } : undefined,
      }} />
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
        {loading ? <Loader2 size={16} className="animate-spin" /> : "カードを登録する"}
      </button>

      <p className="text-center text-[10px] text-slate-600">
        カード情報はStripeが安全に保管します。Direct Cheersには送信されません。
      </p>
    </form>
  );
}

export function LinkSetupForm({ userEmail }: { userEmail: string | null }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    fetch("/api/stripe/link-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userEmail ? { email: userEmail } : {}),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.client_secret) setClientSecret(d.client_secret);
        else setFetchError(true);
      })
      .catch(() => setFetchError(true));
  }, [userEmail]);

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
      <Form userEmail={userEmail} />
    </Elements>
  );
}

export function LinkSetupComplete() {
  // 3DS認証後にStripeからリダイレクトされてきた場合、redirect_statusで
  // 実際の成否を確認する（3DS不要でその場完了したケースではクエリ自体が無い＝成功扱い）。
  // これを見ずに常に成功表示していたため、3DS認証が失敗・キャンセルされても
  // 「登録完了」と表示してしまう不具合があった。
  const searchParams = useSearchParams();
  const redirectStatus = searchParams.get("redirect_status");
  const failed = redirectStatus === "failed" || redirectStatus === "canceled";

  if (failed) {
    return (
      <div className="text-center space-y-4 py-10">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 mx-auto">
          <AlertCircle size={32} className="text-red-400" />
        </div>
        <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">登録できませんでした</h2>
        <p className="text-sm text-slate-400">
          カード認証が完了しませんでした。<br />
          もう一度お試しください。
        </p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4 py-10">
      <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 mx-auto">
        <CheckCircle2 size={32} className="text-emerald-400" />
      </div>
      <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">登録完了</h2>
      <p className="text-sm text-slate-400">
        カードを登録しました。<br />
        次回からはスムーズにお支払いいただけます。
      </p>
    </div>
  );
}
