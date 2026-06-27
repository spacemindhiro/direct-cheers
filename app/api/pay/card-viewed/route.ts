import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { transaction_id } = await req.json() as { transaction_id?: string };
  if (!transaction_id) return NextResponse.json({ ok: false });

  const admin = createAdminClient();

  const { data: tx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("transaction_id", transaction_id)
    .maybeSingle();

  if (!tx) return NextResponse.json({ ok: false });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  admin.from("asset_access_logs").insert({
    transaction_id,
    ip_address: ip,
    user_agent: userAgent,
  }).then(() => {});

  return NextResponse.json({ ok: true });
}
