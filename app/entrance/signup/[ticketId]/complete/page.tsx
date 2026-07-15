import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { reconcileTicketForUser } from "@/lib/touchpay-reconcile";
import { CheckCircle2, Loader2 } from "lucide-react";

async function TouchpaySignupCompleteContent({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const user = await getUser();
  if (!user) redirect(`/entrance/signup/${ticketId}`);

  await reconcileTicketForUser(ticketId, user.id, user.email ?? null);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <CheckCircle2 size={44} className="text-emerald-400" />
      <p className="text-lg font-black text-white">アカウントに紐付けました</p>
      <p className="text-sm text-slate-400">マイチケットからご確認いただけます</p>
    </div>
  );
}

export default function TouchpaySignupCompletePage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
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
