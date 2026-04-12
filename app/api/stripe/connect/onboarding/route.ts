import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com").replace(/\/$/, "");

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, stripe_connect_id, display_name")
    .eq("profile_id", user.id)
    .single();

  if (!profile || !["artist", "organizer", "agent"].includes(profile.role)) {
    return NextResponse.json({ error: "Artist, organizer or agent only" }, { status: 403 });
  }

  const admin = createAdminClient();
  let connectId = profile.stripe_connect_id;

  // Stripe Connect アカウントがなければ作成
  if (!connectId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "JP",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
      metadata: {
        profile_id: user.id,
        display_name: profile.display_name ?? "",
      },
    });

    connectId = account.id;

    await admin
      .from("profiles")
      .update({ stripe_connect_id: connectId })
      .eq("profile_id", user.id);
  }

  // オンボーディングリンクを発行
  const accountLink = await stripe.accountLinks.create({
    account: connectId,
    refresh_url: `${SITE_URL}/dashboard/profile/connect-return?refresh=1`,
    return_url: `${SITE_URL}/dashboard/profile/connect-return?success=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
