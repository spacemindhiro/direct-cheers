// QR の編集（ラベル・宛先・配分・画像・配色・商品項目）。編集画面の API（app/api/qr/[qrConfigId] PATCH）と
// チアリー(AI) の確認カード（lib/mcp/tools/qr-edit.ts）で共用する。判定はすべてここ（送られた中身は信用しない）。
// supabase は本人のセッション、userId は編集する人。
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";
import { isValidQrImageUrl } from "@/lib/image-source";
import { getFeeConfig } from "@/lib/fee-config";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";
import { isEventEditable } from "@/lib/purchase-window";
import { organizerBalance, qrPeople, recipientError, targetsError, typeBReserveRequired } from "@/lib/qr/rules";

export async function getQRWithPermission(supabase: SupabaseClient, qrConfigId: string, userId: string) {
  const admin = createAdminClient();

  const { data: qr } = await admin
    .from("qr_configs")
    .select("qr_config_id, event_id, creator_profile_id, recipient_profile_id, recipient_name_context, product_id, default_amount, touchpay_enabled, is_welcome_cheer_default, image_url, strip_image_url")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) return { qr: null, supabase, error: "Not found" };

  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id, lifecycle_status, end_at")
    .eq("event_id", qr.event_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", userId)
    .single();

  // adminは担当agentかどうかに関わらず編集可（作成API・RLSポリシーと同じ扱い）
  const isAdmin = profile?.role === "admin";
  const isOrganizer = event?.organizer_profile_id === userId;
  const isAgent = profile?.role === "agent" && event?.agent_id === userId;
  const isRecipient = qr.recipient_profile_id === userId;

  // 代理作成で主催者にまだ送っていない下書きは、名義の主催者からは存在しない扱い（作成 API と同じ）
  if (!isAdmin && event?.agent_id !== userId && await isProxyDraftHiddenFrom(admin, qr.event_id, userId)) {
    return { qr: null, supabase, error: "Not found" };
  }

  return { qr, supabase, admin, isAdmin, isOrganizer, isAgent, isRecipient, organizerId: event?.organizer_profile_id as string | undefined, lifecycle: event?.lifecycle_status as string | undefined, endAt: event?.end_at as string | undefined, error: null };
}

const isValidRatio = (r: unknown) => typeof r === "number" && Number.isFinite(r) && r >= 0 && r <= 1;

export type UpdateQrResult = { ok: true } | { ok: false; error: string; status: number };

const fail = (error: string, status: number): UpdateQrResult => ({ ok: false, error, status });

export async function updateQr(supabase: SupabaseClient, userId: string, qrConfigId: string, body: Record<string, unknown>): Promise<UpdateQrResult> {
  const user = { id: userId };
  const { qr, admin, isAdmin, isOrganizer, isAgent, isRecipient, organizerId, lifecycle, endAt, error } = await getQRWithPermission(supabase, qrConfigId, user.id);
  if (!qr) return fail(error ?? "Not found", error === "Not found" ? 404 : 500);

  const canEdit = isAdmin || isOrganizer || isAgent;

  const {
    label,
    image_url,
    recipient_profile_id,
    recipient_name_context,
    targets,
    strip_image_url,
    bg_color,
    fg_color,
    label_color,
    amount_step,
    default_amount,
    touchpay_enabled,
    product_name,
    min_amount,
    max_amount,
    stock_limit,
    track_inventory,
    quantity_selectable,
    bulk_pricing,
    auto_checkin,
    bypass_validity,
  } = body as {
    label?: string;
    image_url?: string | null;
    recipient_profile_id?: string;
    recipient_name_context?: "organizer" | "artist";
    targets?: { profile_id: string; distribution_ratio: number }[];
    strip_image_url?: string | null;
    bg_color?: string;
    fg_color?: string;
    label_color?: string;
    amount_step?: 100 | 500 | 1000;
    default_amount?: number | null;
    touchpay_enabled?: boolean;
    product_name?: string;
    min_amount?: number;
    max_amount?: number;
    stock_limit?: number | null;
    track_inventory?: boolean;
    quantity_selectable?: boolean;
    bulk_pricing?: { min_quantity: number; unit_price: number }[] | null;
    auto_checkin?: boolean;
    bypass_validity?: boolean;
  };

  const hasProductUpdates =
    product_name !== undefined || min_amount !== undefined || max_amount !== undefined ||
    stock_limit !== undefined || track_inventory !== undefined ||
    quantity_selectable !== undefined || bulk_pricing !== undefined ||
    auto_checkin !== undefined;

  // 宛先本人は image_url / strip_image_url のみ更新可。それ以外のフィールドは organizer/agent/admin のみ。
  if (!canEdit && !isRecipient) {
    return fail("Forbidden", 403);
  }
  if (!canEdit && isRecipient) {
    if (label !== undefined || recipient_profile_id !== undefined || recipient_name_context !== undefined || targets !== undefined || hasProductUpdates) {
      return fail("Forbidden", 403);
    }
  }
  // 終わった（締め時刻後・終了・精算済み）・中止のイベントの QR は変えない（宛先本人の画像の差し替えだけは今までどおり）
  if (canEdit && !isEventEditable(lifecycle, endAt)) {
    return fail("終わった（または中止の）イベントの QR は変更できません", 400);
  }
  // 画像は自分たちの Storage に上げたものだけ（外部URLはウォレットカード作成時にサーバーが取りに行くため）。
  // 編集画面は変えていない画像もそのまま送り直すので、保存済みの値と同じなら通す
  if ((image_url !== undefined && image_url !== qr.image_url && !isValidQrImageUrl(image_url)) ||
      (strip_image_url !== undefined && strip_image_url !== qr.strip_image_url && !isValidQrImageUrl(strip_image_url))) {
    return fail("画像の形式が不正です", 400);
  }

  // 有効期間バイパスはadmin限定
  if (bypass_validity !== undefined && !isAdmin) {
    return fail("Forbidden", 403);
  }

  // 商品情報の取得（商品項目の更新・デフォルト金額・タッチ決済の検証で共用）
  const adminC = admin ?? createAdminClient();
  let product: {
    type: string; payment_type: string | null;
    min_amount: number; max_amount: number;
    stock_limit: number | null; sold_count: number; track_inventory: boolean;
    quantity_selectable: boolean;
  } | null = null;
  const needProduct = hasProductUpdates || (default_amount !== undefined && default_amount !== null) || touchpay_enabled === true;
  if (needProduct && qr.product_id) {
    const { data } = await adminC
      .from("products")
      .select("type, payment_type, min_amount, max_amount, stock_limit, sold_count, track_inventory, quantity_selectable")
      .eq("product_id", qr.product_id)
      .single();
    product = data;
  }

  // 変更後の実効金額レンジ（金額未変更なら現行値）
  const effMin = min_amount ?? product?.min_amount ?? 0;
  const effMax = max_amount ?? product?.max_amount ?? 0;

  // ── 商品項目のバリデーション（作成時と同じルールを適用）
  if (hasProductUpdates) {
    if (!product) {
      return fail("商品情報が見つかりません", 400);
    }
    if (product_name !== undefined && !product_name.trim()) {
      return fail("商品名を入力してください", 400);
    }
    if (min_amount !== undefined || max_amount !== undefined) {
      if (!Number.isInteger(effMin) || !Number.isInteger(effMax) || effMin <= 0) {
        return fail("金額が不正です", 400);
      }
      if (effMin > effMax) {
        return fail("最低金額が最高金額を上回っています", 400);
      }
      // 商品タイプごとの許容レンジ（作成時と同じくproduct_type_configsを参照）
      const { data: typeConfig } = await adminC
        .from("product_type_configs")
        .select("min_amount, max_amount, is_enabled")
        .eq("type", product.type)
        .maybeSingle();
      const FALLBACK: Record<string, { min: number; max: number }> = {
        standard: { min: 50, max: 3_000 }, message: { min: 50, max: 5_000 },
        entrance: { min: 50, max: 30_000 }, custom: { min: 50, max: 100_000 },
      };
      const range = typeConfig
        ? { min: typeConfig.min_amount, max: typeConfig.max_amount }
        : FALLBACK[product.type];
      if (range && (effMin < range.min || effMax > range.max)) {
        return fail(`Amount must be between ${range.min} and ${range.max}`, 400);
      }
      // タッチ決済が有効なバウチャーは金額固定が前提（レンジ化を拒否）
      const touchpayActive = touchpay_enabled ?? (qr as { touchpay_enabled?: boolean }).touchpay_enabled ?? false;
      if (product.type === "custom" && product.payment_type === "V" && touchpayActive && effMin !== effMax) {
        return fail("対面タッチ決済が有効なバウチャーは金額を固定にしてください", 400);
      }
    }
    // 前売即時確定（エントランス×B）は販売上限数が必須で、在庫管理も外せない（作成時と同じ。外すと上限なしで売れてしまう）
    if (product.type === "entrance" && product.payment_type === "B" && (stock_limit === null || track_inventory === false)) {
      return fail("前売即時確定タイプは販売上限数を入力してください", 400);
    }
    if (stock_limit !== undefined && stock_limit !== null) {
      if (!Number.isInteger(stock_limit) || stock_limit < 1) {
        return fail("在庫上限が不正です", 400);
      }
      if (stock_limit < product.sold_count) {
        return fail(`在庫上限は販売済み数（${product.sold_count}件）以上にしてください`, 400);
      }
    }
    // 前売即時確定（エントランス×B）で、在庫か上限金額を増やして必要な残高（上限金額×在庫×手数料率）が上がるときは、
    // 作成時と同じく主催者の残高を確かめる（作成後に在庫を増やすと、作成時の確かめを通らずに済んでいた）
    if (product.type === "entrance" && product.payment_type === "B" && organizerId) {
      const stripeRate = (await getFeeConfig()).stripe_rate;
      const reserve = (stockLimit: number | null, maxAmount: number) =>
        typeBReserveRequired({ productType: "entrance", paymentType: "B", stockLimit, maxAmount, stripeRate });
      const required = reserve(stock_limit !== undefined ? stock_limit : product.stock_limit, effMax);
      if (required > reserve(product.stock_limit, product.max_amount)) {
        const balance = await organizerBalance(adminC, organizerId);
        if (balance < required) {
          return fail(`前売即時確定タイプを利用するには残高が ¥${required.toLocaleString()} 以上必要です（現在: ¥${balance.toLocaleString()}）`, 400);
        }
      }
    }
    if (quantity_selectable !== undefined || bulk_pricing !== undefined) {
      const isDrinkTicket = product.type === "custom" && product.payment_type === "D";
      if (!isDrinkTicket) {
        return fail("quantity_selectable / bulk_pricing はドリンクチケットのみ指定できます", 400);
      }
      const effQuantitySelectable = quantity_selectable ?? true;
      if (effQuantitySelectable && Array.isArray(bulk_pricing) && bulk_pricing.length > 0) {
        if (bulk_pricing.length > 4) {
          return fail("まとめ買い割引は最大4段階までです", 400);
        }
        let prevMinQty = 1;
        let prevUnitPrice = effMin;
        for (const tier of bulk_pricing) {
          if (!Number.isInteger(tier.min_quantity) || tier.min_quantity <= prevMinQty) {
            return fail("まとめ買い割引の段階は杯数が昇順（2以上）である必要があります", 400);
          }
          if (!Number.isInteger(tier.unit_price) || tier.unit_price <= 0) {
            return fail("まとめ買い割引の単価が不正です", 400);
          }
          if (tier.unit_price > prevUnitPrice) {
            return fail("まとめ買い割引は杯数が増えるごとに単価を同額以下にしてください", 400);
          }
          prevMinQty = tier.min_quantity;
          prevUnitPrice = tier.unit_price;
        }
      }
    }
    if (auto_checkin !== undefined) {
      const isEntranceC = product.type === "entrance" && product.payment_type === "C";
      if (!isEntranceC) {
        return fail("auto_checkin はエントランス×Cタイプのみ指定できます", 400);
      }
    }
  }

  // デフォルト金額は変更後のmin/max範囲内であることを確認
  if (default_amount !== undefined && default_amount !== null && product) {
    if (default_amount < effMin || default_amount > effMax) {
      return fail(`Default amount must be between ${effMin} and ${effMax}`, 400);
    }
  }

  // 対面タッチ決済（Case④）はentrance×Cタイプ、custom×バウチャー(V)×金額固定、
  // またはcustom×ドリンクチケット(D)×杯数指定オフのみ許可。
  // クライアントの申告を信用せず、サーバー側で対象条件を再検証する。
  // quantity_selectableは同一リクエストで一緒に変更されうるため、送信された
  // 値があればそちらを優先し、無ければDB上の現行値を見る。
  if (touchpay_enabled === true) {
    const effQuantitySelectableForTouchpay = quantity_selectable ?? product?.quantity_selectable ?? true;
    const eligible = !!product && (
      (product.type === "entrance" && product.payment_type === "C") ||
      (product.type === "custom" && product.payment_type === "V" && effMin === effMax) ||
      (product.type === "custom" && product.payment_type === "D" && effQuantitySelectableForTouchpay === false)
    );
    if (!eligible) {
      return fail("この商品は対面タッチ決済に対応していません", 400);
    }
  }

  // 宛先・配分先はこのイベントの主催者と出演者（断った人を除く）だけ（画面と同じ。API を直接呼ぶと関係ない人を入れられた）。
  // すでに入っている宛先・配分先はそのまま通す（あとで出演を断った人がいても、ほかの項目を直せるように）
  if ((recipient_profile_id !== undefined || recipient_name_context !== undefined || targets !== undefined) && organizerId) {
    const people = await qrPeople(adminC, qr.event_id, organizerId);
    if (recipient_profile_id !== undefined || recipient_name_context !== undefined) {
      const err = recipientError(people, recipient_profile_id ?? qr.recipient_profile_id, recipient_name_context ?? qr.recipient_name_context,
        { id: qr.recipient_profile_id, context: qr.recipient_name_context });
      if (err) return fail(err, 400);
    }
    if (Array.isArray(targets)) {
      const { data: current } = await adminC.from("qr_config_targets").select("profile_id").eq("qr_config_id", qrConfigId).is("deleted_at", null);
      const err = targetsError(people, targets, new Set((current ?? []).map((t) => t.profile_id as string)));
      if (err) return fail(err, 400);
    }
  }

  // 宛先を替えるのは決済がまだのときだけ。すでに払ったお客様の明細（DC for の後ろ）は前の宛先の名前なのに、
  // Wallet のカードが新しい宛先の名前に変わってしまい、身に覚えのない支払いの異議につながるため（配分と同じ扱い）。
  // 編集画面は宛先を毎回送り直すので、今の宛先と同じなら通す
  const recipientChanging =
    (recipient_profile_id !== undefined && recipient_profile_id !== qr.recipient_profile_id) ||
    (recipient_name_context !== undefined && recipient_name_context !== qr.recipient_name_context);
  if (recipientChanging || targets !== undefined) {
    if (recipientChanging) {
      const { count } = await adminC.from("transactions").select("transaction_id", { count: "exact", head: true }).eq("qr_config_id", qrConfigId);
      if (count && count > 0) {
        return fail("このQRコードにはすでに決済が発生しているため宛先は変更できません。宛先を変更する場合は新しいQRコードを作成してください。", 409);
      }
    }
    // 宛先は配分先の中の人（作成 API と同じ。配分を受け取らない人が販売者の名前にならないように）
    const finalRecipient = recipient_profile_id ?? qr.recipient_profile_id;
    const finalTargets = Array.isArray(targets)
      ? targets.map((t) => t.profile_id)
      : ((await adminC.from("qr_config_targets").select("profile_id").eq("qr_config_id", qrConfigId).is("deleted_at", null)).data ?? []).map((t) => t.profile_id as string);
    if (!finalTargets.includes(finalRecipient)) {
      return fail("宛先を配分先に含めてください", 400);
    }
  }

  // qr_configs 更新
  const configUpdates: Record<string, unknown> = {};
  if (label !== undefined) configUpdates.label = label || null;
  if (image_url !== undefined) configUpdates.image_url = image_url;
  if (strip_image_url !== undefined) configUpdates.strip_image_url = strip_image_url;
  if (bg_color !== undefined) configUpdates.bg_color = bg_color;
  if (fg_color !== undefined) configUpdates.fg_color = fg_color;
  if (label_color !== undefined) configUpdates.label_color = label_color;
  if (recipient_profile_id !== undefined) configUpdates.recipient_profile_id = recipient_profile_id;
  if (recipient_name_context !== undefined) configUpdates.recipient_name_context = recipient_name_context;
  if (amount_step !== undefined) configUpdates.amount_step = amount_step;
  if (default_amount !== undefined) configUpdates.default_amount = default_amount;
  if (touchpay_enabled !== undefined) configUpdates.touchpay_enabled = touchpay_enabled;
  if (bypass_validity !== undefined) configUpdates.bypass_validity = bypass_validity;

  // 金額レンジが変わり、既存のデフォルト金額が範囲外になる場合はクランプする
  if ((min_amount !== undefined || max_amount !== undefined) && default_amount === undefined) {
    const currentDefault = (qr as { default_amount?: number | null }).default_amount ?? null;
    if (currentDefault !== null && currentDefault !== undefined) {
      const clamped = Math.min(Math.max(currentDefault, effMin), effMax);
      if (clamped !== currentDefault) configUpdates.default_amount = clamped;
    }
  }

  // products 更新（RLSにUPDATEポリシーが無いためadminクライアントで実行。権限はcanEditで検証済み）
  if (hasProductUpdates) {
    const productUpdates: Record<string, unknown> = {};
    if (product_name !== undefined) productUpdates.name = product_name.trim();
    if (min_amount !== undefined) productUpdates.min_amount = min_amount;
    if (max_amount !== undefined) productUpdates.max_amount = max_amount;
    if (stock_limit !== undefined) productUpdates.stock_limit = stock_limit;
    if (track_inventory !== undefined) productUpdates.track_inventory = track_inventory;
    if (quantity_selectable !== undefined) {
      productUpdates.quantity_selectable = quantity_selectable;
      if (quantity_selectable === false) productUpdates.bulk_pricing = null;
    }
    if (bulk_pricing !== undefined && quantity_selectable !== false) {
      productUpdates.bulk_pricing = bulk_pricing;
    }
    if (auto_checkin !== undefined) productUpdates.auto_checkin = auto_checkin;

    const { error: productError } = await adminC
      .from("products")
      .update(productUpdates)
      .eq("product_id", qr.product_id);
    if (productError) return fail(productError.message, 500);
  }

  // RLSにUPDATEポリシーが無い/対象外のケースがあるためadminクライアントで実行。
  // 権限はcanEdit/isRecipientで検証済み（受取人はimage_url/strip_image_urlのみ許可）。
  if (Object.keys(configUpdates).length > 0) {
    const { error: configError } = await adminC
      .from("qr_configs")
      .update(configUpdates)
      .eq("qr_config_id", qrConfigId);
    if (configError) return fail(configError.message, 500);
  }

  // 配分先の更新（全置換）
  if (targets !== undefined) {
    // 決済が発生済みの場合は配分変更不可（settle時に過去の決済へ遡及してしまうため）
    const { count: txCount } = await (admin ?? createAdminClient())
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .eq("qr_config_id", qrConfigId);
    if (txCount && txCount > 0) {
      return fail("このQRコードにはすでに決済が発生しているため配分は変更できません。配分を変更する場合は新しいQRコードを作成してください。", 409);
    }

    if (targets.length === 0) {
      return fail("配分先を1人以上指定してください", 400);
    }
    // 1人ずつ 0〜100% の範囲。合計だけの確認では「109% と -9%」が通り、精算で運営の資金から払い出されていた
    if (!targets.every((t) => isValidRatio(t.distribution_ratio))) {
      return fail("配分比率は0〜100%で指定してください", 400);
    }
    const totalRatio = targets.reduce((sum, t) => sum + t.distribution_ratio, 0);
    if (Math.abs(totalRatio - 1.0) > 0.001) {
      return fail("配分比率の合計を100%にしてください", 400);
    }

    // 書き込みは権限確認済みのサーバーで行う（DBは本人による直接書き込みを許可していない）
    const writer = admin ?? createAdminClient();

    // 既存を論理削除
    await writer
      .from("qr_config_targets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("qr_config_id", qrConfigId)
      .is("deleted_at", null);

    // 新規 insert
    const rows = targets.map((t) => ({
      qr_config_id: qrConfigId,
      profile_id: t.profile_id,
      distribution_ratio: t.distribution_ratio,
    }));
    const { error: targetError } = await writer.from("qr_config_targets").insert(rows);
    if (targetError) return fail(targetError.message, 500);
  }

  // 画像・配色・宛先・商品名（券面に印字）が変わった場合、Walletパスを更新push（fire-and-forget）
  const visualChanged = (image_url !== undefined || strip_image_url !== undefined ||
    bg_color !== undefined || fg_color !== undefined || label_color !== undefined ||
    recipient_profile_id !== undefined || recipient_name_context !== undefined) &&
    Object.keys(configUpdates).length > 0;
  if (visualChanged || product_name !== undefined) {
    (async () => {
      try {
        const a = createAdminClient();
        const { data: txs } = await a
          .from("transactions").select("transaction_id")
          .eq("qr_config_id", qrConfigId).eq("status", "completed");
        for (const tx of txs ?? []) {
          pushWalletUpdateBySerial(tx.transaction_id).catch((err) =>
            console.error("[qr/patch] wallet push failed:", tx.transaction_id, err)
          );
        }
      } catch (err) {
        console.error("[qr/patch] wallet push error:", err);
      }
    })();
  }

  return { ok: true };
}
