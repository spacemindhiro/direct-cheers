import { fmtDate } from "@/lib/display-tz";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Loader2, Plus, Calendar, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
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

// 終端状態。もう何も起きないので常に「終了」タブ。
const CLOSED_STATUSES = ["settled", "cancelled"] as const;

// api/cron/auto-cancel-unsettled の AUTH_EXPIRE_DAYS と同じ日数にすること。
// 決済があるイベントは開催日+7日であのバッチが必ず cancelled にするため、
// 7日を超えてなお終端状態でないものは「作ったが結局使われなかったイベント」
// （下書きのまま放置・公開したが決済ゼロ）に限られる。これを「終了」に送る。
// 精算待ちの7日間は「これから・対応中」に残るので精算漏れは起きない。
const SETTLEMENT_GRACE_DAYS = 7;

const PAGE_SIZE = 50;

const EVENT_COLUMNS =
  "event_id, title, venue, start_at, end_at, lifecycle_status, organizer_profile_id, agent_id";

type Tab = "upcoming" | "past";

async function EventsContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { tab: tabParam, page: pageParam } = await searchParams;
  const tab: Tab = tabParam === "past" ? "past" : "upcoming";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const cutoff = new Date(Date.now() - SETTLEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const closedList = `(${CLOSED_STATUSES.join(",")})`;

  // upcoming と past は互いの補集合。片方を直したらもう片方も必ず直すこと。
  //   past     = 終端状態 or 開催終了から7日超
  //   upcoming = 終端状態でない and 開催終了から7日以内
  const PAST_FILTER = `lifecycle_status.in.${closedList},end_at.lt."${cutoff}"`;

  const from = (page - 1) * PAGE_SIZE;
  const otherTab: Tab = tab === "past" ? "upcoming" : "past";

  // organizer: 自分が主催するイベント / agent: 自分が担当するイベント
  // artist: 自分が出演するイベント / admin: 全件（events_select ポリシー）
  // 全件取得すると PostgREST の 1000件上限で古いものが黙って切り捨てられるため、
  // 必ず .range() でページングする（cron/reconcile と同じ理由）。
  const listQuery = supabase
    .from("events")
    .select(EVENT_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  const otherCountQuery = supabase
    .from("events")
    .select("event_id", { count: "exact", head: true })
    .is("deleted_at", null);

  const [{ data: events, count: shownCount }, { count: otherCount }] = await Promise.all([
    (tab === "past"
      ? listQuery.or(PAST_FILTER)
      : listQuery.not("lifecycle_status", "in", closedList).gte("end_at", cutoff)
    )
      // これから: 開催が近い順（日程超過の未精算が先頭に来て対応を促す）
      // 終了:     直近に開催したものが先頭
      .order("start_at", { ascending: tab === "upcoming" })
      // start_at は一意でない（同日開催が普通にある）。タイブレーカーを付けないと
      // ページ間で同じ行が重複したり抜け落ちたりするため event_id で順序を確定させる。
      .order("event_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1),
    tab === "past"
      ? otherCountQuery.not("lifecycle_status", "in", closedList).gte("end_at", cutoff)
      : otherCountQuery.or(PAST_FILTER),
  ]);

  const total = shownCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts: Record<Tab, number> = {
    [tab]: total,
    [otherTab]: otherCount ?? 0,
  } as Record<Tab, number>;

  // ロールは上位互換（agent/adminはorganizerの業務も行える）のため、organizer以上を許可
  const canCreate = ["organizer", "agent", "admin"].includes(profile?.role ?? "");

  const hrefFor = (t: Tab, p: number) => {
    const params = new URLSearchParams();
    if (t === "past") params.set("tab", "past");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/dashboard/events?${qs}` : "/dashboard/events";
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "upcoming", label: "これから・対応中" },
    { key: "past",     label: "終了" },
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
            href={hrefFor(t.key, 1)}
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
              {counts[t.key]}
            </span>
          </Link>
        ))}
      </div>

      {!events || events.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
            {tab === "past" ? "No finished events." : "No events yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <PagerLink href={hrefFor(tab, page - 1)} disabled={page <= 1}>
            <ChevronLeft size={14} /> 前へ
          </PagerLink>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {page} / {totalPages}
          </span>
          <PagerLink href={hrefFor(tab, page + 1)} disabled={page >= totalPages}>
            次へ <ChevronRight size={14} />
          </PagerLink>
        </div>
      )}
    </div>
  );
}

function PagerLink({
  href, disabled, children,
}: {
  href: string; disabled: boolean; children: React.ReactNode;
}) {
  const className =
    "flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all";
  if (disabled) {
    return (
      <span className={`${className} border-slate-900 text-slate-700 cursor-default`}>{children}</span>
    );
  }
  return (
    <Link href={href} scroll={false} className={`${className} border-slate-800 text-slate-300 hover:border-pink-500/40 hover:text-white`}>
      {children}
    </Link>
  );
}

export default function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <EventsContent searchParams={searchParams} />
    </Suspense>
  );
}
