// イベントの下書きを作る。画面の作成 API（app/api/events/create）と、チアリー(AI) の MCP の書き込みツールの両方がここを通す
// （どちらから作っても、ロール・担当エージェント・代理の範囲・出演者の資格・代理の下書きを隠す処理が同じに効くように）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidFlyerUrl } from "@/lib/image-source";
import { markProxyDraft } from "@/lib/proxy-draft";
import { findIneligiblePerformers } from "@/lib/directory";

export type CreateDraftInput = {
  title: string;
  venue: string;
  venue_id?: string | null;
  start_at: string;
  end_at: string;
  artists?: { profile_id: string; invite_message?: string | null }[];
  artist_ids?: string[]; // 旧フォーマット後方互換
  serial_scope?: "event" | "artist";
  base_flyer_url?: string | null; // 任意のフライヤー画像（/api/events/flyer/upload で上げたもの）
  organizer_profile_id?: string | null; // 代理作成：エージェント/adminが主催者名義で作る場合の主催者
};

export type CreateDraftResult = { ok: true; eventId: string } | { ok: false; status: number; error: string };

// userId は作る本人（サーバーで確かめたもの）。supabase は本人のセッションのクライアント（本人のロールはこれで読む）、
// admin は service_role のクライアント
export async function createEventDraft(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, responsible_agent_id")
    .eq("profile_id", userId)
    .single();

  // ロールは上位互換（agent/adminはorganizerの業務も行える）のため、organizer以上を許可。
  // 登録手続きの進捗（status＝口座開設等）は作成できるかどうかに関係しない
  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    return { ok: false, status: 403, error: "Organizer only" };
  }
  // organizerは担当agentの監督が必須。agent/adminは自分自身が監督者となるため不要
  // （承認時はapprove/route.tsのセルフ承認ガードにより本人ではなくadminのみ承認可能になる）
  if (profile?.role === "organizer" && !profile?.responsible_agent_id) {
    return { ok: false, status: 400, error: "No agent assigned" };
  }

  const { title, venue, venue_id, start_at, end_at, artists, artist_ids, serial_scope, base_flyer_url = null, organizer_profile_id } = input;

  // 代理作成：担当エージェント（またはadmin）が主催者名義で下書きを作る。
  // 審査申請は主催者本人のみ（request-review）なので、主催者の同意ステップはそのまま残る
  const isProxy = !!organizer_profile_id && organizer_profile_id !== userId;
  let organizerId = userId;
  let eventAgentId = profile?.role === "organizer" ? profile.responsible_agent_id : userId;
  if (isProxy) {
    if (!["agent", "admin"].includes(profile?.role ?? "")) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    const { data: target } = await admin
      .from("profiles")
      .select("role, responsible_agent_id")
      .eq("profile_id", organizer_profile_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!target || target.role !== "organizer" || !target.responsible_agent_id) {
      return { ok: false, status: 400, error: "代理作成できない主催者です" };
    }
    // エージェントは自分が担当する主催者のみ
    if (profile?.role === "agent" && target.responsible_agent_id !== userId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    organizerId = organizer_profile_id;
    eventAgentId = target.responsible_agent_id;
  }

  // 新フォーマット（artists[]）と旧フォーマット（artist_ids[]）の両方をサポート。
  // 代理作成では依頼メッセージを主催者名義で送ることになるため受け付けない
  const artistList = (artists ?? (artist_ids ?? []).map((id) => ({ profile_id: id, invite_message: null as string | null })))
    .map((a) => (isProxy ? { ...a, invite_message: null } : a));

  if (!title || !venue || !start_at || !end_at) {
    return { ok: false, status: 400, error: "Missing required fields" };
  }
  // 画面の確認（event-create-form）を通らない経路（チアリー・API の直叩き）でも、日時の前後を確かめる
  const start = Date.parse(start_at);
  const end = Date.parse(end_at);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, status: 400, error: "日時の形式が正しくありません" };
  }
  if (end <= start) {
    return { ok: false, status: 400, error: "終了日時は開始日時より後にしてください" };
  }
  // 出演者は artist/organizer/agent の実在ユーザーのみ（画面を通さず一般ユーザー・admin等を指定されるのを防ぐ）
  if ((await findIneligiblePerformers(admin, artistList.map((a) => a.profile_id))).length > 0) {
    return { ok: false, status: 400, error: "出演者に指定できないユーザーが含まれています" };
  }
  if (!isValidFlyerUrl(base_flyer_url)) {
    return { ok: false, status: 400, error: "フライヤー画像の形式が不正です" };
  }

  // イベント作成
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      organizer_profile_id: organizerId,
      agent_id: eventAgentId,
      title,
      venue,
      venue_id: venue_id || null,
      start_at,
      end_at,
      lifecycle_status: "draft",
      serial_scope: serial_scope ?? "event",
      base_flyer_url,
    })
    .select("event_id")
    .single();

  if (eventError) {
    return { ok: false, status: 500, error: eventError.message };
  }

  // アーティスト登録（全員 pending — アーティスト側の承認で confirmed に変わる）
  if (artistList.length > 0) {
    const artistRows = artistList.map((a, i) => ({
      event_id: event.event_id,
      artist_profile_id: a.profile_id,
      performance_order: i + 1,
      status: "pending",
      invite_message: a.invite_message ?? null,
    }));
    const { error: artistError } = await admin
      .from("event_artists")
      .insert(artistRows);
    if (artistError) {
      return { ok: false, status: 500, error: artistError.message };
    }
    // 出演依頼（スレッド・通知・メール）は下書きの間は送らない。
    // 主催者が承認依頼を送った時点で request-review がまとめて送る（lib/lineup-invite.ts）
  }

  // 代理作成では主催者にはまだ何も送らず、存在自体も見せない。エージェントが下書きを整えてから
  // /api/events/[eventId]/proxy-notify で主催者に確認を依頼した時点で見えるようになる。
  // 目印が付けられなければ主催者に丸見えの下書きが残るため、作成ごと取り消す
  if (isProxy) {
    try {
      await markProxyDraft(admin, { eventId: event.event_id, creatorId: userId, organizerId });
    } catch (e) {
      await admin.from("event_artists").delete().eq("event_id", event.event_id);
      await admin.from("events").delete().eq("event_id", event.event_id);
      return { ok: false, status: 500, error: `下書きの作成に失敗しました: ${(e as Error).message}` };
    }
  }

  // フォロワー通知（new_event / artist_appearing）はエージェント承認時に送る

  return { ok: true, eventId: event.event_id };
}

export type OrganizerOption = { profile_id: string; name: string };

// 代理作成で名義に選べる主催者（作成画面と同じ範囲）。エージェントは自分が担当の主催者、admin は担当エージェントのいる主催者すべて。
// organizer には代理が無いので空
export async function proxyOrganizerOptions(admin: SupabaseClient, role: string | null | undefined, userId: string): Promise<OrganizerOption[]> {
  if (role !== "agent" && role !== "admin") return [];
  let q = admin
    .from("profiles")
    .select("profile_id, display_name, organizer_name")
    .eq("role", "organizer")
    .not("responsible_agent_id", "is", null)
    .is("deleted_at", null);
  if (role === "agent") q = q.eq("responsible_agent_id", userId);
  const { data: organizers } = await q;
  return (organizers ?? [])
    .map((o) => ({ profile_id: o.profile_id as string, name: (o.organizer_name ?? o.display_name ?? "（名前未設定）") as string }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

// 名義の主催者とコネクション済みのアーティスト（作成画面の最初の一覧と同じ）。
// 相手の profiles はユーザー権限では読めない（自分の行のみ）ため admin クライアントで取り、名義の organizer_profile_id で絞る
export async function connectedArtists(admin: SupabaseClient, organizerId: string): Promise<{ profile_id: string; display_name: string }[]> {
  const { data: connections } = await admin
    .from("connections")
    .select("artist_profile_id, artist:profiles!artist_profile_id(display_name, artist_name)")
    .eq("organizer_profile_id", organizerId)
    .eq("status", "active")
    .is("deleted_at", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 埋め込みの型が配列/単体で揺れるため
  return (connections ?? []).map((c: any) => ({
    profile_id: c.artist_profile_id as string,
    display_name: (c.artist?.artist_name ?? c.artist?.display_name ?? "Unknown") as string,
  }));
}
