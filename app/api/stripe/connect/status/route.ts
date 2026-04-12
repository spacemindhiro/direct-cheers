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

  if (stripeReady && profile.verification_status === "unverified") {
    // Stripe審査通過 → プラットフォーム審査待ちに更新
    await admin
      .from("profiles")
      .update({ verification_status: "pending" })
      .eq("profile_id", user.id);

    // 担当エージェントに通知（responsible_agent_id がある場合）
    const { data: fullProfile } = await admin
      .from("profiles")
      .select("responsible_agent_id, display_name")
      .eq("profile_id", user.id)
      .single();

    if (fullProfile?.responsible_agent_id) {
      try {
        await admin.from("notifications").insert({
          profile_id: fullProfile.responsible_agent_id,
          type: "connect_review_request",
          title: "Stripe審査完了 — プラットフォーム審査待ち",
          body: `${fullProfile.display_name ?? "アーティスト"} がStripe審査を通過しました。プラットフォーム審査を行ってください。`,
          metadata: { subject_profile_id: user.id },
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
