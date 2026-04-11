import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgreedRoles } from "@/lib/terms-content";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("profile_id", user.id)
    .single();

  if (profile?.status !== "pending_terms") {
    return NextResponse.json({ error: "Not in pending_terms status" }, { status: 400 });
  }

  const body = await req.json();
  const { signature_data_url } = body as { signature_data_url: string };

  if (!signature_data_url || !signature_data_url.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // base64 → Buffer に変換
  const base64Data = signature_data_url.replace("data:image/png;base64,", "");
  const buffer = Buffer.from(base64Data, "base64");

  const admin = createAdminClient();

  // Storage にアップロード
  const storagePath = `signatures/${user.id}/${Date.now()}.png`;
  const { error: uploadError } = await admin.storage
    .from("signatures")
    .upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // terms_agreements に記録
  const agreedRoles = getAgreedRoles(profile.role);
  const forwardedFor = req.headers.get("x-forwarded-for");
  const userAgent = req.headers.get("user-agent");

  const { error: agreementError } = await admin
    .from("terms_agreements")
    .insert({
      profile_id: user.id,
      agreed_roles: agreedRoles,
      signature_storage_path: storagePath,
      ip_address: forwardedFor ?? null,
      user_agent: userAgent ?? null,
    });

  if (agreementError) {
    return NextResponse.json({ error: agreementError.message }, { status: 500 });
  }

  // status を pending_interview に遷移
  const { error: statusError } = await admin
    .from("profiles")
    .update({ status: "pending_interview" })
    .eq("profile_id", user.id)
    .eq("status", "pending_terms");

  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
