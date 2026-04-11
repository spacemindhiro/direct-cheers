import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    // Stripe Connect オンボーディング完了
    case "account.updated": {
      const account = event.data.object as Stripe.Account;

      // charges_enabled になったタイミングで pending_terms へ
      if (account.charges_enabled) {
        const { error } = await admin
          .from("profiles")
          .update({ status: "pending_terms" })
          .eq("stripe_connect_id", account.id)
          .eq("status", "pending_onboarding"); // 二重遷移防止

        if (error) {
          console.error("[webhook] profile update failed:", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      break;
    }

    // チャージバック（紛争）通知 → 残高凍結 + debt_claim 作成
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      if (!chargeId) break;

      // charge → payment_intent を取得
      const charge = await stripe.charges.retrieve(chargeId);
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent as Stripe.PaymentIntent)?.id ?? null;

      if (!paymentIntentId) break;

      // transaction を検索
      const { data: tx } = await admin
        .from("transactions")
        .select("transaction_id, qr_config_id, total_gross_amount")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (!tx) break;

      // 関連する distributions を取得してプロファイル特定
      const { data: dists } = await admin
        .from("transaction_distributions")
        .select("transaction_distribution_id, profile_id")
        .eq("transaction_id", tx.transaction_id)
        .eq("distribution_status", "accrued");

      const affectedProfileIds = [...new Set((dists ?? []).map((d) => d.profile_id))];

      // distributions を凍結
      if ((dists ?? []).length > 0) {
        await admin
          .from("transaction_distributions")
          .update({ is_frozen: true })
          .eq("transaction_id", tx.transaction_id);
      }

      // profiles の balance_frozen + chargeback_count を更新
      for (const profileId of affectedProfileIds) {
        await admin
          .from("profiles")
          .update({
            balance_frozen: true,
            balance_frozen_at: new Date().toISOString(),
          })
          .eq("profile_id", profileId);

        await admin.rpc("increment_chargeback_count", { target_profile_id: profileId });
      }

      // debt_claim を作成（紛争手数料 Stripe は $15 ≒ ¥2000 程度、一旦 1500 固定）
      await admin.from("debt_claims").insert({
        profile_id: affectedProfileIds[0] ?? null,
        original_transaction_id: tx.transaction_id,
        claim_amount: tx.total_gross_amount ?? 0,
        stripe_dispute_fee: 1500,
        recovered_amount: 0,
        status: "active",
        description: `Stripe dispute: ${dispute.id}`,
      });

      console.log(`[webhook] chargeback: dispute=${dispute.id} tx=${tx.transaction_id} profiles=${affectedProfileIds.join(",")}`);
      break;
    }

    // Cheers 決済完了（冪等処理）
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // すでに /api/pay/complete で処理済みの場合は何もしない
      const { data: existing } = await admin
        .from("transactions")
        .select("transaction_id")
        .eq("stripe_payment_intent_id", session.payment_intent as string)
        .maybeSingle();

      if (!existing && session.payment_status === "paid") {
        const meta = session.metadata ?? {};
        const email =
          session.customer_email ??
          (typeof session.customer === "object" && session.customer !== null
            ? (session.customer as Stripe.Customer).email
            : null);

        const stripeCustomerId =
          typeof session.customer === "string"
            ? session.customer
            : (session.customer as Stripe.Customer)?.id ?? null;

        // provisional_user upsert
        let provisionalProfileId: string | null = null;
        if (email) {
          const { data: provisional } = await admin
            .from("provisional_users")
            .upsert(
              { email, stripe_customer_id: stripeCustomerId },
              { onConflict: "email" }
            )
            .select("provisional_id, profile_id")
            .single();
          provisionalProfileId = provisional?.profile_id ?? null;
        }

        await admin.from("transactions").insert({
          stripe_payment_intent_id: session.payment_intent as string,
          product_id: meta.product_id || null,
          qr_config_id: meta.qr_config_id || null,
          sender_profile_id: provisionalProfileId,
          sender_name: meta.nickname || null,
          sender_comment: meta.comment || null,
          status: "completed",
          total_gross_amount: session.amount_total ?? 0,
          stripe_funds_status: "held_in_platform",
        });
      }
      break;
    }

    default:
      // 未処理イベントは無視
      break;
  }

  return NextResponse.json({ received: true });
}
