import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";
import { isValidFlyerUrl } from "@/lib/image-source";
import { sendLineupInvites } from "@/lib/lineup-invite";
import { findIneligiblePerformers } from "@/lib/directory";
import { isEventEditable } from "@/lib/purchase-window";
import { eventHasBuyers } from "@/lib/event-buyers";
import { findRecipientsWithPayments, reassignLineupToOrganizer } from "@/lib/lineup-remove";

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
    .select("event_id, title, lifecycle_status, organizer_profile_id, agent_id, venue, venue_id, start_at, end_at")
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
  // 代理作成でまだ主催者に送っていない下書きは、主催者からは存在しない扱い
  if (!isAgent && await isProxyDraftHiddenFrom(createAdminClient(), eventId, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // 終わった（締め時刻後・終了・精算済み）・中止申請中・中止のイベントは変えない。
  // 以前は精算済みだけを止めていて、締め時刻後や中止申請中に日程を変えると下書きに戻り、精算の流れ・中止申請から外れた
  if (!isEventEditable(event.lifecycle_status, event.end_at)) {
    return NextResponse.json({ error: "終わった（または中止の）イベントは編集できません" }, { status: 400 });
  }

  const body = await req.json();
  const { title, venue, venue_id, start_at, end_at, artists, artist_ids, paypay_enabled, base_flyer_url } = body as {
    title?: string;
    venue?: string;
    venue_id?: string | null;
    start_at?: string;
    end_at?: string;
    artists?: { profile_id: string; invite_message?: string | null }[];
    artist_ids?: string[];
    paypay_enabled?: boolean;
    base_flyer_url?: string | null; // 任意のフライヤー画像。変えても再承認は不要
  };
  if (base_flyer_url !== undefined && !isValidFlyerUrl(base_flyer_url)) {
    return NextResponse.json({ error: "フライヤー画像の形式が不正です" }, { status: 400 });
  }
  // 新フォーマット（artists[]）と旧フォーマット（artist_ids[]）の両方をサポート
  const artistList = artists ?? artist_ids?.map((id) => ({ profile_id: id, invite_message: null as string | null }));

  // 新しく加える出演者は artist/organizer/agent の実在ユーザーのみ（画面を通さず一般ユーザー・admin等を指定されるのを防ぐ）。
  // どの書き込みよりも前に確かめ、拒否したときにイベント本体だけ書き換わることがないようにする。
  // 既に出演中の人は対象外（後からロールが変わった人を理由に編集できなくならないように）
  if (artistList !== undefined) {
    const { data: activeRows } = await createAdminClient()
      .from("event_artists")
      .select("artist_profile_id")
      .eq("event_id", eventId)
      .is("deleted_at", null);
    const already = new Set((activeRows ?? []).map((r) => r.artist_profile_id));
    const additions = artistList.map((a) => a.profile_id).filter((id) => !already.has(id));
    if ((await findIneligiblePerformers(createAdminClient(), additions)).length > 0) {
      return NextResponse.json({ error: "出演者に指定できないユーザーが含まれています" }, { status: 400 });
    }
    // 決済のある QR の宛先になっている人は外さない（宛先を替えると払ったお客様の明細と食い違い、替えなければ出ない人の名前で売り続けるため）
    const newIdSet = new Set(artistList.map((a) => a.profile_id));
    const removals = [...already].filter((id) => !newIdSet.has(id));
    const blocking = await findRecipientsWithPayments(createAdminClient(), eventId, removals);
    if (blocking.length > 0) {
      const labels = [...new Set(blocking.map((b) => `「${b.label ?? "ラベルなし"}」`))].join("");
      return NextResponse.json(
        { error: `外そうとしている出演者が宛先の QR ${labels}にすでに決済があるため、外せません。QR の販売を止める場合は運営にご連絡ください。` },
        { status: 409 },
      );
    }
  }

  // 日程・場所が変わったら draft に戻す（再承認が必要）
  // タイムゾーン付き ISO 文字列と datetime-local 値を正規化して比較
  const normDt = (dt: string) => dt?.slice(0, 16) ?? "";
  const scheduleOrVenueChanged =
    (venue !== undefined && venue !== event.venue) ||
    (start_at !== undefined && normDt(start_at) !== normDt(event.start_at)) ||
    (end_at !== undefined && normDt(end_at) !== normDt(event.end_at));

  // お客様がいる（決済・チケット・カード登録済みの前売予約がある）イベントは日程・会場を変えない。
  // 買った日・場所と違うイベントになり、身に覚えのない請求の異議につながるため。延期は中止して作り直す
  const venueIdChanged = venue_id !== undefined && (venue_id || null) !== (event.venue_id ?? null);
  if ((scheduleOrVenueChanged || venueIdChanged) && await eventHasBuyers(createAdminClient(), eventId)) {
    return NextResponse.json(
      { error: "このイベントにはすでにお客様の決済・チケットがあるため、日程・会場は変更できません。延期する場合はイベントを中止して作り直してください。" },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (venue !== undefined) updates.venue = venue;
  if (venue_id !== undefined) updates.venue_id = venue_id || null;
  if (start_at !== undefined) updates.start_at = start_at;
  if (end_at !== undefined) updates.end_at = end_at;
  if (paypay_enabled !== undefined) updates.paypay_enabled = paypay_enabled;
  if (base_flyer_url !== undefined) updates.base_flyer_url = base_flyer_url;
  if (scheduleOrVenueChanged && !["draft", "settled", "cancelled"].includes(event.lifecycle_status)) {
    updates.lifecycle_status = "draft";
  }

  // 書き込みは権限確認済みのサーバーで行う（DBは本人による直接書き込みを許可していない）
  const writer = createAdminClient();

  if (Object.keys(updates).length > 0) {
    const { error } = await writer
      .from("events")
      .update(updates)
      .eq("event_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // アーティスト変更
  if (artistList !== undefined) {
    // 現在の非削除アーティストを取得
    const { data: currentArtists } = await supabase
      .from("event_artists")
      .select("event_artist_id, artist_profile_id, status")
      .eq("event_id", eventId)
      .is("deleted_at", null);

    const currentIds = new Set((currentArtists ?? []).map((a) => a.artist_profile_id));
    const newIds = new Set(artistList.map((a) => a.profile_id));

    // 削除: 現在いるが新リストにいない → 論理削除
    const toRemove = (currentArtists ?? []).filter((a) => !newIds.has(a.artist_profile_id));
    if (toRemove.length > 0) {
      await writer
        .from("event_artists")
        .update({ deleted_at: new Date().toISOString() })
        .in("event_artist_id", toRemove.map((a) => a.event_artist_id));
      // 外した人の配分・宛先をオーガナイザーに付け替える（lib/lineup-remove.ts。決済のある QR の宛先は上で止めている）
      for (const a of toRemove) {
        await reassignLineupToOrganizer(writer, { eventId, artistId: a.artist_profile_id, organizerId: event.organizer_profile_id, actorId: user.id });
      }
    }

    // 下書きの間は出演依頼を送らず、主催者が承認依頼を送った時点で request-review がまとめて送る。
    // そのとき依頼メッセージは主催者名義で投稿されるため、主催者以外（担当エージェント）が書いたものは保存しない
    const deferInvites = (updates.lifecycle_status ?? event.lifecycle_status) === "draft";
    const keepMessage = !deferInvites || isOrganizer;

    // 追加: 新リストにいるが現在いない
    const toAddList = artistList
      .filter((a) => !currentIds.has(a.profile_id))
      .map((a) => (keepMessage ? a : { ...a, invite_message: null }));
    if (toAddList.length > 0) {
      // 過去に論理削除された行があれば復活させる（同一event×artistはUNIQUE制約のため新規insert不可）
      const { data: deletedRows } = await supabase
        .from("event_artists")
        .select("event_artist_id, artist_profile_id")
        .eq("event_id", eventId)
        .in("artist_profile_id", toAddList.map((a) => a.profile_id))
        .not("deleted_at", "is", null);

      const deletedEaIdByProfileId = new Map(
        (deletedRows ?? []).map((r) => [r.artist_profile_id, r.event_artist_id])
      );
      const toRestore = toAddList.filter((a) => deletedEaIdByProfileId.has(a.profile_id));
      const toCreate = toAddList.filter((a) => !deletedEaIdByProfileId.has(a.profile_id));

      if (toRestore.length > 0) {
        const { error: restoreError } = await writer
          .from("event_artists")
          .update({ status: "pending", deleted_at: null })
          .in("event_artist_id", toRestore.map((a) => deletedEaIdByProfileId.get(a.profile_id)!));
        if (restoreError) {
          return NextResponse.json({ error: restoreError.message }, { status: 500 });
        }
        // 後でまとめて送るとき（request-review）は event_artists の依頼メッセージを使うため、今回の内容で上書きしておく
        if (deferInvites) {
          for (const a of toRestore) {
            await writer
              .from("event_artists")
              .update({ invite_message: a.invite_message ?? null })
              .eq("event_artist_id", deletedEaIdByProfileId.get(a.profile_id)!);
          }
        }
      }

      let insertedEAs: { event_artist_id: string; artist_profile_id: string }[] = [];
      if (toCreate.length > 0) {
        const rows = toCreate.map((a, i) => ({
          event_id: eventId,
          artist_profile_id: a.profile_id,
          performance_order: (currentArtists?.length ?? 0) + i + 1,
          status: "pending",
          invite_message: a.invite_message ?? null,
        }));
        const { data, error: insertError } = await writer
          .from("event_artists")
          .insert(rows)
          .select("event_artist_id, artist_profile_id");
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
        insertedEAs = data ?? [];
      }

      const addedEAs = [
        ...insertedEAs,
        ...toRestore.map((a) => ({
          event_artist_id: deletedEaIdByProfileId.get(a.profile_id)!,
          artist_profile_id: a.profile_id,
        })),
      ];

      if (!deferInvites) {
        await sendLineupInvites(createAdminClient(), {
          eventId,
          eventTitle: (updates.title as string | undefined) ?? event.title,
          organizerId: event.organizer_profile_id,
          messageSenderId: user.id,
          invites: addedEAs.map((ea) => ({
            ...ea,
            invite_message: toAddList.find((a) => a.profile_id === ea.artist_profile_id)?.invite_message ?? null,
          })),
        });
      }
    }

    // 既存アーティストへのメッセージ送信（会話スレッドが既にある場合）
    const existingWithMsg = artistList.filter(
      (a) => currentIds.has(a.profile_id) && a.invite_message?.trim()
    );
    if (existingWithMsg.length > 0) {
      try {
        const admin = createAdminClient();
        for (const a of existingWithMsg) {
          const { data: ea } = await admin
            .from("event_artists")
            .select("event_artist_id")
            .eq("event_id", eventId)
            .eq("artist_profile_id", a.profile_id)
            .is("deleted_at", null)
            .single();
          if (!ea) continue;
          const { data: conv } = await admin
            .from("conversations")
            .select("conversation_id")
            .eq("event_artist_id", ea.event_artist_id)
            .maybeSingle();
          if (!conv) continue;
          await admin.from("messages").insert({
            conversation_id: conv.conversation_id,
            sender_profile_id: user.id,
            body: a.invite_message!.trim(),
            message_type: "text",
          });
        }
      } catch { /* 非致死的 */ }
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
  if (await isProxyDraftHiddenFrom(createAdminClient(), eventId, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["draft", "review_requested"].includes(event.lifecycle_status)) {
    return NextResponse.json({ error: "承認前のイベントのみ削除できます" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
