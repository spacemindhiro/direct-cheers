import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

const ALLOWED_ROLES = ["organizer", "agent", "admin"];

export async function POST() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const email = authUser.user?.email;
  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com";

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: "リンクの生成に失敗しました" }, { status: 500 });
  }

  const token = randomBytes(5).toString("base64url"); // 7文字の URL-safe トークン
  const { error: insertError } = await admin
    .from("scanner_qr_tokens")
    .insert({
      token,
      action_link: data.properties.action_link,
      created_by: user.id,
    });

  if (insertError) {
    return NextResponse.json({ error: "トークン保存に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ url: `${siteUrl}/auth/qr/${token}` });
}
