import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EvidenceUploadForm } from "@/components/evidence-upload-form";
import { Loader2, ArrowLeft, Calendar, MapPin, CheckCircle2 } from "lucide-react";
import Link from "next/link";

async function EvidencePageContent({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: event } = await supabase
    .from("events")
    .select("event_id, title, venue, start_at, end_at, lifecycle_status, organizer_profile_id")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  if (event.organizer_profile_id !== user.id) redirect("/dashboard");

  const hasEnded = new Date(event.end_at) < new Date();

  // 既存エビデンス
  const { data: existingEvidences } = await admin
    .from("event_evidences")
    .select("evidence_id, description, photo_paths, attendance_count, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">

        <div className="space-y-1">
          <Link
            href={`/dashboard/events/${eventId}`}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4"
          >
            <ArrowLeft size={12} /> イベント詳細に戻る
          </Link>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Evidence</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            エビデンス提出
          </h1>
        </div>

        {/* イベント情報 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <p className="font-black text-white">{event.title}</p>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {event.venue && (
              <span className="flex items-center gap-1"><MapPin size={11} />{event.venue}</span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {new Date(event.end_at).toLocaleDateString("ja-JP")}終了
            </span>
          </div>
          {!hasEnded && (
            <p className="text-xs text-amber-400 font-bold">
              ※ イベント終了後にエビデンスを提出できます
            </p>
          )}
        </div>

        {/* 既存エビデンス */}
        {(existingEvidences ?? []).length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">提出済みエビデンス</p>
            {existingEvidences!.map((ev) => (
              <div key={ev.evidence_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <p className="text-xs text-slate-400">
                    {new Date(ev.created_at).toLocaleDateString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {ev.attendance_count != null && (
                    <span className="text-xs text-slate-500">動員: {ev.attendance_count}人</span>
                  )}
                </div>
                {ev.description && (
                  <p className="text-sm text-slate-300">{ev.description}</p>
                )}
                {ev.photo_paths.length > 0 && (
                  <p className="text-xs text-slate-500">{ev.photo_paths.length}枚の写真</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* アップロードフォーム */}
        {hasEnded ? (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {(existingEvidences ?? []).length > 0 ? "追加で提出する" : "提出する"}
            </p>
            <EvidenceUploadForm eventId={eventId} />
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-slate-600 text-sm font-bold">
              イベント終了後に提出できます
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EvidencePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <EvidencePageContent params={params} />
    </Suspense>
  );
}
