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

        const { data: allDists } = await admin
          .from("transaction_distributions")
          .select("profile_id, actual_amount, distribution_status, event_id")
          .eq("transaction_id", tx.transaction_id);

        const primaryProfileId = (allDists ?? []).find(d => d.distribution_status === "accrued")?.profile_id
          ?? (allDists ?? [])[0]?.profile_id ?? null;

        const gross = tx.total_gross_amount ?? 0;
        const cbFeeConfig = await getFeeConfig();
        const stripeProcessingFee = Math.floor(gross * cbFeeConfig.stripe_rate);
        const platformFeeHeld     = Math.floor(gross * cbFeeConfig.platform_rate);
        // MoR負担額 = Stripe決済手数料 + MoRへの純送金額（プラットフォーム手数料を除く）
        // = gross - platformFeeHeld（¥1,500紛争手数料はプラットフォームが負担）
        const claimAmount = gross - platformFeeHeld;

        const { error: chargebackErr } = await admin.rpc("handle_chargeback", {
          p_transaction_id:        tx.transaction_id,
          p_claim_amount:          claimAmount,
          p_stripe_dispute_fee:    1500,
          p_dispute_id:            dispute.id,
          p_primary_profile_id:    primaryProfileId,
          p_stripe_processing_fee: stripeProcessingFee,
          p_platform_fee_held:     platformFeeHeld,
        });

        if (chargebackErr) throw chargebackErr;

        // settle済み（paid）の受取人ごとにsettle_transfersをReversalして資金回収
        const paidDists = (allDists ?? []).filter(d => d.distribution_status === "paid");
        const reversalDetails: { profile_id: string; amount_reversed: number }[] = [];
        let totalReversed = 0;

        for (const dist of paidDists) {
          if (!dist.event_id || !dist.actual_amount) continue;

          const { data: transfers } = await admin
            .from("settle_transfers")
            .select("stripe_transfer_id")
            .eq("profile_id", dist.profile_id)
            .eq("event_id", dist.event_id)
            .order("created_at", { ascending: false });

          let remaining = dist.actual_amount;
          let reversed  = 0;

          for (const tr of transfers ?? []) {
            if (remaining <= 0) break;
            try {
              const stripeTr  = await stripe.transfers.retrieve(tr.stripe_transfer_id);
              const reversible = stripeTr.amount - stripeTr.amount_reversed;
              if (reversible <= 0) continue;
              const toReverse = Math.min(reversible, remaining);
              await stripe.transfers.createReversal(tr.stripe_transfer_id, { amount: toReverse });
              reversed  += toReverse;
              remaining -= toReverse;
            } catch (err: any) {
              console.error(`[webhook] CB reversal失敗 transfer=${tr.stripe_transfer_id}:`, err.message);
            }
          }

          if (reversed > 0) {
            reversalDetails.push({ profile_id: dist.profile_id, amount_reversed: reversed });
            totalReversed += reversed;
          }
        }

        // debt_claimに回収詳細を記録
        await admin
          .from("debt_claims")
          .update({
            recovered_via_reversal: totalReversed,
            reversal_details:       reversalDetails,
          })
          .eq("stripe_dispute_id", dispute.id);

        console.log(`[webhook] chargeback: dispute=${dispute.id} tx=${tx.transaction_id} reversed=¥${totalReversed}`);
        break;
      }

      // ──────────────────────────────────────────────────────
      // チャージバック決着（勝訴: 再Transfer＋凍結解除 / 敗訴: 確定損失記録）
      // ──────────────────────────────────────────────────────
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;

        const { data: claim } = await admin
          .from("debt_claims")
          .select("claim_id, profile_id, original_transaction_id, reversal_details, recovered_via_reversal")
          .eq("stripe_dispute_id", dispute.id)
          .maybeSingle();

        if (!claim) break;

        const isWon = dispute.status === "won";

        if (isWon) {
          // 勝訴: 引き戻した資金を各受取人に再Transfer
          for (const detail of (claim.reversal_details as { profile_id: string; amount_reversed: number }[] ?? [])) {
            if (detail.amount_reversed <= 0) continue;
            const { data: prof } = await admin
              .from("profiles")
              .select("stripe_connect_id")
              .eq("profile_id", detail.profile_id)
              .single();
            if (!prof?.stripe_connect_id) continue;
            try {
              await stripe.transfers.create({
                amount:      detail.amount_reversed,
                currency:    "jpy",
                destination: prof.stripe_connect_id,
                metadata:    { dispute_id: dispute.id, reason: "chargeback_won_reinstatement" },
              });
            } catch (err: any) {
              console.error(`[webhook] CB win 再Transfer失敗 profile=${detail.profile_id}:`, err.message);
            }
          }

          // distributions を凍結解除
          if (claim.original_transaction_id) {
            await admin
              .from("transaction_distributions")
              .update({ is_frozen: false })
              .eq("transaction_id", claim.original_transaction_id);
          }

          // 他にactive debt_claimがなければプロファイル凍結解除
          if (claim.profile_id) {
            const { count } = await admin
              .from("debt_claims")
              .select("claim_id", { count: "exact", head: true })
              .eq("profile_id", claim.profile_id)
              .eq("status", "active")
              .neq("claim_id", claim.claim_id);
            if ((count ?? 0) === 0) {
              await admin
                .from("profiles")
                .update({ balance_frozen: false, balance_frozen_at: null })
                .eq("profile_id", claim.profile_id);
            }
          }

          await admin.from("debt_claims").update({ status: "closed_won" }).eq("claim_id", claim.claim_id);
          console.log(`[webhook] CB won: dispute=${dispute.id} re-transferred=¥${claim.recovered_via_reversal}`);
        } else {
          // 敗訴: debt_claimsをactiveのままにして残債をview_withdrawable_balancesで追跡
          // recovered_amountを更新し、balance_frozenを解除して将来の収益で相殺できるようにする
          await admin
            .from("debt_claims")
            .update({ recovered_amount: claim.recovered_via_reversal ?? 0 })
            .eq("claim_id", claim.claim_id);

          // 他にactive debt_claimがなければプロファイル凍結解除
          if (claim.profile_id) {
            const { count } = await admin
              .from("debt_claims")
              .select("claim_id", { count: "exact", head: true })
              .eq("profile_id", claim.profile_id)
              .eq("status", "active")
              .neq("claim_id", claim.claim_id);
            if ((count ?? 0) === 0) {
              await admin
                .from("profiles")
                .update({ balance_frozen: false, balance_frozen_at: null })
                .eq("profile_id", claim.profile_id);
            }
          }

          console.log(`[webhook] CB lost: dispute=${dispute.id} recovered=¥${claim.recovered_via_reversal} 残債をactiveで追跡継続`);
        }

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

        // ウォレット種別（apple_pay / google_pay / link）を取得
        let wWalletType: string | null = null;
        if (paymentMethod === "card" && typeof session.payment_intent === "string") {
          try {
            const wPi = await stripe.paymentIntents.retrieve(session.payment_intent, {
              expand: ["latest_charge"],
            });
            const wCharge = wPi.latest_charge as Stripe.Charge | null;
            wWalletType = (wCharge?.payment_method_details?.card?.wallet as any)?.type ?? null;
          } catch { /* wallet_type is optional */ }
        }
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
            wAgentFee = Math.floor(wPlatformFee * (agentFeeRate / wFeeConfig.platform_rate));
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
          p_wallet_type:              wWalletType,
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
            let productType: string | null = null;
            if (meta.qr_config_id) {
              const { data: qrc } = await admin
                .from("qr_configs")
                .select("recipient_profile_id, event:events!event_id(title), product:products!product_id(type)")
                .eq("qr_config_id", meta.qr_config_id)
                .single();
              eventTitle = (qrc?.event as any)?.title ?? null;
              productType = (qrc?.product as any)?.type ?? null;
              if (qrc?.recipient_profile_id) {
                const { data: rp } = await admin
                  .from("profiles")
                  .select("display_name")
                  .eq("profile_id", qrc.recipient_profile_id)
                  .single();
                recipientName = rp?.display_name ?? null;
              }
            } else if (meta.product_id) {
              const { data: p } = await admin
                .from("products")
                .select("type, event:events!event_id(title)")
                .eq("product_id", meta.product_id)
                .single();
              productType = p?.type ?? null;
              eventTitle = (p?.event as any)?.title ?? null;
            }
            await sendPurchaseReceipt({
              to: email,
              amount: gross,
              recipientName,
              eventTitle,
              transactionId: newTxId,
              productType,
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
