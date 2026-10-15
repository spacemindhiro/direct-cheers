import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, responsible_agent_id")
    .eq("profile_id", user.id)
    .single();

  // ロールは上位互換（agent/adminはorganizerの業務も行える）のため、organizer以上を許可
  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Organizer only" }, { status: 403 });
  }
  if (profile?.status !== "active") {
    return NextResponse.json({ error: "Account not active" }, { status: 403 });
  }
  // organizerは担当agentの監督が必須。agent/adminは自分自身が監督者となるため不要
  // （承認時はapprove/route.tsのセルフ承認ガードにより本人ではなくadminのみ承認可能になる）
  if (profile?.role === "organizer" && !profile?.responsible_agent_id) {
    return NextResponse.json({ error: "No agent assigned" }, { status: 400 });
  }

  const body = await req.json();
  const { title, venue, venue_id, start_at, end_at, artists, artist_ids, serial_scope, organizer_profile_id } = body as {
    title: string;
    venue: string;
    venue_id?: string | null;
    start_at: string;
    end_at: string;
    artists?: { profile_id: string; invite_message?: string | null }[];
    artist_ids?: string[]; // 旧フォーマット後方互換
    serial_scope?: "event" | "artist";
    organizer_profile_id?: string | null; // 代理作成：エージェント/adminが主催者名義で作る場合の主催者
  };

  // 代理作成：担当エージェント（またはadmin）が主催者名義で下書きを作る。
  // 審査申請は主催者本人のみ（request-review）なので、主催者の同意ステップはそのまま残る
  const isProxy = !!organizer_profile_id && organizer_profile_id !== user.id;
  let organizerId = user.id;
  let eventAgentId = profile?.role === "organizer" ? profile.responsible_agent_id : user.id;
  if (isProxy) {
    if (!["agent", "admin"].includes(profile?.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: target } = await createAdminClient()
      .from("profiles")
      .select("role, status, responsible_agent_id")
      .eq("profile_id", organizer_profile_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!target || target.role !== "organizer" || target.status !== "active" || !target.responsible_agent_id) {
      return NextResponse.json({ error: "代理作成できない主催者です" }, { status: 400 });
    }
    // エージェントは自分が担当する主催者のみ
    if (profile?.role === "agent" && target.responsible_agent_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    organizerId = organizer_profile_id;
    eventAgentId = target.responsible_agent_id;
  }

  // 新フォーマット（artists[]）と旧フォーマット（artist_ids[]）の両方をサポート。
  // 代理作成では依頼メッセージを主催者名義で送ることになるため受け付けない
  const artistList = (artists ?? (artist_ids ?? []).map((id) => ({ profile_id: id, invite_message: null as string | null })))
    .map((a) => (isProxy ? { ...a, invite_message: null } : a));

  if (!title || !venue || !start_at || !end_at) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // イベント作成
  const { data: event, error: eventError } = await createAdminClient()
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
    })
    .select("event_id")
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
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
    const { error: artistError } = await createAdminClient()
      .from("event_artists")
      .insert(artistRows);
    if (artistError) {
      return NextResponse.json({ error: artistError.message }, { status: 500 });
    }
    // 出演依頼（スレッド・通知・メール）は下書きの間は送らない。
    // 主催者が承認依頼を送った時点で request-review がまとめて送る（lib/lineup-invite.ts）
  }

  // 代理作成では主催者にはまだ何も送らない。エージェントが下書きを整えてから
  // /api/events/[eventId]/proxy-notify で主催者に確認を依頼する

  // フォロワー通知（new_event / artist_appearing）はエージェント承認時に送る

  return NextResponse.json({ event_id: event.event_id });
}
