import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Loader2, Plus, Calendar, MapPin } from "lucide-react";
import Link from "next/link";

const LIFECYCLE_CONFIG: Record<string, { label: string; className: string }> = {
  draft:      { label: "承認待ち",   className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  published:  { label: "公開済み",   className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  ongoing:    { label: "開催中",     className: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  ended:      { label: "終了",       className: "text-slate-500 bg-slate-800 border-slate-700" },
  settled:    { label: "精算済み",   className: "text-slate-600 bg-slate-800/50 border-slate-700/50" },
};

async function EventsContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  // organizer: 自分が主催するイベント
  // agent: 自分が担当するイベント
  // artist: 自分が出演するイベント
  let query = supabase
    .from("events")
    .select("event_id, title, venue, start_at, end_at, lifecycle_status")
    .is("deleted_at", null)
    .order("start_at", { ascending: false });

  const { data: events } = await query;

  const canCreate = profile?.role === "organizer";

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

      {!events || events.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No events yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const config = LIFECYCLE_CONFIG[ev.lifecycle_status] ?? LIFECYCLE_CONFIG.draft;
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
                        {new Date(ev.start_at).toLocaleDateString("ja-JP")}
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${config.className}`}>
                    {config.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <EventsContent />
    </Suspense>
  );
}
