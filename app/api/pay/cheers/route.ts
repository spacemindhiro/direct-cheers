import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { checkConnectCapabilities } from "@/lib/stripe-check";
import { buildStatementDescriptorSuffixes } from "@/lib/statement-descriptor";
import { resolveDrinkUnitPrice } from "@/lib/drink-ticket-pricing";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

type PaymentMethod = "card" | "apple_pay" | "google_pay" | "link" | "paypay";

function resolvePaymentMethodTypes(method: PaymentMethod): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  if (method === "paypay") return ["paypay"] as unknown as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  if (method === "link") return ["card", "link"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  return ["card"]; // card / apple_pay / google_pay はすべて card type
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    qr_config_id,
    product_id,
    amount,
    quantity: rawQuantity,
    payment_method, // 'card' | 'paypay'
    customer_email,
    metadata,
  } = body as {
    qr_config_id: string;
    product_id: string;
    amount: number;
    quantity?: number;
    payment_method: PaymentMethod;
    customer_email?: string;
    metadata?: Record<string, string>;
  };

  if (!qr_config_id || !product_id || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 人数（エントランスの当日現地QR決済用）。未指定は1名。
  const quantity = rawQuantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  }

  const thanksUrl = `${SITE_URL}/c/${qr_config_id}/thanks?session_id={CHECKOUT_SESSION_ID}`;

  const paymentMethodTypes = resolvePaymentMethodTypes(payment_method);

  const admin = createAdminClient();

  // getUser()（自前のcookie読取）と qr_configs 本体の取得は互いに依存しないため並列実行する。
  // qr_configs には event の organizer_profile_id・宛先名義情報・このQRに紐づく商品(min/max)を
  // 1クエリにまとめて埋め込み、以前は3回に分かれていたDB往復を1回に減らす。
  const [loggedInUser, { data: qrc }] = await Promise.all([
    getUser(),
    admin
      .from("qr_configs")
      .select(`
        product_id,
        event_id,
        recipient_name_context,
        event:events!event_id(organizer_profile_id, title, venue),
        recipient:profiles!recipient_profile_id(display_name, artist_name, organizer_name, artist_name_ascii, organizer_name_ascii),
        product:products!product_id(min_amount, max_amount, deleted_at, type, payment_type, quantity_selectable, bulk_pricing)
      `)
      .eq("qr_config_id", qr_config_id)
      .single(),
  ]);

  if (!qrc) {
    return NextResponse.json({ error: "QR not found" }, { status: 404 });
  }

  const loggedInEmail = loggedInUser?.email ?? null;
  const eventRow = qrc.event as any;
  const recipientRow = qrc.recipient as any;
  const qrcProduct = qrc.product as any;

  // amount・product_id はクライアント(スライダー/フォーム)から送られてくる値をそのまま信用できないため、
  // このQRに紐づく商品と product_id が一致すること、その商品のmin/max範囲内であることをサーバー側で必ず検証する。
  // これが無いと「別のQR・別のイベントの安い商品のproduct_id」を正規のqr_config_idと組み合わせて
  // 送ることで、min/maxチェックをすり抜けられてしまう（product_idはページ閲覧時点で誰でも見える値のため）。
  // qr_configs.product_id が未設定の古いQR（1QR:1商品の紐付け導入以前のデータ）は、
  // 同一イベントの商品であることのみを検証するフォールバックにする。
  let resolvedProduct: {
    min_amount: number; max_amount: number;
    type?: string; payment_type?: string | null;
    quantity_selectable?: boolean; bulk_pricing?: { min_quantity: number; unit_price: number }[] | null;
  } | null = null;
  if (qrc.product_id) {
    if (product_id !== qrc.product_id) {
      return NextResponse.json({ error: "この決済リンクに対応する商品ではありません" }, { status: 400 });
    }
    if (!qrcProduct || qrcProduct.deleted_at) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    resolvedProduct = qrcProduct;
  } else {
    const { data: fallbackProduct } = await admin
      .from("products")
      .select("event_id, min_amount, max_amount, type, payment_type, quantity_selectable, bulk_pricing")
      .eq("product_id", product_id)
      .is("deleted_at", null)
      .single();
    if (!fallbackProduct || fallbackProduct.event_id !== qrc.event_id) {
      return NextResponse.json({ error: "この決済リンクに対応する商品ではありません" }, { status: 400 });
    }
    resolvedProduct = fallbackProduct;
  }

  if (!resolvedProduct) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (amount < resolvedProduct.min_amount || amount > resolvedProduct.max_amount) {
    return NextResponse.json(
      { error: `Amount must be between ${resolvedProduct.min_amount} and ${resolvedProduct.max_amount}` },
      { status: 400 },
    );
  }

  // ドリンクチケット（custom×Dタイプ）: 単価はクライアントの申告を一切信用せず、
  // DBに保存された基準単価・まとめ買い割引ティアと数量からサーバー側で確定計算する。
  const isDrinkTicket = resolvedProduct.type === "custom" && resolvedProduct.payment_type === "D";
  let effectiveUnitAmount = amount;
  if (isDrinkTicket) {
    if (resolvedProduct.quantity_selectable === false && quantity !== 1) {
      return NextResponse.json({ error: "この商品は数量を指定できません" }, { status: 400 });
    }
    effectiveUnitAmount = resolveDrinkUnitPrice(resolvedProduct.min_amount, resolvedProduct.bulk_pricing, quantity);
  }

  // このルートはチア/メッセージ決済専用（入場券は /api/entrance/reserve）なので isEntrance は常にfalse
  const { suffix: statementDescriptorSuffix, suffixKana, suffixKanji } = buildStatementDescriptorSuffixes({
    isEntrance: false,
    recipientNameContext: (qrc.recipient_name_context as "organizer" | "artist") ?? "artist",
    organizerName: recipientRow?.organizer_name,
    artistName: recipientRow?.artist_name,
    recipientDisplayName: recipientRow?.display_name,
    organizerNameAscii: recipientRow?.organizer_name_ascii,
    artistNameAscii: recipientRow?.artist_name_ascii,
  });

  const emailForCustomer = loggedInEmail ?? customer_email;

  // organizer の Connect ID 取得（on_behalf_of 用）と、事前登録済みカスタマーIDの取得は
  // 互いに依存しないため並列実行する。
  const [orgProfileResult, provResult] = await Promise.all([
    eventRow?.organizer_profile_id
      ? admin.from("profiles").select("stripe_connect_id").eq("profile_id", eventRow.organizer_profile_id).single()
      : Promise.resolve({ data: null as { stripe_connect_id: string | null } | null }),
    emailForCustomer && payment_method === "card"
      ? admin.from("provisional_users").select("stripe_customer_id").eq("email", emailForCustomer).maybeSingle()
      : Promise.resolve({ data: null as { stripe_customer_id: string | null } | null }),
  ]);

  // organizer の Connect ID（全決済手段で on_behalf_of に使用 — MoR はオーガナイザー）
  const organizerConnectId: string | null = orgProfileResult.data?.stripe_connect_id ?? null;
  // 事前登録済みカスタマーID（ログイン済みの場合はそのメールを優先。フォームはロック表示済みだが API 側でも保証）
  const savedCustomerId: string | null = provResult.data?.stripe_customer_id ?? null;

  // PayPay は Stripe Connect の on_behalf_of を現行 API でサポートしていない。
  // カード（AP/GP/Link）のみ on_behalf_of を設定し、MoR をオーガナイザーに移転する。
  const useOnBehalfOf = payment_method !== "paypay" && organizerConnectId != null;

  // カード系かつ on_behalf_of を使用する場合、Capability が揃っているか事前検証する。
  // 未完了の Connected Account に対して Stripe が決済を受け付けると客側エラーになるため、
  // 無駄な電文を飛ばす前にバックエンドでブロックする。
  if (useOnBehalfOf) {
    const { ok, missing } = await checkConnectCapabilities(stripe, organizerConnectId!);
    if (!ok) {
      return NextResponse.json(
        { error: "account_incomplete", missing_capabilities: missing },
        { status: 422 },
      );
    }
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: paymentMethodTypes,
    payment_intent_data: {
      // PayPay は仕様上 manual capture 非対応のため即時キャプチャ。カードはオーソリ維持。
      capture_method: payment_method === "paypay" ? "automatic" : "manual",
      ...(useOnBehalfOf ? { on_behalf_of: organizerConnectId! } : {}),
      ...(statementDescriptorSuffix ? { statement_descriptor_suffix: statementDescriptorSuffix } : {}),
    },
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: metadata?.artist_name
              ? `${metadata.artist_name} への応援 / ${metadata.event_title ?? ""}`
              : "Direct Cheers",
            // 実会場のあるイベント興行での決済であることをStripe側に明示する
            ...(eventRow?.venue ? { description: `イベント会場: ${eventRow.venue}` } : {}),
          },
          unit_amount: effectiveUnitAmount,
        },
        quantity,
      },
    ],
    mode: "payment",
    success_url: thanksUrl,
    cancel_url: `${SITE_URL}/c/${qr_config_id}`,
    metadata: {
      qr_config_id,
      product_id,
      quantity: String(quantity),
      artist_name: metadata?.artist_name ?? "",
      event_title: metadata?.event_title ?? "",
      // 会場情報はクライアント申告ではなくDB（events）から取得した値を使う
      event_id: qrc.event_id ?? "",
      event_venue: eventRow?.venue ?? "",
      device_name: metadata?.device_name ?? "",
      ...(loggedInEmail ? { sender_email: loggedInEmail } : {}),
    },
  };

  if (savedCustomerId) {
    // 保存済みカード → customer で渡す（customer_creation 不要）
    sessionParams.customer = savedCustomerId;
  } else {
    // 未登録 → 新規作成 & メアド pre-fill（ログイン済みメール優先）
    sessionParams.customer_creation = "always";
    if (emailForCustomer) sessionParams.customer_email = emailForCustomer;
  }

  // カード系（card / AP / GP / Link）は 3DS を有効化。PayPay は非対応のため除外。
  // statement_descriptor_suffix_kana/kanji もここに乗せる（日本語名はASCII版だけだと反映されないため）。
  if (payment_method !== "paypay") {
    sessionParams.payment_method_options = {
      card: {
        request_three_d_secure: "automatic",
        ...(suffixKana ? { statement_descriptor_suffix_kana: suffixKana } : {}),
        ...(suffixKanji ? { statement_descriptor_suffix_kanji: suffixKanji } : {}),
      },
    };
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
