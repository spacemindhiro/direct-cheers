import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWalletPush } from "@/lib/apple-wallet-push";
import { resolveCheerCardIdentity } from "@/lib/statement-descriptor";

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

// 公開時に、このQRで支払った人へアプリ内のお知らせを入れる。
// Wallet の更新は無音（changeMessage を付けていない）で、カード裏面も開かないと気づけないため、
// お返しが届いたことはここで知らせる。
// 「変更を反映する」を続けて押しても増えないよう、未読が残っている人には入れ直さない。
async function notifyBuyers(
  admin: ReturnType<typeof createAdminClient>,
  qrConfigId: string,
  recipient: { profileId: string | null; nameContext: "organizer" | "artist" },
  txRows: { sender_profile_id: string | null }[],
) {
  const buyerIds = [...new Set(txRows.map((t) => t.sender_profile_id).filter(Boolean) as string[])];
  if (buyerIds.length === 0) return;

  const { data: unread } = await admin
    .from("notifications")
    .select("profile_id")
    .eq("type", "thanks_published")
    .eq("is_read", false)
    .in("profile_id", buyerIds)
    .filter("metadata->>qr_config_id", "eq", qrConfigId);
  const already = new Set((unread ?? []).map((n) => n.profile_id));
  const targets = buyerIds.filter((id) => !already.has(id));
  if (targets.length === 0) return;

  let fromName = "アーティスト";
  if (recipient.profileId) {
    const { data: rp } = await admin
      .from("profiles")
      .select("display_name, artist_name, organizer_name")
      .eq("profile_id", recipient.profileId)
      .maybeSingle();
    // カードに出る名前と同じ規則で解決する（主催者名義/演者名義の区別込み）
    fromName = resolveCheerCardIdentity({
      recipientNameContext: recipient.nameContext,
      recipient: rp
        ? { organizerName: rp.organizer_name, artistName: rp.artist_name, displayName: rp.display_name }
        : null,
      fallbackName: "アーティスト",
    }).name;
  }

  const { error } = await admin.from("notifications").insert(
    targets.map((profile_id) => ({
      profile_id,
      type: "thanks_published",
      title: "お返しが届いています",
      body: `${fromName} からサンクス特典が届きました。カードの裏面で確認できます`,
      metadata: { qr_config_id: qrConfigId },
    })),
  );
  if (error) console.error("[thanks/notify]", error.message);
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
    .select("event_id, creator_profile_id, recipient_profile_id, recipient_name_context")
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

  // publish時: 購入者へのお知らせ＋ウォレット登録済みデバイスにpush（awaitして確実に完了させる）
  if (body.publish) {
    try {
      const { data: txRows } = await admin
        .from("transactions")
        .select("transaction_id, sender_profile_id")
        .eq("qr_config_id", qrConfigId)
        .eq("status", "completed");

      await notifyBuyers(
        admin,
        qrConfigId,
        {
          profileId: qr.recipient_profile_id,
          nameContext: ((qr.recipient_name_context as "organizer" | "artist" | null) ?? "artist"),
        },
        txRows ?? [],
      );

      const serialNumbers = (txRows ?? []).map((t) => t.transaction_id);
      if (serialNumbers.length > 0) {
        const { data: devices } = await admin
          .from("wallet_device_registrations")
          .select("push_token")
          .in("serial_number", serialNumbers);

        const uniqueTokens = [...new Set((devices ?? []).map((d) => d.push_token))];
        console.log("[thanks/push] pushing to", uniqueTokens.length, "devices for", qrConfigId);

        const results = await Promise.allSettled(uniqueTokens.map((token) => sendWalletPush(token)));
        results.forEach((r) => {
          if (r.status === "rejected") console.error("[thanks/push] push failed:", r.reason);
        });
      }
    } catch (err) {
      console.error("[thanks/push]", err);
    }
  }

  return NextResponse.json({ ok: true });
}
