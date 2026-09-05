import { fmtDate } from "@/lib/display-tz";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Loader2, Plus, Calendar, MapPin } from "lucide-react";
import Link from "next/link";

const LIFECYCLE_CONFIG: Record<string, { label: string; className: string }> = {
  draft:                  { label: "下書き",      className: "text-slate-400 bg-slate-800 border-slate-700" },
  review_requested:       { label: "承認待ち",    className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  published:              { label: "公開済み",    className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  ongoing:                { label: "開催中",      className: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  ended:                  { label: "終了",        className: "text-slate-500 bg-slate-800 border-slate-700" },
  settled:                { label: "精算済み",    className: "text-slate-600 bg-slate-800/50 border-slate-700/50" },
  cancellation_requested: { label: "中止申請中",  className: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  cancelled:              { label: "中止",        className: "text-red-400 bg-red-500/10 border-red-500/20" },
};

// ロールではなく「このイベントとの関係」で判定する（[eventId]/page.tsx と同じ考え方）
const RELATION_CONFIG: Record<"organizer" | "agent", { label: string; className: string }> = {
  organizer: { label: "主催",     className: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  agent:     { label: "エージェント", className: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
};

// 「終了」に送るのは、もう何もすることが残っていないイベントだけ。
// 日程が過ぎていても精算が済んでいなければ「これから・対応中」に残す
// （過去タブに埋もれて精算漏れが起きるのを防ぐため）。
const CLOSED_STATUSES = new Set(["settled", "cancelled"]);

type Tab = "upcoming" | "past";

async function EventsContent({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "past" ? "past" : "upcoming";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  // organizer: 自分が主催するイベント
  // agent: 自分が担当するイベント
  // artist: 自分が出演するイベント
  const { data: events } = await supabase
    .from("events")
    .select("event_id, title, venue, start_at, end_at, lifecycle_status, organizer_profile_id, agent_id")
    .is("deleted_at", null)
    .order("start_at", { ascending: false });

  const all = events ?? [];
  // これから・対応中: 開催が近い順（日程超過の未精算が先頭に来て対応を促す）
  const upcoming = all
    .filter((ev) => !CLOSED_STATUSES.has(ev.lifecycle_status))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  // 終了: 直近に開催したものが先頭
  const past = all.filter((ev) => CLOSED_STATUSES.has(ev.lifecycle_status));

  const shown = tab === "past" ? past : upcoming;

  // ロールは上位互換（agent/adminはorganizerの業務も行える）のため、organizer以上を許可
  const canCreate = ["organizer", "agent", "admin"].includes(profile?.role ?? "");

  const TABS: { key: Tab; label: string; href: string; count: number }[] = [
    { key: "upcoming", label: "これから・対応中", href: "/dashboard/events",          count: upcoming.length },
    { key: "past",     label: "終了",             href: "/dashboard/events?tab=past", count: past.length },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Events</p>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">イベント</h1>
        </div>
        {canCreate && (
          <Link
            href="/dashboard/events/create"
            className="flex items-center gap-2 px-5 py-3 bg-pink-500 hover:bg-pink-400 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
          >
            <Plus size={16} /> 新規作成
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${
              tab === t.key
                ? "border-pink-500 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
              tab === t.key ? "bg-pink-500/20 text-pink-300" : "bg-slate-800 text-slate-500"
            }`}>
              {t.count}
            </span>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
            {tab === "past" ? "No finished events." : "No events yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((ev) => {
            const config = LIFECYCLE_CONFIG[ev.lifecycle_status] ?? LIFECYCLE_CONFIG.draft;
            const isOrganizer = ev.organizer_profile_id === user.id;
            const isAgent = ev.agent_id === user.id && !isOrganizer;
            const relation = isOrganizer ? RELATION_CONFIG.organizer : isAgent ? RELATION_CONFIG.agent : null;
            return (
              <Link
                key={ev.event_id}
                href={`/dashboard/events/${ev.event_id}`}
                className="block bg-slate-900 border border-slate-800 hover:border-pink-500/40 rounded-[1.5rem] px-6 py-5 transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-black text-white text-base truncate">{ev.title}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={11} /> {ev.venue ?? "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {fmtDate(ev.start_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {relation && (
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${relation.className}`}>
                        {relation.label}
                      </span>
                    )}
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${config.className}`}>
                      {config.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <EventsContent searchParams={searchParams} />
    </Suspense>
  );
}
