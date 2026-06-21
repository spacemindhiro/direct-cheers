import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryPendingTransfersForProfile } from "@/lib/pending-transfers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ pendingTransferId: string }> },
) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pendingTransferId } = await params;

  const { data: row } = await admin
    .from("pending_connect_transfers")
    .select("profile_id, status")
    .eq("pending_transfer_id", pendingTransferId)
    .single();

  if (!row) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  if (row.status !== "pending")
    return NextResponse.json({ error: `既に ${row.status} です` }, { status: 400 });

  // 同じプロフィールの滞留分をまとめてリトライする（個別IDだけ狙い撃ちはしない）
  const { attempted, succeeded } = await retryPendingTransfersForProfile(admin, stripe, row.profile_id);

  return NextResponse.json({ success: true, attempted, succeeded });
}
