import { resolveCheerCardIdentity, type RecipientNameContext } from "@/lib/statement-descriptor";

// 子機（qr-board-display）が表示する1件分のQR。タイムテーブル・トラックのデフォルト・
// 親機からの強制表示（Realtimeブロードキャスト）のいずれから来ても同じ形にする。
export type QrDisplayState = {
  qr_config_id: string;
  qr_url: string;
  product_name: string;
  label?: string;
  artist_name?: string;
  artist_avatar_url?: string | null;
};

// 表示状態の構築に必要なqr_configの項目（各APIのselectで取得している形）
export type QrConfigForDisplay = {
  qr_config_id: string;
  label: string | null;
  image_url: string | null;
  recipient_name_context?: RecipientNameContext | null;
  product: {
    name: string;
    type: string;
    artist: { display_name: string; artist_name: string | null; avatar_url?: string | null } | null;
  } | null;
  recipient?: {
    display_name: string | null;
    avatar_url: string | null;
    artist_name: string | null;
    organizer_name: string | null;
    artist_avatar_url: string | null;
    organizer_avatar_url: string | null;
  } | null;
};

// qr_config情報からQR表示状態を構築（タイムテーブルスロット・トラックのデフォルトQR・強制表示共通）。
// 名前・画像は「チアカード（/c/[qrConfigId]）」が使うのと同じ優先順位ロジック
// （recipient_name_contextに応じたorganizer/artist名義 → product.artist → 未設定）で解決する。
// 複数QRの選択タイルで見分けが付くようにするための画像なので、全QRでほぼ同じになりがちな
// qr_configs.image_url（チアカード自体の画像）ではなく、宛先本人の写真を使うのが基本。
// ただしエントランス・カスタム（バウチャー/ドリンクチケット）は同一主催者配下で
// 宛先（オーガナイザー）画像が使い回されがちで、グループ一覧に並べると見分けが
// つかず味気なくなるため、QR自体に個別画像が設定されていればそちらを優先する。
export function qrConfigToDisplayState(
  qc: QrConfigForDisplay | null,
  siteUrl: string,
  overrideLabel?: string | null,
): QrDisplayState | null {
  if (!qc) return null;
  const { name: artistName, avatarUrl: artistAvatarUrl } = resolveCheerCardIdentity({
    recipientNameContext: qc.recipient_name_context ?? "artist",
    recipient: qc.recipient
      ? {
          organizerName: qc.recipient.organizer_name,
          artistName: qc.recipient.artist_name,
          displayName: qc.recipient.display_name,
          organizerAvatarUrl: qc.recipient.organizer_avatar_url,
          artistAvatarUrl: qc.recipient.artist_avatar_url,
          avatarUrl: qc.recipient.avatar_url,
        }
      : null,
    productArtist: qc.product?.artist
      ? {
          artistName: qc.product.artist.artist_name,
          displayName: qc.product.artist.display_name,
          avatarUrl: qc.product.artist.avatar_url ?? null,
        }
      : null,
    fallbackName: "",
  });
  const isTicketType = qc.product?.type === "entrance" || qc.product?.type === "custom";
  const tileImageUrl = (isTicketType && qc.image_url) ? qc.image_url : artistAvatarUrl;
  return {
    qr_config_id: qc.qr_config_id,
    qr_url: `${siteUrl}/c/${qc.qr_config_id}`,
    product_name: qc.product?.name ?? "",
    label: overrideLabel ?? qc.label ?? qc.product?.name ?? "",
    artist_name: artistName,
    artist_avatar_url: tileImageUrl,
  };
}
