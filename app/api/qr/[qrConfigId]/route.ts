import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getQRWithPermission(qrConfigId: string, userId: string) {
  const supabase = await createClient();

  const { data: qr } = await supabase
    .from("qr_configs")
    .select("qr_config_id, event_id, creator_profile_id")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) return { qr: null, supabase, error: "Not found" };

  const { data: event } = await supabase
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", qr.event_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", userId)
    .single();

  const isOrganizer = event?.organizer_profile_id === userId;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event?.agent_id === userId;

  if (!isOrganizer && !isAgent) return { qr: null, supabase, error: "Forbidden" };

  return { qr, supabase, error: null };
}

// ラベル・宛先・配分更新
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qr, supabase: sb, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Forbidden" ? 403 : 404 });

  const { label, recipient_profile_id, targets } = await req.json() as {
    label?: string;
    recipient_profile_id?: string;
    targets?: { profile_id: string; distribution_ratio: number }[];
  };

  // qr_configs 更新
  const configUpdates: Record<string, unknown> = {};
  if (label !== undefined) configUpdates.label = label || null;
  if (recipient_profile_id !== undefined) configUpdates.recipient_profile_id = recipient_profile_id;

  if (Object.keys(configUpdates).length > 0) {
    const { error: configError } = await sb
      .from("qr_configs")
      .update(configUpdates)
      .eq("qr_config_id", qrConfigId);
    if (configError) return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  // 配分先の更新（全置換）
  if (targets !== undefined) {
    if (targets.length === 0) {
      return NextResponse.json({ error: "配分先を1人以上指定してください" }, { status: 400 });
    }
    const totalRatio = targets.reduce((sum, t) => sum + t.distribution_ratio, 0);
    if (Math.abs(totalRatio - 1.0) > 0.001) {
      return NextResponse.json({ error: "配分比率の合計を100%にしてください" }, { status: 400 });
    }

    // 既存を論理削除
    await sb
      .from("qr_config_targets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("qr_config_id", qrConfigId)
      .is("deleted_at", null);

    // 新規 insert
    const rows = targets.map((t) => ({
      qr_config_id: qrConfigId,
      profile_id: t.profile_id,
      distribution_ratio: t.distribution_ratio,
    }));
    const { error: targetError } = await sb.from("qr_config_targets").insert(rows);
    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// 論理削除
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qr, supabase: sb, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Forbidden" ? 403 : 404 });

  const { error: deleteError } = await sb
    .from("qr_configs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("qr_config_id", qrConfigId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
