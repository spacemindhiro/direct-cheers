import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWalletPush } from "@/lib/apple-wallet-push";

// GET: 購入済みユーザーが特典を取得（transaction_id で購入検証）
export async function GET(
  req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> }
) {
  const { qrConfigId } = await params;
  const url = new URL(req.url);
  const transactionId = url.searchParams.get("transaction_id");

  const admin = createAdminClient();

  // 公開済み特典を取得
  const { data: thanks } = await admin
    .from("qr_config_thanks")
    .select("thanks_message, thanks_link_url, thanks_media_url, published_at")
    .eq("qr_config_id", qrConfigId)
    .not("published_at", "is", null)
    .maybeSingle();

  if (!thanks) return NextResponse.json({ unlocked: false, thanks: null });

  // transaction_id による購入検証
  if (transactionId) {
    const { data: tx } = await admin
      .from("transactions")
      .select("transaction_id, qr_config_id")
      .eq("transaction_id", transactionId)
      .eq("qr_config_id", qrConfigId)
      .eq("status", "completed")
      .maybeSingle();

    if (!tx) return NextResponse.json({ unlocked: false, thanks: null });
    return NextResponse.json({ unlocked: true, thanks });
  }

  // ログイン済みユーザーによる検証
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ unlocked: false, thanks: null });

  const { data: tx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("sender_profile_id", user.id)
    .eq("qr_config_id", qrConfigId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  if (tx) return NextResponse.json({ unlocked: true, thanks });

  return NextResponse.json({ unlocked: false, thanks: null });
}

// POST: オーガナイザー・エージェントが特典を設定
export async function POST(
  req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> }
) {
  const { qrConfigId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // QR → event のオーガナイザー・エージェント確認
  const { data: qr } = await admin
    .from("qr_configs")
    .select("event_id, creator_profile_id, recipient_profile_id")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", qr.event_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const isOrganizer = event?.organizer_profile_id === user.id;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event?.agent_id === user.id;
  const isAdmin = profile?.role === "admin";
  const isRecipient = qr.recipient_profile_id === user.id;

  if (!isOrganizer && !isAgent && !isAdmin && !isRecipient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    thanks_message?: string | null;
    thanks_link_url?: string | null;
    thanks_media_url?: string | null;
    publish?: boolean;
  };

  const { data: existing } = await admin
    .from("qr_config_thanks")
    .select("qr_config_thanks_id, published_at")
    .eq("qr_config_id", qrConfigId)
    .maybeSingle();

  const payload = {
    qr_config_id: qrConfigId,
    thanks_message: body.thanks_message ?? null,
    thanks_link_url: body.thanks_link_url ?? null,
    thanks_media_url: body.thanks_media_url ?? null,
    published_at: body.publish
      ? ((existing as any)?.published_at ?? new Date().toISOString())
      : null,
    created_by: user.id,
  };

  if (existing) {
    const { error } = await admin
      .from("qr_config_thanks")
      .update({
        thanks_message: payload.thanks_message,
        thanks_link_url: payload.thanks_link_url,
        thanks_media_url: payload.thanks_media_url,
        published_at: payload.published_at,
      })
      .eq("qr_config_id", qrConfigId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("qr_config_thanks").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // publish時: ウォレット登録済みデバイスにpush
  if (body.publish) {
    (async () => {
      try {
        const { data: txRows } = await admin
          .from("transactions")
          .select("transaction_id")
          .eq("qr_config_id", qrConfigId)
          .eq("status", "completed");

        if (!txRows?.length) {
          console.log("[thanks/push] no transactions for qrConfigId:", qrConfigId);
          return;
        }

        const serialNumbers = txRows.map((t) => t.transaction_id);
        const { data: devices } = await admin
          .from("wallet_device_registrations")
          .select("push_token")
          .in("serial_number", serialNumbers);

        const uniqueTokens = [...new Set((devices ?? []).map((d) => d.push_token))];
        console.log("[thanks/push] pushing to", uniqueTokens.length, "devices for", qrConfigId);

        if (uniqueTokens.length === 0) {
          console.log("[thanks/push] no registered devices — pass may have been added before webServiceURL was set");
          return;
        }

        const results = await Promise.allSettled(uniqueTokens.map((token) => sendWalletPush(token)));
        results.forEach((r) => {
          if (r.status === "rejected") console.error("[thanks/push] push failed:", r.reason);
        });
      } catch (err) {
        console.error("[thanks/push]", err);
      }
    })();
  }

  return NextResponse.json({ ok: true });
}
