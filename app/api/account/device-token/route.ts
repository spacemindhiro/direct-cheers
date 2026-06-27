import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// localStorage フィンガープリント用トークンを発行
// 決済完了後に thanks ページから呼ぶ
export async function POST(req: Request) {
  const { email } = await req.json() as { email: string };

  if (!email)
    return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: provisional } = await admin
    .from("provisional_users")
    .select("provisional_id, profile_id")
    .eq("email", email)
    .maybeSingle();

  if (!provisional)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await admin
    .from("device_tokens")
    .insert({
      provisional_id: provisional.provisional_id,
      profile_id: provisional.profile_id ?? null,
    })
    .select("token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ token: data.token });
}
