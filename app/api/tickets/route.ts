/**
 * GET /api/tickets
 * 自分のチケット一覧（メールアドレス or profile_id で照合）
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email");

  const admin = createAdminClient();
  let profileId: string | null = null;

  // ログイン済みの場合は profile_id を取得
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) profileId = user.id;
  } catch {
    // 未ログインは無視
  }

  if (!profileId && !email) {
    return NextResponse.json({ tickets: [] });
  }

  let query = admin
    .from("tickets")
    .select(`
      ticket_id, ticket_code, status, checked_in_at, email, created_at,
      product:products(name, payment_type, min_amount),
      event:events(event_id, title, venue, start_at)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (profileId) {
    query = query.eq("holder_profile_id", profileId);
  } else if (email) {
    query = query.eq("email", email);
  }

  const { data: tickets } = await query;

  return NextResponse.json({ tickets: tickets ?? [] });
}
