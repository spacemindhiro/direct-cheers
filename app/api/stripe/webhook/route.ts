import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseReceipt } from "@/lib/email/purchase-receipt";
import { getFeeConfig } from "@/lib/fee-config";
import { broadcastCheerNew } from "@/lib/realtime-broadcast";

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

  // ──────────────────────────────────────────────────────────
  // イベント ID レベルの冪等性チェック
  // どのイベントタイプでも Stripe は二重配信することがある。
  // 処理済み event.id が来たら即 200 を返してリトライを止める。
  // ──────────────────────────────────────────────────────────
  const { data: alreadyProcessed } = await admin
    .from("webhook_processed_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (alreadyProcessed) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {

      // ──────────────────────────────────────────────────────
      // Stripe Connect オンボーディング完了
      // ──────────────────────────────────────────────────────
      case "account.updated": {
        const account = event.data.object as Stripe.Account;

        if (account.charges_enabled) {
          await admin
            .from("profiles")
            .update({ status: "pending_terms" })
            .eq("stripe_connect_id", account.id)
            .eq("status", "pending_onboarding");
        }

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

          if (isRestricted && !targetProfile.stripe_restricted) {
            const due = account.requirements?.currently_due ?? [];
            await admin.from("notifications").insert({
              profile_id: targetProfile.profile_id,
              type: "stripe_restricted",
              title: "Stripeから追加情報の提出が求められています",
              body: `口座機能に制限がかかっています。Stripeダッシュボードで確認・対応してください。${due.length > 0 ? `（必要項目: ${due.join(", ")}）` : ""}`,
              metadata: { stripe_account_id: account.id, currently_due: due },
            });
          }

          if (!isRestricted && targetProfile.stripe_restricted) {
            await admin.from("notifications").insert({
              profile_id: targetProfile.profile_id,
              type: "stripe_restriction_lifted",
              title: "Stripeの機能制限が解除されました",
              body: "口座機能が回復しました。",
              metadata: { stripe_account_id: account.id },
            });
          }
        }
        break;
      }

      // ──────────────────────────────────────────────────────
      // チャージバック（紛争）通知
      // handle_chargeback RPC が DB レベルの冪等チェック込み
      // ──────────────────────────────────────────────────────
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (!chargeId) break;

        const charge = await stripe.charges.retrieve(chargeId);
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent as Stripe.PaymentIntent)?.id ?? null;

        if (!paymentIntentId) break;

        const { data: tx } = await admin
          .from("transactions")
          .select("transaction_id, total_gross_amount")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle();

        if (!tx) break;

        const { data: dists } = await admin
          .from("transaction_distributions")
          .select("profile_id")
          .eq("transaction_id", tx.transaction_id)
          .eq("distribution_status", "accrued");

        const primaryProfileId = (dists ?? [])[0]?.profile_id ?? null;

        const { error: chargebackErr } = await admin.rpc("handle_chargeback", {
          p_transaction_id:     tx.transaction_id,
          p_claim_amount:       tx.total_gross_amount ?? 0,
          p_stripe_dispute_fee: 1500,
          p_dispute_id:         dispute.id,
          p_primary_profile_id: primaryProfileId,
        });

        if (chargebackErr) throw chargebackErr;

        console.log(`[webhook] chargeback: dispute=${dispute.id} tx=${tx.transaction_id}`);
        break;
      }

      // ──────────────────────────────────────────────────────
      // Cheers 決済完了（/api/pay/complete が先行処理するが
      // フロントが死んだ場合のフォールバック）
      // complete_cheers_payment RPC が ON CONFLICT DO NOTHING で二重書き込みを防ぐ
      // ──────────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.payment_status !== "paid") break;

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

        const paymentMethod = (session.payment_method_types?.[0] === "paypay") ? "paypay" : "card";
        const gross = session.amount_total ?? 0;
        const wFeeConfig = await getFeeConfig();
        const wStripeFee = Math.floor(gross * (paymentMethod === "paypay" ? wFeeConfig.paypay_rate : wFeeConfig.stripe_rate));
        const wPlatformFee = Math.floor(gross * wFeeConfig.platform_rate);

        // qr_config からイベント・エージェント情報を取得
        let wEventId: string | null = null;
        let wAgentId: string | null = null;
        let wAgentFee = 0;
        if (meta.qr_config_id) {
          const { data: qrc } = await admin
            .from("qr_configs")
            .select("event_id, event:events!event_id(agent_id, distribution_configs(agent_fee_rate))")
            .eq("qr_config_id", meta.qr_config_id)
            .maybeSingle();
          wEventId = qrc?.event_id ?? null;
          const ev = qrc?.event as any;
          wAgentId = ev?.agent_id ?? null;
          if (wAgentId) {
            const agentFeeRate = Number((ev?.distribution_configs as any[])?.[0]?.agent_fee_rate ?? wFeeConfig.agent_fee_rate);
            wAgentFee = Math.floor((gross - wStripeFee) * agentFeeRate);
          }
        }

        // provisional_users + transactions をアトミックに書き込む
        // ON CONFLICT DO NOTHING → 空セット = /api/pay/complete 処理済み
        const { data: rpcRows, error: rpcErr } = await admin.rpc("complete_cheers_payment", {
          p_stripe_payment_intent_id: session.payment_intent as string,
          p_product_id:               meta.product_id || null,
          p_qr_config_id:             meta.qr_config_id || null,
          p_email:                    email ?? null,
          p_stripe_customer_id:       stripeCustomerId,
          p_gross:                    gross,
          p_stripe_fee:               wStripeFee,
          p_platform_fee:             wPlatformFee,
          p_net_amount:               gross - wStripeFee - wPlatformFee,
          p_payment_method:           paymentMethod,
          p_sender_name:              meta.nickname || null,
          p_sender_comment:           meta.comment || null,
          p_event_id:                 wEventId,
          p_agent_id:                 wAgentId,
          p_agent_fee:                wAgentFee,
        });

        if (rpcErr) throw rpcErr;

        const rows = rpcRows as any[] | null;
        if (!rows || rows.length === 0) break; // 処理済み（/api/pay/complete が先に書いた）

        const newTxId: string = rows[0].out_transaction_id;

        // QR 子機画面へブロードキャスト（fire-and-forget）
        if (meta.qr_config_id) {
          (async () => {
            const { data: qrc } = await admin
              .from("qr_configs")
              .select("event_id")
              .eq("qr_config_id", meta.qr_config_id)
              .maybeSingle();
            if (qrc?.event_id) broadcastCheerNew(qrc.event_id, gross).catch(() => {});
          })().catch(() => {});
        }

        // 購入確認メール（fire-and-forget）
        if (email) {
          (async () => {
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
            await sendPurchaseReceipt({
              to: email,
              amount: gross,
              recipientName,
              eventTitle,
              transactionId: newTxId,
            });
          })().catch((err) => console.error("[webhook] メール送信失敗:", err));
        }
        break;
      }

      default:
        break;
    }

    // 処理成功 → event.id を記録（次回同一 ID が来たら即 200 を返す）
    // 競合（同時二重配信）は無視してよい（先勝ち）
    (async () => {
      await admin
        .from("webhook_processed_events")
        .insert({ stripe_event_id: event.id, event_type: event.type });
    })().catch(() => {});

    return NextResponse.json({ received: true });

  } catch (err: any) {
    const errMsg: string = err?.message ?? String(err);
    console.error(`[webhook] ERROR event=${event.type} stripe_event=${event.id}:`, errMsg);

    // ロールバック証跡を別トランザクションで記録（ベストエフォート）
    // 注意: ここでは webhook_processed_events には記録しない → Stripe がリトライする
    (async () => {
      await admin.from("webhook_failure_logs").insert({
        stripe_event_id:   event.id,
        event_type:        event.type,
        payment_intent_id: extractPaymentIntentId(event),
        amount_jpy:        extractAmount(event),
        error_detail:      errMsg,
      });
    })().catch(() => {});

    // 500 を返して Stripe にリトライさせる
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

function extractPaymentIntentId(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  if (typeof obj?.payment_intent === "string") return obj.payment_intent;
  if (typeof obj?.payment_intent?.id === "string") return obj.payment_intent.id;
  return null;
}

function extractAmount(event: Stripe.Event): number | null {
  const obj = event.data.object as any;
  return obj?.amount_total ?? obj?.amount ?? null;
}
