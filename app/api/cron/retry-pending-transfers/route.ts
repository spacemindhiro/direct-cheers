/**
 * GET /api/cron/retry-pending-transfers
 *
 * Vercel Cron: "0 21 * * *" UTC (= 毎日 6:00 JST、reconcile cronの1時間後)
 *
 * account.updated webhookの配信漏れに対するセーフティネット。
 * pending_connect_transfers に積まれている滞留Transferのうち、対象プロフィールの
 * stripe_restricted が既に false（オンボーディング完了済み）になっているものを
 * 再試行する。stripe_restricted は account.updated webhook で同期済みのため、
 * Stripe APIへの追加呼び出しは発生させない。
 *
 * 認証: Authorization: Bearer $CRON_SECRET
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryPendingTransfersForProfile } from "@/lib/pending-transfers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: pendingRows } = await admin
    .from("pending_connect_transfers")
    .select("profile_id")
    .eq("status", "pending");

  const profileIds = [...new Set((pendingRows ?? []).map((r: any) => r.profile_id as string))];

  if (profileIds.length === 0) {
    console.log("[retry-pending-transfers] 滞留Transferなし");
    return NextResponse.json({ success: true, profiles: 0, attempted: 0, succeeded: 0 });
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("profile_id, stripe_restricted")
    .in("profile_id", profileIds);

  // stripe_restricted が false（オンボーディング完了済み）のプロフィールのみ対象
  const readyProfileIds = (profiles ?? [])
    .filter((p: any) => p.stripe_restricted === false)
    .map((p: any) => p.profile_id as string);

  let totalAttempted = 0;
  let totalSucceeded = 0;

  for (const profileId of readyProfileIds) {
    const { attempted, succeeded } = await retryPendingTransfersForProfile(admin, stripe, profileId);
    totalAttempted += attempted;
    totalSucceeded += succeeded;
  }

  console.log(`[retry-pending-transfers] profiles=${readyProfileIds.length} attempted=${totalAttempted} succeeded=${totalSucceeded}`);

  return NextResponse.json({
    success: true,
    profiles: readyProfileIds.length,
    attempted: totalAttempted,
    succeeded: totalSucceeded,
  });
}
