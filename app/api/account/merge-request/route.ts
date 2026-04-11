import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// アカウント統合リクエスト：target_email 宛に確認メールを送る
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { target_email } = await req.json() as { target_email: string };

  if (!target_email?.includes("@"))
    return NextResponse.json({ error: "無効なメールアドレスです" }, { status: 400 });

  // 自分自身のメールへの統合はNG
  const { data: authUser } = await supabase.auth.admin?.getUserById(user.id) ?? { data: null };
  if (user.email === target_email)
    return NextResponse.json({ error: "自分のメールアドレスは指定できません" }, { status: 400 });

  const admin = createAdminClient();

  // target_email が provisional_users に存在するか確認
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("provisional_id, profile_id, stripe_customer_id")
    .eq("email", target_email)
    .maybeSingle();

  if (!provisional)
    return NextResponse.json(
      { error: "そのメールアドレスで決済した履歴が見つかりません" },
      { status: 404 }
    );

  // 既に同一プロファイルに紐づいている場合はスキップ
  if (provisional.profile_id === user.id)
    return NextResponse.json({ error: "そのメールアドレスは既にこのアカウントに紐づいています" }, { status: 400 });

  // トークンを発行
  const { data: tokenRow, error: tokenErr } = await admin
    .from("account_merge_tokens")
    .insert({
      requester_profile_id: user.id,
      target_email,
    })
    .select("token")
    .single();

  if (tokenErr || !tokenRow)
    return NextResponse.json({ error: "トークン生成に失敗しました" }, { status: 500 });

  const confirmUrl = `${SITE_URL}/account/merge-confirm?token=${tokenRow.token}`;
  const resend = new Resend(process.env.RESEND_API_KEY);

  // target_email に確認メールを送信
  await resend.emails.send({
    from: "Direct Cheers <noreply@direct-cheers.com>",
    to: target_email,
    subject: "アカウント統合の確認",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#ec4899;margin-bottom:8px">アカウント統合の確認</h2>
        <p style="color:#64748b;font-size:14px">
          このメールアドレスで決済した応援履歴を、別のアカウントに統合するリクエストがありました。
        </p>
        <p style="color:#64748b;font-size:14px">
          本人によるリクエストであれば、以下のボタンをタップして統合を完了してください。<br>
          有効期限は<strong>10分</strong>です。
        </p>
        <a href="${confirmUrl}"
          style="display:inline-block;margin:20px 0;padding:14px 28px;background:#ec4899;color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
          統合を承認する
        </a>
        <p style="color:#94a3b8;font-size:12px">
          心当たりがない場合はこのメールを無視してください。アカウントへの影響はありません。
        </p>
      </div>
    `,
  });

  return NextResponse.json({ success: true });
}
