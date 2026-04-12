"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";

function ConnectReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isSuccess = searchParams.get("success") === "1";
  const isRefresh = searchParams.get("refresh") === "1";
  const [status, setStatus] = useState<"checking" | "approved" | "pending" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isSuccess) {
      // リフレッシュ（途中離脱）: オンボーディングをやり直す
      setStatus("error");
      setMessage("オンボーディングが完了していません。プロフィール画面から再度お試しください。");
      setTimeout(() => router.push("/dashboard/profile"), 3000);
      return;
    }

    // Stripe審査ステータスを確認
    fetch("/api/stripe/connect/status", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.stripe_status === "approved") {
          setStatus("approved");
          setMessage("Stripe審査が完了しました。プラットフォームオーナーによる口座開設審査をお待ちください。");
        } else {
          setStatus("pending");
          setMessage("Stripeへの情報送信が完了しました。審査完了までしばらくお待ちください。");
        }
        setTimeout(() => router.push("/dashboard/profile"), 4000);
      })
      .catch(() => {
        setStatus("error");
        setMessage("ステータスの確認に失敗しました。プロフィール画面をご確認ください。");
        setTimeout(() => router.push("/dashboard/profile"), 3000);
      });
  }, [isSuccess, isRefresh, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6 text-center">
        {status === "checking" && (
          <>
            <Loader2 size={40} className="text-indigo-400 animate-spin mx-auto" />
            <p className="text-white font-black text-lg">審査状況を確認中...</p>
          </>
        )}
        {status === "approved" && (
          <>
            <CheckCircle size={40} className="text-emerald-400 mx-auto" />
            <p className="text-white font-black text-lg">Stripe審査完了</p>
            <p className="text-slate-400 text-sm">{message}</p>
          </>
        )}
        {status === "pending" && (
          <>
            <CheckCircle size={40} className="text-amber-400 mx-auto" />
            <p className="text-white font-black text-lg">情報を送信しました</p>
            <p className="text-slate-400 text-sm">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle size={40} className="text-red-400 mx-auto" />
            <p className="text-white font-black text-lg">確認できませんでした</p>
            <p className="text-slate-400 text-sm">{message}</p>
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
