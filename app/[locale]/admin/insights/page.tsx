import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Loader2, TrendingUp, Users, Star, Mic2, CalendarDays, Crown, ArrowUpRight
} from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";
import Link from "next/link";

const TIER_CONFIG: Record<number, { label: string; className: string }> = {
  10000: { label: "10K Legend",  className: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
  5000:  { label: "5K Power",    className: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  1000:  { label: "1K Club",     className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  500:   { label: "Influential", className: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  100:   { label: "Established", className: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  50:    { label: "Rising",      className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  10:    { label: "Early Circle",className: "text-slate-300 bg-slate-700/50 border-slate-600" },
  0:     { label: "Newcomer",    className: "text-slate-500 bg-slate-800/50 border-slate-700" },
};

function getTier(count: number) {
  const milestones = [10000, 5000, 1000, 500, 100, 50, 10];
  const hit = milestones.find((m) => count >= m) ?? 0;
  return TIER_CONFIG[hit];
}

async function InsightsContent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["admin", "agent"].includes(me?.role ?? "")) redirect("/dashboard");

  const admin = createAdminClient();

  // artist + organizer をフォロワー数降順で取得
  const { data: players } = await admin
    .from("profiles")
    .select("profile_id, display_name, avatar_url, role, status, follower_count, follower_milestone, created_at")
    .in("role", ["artist", "organizer"])
    .eq("status", "active")
    .order("follower_count", { ascending: false })
    .limit(100);

  const artists   = (players ?? []).filter((p) => p.role === "artist");
  const organizers = (players ?? []).filter((p) => p.role === "organizer");

  // 総フォロワー数サマリー
  const totalFollowers = (players ?? []).reduce((s, p) => s + (p.follower_count ?? 0), 0);
  const top1 = players?.[0];

  return (
    <div className="space-y-10 pb-20">
      <div className="space-y-1">
        <AdminBreadcrumb crumbs={[{ label: "Admin", href: "/admin/users" }, { label: "Insights" }]} />
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          Follower Insights
        </h1>
        <p className="text-sm text-slate-500">フォロワー数によるプレイヤー評価・優遇判断</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-pink-500" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">総フォロワー</p>
          </div>
          <p className="text-3xl font-black text-white italic tabular-nums">{totalFollowers.toLocaleString()}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Mic2 size={14} className="text-indigo-400" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">アーティスト</p>
          </div>
          <p className="text-3xl font-black text-white italic tabular-nums">{artists.length}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-2 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-emerald-400" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">オーガナイザー</p>
          </div>
          <p className="text-3xl font-black text-white italic tabular-nums">{organizers.length}</p>
        </div>
      </div>

      {/* トップランカー */}
      {top1 && (
        <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-pink-500/20 rounded-[2rem] p-6 space-y-4 shadow-[0_0_40px_rgba(236,72,153,0.1)]">
          <div className="flex items-center gap-2">
            <Crown size={16} className="text-amber-400" />
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em]">Top Influencer</p>
          </div>
          <div className="flex items-center gap-4">
            {top1.avatar_url ? (
              <img src={top1.avatar_url} alt={top1.display_name} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-pink-500/30" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-600 to-pink-900 flex items-center justify-center ring-2 ring-pink-500/30">
                <Mic2 size={24} className="text-white" />
              </div>
            )}
            <div>
              <p className="text-2xl font-black text-white italic uppercase tracking-tighter">{top1.display_name}</p>
              <p className="text-sm text-slate-400">{top1.role === "artist" ? "アーティスト" : "オーガナイザー"}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-4xl font-black text-pink-400 italic tabular-nums">{(top1.follower_count ?? 0).toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">フォロワー</p>
            </div>
          </div>
        </div>
      )}

      {/* アーティスト一覧（フォロワー数順） */}
      <PlayerRanking title="アーティスト" icon={<Mic2 size={14} className="text-pink-500" />} players={artists} />

      {/* オーガナイザー一覧 */}
      <PlayerRanking title="オーガナイザー" icon={<CalendarDays size={14} className="text-indigo-400" />} players={organizers} />
    </div>
  );
}

function PlayerRanking({
  title,
  icon,
  players,
}: {
  title: string;
  icon: React.ReactNode;
  players: {
    profile_id: string;
    display_name: string;
    avatar_url: string | null;
    role: string;
    follower_count: number;
    follower_milestone: number;
    created_at: string;
  }[];
}) {
  if (players.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
          {title} Rankings
        </p>
        <span className="text-[10px] text-slate-600">({players.length})</span>
      </div>

      <div className="space-y-2">
        {players.map((p, i) => {
          const tier = getTier(p.follower_count ?? 0);
          return (
            <div
              key={p.profile_id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl px-5 py-3.5 flex items-center gap-4 transition-all group"
            >
              {/* 順位 */}
              <div className={`w-7 text-center shrink-0 ${
                i === 0 ? "text-amber-400 font-black text-base" :
                i === 1 ? "text-slate-400 font-black" :
                i === 2 ? "text-amber-700 font-black" :
                "text-slate-600 text-sm font-bold"
              }`}>
                {i === 0 ? "👑" : i + 1}
              </div>

              {/* アバター */}
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.display_name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                  <Mic2 size={14} className="text-slate-500" />
                </div>
              )}

              {/* 名前・ティア */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white truncate group-hover:text-pink-400 transition-colors">
                  {p.display_name}
                </p>
                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${tier.className}`}>
                  {tier.label}
                </span>
              </div>

              {/* フォロワー数 */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-lg font-black text-white tabular-nums">{(p.follower_count ?? 0).toLocaleString()}</p>
                  <p className="text-[9px] text-slate-600">フォロワー</p>
                </div>
                <TrendingUp size={14} className="text-slate-700 group-hover:text-pink-500 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-pink-500 animate-spin" />
      </div>
    }>
      <InsightsContent />
    </Suspense>
  );
}
