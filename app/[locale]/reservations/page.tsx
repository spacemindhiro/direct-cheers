"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2, CheckCircle, XCircle, AlertCircle, Clock, CreditCard, Calendar, MapPin
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Reservation = {
  reservation_id: string;
  status: string;
  email: string;
  charge_amount: number;
  card_error_message: string | null;
  event_title: string;
  product_name: string;
  start_at: string;
  venue: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: "処理中",   color: "text-slate-400", icon: <Clock size={14} /> },
  reserved:   { label: "予約済み", color: "text-green-400", icon: <CheckCircle size={14} /> },
  card_error: { label: "カードエラー", color: "text-red-400", icon: <AlertCircle size={14} /> },
  charged:    { label: "決済済み", color: "text-indigo-400", icon: <CheckCircle size={14} /> },
  cancelled:  { label: "キャンセル済み", color: "text-slate-500", icon: <XCircle size={14} /> },
};

function CardUpdateForm({
  reservationId,
  email,
  clientSecret,
  onSuccess,
}: {
  reservationId: string;
  email: string;
  clientSecret: string;
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
      onSuccess();
    } else {
      setError(data.error ?? "更新に失敗しました");
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
        <p className="text-red-400 text-xs flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full h-11 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <><CreditCard size={14} /> カードを更新する</>}
      </button>
    </form>
  );
}

function ReservationsContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const reservationId = searchParams.get("r") ?? "";

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updateTarget, setUpdateTarget] = useState<{ id: string; clientSecret: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState(email);
  const [searched, setSearched] = useState(!!email);

  const fetchReservations = async (targetEmail: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ email: targetEmail });
      if (reservationId) params.set("r", reservationId);
      const res = await fetch(`/api/entrance/reservations?${params}`);
      const data = await res.json();
      setReservations(data.reservations ?? []);
    } catch {
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (email) fetchReservations(email);
    else setLoading(false);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);
    fetchReservations(emailInput);
  };

  const handleUpdateCard = async (reservation: Reservation) => {
    setUpdatingId(reservation.reservation_id);
    try {
      const res = await fetch("/api/entrance/update-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: reservation.reservation_id, email: reservation.email }),
      });
      const data = await res.json();
      if (data.client_secret) {
        setUpdateTarget({ id: reservation.reservation_id, clientSecret: data.client_secret });
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateSuccess = () => {
    setUpdated(updateTarget?.id ?? null);
    setUpdateTarget(null);
    if (emailInput) fetchReservations(emailInput);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      <div className="max-w-md mx-auto px-6 py-10 space-y-8">

        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">
            My Reservations
          </p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            予約状況確認
          </h1>
          <p className="text-sm text-slate-500">ご登録のメールアドレスで予約を確認</p>
        </div>

        {/* メールアドレス入力 */}
        {!searched || !email ? (
          <form onSubmit={handleSearch} className="space-y-3">
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!emailInput}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
            >
              確認する
            </button>
          </form>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="text-indigo-400 animate-spin" />
          </div>
        ) : searched && reservations.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-slate-600 text-sm">予約が見つかりません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reservations.map((r) => {
              const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
              const isError = r.status === "card_error";
              const isUpdated = updated === r.reservation_id;

              return (
                <div
                  key={r.reservation_id}
                  className={`bg-slate-900 rounded-[2rem] p-5 space-y-4 border ${
                    isError ? "border-red-500/30" : "border-slate-800"
                  }`}
                >
                  {/* イベント情報 */}
                  <div>
                    <p className="font-black text-white text-base">{r.event_title}</p>
                    <p className="text-indigo-300 text-sm font-bold">{r.product_name}</p>
                  </div>
                  <div className="space-y-1.5">
                    {r.start_at && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Calendar size={11} className="text-indigo-400" />
                        {new Date(r.start_at).toLocaleString("ja-JP", {
                          month: "long",
                          day: "numeric",
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                    {r.venue && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <MapPin size={11} className="text-indigo-400" />
                        {r.venue}
                      </div>
                    )}
                  </div>

                  {/* ステータス */}
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 text-xs font-black ${st.color}`}>
                      {st.icon} {st.label}
                    </div>
                    <p className="text-white font-black text-sm">¥{r.charge_amount.toLocaleString()}</p>
                  </div>

                  {/* カードエラー表示 */}
                  {isError && r.card_error_message && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-300">
                      {r.card_error_message}
                    </div>
                  )}

                  {/* 更新済み表示 */}
                  {isUpdated && (
                    <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
                      <CheckCircle size={12} /> カード情報を更新しました
                    </div>
                  )}

                  {/* カード更新ボタン / フォーム */}
                  {isError && !isUpdated && (
                    updateTarget?.id === r.reservation_id ? (
                      <Elements stripe={stripePromise} options={{ clientSecret: updateTarget.clientSecret }}>
                        <CardUpdateForm
                          reservationId={r.reservation_id}
                          email={r.email}
                          clientSecret={updateTarget.clientSecret}
                          onSuccess={handleUpdateSuccess}
                        />
                      </Elements>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpdateCard(r)}
                        disabled={!!updatingId}
                        className="w-full h-10 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {updatingId === r.reservation_id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <><CreditCard size={12} /> カード情報を更新する</>
                        )}
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <ReservationsContent />
    </Suspense>
  );
}
