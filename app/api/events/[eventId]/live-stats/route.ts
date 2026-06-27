import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { resolveStatementDescriptorSource } from "@/lib/statement-descriptor";

const PAGE_SIZE = 50;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const role = profile?.role ?? "fan";

  const { data: event } = await admin
    .from("events")
    .select("event_id, title, organizer_profile_id, start_at, end_at, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = role === "admin";
  const isOrganizer = role === "organizer" && event.organizer_profile_id === user.id;
  const isAgent = role === "agent";

  let isArtist = false;
  if (role === "artist") {
    const { data: ea } = await admin
      .from("event_artists")
      .select("artist_profile_id")
      .eq("event_id", eventId)
      .eq("artist_profile_id", user.id)
      .maybeSingle();
    isArtist = !!ea;
  }

  if (!isAdmin && !isOrganizer && !isAgent && !isArtist) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const feeConfig = await getFeeConfig();
  const { stripe_rate: STRIPE_RATE, platform_rate: PLATFORM_RATE, net_rate: NET_RATE, paypay_rate: PAYPAY_RATE, paypay_net_rate: PAYPAY_NET_RATE } = feeConfig;

  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id, recipient_profile_id, recipient_name_context, recipient:profiles!recipient_profile_id(display_name, artist_name, organizer_name)")
    .eq("event_id", eventId)
    .is("deleted_at", null);

  const qrConfigIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
  // 主催者がDJ等を兼任している場合、recipient_name_contextで「主催者名義/演者名義」の
  // どちらで受け取ったかを区別する（statement_descriptorの解決と同じビジネスルールを再利用）。
  const qrRecipientMap = new Map<string, string | null>(
    (qrConfigs ?? []).map((q) => {
      const recipient = q.recipient as any;
      const resolved = resolveStatementDescriptorSource({
        isEntrance: false,
        recipientNameContext: ((q as any).recipient_name_context as "organizer" | "artist" | undefined) ?? "artist",
        organizerName: recipient?.organizer_name,
        artistName: recipient?.artist_name,
        recipientDisplayName: recipient?.display_name,
      });
      return [q.qr_config_id, resolved ?? recipient?.display_name ?? null];
    })
  );
  const qrCanReadMessageSet = new Set<string>(
    isAdmin || isAgent || isOrganizer
      ? qrConfigIds
      : (qrConfigs ?? [])
          .filter((q) => (q as any).recipient_profile_id === user.id)
          .map((q) => q.qr_config_id)
  );

  if (qrConfigIds.length === 0) {
    return NextResponse.json({
      total_gross: 0,
      transaction_count: 0,
      total_stripe_fee: 0,
      total_card_fee: 0,
      total_paypay_fee: 0,
      total_platform_fee: 0,
      total_net: 0,
      my_projected_net: 0,
      my_distribution_ratio: null,
      last_transaction_at: null,
      lifecycle_status: event.lifecycle_status,
      is_live: event.lifecycle_status === "ongoing",
      show_gross: isAdmin || isOrganizer || isAgent,
      distributions: [],
      stripe_rate: STRIPE_RATE,
      platform_rate: PLATFORM_RATE,
      net_rate: NET_RATE,
      paypay_rate: PAYPAY_RATE,
      paypay_net_rate: PAYPAY_NET_RATE,
      recent_transactions: [],
    });
  }

  // 明細取得（保存値をそのまま集計するためのソース）
  const { data: transactions } = await admin
    .from("transactions")
    .select("transaction_id, total_gross_amount, stripe_fee, platform_fee, net_amount, created_at, qr_config_id, sender_name, sender_comment, payment_method, product:products!product_id(type)")
    .in("qr_config_id", qrConfigIds)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const txList = transactions ?? [];
  const txIds = txList.map((t) => t.transaction_id);

  // 保存値を足し算だけで集計（再計算禁止）
  const totalGross = txList.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);
  const totalStripeFee = txList.reduce((s, t) => s + (t.stripe_fee ?? 0), 0);
  const totalCardFee = txList.filter((t) => (t.payment_method ?? "card") !== "paypay").reduce((s, t) => s + (t.stripe_fee ?? 0), 0);
  const totalPaypayFee = txList.filter((t) => t.payment_method === "paypay").reduce((s, t) => s + (t.stripe_fee ?? 0), 0);
  const totalPlatformFee = txList.reduce((s, t) => s + (t.platform_fee ?? 0), 0);
  const totalNet = txList.reduce((s, t) => s + (t.net_amount ?? 0), 0);
  const lastTransactionAt = txList[0]?.created_at ?? null;

  // 配分明細を取得（書き込み時に確定済みの actual_amount を集計するだけ）
  type DistRow = { transaction_id: string; profile_id: string; actual_amount: number; distribution_role: string };
  let distRows: DistRow[] = [];
  if (txIds.length > 0) {
    const { data: dr } = await admin
      .from("transaction_distributions")
      .select("transaction_id, profile_id, actual_amount, distribution_role")
      .in("transaction_id", txIds)
      .is("deleted_at", null);
    distRows = (dr ?? []).map((r) => ({
      transaction_id: r.transaction_id,
      profile_id: r.profile_id,
      actual_amount: r.actual_amount ?? 0,
      distribution_role: r.distribution_role,
    }));
  }

  // transaction_id → 自分の actual_amount マップ（my_net_amount 表示用）
  const myDistByTx = new Map<string, number>(
    distRows
      .filter((r) => r.profile_id === user.id)
      .map((r) => [r.transaction_id, r.actual_amount])
  );

  // 全配分先の内訳（admin / organizer / agent 向け）
  // organizer / artist 行のみ集計（agent は my_projected_net で別表示）
  let distributions: { profile_id: string; display_name: string | null; role: string; projected_net: number; ratio: number }[] = [];

  if (isAdmin || isOrganizer || isAgent) {
    const recipientRows = distRows.filter((r) => r.distribution_role === "organizer" || r.distribution_role === "artist");

    if (recipientRows.length > 0) {
      const profileIds = [...new Set(recipientRows.map((r) => r.profile_id))];
      const { data: profilesData } = await admin
        .from("profiles")
        .select("profile_id, display_name, role")
        .in("profile_id", profileIds);
      const profileMap = new Map((profilesData ?? []).map((p) => [p.profile_id, p]));

      const distMap = new Map<string, { display_name: string | null; role: string; projected_net: number }>();
      for (const r of recipientRows) {
        const e = distMap.get(r.profile_id) ?? {
          display_name: profileMap.get(r.profile_id)?.display_name ?? null,
          role: profileMap.get(r.profile_id)?.role ?? r.distribution_role,
          projected_net: 0,
        };
        e.projected_net += r.actual_amount;
        distMap.set(r.profile_id, e);
      }

      distributions = Array.from(distMap.entries()).map(([profile_id, d]) => ({
        profile_id,
        display_name: d.display_name,
        role: d.role,
        projected_net: d.projected_net,
        ratio: totalNet > 0 ? d.projected_net / totalNet : 0,
      })).sort((a, b) => b.projected_net - a.projected_net);
    }
  }

  // 自分の着金予定額
  let myProjectedNet = 0;
  let myDistributionRatio: number | null = null;

  if (isAdmin) {
    myProjectedNet = totalNet;
  } else {
    myProjectedNet = distRows
      .filter((r) => r.profile_id === user.id)
      .reduce((s, r) => s + r.actual_amount, 0);
    if (totalNet > 0 && myProjectedNet > 0) {
      myDistributionRatio = myProjectedNet / totalNet;
    }
  }

  // アーティストは自分の配分行がある明細のみ表示
  const filteredTxList = isArtist
    ? txList.filter((tx) => myDistByTx.has(tx.transaction_id))
    : txList;

  const totalPages = Math.max(1, Math.ceil(filteredTxList.length / PAGE_SIZE));
  const pagedTxList = filteredTxList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const recentTransactions = pagedTxList.map((tx) => ({
    transaction_id: tx.transaction_id,
    total_gross_amount: tx.total_gross_amount ?? 0,
    created_at: tx.created_at,
    sender_name: tx.sender_name ?? null,
    sender_comment: qrCanReadMessageSet.has(tx.qr_config_id) ? (tx.sender_comment ?? null) : null,
    product_type: (tx.product as any)?.type ?? null,
    recipient_name: qrRecipientMap.get(tx.qr_config_id) ?? null,
    my_net_amount: myDistByTx.get(tx.transaction_id) ?? null,
  }));

  // messageタイプで宛先本人が閲覧したメッセージをログ（チャージバック対策）
  if (!isAdmin && !isOrganizer && !isAgent) {
    const viewedMessageTxIds = recentTransactions
      .filter((t) => t.product_type === "message" && t.sender_comment != null)
      .map((t) => t.transaction_id);
    if (viewedMessageTxIds.length > 0) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip")
        ?? null;
      const userAgent = req.headers.get("user-agent") ?? null;
      admin.from("asset_access_logs").insert(
        viewedMessageTxIds.map((tid) => ({ transaction_id: tid, ip_address: ip, user_agent: userAgent }))
      ).then(() => {});
    }
  }

  return NextResponse.json({
    total_gross: totalGross,
    transaction_count: txList.length,
    total_stripe_fee: totalStripeFee,
    total_card_fee: totalCardFee,
    total_paypay_fee: totalPaypayFee,
    total_platform_fee: totalPlatformFee,
    total_net: totalNet,
    my_projected_net: myProjectedNet,
    my_distribution_ratio: myDistributionRatio,
    last_transaction_at: lastTransactionAt,
    lifecycle_status: event.lifecycle_status,
    is_live: event.lifecycle_status === "ongoing",
    show_gross: isAdmin || isOrganizer || isAgent,
    distributions: isAdmin || isOrganizer || isAgent ? distributions : [],
    stripe_rate: STRIPE_RATE,
    platform_rate: PLATFORM_RATE,
    net_rate: NET_RATE,
    paypay_rate: PAYPAY_RATE,
    paypay_net_rate: PAYPAY_NET_RATE,
    recent_transactions: recentTransactions,
    current_page: page,
    total_pages: totalPages,
  });
}
