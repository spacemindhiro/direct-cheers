import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

async function getQRWithPermission(qrConfigId: string, userId: string) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: qr } = await admin
    .from("qr_configs")
    .select("qr_config_id, event_id, creator_profile_id, recipient_profile_id, product_id, default_amount, touchpay_enabled, is_welcome_cheer_default")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) return { qr: null, supabase, error: "Not found" };

  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
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

  return { qr, supabase, admin, isAdmin, isOrganizer, isAgent, isRecipient, error: null };
}

// ラベル・宛先・配分更新
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qr, supabase: sb, admin, isAdmin, isOrganizer, isAgent, isRecipient, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Not found" ? 404 : 500 });

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
  } = await req.json() as {
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
  };

  const hasProductUpdates =
    product_name !== undefined || min_amount !== undefined || max_amount !== undefined ||
    stock_limit !== undefined || track_inventory !== undefined ||
    quantity_selectable !== undefined || bulk_pricing !== undefined ||
    auto_checkin !== undefined;

  // 宛先本人は image_url / strip_image_url のみ更新可。それ以外のフィールドは organizer/agent/admin のみ。
  if (!canEdit && !isRecipient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEdit && isRecipient) {
    if (label !== undefined || recipient_profile_id !== undefined || recipient_name_context !== undefined || targets !== undefined || hasProductUpdates) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // 商品情報の取得（商品項目の更新・デフォルト金額・タッチ決済の検証で共用）
  const adminC = admin ?? createAdminClient();
  let product: {
    type: string; payment_type: string | null;
    min_amount: number; max_amount: number;
    stock_limit: number | null; sold_count: number; track_inventory: boolean;
  } | null = null;
  const needProduct = hasProductUpdates || (default_amount !== undefined && default_amount !== null) || touchpay_enabled === true;
  if (needProduct && qr.product_id) {
    const { data } = await adminC
      .from("products")
      .select("type, payment_type, min_amount, max_amount, stock_limit, sold_count, track_inventory")
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
      return NextResponse.json({ error: "商品情報が見つかりません" }, { status: 400 });
    }
    if (product_name !== undefined && !product_name.trim()) {
      return NextResponse.json({ error: "商品名を入力してください" }, { status: 400 });
    }
    if (min_amount !== undefined || max_amount !== undefined) {
      if (!Number.isInteger(effMin) || !Number.isInteger(effMax) || effMin <= 0) {
        return NextResponse.json({ error: "金額が不正です" }, { status: 400 });
      }
      if (effMin > effMax) {
        return NextResponse.json({ error: "最低金額が最高金額を上回っています" }, { status: 400 });
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
        return NextResponse.json(
          { error: `Amount must be between ${range.min} and ${range.max}` },
          { status: 400 },
        );
      }
      // タッチ決済が有効なバウチャーは金額固定が前提（レンジ化を拒否）
      const touchpayActive = touchpay_enabled ?? (qr as any).touchpay_enabled ?? false;
      if (product.type === "custom" && product.payment_type === "V" && touchpayActive && effMin !== effMax) {
        return NextResponse.json(
          { error: "対面タッチ決済が有効なバウチャーは金額を固定にしてください" },
          { status: 400 },
        );
      }
    }
    if (stock_limit !== undefined && stock_limit !== null) {
      if (!Number.isInteger(stock_limit) || stock_limit < 1) {
        return NextResponse.json({ error: "在庫上限が不正です" }, { status: 400 });
      }
      if (stock_limit < product.sold_count) {
        return NextResponse.json(
          { error: `在庫上限は販売済み数（${product.sold_count}件）以上にしてください` },
          { status: 400 },
        );
      }
    }
    if (quantity_selectable !== undefined || bulk_pricing !== undefined) {
      const isDrinkTicket = product.type === "custom" && product.payment_type === "D";
      if (!isDrinkTicket) {
        return NextResponse.json({ error: "quantity_selectable / bulk_pricing はドリンクチケットのみ指定できます" }, { status: 400 });
      }
      const effQuantitySelectable = quantity_selectable ?? true;
      if (effQuantitySelectable && Array.isArray(bulk_pricing) && bulk_pricing.length > 0) {
        if (bulk_pricing.length > 4) {
          return NextResponse.json({ error: "まとめ買い割引は最大4段階までです" }, { status: 400 });
        }
        let prevMinQty = 1;
        let prevUnitPrice = effMin;
        for (const tier of bulk_pricing) {
          if (!Number.isInteger(tier.min_quantity) || tier.min_quantity <= prevMinQty) {
            return NextResponse.json({ error: "まとめ買い割引の段階は杯数が昇順（2以上）である必要があります" }, { status: 400 });
          }
          if (!Number.isInteger(tier.unit_price) || tier.unit_price <= 0) {
            return NextResponse.json({ error: "まとめ買い割引の単価が不正です" }, { status: 400 });
          }
          if (tier.unit_price > prevUnitPrice) {
            return NextResponse.json({ error: "まとめ買い割引は杯数が増えるごとに単価を同額以下にしてください" }, { status: 400 });
          }
          prevMinQty = tier.min_quantity;
          prevUnitPrice = tier.unit_price;
        }
      }
    }
    if (auto_checkin !== undefined) {
      const isEntranceC = product.type === "entrance" && product.payment_type === "C";
      if (!isEntranceC) {
        return NextResponse.json({ error: "auto_checkin はエントランス×Cタイプのみ指定できます" }, { status: 400 });
      }
    }
  }

  // デフォルト金額は変更後のmin/max範囲内であることを確認
  if (default_amount !== undefined && default_amount !== null && product) {
    if (default_amount < effMin || default_amount > effMax) {
      return NextResponse.json(
        { error: `Default amount must be between ${effMin} and ${effMax}` },
        { status: 400 },
      );
    }
  }

  // 対面タッチ決済（Case④）はentrance×Cタイプ、またはcustom×バウチャー(V)×金額固定のみ許可。
  // クライアントの申告を信用せず、サーバー側で対象条件を再検証する。
  if (touchpay_enabled === true) {
    const eligible = !!product && (
      (product.type === "entrance" && product.payment_type === "C") ||
      (product.type === "custom" && product.payment_type === "V" && effMin === effMax)
    );
    if (!eligible) {
      return NextResponse.json({ error: "この商品は対面タッチ決済に対応していません" }, { status: 400 });
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

  // 金額レンジが変わり、既存のデフォルト金額が範囲外になる場合はクランプする
  if ((min_amount !== undefined || max_amount !== undefined) && default_amount === undefined) {
    const currentDefault = (qr as any).default_amount as number | null;
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
    if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (Object.keys(configUpdates).length > 0) {
    const { error: configError } = await sb
      .from("qr_configs")
      .update(configUpdates)
      .eq("qr_config_id", qrConfigId);
    if (configError) return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  // 配分先の更新（全置換）
  if (targets !== undefined) {
    // 決済が発生済みの場合は配分変更不可（settle時に過去の決済へ遡及してしまうため）
    const { count: txCount } = await (admin ?? createAdminClient())
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .eq("qr_config_id", qrConfigId);
    if (txCount && txCount > 0) {
      return NextResponse.json(
        { error: "このQRコードにはすでに決済が発生しているため配分は変更できません。配分を変更する場合は新しいQRコードを作成してください。" },
        { status: 409 },
      );
    }

    if (targets.length === 0) {
      return NextResponse.json({ error: "配分先を1人以上指定してください" }, { status: 400 });
    }
    const totalRatio = targets.reduce((sum, t) => sum + t.distribution_ratio, 0);
    if (Math.abs(totalRatio - 1.0) > 0.001) {
      return NextResponse.json({ error: "配分比率の合計を100%にしてください" }, { status: 400 });
    }

    // 既存を論理削除
    await sb
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
    const { error: targetError } = await sb.from("qr_config_targets").insert(rows);
    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
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

  return NextResponse.json({ ok: true });
}

// 論理削除
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qr, supabase: sb, admin, isAdmin, isOrganizer, isAgent, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Forbidden" ? 403 : 404 });

  if (!isAdmin && !isOrganizer && !isAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ウェルカムチアのデフォルト受取先として内部的に自動生成されたQRは、
  // エントランスQRの決済処理が参照し続けるため単独では削除できない
  // （エントランスQR自体を削除したときに連鎖削除される）
  if (qr.is_welcome_cheer_default) {
    return NextResponse.json(
      { error: "このQRはウェルカムチアのデフォルト受取先として自動生成されたものです。単独では削除できません。" },
      { status: 409 },
    );
  }

  const adminClient = admin ?? createAdminClient();

  // 売上が1件でもある場合は削除不可
  const { count } = await adminClient
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("qr_config_id", qrConfigId);

  if (count && count > 0) {
    return NextResponse.json(
      { error: "このQRコードにはすでに売上があるため削除できません" },
      { status: 409 },
    );
  }

  // このQRがウェルカムチア付きエントランスQRなら、内部的に自動生成した
  // デフォルト受取先（別のqr_configs/products行）も連鎖削除する。
  // そちらに売上がある場合も削除不可にする（購入者が既に演者を確定した
  // ケース等で、実際の配分記録が残っているため）。
  let cascadeQrConfigId: string | null = null;
  let cascadeProductId: string | null = null;
  if (qr.product_id) {
    const { data: entranceProduct } = await adminClient
      .from("products")
      .select("welcome_cheer_default_product_id")
      .eq("product_id", qr.product_id)
      .maybeSingle();

    if (entranceProduct?.welcome_cheer_default_product_id) {
      cascadeProductId = entranceProduct.welcome_cheer_default_product_id;
      const { data: cascadeQr } = await adminClient
        .from("qr_configs")
        .select("qr_config_id")
        .eq("product_id", cascadeProductId)
        .is("deleted_at", null)
        .maybeSingle();
      cascadeQrConfigId = cascadeQr?.qr_config_id ?? null;

      if (cascadeQrConfigId) {
        const { count: cascadeCount } = await adminClient
          .from("transactions")
          .select("transaction_id", { count: "exact", head: true })
          .eq("qr_config_id", cascadeQrConfigId);
        if (cascadeCount && cascadeCount > 0) {
          return NextResponse.json(
            { error: "ウェルカムチアの配分実績が残っているため削除できません" },
            { status: 409 },
          );
        }
      }
    }
  }

  const now = new Date().toISOString();

  const { error: deleteError } = await sb
    .from("qr_configs")
    .update({ deleted_at: now })
    .eq("qr_config_id", qrConfigId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // QRと1:1の商品も一緒に削除する（商品だけ生き残って他機能の候補一覧等に
  // 紛れ込み続けるのを防ぐ）
  if (qr.product_id) {
    await adminClient.from("products").update({ deleted_at: now }).eq("product_id", qr.product_id);
  }

  // ウェルカムチアのデフォルト受取先を連鎖削除
  if (cascadeQrConfigId) {
    await adminClient.from("qr_configs").update({ deleted_at: now }).eq("qr_config_id", cascadeQrConfigId);
  }
  if (cascadeProductId) {
    await adminClient.from("products").update({ deleted_at: now }).eq("product_id", cascadeProductId);
  }

  return NextResponse.json({ ok: true });
}
