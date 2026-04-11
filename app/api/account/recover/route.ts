import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// デバイストークンで照合（localStorage フィンガープリント）
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deviceToken = searchParams.get("device_token");

  if (!deviceToken)
    return NextResponse.json({ error: "device_token is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from("device_tokens")
    .select("provisional_id, profile_id, provisional:provisional_users!provisional_id(email)")
    .eq("token", deviceToken)
    .maybeSingle();

  if (!tokenRow)
    return NextResponse.json({ found: false });

  const email = (tokenRow.provisional as any)?.email ?? null;

  return NextResponse.json({
    found: true,
    masked_email: email ? maskEmail(email) : null,
    has_profile: !!tokenRow.profile_id,
  });
}

// 決済情報（金額＋日付）による自力リカバリー
export async function POST(req: Request) {
  const { amount, date, new_email } = await req.json() as {
    amount: number;
    date: string; // YYYY-MM-DD (JST)
    new_email?: string;
  };

  if (!amount || !date)
    return NextResponse.json({ error: "金額と日付は必須です" }, { status: 400 });

  const admin = createAdminClient();

  // DB の transactions を金額・日付範囲で検索
  const jstOffset = 9 * 60 * 60 * 1000;
  const dayStart = new Date(new Date(date).getTime() + jstOffset);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: txs } = await admin
    .from("transactions")
    .select(`
      transaction_id,
      total_gross_amount,
      created_at,
      qr_config:qr_configs!qr_config_id(
        event:events!event_id(title)
      )
    `)
    .eq("total_gross_amount", amount)
    .eq("status", "completed")
    .gte("created_at", new Date(dayStart.getTime() - jstOffset).toISOString())
    .lt("created_at", new Date(dayEnd.getTime() - jstOffset).toISOString());

  if (!txs || txs.length === 0)
    return NextResponse.json(
      { error: "該当する決済が見つかりませんでした。金額または日付を確認してください。" },
      { status: 404 }
    );

  // Stripe の PaymentIntent から customer_email を取得
  const results: {
    transaction_id: string;
    masked_email: string | null;
    event_title: string | null;
    raw_email?: string;
  }[] = [];

  for (const tx of txs) {
    // Stripe から customer_email を取得
    const { data: fullTx } = await admin
      .from("transactions")
      .select("stripe_payment_intent_id")
      .eq("transaction_id", tx.transaction_id)
      .single();

    let customerEmail: string | null = null;
    try {
      const pi = await stripe.paymentIntents.retrieve(fullTx!.stripe_payment_intent_id, {
        expand: ["customer"],
      });
      customerEmail =
        typeof pi.customer === "object" && pi.customer !== null
          ? (pi.customer as { email?: string | null }).email ?? null
          : null;
      if (!customerEmail) {
        // checkout session から取得を試みる
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: fullTx!.stripe_payment_intent_id,
          limit: 1,
        });
        customerEmail = sessions.data[0]?.customer_email ?? null;
      }
    } catch {
      // Stripe API エラーはスキップ
    }

    results.push({
      transaction_id: tx.transaction_id,
      masked_email: customerEmail ? maskEmail(customerEmail) : null,
      event_title: (tx.qr_config as any)?.event?.title ?? null,
      raw_email: customerEmail ?? undefined,
    });
  }

  // 1件のみ & new_email が指定されている場合は移行処理へ
  if (new_email && results.length === 1 && results[0].raw_email) {
    const oldEmail = results[0].raw_email;

    if (oldEmail === new_email)
      return NextResponse.json({ error: "同じメールアドレスです" }, { status: 400 });

    // マジックリンクを new_email に送信（old_email の権利をセルフサービスで委譲）
    const { data: oldProvisional } = await admin
      .from("provisional_users")
      .select("provisional_id, profile_id")
      .eq("email", oldEmail)
      .maybeSingle();

    if (!oldProvisional)
      return NextResponse.json({ error: "元のアカウントが見つかりません" }, { status: 404 });

    // new_email への provisional_user を upsert
    const { data: newProvisional } = await admin
      .from("provisional_users")
      .upsert({ email: new_email }, { onConflict: "email" })
      .select("provisional_id, profile_id")
      .single();

    if (!newProvisional)
      return NextResponse.json({ error: "新しいアカウントの作成に失敗しました" }, { status: 500 });

    // DB付け替え（old → new）
    if (oldProvisional.profile_id) {
      await admin
        .from("transactions")
        .update({ sender_profile_id: newProvisional.profile_id ?? oldProvisional.profile_id })
        .eq("sender_profile_id", oldProvisional.profile_id);

      await admin
        .from("passkey_credentials")
        .update({ profile_id: newProvisional.profile_id ?? oldProvisional.profile_id })
        .eq("profile_id", oldProvisional.profile_id);
    }

    // provisional_users を new_email に付け替え（別レコードは統合済み化）
    await admin
      .from("provisional_users")
      .update({
        profile_id: newProvisional.profile_id ?? oldProvisional.profile_id,
        converted_at: new Date().toISOString(),
      })
      .eq("email", new_email);

    // old email の provisional は無効化
    await admin
      .from("provisional_users")
      .update({ profile_id: null })
      .eq("email", oldEmail);

    // パスキー登録へのマジックリンクを new_email に送信
    const recoveryUrl = `${SITE_URL}/account/recover-complete?email=${encodeURIComponent(new_email)}`;
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Direct Cheers <noreply@direct-cheers.com>",
      to: new_email,
      subject: "アカウント復旧完了 - パスキーを登録してください",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#ec4899;margin-bottom:8px">アカウント復旧完了</h2>
          <p style="color:#64748b;font-size:14px">
            応援履歴を新しいメールアドレスに移行しました。<br>
            以下のボタンから、このデバイスにパスキー（顔認証・指紋認証）を登録してください。
          </p>
          <a href="${recoveryUrl}"
            style="display:inline-block;margin:20px 0;padding:14px 28px;background:#ec4899;color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
            パスキーを登録する
          </a>
        </div>
      `,
    });

    return NextResponse.json({ success: true, transferred: true, new_email });
  }

  // 複数件ヒットした場合は候補を返す（マスク済み）
  return NextResponse.json({
    found: true,
    count: results.length,
    results: results.map(({ transaction_id, masked_email, event_title }) => ({
      transaction_id,
      masked_email,
      event_title,
    })),
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const masked = local.length <= 2
    ? local[0] + "*".repeat(local.length - 1)
    : local.slice(0, 2) + "*".repeat(Math.max(local.length - 2, 3));
  return `${masked}@${domain}`;
}
