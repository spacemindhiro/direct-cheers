import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const { data: event } = await supabase
    .from("events")
    .select("event_id, title, lifecycle_status, organizer_profile_id, agent_id, venue, start_at, end_at")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event.agent_id === user.id;

  if (!isOrganizer && !isAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (event.lifecycle_status === "settled") {
    return NextResponse.json({ error: "精算済みのイベントは編集できません" }, { status: 400 });
  }

  const body = await req.json();
  const { title, venue, start_at, end_at, artist_ids, paypay_enabled } = body as {
    title?: string;
    venue?: string;
    start_at?: string;
    end_at?: string;
    artist_ids?: string[];
    paypay_enabled?: boolean;
  };

  // 日程・場所が変わったら draft に戻す（再承認が必要）
  // タイムゾーン付き ISO 文字列と datetime-local 値を正規化して比較
  const normDt = (dt: string) => dt?.slice(0, 16) ?? "";
  const scheduleOrVenueChanged =
    (venue !== undefined && venue !== event.venue) ||
    (start_at !== undefined && normDt(start_at) !== normDt(event.start_at)) ||
    (end_at !== undefined && normDt(end_at) !== normDt(event.end_at));

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (venue !== undefined) updates.venue = venue;
  if (start_at !== undefined) updates.start_at = start_at;
  if (end_at !== undefined) updates.end_at = end_at;
  if (paypay_enabled !== undefined) updates.paypay_enabled = paypay_enabled;
  if (scheduleOrVenueChanged && !["draft", "settled", "cancelled"].includes(event.lifecycle_status)) {
    updates.lifecycle_status = "draft";
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("events")
      .update(updates)
      .eq("event_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // アーティスト変更
  if (artist_ids !== undefined) {
    // 現在の非削除アーティストを取得
    const { data: currentArtists } = await supabase
      .from("event_artists")
      .select("event_artist_id, artist_profile_id, status")
      .eq("event_id", eventId)
      .is("deleted_at", null);

    const currentIds = new Set((currentArtists ?? []).map((a) => a.artist_profile_id));
    const newIds = new Set(artist_ids);

    // 削除: 現在いるが新リストにいない → 論理削除
    const toRemove = (currentArtists ?? []).filter((a) => !newIds.has(a.artist_profile_id));
    if (toRemove.length > 0) {
      await supabase
        .from("event_artists")
        .update({ deleted_at: new Date().toISOString() })
        .in("event_artist_id", toRemove.map((a) => a.event_artist_id));
    }

    // 追加: 新リストにいるが現在いない → pending で insert
    const toAdd = artist_ids.filter((id) => !currentIds.has(id));
    if (toAdd.length > 0) {
      const rows = toAdd.map((artist_profile_id, i) => ({
        event_id: eventId,
        artist_profile_id,
        performance_order: (currentArtists?.length ?? 0) + i + 1,
        status: "pending",
      }));
      await supabase.from("event_artists").insert(rows);

      // 新規アーティストへ通知
      try {
        const admin = createAdminClient();
        const { data: eventData } = await admin
          .from("events")
          .select("title")
          .eq("event_id", eventId)
          .single();
        const { data: organizer } = await admin
          .from("profiles")
          .select("display_name")
          .eq("profile_id", event.organizer_profile_id)
          .single();

        const notifs = toAdd.map((artistId) => ({
          profile_id: artistId,
          type: "lineup_invite",
          title: "出演依頼が届いています",
          body: `${organizer?.display_name ?? "オーガナイザー"} から「${eventData?.title}」への出演依頼が届いています。`,
          metadata: { event_id: eventId, organizer_id: event.organizer_profile_id },
        }));
        await admin.from("notifications").insert(notifs);
      } catch { /* notifications テーブルがなければスキップ */ }
    }
  }

  const reApprovalRequired = scheduleOrVenueChanged && !["draft", "settled", "cancelled"].includes(event.lifecycle_status);

  // イベント名・会場・日程が変わった場合、Walletパスを更新push（fire-and-forget）
  const infoChanged = (title !== undefined && title !== event.title) || scheduleOrVenueChanged;
  if (infoChanged && Object.keys(updates).length > 0) {
    (async () => {
      try {
        const admin2 = createAdminClient();
        // チアーズ: qr_configs → transactions のシリアル番号
        const { data: qrConfigs } = await admin2
          .from("qr_configs").select("qr_config_id").eq("event_id", eventId).is("deleted_at", null);
        if (qrConfigs && qrConfigs.length > 0) {
          const { data: txs } = await admin2
            .from("transactions").select("transaction_id")
            .in("qr_config_id", qrConfigs.map((q) => q.qr_config_id))
            .eq("status", "completed");
          for (const tx of txs ?? []) {
            pushWalletUpdateBySerial(tx.transaction_id).catch(() => {});
          }
        }
        // 入場チケット: tickets のシリアル番号
        const { data: tickets } = await admin2
          .from("tickets").select("ticket_id").eq("event_id", eventId);
        for (const t of tickets ?? []) {
          pushWalletUpdateBySerial(t.ticket_id).catch(() => {});
        }
      } catch { /* push失敗はサイレント */ }
    })();
  }

  return NextResponse.json({ ok: true, re_approval_required: reApprovalRequired });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("event_id, lifecycle_status, organizer_profile_id")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (event.organizer_profile_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["draft", "review_requested"].includes(event.lifecycle_status)) {
    return NextResponse.json({ error: "承認前のイベントのみ削除できます" }, { status: 400 });
  }

  const { error } = await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
