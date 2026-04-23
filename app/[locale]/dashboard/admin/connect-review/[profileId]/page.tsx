import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, Loader2, User, MapPin, Building2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { AdminConnectReview } from "@/components/admin-connect-review";

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-800 last:border-0">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-200 text-right break-all">{value}</span>
    </div>
  );
}

async function DetailContent({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select(`
      profile_id, display_name, role, verification_status, stripe_connect_id, created_at,
      first_name, last_name, first_name_kanji, last_name_kanji, first_name_kana, last_name_kana,
      phone, dob_year, dob_month, dob_day,
      postal_code, prefecture, city, address_town, street_address,
      address_kana_state, address_kana_city, address_kana_town, address_kana_line1,
      business_type, business_name, product_description, social_links
    `)
    .eq("profile_id", profileId)
    .single();

  if (!profile) notFound();

  // 紹介者を取得
  const { data: invitation } = await admin
    .from("invitations")
    .select("invited_by_profile_id, inviter:profiles!invited_by_profile_id(display_name, role)")
    .eq("accepted_by_profile_id", profileId)
    .maybeSingle();

  const inviter = (invitation?.inviter as unknown as { display_name: string | null; role: string }) ?? null;

  const socialLinks = (profile.social_links as Record<string, string> | null) ?? {};
  const dob = profile.dob_year && profile.dob_month && profile.dob_day
    ? `${profile.dob_year}年 ${profile.dob_month}月 ${profile.dob_day}日`
    : null;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="space-y-1">
        <Link
          href="/dashboard/admin/connect-review"
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> 審査一覧に戻る
        </Link>
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Admin / Connect Review</p>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
          {profile.display_name ?? "—"}
        </h1>
        <p className="text-slate-500 text-sm">
          {ROLE_LABELS[profile.role] ?? profile.role} · 登録 {new Date(profile.created_at).toLocaleDateString("ja-JP")}
        </p>
      </div>

      {/* 紹介者 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 space-y-1">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">紹介者</p>
        {inviter ? (
          <p className="text-sm font-black text-white">
            {inviter.display_name ?? "—"}
            <span className="ml-2 text-[10px] text-slate-500 font-normal">
              {ROLE_LABELS[inviter.role] ?? inviter.role}
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-600 font-bold">紹介者なし（直接登録）</p>
        )}
      </div>

      {/* 氏名 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 space-y-0">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 pb-2">
          <User size={11} className="text-indigo-400" /> 氏名
        </p>
        <Row label="英字" value={`${profile.last_name ?? ""} ${profile.first_name ?? ""}`.trim() || null} />
        <Row label="漢字" value={`${profile.last_name_kanji ?? ""} ${profile.first_name_kanji ?? ""}`.trim() || null} />
        <Row label="カナ" value={`${profile.last_name_kana ?? ""} ${profile.first_name_kana ?? ""}`.trim() || null} />
        <Row label="生年月日" value={dob} />
        <Row label="電話" value={profile.phone} />
        <Row label="事業形態" value={profile.business_type === "company" ? "法人" : "個人"} />
        {profile.business_type === "company" && (
          <Row label="法人名" value={profile.business_name} />
        )}
      </div>

      {/* 住所 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 space-y-0">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 pb-2">
          <MapPin size={11} className="text-indigo-400" /> 住所
        </p>
        <Row label="郵便番号" value={profile.postal_code} />
        <Row label="漢字" value={[profile.prefecture, profile.city, profile.address_town, profile.street_address].filter(Boolean).join(" ") || null} />
        <Row label="カナ" value={[profile.address_kana_state, profile.address_kana_city, profile.address_kana_town, profile.address_kana_line1].filter(Boolean).join(" ") || null} />
      </div>

      {/* 事業情報 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 space-y-0">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 pb-2">
          <Building2 size={11} className="text-indigo-400" /> 事業情報
        </p>
        <Row label="事業内容" value={profile.product_description} />
        <Row label="ウェブサイト" value={socialLinks.website} />
      </div>

      {/* Stripe */}
      {profile.stripe_connect_id && (
        <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 space-y-0">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest pb-2">Stripe Connect</p>
          <Row label="Account ID" value={profile.stripe_connect_id} />
          <div className="pt-2">
            <a
              href={`https://dashboard.stripe.com/connect/accounts/${profile.stripe_connect_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-indigo-400 font-black hover:text-indigo-300 transition-colors"
            >
              <ExternalLink size={11} /> Stripeダッシュボードで確認
            </a>
          </div>
        </div>
      )}

      {/* 承認・却下 */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">審査アクション</p>
        <AdminConnectReview users={[{
          profile_id: profile.profile_id,
          display_name: profile.display_name,
          role: profile.role,
          stripe_connect_id: profile.stripe_connect_id,
          created_at: profile.created_at,
        }]} />
      </div>
    </div>
  );
}

export default function AdminConnectReviewDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  return (
    <div className="max-w-lg mx-auto space-y-8 pb-20">
      <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
        <DetailContent params={params} />
      </Suspense>
    </div>
  );
}
