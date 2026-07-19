/**
 * POST /api/entrance/checkin
 * オーガナイザーがQRスキャン → チェックイン処理
 *
 * タイプC（当日決済）はタッチ決済／QR自己決済のいずれかで決済済みの状態でしか
 * チケットが存在しないため、このルートは決済を行わずチェックインのみ行う。
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["organizer", "admin", "agent"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticket_code } = await req.json() as { ticket_code: string };
  if (!ticket_code) {
    return NextResponse.json({ error: "Missing ticket_code" }, { status: 400 });
  }

  const admin = createAdminClient();

  // チケット情報取得
  const { data: ticket } = await admin
    .from("tickets")
    .select(`
      ticket_id, ticket_code, status, email, event_id, product_id, quantity,
      reservation_id, transaction_id,
      product:products(name, type, payment_type, min_amount),
      event:events(title, venue, organizer_profile_id, agent_id)
    `)
    .eq("ticket_code", ticket_code)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ error: "TICKET_NOT_FOUND" }, { status: 404 });
  }

  const prod = ticket.product as any;
  const ev = ticket.event as any;
  const productType = prod?.type as string | undefined;
  const paymentType = prod?.payment_type as "A" | "B" | "C" | "V";
  const isVoucher = productType === "custom" && paymentType === "V";

  // バウチャー（custom/V）: 再利用不可。used/cancelled は問答無用でエラー。
  // ※ エントランスの再入場ロジック（後続の used チェック）より先に判定する。
  if (isVoucher) {
    if (ticket.status === "used") {
      return NextResponse.json({ error: "ALREADY_USED", is_voucher: true }, { status: 409 });
    }
    if (ticket.status === "cancelled") {
      return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
    }
    const { error: checkinError } = await admin.rpc("checkin_ticket", {
      p_ticket_code: ticket_code,
      p_organizer_id: user.id,
    });
    if (checkinError) {
      return NextResponse.json({ error: checkinError.message }, { status: 500 });
    }
    pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});
    return NextResponse.json({
      ok: true,
      is_voucher: true,
      ticket_id: ticket.ticket_id,
      event_title: ev?.title ?? "",
      product_name: prod?.name ?? "",
      email: ticket.email,
    });
  }

  // エントランス: used は「再入場」として通す（QRを維持しているため再スキャンが起きる）
  if (ticket.status === "used") {
    if (
      ev?.organizer_profile_id !== user.id &&
      ev?.agent_id !== user.id &&
      profile?.role !== "admin"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await admin
      .from("tickets")
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
      .eq("ticket_id", ticket.ticket_id);
    pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});
    return NextResponse.json({
      ok: true,
      re_entry: true,
      ticket_id: ticket.ticket_id,
      event_title: ev?.title ?? "",
      product_name: prod?.name ?? "",
      email: ticket.email,
      quantity: ticket.quantity,
    });
  }
  if (ticket.status === "cancelled") {
    return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
  }
  if (ticket.status === "suspended") {
    return NextResponse.json({ error: "TICKET_SUSPENDED" }, { status: 409 });
  }

  // イベントへのアクセス権チェック
  if (
    ev?.organizer_profile_id !== user.id &&
    ev?.agent_id !== user.id &&
    profile?.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // チェックイン処理（RPC）
  const { error: checkinError } = await admin.rpc("checkin_ticket", {
    p_ticket_code: ticket_code,
    p_organizer_id: user.id,
  });

  if (checkinError) {
    const msg = checkinError.message ?? "";
    if (msg.includes("TICKET_CANCELLED")) return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
    if (msg.includes("TICKET_SUSPENDED")) return NextResponse.json({ error: "TICKET_SUSPENDED" }, { status: 409 });
    return NextResponse.json({ error: checkinError.message }, { status: 500 });
  }

  // Walletパスを更新（fire-and-forget）
  pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});

  return NextResponse.json({
    ok: true,
    ticket_id: ticket.ticket_id,
    event_title: ev?.title ?? "",
    product_name: prod?.name ?? "",
    email: ticket.email,
    quantity: ticket.quantity,
  });
}
