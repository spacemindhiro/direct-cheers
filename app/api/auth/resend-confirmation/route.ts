import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export async function POST(req: Request) {
  const { email, callbackUrl } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 確認リンクを生成
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    options: {
      redirectTo: callbackUrl ?? `${SITE_URL}/auth/callback`,
    },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      { error: error?.message ?? "リンク生成失敗" },
      { status: 500 }
    );
  }

  const confirmUrl = data.properties.action_link;

  // Resend でメール送信
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: mailError } = await resend.emails.send({
    from: "Direct Cheers <noreply@direct-cheers.com>",
    to: email,
    subject: "【Direct Cheers】メールアドレスを確認してください",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0">
        <h2 style="color:#ec4899;margin-bottom:8px">メールアドレスの確認</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6">
          Direct Cheersへのご登録ありがとうございます。<br>
          以下のボタンをクリックして、メールアドレスを確認してください。
        </p>
        <a href="${confirmUrl}"
          style="display:inline-block;margin:24px 0;padding:14px 28px;background:#ec4899;color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
          メールアドレスを確認する
        </a>
        <p style="color:#475569;font-size:12px">
          このメールに心当たりがない場合は無視してください。<br>
          ボタンが動作しない場合は以下のURLをブラウザに貼り付けてください：<br>
          <span style="color:#64748b;word-break:break-all">${confirmUrl}</span>
        </p>
      </div>
    `,
  });

  if (mailError) {
    return NextResponse.json({ error: mailError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
