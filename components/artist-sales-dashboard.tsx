import { createClient } from "@/lib/supabase/server";
import { getFeeConfig } from "@/lib/fee-config";
import { Heart, Zap } from "lucide-react";

export async function ArtistSalesDashboard({ profileId }: { profileId: string }) {
  const supabase = await createClient();
  const { net_rate } = await getFeeConfig();

  // 売上合計（自分の products に紐づく transactions）
  const { data: salesData } = await supabase
    .from("transactions")
    .select("total_gross_amount, product:products!product_id(artist_id)")
    .eq("status", "completed");

  const myTransactions = (salesData ?? []).filter(
    (tx: any) => tx.product?.artist_id === profileId,
  );
  const totalGross = myTransactions.reduce(
    (sum: number, tx: any) => sum + (tx.total_gross_amount ?? 0),
    0,
  );
  const totalNet = Math.floor(totalGross * net_rate);

  return (
    <div className="space-y-8">
      {/* 売上サマリー */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <div className="w-10 h-10 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20">
            <Heart size={20} className="text-pink-500" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Total Cheers</p>
            <p className="text-3xl font-black text-white italic tracking-tighter">
              {myTransactions.length.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
            <Zap size={20} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Net Earnings</p>
            <p className="text-3xl font-black text-white italic tracking-tighter">
              ¥{totalNet.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">
              総流通額 ¥{totalGross.toLocaleString()} × {(net_rate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
