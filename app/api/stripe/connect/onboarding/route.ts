import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStatementDescriptorPrefixes } from "@/lib/statement-descriptor";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com").replace(/\/$/, "");

function toStripeKana(str: string | null | undefined): string | undefined {
  if (!str) return undefined;
  const katakana = str.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60),
  );
  const cleaned = katakana.replace(/[^ァ-ー０-９0-9\s\-\.]/g, "").trim();
  return cleaned || undefined;
}

function toE164JP(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "+81" + digits.slice(1);
  if (digits.startsWith("81")) return "+" + digits;
  return phone;
}

// POSTボディで受け取るフォームデータ型（bank-setup から直接渡す）
type OnboardingBody = {
  business_type?: string;
  last_name?: string; first_name?: string;
  last_name_kanji?: string; first_name_kanji?: string;
  last_name_kana?: string; first_name_kana?: string;
  business_name?: string; company_name_kanji?: string; company_name_kana?: string;
  dob_year?: number; dob_month?: number; dob_day?: number;
  phone?: string;
  postal_code?: string; prefecture?: string; city?: string;
  address_town?: string; street_address?: string;
  address_kana_state?: string; address_kana_city?: string;
  address_kana_town?: string; address_kana_line1?: string;
  product_description?: string; website?: string;
  statement_descriptor_kanji?: string; statement_descriptor_kana?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ロールとconnectId だけを取得（最小SELECT）
    const { data: me } = await supabase
      .from("profiles")
      .select("role, stripe_connect_id, display_name")
      .eq("profile_id", user.id)
      .single();

    if (!me || !["artist", "organizer", "agent"].includes(me.role)) {
      return NextResponse.json({ error: "Artist, organizer or agent only" }, { status: 403 });
    }

    // POSTボディからフォームデータを取得（bank-setup から直接渡される場合）
    let body: OnboardingBody = {};
    try { body = await req.json(); } catch { /* body なし = 旧来の呼び出し */ }

    const admin = createAdminClient();
    let connectId = me.stripe_connect_id;

    // カード明細のベース表記（account-level prefix）はシステム側で "DC-" を強制する。
    // 自由文字列を直接Stripeに渡すと、動的suffixと結合した際に意味不明な明細に
    // なりチャージバックの原因になるため、ユーザー入力は「DC-」に続く名前部分の
    // 元データとしてのみ使う（最終的な文字列はbuildStatementDescriptorPrefixesが組み立てる）。
    const { prefix, prefixKana, prefixKanji } = buildStatementDescriptorPrefixes({
      asciiNameRaw: body.business_name || me.display_name,
      kanaNameRaw: body.statement_descriptor_kana,
      kanjiNameRaw: body.statement_descriptor_kanji,
    });

    if (!connectId) {
      const isCompany = body.business_type === "company";
      const websiteUrl = body.website || undefined;

      const accountParams: Stripe.AccountCreateParams = {
        type: "express",
        country: "JP",
        email: user.email,
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
        business_type: isCompany ? "company" : "individual",
        metadata: { profile_id: user.id, display_name: me.display_name ?? "" },
        business_profile: {
          mcc: "7929",
          url: websiteUrl,
          product_description: body.product_description ?? undefined,
        },
      };

      // ベース表記は常に "DC-" 固定prefix。non-prefix系フィールドも同値で埋めておく
      // （動的suffixを送らない決済が将来発生した場合のフォールバック用）。
      accountParams.settings = {
        payments: {
          statement_descriptor: prefix,
          statement_descriptor_prefix: prefix,
          ...(prefixKana ? {
            statement_descriptor_kana: prefixKana,
            statement_descriptor_prefix_kana: prefixKana,
          } : {}),
          ...(prefixKanji ? {
            statement_descriptor_kanji: prefixKanji,
            statement_descriptor_prefix_kanji: prefixKanji,
          } : {}),
        } as Stripe.AccountCreateParams.Settings.Payments,
      };

      if (!isCompany) {
        accountParams.individual = { email: user.email };
        if (body.first_name)       accountParams.individual.first_name       = body.first_name;
        if (body.last_name)        accountParams.individual.last_name        = body.last_name;
        if (body.first_name_kanji) accountParams.individual.first_name_kanji = body.first_name_kanji;
        if (body.last_name_kanji)  accountParams.individual.last_name_kanji  = body.last_name_kanji;
        const fnKana = toStripeKana(body.first_name_kana);
        const lnKana = toStripeKana(body.last_name_kana);
        if (fnKana) accountParams.individual.first_name_kana = fnKana;
        if (lnKana) accountParams.individual.last_name_kana  = lnKana;
        if (body.phone)            accountParams.individual.phone = toE164JP(body.phone);
        if (body.dob_year && body.dob_month && body.dob_day) {
          accountParams.individual.dob = { year: body.dob_year, month: body.dob_month, day: body.dob_day };
        }
        if (body.postal_code || body.city || body.street_address) {
          accountParams.individual.address = {
            country: "JP",
            postal_code: body.postal_code ?? undefined,
            state:       body.prefecture   ?? undefined,
            city:        body.city         ?? undefined,
            line1:       body.street_address ?? undefined,
          };
        }
        if (body.prefecture || body.city || body.address_town || body.street_address) {
          accountParams.individual.address_kanji = {
            country: "JP",
            postal_code: body.postal_code    ?? undefined,
            state:       body.prefecture     ?? undefined,
            city:        body.city           ?? undefined,
            town:        body.address_town   ?? undefined,
            line1:       body.street_address ?? undefined,
          };
        }
        const ks = toStripeKana(body.address_kana_state);
        const kc = toStripeKana(body.address_kana_city);
        const kt = toStripeKana(body.address_kana_town);
        const kl = toStripeKana(body.address_kana_line1);
        if (ks || kc || kt || kl) {
          accountParams.individual.address_kana = {
            country: "JP", postal_code: body.postal_code ?? undefined,
            state: ks, city: kc, town: kt, line1: kl,
          };
        }
      } else {
        accountParams.company = {};
        if (body.business_name)      accountParams.company.name        = body.business_name;
        if (body.company_name_kanji) accountParams.company.name_kanji  = body.company_name_kanji;
        const coKana = toStripeKana(body.company_name_kana);
        if (coKana) accountParams.company.name_kana = coKana;
        if (body.phone) accountParams.company.phone = toE164JP(body.phone);
        if (body.postal_code || body.city || body.street_address) {
          accountParams.company.address = {
            country: "JP",
            postal_code: body.postal_code    ?? undefined,
            state:       body.prefecture     ?? undefined,
            city:        body.city           ?? undefined,
            line1:       body.street_address ?? undefined,
          };
        }
        if (body.prefecture || body.city || body.address_town || body.street_address) {
          accountParams.company.address_kanji = {
            country: "JP",
            postal_code: body.postal_code    ?? undefined,
            state:       body.prefecture     ?? undefined,
            city:        body.city           ?? undefined,
            town:        body.address_town   ?? undefined,
            line1:       body.street_address ?? undefined,
          };
        }
        const cs = toStripeKana(body.address_kana_state);
        const cc = toStripeKana(body.address_kana_city);
        const ckt = toStripeKana(body.address_kana_town);
        const cl = toStripeKana(body.address_kana_line1);
        if (cs || cc || ckt || cl) {
          accountParams.company.address_kana = {
            country: "JP", postal_code: body.postal_code ?? undefined,
            state: cs, city: cc, town: ckt, line1: cl,
          };
        }
      }

      // stripe.accounts.create は先行必須（connectId が必要）
      const account = await stripe.accounts.create(accountParams);
      connectId = account.id;

      // DB保存と accountLinks 生成を並列実行
      const socialLinks = body.website ? { website: body.website } : undefined;
      const [, accountLink] = await Promise.all([
        admin.from("profiles").update({
          stripe_connect_id: connectId,
          ...(Object.keys(body).length > 0 ? {
            business_type:               body.business_type              ?? null,
            last_name:                   body.last_name                  ?? null,
            first_name:                  body.first_name                 ?? null,
            last_name_kanji:             body.last_name_kanji            ?? null,
            first_name_kanji:            body.first_name_kanji           ?? null,
            last_name_kana:              body.last_name_kana             ?? null,
            first_name_kana:             body.first_name_kana            ?? null,
            business_name:               body.business_name              ?? null,
            company_name_kanji:          body.company_name_kanji         ?? null,
            company_name_kana:           body.company_name_kana          ?? null,
            dob_year:                    body.dob_year                   ?? null,
            dob_month:                   body.dob_month                  ?? null,
            dob_day:                     body.dob_day                    ?? null,
            phone:                       body.phone                      ?? null,
            postal_code:                 body.postal_code                ?? null,
            prefecture:                  body.prefecture                 ?? null,
            city:                        body.city                       ?? null,
            address_town:                body.address_town               ?? null,
            street_address:              body.street_address             ?? null,
            address_kana_state:          body.address_kana_state         ?? null,
            address_kana_city:           body.address_kana_city          ?? null,
            address_kana_town:           body.address_kana_town          ?? null,
            address_kana_line1:          body.address_kana_line1         ?? null,
            product_description:         body.product_description        ?? null,
            statement_descriptor_kanji:  body.statement_descriptor_kanji ?? null,
            statement_descriptor_kana:   body.statement_descriptor_kana  ?? null,
            ...(socialLinks ? { social_links: socialLinks } : {}),
          } : {}),
        }).eq("profile_id", user.id),
        stripe.accountLinks.create({
          account: connectId,
          refresh_url: `${SITE_URL}/dashboard/profile/connect-return?refresh=1`,
          return_url:  `${SITE_URL}/dashboard/profile/connect-return?success=1`,
          type: "account_onboarding",
        }),
      ]);

      return NextResponse.json({ url: accountLink.url });
    }

    // 既存connectId がある場合：DB更新・Stripeアカウント設定の再送・accountLinks 生成を並列
    // ベース表記（prefix）は再送するたびに最新の名前から再構築する
    // （初回作成時にしか反映されていなかった既存の不備を修正）。
    const socialLinks = body.website ? { website: body.website } : undefined;
    const [, , accountLink] = await Promise.all([
      Object.keys(body).length > 0
        ? admin.from("profiles").update({
            business_type:               body.business_type              ?? null,
            last_name:                   body.last_name                  ?? null,
            first_name:                  body.first_name                 ?? null,
            last_name_kanji:             body.last_name_kanji            ?? null,
            first_name_kanji:            body.first_name_kanji           ?? null,
            last_name_kana:              body.last_name_kana             ?? null,
            first_name_kana:             body.first_name_kana            ?? null,
            business_name:               body.business_name              ?? null,
            company_name_kanji:          body.company_name_kanji         ?? null,
            company_name_kana:           body.company_name_kana          ?? null,
            dob_year:                    body.dob_year                   ?? null,
            dob_month:                   body.dob_month                  ?? null,
            dob_day:                     body.dob_day                    ?? null,
            phone:                       body.phone                      ?? null,
            postal_code:                 body.postal_code                ?? null,
            prefecture:                  body.prefecture                 ?? null,
            city:                        body.city                       ?? null,
            address_town:                body.address_town               ?? null,
            street_address:              body.street_address             ?? null,
            address_kana_state:          body.address_kana_state         ?? null,
            address_kana_city:           body.address_kana_city          ?? null,
            address_kana_town:           body.address_kana_town          ?? null,
            address_kana_line1:          body.address_kana_line1         ?? null,
            product_description:         body.product_description        ?? null,
            statement_descriptor_kanji:  body.statement_descriptor_kanji ?? null,
            statement_descriptor_kana:   body.statement_descriptor_kana  ?? null,
            ...(socialLinks ? { social_links: socialLinks } : {}),
          }).eq("profile_id", user.id)
        : Promise.resolve(null),
      stripe.accounts.update(connectId, {
        settings: {
          payments: {
            statement_descriptor: prefix,
            statement_descriptor_prefix: prefix,
            ...(prefixKana ? {
              statement_descriptor_kana: prefixKana,
              statement_descriptor_prefix_kana: prefixKana,
            } : {}),
            ...(prefixKanji ? {
              statement_descriptor_kanji: prefixKanji,
              statement_descriptor_prefix_kanji: prefixKanji,
            } : {}),
          } as Stripe.AccountUpdateParams.Settings.Payments,
        },
      }),
      stripe.accountLinks.create({
        account: connectId,
        refresh_url: `${SITE_URL}/dashboard/profile/connect-return?refresh=1`,
        return_url:  `${SITE_URL}/dashboard/profile/connect-return?success=1`,
        type: "account_onboarding",
      }),
    ]);

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError
      ? err.message
      : "サーバーエラーが発生しました";
    console.error("[connect/onboarding]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
