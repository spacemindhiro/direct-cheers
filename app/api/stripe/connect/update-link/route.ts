import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com").replace(/\/$/, "");

// POST /api/stripe/connect/update-link
//
// 既にStripe Connect登録済み（verified/pending含む）のユーザーが、
// 銀行口座・本人確認情報を変更するためのリンクを発行する。
// account_onboarding（新規登録ウィザード）ではなく account_update
// （既存アカウントの編集用）を使うことで、初回登録の長い導線を
// 繰り返させずに直接編集画面へ案内する。
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: me } = await supabase
      .from("profiles")
      .select("role, stripe_connect_id")
      .eq("profile_id", user.id)
      .single();

    if (!me || !["artist", "organizer", "agent"].includes(me.role)) {
      return NextResponse.json({ error: "Artist, organizer or agent only" }, { status: 403 });
    }
    if (!me.stripe_connect_id) {
      return NextResponse.json({ error: "まだ口座登録が完了していません" }, { status: 400 });
    }

    const accountLink = await stripe.accountLinks.create({
      account: me.stripe_connect_id,
      refresh_url: `${SITE_URL}/dashboard/profile/connect-return?refresh=1`,
      return_url:  `${SITE_URL}/dashboard/profile/connect-return?success=1`,
      type: "account_update",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError
      ? err.message
      : "サーバーエラーが発生しました";
    console.error("[connect/update-link]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
