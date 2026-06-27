import { fmtDate } from "@/lib/display-tz";
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteAcceptSection } from "@/components/invite-accept-section";
import { UserCircle, Clock, ShieldCheck, Mail } from "lucide-react";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<InviteLoadingPage />}>
      <InviteContent params={params} />
    </Suspense>
  );
}

async function InviteContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select(
      `
      invitation_id,
      target_role,
      target_email,
      status,
      expires_at,
      invited_by:profiles!invited_by_profile_id ( display_name )
    `,
    )
    .eq("token", token)
    .is("deleted_at", null)
    .single();

  // 初回アクセス時に viewed_at を記録
  if (invitation && !invitation.status?.startsWith("accepted")) {
    await admin
      .from("invitations")
      .update({ viewed_at: new Date().toISOString() })
      .eq("token", token)
      .is("viewed_at", null);
  }

  if (!invitation) {
    return <InviteErrorPage message="招待リンクが見つかりません。" />;
  }

  if (
    invitation.status === "expired" ||
    new Date(invitation.expires_at) < new Date()
  ) {
    return <InviteErrorPage message="この招待リンクは有効期限が切れています。" />;
  }

  if (invitation.status === "accepted") {
    return <InviteErrorPage message="この招待リンクはすでに使用されています。" />;
  }

  const inviterName = (invitation.invited_by as any)?.display_name ?? "Unknown";
  const roleLabel = ROLE_LABELS[invitation.target_role] ?? invitation.target_role;
  const expiresAt = fmtDate(invitation.expires_at);

  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
      <div className="px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <img
            src="/logo-emblem.png"
            alt="Direct Cheers"
            className="w-7 h-7 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
          />
          <span className="text-base font-black tracking-tighter text-white uppercase italic">
            Direct Cheers
          </span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
              Invitation
            </p>
            <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
              招待が届いています
            </h1>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
                <UserCircle size={20} className="text-pink-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  招待者
                </p>
                <p className="text-white font-bold">{inviterName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <ShieldCheck size={20} className="text-violet-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  付与されるロール
                </p>
                <p className="text-white font-bold">{roleLabel}</p>
              </div>
            </div>

            {invitation.target_email && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Mail size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    招待先メールアドレス
                  </p>
                  <p className="text-white font-bold">{invitation.target_email}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Clock size={20} className="text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  有効期限
                </p>
                <p className="text-slate-300 font-bold">{expiresAt}まで</p>
              </div>
            </div>
          </div>

          <Suspense
            fallback={
              <div className="h-16 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
            }
          >
            <InviteAcceptSection token={token} targetEmail={invitation.target_email ?? undefined} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function InviteLoadingPage() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans flex items-center justify-center">
      <div className="w-full max-w-md space-y-4 px-6">
        <div className="h-8 bg-slate-900 rounded-2xl animate-pulse" />
        <div className="h-48 bg-slate-900 rounded-[2.5rem] animate-pulse" />
        <div className="h-16 bg-slate-900 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

function InviteErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-6">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
          Invitation
        </p>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
          {message}
        </h1>
        <Link
          href="/"
          className="inline-block text-sm text-pink-500 hover:text-pink-400 font-bold transition-colors"
        >
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}
