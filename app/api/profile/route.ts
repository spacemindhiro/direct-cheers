import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updates = await req.json() as Record<string, unknown>;
  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 変更前の値を取得（display_name / avatar_url の変化検出用）
  const { data: before } = await admin
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("profile_id", user.id)
    .single();

  const { error } = await admin
    .from("profiles")
    .update(updates)
    .eq("profile_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // display_name または avatar_url が変わった場合のみウォレット push
  const nameChanged   = "display_name" in updates && updates.display_name !== before?.display_name;
  const avatarChanged = "avatar_url"   in updates && updates.avatar_url   !== before?.avatar_url;

  if (nameChanged || avatarChanged) {
    // このユーザーが recipient になっている完了済みトランザクションを全件取得
    try {
      const { data: qrConfigs } = await admin
        .from("qr_configs")
        .select("qr_config_id")
        .eq("recipient_profile_id", user.id)
        .is("deleted_at", null);

      const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
      if (qrIds.length > 0) {
        const { data: txRows } = await admin
          .from("transactions")
          .select("transaction_id")
          .in("qr_config_id", qrIds)
          .eq("status", "completed");

        const serials = (txRows ?? []).map((t) => t.transaction_id);
        // fire-and-forget
        Promise.allSettled(
          serials.map((s) =>
            pushWalletUpdateBySerial(s).catch((err) =>
              console.error("[profile/patch] wallet push failed:", s, err)
            )
          )
        ).catch(() => {});
      }
    } catch (err) {
      console.error("[profile/patch] wallet push error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
