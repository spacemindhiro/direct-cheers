import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProfileIdByEmail } from "@/lib/resolve-profile";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ exists: false });

  const admin = createAdminClient();
  const profileId = await resolveProfileIdByEmail(admin, email);
  return NextResponse.json({ exists: !!profileId });
}
