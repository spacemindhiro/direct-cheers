import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// オーガナイザーが中止申請
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("event_id, organizer_profile_id, agent_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const isOrganizer = event.organizer_profile_id === user.id;
  const isAdmin = profile?.role === "admin";

  if (!isOrganizer && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cancellableStatuses = ["draft", "review_requested", "published", "ongoing"];
  if (!cancellableStatuses.includes(event.lifecycle_status)) {
    return NextResponse.json({ error: "このステータスのイベントは中止申請できません" }, { status: 400 });
  }

  // 承認前（draft/review_requested）はエージェント不要で即中止
  const isDraft = ["draft", "review_requested"].includes(event.lifecycle_status);
  const newStatus = isDraft ? "cancelled" : "cancellation_requested";

  const { error } = await supabase
    .from("events")
    .update({ lifecycle_status: newStatus })
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, immediate: isDraft });
}

// エージェントが中止を承認または却下
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["agent", "admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("event_id, agent_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (profile?.role === "agent" && event.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (event.lifecycle_status !== "cancellation_requested") {
    return NextResponse.json({ error: "中止申請中ではありません" }, { status: 400 });
  }

  const { approve } = await req.json() as { approve: boolean };

  const newStatus = approve ? "cancelled" : "published";

  const { data: eventDetail, error } = await supabase
    .from("events")
    .update({ lifecycle_status: newStatus })
    .eq("event_id", eventId)
    .select("title, organizer_profile_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();

  // 中止承認時: オーソリ済み PaymentIntent を void
  if (approve) {
    const paymentIntentIds: string[] = [];

    // チアーズ決済: qr_configs 経由
    const { data: qrConfigs } = await admin
      .from("qr_configs")
      .select("qr_config_id")
      .eq("event_id", eventId)
      .is("deleted_at", null);
    if (qrConfigs && qrConfigs.length > 0) {
      const qrIds = qrConfigs.map((q) => q.qr_config_id);
      const { data: qrTxs } = await admin
        .from("transactions")
        .select("stripe_payment_intent_id")
        .in("qr_config_id", qrIds)
        .eq("status", "completed")
        .not("stripe_payment_intent_id", "is", null);
      for (const tx of qrTxs ?? []) {
        if (tx.stripe_payment_intent_id) paymentIntentIds.push(tx.stripe_payment_intent_id);
      }
    }

    // 入場チケット決済: tickets 経由（Type A / C）
    const { data: tickets } = await admin
      .from("tickets")
      .select("transaction_id")
      .eq("event_id", eventId)
      .not("transaction_id", "is", null);
    if (tickets && tickets.length > 0) {
      const txIds = tickets.map((t) => t.transaction_id as string);
      const { data: entranceTxs } = await admin
        .from("transactions")
        .select("stripe_payment_intent_id")
        .in("transaction_id", txIds)
        .eq("status", "completed")
        .not("stripe_payment_intent_id", "is", null);
      for (const tx of entranceTxs ?? []) {
        if (tx.stripe_payment_intent_id) paymentIntentIds.push(tx.stripe_payment_intent_id);
      }
    }

    // 重複除去してvoid（既にキャプチャ済みはスキップ）
    const uniqueIds = [...new Set(paymentIntentIds)];
    for (const piId of uniqueIds) {
      try {
        await stripe.paymentIntents.cancel(piId);
      } catch (err: any) {
        // already captured / already cancelled は無視
        if (!err.message?.includes("already been captured") && !err.message?.includes("already canceled")) {
          console.error(`[cancel] void failed for ${piId}:`, err.message);
        }
      }
    }
  }

  try {
    await admin.from("notifications").insert({
      profile_id: eventDetail.organizer_profile_id,
      type: approve ? "event_cancelled" : "event_cancel_rejected",
      title: approve ? "イベントの中止が承認されました" : "イベントの中止申請が却下されました",
      body: approve
        ? `「${eventDetail.title}」の中止がエージェントに承認されました。`
        : `「${eventDetail.title}」の中止申請が却下され、公開に戻りました。`,
      metadata: { event_id: eventId },
    });
  } catch { /* 通知失敗はサイレントに */ }

  return NextResponse.json({ ok: true });
}
