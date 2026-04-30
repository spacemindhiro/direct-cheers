import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ exists: false });

  const admin = createAdminClient();
  const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const exists = users.some(u => u.email?.toLowerCase() === email);

  return NextResponse.json({ exists });
}
