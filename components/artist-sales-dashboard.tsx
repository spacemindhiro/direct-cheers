import { createClient } from "@/lib/supabase/server";
import { getFeeConfig } from "@/lib/fee-config";
import { Heart, Zap, Calendar, MapPin, ChevronRight } from "lucide-react";
import Link from "next/link";

export async function ArtistSalesDashboard({ profileId }: { profileId: string }) {
  const supabase = await createClient();
  const { net_rate } = await getFeeConfig();

  // 自分が出演するイベント一覧
  const { data: eventArtists } = await supabase
    .from("event_artists")
    .select("event_id, event:events!event_id(event_id, title, venue, start_at, lifecycle_status)")
    .eq("artist_profile_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const events = (eventArtists ?? []).map((ea: any) => ea.event).filter(Boolean);

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

  const LIFECYCLE_CONFIG: Record<string, { label: string; className: string }> = {
    draft:     { label: "承認待ち", className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
    published: { label: "公開済み", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    ongoing:   { label: "開催中",   className: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
    ended:     { label: "終了",     className: "text-slate-500 bg-slate-800 border-slate-700" },
    settled:   { label: "精算済み", className: "text-slate-600 bg-slate-800/50 border-slate-700/50" },
  };

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

      {/* 出演イベント一覧 */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Calendar size={14} className="text-pink-500" /> 出演イベント
        </h2>
        {events.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
            <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No events yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev: any) => {
              const config = LIFECYCLE_CONFIG[ev.lifecycle_status] ?? LIFECYCLE_CONFIG.ended;
              const isActive = ["published", "ongoing", "ended"].includes(ev.lifecycle_status);
              return (
                <Link
                  key={ev.event_id}
                  href={`/dashboard/events/${ev.event_id}`}
                  className={`block bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 flex items-center justify-between gap-4 transition-all ${
                    isActive ? "hover:border-pink-500/40 group" : ""
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-black text-white text-sm truncate group-hover:text-pink-400 transition-colors">{ev.title}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><MapPin size={11} />{ev.venue ?? "—"}</span>
                      <span>{new Date(ev.start_at).toLocaleDateString("ja-JP")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${config.className}`}>
                      {config.label}
                    </span>
                    {isActive && <ChevronRight size={14} className="text-slate-600 group-hover:text-pink-400 transition-colors" />}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
