"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";

function ConnectReturnContent() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "submitted" | "incomplete">("checking");

  useEffect(() => {
    // ?success=1 / ?refresh=1 は step-up 認証経由で消える可能性があるため
    // クエリパラメータに頼らず Stripe の details_submitted を直接確認する
    fetch("/api/stripe/connect/status", { method: "POST" })
      .then((r) => r.json())
      .then((data: { details_submitted?: boolean; stripe_status?: string }) => {
        if (data.details_submitted) {
          setStatus("submitted");
        } else {
          setStatus("incomplete");
        }
        setTimeout(() => router.push("/dashboard/profile"), 4000);
      })
      .catch(() => {
        setStatus("incomplete");
        setTimeout(() => router.push("/dashboard/profile"), 3000);
      });
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6 text-center">
        {status === "checking" && (
          <>
            <Loader2 size={40} className="text-indigo-400 animate-spin mx-auto" />
            <p className="text-white font-black text-lg">審査状況を確認中...</p>
          </>
        )}
        {status === "submitted" && (
          <>
            <CheckCircle size={40} className="text-emerald-400 mx-auto" />
            <p className="text-white font-black text-lg">情報を送信しました</p>
            <p className="text-slate-400 text-sm">
              Stripeへの情報送信が完了しました。オーナーによる口座開設審査をお待ちください。
            </p>
          </>
        )}
        {status === "incomplete" && (
          <>
            <AlertCircle size={40} className="text-amber-400 mx-auto" />
            <p className="text-white font-black text-lg">手続きが完了していません</p>
            <p className="text-slate-400 text-sm">
              プロフィール画面から再度お試しください。
            </p>
          </>
        )}
        <p className="text-slate-600 text-xs">プロフィール画面に戻ります...</p>
      </div>
    </div>
  );
}

export default function ConnectReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={32} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <ConnectReturnContent />
    </Suspense>
  );
}
