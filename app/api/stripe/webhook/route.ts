import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseReceipt } from "@/lib/email/purchase-receipt";
import { getFeeConfig } from "@/lib/fee-config";

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
        await admin
          .from("profiles")
          .update({ status: "pending_terms" })
          .eq("stripe_connect_id", account.id)
          .eq("status", "pending_onboarding");
      }

      // 機能制限の検出・解除
      const isRestricted = !account.charges_enabled || !account.payouts_enabled;
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("profile_id, display_name, stripe_restricted")
        .eq("stripe_connect_id", account.id)
        .maybeSingle();

      if (targetProfile) {
        await admin
          .from("profiles")
          .update({ stripe_restricted: isRestricted })
          .eq("profile_id", targetProfile.profile_id);

        // 新たに制限がかかった場合のみ本人に通知
        if (isRestricted && !targetProfile.stripe_restricted) {
          const due = account.requirements?.currently_due ?? [];
          try {
            await admin.from("notifications").insert({
              profile_id: targetProfile.profile_id,
              type: "stripe_restricted",
              title: "Stripeから追加情報の提出が求められています",
              body: `口座機能に制限がかかっています。Stripeダッシュボードで確認・対応してください。${due.length > 0 ? `（必要項目: ${due.join(", ")}）` : ""}`,
              metadata: { stripe_account_id: account.id, currently_due: due },
            });
          } catch { /* notifications テーブルがなければスキップ */ }
          console.log(`[webhook] stripe_restricted: account=${account.id} profile=${targetProfile.profile_id} due=${due.join(",")}`);
        }

        // 制限が解除された場合も通知
        if (!isRestricted && targetProfile.stripe_restricted) {
          try {
            await admin.from("notifications").insert({
              profile_id: targetProfile.profile_id,
              type: "stripe_restriction_lifted",
              title: "Stripeの機能制限が解除されました",
              body: "口座機能が回復しました。",
              metadata: { stripe_account_id: account.id },
            });
          } catch { /* スキップ */ }
          console.log(`[webhook] stripe_restriction_lifted: account=${account.id} profile=${targetProfile.profile_id}`);
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

        const paymentMethod = (session.payment_method_types?.[0] === "paypay") ? "paypay" : "card";
        const gross = session.amount_total ?? 0;
        const wFeeConfig = await getFeeConfig();
        const wStripeFee = Math.floor(gross * (paymentMethod === "paypay" ? wFeeConfig.paypay_rate : wFeeConfig.stripe_rate));
        const wPlatformFee = Math.floor(gross * wFeeConfig.platform_rate);

        const { data: newTx } = await admin.from("transactions").insert({
          stripe_payment_intent_id: session.payment_intent as string,
          product_id: meta.product_id || null,
          qr_config_id: meta.qr_config_id || null,
          sender_profile_id: provisionalProfileId,
          sender_name: meta.nickname || null,
          sender_comment: meta.comment || null,
          status: "completed",
          total_gross_amount: gross,
          stripe_funds_status: "held_in_platform",
          payment_method: paymentMethod,
          stripe_fee: wStripeFee,
          platform_fee: wPlatformFee,
          net_amount: gross - wStripeFee - wPlatformFee,
        }).select("transaction_id").single();

        // 購入確認メール（fire-and-forget）
        if (email && newTx) {
          let recipientName: string | null = null;
          let eventTitle: string | null = null;
          if (meta.qr_config_id) {
            const { data: qrc } = await admin
              .from("qr_configs")
              .select("recipient_profile_id, event:events!event_id(title)")
              .eq("qr_config_id", meta.qr_config_id)
              .single();
            eventTitle = (qrc?.event as any)?.title ?? null;
            if (qrc?.recipient_profile_id) {
              const { data: rp } = await admin
                .from("profiles")
                .select("display_name")
                .eq("profile_id", qrc.recipient_profile_id)
                .single();
              recipientName = rp?.display_name ?? null;
            }
          }
          sendPurchaseReceipt({
            to: email,
            amount: session.amount_total ?? 0,
            recipientName,
            eventTitle,
            transactionId: newTx.transaction_id,
          }).catch((err) => console.error("[webhook] メール送信失敗:", err));
        }
      }
      break;
    }

    default:
      // 未処理イベントは無視
      break;
  }

  return NextResponse.json({ received: true });
}
