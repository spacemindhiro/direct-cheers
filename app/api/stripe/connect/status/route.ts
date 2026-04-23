import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_id, verification_status, role")
    .eq("profile_id", user.id)
    .single();

  if (!profile?.stripe_connect_id) {
    return NextResponse.json({ stripe_status: "not_started" });
  }

  const account = await stripe.accounts.retrieve(profile.stripe_connect_id);

  const stripeReady =
    account.charges_enabled &&
    account.payouts_enabled &&
    account.details_submitted;

  const admin = createAdminClient();

  if (stripeReady && (profile.verification_status === "unverified" || profile.verification_status === "rejected")) {
    // Stripe審査通過 → プラットフォーム審査待ちに更新
    await admin
      .from("profiles")
      .update({ verification_status: "pending" })
      .eq("profile_id", user.id);

    const { data: fullProfile } = await admin
      .from("profiles")
      .select("role, responsible_agent_id, display_name")
      .eq("profile_id", user.id)
      .single();

    // 通知先: ロールにかかわらず常に admin（オーナー）のみ
    // 口座付与の最終権限はオーナーが持つ
    const { data: admins } = await admin
      .from("profiles")
      .select("profile_id")
      .eq("role", "admin")
      .eq("status", "active")
      .limit(1);
    const notifyProfileId: string | null = admins?.[0]?.profile_id ?? null;

    if (notifyProfileId) {
      const roleLabel = fullProfile?.role === "agent" ? "エージェント" :
                        fullProfile?.role === "organizer" ? "オーガナイザー" : "アーティスト";
      try {
        await admin.from("notifications").insert({
          profile_id: notifyProfileId,
          type: "connect_review_request",
          title: "Stripe審査完了 — 口座開設審査待ち",
          body: `${fullProfile?.display_name ?? roleLabel} がStripe審査を通過しました。口座開設審査を行ってください。`,
          metadata: { subject_profile_id: user.id, subject_role: fullProfile?.role },
        });
      } catch { /* notifications テーブルがなければスキップ */ }
    }

    return NextResponse.json({ stripe_status: "approved", platform_status: "pending" });
  }

  return NextResponse.json({
    stripe_status: stripeReady ? "approved" : "pending",
    platform_status: profile.verification_status,
    requirements: account.requirements?.currently_due ?? [],
  });
}
