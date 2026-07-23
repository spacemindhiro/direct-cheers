import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCheerCardIdentity } from "@/lib/statement-descriptor";

// GET /api/entrance/welcome-cheer/[ticketId]
//
// エントランスチケット（ticket_id）に紐づくウェルカムチア（2階transaction）の
// 状態と、選択可能な演者候補（ワンプライスかつ金額完全一致のチア商品）を返す。
// ticket_id自体が推測不可能なUUIDのため、これを知っていることを認可とする
// （wallet/pass等、本アプリの他エンドポイントと同じ方針）。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("tickets")
    .select("ticket_id, transaction_id, event_id")
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (!ticket || !ticket.transaction_id) {
    return NextResponse.json({ has_welcome_cheer: false });
  }

  const { data: floor1Tx } = await admin
    .from("transactions")
    .select("stripe_payment_intent_id, product_id")
    .eq("transaction_id", ticket.transaction_id)
    .maybeSingle();

  if (!floor1Tx?.stripe_payment_intent_id) {
    return NextResponse.json({ has_welcome_cheer: false });
  }

  const { data: floor2Tx } = await admin
    .from("transactions")
    .select("transaction_id, total_gross_amount, welcome_cheer_locked_at, product:products!product_id(product_id, name, artist_id)")
    .eq("stripe_payment_intent_id", floor1Tx.stripe_payment_intent_id)
    .eq("stripe_pi_sequence", 1)
    .maybeSingle();

  if (!floor2Tx) {
    return NextResponse.json({ has_welcome_cheer: false });
  }

  const currentProduct = floor2Tx.product as unknown as { product_id: string; name: string; artist_id: string | null } | null;

  // 候補: エントランスQR作成時に主催者が明示的に選んだチア商品のみ
  // （welcome_cheer_eligible_products）。金額一致だけでイベント内の誰でも
  // 候補に出てしまわないよう、主催者が事前に登録したものに限定する。
  const { data: eligibleRows } = await admin
    .from("welcome_cheer_eligible_products")
    .select("cheer_product_id, product:products!cheer_product_id(product_id, name, artist_id)")
    .eq("entrance_product_id", floor1Tx.product_id);

  const candidateProducts = (eligibleRows ?? [])
    .map((r: any) => r.product as { product_id: string; name: string; artist_id: string | null } | null)
    .filter((p): p is { product_id: string; name: string; artist_id: string | null } => !!p);

  // 表示名・アバターは、対象商品(cheer_product)に紐づくQRの宛先設定
  // （recipient_profile_id・recipient_name_context）を優先して解決する。
  // product.artist_idの生のdisplay_name/avatar_urlを直接使うと、QRが
  // 「主催者名義」だったり演者が名義専用の別名・別写真を設定していたりする場合に
  // 実際のQR表示と名前・写真が一致しなくなる（resolveCheerCardIdentityと同じ
  // ルールを他のCheersカード表示（コレクション画面等）と揃えるために使う）。
  const allProducts = currentProduct ? [...candidateProducts, currentProduct] : candidateProducts;
  const productIds = [...new Set(allProducts.map((p) => p.product_id))];

  const { data: qrConfigRows } = productIds.length > 0
    ? await admin
        .from("qr_configs")
        .select("product_id, recipient_profile_id, recipient_name_context")
        .in("product_id", productIds)
        .is("deleted_at", null)
    : { data: [] };
  const qrConfigByProduct = new Map((qrConfigRows ?? []).map((q) => [q.product_id, q]));

  const artistIds = allProducts.map((p) => p.artist_id).filter((id): id is string => !!id);
  const recipientIds = (qrConfigRows ?? []).map((q) => q.recipient_profile_id).filter((id): id is string => !!id);
  const allProfileIds = [...new Set([...artistIds, ...recipientIds])];

  const { data: profileRows } = allProfileIds.length > 0
    ? await admin
        .from("profiles")
        .select("profile_id, display_name, avatar_url, artist_name, organizer_name, artist_avatar_url, organizer_avatar_url")
        .in("profile_id", allProfileIds)
    : { data: [] };
  const profileMap = new Map((profileRows ?? []).map((p) => [p.profile_id, p]));

  const resolveIdentity = (p: { product_id: string; name: string; artist_id: string | null }) => {
    const qrc = qrConfigByProduct.get(p.product_id);
    const recipient = qrc?.recipient_profile_id ? profileMap.get(qrc.recipient_profile_id) : null;
    const artist = p.artist_id ? profileMap.get(p.artist_id) : null;
    return resolveCheerCardIdentity({
      recipientNameContext: (qrc?.recipient_name_context as "organizer" | "artist") ?? "artist",
      recipient: recipient ? {
        organizerName: recipient.organizer_name,
        artistName: recipient.artist_name,
        displayName: recipient.display_name,
        organizerAvatarUrl: recipient.organizer_avatar_url,
        artistAvatarUrl: recipient.artist_avatar_url,
        avatarUrl: recipient.avatar_url,
      } : null,
      productArtist: artist ? {
        artistName: artist.artist_name,
        displayName: artist.display_name,
        avatarUrl: artist.avatar_url,
      } : null,
      fallbackName: p.name,
    });
  };

  const candidates = candidateProducts.map((p) => {
    const { name, avatarUrl } = resolveIdentity(p);
    return {
      product_id: p.product_id,
      name: p.name,
      artist_name: name,
      artist_avatar: avatarUrl,
    };
  });

  return NextResponse.json({
    has_welcome_cheer: true,
    transaction_id: floor2Tx.transaction_id,
    amount: floor2Tx.total_gross_amount,
    locked: floor2Tx.welcome_cheer_locked_at != null,
    current_recipient_name: currentProduct ? resolveIdentity(currentProduct).name : null,
    current_product_name: currentProduct?.name ?? null,
    candidates,
  });
}
