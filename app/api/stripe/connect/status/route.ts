import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceToReviewPendingIfNeeded } from "@/lib/connect-review";

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

  const detailsSubmitted = !!account.details_submitted;
  const stripeReady =
    !!account.charges_enabled &&
    !!account.payouts_enabled &&
    detailsSubmitted;

  const admin = createAdminClient();

  // details_submitted になった時点でpendingに遷移する。
  // charges_enabled / payouts_enabled はStripe側の審査完了後に立つため、
  // フォーム送信直後はfalseのままになりuserがunverifiedに見えてしまう。
  if (detailsSubmitted) {
    const { notified } = await advanceToReviewPendingIfNeeded(admin, user.id);
    if (notified) {
      return NextResponse.json({ stripe_status: "approved", details_submitted: true, platform_status: "pending" });
    }
  }

  return NextResponse.json({
    stripe_status: stripeReady ? "approved" : "pending",
    details_submitted: detailsSubmitted,
    platform_status: profile.verification_status,
    requirements: account.requirements?.currently_due ?? [],
  });
}
