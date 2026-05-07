import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST: アーティストが出演依頼に承認 or 辞退
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; artistId: string }> }
) {
  const { eventId, artistId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 自分の依頼のみ回答可
  if (user.id !== artistId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action } = await req.json() as { action: "accept" | "reject" };
  if (!["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 対象レコードの存在確認
  const { data: row } = await admin
    .from("event_artists")
    .select("event_artist_id, status")
    .eq("event_id", eventId)
    .eq("artist_profile_id", artistId)
    .is("deleted_at", null)
    .single();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "pending") {
    return NextResponse.json({ error: "Already responded" }, { status: 409 });
  }

  const newStatus = action === "accept" ? "confirmed" : "rejected";

  const { error: updateError } = await admin
    .from("event_artists")
    .update({ status: newStatus })
    .eq("event_artist_id", row.event_artist_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 拒否時: このイベントのQR配分からアーティストを除外
  if (action === "reject") {
    const { data: eventQrs } = await admin
      .from("qr_configs")
      .select("qr_config_id")
      .eq("event_id", eventId)
      .is("deleted_at", null);
    const qrIds = (eventQrs ?? []).map((q) => q.qr_config_id);
    if (qrIds.length > 0) {
      await admin
        .from("qr_config_targets")
        .update({ deleted_at: new Date().toISOString() })
        .eq("profile_id", artistId)
        .in("qr_config_id", qrIds)
        .is("deleted_at", null);
    }
  }

  // 承認時: コネクションがなければ作成
  if (action === "accept") {
    const { data: event } = await admin
      .from("events")
      .select("organizer_profile_id")
      .eq("event_id", eventId)
      .single();

    if (event?.organizer_profile_id) {
      await admin
        .from("connections")
        .upsert(
          {
            organizer_profile_id: event.organizer_profile_id,
            artist_profile_id: artistId,
            status: "active",
          },
          { onConflict: "organizer_profile_id,artist_profile_id", ignoreDuplicates: true }
        );
    }
  }

  // オーガナイザーへ通知
  try {
    const { data: event } = await admin
      .from("events")
      .select("organizer_profile_id, title")
      .eq("event_id", eventId)
      .single();

    const { data: artist } = await admin
      .from("profiles")
      .select("display_name")
      .eq("profile_id", artistId)
      .single();

    if (event?.organizer_profile_id) {
      await admin.from("notifications").insert({
        profile_id: event.organizer_profile_id,
        type: action === "accept" ? "lineup_accepted" : "lineup_rejected",
        title: action === "accept" ? "出演依頼が承認されました" : "出演依頼が辞退されました",
        body: action === "accept"
          ? `${artist?.display_name ?? "アーティスト"} が「${event.title}」への出演を承認しました。`
          : `${artist?.display_name ?? "アーティスト"} が「${event.title}」への出演を辞退しました。`,
        metadata: { event_id: eventId, artist_id: artistId },
      });
    }
  } catch { /* notifications テーブルがなければスキップ */ }

  return NextResponse.json({ ok: true, status: newStatus });
}
