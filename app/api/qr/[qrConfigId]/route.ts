import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

async function getQRWithPermission(qrConfigId: string, userId: string) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: qr } = await admin
    .from("qr_configs")
    .select("qr_config_id, event_id, creator_profile_id, recipient_profile_id")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) return { qr: null, supabase, error: "Not found" };

  const { data: event } = await admin
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
  const isRecipient = qr.recipient_profile_id === userId;

  return { qr, supabase, admin, isOrganizer, isAgent, isRecipient, error: null };
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

  const { qr, supabase: sb, isOrganizer, isAgent, isRecipient, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Not found" ? 404 : 500 });

  const canEdit = isOrganizer || isAgent;

  const {
    label,
    image_url,
    recipient_profile_id,
    targets,
    strip_image_url,
    bg_color,
    fg_color,
    label_color,
  } = await req.json() as {
    label?: string;
    image_url?: string | null;
    recipient_profile_id?: string;
    targets?: { profile_id: string; distribution_ratio: number }[];
    strip_image_url?: string | null;
    bg_color?: string;
    fg_color?: string;
    label_color?: string;
  };

  // 宛先本人は image_url / strip_image_url のみ更新可。それ以外のフィールドは organizer/agent のみ。
  if (!canEdit && !isRecipient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEdit && isRecipient) {
    if (label !== undefined || recipient_profile_id !== undefined || targets !== undefined) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // qr_configs 更新
  const configUpdates: Record<string, unknown> = {};
  if (label !== undefined) configUpdates.label = label || null;
  if (image_url !== undefined) configUpdates.image_url = image_url;
  if (strip_image_url !== undefined) configUpdates.strip_image_url = strip_image_url;
  if (bg_color !== undefined) configUpdates.bg_color = bg_color;
  if (fg_color !== undefined) configUpdates.fg_color = fg_color;
  if (label_color !== undefined) configUpdates.label_color = label_color;
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

  // 画像・配色・宛先が変わった場合、Walletパスを更新push（fire-and-forget）
  const visualChanged = image_url !== undefined || strip_image_url !== undefined ||
    bg_color !== undefined || fg_color !== undefined || label_color !== undefined ||
    recipient_profile_id !== undefined;
  if (visualChanged && Object.keys(configUpdates).length > 0) {
    (async () => {
      try {
        const a = createAdminClient();
        const { data: txs } = await a
          .from("transactions").select("transaction_id")
          .eq("qr_config_id", qrConfigId).eq("status", "completed");
        for (const tx of txs ?? []) {
          pushWalletUpdateBySerial(tx.transaction_id).catch(() => {});
        }
      } catch { /* サイレント */ }
    })();
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

  const { qr, supabase: sb, admin, isOrganizer, isAgent, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Forbidden" ? 403 : 404 });

  if (!isOrganizer && !isAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 売上が1件でもある場合は削除不可
  const { count } = await (admin ?? createAdminClient())
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("qr_config_id", qrConfigId);

  if (count && count > 0) {
    return NextResponse.json(
      { error: "このQRコードにはすでに売上があるため削除できません" },
      { status: 409 },
    );
  }

  const { error: deleteError } = await sb
    .from("qr_configs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("qr_config_id", qrConfigId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
