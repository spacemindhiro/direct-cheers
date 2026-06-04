import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

async function canManage(admin: ReturnType<typeof createAdminClient>, eventId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();
  if (!data) return false;
  if (data.organizer_profile_id === userId || data.agent_id === userId) return true;
  const { data: p } = await admin.from("profiles").select("role").eq("profile_id", userId).single();
  return p?.role === "admin";
}

// スケジュール一覧取得（子機側からも呼ばれる）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, eventId, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("display_schedules")
    .select(`
      schedule_id, qr_config_id, start_at, end_at, label, sort_order,
      qr_config:qr_configs!qr_config_id(
        qr_config_id, label, image_url,
        product:products!product_id(name, type, artist:profiles!artist_id(display_name))
      )
    `)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("start_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// スケジュール作成
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, eventId, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { qr_config_id, start_at, end_at, label } = body;

  if (!start_at || !end_at) {
    return NextResponse.json({ error: "start_at と end_at は必須です" }, { status: 400 });
  }
  if (new Date(end_at) <= new Date(start_at)) {
    return NextResponse.json({ error: "end_at は start_at より後にしてください" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("display_schedules")
    .insert({ event_id: eventId, qr_config_id: qr_config_id ?? null, start_at, end_at, label: label ?? null })
    .select("schedule_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// スケジュール削除（soft delete）
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, eventId, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("schedule_id");
  if (!scheduleId) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });

  const { error } = await admin
    .from("display_schedules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("schedule_id", scheduleId)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
