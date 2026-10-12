import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

// 本人が更新してよい項目（プロフィール画面 dashboard/profile が送る項目）。
// 以前は受け取ったJSONをそのまま admin クライアントで update しており、
// role・base_fee_rate・balance_frozen・stripe_connect_id 等まで本人が書き換えられた（2026-10-13 hotfix）。
// ここに無い項目が1つでも含まれていたら、リクエスト全体を拒否して何も更新しない。
const EDITABLE_TEXT_FIELDS = [
  "display_name", "avatar_url",
  "bio", "affiliation", "credit_name", "genre", "organization_name",
  "organizer_name", "organizer_name_ascii", "organizer_avatar_url",
  "artist_name", "artist_name_ascii", "artist_avatar_url",
] as const;
const EDITABLE_FIELDS = new Set<string>([...EDITABLE_TEXT_FIELDS, "social_links"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updates = await req.json().catch(() => null) as unknown;
  if (!isPlainObject(updates) || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const forbidden = Object.keys(updates).filter((k) => !EDITABLE_FIELDS.has(k));
  if (forbidden.length > 0) {
    return NextResponse.json({ error: `更新できない項目が含まれています: ${forbidden.join(", ")}` }, { status: 400 });
  }
  for (const field of EDITABLE_TEXT_FIELDS) {
    if (field in updates && updates[field] !== null && typeof updates[field] !== "string") {
      return NextResponse.json({ error: `${field} の形式が不正です` }, { status: 400 });
    }
  }
  if ("social_links" in updates) {
    const links = updates.social_links;
    if (!isPlainObject(links) || Object.values(links).some((v) => typeof v !== "string")) {
      return NextResponse.json({ error: "social_links の形式が不正です" }, { status: 400 });
    }
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
