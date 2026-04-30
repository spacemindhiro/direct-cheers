import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // イベント取得＋権限確認
  const { data: event } = await admin
    .from("events")
    .select("event_id, organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent = event.agent_id === user.id;

  if (!isAdmin && !isOrganizer && !isAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { qr_config_id, email, name } = await req.json() as {
    qr_config_id: string;
    email: string;
    name?: string;
  };

  if (!qr_config_id || !email) {
    return NextResponse.json({ error: "qr_config_id と email は必須です" }, { status: 400 });
  }

  // QR config がこのイベントに属するか確認
  const { data: qrConfig } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("qr_config_id", qr_config_id)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .single();

  if (!qrConfig) return NextResponse.json({ error: "QR config not found" }, { status: 404 });

  // 既存トランザクション数（sequence番号用）
  const { count } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("qr_config_id", qr_config_id);

  const sequence = (count ?? 0) + 1;

  // provisional_users に登録（未登録なら作成）
  const { data: existing } = await admin
    .from("provisional_users")
    .select("provisional_id, profile_id")
    .eq("email", email)
    .maybeSingle();

  let senderProfileId: string | null = existing?.profile_id ?? null;

  if (!existing) {
    // auth.users にいるか確認
    const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users.find(u => u.email === email);
    if (authUser) {
      senderProfileId = authUser.id;
    } else {
      // provisional_user を新規作成
      await admin.from("provisional_users").insert({ email });
    }
  }

  // 招待トランザクション作成
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .insert({
      qr_config_id,
      sender_profile_id: senderProfileId,
      sender_email: email,
      sender_name: name ?? null,
      transaction_type: "invitation",
      total_gross_amount: 0,
      cumulative_amount_at_tx: 0,
      sequence_number_in_event: sequence,
      status: "completed",
      stripe_funds_status: "transferred",
    })
    .select("transaction_id")
    .single();

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  // nft_serial_number をtransaction_idで設定
  await admin
    .from("transactions")
    .update({ nft_serial_number: tx.transaction_id })
    .eq("transaction_id", tx.transaction_id);

  return NextResponse.json({ ok: true, transaction_id: tx.transaction_id });
}
