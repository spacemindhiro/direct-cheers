import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { reconcileTicketForUser } from "@/lib/touchpay-reconcile";
import { CheckCircle2 } from "lucide-react";

export default async function TouchpaySignupCompletePage({
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
