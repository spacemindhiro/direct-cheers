/**
 * Stripe statement_descriptor_suffix（カード明細書の動的追記）を
 * 決済の宛先名義（オーガナイザー/演者）から組み立てる。
 *
 * Stripeの制約: 半角英数字と一部記号（. , - 空白）のみ、22文字以内が安全圏。
 * このプロジェクトでは19文字を上限として運用する。
 * 日本語（かな・漢字）はこの方式では送れないため、ASCII以外の文字は
 * サニタイズ時に除去される。除去後に空文字になった場合は suffix を
 * 設定しない（undefined を返す）— ベースの明細書表記のみが表示される。
 */

export type RecipientNameContext = "organizer" | "artist";

const ALLOWED_CHARS_REGEX = /[^A-Z0-9.,\- ]/g;

/** 全角英数字を半角に変換する（全角記号・かな漢字は対象外） */
function toHalfWidthAlnum(input: string): string {
  return input.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/**
 * 任意の文字列をStripe statement_descriptor_suffix用に整形する。
 * 半角英数大文字 + ". , - 空白" のみ残し、maxLen文字に切り詰める。
 * サニタイズ後に空になった場合は null を返す（呼び出し側でsuffix自体を省略する）。
 */
export function sanitizeStatementDescriptorSuffix(
  raw: string | null | undefined,
  maxLen = 19,
): string | null {
  if (!raw) return null;
  const halfWidth = toHalfWidthAlnum(raw);
  const upper = halfWidth.toUpperCase();
  const cleaned = upper.replace(ALLOWED_CHARS_REGEX, "");
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  const truncated = collapsed.slice(0, maxLen).trim();
  return truncated.length > 0 ? truncated : null;
}

/**
 * 決済の宛先名義から、statement_descriptor_suffix の元になる「生の名前」を選ぶ。
 * - entrance（入場券）: 宛先がオーガナイザー個人かどうかに関わらず、常にイベント名を使う
 * - それ以外（チア/メッセージ）: qr_configs.recipient_name_context に従い
 *   organizer_name または artist_name を使う（無ければ display_name → イベント名 にフォールバック）
 */
export function resolveStatementDescriptorSource(params: {
  isEntrance: boolean;
  eventTitle?: string | null;
  recipientNameContext: RecipientNameContext;
  organizerName?: string | null;
  artistName?: string | null;
  recipientDisplayName?: string | null;
}): string {
  const {
    isEntrance, eventTitle, recipientNameContext,
    organizerName, artistName, recipientDisplayName,
  } = params;

  if (isEntrance) {
    return eventTitle ?? recipientDisplayName ?? "DIRECT CHEERS";
  }
  if (recipientNameContext === "organizer") {
    return organizerName ?? recipientDisplayName ?? eventTitle ?? "DIRECT CHEERS";
  }
  return artistName ?? recipientDisplayName ?? eventTitle ?? "DIRECT CHEERS";
}

/**
 * 名前解決 + サニタイズをまとめて行う。Stripeのパラメータに渡す際は
 * `statement_descriptor_suffix: buildStatementDescriptorSuffix(...) ?? undefined`
 * のように使い、undefined ならフィールド自体を渡さない。
 */
export function buildStatementDescriptorSuffix(
  params: Parameters<typeof resolveStatementDescriptorSource>[0],
  maxLen = 19,
): string | undefined {
  const source = resolveStatementDescriptorSource(params);
  return sanitizeStatementDescriptorSuffix(source, maxLen) ?? undefined;
}
