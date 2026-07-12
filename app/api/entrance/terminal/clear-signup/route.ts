import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { broadcastTouchpayClear } from "@/lib/realtime-broadcast";

// POST /api/entrance/terminal/clear-signup
// 新規客向けサインアップQRは子機側でタイマー自動消去しない仕様のため、
// スタッフが「次の決済へ」を押した時だけこのAPI経由で明示的にクリアする。
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["organizer", "admin", "agent"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { event_id } = await req.json() as { event_id: string };
  if (!event_id) {
    return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
  }

  await broadcastTouchpayClear(event_id);
  return NextResponse.json({ ok: true });
}
