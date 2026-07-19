import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function resolveContext(qrConfigId: string, userId: string) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: qr } = await admin
    .from("qr_configs")
    .select("qr_config_id, event_id, product_id")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();
  if (!qr) return { error: "Not found" as const, status: 404 as const };

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

  const canEdit =
    profile?.role === "admin" ||
    event?.organizer_profile_id === userId ||
    (profile?.role === "agent" && event?.agent_id === userId);
  if (!canEdit) return { error: "Forbidden" as const, status: 403 as const };

  const { data: product } = await admin
    .from("products")
    .select("product_id, welcome_cheer_amount, welcome_cheer_default_product_id")
    .eq("product_id", qr.product_id)
    .maybeSingle();
  if (!product?.welcome_cheer_amount) {
    return { error: "この商品はウェルカムチアが設定されていません" as const, status: 400 as const };
  }

  return { admin, qr, product, error: null };
}

// GET: 現在の候補一覧・選択可能な既存チアQR一覧を返す
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qrConfigId } = await params;
  const ctx = await resolveContext(qrConfigId, user.id);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, qr, product } = ctx;

  const [{ data: eligibleRows }, { data: candidateProducts }] = await Promise.all([
    admin
      .from("welcome_cheer_eligible_products")
      .select("cheer_product_id")
      .eq("entrance_product_id", product.product_id),
    admin
      .from("products")
      .select("product_id, name, artist_id, artist:profiles!artist_id(display_name, avatar_url)")
      .eq("event_id", qr.event_id)
      .eq("type", "standard")
      .eq("min_amount", product.welcome_cheer_amount)
      .eq("max_amount", product.welcome_cheer_amount)
      .is("deleted_at", null)
      .eq("is_welcome_cheer_default", false),
  ]);

  // デフォルト受取先（主催者宛の内部バケツ）は常時暗黙に候補集合へ含まれる、
  // 編集不可の存在。このエディタでは主催者が明示的に足した演者候補だけを
  // 見せる・触らせるため、一覧からは除外する。
  // また、他QRの削除等で商品が対象条件を満たさなくなった不整合行（過去の
  // 移行期に紛れ込んだゴミ等）も、候補一覧に無い＝チェックボックスで
  // 外しようがなくなるため、ここで見せない（PATCH側でも自動整理される）。
  const candidateIdSet = new Set((candidateProducts ?? []).map((p: any) => p.product_id));
  const eligibleIds = (eligibleRows ?? [])
    .map((r) => r.cheer_product_id)
    .filter((id) => id !== product.welcome_cheer_default_product_id)
    .filter((id) => candidateIdSet.has(id));

  return NextResponse.json({
    welcome_cheer_amount: product.welcome_cheer_amount,
    eligible_product_ids: eligibleIds,
    candidates: (candidateProducts ?? []).map((p: any) => ({
      product_id: p.product_id,
      name: p.name,
      artist_name: p.artist?.display_name ?? null,
      artist_avatar: p.artist?.avatar_url ?? null,
    })),
  });
}

// PATCH: 候補一覧を全置換する
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qrConfigId } = await params;
  const ctx = await resolveContext(qrConfigId, user.id);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, qr, product } = ctx;

  const { product_ids } = await req.json() as { product_ids?: string[] };
  const requestedIds = Array.isArray(product_ids) ? [...new Set(product_ids)] : [];
  const requestedSet = new Set(requestedIds);

  const [{ data: currentRows }, { data: validCandidates }] = await Promise.all([
    admin
      .from("welcome_cheer_eligible_products")
      .select("cheer_product_id")
      .eq("entrance_product_id", product.product_id),
    admin
      .from("products")
      .select("product_id")
      .eq("event_id", qr.event_id)
      .eq("type", "standard")
      .eq("min_amount", product.welcome_cheer_amount)
      .eq("max_amount", product.welcome_cheer_amount)
      .is("deleted_at", null)
      .eq("is_welcome_cheer_default", false),
  ]);
  const currentIds = new Set((currentRows ?? []).map((r) => r.cheer_product_id));
  const validCandidateIds = new Set((validCandidates ?? []).map((p) => p.product_id));

  // 新規追加分（既存行に無いもの）のみ対象条件を検証する。
  // 既存行はここでは再検証しない代わりに、下のtoRemove計算で
  // 「もはや対象条件を満たさなくなったもの（他QR削除等で商品が消えた等）」を
  // 自動的に取り除く。こうしないと、一度紛れ込んだ不整合行がUI上では
  // 選択チェックボックスとして表示されない（=外しようがない）まま残り続け、
  // 以後の保存が毎回この行のせいで400になり続けてしまう。
  const toAdd = requestedIds.filter((id) => !currentIds.has(id));
  if (toAdd.length > 0 && !toAdd.every((id) => validCandidateIds.has(id))) {
    return NextResponse.json({ error: "選択された商品の一部が対象条件を満たしていません" }, { status: 400 });
  }

  // デフォルト受取先の候補行はこのエディタの管理対象外（常に残す）
  const toRemove = [...currentIds]
    .filter((id) => id !== product.welcome_cheer_default_product_id)
    .filter((id) => !requestedSet.has(id) || !validCandidateIds.has(id));

  if (toRemove.length > 0) {
    const { error: removeError } = await admin
      .from("welcome_cheer_eligible_products")
      .delete()
      .eq("entrance_product_id", product.product_id)
      .in("cheer_product_id", toRemove);
    if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 });
  }
  if (toAdd.length > 0) {
    const { error: addError } = await admin
      .from("welcome_cheer_eligible_products")
      .insert(toAdd.map((cheerProductId) => ({
        entrance_product_id: product.product_id,
        cheer_product_id: cheerProductId,
      })));
    if (addError) return NextResponse.json({ error: addError.message }, { status: 500 });
  }

  const finalIds = requestedIds.filter((id) => validCandidateIds.has(id));
  return NextResponse.json({ ok: true, eligible_product_ids: finalIds });
}
