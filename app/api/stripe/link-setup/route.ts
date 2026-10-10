import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Stripe Link / カードの事前登録用 SetupIntent を発行する。
 *
 * 顧客（Stripe Customer）に紐づけるのはログイン中の本人のメールだけ。以前は
 * リクエストボディの email をそのまま使っていたため、他人のメールで顧客を作ったり、
 * 仮登録ユーザーの stripe_customer_id を書き換えたりできた（2026-10-11修正）。
 * 未ログインなら顧客に紐づけない SetupIntent を返す（Link 自体はStripe側で本人確認する）。
 */
export async function POST() {
  try {
    const email = (await getUser())?.email ?? undefined;

    let customerId: string | undefined;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({ email });
        customerId = customer.id;
      }

      // provisional_users に stripe_customer_id を保存（QR決済時に保存カードを出すため）
      const admin = createAdminClient();
      await admin
        .from("provisional_users")
        .upsert(
          { email, stripe_customer_id: customerId },
          { onConflict: "email", ignoreDuplicates: false }
        );
    }

    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ["card", "link"],
      usage: "off_session",
      ...(customerId ? { customer: customerId } : {}),
    });

    return NextResponse.json({ client_secret: setupIntent.client_secret });
  } catch (err: any) {
    console.error("[link-setup] Stripe error:", err?.message);
    return NextResponse.json({ error: err?.message ?? "Stripe error" }, { status: 500 });
  }
}
