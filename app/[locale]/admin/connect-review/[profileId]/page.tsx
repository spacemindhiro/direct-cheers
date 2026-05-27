import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, User, MapPin, Building2, ExternalLink, FileSignature, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import Stripe from "stripe";
import { AdminConnectReview } from "@/components/admin-connect-review";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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

  // メールアドレス・最終ログインを auth.users から取得
  const { data: { user: authUser } } = await admin.auth.admin.getUserById(profileId);
  const email = authUser?.email ?? null;
  const lastSignInAt = authUser?.last_sign_in_at ?? null;

  // Stripe口座作成日時を取得
  let stripeAccountCreatedAt: Date | null = null;
  if (profile.stripe_connect_id) {
    try {
      const account = await stripe.accounts.retrieve(profile.stripe_connect_id);
      stripeAccountCreatedAt = account.created ? new Date(account.created * 1000) : null;
    } catch { /* 取得失敗は無視 */ }
  }

  // 署名済み書類を取得（最新1件）
  const { data: signedDoc } = await admin
    .from("signed_documents")
    .select("id, signed_at, terms_types, terms_version")
    .eq("profile_id", profileId)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
<p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Admin / Connect Review</p>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
          {profile.display_name ?? "—"}
        </h1>
        <p className="text-slate-500 text-sm">{ROLE_LABELS[profile.role] ?? profile.role}</p>
        <div className="flex flex-col gap-0.5 pt-1">
          <p className="text-[11px] text-slate-500">
            <span className="text-slate-600 font-bold">登録</span>{" "}
            {new Date(profile.created_at).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" })}
          </p>
          {stripeAccountCreatedAt && (
            <p className="text-[11px] text-slate-500">
              <span className="text-slate-600 font-bold">Stripe申請</span>{" "}
              {stripeAccountCreatedAt.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" })}
            </p>
          )}
          {lastSignInAt && (
            <p className="text-[11px] text-slate-500">
              <span className="text-slate-600 font-bold">最終ログイン</span>{" "}
              {new Date(lastSignInAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" })}
            </p>
          )}
        </div>
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
        {email && (
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-800 last:border-0">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0 pt-0.5">メール</span>
            <a href={`mailto:${email}`} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors break-all text-right">
              {email}
            </a>
          </div>
        )}
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
        {socialLinks.website && (
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-800 last:border-0">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0 pt-0.5">ウェブサイト</span>
            <a
              href={socialLinks.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 text-right break-all"
            >
              {socialLinks.website} <ExternalLink size={11} className="shrink-0" />
            </a>
          </div>
        )}
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

      {/* 調印式 */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">調印式</p>
        {signedDoc ? (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-black text-white">署名済み</p>
                <p className="text-[10px] text-slate-500">
                  {new Date(signedDoc.signed_at).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" })}
                </p>
              </div>
            </div>
            <Link
              href={`/admin/documents/${signedDoc.id}`}
              className="text-[11px] font-black text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 shrink-0"
            >
              書類を確認 <ExternalLink size={11} />
            </Link>
          </div>
        ) : (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-400 shrink-0" />
              <p className="text-sm font-black text-amber-300">未署名</p>
            </div>
            <Link
              href={`/admin/terms/sign/${profileId}`}
              className="flex items-center gap-1.5 text-[11px] font-black text-white bg-amber-500 hover:bg-amber-400 transition-colors px-3 py-1.5 rounded-lg shrink-0"
            >
              <FileSignature size={12} /> 調印式を開始
            </Link>
          </div>
        )}
      </div>

      {/* 承認・却下 */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">審査アクション</p>
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl px-5 py-3 space-y-0.5">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">申請内容</p>
          <p className="text-sm font-black text-white">
            Stripe口座開設 — {ROLE_LABELS[profile.role] ?? profile.role}
          </p>
          {profile.stripe_connect_id && (
            <p className="text-[10px] text-slate-500">Stripe審査通過済み · {profile.stripe_connect_id}</p>
          )}
        </div>
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
