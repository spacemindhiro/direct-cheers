import { createAdminClient } from "@/lib/supabase/admin";
import { sendConnectReviewRequestEmail } from "@/lib/email/notification";

/**
 * Stripeのオンボーディング（フォーム入力）が完了した時点で、プラットフォーム側の
 * 審査待ち（verification_status='pending'）に進め、adminへ通知する。
 *
 * /api/stripe/connect/status（connect-returnページ到達時にのみ呼ばれる）だけに
 * 依存していると、ユーザーがそのページに到達しなかった場合（リダイレクト失敗・
 * ページを閉じる等）永久にunverifiedのままになり、adminに通知が届かない障害が
 * あった。Stripe Webhook（account.updated）からも同じロジックを呼べるよう
 * 共通化し、ページ到達に依存しないセーフティネットにする。
 *
 * verification_statusが既にpending/verified等であれば何もしない（冪等）。
 */
export async function advanceToReviewPendingIfNeeded(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<{ notified: boolean }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("role, display_name, verification_status")
    .eq("profile_id", profileId)
    .single();

  if (!profile) return { notified: false };
  if (profile.verification_status !== "unverified" && profile.verification_status !== "rejected") {
    return { notified: false };
  }

  await admin
    .from("profiles")
    .update({ verification_status: "pending" })
    .eq("profile_id", profileId);

  // 通知先: ロールにかかわらず常に admin（オーナー）のみ。口座付与の最終権限はオーナーが持つ。
  // statusは口座開設オンボーディングの進行状況を表すカラムで、admin自身は口座を
  // 持たないため永久にactiveにならない。statusでの絞り込みがあったため、
  // adminへのメール送信（DB通知insertも含む）が一度も実行されていなかった
  // （他の通知箇所 cancel/route.ts, request-review/route.ts, evidence/route.ts は
  // いずれもroleのみで検索しており、statusを要求していたのはここだけだった）。
  // adminが複数いる場合は全員に通知する。かつてはORDER BYなしのlimit(1)で
  // 「任意の1人」に送っており、選ばれるadminが実行のたびに変わりうる非決定バグだった
  // （本番はadmin1人のため実害なし・複数admin環境のテストで顕在化）。
  const { data: admins } = await admin
    .from("profiles")
    .select("profile_id")
    .eq("role", "admin");

  if (!admins || admins.length === 0) return { notified: false };

  const roleLabel = profile.role === "agent" ? "エージェント" :
                    profile.role === "organizer" ? "オーガナイザー" : "アーティスト";
  try {
    await admin.from("notifications").insert(
      admins.map(a => ({
        profile_id: a.profile_id,
        type: "connect_review_request",
        title: "Stripe審査完了 — 口座開設審査待ち",
        body: `${profile.display_name ?? roleLabel} がStripe審査を通過しました。口座開設審査を行ってください。`,
        metadata: { subject_profile_id: profileId, subject_role: profile.role },
      })),
    );

    await Promise.all(admins.map(async (a) => {
      const { data: adminAuth } = await admin.auth.admin.getUserById(a.profile_id);
      const adminEmail = adminAuth.user?.email;
      if (adminEmail) {
        sendConnectReviewRequestEmail({
          to: adminEmail,
          applicantName: profile.display_name ?? roleLabel,
          applicantRole: roleLabel,
          profileId,
        }).catch(() => {});
      }
    }));
  } catch { /* notifications テーブルがなければスキップ */ }

  return { notified: true };
}
