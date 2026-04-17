import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
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

  // イベント取得（アクセス権確認）
  const { data: event } = await admin
    .from("events")
    .select("event_id, title, organizer_profile_id, start_at, end_at, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // アクセス権チェック
  const isAdmin = role === "admin";
  const isOrganizer = role === "organizer" && event.organizer_profile_id === user.id;
  const isAgent = role === "agent"; // エージェントは全イベント閲覧可

  // アーティストは event_artists に登録されているか確認
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

  // 手数料設定をDBから取得
  const { stripe_rate: STRIPE_RATE, platform_rate: PLATFORM_RATE, net_rate: NET_RATE } = await getFeeConfig();

  // このイベントの qr_config_ids を取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId)
    .is("deleted_at", null);

  const qrConfigIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

  if (qrConfigIds.length === 0) {
    return NextResponse.json({
      total_gross: 0,
      transaction_count: 0,
      total_stripe_fee: 0,
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
    });
  }

  // 売上集計
  const { data: transactions } = await admin
    .from("transactions")
    .select("transaction_id, total_gross_amount, created_at, qr_config_id")
    .in("qr_config_id", qrConfigIds)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const txList = transactions ?? [];
  const totalGross = txList.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);
  const totalStripeFee = Math.floor(totalGross * STRIPE_RATE);
  const totalPlatformFee = Math.floor(totalGross * PLATFORM_RATE);
  const totalNet = Math.floor(totalGross * NET_RATE);
  const lastTransactionAt = txList[0]?.created_at ?? null;

  // 自分の distribution_ratio を取得（qr_config_targets から集計）
  let myDistributionRatio: number | null = null;
  let myProjectedNet = 0;

  if (!isAdmin) {
    const { data: myTargets } = await admin
      .from("qr_config_targets")
      .select("qr_config_id, distribution_ratio")
      .in("qr_config_id", qrConfigIds)
      .eq("profile_id", user.id)
      .is("deleted_at", null);

    if (myTargets && myTargets.length > 0) {
      // 全 qr_configs に対して自分の分配比率の平均（通常は全て同一比率のはず）
      const totalRatio = myTargets.reduce((s, t) => s + Number(t.distribution_ratio ?? 0), 0);
      myDistributionRatio = totalRatio / qrConfigIds.length;

      // 各トランザクションに対して自分の取り分を正確に計算
      for (const tx of txList) {
        const txTargets = myTargets.filter((t) => t.qr_config_id === tx.qr_config_id);
        const ratio = txTargets.reduce((s, t) => s + Number(t.distribution_ratio ?? 0), 0);
        const txNet = Math.floor((tx.total_gross_amount ?? 0) * NET_RATE);
        myProjectedNet += Math.floor(txNet * ratio);
      }
    }
  } else {
    // admin は全体 net を見る
    myProjectedNet = totalNet;
  }

  // 全配分先の内訳（admin / organizer / agent 向け）
  let distributions: { profile_id: string; display_name: string | null; role: string; projected_net: number; ratio: number }[] = [];
  if (isAdmin || isOrganizer || isAgent) {
    const { data: allTargets } = await admin
      .from("qr_config_targets")
      .select("profile_id, distribution_ratio, qr_config_id, profile:profiles!profile_id(display_name, role)")
      .in("qr_config_id", qrConfigIds)
      .is("deleted_at", null);

    // profile ごとに集計
    const distMap = new Map<string, { display_name: string | null; role: string; projected_net: number; total_ratio: number; count: number }>();
    for (const target of allTargets ?? []) {
      const ratio = Number(target.distribution_ratio ?? 0);
      const existing = distMap.get(target.profile_id) ?? {
        display_name: (target.profile as any)?.display_name ?? null,
        role: (target.profile as any)?.role ?? "artist",
        projected_net: 0,
        total_ratio: 0,
        count: 0,
      };
      // このqr_configに紐づくtxのnetを計算
      const txForQr = txList.filter((tx) => tx.qr_config_id === target.qr_config_id);
      for (const tx of txForQr) {
        const txNet = Math.floor((tx.total_gross_amount ?? 0) * NET_RATE);
        existing.projected_net += Math.floor(txNet * ratio);
      }
      existing.total_ratio += ratio;
      existing.count += 1;
      distMap.set(target.profile_id, existing);
    }

    distributions = Array.from(distMap.entries()).map(([profile_id, d]) => ({
      profile_id,
      display_name: d.display_name,
      role: d.role,
      projected_net: d.projected_net,
      ratio: qrConfigIds.length > 0 ? d.total_ratio / qrConfigIds.length : 0,
    })).sort((a, b) => b.projected_net - a.projected_net);
  }

  return NextResponse.json({
    total_gross: totalGross,
    transaction_count: txList.length,
    total_stripe_fee: totalStripeFee,
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
  });
}
