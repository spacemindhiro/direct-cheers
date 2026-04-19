import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com").replace(/\/$/, "");

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select(`
        role, stripe_connect_id, display_name,
        first_name, last_name, phone,
        dob_year, dob_month, dob_day,
        postal_code, prefecture, city, street_address,
        business_type, business_name
      `)
      .eq("profile_id", user.id)
      .single();

    if (!profile || !["artist", "organizer", "agent"].includes(profile.role)) {
      return NextResponse.json({ error: "Artist, organizer or agent only" }, { status: 403 });
    }

    const admin = createAdminClient();
    let connectId = profile.stripe_connect_id;

    if (!connectId) {
      const isCompany = profile.business_type === "company";

      const accountParams: Stripe.AccountCreateParams = {
        type: "express",
        country: "JP",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        business_type: isCompany ? "company" : "individual",
        metadata: { profile_id: user.id, display_name: profile.display_name ?? "" },
      };

      if (!isCompany) {
        accountParams.individual = {};
        if (profile.first_name) accountParams.individual.first_name = profile.first_name;
        if (profile.last_name)  accountParams.individual.last_name  = profile.last_name;
        if (profile.phone)      accountParams.individual.phone      = profile.phone;
        if (profile.dob_year && profile.dob_month && profile.dob_day) {
          accountParams.individual.dob = {
            year:  profile.dob_year,
            month: profile.dob_month,
            day:   profile.dob_day,
          };
        }
        if (profile.postal_code || profile.city || profile.street_address) {
          accountParams.individual.address = {
            country:     "JP",
            postal_code: profile.postal_code ?? undefined,
            state:       profile.prefecture ?? undefined,
            city:        profile.city ?? undefined,
            line1:       profile.street_address ?? undefined,
          };
        }
      } else {
        accountParams.company = {};
        if (profile.business_name) accountParams.company.name = profile.business_name;
        if (profile.phone)         accountParams.company.phone = profile.phone;
        if (profile.postal_code || profile.city || profile.street_address) {
          accountParams.company.address = {
            country:     "JP",
            postal_code: profile.postal_code ?? undefined,
            state:       profile.prefecture ?? undefined,
            city:        profile.city ?? undefined,
            line1:       profile.street_address ?? undefined,
          };
        }
      }

      const account = await stripe.accounts.create(accountParams);
      connectId = account.id;

      await admin
        .from("profiles")
        .update({ stripe_connect_id: connectId })
        .eq("profile_id", user.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account: connectId,
      refresh_url: `${SITE_URL}/dashboard/profile/connect-return?refresh=1`,
      return_url:  `${SITE_URL}/dashboard/profile/connect-return?success=1`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError
      ? err.message
      : "サーバーエラーが発生しました";
    console.error("[connect/onboarding]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
