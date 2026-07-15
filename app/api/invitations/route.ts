import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// 招待権限マトリクス
const PERMISSION_MATRIX: Record<string, string[]> = {
  admin: ["agent"],
  agent: ["organizer", "artist"],
  organizer: ["artist"],
};

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("profile_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await req.json();
  const { target_role, target_email } = body as {
    target_role: string;
    target_email?: string;
  };

  if (!target_email) {
    return NextResponse.json({ error: "メールアドレスは必須です" }, { status: 400 });
  }

  // 権限チェック
  const allowed = PERMISSION_MATRIX[profile.role] ?? [];
  if (!allowed.includes(target_role)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const admin = createAdminClient();

  // 同一 invited_by + target_email の pending 招待を期限切れに（再送対応）
  if (target_email) {
    await admin
      .from("invitations")
      .update({ status: "expired" })
      .eq("invited_by_profile_id", user.id)
      .eq("target_email", target_email)
      .eq("status", "pending");
  }

  // 新しい招待を発行
  const { data: invitation, error } = await admin
    .from("invitations")
    .insert({
      invited_by_profile_id: user.id,
      target_role,
      target_email: target_email ?? null,
    })
    .select("invitation_id, token, target_role, target_email, status, is_sent, viewed_at, expires_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 招待メールを自動送信。失敗しても招待作成自体は成功として返し、
  // is_sent: false のままにしてリンクの手動送信にフォールバックさせる。
  let isSent = false;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const inviteUrl = `${SITE_URL}/invite/${invitation.token}`;
    const inviterName = profile.display_name || "Direct Cheers";
    const roleLabel = ROLE_LABELS[target_role] ?? target_role;
    try {
      const resend = new Resend(resendApiKey);
      const { error: sendError } = await resend.emails.send({
        from: "Direct Cheers <noreply@direct-cheers.com>",
        to: target_email,
        subject: `${inviterName}さんからDirect Cheersへの招待が届いています`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#ec4899;margin-bottom:8px">Direct Cheersへの招待</h2>
            <p style="color:#64748b;font-size:14px">
              <strong>${inviterName}</strong>さんから、<strong>${roleLabel}</strong>としてDirect Cheersに参加する招待が届いています。
            </p>
            <p style="color:#64748b;font-size:14px">
              以下のボタンをタップして登録を進めてください。<br>
              有効期限は<strong>30日間</strong>です。
            </p>
            <a href="${inviteUrl}"
              style="display:inline-block;margin:20px 0;padding:14px 28px;background:#ec4899;color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
              招待を受ける
            </a>
            <p style="color:#94a3b8;font-size:12px">
              心当たりがない場合はこのメールを無視してください。
            </p>
          </div>
        `,
      });
      if (!sendError) {
        isSent = true;
        await admin
          .from("invitations")
          .update({ is_sent: true })
          .eq("invitation_id", invitation.invitation_id);
      }
    } catch (e) {
      console.error("[invitations] 招待メール送信に失敗", e);
    }
  }

  return NextResponse.json({ ...invitation, is_sent: isSent, accepted_by: null });
}
