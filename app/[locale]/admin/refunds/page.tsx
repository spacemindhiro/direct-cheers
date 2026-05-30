import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Loader2, ShieldAlert } from "lucide-react";
import { RefundClient } from "./refund-client";

async function RefundsContent() {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-red-400" />
          <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.3em]">
            Admin / Refunds
          </p>
        </div>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
          返金管理
        </h1>
        <p className="text-xs text-slate-500">
          PaymentIntent IDを入力して決済内容を確認し、返金モードを選択して実行してください。
          <br />
          <span className="text-red-400 font-bold">
            この操作はオーガナイザーの口座から直接資金を回収します。慎重に操作してください。
          </span>
        </p>
      </div>

      {/* 警告バナー */}
      <div className="bg-red-950/30 border border-red-500/20 rounded-2xl p-4">
        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2">
          ⚠ 取り扱い注意
        </p>
        <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
          <li>返金操作は即座に Stripe に反映され、取り消せません</li>
          <li>FULL_PENALTY モードはオーガナイザーの Connect 残高から全額を強制逆転します</li>
          <li>COMPASSIONATE モードでも Stripe 手数料（約4%）はオーガナイザーから回収されます</li>
          <li>精算済み（settle済み）の場合、settle_transfer の逆転が追加で発生します</li>
        </ul>
      </div>

      {/* インタラクティブUI（Client Component） */}
      <RefundClient />
    </div>
  );
}

export default function RefundsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={28} />
        </div>
      }
    >
      <RefundsContent />
    </Suspense>
  );
}
