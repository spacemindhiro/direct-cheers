import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { SIGNUP_DEVICE_COOKIE, claimFailureMessage, claimTouchpaySignupToken } from "@/lib/touchpay-signup-token";
import { CheckCircle2, Loader2 } from "lucide-react";

// ログインリンク（サインアップ画面で入力したメール宛て）から戻ってきたところで紐付ける。
// ログインリンクはメールアプリ等の別ブラウザで開かれうるため、「QRを開いたブラウザ」か
// 「そのブラウザで入力したメールでログインした人」のどちらかで通す。
async function TouchpaySignupCompleteContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getUser();
  if (!user) redirect(`/entrance/signup/${token}`);

  const deviceKey = (await cookies()).get(SIGNUP_DEVICE_COOKIE)?.value ?? null;
  const result = await claimTouchpaySignupToken(createAdminClient(), token, user, deviceKey);
  if (!result.ok) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-black text-white">紐付けできませんでした</p>
        <p className="text-sm text-slate-400 max-w-sm">{claimFailureMessage(result.reason)}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <CheckCircle2 size={44} className="text-emerald-400" />
      <p className="text-lg font-black text-white">アカウントに紐付けました</p>
      <p className="text-sm text-slate-400">今日の入場チケットはマイチケットからいつでも確認できます</p>
      <Link
        href={`/tickets#ticket-${result.ticketId}`}
        className="w-full max-w-xs h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center mt-2"
      >
        マイチケットを見る
      </Link>
    </div>
  );
}

export default function TouchpaySignupCompletePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <TouchpaySignupCompleteContent params={params} />
    </Suspense>
  );
}
