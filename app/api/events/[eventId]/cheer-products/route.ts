import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/events/[eventId]/cheer-products?amount=500
//
// ウェルカムチア（2階）の候補選定用。このイベントの、ワンプライスかつ
// min_amount=max_amount=amountと完全一致するstandardチア商品を返す。
// 主催者がQR作成時に「2階に含める演者」を既存のチアQRから選ぶために使う。
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const isAllowed =
    profile?.role === "admin" ||
    event.organizer_profile_id === user.id ||
    event.agent_id === user.id;
  if (!isAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const amount = Number(url.searchParams.get("amount"));
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const { data: products } = await admin
    .from("products")
    .select("product_id, name, artist_id, artist:profiles!artist_id(display_name, avatar_url)")
    .eq("event_id", eventId)
    .eq("type", "standard")
    .eq("min_amount", amount)
    .eq("max_amount", amount)
    .is("deleted_at", null)
    // 他のエントランスQRが内部的に自動生成したデフォルト受取先は候補から除外する
    .eq("is_welcome_cheer_default", false);

  const candidates = (products ?? []).map((p: any) => ({
    product_id: p.product_id,
    name: p.name,
    artist_name: p.artist?.display_name ?? null,
    artist_avatar: p.artist?.avatar_url ?? null,
  }));

  return NextResponse.json({ candidates });
}
