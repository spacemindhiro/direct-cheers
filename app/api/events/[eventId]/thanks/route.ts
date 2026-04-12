import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET: 購入済みユーザーが特典を取得
// クエリ: ?transaction_id=xxx  または セッション（ログイン済み）で検証
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const url = new URL(req.url);
  const transactionId = url.searchParams.get("transaction_id");

  const admin = createAdminClient();

  // 特典を取得（公開済みのみ）
  const { data: thanks } = await admin
    .from("event_thanks")
    .select("thanks_message, thanks_link_url, thanks_media_url, published_at")
    .eq("event_id", eventId)
    .not("published_at", "is", null)
    .maybeSingle();

  if (!thanks) {
    return NextResponse.json({ unlocked: false, thanks: null });
  }

  // 購入検証: transaction_id が指定されている場合
  if (transactionId) {
    const { data: tx } = await admin
      .from("transactions")
      .select("transaction_id, qr_config_id")
      .eq("transaction_id", transactionId)
      .eq("status", "completed")
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ unlocked: false, thanks: null });
    }

    // qr_config → event_id を検証
    if (tx.qr_config_id) {
      const { data: qrc } = await admin
        .from("qr_configs")
        .select("event_id")
        .eq("qr_config_id", tx.qr_config_id)
        .single();

      if (qrc?.event_id !== eventId) {
        return NextResponse.json({ unlocked: false, thanks: null });
      }
    }

    return NextResponse.json({ unlocked: true, thanks });
  }

  // ログイン済みユーザーで検証
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ unlocked: false, thanks: null });
  }

  // ユーザーのプロフィールに紐づく provisional_user 経由でトランザクション確認
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("provisional_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (provisional) {
    const { data: tx } = await admin
      .from("transactions")
      .select("transaction_id, qr_config_id")
      .eq("sender_profile_id", user.id)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();

    if (tx?.qr_config_id) {
      const { data: qrc } = await admin
        .from("qr_configs")
        .select("event_id")
        .eq("qr_config_id", tx.qr_config_id)
        .single();

      if (qrc?.event_id === eventId) {
        return NextResponse.json({ unlocked: true, thanks });
      }
    }
  }

  // sender_profile_id で直接確認
  const { data: directTx } = await admin
    .from("transactions")
    .select("qr_config_id")
    .eq("sender_profile_id", user.id)
    .eq("status", "completed")
    .limit(50);

  for (const tx of directTx ?? []) {
    if (!tx.qr_config_id) continue;
    const { data: qrc } = await admin
      .from("qr_configs")
      .select("event_id")
      .eq("qr_config_id", tx.qr_config_id)
      .single();
    if (qrc?.event_id === eventId) {
      return NextResponse.json({ unlocked: true, thanks });
    }
  }

  return NextResponse.json({ unlocked: false, thanks: null });
}

// POST: アーティスト/オーガナイザー/管理者が特典を設定
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // アクセス権チェック
  if (profile.role === "admin") {
    // 管理者は常にOK
  } else if (profile.role === "organizer") {
    const { data: event } = await admin
      .from("events")
      .select("organizer_profile_id")
      .eq("event_id", eventId)
      .single();
    if (event?.organizer_profile_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (profile.role === "artist") {
    const { data: ea } = await admin
      .from("event_artists")
      .select("artist_profile_id")
      .eq("event_id", eventId)
      .eq("artist_profile_id", user.id)
      .maybeSingle();
    if (!ea) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    thanks_message?: string;
    thanks_link_url?: string;
    thanks_media_url?: string;
    publish?: boolean;
  };

  const { data: existing } = await admin
    .from("event_thanks")
    .select("event_thanks_id")
    .eq("event_id", eventId)
    .maybeSingle();

  const payload = {
    event_id: eventId,
    thanks_message: body.thanks_message ?? null,
    thanks_link_url: body.thanks_link_url ?? null,
    thanks_media_url: body.thanks_media_url ?? null,
    published_at: body.publish
      ? (existing as any)?.published_at ?? new Date().toISOString()
      : null,
    created_by: user.id,
  };

  if (existing) {
    const { error } = await admin
      .from("event_thanks")
      .update({
        thanks_message: payload.thanks_message,
        thanks_link_url: payload.thanks_link_url,
        thanks_media_url: payload.thanks_media_url,
        published_at: payload.published_at,
      })
      .eq("event_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin
      .from("event_thanks")
      .insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 公開時: 購入者に follow_notifications を追加（任意）
  if (body.publish) {
    // 購入者を取得してサンクス通知キューに追加（future: push通知）
    // 現時点ではスキップ（通知インフラ未実装）
  }

  return NextResponse.json({ ok: true });
}
