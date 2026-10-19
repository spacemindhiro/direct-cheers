// QR画像・チケット画像の素材（宛先の画像／イベントのフライヤー）まわりの共通処理

// Supabase Storage の公開URLの先頭。クライアントから受け取ったURLが
// 自分たちのバケットの画像を指しているかの確認に使う。
export function storagePublicPrefix(bucket: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
}

// イベントのフライヤーURLとして保存してよいか（null=未設定 or 自分たちの event-images バケットの画像）
export function isValidFlyerUrl(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && v.startsWith(storagePublicPrefix("event-images")));
}

export type AvatarSource = { url: string; originalUrl: string | null };

/**
 * 名義の画像（organizer_avatar_url / artist_avatar_url）→ 基本の画像（avatar_url）の順で選び、
 * 原本は「選ばれた方の画像と組の原本」だけを使う。
 * 名義の画像が選ばれたのに基本の画像の原本を返すと、別の写真から切り抜くことになるため混ぜない。
 */
export function pickAvatarSource(
  named: { url: string | null | undefined; originalUrl: string | null | undefined },
  base: { url: string | null | undefined; originalUrl: string | null | undefined },
): AvatarSource | null {
  if (named.url) return { url: named.url, originalUrl: named.originalUrl ?? null };
  if (base.url) return { url: base.url, originalUrl: base.originalUrl ?? null };
  return null;
}

// 宛先候補（QR作成・編集画面の targets/candidates）に載せる画像と原本の組
export function avatarFields(...args: Parameters<typeof pickAvatarSource>): { avatar_url: string | null; avatar_original_url: string | null } {
  const src = pickAvatarSource(...args);
  return { avatar_url: src?.url ?? null, avatar_original_url: src?.originalUrl ?? null };
}
