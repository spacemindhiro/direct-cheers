import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com").replace(/\/$/, "");

function toE164JP(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "+81" + digits.slice(1);
  if (digits.startsWith("81")) return "+" + digits;
  return phone;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select(`
        role, stripe_connect_id, display_name, social_links,
        first_name, last_name, first_name_kanji, last_name_kanji, first_name_kana, last_name_kana,
        phone, dob_year, dob_month, dob_day,
        postal_code, prefecture, city, address_town, street_address,
        address_kana_state, address_kana_city, address_kana_town, address_kana_line1,
        business_type, business_name, company_name_kanji, company_name_kana,
        product_description, statement_descriptor_kanji, statement_descriptor_kana
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

      const websiteUrl: string | undefined = (profile.social_links as Record<string, string> | null)?.website || undefined;

      const accountParams: Stripe.AccountCreateParams = {
        type: "express",
        country: "JP",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        business_type: isCompany ? "company" : "individual",
        metadata: { profile_id: user.id, display_name: profile.display_name ?? "" },
        business_profile: {
          mcc: "7929",
          url: websiteUrl,
          product_description: profile.product_description ?? undefined,
        },
      };

      if (profile.statement_descriptor_kanji || profile.statement_descriptor_kana) {
        accountParams.settings = { payments: {} };
        if (profile.statement_descriptor_kanji)
          (accountParams.settings.payments as Record<string, string>).statement_descriptor_kanji = profile.statement_descriptor_kanji;
        if (profile.statement_descriptor_kana)
          (accountParams.settings.payments as Record<string, string>).statement_descriptor_kana = profile.statement_descriptor_kana;
      }

      if (!isCompany) {
        accountParams.individual = {
          email: user.email,
        };
        if (profile.first_name)       accountParams.individual.first_name       = profile.first_name;
        if (profile.last_name)        accountParams.individual.last_name        = profile.last_name;
        if (profile.first_name_kanji) accountParams.individual.first_name_kanji = profile.first_name_kanji;
        if (profile.last_name_kanji)  accountParams.individual.last_name_kanji  = profile.last_name_kanji;
        if (profile.first_name_kana)  accountParams.individual.first_name_kana  = profile.first_name_kana;
        if (profile.last_name_kana)   accountParams.individual.last_name_kana   = profile.last_name_kana;
        if (profile.phone)            accountParams.individual.phone            = toE164JP(profile.phone);
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
        if (profile.prefecture || profile.city || profile.address_town || profile.street_address) {
          accountParams.individual.address_kanji = {
            country:     "JP",
            postal_code: profile.postal_code ?? undefined,
            state:       profile.prefecture ?? undefined,
            city:        profile.city ?? undefined,
            town:        profile.address_town ?? undefined,
            line1:       profile.street_address ?? undefined,
          };
        }
        if (profile.address_kana_state || profile.address_kana_city || profile.address_kana_town || profile.address_kana_line1) {
          accountParams.individual.address_kana = {
            country:     "JP",
            postal_code: profile.postal_code ?? undefined,
            state:       profile.address_kana_state ?? undefined,
            city:        profile.address_kana_city ?? undefined,
            town:        profile.address_kana_town ?? undefined,
            line1:       profile.address_kana_line1 ?? undefined,
          };
        }
      } else {
        accountParams.company = {};
        if (profile.business_name)    accountParams.company.name       = profile.business_name;
        if (profile.company_name_kanji) accountParams.company.name_kanji = profile.company_name_kanji;
        if (profile.company_name_kana)  accountParams.company.name_kana  = profile.company_name_kana;
        if (profile.phone)            accountParams.company.phone      = toE164JP(profile.phone);
        if (profile.postal_code || profile.city || profile.street_address) {
          accountParams.company.address = {
            country:     "JP",
            postal_code: profile.postal_code ?? undefined,
            state:       profile.prefecture ?? undefined,
            city:        profile.city ?? undefined,
            line1:       profile.street_address ?? undefined,
          };
        }
        if (profile.prefecture || profile.city || profile.address_town || profile.street_address) {
          accountParams.company.address_kanji = {
            country:     "JP",
            postal_code: profile.postal_code ?? undefined,
            state:       profile.prefecture ?? undefined,
            city:        profile.city ?? undefined,
            town:        profile.address_town ?? undefined,
            line1:       profile.street_address ?? undefined,
          };
        }
        if (profile.address_kana_state || profile.address_kana_city || profile.address_kana_town || profile.address_kana_line1) {
          accountParams.company.address_kana = {
            country:     "JP",
            postal_code: profile.postal_code ?? undefined,
            state:       profile.address_kana_state ?? undefined,
            city:        profile.address_kana_city ?? undefined,
            town:        profile.address_kana_town ?? undefined,
            line1:       profile.address_kana_line1 ?? undefined,
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
