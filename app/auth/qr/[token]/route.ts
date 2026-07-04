import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scanner_qr_tokens")
    .select("action_link, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.redirect(
      new URL("/auth/error?error=qr_invalid", process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com")
    );
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.redirect(
      new URL("/auth/error?error=otp_expired", process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com")
    );
  }

  return NextResponse.redirect(data.action_link);
}
