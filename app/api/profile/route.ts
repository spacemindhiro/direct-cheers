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

  // 変更前の値を取得（ウォレットカードの見た目に影響するフィールドの変化検出用）
  const WALLET_VISIBLE_FIELDS = [
    "display_name", "avatar_url",
    "artist_name", "organizer_name",
    "artist_avatar_url", "organizer_avatar_url",
  ] as const;

  const { data: before } = await admin
    .from("profiles")
    .select(WALLET_VISIBLE_FIELDS.join(", "))
    .eq("profile_id", user.id)
    .single();

  const { error } = await admin
    .from("profiles")
    .update(updates)
    .eq("profile_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ウォレットカードに表示されるいずれかのフィールドが変わった場合のみpush
  // （名前だけ・画像だけの変更でもカード文言が変わるため、display_name/avatar_urlだけでなく
  // organizer_name/artist_name/organizer_avatar_url/artist_avatar_urlも対象に含める）
  const walletFieldChanged = WALLET_VISIBLE_FIELDS.some(
    (field) => field in updates && updates[field] !== (before as any)?.[field],
  );

  if (walletFieldChanged) {
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
