import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDirectoryProfile, resolveDirectoryViewer, type DirectoryEvent } from "@/lib/directory";
import { fmtDate } from "@/lib/display-tz";
import { Loader2, UserCircle, ArrowLeft, CreditCard, Mic2, Calendar, Instagram, Globe, Music } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  published: "公開中",
  ongoing: "開催中",
  ended: "終了",
  settled: "精算済み",
};

const REGISTRATION_LABELS: Record<string, { label: string; className: string }> = {
  pending_onboarding: { label: "Stripe未完了", className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  pending_terms: { label: "規約未同意", className: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  pending_interview: { label: "面談待ち", className: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  active: { label: "承認済み", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  rejected: { label: "却下", className: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const VERIFICATION_LABELS: Record<string, { label: string; className: string }> = {
  unverified: { label: "未申請", className: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  pending: { label: "審査中", className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  verified: { label: "承認済み", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  rejected: { label: "却下", className: "text-red-400 bg-red-500/10 border-red-500/20" },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-white text-right">{value}</span>
    </div>
  );
}

function EventList({ title, icon, events }: { title: string; icon: React.ReactNode; events: DirectoryEvent[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
        {icon} {title} ({events.length})
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-slate-600 bg-slate-900 border border-slate-800 rounded-[1.5rem] px-5 py-4">実績はありません</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-5 py-2">
          {events.map((e) => (
            <div key={e.event_id} className="flex items-center justify-between gap-4 py-3 border-b border-slate-800 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{e.title}</p>
                <p className="text-xs text-slate-500">{fmtDate(e.start_at)}</p>
              </div>
              <span className="text-[10px] font-black text-slate-400 shrink-0">
                {LIFECYCLE_LABELS[e.lifecycle_status] ?? e.lifecycle_status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function DirectoryDetailContent({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const viewer = await resolveDirectoryViewer(admin, user.id);
  if (!viewer) redirect("/dashboard");

  const p = await getDirectoryProfile(admin, { viewerRole: viewer.role, profileId });
  if (!p) notFound();

  const name = p.artist_name || p.display_name;
  const links = [
    p.social_links.instagram && { href: p.social_links.instagram, label: "Instagram", icon: <Instagram size={14} /> },
    p.social_links.soundcloud && { href: p.social_links.soundcloud, label: "SoundCloud", icon: <Music size={14} /> },
    p.social_links.website && { href: p.social_links.website, label: "Website", icon: <Globe size={14} /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];
  const verification = p.internal
    ? VERIFICATION_LABELS[p.internal.account.verification_status] ?? VERIFICATION_LABELS.unverified
    : null;

  return (
    <div className="space-y-10">
      <Link href="/dashboard/directory" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-pink-400">
        <ArrowLeft size={14} /> 検索に戻る
      </Link>

      <div className="flex items-center gap-5">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover shrink-0" />
        ) : (
          <UserCircle size={80} className="text-slate-700 shrink-0" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
            {ROLE_LABELS[p.role] ?? p.role}
          </p>
          <h1 className="text-3xl font-black text-white italic tracking-tighter break-words">{name}</h1>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-5 py-2">
        {p.genre && <Row label="ジャンル" value={p.genre} />}
        {p.affiliation && <Row label="所属" value={p.affiliation} />}
        {p.organizer_name && <Row label="主催者名" value={p.organizer_name} />}
        {p.organization_name && <Row label="団体名" value={p.organization_name} />}
        {!p.genre && !p.affiliation && !p.organizer_name && !p.organization_name && (
          <p className="text-sm text-slate-600 py-2">登録されている項目はありません</p>
        )}
      </div>

      {p.bio && (
        <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{p.bio}</p>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-pink-500/40 rounded-xl text-xs font-bold text-slate-300"
            >
              {l.icon} {l.label}
            </a>
          ))}
        </div>
      )}

      {p.internal && verification && (
        <>
          <div className="space-y-3">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
              <CreditCard size={14} className="text-indigo-400" /> 口座状況
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-5 py-2">
              <Row
                label="登録状況"
                value={(() => {
                  const r = REGISTRATION_LABELS[p.internal.registration_status];
                  return r
                    ? <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${r.className}`}>{r.label}</span>
                    : p.internal.registration_status;
                })()}
              />
              <Row label="口座登録" value={p.internal.account.has_connect_account ? "登録あり" : "未登録"} />
              <Row
                label="口座審査"
                value={
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${verification.className}`}>
                    {verification.label}
                  </span>
                }
              />
              <Row
                label="Stripe制限"
                value={p.internal.account.stripe_restricted ? <span className="text-red-400">制限あり</span> : "なし"}
              />
              <Row
                label="残高凍結"
                value={p.internal.account.balance_frozen ? <span className="text-red-400">凍結中</span> : "なし"}
              />
              <Row label="チャージバック" value={`${p.internal.account.chargeback_count}件`} />
            </div>
          </div>

          <EventList title="出演実績" icon={<Mic2 size={14} className="text-pink-400" />} events={p.internal.performances} />
          {p.role !== "artist" && (
            <EventList title="開催実績" icon={<Calendar size={14} className="text-indigo-400" />} events={p.internal.hosted_events} />
          )}
        </>
      )}
    </div>
  );
}

export default function DirectoryDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <DirectoryDetailContent params={params} />
    </Suspense>
  );
}
